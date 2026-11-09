/*
 * Kelas tombol Design System Infarm (skala rapat, CLAUDE.md §8) untuk halaman Penilaian & form pengisian.
 * Sengaja file TANPA 'use client' berisi konstanta saja: dipakai page.tsx (Server Component, untuk <Link>)
 * maupun komponen klien (modal, form) — konstanta dari modul 'use client' tak bisa dibaca server.
 */
const BTN_BASE = 'inline-flex items-center justify-center gap-1.5 rounded-xl font-bold text-[13px] min-h-9 px-4 transition-colors disabled:opacity-50 disabled:cursor-not-allowed';

/** Aksi utama (satu per baris/area): hijau brand solid. */
export const BTN_PRIMARY = `${BTN_BASE} bg-brand hover:bg-brand-ink text-white`;
/** Aksi netral/sekunder: putih bergaris. */
export const BTN_GHOST = `${BTN_BASE} bg-surface border border-line text-ink hover:bg-neutral-tint`;
/** Aksi destruktif sekunder (mis. Buang Draf): putih, teks merah. */
export const BTN_DANGER_GHOST = `${BTN_BASE} bg-surface border border-danger-ink/30 text-danger-ink hover:bg-danger-tint`;
/** Konfirmasi destruktif di modal: merah solid (token tak punya `danger` dasar → danger-ink). */
export const BTN_DANGER = `${BTN_BASE} bg-danger-ink hover:brightness-90 text-white`;
/** Tautan aksi sekunder di baris tabel/kartu (Minta Koreksi, Ajukan Hapus, Hapus). */
export const LINK_SECONDARY = 'inline-flex items-center gap-1 text-xs font-semibold text-ink-soft hover:text-brand-ink hover:underline underline-offset-2';
/** Chip kecil status permohonan di baris (Koreksi diajukan / Menunggu HRD). */
export const CHIP_PENDING = 'inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11px] font-semibold bg-warn-tint text-warn-ink';
/** Kotak isian teks panjang (textarea) — padanan FIELD untuk multi-baris. */
const FIELD_AREA_BASE = 'w-full text-[13px] p-3 border rounded-control bg-infarm-surface text-ink placeholder:text-ink-soft focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand-tint';
export const FIELD_AREA = `${FIELD_AREA_BASE} border-line`;
/** Kotak isian wajib yang masih kosong (garis merah lembut). */
export const FIELD_AREA_MISSING = `${FIELD_AREA_BASE} border-danger-ink/40`;
