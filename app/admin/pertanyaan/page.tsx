import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { IndicatorManager } from './indicator-manager';
import { QualManager } from './qual-manager';

/**
 * Kelola Pertanyaan (HRD): indikator kuantitatif per aspek + pertanyaan kualitatif
 * untuk periode aktif. Perubahan langsung memengaruhi form Pengisian 360 (/penilaian).
 */
export default async function PertanyaanPage() {
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

  const { data: aspects } = await supabase
    .from('culture_aspects').select('id, name, order_idx').eq('period_id', ap.id).order('order_idx');
  const aspectList = aspects ?? [];

  const { data: inds } = aspectList.length
    ? await supabase.from('indicators').select('id, aspect_id, text, is_active, order_idx')
        .in('aspect_id', aspectList.map((a) => a.id)).order('order_idx')
    : { data: [] };
  const indicators = inds ?? [];

  const { data: quals } = await supabase
    .from('qualitative_questions').select('id, text, order_idx').eq('period_id', ap.id).order('order_idx');

  return (
    <Shell>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold text-gray-800">Kelola Pertanyaan</h1>
          <p className="text-sm text-gray-500">Periode aktif: {ap.label} · indikator (rating 1–5) &amp; esai.</p>
        </div>
        <Link href="/home" className="text-xs text-gray-500 hover:underline">← Beranda</Link>
      </div>

      <div className="space-y-3">
        {aspectList.map((a) => (
          <IndicatorManager
            key={a.id}
            aspectId={a.id}
            aspectName={a.name}
            indicators={indicators.filter((i) => i.aspect_id === a.id).map((i) => ({ id: i.id, text: i.text, is_active: i.is_active }))}
          />
        ))}
        <QualManager questions={(quals ?? []).map((q) => ({ id: q.id, text: q.text }))} />
      </div>

      <p className="text-[10px] text-gray-400 italic mt-3">
        Indikator dinonaktifkan (bukan dihapus) agar skor historis tetap utuh — yang nonaktif
        tidak muncul di form penilaian baru. Pertanyaan esai dihapus permanen (beserta jawabannya).
      </p>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto max-w-2xl p-6">
      <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">{children}</div>
    </main>
  );
}
