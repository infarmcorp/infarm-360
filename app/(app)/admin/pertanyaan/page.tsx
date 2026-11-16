import { redirect } from 'next/navigation';
import { FileQuestion, Layers } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { canSection } from '@/lib/auth/roles';
import { IndicatorManager } from './indicator-manager';
import { AddIndicatorForm } from './add-indicator-form';
import { AddAspectForm } from './add-aspect-form';
import { QualManager } from './qual-manager';
import { CopyQuestionsForm } from './copy-questions-form';
import { EmptyState } from '@/components/empty-state';
import { CARD, CardTitle, Note, PageTitle } from '@/components/infarm-ui';
import { INFARM_PAGE } from '@/app/infarm-fonts';

/**
 * Kelola Pertanyaan (HRD): indikator kuantitatif per aspek + pertanyaan kualitatif
 * untuk periode aktif. Perubahan langsung memengaruhi form Pengisian 360 (/penilaian).
 */
export default async function PertanyaanPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: me } = await supabase.from('employees').select('role, is_hrd_admin, hrd_sections').eq('id', user.id).maybeSingle();
  if (!canSection(me, 'pertanyaan')) {
    return <Shell><div className={CARD}><p className="text-[13px] text-ink-soft">Halaman ini hanya untuk HRD Admin.</p></div></Shell>;
  }

  const { data: ap } = await supabase
    .from('periods').select('id, label').eq('status', 'active').limit(1).maybeSingle();
  if (!ap) return (
    <Shell>
      <EmptyState
        icon={<FileQuestion className="w-6 h-6" />}
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
    ? await supabase.from('indicators').select('id, aspect_id, text, is_active, order_idx, description, rating_guide, rating_key_points')
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
      <PageTitle title="Kelola Pertanyaan">
        Periode aktif <span className="data-value font-semibold text-ink">{ap.label}</span> · indikator (nilai 1–5) &amp; esai. Perubahan langsung tampil di formulir.
      </PageTitle>

      <CopyQuestionsForm sources={sourcePeriods} />

      <div className={`${CARD} mt-4`}>
        <div className="flex items-center justify-between gap-2 mb-3">
          <CardTitle icon={Layers}>Aspek &amp; Indikator Kuantitatif</CardTitle>
          <span className="shrink-0 rounded-full bg-neutral-tint px-2.5 py-0.5 text-[12px] text-ink-soft">
            <span className="data-value font-semibold text-ink">{aspectList.length}</span> aspek
          </span>
        </div>

        <AddAspectForm hasAspects={aspectList.length > 0} />

        {aspectList.length > 0 && (
          <div className="mt-4 flex flex-col gap-3">
            {aspectList.map((a, idx) => (
              <IndicatorManager
                key={a.id}
                aspectId={a.id}
                aspectName={a.name}
                canUp={idx > 0}
                canDown={idx < aspectList.length - 1}
                indicators={indicators.filter((i) => i.aspect_id === a.id).map((i) => ({
                  id: i.id, text: i.text, is_active: i.is_active,
                  description: i.description ?? '', ratingGuide: i.rating_guide ?? null, ratingKeyPoints: i.rating_key_points ?? null,
                }))}
              />
            ))}
          </div>
        )}

        {aspectList.length > 0 && <AddIndicatorForm aspects={aspectList.map((a) => ({ id: a.id, name: a.name }))} />}
      </div>

      <div className={`${CARD} mt-4`}>
        <QualManager questions={(quals ?? []).map((q) => ({ id: q.id, text: q.text }))} />
      </div>

      <div className="mt-4"><Note>
        Indikator <strong className="font-semibold text-ink">dinonaktifkan</strong>, bukan dihapus, agar skor lama tetap utuh. Pertanyaan esai dihapus permanen beserta jawabannya.
      </Note></div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <main className={`${INFARM_PAGE} w-full min-h-full px-5 py-7 lg:px-7`}>{children}</main>;
}
