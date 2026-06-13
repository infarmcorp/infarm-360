import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { MappingForm } from './mapping-form';
import { DeleteButton } from './delete-button';

/**
 * Pemetaan (Mapping) — HRD atur siapa menilai siapa di periode aktif.
 * Menggerakkan "Daftar Penilaian Saya", kelas bobot 360, & Flag Kepatuhan.
 */
export default async function PemetaanPage() {
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
  if (!ap) return <Shell><p className="text-sm text-gray-500">Tidak ada periode aktif. Aktifkan periode dulu di Kelola Siklus Periode.</p></Shell>;

  const { data: emps } = await supabase.from('employees').select('id, name, dept').order('emp_code');
  const employees = emps ?? [];
  const empById = new Map(employees.map((e) => [e.id, e]));

  const { data: maps } = await supabase
    .from('mappings').select('id, assessor_id, target_id, relation, mandatory')
    .eq('period_id', ap.id).eq('is_active', true);
  const rows = (maps ?? [])
    .map((m) => ({
      id: m.id,
      assessor: empById.get(m.assessor_id)?.name ?? '—',
      target: empById.get(m.target_id)?.name ?? '—',
      relation: m.relation as string,
      mandatory: m.mandatory,
    }))
    .sort((a, b) => a.assessor.localeCompare(b.assessor) || a.target.localeCompare(b.target));

  return (
    <Shell>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold text-gray-800">Pemetaan Penilai 360°</h1>
          <p className="text-sm text-gray-500">Periode aktif: {ap.label} · {rows.length} relasi.</p>
        </div>
        <Link href="/home" className="text-xs text-gray-500 hover:underline">← Beranda</Link>
      </div>

      <div className="mb-5"><MappingForm employees={employees} /></div>

      {rows.length === 0 ? (
        <p className="text-sm text-gray-500">Belum ada pemetaan. Tambahkan di atas.</p>
      ) : (
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="text-[11px] uppercase tracking-wider text-gray-400 border-b border-gray-200">
              <th className="py-2 pr-3">Penilai</th>
              <th className="py-2 px-3">Yang Dinilai</th>
              <th className="py-2 px-3">Relasi</th>
              <th className="py-2 px-3 text-center">Sifat</th>
              <th className="py-2 pl-3 text-right">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="py-3 pr-3 font-bold text-gray-800">{r.assessor}</td>
                <td className="py-3 px-3 text-gray-700">{r.target}</td>
                <td className="py-3 px-3 text-gray-500">{r.relation}</td>
                <td className="py-3 px-3 text-center">
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                    r.mandatory ? 'bg-rose-50 text-rose-700 border-rose-200' : 'bg-gray-50 text-gray-500 border-gray-200'}`}>
                    {r.mandatory ? 'Wajib' : 'Opsional'}
                  </span>
                </td>
                <td className="py-3 pl-3 text-right"><DeleteButton mappingId={r.id} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="text-[10px] text-gray-400 italic mt-3">
        Relasi menentukan kelas bobot 360 (Atasan/Peer/Cross/Self). Sifat Wajib jadi dasar
        Flag Kepatuhan. Menghapus relasi menghilangkannya dari Daftar Penilaian terkait.
      </p>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto max-w-3xl p-6">
      <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">{children}</div>
    </main>
  );
}
