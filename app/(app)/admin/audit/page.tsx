import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { canAdmin } from '@/lib/auth/roles';
import { AuditClient, type AuditRow } from './audit-client';

/**
 * Log Aktivitas HRD — jejak audit aksi sensitif (kunci periode, bobot, finalisasi,
 * punishment, kelola akun, dll). Read-only untuk HRD & Direksi (RLS hrd_audit_read).
 * Tabel append-only; tak ada cara mengubah/menghapus baris dari aplikasi.
 */
const MAX_ROWS = 500;

export default async function AuditPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: me } = await supabase.from('employees').select('role, is_hrd_admin').eq('id', user.id).maybeSingle();
  const role = me?.role ?? 'employee';
  if (!canAdmin(me) && role !== 'direksi') {
    return (
      <main className="w-full p-4 sm:p-5 lg:p-6">
        <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
          <p className="text-sm text-gray-600">Halaman ini hanya untuk HRD &amp; Direksi.</p>
        </div>
      </main>
    );
  }

  const { data } = await supabase
    .from('hrd_audit_log')
    .select('id, actor_name, action, category, summary, target_label, created_at')
    .order('created_at', { ascending: false })
    .limit(MAX_ROWS);

  const rows: AuditRow[] = (data ?? []).map((r) => ({
    id: r.id,
    actor: r.actor_name ?? '—',
    action: r.action,
    category: r.category,
    summary: r.summary,
    targetLabel: r.target_label,
    createdAt: r.created_at,
  }));

  return (
    <main className="w-full p-4 sm:p-5 lg:p-6">
      <div className="mb-4">
        <h1 className="text-xl font-bold text-gray-800">Log Aktivitas HRD</h1>
        <p className="mt-1 text-sm text-gray-500">
          Jejak audit aksi sensitif (kunci/aktivasi periode, bobot, finalisasi, punishment,
          kelola akun, pemetaan, pertanyaan). Hanya-baca &amp; tak dapat diubah.
        </p>
      </div>
      <AuditClient rows={rows} maxRows={MAX_ROWS} />
    </main>
  );
}
