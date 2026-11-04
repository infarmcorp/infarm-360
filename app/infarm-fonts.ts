import { Geist_Mono, Montserrat } from 'next/font/google';

/*
 * Font halaman ber-Design System Infarm — di-host sendiri oleh next/font (diunduh saat build, tak ada panggilan ke
 * Google saat halaman dibuka). Hanya dipakai halaman ber-kelas `.infarm-ds` (lihat app/globals.css);
 * halaman lain tetap font sistem. Tempel `infarmFontVars` pada className elemen pembungkus halaman.
 * Geist Mono = semua teks & angka; Montserrat = judul h1–h4 (keputusan pengguna 2026-11-04).
 */
const geistMono = Geist_Mono({ subsets: ['latin'], variable: '--font-geist-mono', display: 'swap' });
const montserrat = Montserrat({ subsets: ['latin'], weight: ['600', '700', '800'], variable: '--font-montserrat', display: 'swap' });

export const infarmFontVars = `${geistMono.variable} ${montserrat.variable}`;
