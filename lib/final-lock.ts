import type { createAdminClient } from '@/lib/supabase/server';
import { fetchAllByIds, fetchAllPaged } from '@/lib/supabase/paginate';

/**
 * KUNCI LAPORAN FINAL (keputusan pemilik 2026-10-12, opsi B audit gelombang 2b): setelah laporan
 * seorang pegawai berstatus Final, SEMUA angka di laporan itu tak boleh berubah kecuali HRD menekan
 * "Buka Kembali (ke Draf)" dulu. Ditegakkan di SERVER pada tiap jalur yang bisa mengubah angka:
 *   - perubahan untuk satu pegawai → DITOLAK (finalLockError / finalLockErrorForMonths);
 *   - proses massal (Hitung Ulang, potongan telat) → pegawai Final DILEWATI & dihitung;
 *   - pengaturan seluruh periode → DITOLAK bila sudah ada laporan Final (periodLockError).
 * GAGAL TERTUTUP: status tak terbaca → ditolak (FINAL_CHECK_FAILED_MSG), bukan dianggap belum Final.
 */
type Admin = ReturnType<typeof createAdminClient>;

export const FINAL_CHECK_FAILED_MSG =
  'Tidak dapat memastikan status laporan (gagal membaca data). Demi keamanan, perubahan ditolak — coba lagi beberapa saat lagi.';

/** Pesan baku penolakan untuk pegawai yang laporannya Final. */
export function finalLockMsg(names: string[]): string {
  return `Laporan ${names.join(', ')} sudah Final. Buka Kembali laporannya dulu untuk mengubah data ini.`;
}

/** Pesan baku penolakan pengaturan seluruh periode. `what` mis. "bobot penilai". */
export function periodFinalLockMsg(count: number, what: string): string {
  return `Sudah ada ${count} laporan Final di periode ini. Buka Kembali laporan-laporan itu dulu untuk mengubah ${what}.`;
}

/**
 * Id pegawai yang laporannya FINAL di `periodId` (dibatasi `ids` bila diberikan). Melempar bila gagal
 * dibaca — pemanggil yang memproses massal memperlakukannya sebagai gagal, bukan "tak ada yang Final".
 */
export async function finalizedEmployees(admin: Admin, periodId: string, ids?: string[]): Promise<Set<string>> {
  if (ids && ids.length === 0) return new Set();
  const rows = ids
    ? await fetchAllByIds<{ employee_id: string }>(ids, (chunk, from, to) =>
        admin.from('final_reports').select('employee_id').eq('period_id', periodId).eq('status', 'finalized')
          .in('employee_id', chunk).order('employee_id').range(from, to))
    : await fetchAllPaged<{ employee_id: string }>((from, to) =>
        admin.from('final_reports').select('employee_id').eq('period_id', periodId).eq('status', 'finalized')
          .order('employee_id').range(from, to));
  return new Set(rows.map((r) => r.employee_id));
}

async function namesOf(admin: Admin, ids: string[]): Promise<string[]> {
  const { data } = await admin.from('employees').select('id, name').in('id', ids);
  const byId = new Map((data ?? []).map((e) => [e.id, e.name as string]));
  return ids.map((id) => byId.get(id) ?? id);
}

/** Penolakan untuk perubahan atas pegawai tertentu di satu periode. null = boleh. */
export async function finalLockError(admin: Admin, periodId: string, empIds: string[]): Promise<string | null> {
  try {
    const fin = await finalizedEmployees(admin, periodId, [...new Set(empIds)]);
    if (fin.size === 0) return null;
    return finalLockMsg(await namesOf(admin, [...fin]));
  } catch {
    return FINAL_CHECK_FAILED_MSG;
  }
}

/**
 * KPI disimpan per BULAN (bukan per periode) dan satu bulan bisa dipakai beberapa periode → tolak bila
 * pegawai sudah Final di periode MANA PUN yang memuat bulan tersebut. null = boleh.
 */
export async function finalLockErrorForMonths(admin: Admin, empIds: string[], yms: string[]): Promise<string | null> {
  try {
    const { data: pm, error } = await admin.from('period_months').select('period_id').in('ym', yms);
    if (error) throw new Error(error.message);
    const periodIds = [...new Set((pm ?? []).map((r) => r.period_id))];
    const fin = new Set<string>();
    for (const pid of periodIds) (await finalizedEmployees(admin, pid, [...new Set(empIds)])).forEach((id) => fin.add(id));
    if (fin.size === 0) return null;
    return finalLockMsg(await namesOf(admin, [...fin]));
  } catch {
    return FINAL_CHECK_FAILED_MSG;
  }
}

/** Penolakan pengaturan SELURUH periode bila sudah ada laporan Final di dalamnya. null = boleh. */
export async function periodLockError(admin: Admin, periodId: string, what: string): Promise<string | null> {
  try {
    const { count, error } = await admin.from('final_reports').select('*', { count: 'exact', head: true })
      .eq('period_id', periodId).eq('status', 'finalized');
    if (error || count == null) return FINAL_CHECK_FAILED_MSG;
    return count > 0 ? periodFinalLockMsg(count, what) : null;
  } catch {
    return FINAL_CHECK_FAILED_MSG;
  }
}
