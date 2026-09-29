/**
 * Daftar alasan dropdown final HRD (2026-09-28) untuk BR-03 (Exposure Check —
 * Not Eligible). (BR-05 N/A Handling DICABUT 2026-09-29 atas permintaan HRD — daftar alasan
 * N/A dihapus; kolom DB is_na/na_reason dibiarkan kosong.) Dipakai bersama oleh Server Action
 * (`penilaian/actions.ts`, validasi) dan komponen klien (dropdown UI).
 *
 * SENGAJA di file terpisah (bukan di actions.ts): file `'use server'` hanya
 * boleh mengekspor fungsi async — mengekspor konstanta biasa dari sana membuat
 * Next.js membuang nilainya saat di-bundle ke klien (jadi `undefined`), yang
 * menyebabkan `[...undefined]` di komponen klien error "is not iterable".
 */

/** BR-03 — alasan Not Eligible ("Lainnya" ditambahkan di sisi UI, wajib keterangan). */
export const NOT_ELIGIBLE_REASONS = [
  'Tidak pernah bekerja sama secara langsung selama periode penilaian',
  'Interaksi kerja terlalu terbatas untuk memberikan penilaian',
  'Hubungan kerja tidak sesuai dengan assignment yang diberikan',
] as const;
