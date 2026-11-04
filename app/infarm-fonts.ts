import localFont from 'next/font/local';

/*
 * Font halaman ber-Design System Infarm — file woff2 di repo (app/fonts/, subset latin, font variabel; lisensi
 * SIL OFL), dimuat lewat next/font/local. Sengaja BUKAN next/font/google: build Turbopack di Vercel gagal
 * mengunduhnya ("next/font/google queries have exactly one entry", 2026-11-04) walau build lokal lulus.
 * Hanya dipakai halaman ber-kelas `.infarm-ds` (lihat app/globals.css); halaman lain tetap font sistem.
 * Tempel `infarmFontVars` pada className elemen pembungkus halaman.
 * Geist Mono = semua teks & angka; Montserrat = judul h1–h4 (keputusan pengguna 2026-11-04).
 */
const geistMono = localFont({
  src: './fonts/GeistMono-Variable-latin.woff2',
  weight: '100 900',
  variable: '--font-geist-mono',
  display: 'swap',
});
const montserrat = localFont({
  src: './fonts/Montserrat-Variable-latin.woff2',
  weight: '600 800',
  variable: '--font-montserrat',
  display: 'swap',
});

export const infarmFontVars = `${geistMono.variable} ${montserrat.variable}`;
