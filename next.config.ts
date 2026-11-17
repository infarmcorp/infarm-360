import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // PDF Pegawai (lib/pdf/pa-report.tsx) membaca font Inter & logo dari disk saat render di server.
  outputFileTracingIncludes: {
    '/laporan/[employeeId]/pdf-pegawai/unduh': ['./lib/pdf/fonts/**', './lib/pdf/assets/**'],
  },
  env: {
    // Id build yang tertanam di halaman & server → ActionGuard mendeteksi "aplikasi baru di-deploy saat
    // halaman lama terbuka" (/api/version). Lokal tanpa Vercel = 'dev' (banner dimatikan).
    NEXT_PUBLIC_BUILD_ID: process.env.VERCEL_GIT_COMMIT_SHA ?? 'dev',
  },
  experimental: {
    // Unggah gambar Email Rilis Laporan (maks. 2 MB per berkas, dicek di server) lewat Server Action;
    // bawaan Next 1 MB terlalu kecil untuk infografis.
    serverActions: { bodySizeLimit: '3mb' },
  },
};

export default nextConfig;
