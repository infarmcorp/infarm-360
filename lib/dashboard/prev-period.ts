import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import { fetchAllByIds } from '@/lib/supabase/paginate';

type DB = SupabaseClient<Database>;

export type PrevPeriodScores = {
  r360: { employee_id: string; score: number | null }[];
  reports: { employee_id: string; status: string; final_score: number | null }[];
};

/**
 * Skor 360° & laporan PERIODE SEBELUMNYA untuk selisih "vs periode lalu" di Dashboard Organisasi.
 * Id seluruh organisasi → dipecah per kelompok + paginasi (fetchAllByIds). Gangguan baca → daftar
 * kosong (selisih tak ditampilkan; halaman tetap jalan) — sama seperti perilaku sebelumnya.
 */
export async function loadPrevPeriodScores(db: DB, periodId: string, empIds: string[]): Promise<PrevPeriodScores> {
  const [r360, reports] = await Promise.all([
    fetchAllByIds<PrevPeriodScores['r360'][number]>(empIds, (chunk, from, to) =>
      db.from('result_360').select('employee_id, score').eq('period_id', periodId).in('employee_id', chunk)
        .order('employee_id').range(from, to)).catch(() => []),
    fetchAllByIds<PrevPeriodScores['reports'][number]>(empIds, (chunk, from, to) =>
      db.from('final_reports').select('employee_id, status, final_score').eq('period_id', periodId).in('employee_id', chunk)
        .order('employee_id').range(from, to)).catch(() => []),
  ]);
  return { r360, reports };
}
