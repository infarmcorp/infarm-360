/**
 * Kelengkapan "Dinilai oleh" per pegawai yang DINILAI (Review & Finalisasi): berapa penilai WAJIB
 * yang sudah mengirim dari total kewajiban. Aturan kewajiban DISELARASKAN dgn Progress 360
 * (keputusan 2026-10-08 — dulu "9/10" padahal Progress sudah 100%):
 *  - hanya pemetaan WAJIB & bukan ad-hoc;
 *  - pemetaan NONAKTIF tak dihitung (mis. penilai resign) — KECUALI pegawai yang dinilai sendiri
 *    nonaktif (resign di akhir periode): penilaian terhadapnya tetap sah, jadi tetap dihitung;
 *  - penilaian yang DIBATALKAN validitasnya (0046) → kewajiban gugur, keluar dari total.
 */
export type RatedMapping = { assessor_id: string; target_id: string; mandatory: boolean; is_active: boolean; is_adhoc: boolean };

export function ratedCompletion(
  maps: RatedMapping[],
  submittedPairs: ReadonlySet<string>,
  invalidatedPairs: ReadonlySet<string>,
  inactiveTargets: ReadonlySet<string>,
): { total: Map<string, number>; done: Map<string, number> } {
  const total = new Map<string, number>();
  const done = new Map<string, number>();
  for (const m of maps) {
    if (!m.mandatory || m.is_adhoc) continue;
    if (!m.is_active && !inactiveTargets.has(m.target_id)) continue;
    const key = `${m.assessor_id}|${m.target_id}`;
    if (invalidatedPairs.has(key)) continue;
    total.set(m.target_id, (total.get(m.target_id) ?? 0) + 1);
    if (submittedPairs.has(key)) done.set(m.target_id, (done.get(m.target_id) ?? 0) + 1);
  }
  return { total, done };
}
