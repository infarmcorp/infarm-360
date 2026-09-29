import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { refreshLatePenalties } from '@/lib/late-server';

/**
 * CRON — terapkan potongan keterlambatan 360° (BR-08) OTOMATIS tanpa perlu HRD membuka
 * halaman apa pun. Dipanggil berkala oleh Vercel Cron (lihat `vercel.json`), bukan pengguna.
 *
 * STATUS: DINONAKTIFKAN SEMENTARA (2026-09-29, permintaan pengguna) — `vercel.json` sengaja
 * TIDAK ADA sehingga tak ada jadwal cron yang memanggil route ini; HRD masih sanggup menangani
 * potongan ini manual (klik "Hitung Ulang Skor 360°" / ubah deadline periode). Endpoint & logika
 * di bawah tetap dibiarkan utuh untuk diaktifkan lagi kapan pun (buat ulang `vercel.json` + set
 * `CRON_SECRET`) — jangan hapus file ini.
 *
 * Kenapa perlu: `refreshLatePenalties` (lib/late-server.ts) sudah menghitung dengan benar
 * siapa yang "belum selesai saat deadline" (termasuk yang TAK PERNAH mengirim sama sekali,
 * bukan cuma yang kirim telat — lihat lib/late.ts), tapi sebelumnya hanya TERTULIS ke
 * result_360 kalau ada PEMICU: HRD klik "Hitung Ulang Skor 360°", atau penilai LAIN kirim
 * telat. Penilai yang sama sekali tak pernah mengirim = tak ada pemicu apa pun → potongannya
 * bisa terlambat tertulis (baru ikut terupdate saat ada aktivitas lain). Cron ini mengisi
 * celah itu: jalan sendiri, tanpa menunggu aktivitas siapa pun.
 *
 * Keamanan: BUKAN endpoint publik — wajib header `Authorization: Bearer $CRON_SECRET`
 * (Vercel Cron mengirim ini otomatis; lihat https://vercel.com/docs/cron-jobs/manage-cron-jobs#securing-cron-jobs).
 * Tanpa CRON_SECRET diset di env, endpoint SELALU menolak (fail-closed, bukan fail-open).
 *
 * Batasan (sengaja): cron ini HANYA memperbarui `result_360` yang SUDAH ADA (skor 360°
 * yang sudah pernah dihitung HRD minimal sekali). Ia TIDAK menghitung skor 360° dari nol
 * (`computeResult360` di admin/360/actions.ts) — itu tetap aksi manual HRD (butuh sesi
 * login HRD, bukan sesuatu yang aman dipicu tanpa pengawasan lewat cron server-to-server).
 */
export const dynamic = 'force-dynamic'; // jangan di-cache — harus baca waktu & data terkini

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get('authorization');
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: periods, error } = await admin
    .from('periods').select('id, label, assessment_deadline').eq('status', 'active');
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  const now = Date.now();
  const results: { periodId: string; label: string; changed?: number; skipped?: string; error?: string }[] = [];

  for (const p of periods ?? []) {
    if (!p.assessment_deadline) { results.push({ periodId: p.id, label: p.label, skipped: 'tanpa deadline' }); continue; }
    if (now <= Date.parse(p.assessment_deadline)) { results.push({ periodId: p.id, label: p.label, skipped: 'deadline belum lewat' }); continue; }
    try {
      const changed = await refreshLatePenalties(p.id);
      results.push({ periodId: p.id, label: p.label, changed });
    } catch (e) {
      results.push({ periodId: p.id, label: p.label, error: e instanceof Error ? e.message : String(e) });
    }
  }

  return NextResponse.json({ ok: true, checkedAt: new Date().toISOString(), results });
}
