import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { canSection } from '@/lib/auth/roles';
import { EksporClient } from './ekspor-client';

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
      <main className="w-full min-h-full bg-bg px-5 py-7 lg:px-6">
        <div className="bg-surface border border-line rounded-panel p-5">
          <p className="text-sm text-ink-soft">Halaman ini hanya untuk HRD Admin.</p>
        </div>
      </main>
    );
  }

  const { data: periods } = await supabase
    .from('periods').select('id, label, status, start_date').order('start_date', { ascending: false });
  const periodOpts = (periods ?? []).map((p) => ({ id: p.id, label: p.label, active: p.status === 'active' }));

  return (
    <main className="w-full min-h-full bg-bg px-5 py-7 lg:px-6">
      <div className="flex items-start justify-between mb-5 gap-3">
        <div>
          <h1 className="text-[22px] font-bold tracking-[-0.01em] text-ink">Ekspor Dataset</h1>
          <p className="text-[13.5px] text-ink-soft mt-1">
            Unduh data mentah dalam format <strong>Excel (.xlsx)</strong> untuk olah data lanjutan
            (pivot, statistik, atau alat BI). Pilih <strong>periode</strong> atau seluruh periode.
          </p>
        </div>
        <Link href="/" className="text-xs text-ink-faint hover:text-ink-soft whitespace-nowrap mt-1">← Beranda</Link>
      </div>
      <EksporClient periods={periodOpts} />
      <p className="text-[11px] text-ink-faint italic mt-4">
        Data bersifat sensitif (memuat nama, skor, &amp; komentar). Simpan &amp; bagikan file secara bertanggung jawab.
      </p>
    </main>
  );
}
