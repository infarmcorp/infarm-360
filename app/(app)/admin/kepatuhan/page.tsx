import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { PenaltyInput } from './penalty-input';

/**
 * Flag Kepatuhan Penilaian & Punishment (HRD).
 * - Flag keterlambatan: penilaian WAJIB (mapping mandatory) yang belum terkirim.
 * - Flag Self Assessment: pegawai belum mengisi penilaian diri sendiri (assessor=target).
 * - Punishment: input poin pengurangan → compliance_penalties (memotong Skor Akhir).
 */
export default async function KepatuhanPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: me } = await supabase.from('employees').select('role').eq('id', user.id).maybeSingle();
  if (me?.role !== 'hrd') {
    return <Shell><p className="text-sm text-gray-600">Halaman ini hanya untuk HRD Admin.</p>
      <Link href="/" className="text-xs text-emerald-700 hover:underline mt-3 inline-block">← Beranda</Link></Shell>;
  }

  const { data: ap } = await supabase
    .from('periods').select('id, label').eq('status', 'active').limit(1).maybeSingle();
  if (!ap) return <Shell><p className="text-sm text-gray-500">Tidak ada periode aktif.</p></Shell>;

  const { data: emps } = await supabase.from('employees').select('id, name, dept').neq('role', 'direksi');
  const employees = emps ?? [];
  const nameById = new Map(employees.map((e) => [e.id, e.name]));

  // Mapping wajib per penilai.
  const { data: maps } = await supabase
    .from('mappings').select('assessor_id, target_id, mandatory')
    .eq('period_id', ap.id).eq('is_active', true);
  // Assessment terkirim → set "assessor:target".
  const { data: asmts } = await supabase
    .from('assessments').select('assessor_id, target_id')
    .eq('period_id', ap.id).eq('status', 'submitted');
  const submitted = new Set((asmts ?? []).map((a) => `${a.assessor_id}:${a.target_id}`));
  const selfDone = new Set((asmts ?? []).filter((a) => a.assessor_id === a.target_id).map((a) => a.assessor_id));

  const { data: pen } = await supabase
    .from('compliance_penalties').select('employee_id, points').eq('period_id', ap.id);
  const penBy = new Map((pen ?? []).map((p) => [p.employee_id, p.points]));

  const rows = employees.map((e) => {
    const lateTargets = (maps ?? [])
      .filter((m) => m.assessor_id === e.id && m.mandatory && !submitted.has(`${e.id}:${m.target_id}`))
      .map((m) => nameById.get(m.target_id) ?? '—');
    return {
      id: e.id, name: e.name, dept: e.dept,
      lateCount: lateTargets.length, lateTargets,
      selfMissing: !selfDone.has(e.id),
      points: penBy.get(e.id) ?? 0,
    };
  }).sort((a, b) => b.lateCount - a.lateCount || a.name.localeCompare(b.name));

  const totalLate = rows.filter((r) => r.lateCount > 0).length;
  const totalSelfMissing = rows.filter((r) => r.selfMissing).length;

  return (
    <Shell>
      <div className="flex items-center justify-between mb-3">
        <div>
          <h1 className="text-xl font-bold text-gray-800">Flag Kepatuhan Penilaian</h1>
          <p className="text-sm text-gray-500">Periode aktif: {ap.label}</p>
        </div>
        <Link href="/" className="text-xs text-gray-500 hover:underline">← Beranda</Link>
      </div>

      <div className="grid grid-cols-2 gap-2 mb-4">
        <div className="border border-rose-200 bg-rose-50/50 rounded-xl p-3 text-center">
          <div className="text-lg font-black text-rose-700">{totalLate}</div>
          <div className="text-[10px] font-bold text-gray-500">Pegawai telat (penilaian wajib)</div>
        </div>
        <div className="border border-amber-200 bg-amber-50/50 rounded-xl p-3 text-center">
          <div className="text-lg font-black text-amber-700">{totalSelfMissing}</div>
          <div className="text-[10px] font-bold text-gray-500">Belum self-assessment</div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="text-[11px] uppercase tracking-wider text-gray-400 border-b border-gray-200">
              <th className="py-2 pr-3">Pegawai</th>
              <th className="py-2 px-3 text-center">Wajib Telat</th>
              <th className="py-2 px-3 text-center">Self</th>
              <th className="py-2 pl-3 text-right">Punishment (poin)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="py-3 pr-3">
                  <span className="font-bold text-gray-800 block">{r.name}</span>
                  <span className="text-[11px] text-gray-400">{r.dept}</span>
                </td>
                <td className="py-3 px-3 text-center">
                  {r.lateCount > 0 ? (
                    <span className="text-[11px] font-bold text-rose-700" title={r.lateTargets.join(', ')}>
                      {r.lateCount} telat
                    </span>
                  ) : <span className="text-[11px] text-emerald-600">✔ patuh</span>}
                </td>
                <td className="py-3 px-3 text-center">
                  {r.selfMissing
                    ? <span className="text-[10px] font-bold text-amber-700">belum</span>
                    : <span className="text-[10px] text-emerald-600">✔</span>}
                </td>
                <td className="py-3 pl-3 text-right">
                  <PenaltyInput employeeId={r.id} initial={r.points} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[10px] text-gray-400 italic mt-3">
        &quot;Wajib Telat&quot; = penilaian bersifat Wajib (mapping) yang belum dikirim (arahkan kursor untuk daftar nama).
        Punishment memotong Skor Akhir pegawai di periode ini (min 0).
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
