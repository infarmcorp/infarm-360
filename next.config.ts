import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  experimental: {
    // Unggah gambar Email Rilis Laporan (maks. 2 MB per berkas, dicek di server) lewat Server Action;
    // bawaan Next 1 MB terlalu kecil untuk infografis.
    serverActions: { bodySizeLimit: '3mb' },
  },
};

export default nextConfig;
