import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import type { WeightValues } from '@/lib/database.types';
import { WeightForm } from './weight-form';

/**
 * Kelola Bobot Penilai (HRD) — skema bobot 360 periode aktif.
 * Setelah ubah, jalankan Hitung Ulang Skor 360° (/admin/360) agar result_360 diperbarui.
 */
export default async function BobotPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: me } = await supabase.from('employees').select('role').eq('id', user.id).maybeSingle();
  if (me?.role !== 'hrd') {
    return <Shell><p className="text-sm text-gray-600">Halaman ini hanya untuk HRD Admin.</p>
      <Link href="/home" className="text-xs text-emerald-700 hover:underline mt-3 inline-block">← Beranda</Link></Shell>;
  }

  const { data: ap } = await supabase
    .from('periods').select('id, label').eq('status', 'active').limit(1).maybeSingle();
  if (!ap) return <Shell><p className="text-sm text-gray-500">Tidak ada periode aktif.</p></Shell>;

  const { data: ws } = await supabase
    .from('weight_schemes').select('model, weights').eq('period_id', ap.id).eq('is_active', true).maybeSingle();
  const w = (ws?.weights ?? {}) as WeightValues;
  const initial = {
    model: (ws?.model ?? '4class') as '4class' | '2class',
    atasan: w.atasan ?? 50, peer: w.peer ?? 30, cross: w.cross ?? 20, self: w.self ?? 0, internal: w.internal ?? 60,
  };

  return (
    <Shell>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold text-gray-800">Kelola Bobot Penilai</h1>
          <p className="text-sm text-gray-500">Periode aktif: {ap.label}</p>
        </div>
        <Link href="/home" className="text-xs text-gray-500 hover:underline">← Beranda</Link>
      </div>
      <WeightForm initial={initial} />
      <p className="text-[10px] text-gray-400 italic mt-4">
        Skor 360 = rata-rata rating tiap kelas penilai ×20, dibobot di sini (Self dikecualikan
        dari total). Perubahan berlaku setelah <Link href="/admin/360" className="underline">Hitung Ulang Skor 360°</Link>.
      </p>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto max-w-xl p-6">
      <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">{children}</div>
    </main>
  );
}
