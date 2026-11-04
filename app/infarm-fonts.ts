import localFont from 'next/font/local';

/*
 * Font halaman ber-Design System Infarm — file woff2 di repo (app/fonts/, subset latin, font variabel; lisensi
 * SIL OFL), dimuat lewat next/font/local. Sengaja BUKAN next/font/google: build Turbopack di Vercel gagal
 * mengunduhnya ("next/font/google queries have exactly one entry", 2026-11-04) walau build lokal lulus.
 * Hanya dipakai halaman ber-kelas `.infarm-ds` (lihat app/globals.css); halaman lain tetap font sistem.
 * Tempel `infarmFontVars` pada className elemen pembungkus halaman.
 * Geist = teks; Geist Mono = angka/data; Montserrat = judul h1–h4 (sesuai Design System; pengguna sempat mencoba
 * Geist Mono untuk semua teks lalu kembali ke Geist, 2026-11-04).
 */
const geist = localFont({
  src: './fonts/Geist-Variable-latin.woff2',
  weight: '100 900',
  variable: '--font-geist',
  display: 'swap',
});
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

export const infarmFontVars = `${geist.variable} ${geistMono.variable} ${montserrat.variable}`;

/**
 * Pembungkus kanvas halaman ber-Design System Infarm: font + latar hijau keputihan. Tempel di <main> halaman
 * (Server Component page.tsx). Jangan impor file ini dari komponen yang diuji Vitest — next/font tak berjalan di sana.
 */
export const INFARM_PAGE = `infarm-ds ${infarmFontVars} bg-infarm-surface`;
