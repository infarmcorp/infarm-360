import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { appBaseUrl } from '@/lib/app-url';
import { processDueReleaseSchedules } from '@/lib/release-schedule';

/**
 * CRON — kirim Email Rilis Laporan yang JADWALNYA sudah tiba (migrasi 0053, lib/release-schedule.ts).
 * Dipanggil GitHub Actions (.github/workflows/release-email-cron.yml) tiap ±10 menit; bisa juga dipanggil
 * manual (workflow_dispatch) untuk uji. Bukan endpoint publik: wajib `Authorization: Bearer $CRON_SECRET`;
 * tanpa CRON_SECRET di env, SELALU menolak (gagal tertutup). `/api/cron/` dikecualikan dari cek sesi di
 * lib/supabase/middleware.ts justru karena pemanggilnya tak punya sesi pengguna.
 *
 * Tiap panggilan mengirim ≤ 25 pegawai (batas waktu fungsi); sisanya dilanjutkan panggilan berikutnya.
 */
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get('authorization');
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }
  const base = await appBaseUrl();
  const out = await processDueReleaseSchedules(createAdminClient(), { appUrl: base ? `${base}/laporan` : undefined });
  return NextResponse.json({ ...out, checkedAt: new Date().toISOString() }, { status: out.ok ? 200 : 500 });
}
