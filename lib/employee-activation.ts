/**
 * Aturan pemetaan saat pegawai dinonaktifkan / diaktifkan kembali (Kelola Pegawai → setEmployeeActive).
 *
 * Keputusan pemilik 2026-11-09: tanggal aktif/nonaktif menentukan periode mana yang tersentuh.
 * - Hanya periode yang BELUM BERAKHIR pada tanggal itu (end_date ≥ tanggal) yang diubah. Periode yang sudah
 *   lewat dibiarkan apa adanya (riwayat pemetaan, ekspor, dan kewajiban lamanya tidak berubah).
 * - Aktif kembali tidak menghidupkan pemetaan yang dulu dihapus lewat permohonan "hapus" yang disetujui HRD
 *   (permohonan itu menyimpan pemetaan sebagai nonaktif — tanpa pengecualian ini ia kembali jadi tugas Wajib).
 * - Aktif kembali hanya menghidupkan pemetaan yang sisi lawannya juga aktif.
 * Murni — pemanggil yang membaca data.
 */
export type ActivationMapping = { id: string; period_id: string; assessor_id: string; target_id: string };

export const pairKey = (periodId: string, assessorId: string, targetId: string) => `${periodId}|${assessorId}|${targetId}`;

export function mappingsToReactivate(
  maps: ActivationMapping[],
  employeeId: string,
  opts: { openPeriodIds: Set<string>; activeOthers: Set<string>; removedPairs: Set<string> },
): string[] {
  return maps
    .filter((m) => opts.openPeriodIds.has(m.period_id))
    .filter((m) => opts.activeOthers.has(m.assessor_id === employeeId ? m.target_id : m.assessor_id))
    .filter((m) => !opts.removedPairs.has(pairKey(m.period_id, m.assessor_id, m.target_id)))
    .map((m) => m.id);
}
