import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import { fetchAllByIds } from '@/lib/supabase/paginate';

type DB = SupabaseClient<Database>;

export type MonitorHistory = {
  reports: { employee_id: string; period_id: string; status: string; final_score: number | null }[];
  kpi: { employee_id: string; ym: string; score: number }[];
  r360: { employee_id: string; period_id: string; score: number | null }[];
};

/**
 * Riwayat lintas periode untuk Monitor Kinerja: laporan, KPI (semua bulan) & Skor 360° pegawai dalam
 * lingkup. Lingkup sedivisi × puluhan bulan bisa > 1.000 baris → chunk id + paginasi (gagal = lempar).
 */
export async function loadMonitorHistory(db: DB, ids: string[]): Promise<MonitorHistory> {
  const [reports, kpi, r360] = await Promise.all([
    fetchAllByIds<MonitorHistory['reports'][number]>(ids, (chunk, from, to) =>
      db.from('final_reports').select('employee_id, period_id, status, final_score').in('employee_id', chunk)
        .order('employee_id').order('period_id').range(from, to)),
    fetchAllByIds<MonitorHistory['kpi'][number]>(ids, (chunk, from, to) =>
      db.from('kpi_scores').select('employee_id, ym, score').in('employee_id', chunk)
        .order('employee_id').order('ym').range(from, to)),
    fetchAllByIds<MonitorHistory['r360'][number]>(ids, (chunk, from, to) =>
      db.from('result_360').select('employee_id, period_id, score').in('employee_id', chunk)
        .order('employee_id').order('period_id').range(from, to)),
  ]);
  return { reports, kpi, r360 };
}
