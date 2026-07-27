/**
 * Label nama untuk tampilan. Pakai NAMA PANGGILAN (`nickname`, migrasi 0034) bila diisi;
 * jika kosong → jatuh ke NAMA LENGKAP (`name`) apa adanya (keputusan fallback pengguna).
 * Dipakai di tampilan padat (Dashboard Organisasi, Monitor, heatmap, movers, tabel talenta)
 * agar nama tak terlalu panjang, TANPA mengubah `name` (nama resmi untuk dokumen/PDF).
 */
export function displayName(nickname: string | null | undefined, name: string): string {
  const nn = nickname?.trim();
  return nn ? nn : name;
}
