import { createHmac } from 'node:crypto';

/**
 * Penanda tersembunyi pelapor Laporkan Pelanggaran (migrasi 0062, keputusan pemilik 2026-11-16).
 *
 * = HMAC-SHA256(VIOLATION_REPORTER_SECRET, id pelapor), hex 64 karakter. Dipakai SERVER saja untuk menampilkan
 * "Laporan Saya" ke pelapornya sendiri. Jangan kirim ke klien, jangan tulis ke log/console/pesan error, jangan
 * tampilkan atau ekspor ke HRD/Direksi. Tanpa kunci rahasia, penanda tak bisa dicocokkan ke pegawai mana pun.
 *
 * Kunci rahasia: env server `VIOLATION_REPORTER_SECRET` (≥ 32 karakter acak). JANGAN pernah diganti — laporan lama
 * akan hilang dari Laporan Saya pelapornya. Kosong/terlalu pendek → null (laporan tetap terkirim tanpa penanda,
 * Laporan Saya menampilkan "belum aktif"). Gagal tertutup: tak ada kunci cadangan.
 */
export const REPORTER_SECRET_MIN = 32;

export function reporterRef(userId: string): string | null {
  const secret = process.env.VIOLATION_REPORTER_SECRET ?? '';
  if (secret.length < REPORTER_SECRET_MIN || !userId) return null;
  return createHmac('sha256', secret).update(`violation-reporter:${userId}`).digest('hex');
}
