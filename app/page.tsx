'use client';

import dynamic from 'next/dynamic';

/**
 * Home — sementara merender SPA lama (as-is) selama migrasi bertahap.
 * Dimuat client-only (ssr:false) karena App legacy mengakses localStorage saat render.
 * Fitur yang sudah dimigrasi punya route Next.js sendiri (mis. /kpi).
 */
const App = dynamic(() => import('@/src/App'), { ssr: false });

export default function Home() {
  return <App />;
}
