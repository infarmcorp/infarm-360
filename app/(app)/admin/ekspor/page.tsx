import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { canSection } from '@/lib/auth/roles';
import { EksporClient } from './ekspor-client';
import { CARD, Note, PageTitle } from '@/components/infarm-ui';
import { INFARM_PAGE } from '@/app/infarm-fonts';

/**
 * Ekspor Dataset (HRD) — unduh data mentah sebagai Excel untuk olah data lanjutan
 * (pivot, statistik, BI). Read-only; otorisasi HRD, baca lengkap via service_role.
 */
export default async function EksporPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: me } = await supabase.from('employees').select('role, is_hrd_admin, hrd_sections').eq('id', user.id).maybeSingle();
  if (!canSection(me, 'ekspor')) {
    return (
      <main className={`${INFARM_PAGE} w-full min-h-full px-5 py-7 lg:px-7`}>
        <div className={CARD}>
          <p className="text-[13px] text-ink-soft">Halaman ini hanya untuk HRD Admin.</p>
        </div>
      </main>
    );
  }

  const { data: periods } = await supabase
    .from('periods').select('id, label, status, start_date').order('start_date', { ascending: false });
  const periodOpts = (periods ?? []).map((p) => ({ id: p.id, label: p.label, active: p.status === 'active' }));

  return (
    <main className={`${INFARM_PAGE} w-full min-h-full px-5 py-7 lg:px-7`}>
      <PageTitle title="Ekspor Dataset">
        Unduh data mentah (.xlsx) untuk olah data lanjutan. Pilih satu atau semua <strong>periode</strong>.
      </PageTitle>
      <EksporClient periods={periodOpts} />
      <div className="mt-5">
        <Note tone="warn">
          Data ini sensitif (nama, skor, komentar). Simpan dan bagikan dengan hati-hati.
        </Note>
      </div>
    </main>
  );
}
