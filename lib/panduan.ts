/**
 * Sumber tunggal panduan PDF per peran (disajikan statik dari public/panduan/ — 0 byte DB/Storage).
 * Dipakai bersama oleh (a) lampiran email onboarding (lib/email/mailer.ts) dan (b) section
 * "Panduan Pengguna" di aplikasi (akun/). Menjaga paritas: satu mapping, tak ada duplikasi.
 *
 * Cara memperbarui panduan: timpa file di public/panduan/ lalu naikkan PANDUAN_VERSION +
 * PANDUAN_WHATS_NEW, commit & deploy. Badge "BARU" muncul otomatis untuk pengguna yang belum
 * membuka versi ini (dilacak di localStorage — tanpa menyentuh database).
 */
export type PanduanDef = { file: string; filename: string; label: string };

/** Peran efektif → definisi PDF. HRD (role 'hrd' atau pemegang grant is_hrd_admin) → panduan HRD. */
export const PANDUAN_PDF: Record<string, PanduanDef> = {
  hrd:      { file: 'panduan-hrd.pdf',      filename: 'Panduan HRD Admin - Infarm 360.pdf',  label: 'Panduan HRD Admin' },
  spv:      { file: 'panduan-spv.pdf',      filename: 'Panduan Supervisor - Infarm 360.pdf', label: 'Panduan Supervisor' },
  direksi:  { file: 'panduan-direksi.pdf',  filename: 'Panduan Direksi - Infarm 360.pdf',    label: 'Panduan Direksi' },
  employee: { file: 'panduan-pegawai.pdf',  filename: 'Panduan Pegawai - Infarm 360.pdf',    label: 'Panduan Pegawai' },
};

/** Peran efektif untuk memilih panduan: HRD-grant menang atas role, sisanya sesuai role. */
export function panduanKeyFor(role: string | null | undefined, isHrdAdmin: boolean): string {
  return (role === 'hrd' || isHrdAdmin) ? 'hrd' : (role ?? 'employee');
}

export function panduanFor(role: string | null | undefined, isHrdAdmin: boolean): PanduanDef {
  return PANDUAN_PDF[panduanKeyFor(role, isHrdAdmin)] ?? PANDUAN_PDF.employee;
}

/** Path unduh relatif (disajikan Vercel dari /public). */
export function panduanHref(def: PanduanDef): string {
  return `/panduan/${def.file}`;
}

/**
 * Versi panduan terkini (tanggal terbit). NAIKKAN setiap kali PDF di public/panduan/ diganti agar
 * badge "BARU" muncul. Format bebas asalkan berubah tiap rilis; dipakai sebagai kunci "sudah dilihat".
 */
export const PANDUAN_VERSION = '2026-07-30';

/** Tanggal tampil (ID) + ringkas "apa yang baru" untuk section Panduan. */
export const PANDUAN_UPDATED_LABEL = '30 Juli 2026';
export const PANDUAN_WHATS_NEW = 'Panduan diperbarui menyeluruh mengikuti kondisi aplikasi terbaru (teks berwarna + screenshot langkah demi langkah).';
