import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';

const REL_LABEL: Record<string, string> = {
  Atasan: 'Atasan', Peer: 'Rekan (Peer)', Cross: 'Lintas Divisi', Self: 'Diri Sendiri', Bawahan: 'Bawahan',
};

/**
 * Daftar Penilaian Saya (read-only, versi termigrasi Supabase).
 * Membaca mapping kuartal aktif di mana user = penilai, + status assessment-nya.
 * Semua query tunduk RLS (map_read/asmt_read): user hanya melihat mapping/penilaian
 * miliknya. Query datar (tanpa embedded join) agar ter-tipe penuh.
 */
export default async function PenilaianPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: ap } = await supabase
    .from('periods').select('id, label').eq('status', 'active').limit(1).maybeSingle();
  if (!ap) {
    return <Shell><p className="text-sm text-gray-500">Tidak ada periode aktif. Hubungi HRD.</p></Shell>;
  }

  const { data: maps } = await supabase
    .from('mappings')
    .select('id, target_id, relation, mandatory')
    .eq('assessor_id', user.id)
    .eq('period_id', ap.id)
    .eq('is_active', true);
  const rows = maps ?? [];

  const targetIds = rows.map((r) => r.target_id);
  const { data: emps } = targetIds.length
    ? await supabase.from('employees').select('id, name, dept').in('id', targetIds)
    : { data: [] };
  const empById = new Map((emps ?? []).map((e) => [e.id, e]));

  const { data: asmts } = await supabase
    .from('assessments').select('target_id, status')
    .eq('assessor_id', user.id).eq('period_id', ap.id);
  const statusByTarget = new Map((asmts ?? []).map((a) => [a.target_id, a.status]));

  const items = rows
    .map((r) => ({
      id: r.id,
      targetId: r.target_id,
      name: empById.get(r.target_id)?.name ?? '(tidak diketahui)',
      dept: empById.get(r.target_id)?.dept ?? '—',
      relation: r.relation as string,
      mandatory: r.mandatory,
      status: statusByTarget.get(r.target_id) ?? null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <Shell periodLabel={ap.label}>
      {items.length === 0 ? (
        <p className="text-sm text-gray-500">
          Belum ada penilaian yang ditugaskan kepada Anda di periode ini.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-[11px] uppercase tracking-wider text-gray-400 border-b border-gray-200">
                <th className="py-2 pr-3">Yang Dinilai</th>
                <th className="py-2 px-3">Garis Hubungan</th>
                <th className="py-2 px-3 text-center">Sifat</th>
                <th className="py-2 px-3 text-right">Status</th>
                <th className="py-2 pl-3 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {items.map((it) => (
                <tr key={it.id}>
                  <td className="py-3 pr-3">
                    <span className="font-bold text-gray-800 block">{it.name}</span>
                    <span className="text-[11px] text-gray-400">{it.dept}</span>
                  </td>
                  <td className="py-3 px-3 text-gray-600">{REL_LABEL[it.relation] ?? it.relation}</td>
                  <td className="py-3 px-3 text-center">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                      it.mandatory
                        ? 'bg-rose-50 text-rose-700 border-rose-200'
                        : 'bg-gray-50 text-gray-500 border-gray-200'
                    }`}>
                      {it.mandatory ? 'Wajib' : 'Opsional'}
                    </span>
                  </td>
                  <td className="py-3 px-3 text-right">
                    <StatusBadge status={it.status} />
                  </td>
                  <td className="py-3 pl-3 text-right">
                    <Link
                      href={`/penilaian/${it.targetId}`}
                      className="text-xs font-bold text-emerald-700 hover:underline"
                    >
                      {it.status === 'submitted' ? 'Edit' : it.status === 'draft' ? 'Lanjutkan' : 'Mulai Nilai'}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Shell>
  );
}

function StatusBadge({ status }: { status: string | null }) {
  const map: Record<string, { label: string; cls: string }> = {
    submitted: { label: 'Terkirim', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    draft: { label: 'Draf', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  };
  const s = status ? map[status] : { label: 'Belum dinilai', cls: 'bg-gray-50 text-gray-500 border-gray-200' };
  return <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${s.cls}`}>{s.label}</span>;
}

function Shell({ children, periodLabel }: { children: React.ReactNode; periodLabel?: string }) {
  return (
    <main className="mx-auto max-w-2xl p-6">
      <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl font-bold text-gray-800">Daftar Penilaian Saya</h1>
            {periodLabel && <p className="text-sm text-gray-500">Periode aktif: {periodLabel}</p>}
          </div>
          <Link href="/home" className="text-xs text-gray-500 hover:underline">← Beranda</Link>
        </div>
        {children}
      </div>
    </main>
  );
}
