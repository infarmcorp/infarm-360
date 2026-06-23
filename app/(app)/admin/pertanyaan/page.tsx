import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { canAdmin } from '@/lib/auth/roles';
import { IndicatorManager } from './indicator-manager';
import { AddIndicatorForm } from './add-indicator-form';
import { AddAspectForm } from './add-aspect-form';
import { QualManager } from './qual-manager';
import { CopyQuestionsForm } from './copy-questions-form';
import { EmptyState } from '@/components/empty-state';

/**
 * Kelola Pertanyaan (HRD): indikator kuantitatif per aspek + pertanyaan kualitatif
 * untuk periode aktif. Perubahan langsung memengaruhi form Pengisian 360 (/penilaian).
 */
export default async function PertanyaanPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: me } = await supabase.from('employees').select('role, is_hrd_admin').eq('id', user.id).maybeSingle();
  if (!canAdmin(me)) {
    return <Shell><p className="text-sm text-gray-600">Halaman ini hanya untuk HRD Admin.</p>
      <Link href="/" className="text-xs text-emerald-700 hover:underline mt-3 inline-block">← Beranda</Link></Shell>;
  }

  const { data: ap } = await supabase
    .from('periods').select('id, label').eq('status', 'active').limit(1).maybeSingle();
  if (!ap) return (
    <Shell>
      <EmptyState
        icon="📝"
        title="Belum ada periode aktif"
        description="Pertanyaan (indikator & esai) disusun per periode aktif. Aktifkan periode dulu untuk mengelolanya."
        actions={[{ label: 'Ke Kelola Periode', href: '/admin/periode', primary: true }]}
      />
    </Shell>
  );

  const { data: aspects } = await supabase
    .from('culture_aspects').select('id, name, order_idx').eq('period_id', ap.id).order('order_idx');
  const aspectList = aspects ?? [];

  const { data: inds } = aspectList.length
    ? await supabase.from('indicators').select('id, aspect_id, text, is_active, order_idx, description, rating_guide')
        .in('aspect_id', aspectList.map((a) => a.id)).order('order_idx')
    : { data: [] };
  const indicators = inds ?? [];

  const { data: quals } = await supabase
    .from('qualitative_questions').select('id, text, order_idx').eq('period_id', ap.id).order('order_idx');

  // Periode LAIN (selain aktif) sebagai sumber "pakai pertanyaan periode sebelumnya".
  // RLS *_read = using(true) → boleh baca lintas-periode. Hitung ringkasan per periode.
  const { data: others } = await supabase
    .from('periods').select('id, label, start_date').neq('id', ap.id).order('start_date', { ascending: false });
  const otherIds = (others ?? []).map((p) => p.id);
  const { data: oAspects } = otherIds.length
    ? await supabase.from('culture_aspects').select('id, period_id').in('period_id', otherIds) : { data: [] };
  const oAspectIds = (oAspects ?? []).map((a) => a.id);
  const { data: oInds } = oAspectIds.length
    ? await supabase.from('indicators').select('aspect_id, is_active').in('aspect_id', oAspectIds) : { data: [] };
  const { data: oQuals } = otherIds.length
    ? await supabase.from('qualitative_questions').select('period_id').in('period_id', otherIds) : { data: [] };

  const aspectPeriodById = new Map((oAspects ?? []).map((a) => [a.id, a.period_id]));
  const aspectCount = new Map<string, number>();
  for (const a of oAspects ?? []) aspectCount.set(a.period_id, (aspectCount.get(a.period_id) ?? 0) + 1);
  const indCount = new Map<string, number>();
  for (const i of oInds ?? []) {
    if (!i.is_active) continue;
    const pid = aspectPeriodById.get(i.aspect_id); if (!pid) continue;
    indCount.set(pid, (indCount.get(pid) ?? 0) + 1);
  }
  const qualCount = new Map<string, number>();
  for (const q of oQuals ?? []) qualCount.set(q.period_id, (qualCount.get(q.period_id) ?? 0) + 1);
  const sourcePeriods = (others ?? [])
    .map((p) => ({ id: p.id, label: p.label, aspects: aspectCount.get(p.id) ?? 0, indicators: indCount.get(p.id) ?? 0, quals: qualCount.get(p.id) ?? 0 }))
    .filter((p) => p.aspects > 0 || p.quals > 0);

  return (
    <Shell>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold text-gray-800">Kelola Pertanyaan</h1>
          <p className="text-sm text-gray-500">Periode aktif: {ap.label} · indikator (rating 1–5) &amp; esai.</p>
        </div>
        <Link href="/" className="text-xs text-gray-500 hover:underline">← Beranda</Link>
      </div>

      <div className="space-y-3">
        <CopyQuestionsForm sources={sourcePeriods} />
        <AddAspectForm hasAspects={aspectList.length > 0} />
        {aspectList.map((a, idx) => (
          <IndicatorManager
            key={a.id}
            aspectId={a.id}
            aspectName={a.name}
            canUp={idx > 0}
            canDown={idx < aspectList.length - 1}
            indicators={indicators.filter((i) => i.aspect_id === a.id).map((i) => ({
              id: i.id, text: i.text, is_active: i.is_active,
              description: i.description ?? '', ratingGuide: i.rating_guide ?? null,
            }))}
          />
        ))}
        {aspectList.length > 0 && <AddIndicatorForm aspects={aspectList.map((a) => ({ id: a.id, name: a.name }))} />}
        <QualManager questions={(quals ?? []).map((q) => ({ id: q.id, text: q.text }))} />
      </div>

      <p className="text-[10px] text-gray-500 italic mt-3">
        Indikator dinonaktifkan (bukan dihapus) agar skor historis tetap utuh — yang nonaktif
        tidak muncul di form penilaian baru. Pertanyaan esai dihapus permanen (beserta jawabannya).
      </p>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="w-full p-4 sm:p-5 lg:p-6">
      <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">{children}</div>
    </main>
  );
}
