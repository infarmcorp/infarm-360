import { createAdminClient } from '@/lib/supabase/server';
import { trendOf, type Trend } from '@/lib/trend';
import { fetchAllByIds } from '@/lib/supabase/paginate';
import { kpiAvgOf } from '@/lib/scoring';

/**
 * Metrik tim/pegawai per periode untuk Laporan Kinerja Tim & Monitor Kinerja.
 * Dibaca via service_role (lingkup dibatasi daftar `ids` per peran di pemanggil). `ids` bisa
 * SELURUH pegawai (companyAverages) → query di-chunk + dipaginasi (batas 1000-baris PostgREST).
 */
export type ScoreMaps = {
  kpiBy: Map<string, number>;                 // rerata KPI kuartal per pegawai
  s360By: Map<string, number>;                // Skor 360° (result_360) per pegawai
  monthlyBy: Map<string, (number | null)[]>;  // KPI per bulan (kronologis) per pegawai — utk trend
};

/** Rerata KPI + KPI bulanan + Skor 360° untuk sekumpulan pegawai pada satu periode. */
export async function scoreMaps(periodId: string, ids: string[]): Promise<ScoreMaps> {
  const kpiBy = new Map<string, number>();
  const s360By = new Map<string, number>();
  const monthlyBy = new Map<string, (number | null)[]>();
  if (!ids.length) return { kpiBy, s360By, monthlyBy };
  const admin = createAdminClient();
  const { data: months } = await admin.from('period_months').select('ym').eq('period_id', periodId);
  const yms = (months ?? []).map((m) => m.ym).sort(); // kronologis: bulan-1, bulan-2, bulan-3
  if (yms.length) {
    // companyAverages memanggil ini untuk SELURUH pegawai → chunk id + paginasi (batas 1000 baris & URL).
    const ks = await fetchAllByIds<{ employee_id: string; ym: string; score: number }>(ids, (chunk, from, to) =>
      admin.from('kpi_scores').select('employee_id, ym, score').in('ym', yms).in('employee_id', chunk)
        .order('employee_id').order('ym').range(from, to));
    const perEmp = new Map<string, Map<string, number>>();
    ks.forEach((r) => {
      let m = perEmp.get(r.employee_id);
      if (!m) { m = new Map(); perEmp.set(r.employee_id, m); }
      m.set(r.ym, r.score);
    });
    for (const [id, m] of perEmp) {
      const vals = yms.map((ym) => (m.has(ym) ? m.get(ym)! : null));
      monthlyBy.set(id, vals);
      const kpiAvg = kpiAvgOf(vals); // definisi tunggal rerata KPI (lib/scoring)
      if (kpiAvg != null) kpiBy.set(id, kpiAvg);
    }
  }
  const rs = await fetchAllByIds<{ employee_id: string; score: number | null }>(ids, (chunk, from, to) =>
    admin.from('result_360').select('employee_id, score').eq('period_id', periodId).in('employee_id', chunk)
      .order('employee_id').range(from, to));
  rs.forEach((r) => { if (r.score != null) s360By.set(r.employee_id, r.score); });
  return { kpiBy, s360By, monthlyBy };
}

/** KPI "belum terbaca" = trend 3 bulan pertama 'unread' (2 dari 3 bulan kosong). Dikecualikan dari
 *  rerata KPI (selaras Dashboard) — belum menggambarkan kuartal, bukan berkinerja rendah. 360° tetap dihitung. */
const isUnreadMonths = (months: (number | null)[] | undefined): boolean =>
  trendOf((months ?? []).slice(0, 3)) === 'unread';

/** Rata-rata perusahaan (mean rerata per-pegawai) KPI & 360° — pembanding scorecard.
 *  Lingkup: semua pegawai internal non-Direksi (selaras cakupan dashboard). KPI "belum terbaca"
 *  dikecualikan dari rerata KPI (bukan dari 360°) agar pembanding konsisten dengan Dashboard. */
export async function companyAverages(periodId: string): Promise<{ kpi: number | null; s360: number | null }> {
  const admin = createAdminClient();
  const { data: emps } = await admin.from('employees').select('id').eq('is_external', false).neq('role', 'direksi');
  const ids = (emps ?? []).map((e) => e.id);
  if (!ids.length) return { kpi: null, s360: null };
  const { kpiBy, s360By, monthlyBy } = await scoreMaps(periodId, ids);
  const kpiVals = [...kpiBy.entries()].filter(([id]) => !isUnreadMonths(monthlyBy.get(id))).map(([, v]) => v);
  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  return { kpi: mean(kpiVals), s360: mean([...s360By.values()]) };
}

/** Rata-rata tim (mean rerata per-pegawai) dari baris yang ditampilkan. KPI "belum terbaca"
 *  (trend 'unread') dikecualikan dari rerata KPI — baris tetap tampil, hanya tak dihitung; 360°
 *  tetap ikut. Selaras perlakuan Dashboard organisasi. */
export function teamAverages(rows: { kpiAvg: number | null; s360: number | null; trend?: Trend }[]): { kpi: number | null; s360: number | null } {
  const k = rows.filter((r) => r.trend !== 'unread').map((r) => r.kpiAvg).filter((v): v is number => v != null);
  const s = rows.map((r) => r.s360).filter((v): v is number => v != null);
  return {
    kpi: k.length ? k.reduce((a, b) => a + b, 0) / k.length : null,
    s360: s.length ? s.reduce((a, b) => a + b, 0) / s.length : null,
  };
}
