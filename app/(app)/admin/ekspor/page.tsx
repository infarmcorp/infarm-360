import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { canAdmin } from '@/lib/auth/roles';
import { EksporClient } from './ekspor-client';

/**
 * Ekspor Dataset (HRD) — unduh data mentah sebagai Excel untuk olah data lanjutan
 * (pivot, statistik, BI). Read-only; otorisasi HRD, baca lengkap via service_role.
 */
export default async function EksporPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: me } = await supabase.from('employees').select('role, is_hrd_admin').eq('id', user.id).maybeSingle();
  if (!canAdmin(me)) {
    return (
      <main className="w-full p-4 sm:p-5 lg:p-6">
        <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
          <p className="text-sm text-gray-600">Halaman ini hanya untuk HRD Admin.</p>
        </div>
      </main>
    );
  }

  const { data: periods } = await supabase
    .from('periods').select('id, label, status, start_date').order('start_date', { ascending: false });
  const periodOpts = (periods ?? []).map((p) => ({ id: p.id, label: p.label, active: p.status === 'active' }));

  return (
    <main className="w-full p-4 sm:p-5 lg:p-6">
      <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
        <div className="flex items-center justify-between mb-1">
          <h1 className="text-xl font-bold text-gray-800">Ekspor Dataset</h1>
          <Link href="/" className="text-xs text-gray-500 hover:underline">← Beranda</Link>
        </div>
        <p className="text-sm text-gray-500 mb-4">
          Unduh data mentah dalam format <strong>Excel (.xlsx)</strong> untuk olah data lanjutan
          (pivot, statistik, atau alat BI). Pilih <strong>periode</strong> atau seluruh periode.
        </p>
        <EksporClient periods={periodOpts} />
        <p className="text-[10px] text-gray-500 italic mt-4">
          Data bersifat sensitif (memuat nama, skor, & komentar). Simpan & bagikan file secara bertanggung jawab.
        </p>
      </div>
    </main>
  );
}
