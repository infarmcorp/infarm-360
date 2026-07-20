/**
 * IMPOR ULANG 360° (backfill eksternal per-ASPEK, mis. Q1 2026 dari Looker) — REUSABLE.
 * ---------------------------------------------------------------------------------------
 * Memperbarui skor per-aspek (assessment_indicator_scores.rating) & headline (result_360.score)
 * untuk periode backfill yang penilaiannya SINTETIS (1 anchor assessor, 1 indikator/aspek).
 * Skor aspek Dashboard/Monitor = rata-rata(rating)×20 → mengisi rating presisi tinggi = heatmap eksak.
 *
 * TIDAK menghitung ulang 360° (JANGAN "Hitung Ulang" utk periode backfill — headline dari CSV).
 *
 * Pemakaian:
 *   npm install --no-save pg
 *   node scripts/import-360-backfill.mjs <file.csv> [--apply] [--no-headline] [--period=<uuid>]
 *     (tanpa --apply = DRY-RUN: hanya validasi + tampilkan lama→baru, TIDAK menulis)
 *   npm uninstall --no-save pg
 *
 * Format CSV (header): emp_code, …, skor_360_100, …, "aspek: <Nama Aspek> (1-5)" ×N
 *   - emp_code   = kunci pencocokan ke employees.
 *   - skor_360_100 = headline (0–100) → result_360 (dibulatkan 2 desimal, kolom numeric(5,2)).
 *   - kolom "aspek: X (1-5)" → rating aspek (1–5), dicocokkan ke culture_aspects.name periode.
 */
import { readFileSync } from 'node:fs';
import pg from 'pg';

const args = process.argv.slice(2);
const csvPath = args.find((a) => !a.startsWith('--'));
const APPLY = args.includes('--apply');
const NO_HEADLINE = args.includes('--no-headline');
const CREATE_MISSING = args.includes('--create-missing'); // buat penilaian sintetis baru utk baris yg belum ada
const periodArg = args.find((a) => a.startsWith('--period='))?.split('=')[1];
const DEFAULT_Q1 = 'f2a96a7f-0f38-4647-aa84-5d6dc20ea722'; // Q1 2026
const PERIOD = periodArg || DEFAULT_Q1;
if (!csvPath) { console.error('Pemakaian: node scripts/import-360-backfill.mjs <file.csv> [--apply] [--no-headline] [--create-missing] [--period=<uuid>]'); process.exit(1); }

const env = readFileSync('.env.local', 'utf8');
const dbUrl = env.split(/\r?\n/).find((l) => l.startsWith('SUPABASE_DB_URL='))
  ?.slice('SUPABASE_DB_URL='.length).trim().replace(/^["']|["']$/g, '');
if (!dbUrl) { console.error('SUPABASE_DB_URL tak ditemukan di .env.local'); process.exit(1); }

// ── Parser CSV (dukung field ber-tanda kutip dengan koma di dalamnya) ──
function parseCsv(text) {
  const rows = [];
  let row = [], cur = '', q = false;
  const s = text.replace(/^﻿/, ''); // buang BOM
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (q) {
      if (ch === '"') { if (s[i + 1] === '"') { cur += '"'; i++; } else q = false; }
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { row.push(cur); cur = ''; }
    else if (ch === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
    else if (ch === '\r') { /* abaikan */ }
    else cur += ch;
  }
  if (cur.length || row.length) { row.push(cur); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

const round2 = (n) => Math.round(n * 100) / 100;

const c = new pg.Client({ connectionString: dbUrl });
await c.connect();
const q = (sql, p) => c.query(sql, p).then((r) => r.rows);
try {
  // ── Muat metadata periode ──
  const per = (await q(`select id, label, status, has_360 from periods where id=$1`, [PERIOD]))[0];
  if (!per) throw new Error(`Periode ${PERIOD} tak ditemukan`);
  const aspects = await q(`select id, name from culture_aspects where period_id=$1 order by order_idx`, [PERIOD]);
  const aspIdByName = new Map(aspects.map((a) => [a.name, a.id]));
  const indByAspect = new Map(); // aspect_id → [indicator_id...]
  for (const a of aspects) {
    const inds = await q(`select id from indicators where aspect_id=$1 order by order_idx`, [a.id]);
    indByAspect.set(a.id, inds.map((i) => i.id));
  }
  const emps = await q(`select id, emp_code, name from employees`);
  const empByCode = new Map(emps.map((e) => [e.emp_code, e]));
  // Assessment sintetis Q1 per target.
  const asmts = await q(`select id, target_id, assessor_id from assessments where period_id=$1 and status='submitted'`, [PERIOD]);
  const asmtByTarget = new Map();
  asmts.forEach((a) => { if (!asmtByTarget.has(a.target_id)) asmtByTarget.set(a.target_id, a.id); });
  // Anchor assessor (utk BUAT baris baru): satu penilai unik dari penilaian sintetis periode ini.
  const anchorIds = [...new Set(asmts.map((a) => a.assessor_id))];
  const anchor = anchorIds.length === 1 ? anchorIds[0] : null;
  // Nilai saat ini (utk lama→baru): rating per (target, aspek) & result_360.
  const curRat = await q(`
    select a.target_id, i.aspect_id, s.rating
    from assessments a
    join assessment_indicator_scores s on s.assessment_id=a.id
    join indicators i on i.id=s.indicator_id
    where a.period_id=$1 and a.status='submitted'`, [PERIOD]);
  const curRatMap = new Map(); // `${target}|${aspectId}` → rating
  curRat.forEach((r) => curRatMap.set(`${r.target_id}|${r.aspect_id}`, r.rating));
  const cur360 = await q(`select employee_id, score from result_360 where period_id=$1`, [PERIOD]);
  const cur360Map = new Map(cur360.map((r) => [r.employee_id, r.score]));

  // ── Parse CSV + petakan kolom ──
  const grid = parseCsv(readFileSync(csvPath, 'utf8'));
  const header = grid[0].map((h) => h.trim());
  const idxCode = header.indexOf('emp_code');
  const idxHead = header.indexOf('skor_360_100');
  if (idxCode < 0) throw new Error('Kolom emp_code tak ada di CSV');
  const aspCols = []; // { idx, name, aspectId, indicatorId }
  header.forEach((h, idx) => {
    const m = /^aspek:\s*(.+?)\s*\(1-5\)$/i.exec(h);
    if (m) {
      const name = m[1].trim();
      const aid = aspIdByName.get(name);
      aspCols.push({ idx, name, aspectId: aid, indicatorId: aid ? (indByAspect.get(aid) || [])[0] : null });
    }
  });

  // Validasi struktur kolom aspek.
  const colErr = [];
  aspCols.forEach((ac) => {
    if (!ac.aspectId) colErr.push(`Kolom "aspek: ${ac.name}" tak cocok aspek periode`);
    else if (!ac.indicatorId) colErr.push(`Aspek "${ac.name}" tak punya indikator`);
    else if ((indByAspect.get(ac.aspectId) || []).length !== 1)
      colErr.push(`Aspek "${ac.name}" punya ${(indByAspect.get(ac.aspectId) || []).length} indikator (diharapkan 1)`);
  });
  const dbAspNames = new Set(aspects.map((a) => a.name));
  aspCols.forEach((ac) => dbAspNames.delete(ac.name));
  if (dbAspNames.size) colErr.push(`Aspek DB tak ada kolomnya di CSV: ${[...dbAspNames].join(', ')}`);

  console.log(`Periode : ${per.label} (${per.status}, has_360=${per.has_360})`);
  console.log(`CSV     : ${csvPath} — ${grid.length - 1} baris data, ${aspCols.length} kolom aspek`);
  console.log(`Headline: ${NO_HEADLINE ? 'DILEWATI (--no-headline)' : (idxHead >= 0 ? 'diperbarui dari skor_360_100' : 'kolom skor_360_100 tak ada → dilewati')}`);
  if (colErr.length) { console.log('\n❌ MASALAH KOLOM:'); colErr.forEach((e) => console.log('  - ' + e)); throw new Error('Perbaiki header CSV dulu.'); }

  // ── Proses tiap baris ──
  const seen = new Set();
  const errors = [];
  const ratingUpdates = []; // { assessmentId, indicatorId, val, targetId, aspectId }
  const headUpdates = [];   // { targetId, val }
  const creates = [];       // { targetId, code, name, vals:[{indicatorId,aspectId,val}], headVal }
  const perEmp = [];        // ringkasan
  for (let r = 1; r < grid.length; r++) {
    const row = grid[r];
    const code = (row[idxCode] || '').trim();
    if (!code) { errors.push(`Baris ${r + 1}: emp_code kosong`); continue; }
    if (seen.has(code)) { errors.push(`Baris ${r + 1}: emp_code DUPLIKAT "${code}"`); continue; }
    seen.add(code);
    const emp = empByCode.get(code);
    if (!emp) { errors.push(`Baris ${r + 1}: emp_code "${code}" tak ada di employees`); continue; }
    const asmtId = asmtByTarget.get(emp.id);
    if (!asmtId) {
      if (!CREATE_MISSING) { errors.push(`Baris ${r + 1}: "${code}" (${emp.name}) tak punya penilaian 360° di periode ini → dilewati`); continue; }
      // BUAT baru: kumpulkan 5 aspek (wajib lengkap) + headline.
      if (!anchor) { errors.push(`Baris ${r + 1}: "${code}" perlu dibuat tapi anchor assessor tak tunggal/tak ada`); continue; }
      const vals = []; let bad = false;
      for (const ac of aspCols) {
        const raw = (row[ac.idx] ?? '').trim();
        if (raw === '') { errors.push(`Baris ${r + 1} ${code}: aspek "${ac.name}" KOSONG (butuh lengkap utk BUAT baru)`); bad = true; continue; }
        const val = Number(raw);
        if (!Number.isFinite(val) || val < 1 || val > 5) { errors.push(`Baris ${r + 1} ${code}: aspek "${ac.name}" tak valid (${raw})`); bad = true; continue; }
        vals.push({ indicatorId: ac.indicatorId, aspectId: ac.aspectId, val });
      }
      let headVal = null;
      if (!NO_HEADLINE && idxHead >= 0) {
        const raw = (row[idxHead] || '').trim();
        if (raw !== '') { const v = Number(raw); if (!Number.isFinite(v) || v < 0 || v > 100) { errors.push(`Baris ${r + 1} ${code}: skor_360_100 tak valid (${raw})`); bad = true; } else headVal = round2(v); }
      }
      if (!bad) { creates.push({ targetId: emp.id, code, name: emp.name, vals, headVal }); perEmp.push({ code, name: emp.name, nAsp: vals.length, headOldNew: headVal != null ? `(baru)→${headVal}` : '', create: true }); }
      continue;
    }

    let nAsp = 0;
    for (const ac of aspCols) {
      const raw = (row[ac.idx] ?? '').trim();
      if (raw === '') { errors.push(`Baris ${r + 1} ${code}: aspek "${ac.name}" KOSONG`); continue; }
      const val = Number(raw);
      if (!Number.isFinite(val) || val < 1 || val > 5) { errors.push(`Baris ${r + 1} ${code}: aspek "${ac.name}" nilai tak valid (${raw}), harus 1–5`); continue; }
      ratingUpdates.push({ assessmentId: asmtId, indicatorId: ac.indicatorId, val, targetId: emp.id, aspectId: ac.aspectId });
      nAsp++;
    }
    let headOldNew = '';
    if (!NO_HEADLINE && idxHead >= 0) {
      const raw = (row[idxHead] || '').trim();
      if (raw !== '') {
        const val = Number(raw);
        if (!Number.isFinite(val) || val < 0 || val > 100) errors.push(`Baris ${r + 1} ${code}: skor_360_100 tak valid (${raw})`);
        else { const nv = round2(val); headUpdates.push({ targetId: emp.id, val: nv }); headOldNew = `${cur360Map.get(emp.id) ?? '—'}→${nv}`; }
      }
    }
    perEmp.push({ code, name: emp.name, nAsp, headOldNew });
  }

  // Pegawai DB yg punya 360° tapi TAK ada di CSV (tak akan diperbarui).
  const csvCodes = new Set(perEmp.map((p) => p.code));
  const missing = [...asmtByTarget.keys()].map((tid) => emps.find((e) => e.id === tid)).filter(Boolean)
    .filter((e) => !csvCodes.has(e.emp_code));

  console.log(`\n=== RINGKASAN ===`);
  console.log(`  Baris valid diproses : ${perEmp.length}`);
  console.log(`  Update rating aspek  : ${ratingUpdates.length}`);
  console.log(`  Update headline      : ${headUpdates.length}`);
  console.log(`  BUAT penilaian baru  : ${creates.length}${creates.length ? ' → ' + creates.map((c) => `${c.code} (${c.name})`).join(', ') : ''}${CREATE_MISSING ? '' : ' (--create-missing tak aktif)'}`);
  console.log(`  Pegawai 360° TANPA baris CSV (tak tersentuh): ${missing.length}${missing.length ? ' → ' + missing.map((e) => e.emp_code).join(', ') : ''}`);
  if (creates.length) creates.forEach((cr) => console.log(`    + BUAT ${cr.code} ${cr.name} | headline (baru)→${cr.headVal ?? '—'} | aspek: ${cr.vals.map((v) => v.val).join(', ')}`));

  console.log(`\n=== CONTOH lama→baru (5 pegawai pertama) ===`);
  perEmp.slice(0, 5).forEach((p) => {
    const smp = ratingUpdates.filter((u) => emps.find((e) => e.emp_code === p.code)?.id === u.targetId)
      .map((u) => { const old = curRatMap.get(`${u.targetId}|${u.aspectId}`); return `${Number(old)}→${u.val}`; }).join(', ');
    console.log(`  ${p.code} ${p.name} | headline ${p.headOldNew || '—'} | aspek: ${smp}`);
  });

  // Perubahan NYATA vs DB (beda dari nilai tersimpan) — memperjelas koreksi saat impor ULANG.
  const aspNameById = new Map(aspects.map((a) => [a.id, a.name]));
  const empById = new Map(emps.map((e) => [e.id, e]));
  const realRat = ratingUpdates.filter((u) => { const o = curRatMap.get(`${u.targetId}|${u.aspectId}`); return o == null || Math.abs(Number(o) - u.val) > 1e-6; });
  const realHead = headUpdates.filter((h) => { const o = cur360Map.get(h.targetId); return o == null || Math.abs(Number(o) - h.val) > 1e-6; });
  console.log(`\n=== PERUBAHAN NYATA vs DB: ${realRat.length} rating, ${realHead.length} headline ===`);
  realHead.forEach((h) => { const e = empById.get(h.targetId); const o = cur360Map.get(h.targetId); console.log(`  ${e.emp_code} ${e.name} | headline: ${o == null ? '—' : Number(o)} → ${h.val}`); });
  realRat.forEach((u) => { const e = empById.get(u.targetId); const o = curRatMap.get(`${u.targetId}|${u.aspectId}`); console.log(`  ${e.emp_code} ${e.name} | ${aspNameById.get(u.aspectId)}: ${o == null ? '—' : Number(o)} → ${u.val}`); });
  if (!realRat.length && !realHead.length) console.log('  (tak ada perubahan — DB sudah sama dengan CSV)');

  if (errors.length) { console.log(`\n⚠️  ${errors.length} MASALAH:`); errors.forEach((e) => console.log('  - ' + e)); }

  if (!APPLY) {
    console.log(`\n🔎 DRY-RUN — tidak ada yang ditulis. Tambah --apply untuk menerapkan.`);
    if (errors.length) console.log(`   (perbaiki ${errors.length} masalah di atas dulu, atau pastikan itu memang disengaja)`);
    process.exit(0);
  }

  // ── APPLY (transaksi) ──
  if (errors.some((e) => !e.includes('tak punya penilaian') )) {
    // Blokir apply bila ada error selain "tanpa penilaian" (yg memang sengaja dilewati).
    console.log(`\n❌ Ada masalah non-lewat di atas → apply DIBATALKAN. Perbaiki CSV dulu.`);
    process.exit(1);
  }
  await c.query('BEGIN');
  try {
    for (const u of ratingUpdates)
      await c.query(`update assessment_indicator_scores set rating=$1 where assessment_id=$2 and indicator_id=$3`,
        [u.val, u.assessmentId, u.indicatorId]);
    for (const h of headUpdates)
      await c.query(`update result_360 set score=$1, computed_at=now() where employee_id=$2 and period_id=$3`,
        [h.val, h.targetId, PERIOD]);
    // BUAT penilaian sintetis baru (assessment + 5 rating + result_360) — meniru struktur backfill.
    for (const cr of creates) {
      const ins = await c.query(
        `insert into assessments (period_id, assessor_id, target_id, status, is_adhoc, submitted_at)
         values ($1,$2,$3,'submitted',false,now()) returning id`, [PERIOD, anchor, cr.targetId]);
      const aid = ins.rows[0].id;
      for (const v of cr.vals)
        await c.query(`insert into assessment_indicator_scores (assessment_id, indicator_id, rating) values ($1,$2,$3)`,
          [aid, v.indicatorId, v.val]);
      if (cr.headVal != null)
        await c.query(
          `insert into result_360 (employee_id, period_id, score, computed_at) values ($1,$2,$3,now())
           on conflict (employee_id, period_id) do update set score=excluded.score, computed_at=now()`,
          [cr.targetId, PERIOD, cr.headVal]);
    }
    await c.query(
      `insert into hrd_audit_log (actor_id, actor_name, action, category, summary, target_type, target_id, target_label, meta)
       values (null, 'skrip import-360-backfill', 'score360.backfill', 'skor', $1, 'period', $2, $3, $4)`,
      [`Impor ulang 360° presisi tinggi: ${ratingUpdates.length} rating aspek + ${headUpdates.length} headline diperbarui, ${creates.length} penilaian baru dibuat dari ${csvPath}`,
       PERIOD, per.label, JSON.stringify({ ratings: ratingUpdates.length, headline: headUpdates.length, created: creates.length, createdCodes: creates.map((c) => c.code), csv: csvPath })]);
    await c.query('COMMIT');
    console.log(`\n✅ COMMIT: ${ratingUpdates.length} rating + ${headUpdates.length} headline diperbarui, ${creates.length} penilaian baru dibuat. (JANGAN Hitung Ulang periode ini.)`);
  } catch (e) {
    await c.query('ROLLBACK');
    console.error('\n❌ ROLLBACK —', e.message);
    process.exitCode = 1;
  }
} finally {
  await c.end();
}
