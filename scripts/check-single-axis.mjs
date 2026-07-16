/**
 * CEK "DATA BELUM LENGKAP / SINGLE-AXIS" (read-only) — mereplikasi logika dashboard 4-Box:
 * saat 360° AKTIF, pegawai yang cuma punya SATU sumbu (KPI saja / 360° saja) dikeluarkan dari
 * A/B/C → bucket "Data Belum Lengkap (1 Sumbu)". Skrip ini TIDAK mengubah apa pun.
 *
 * Pakai:  npm install --no-save pg  →  node scripts/check-single-axis.mjs  →  npm uninstall --no-save pg
 */
import { readFileSync } from 'node:fs';
import pg from 'pg';

const env = readFileSync('.env.local', 'utf8');
const url = env.split(/\r?\n/).find((l) => l.startsWith('SUPABASE_DB_URL='))
  ?.slice('SUPABASE_DB_URL='.length).trim().replace(/^["']|["']$/g, '');
if (!url) { console.error('SUPABASE_DB_URL tidak ditemukan di .env.local'); process.exit(1); }

const c = new pg.Client({ connectionString: url });
await c.connect();
try {
  const { rows: ap } = await c.query(`select id, label, has_360 from periods where status='active' limit 1`);
  if (!ap.length) { console.log('⚠️  Tidak ada periode aktif.'); process.exit(0); }
  const p = ap[0];
  console.log(`Periode aktif : ${p.label}`);
  console.log(`360° aktif    : ${p.has_360 ? 'YA' : 'TIDAK'}`);
  if (!p.has_360) {
    console.log('\n→ 360° NONAKTIF → aturan single-axis TIDAK berlaku (4-Box tetap KPI-only). Bucket tak akan muncul.');
    process.exit(0);
  }

  const { rows: months } = await c.query(
    `select ym from period_months where period_id=$1 order by ym asc`, [p.id]);
  const yms = months.map((m) => m.ym);
  const first3 = yms.slice(0, 3);
  console.log(`Bulan (urut)  : ${yms.join(', ')}\n`);

  // Pegawai yang relevan di dashboard: bukan eksternal & bukan direksi (selaras filter dashboard).
  const { rows: emps } = await c.query(
    `select id, name from employees where coalesce(is_external,false)=false and role <> 'direksi'`);

  // Rerata KPI per pegawai di seluruh bulan periode (mirror kpiAvg dashboard).
  const { rows: kpiRows } = await c.query(
    `select employee_id, avg(score)::float as s, count(*)::int as n
       from kpi_scores where ym = any($1) group by employee_id`, [yms]);
  const kpiBy = new Map(kpiRows.map((r) => [r.employee_id, r.s]));

  // Rerata KPI per (pegawai, bulan) untuk deteksi "belum terbaca" (bln-1=0 & bln-2=0).
  const { rows: mRows } = await c.query(
    `select employee_id, ym, avg(score)::float as s from kpi_scores where ym = any($1)
      group by employee_id, ym`, [first3]);
  const mBy = new Map();
  for (const r of mRows) { if (!mBy.has(r.employee_id)) mBy.set(r.employee_id, new Map()); mBy.get(r.employee_id).set(r.ym, r.s); }
  const [b1, b2] = first3;
  const isUnread = (id) => {
    const m = mBy.get(id); if (!m) return false;
    return (m.get(b1) ?? null) === 0 && (m.get(b2) ?? null) === 0;
  };

  // Skor 360° tersimpan (result_360) untuk periode ini.
  const { rows: r360 } = await c.query(
    `select employee_id, score from result_360 where period_id=$1`, [p.id]);
  const s360By = new Map(r360.map((r) => [r.employee_id, r.score]));

  const kpiOnly = [], s360Only = [], both = [];
  for (const e of emps) {
    if (isUnread(e.id)) continue; // masuk bucket "Belum Terbaca", bukan single-axis
    const hasKpi = kpiBy.has(e.id);
    const has360 = s360By.has(e.id);
    if (hasKpi && has360) both.push(e.name);
    else if (hasKpi && !has360) kpiOnly.push(e.name);
    else if (!hasKpi && has360) s360Only.push(e.name);
    // keduanya kosong → bukan single-axis (tak diplot, tak dihitung di bucket)
  }
  const incomplete = [...kpiOnly.map((n) => `${n} (KPI saja)`), ...s360Only.map((n) => `${n} (360° saja)`)];

  console.log(`Pegawai 2-sumbu (masuk A/B/C)          : ${both.length}`);
  console.log(`Pegawai single-axis → "Data Belum Lengkap": ${incomplete.length}`);
  if (incomplete.length) incomplete.forEach((n) => console.log(`  • ${n}`));
  else console.log('  (tidak ada — bucket "Data Belum Lengkap" memang tidak akan tampil; ini benar)');
  console.log('\nCatatan: pegawai "KPI belum terbaca" dihitung terpisah (bucket "Belum Terbaca").');
} finally {
  await c.end();
}
