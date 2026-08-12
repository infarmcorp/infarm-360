/**
 * Format tanggal/waktu SERAGAM untuk seluruh aplikasi — selalu **WIB (Asia/Jakarta)**.
 *
 * KENAPA ZONA WAKTU HARUS DIPAKSA: timestamp disimpan di Postgres sebagai UTC. Bila diformat
 * tanpa `timeZone`, hasilnya mengikuti zona MESIN YANG MERENDER — di Vercel itu **UTC**, jadi
 * jejak audit pukul 09.53 WIB tampil sebagai "02.53" (selisih 7 jam) dan terlihat janggal.
 * Server Component merender di server, jadi tanpa opsi ini angkanya pasti salah untuk pengguna
 * di Indonesia. Semua pengguna aplikasi ini berada di WIB, sehingga zona dikunci (bukan mengikuti
 * perangkat) agar jejak audit sama persis di layar siapa pun — penting untuk data yang dipakai
 * menelusuri "siapa mengubah apa, kapan".
 *
 * Jam memakai format 24 jam dengan pemisah titik dua (09:53), bukan gaya id-ID bawaan yang
 * memakai titik (09.53) — titik mudah tertukar dengan angka desimal pada tabel berisi skor.
 */
const TZ = 'Asia/Jakarta';

const dateFmt = new Intl.DateTimeFormat('id-ID', {
  day: '2-digit', month: 'short', year: 'numeric', timeZone: TZ,
});
// Locale en-GB dipakai KHUSUS untuk jam: menghasilkan "09:53" (24 jam, pemisah titik dua).
const timeFmt = new Intl.DateTimeFormat('en-GB', {
  hour: '2-digit', minute: '2-digit', hour12: false, timeZone: TZ,
});
const timeSecFmt = new Intl.DateTimeFormat('en-GB', {
  hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, timeZone: TZ,
});

/** "12 Agu 2026" (WIB). */
export function formatDateWib(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return '—';
  return dateFmt.format(d);
}

/**
 * "12 Agu 2026 09:53 WIB". Label "WIB" ikut dicetak agar pembaca tahu ini bukan waktu perangkatnya
 * — hilangkan dengan `withZone: false` bila konteksnya sudah jelas.
 */
export function formatDateTimeWib(
  iso: string | Date,
  { withSeconds = false, withZone = true }: { withSeconds?: boolean; withZone?: boolean } = {},
): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return '—';
  const time = (withSeconds ? timeSecFmt : timeFmt).format(d);
  return `${dateFmt.format(d)} ${time}${withZone ? ' WIB' : ''}`;
}
