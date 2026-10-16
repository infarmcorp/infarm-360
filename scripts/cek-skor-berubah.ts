/**
 * CEK SKOR BERUBAH (read-only) — tidak mengubah apa pun.
 *
 *  1. Skor 360° tersimpan (`result_360.score_raw`, sebelum potongan telat) vs hitungan ulang dari
 *     penilaian terkirim SAAT INI (rumus resmi lib/score360). Beda = ada penilaian berubah sejak
 *     Hitung Ulang terakhir.
 *  2. Laporan FINAL: Skor Akhir tersimpan vs Skor Akhir hidup (KPI + Skor 360° resmi). Beda = angka
 *     berubah setelah finalisasi (laporan Final dikunci; perlu Buka Kembali bila ingin diperbarui).
 *
 * Pakai:  npx tsx scripts/cek-skor-berubah.ts [file-env] [label-periode]
 *   file-env      default .env.local (butuh NEXT_PUBLIC_SUPABASE_URL & SUPABASE_SERVICE_ROLE_KEY)
 *   label-periode default periode aktif, mis. "Q3 2026"
 * Q1 2026 = skor hasil impor: selisih di sana wajar dan JANGAN di-Hitung Ulang.
 */
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { fetchAllPaged, fetchAllByIds } from '../lib/supabase/paginate';
import { classOf, avg, schemeFor, weightedScore360, type Groups360, type WeightScheme } from '../lib/score360';
import { finalScoreOf, kpiAvgOf, hasScoreDrift, fmt2 } from '../lib/scoring';
import type { RelationKind, WeightValues } from '../lib/database.types';

const envFile = process.argv[2] ?? '.env.local';
const periodArg = process.argv[3];
const env = Object.fromEntries(readFileSync(envFile, 'utf8').split(/\r?\n/)
  .map((l) => l.match(/^([A-Z0-9_]+)=(.*)$/)).filter((m): m is RegExpMatchArray => !!m)
  .map((m) => [m[1], m[2].trim().replace(/^["']|["']$/g, '')]));
const url = env.NEXT_PUBLIC_SUPABASE_URL, key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error(`NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY tidak ada di ${envFile}`); process.exit(1); }
const db = createClient(url, key, { auth: { persistSession: false } });

async function main() {
  const { data: periods } = await db.from('periods').select('id, label, status, has_360, start_date');
  const p = (periods ?? []).find((x) => (periodArg ? x.label === periodArg : x.status === 'active'));
  if (!p) { console.error(periodArg ? `Periode "${periodArg}" tidak ditemukan` : 'Tidak ada periode aktif'); process.exit(1); }
  console.log(`Database : ${new URL(url).hostname.split('.')[0]}`);
  console.log(`Periode  : ${p.label} (status ${p.status}, 360° ${p.has_360 ? 'aktif' : 'nonaktif'})\n`);

  const { data: emps } = await db.from('employees').select('id, name, dept');
  const nameOf = new Map((emps ?? []).map((e) => [e.id, `${e.name} (${e.dept})`]));

  // ── 1. Skor 360° tersimpan vs hitungan dari penilaian saat ini ──
  const { data: ws } = await db.from('weight_schemes').select('model, weights').eq('period_id', p.id).eq('is_active', true).maybeSingle();
  const { data: ovr } = await db.from('employee_weight_overrides').select('employee_id, model, weights').eq('period_id', p.id);
  const ovrBy = new Map<string, WeightScheme>((ovr ?? []).map((o) => [o.employee_id, { model: o.model, weights: o.weights as WeightValues }]));
  const asmts = await fetchAllPaged<{ id: string; assessor_id: string; target_id: string }>((f, t) =>
    db.from('assessments').select('id, assessor_id, target_id').eq('period_id', p.id).eq('status', 'submitted').order('id').range(f, t));
  const scores = asmts.length ? await fetchAllByIds<{ assessment_id: string; rating: number | null }>(asmts.map((a) => a.id), (chunk, f, t) =>
    db.from('assessment_indicator_scores').select('assessment_id, rating').in('assessment_id', chunk).order('assessment_id').order('indicator_id').range(f, t)) : [];
  const maps = await fetchAllPaged<{ assessor_id: string; target_id: string; relation: RelationKind }>((f, t) =>
    db.from('mappings').select('assessor_id, target_id, relation').eq('period_id', p.id).order('assessor_id').order('target_id').range(f, t));
  const r360 = await fetchAllPaged<{ employee_id: string; score: number | null; score_raw: number | null; late_penalty: number | null }>((f, t) =>
    db.from('result_360').select('employee_id, score, score_raw, late_penalty').eq('period_id', p.id).order('employee_id').range(f, t));

  const ratings = new Map<string, number[]>();
  scores.forEach((s) => { if (s.rating != null) { const a = ratings.get(s.assessment_id) ?? []; a.push(s.rating); ratings.set(s.assessment_id, a); } });
  const rel = new Map(maps.map((m) => [`${m.assessor_id}:${m.target_id}`, m.relation]));
  const groups = new Map<string, Groups360>();
  for (const a of asmts) {
    const m = avg(ratings.get(a.id) ?? []);
    if (!m || m * 20 <= 0) continue;
    const r: RelationKind = a.assessor_id === a.target_id ? 'Self' : rel.get(`${a.assessor_id}:${a.target_id}`) ?? 'Peer';
    const g = groups.get(a.target_id) ?? { atasan: [], peer: [], cross: [], bawahan: [], self: [] };
    g[classOf(r)].push(m * 20);
    groups.set(a.target_id, g);
  }

  const stale: string[] = [];
  if (!ws) console.log('1) Skor 360°: bobot periode belum disimpan — dilewati.');
  else {
    const def: WeightScheme = { model: ws.model, weights: ws.weights as WeightValues };
    const storedBy = new Map(r360.map((r) => [r.employee_id, r]));
    const ids = new Set([...groups.keys(), ...r360.map((r) => r.employee_id)]);
    for (const id of ids) {
      const g = groups.get(id);
      const sch = schemeFor(def, ovrBy.get(id), String(p.start_date));
      const live = g ? weightedScore360(g, sch.model, sch.weights) : null;
      const st = storedBy.get(id);
      const stored = st?.score_raw ?? null;
      if (live == null && stored == null) continue;
      if (live == null || stored == null || hasScoreDrift(Number(stored), live)) {
        stale.push(`   - ${nameOf.get(id) ?? id}: tersimpan ${stored == null ? '—' : fmt2(Number(stored))} → hitungan sekarang ${live == null ? '—' : fmt2(live)}`);
      }
    }
    console.log(`1) Skor 360° tersimpan berbeda dari hitungan penilaian saat ini: ${stale.length} pegawai`);
    stale.forEach((s) => console.log(s));
    if (stale.length) console.log('   → Tekan ① Hitung Ulang di Review & Finalisasi (laporan Final dilewati otomatis).');
  }

  // ── 2. Laporan Final: Skor Akhir tersimpan vs hidup ──
  const { data: months } = await db.from('period_months').select('ym').eq('period_id', p.id);
  const yms = (months ?? []).map((m) => m.ym);
  const kpi = yms.length ? await fetchAllPaged<{ employee_id: string; ym: string; score: number }>((f, t) =>
    db.from('kpi_scores').select('employee_id, ym, score').in('ym', yms).order('employee_id').order('ym').range(f, t)) : [];
  const cell = new Map<string, { s: number; n: number }>();
  kpi.forEach((k) => { const c = cell.get(`${k.employee_id}|${k.ym}`) ?? { s: 0, n: 0 }; c.s += k.score; c.n++; cell.set(`${k.employee_id}|${k.ym}`, c); });
  const s360By = new Map(r360.map((r) => [r.employee_id, r.score]));
  const reps = await fetchAllPaged<{ employee_id: string; status: string; final_score: number | null }>((f, t) =>
    db.from('final_reports').select('employee_id, status, final_score').eq('period_id', p.id).order('employee_id').range(f, t));
  const finals = reps.filter((r) => r.status === 'finalized');
  const drift: string[] = [];
  for (const r of finals) {
    const kpiAvg = kpiAvgOf(yms.map((ym) => { const c = cell.get(`${r.employee_id}|${ym}`); return c ? c.s / c.n : null; }));
    const live = finalScoreOf(kpiAvg, s360By.get(r.employee_id) ?? null, p.has_360);
    if (r.final_score == null || live == null || hasScoreDrift(Number(r.final_score), live)) {
      drift.push(`   - ${nameOf.get(r.employee_id) ?? r.employee_id}: Final ${r.final_score == null ? '—' : fmt2(Number(r.final_score))} → hidup ${live == null ? '—' : fmt2(live)}`);
    }
  }
  console.log(`\n2) Laporan Final yang Skor Akhirnya berbeda dari angka hidup: ${drift.length} dari ${finals.length} laporan Final`);
  drift.forEach((s) => console.log(s));
  if (drift.length) console.log('   → Laporan Final terkunci; angka yang dilihat pegawai tetap angka Final. Buka Kembali hanya bila memang perlu diperbarui.');
  console.log(`\nLaporan per status: ${['draft', 'in_review', 'finalized'].map((s) => `${s} ${reps.filter((r) => r.status === s).length}`).join(' · ')}`);
}

main().catch((e) => { console.error('Gagal:', e instanceof Error ? e.message : e); process.exit(1); });
