import { createClient } from '@/lib/supabase/server';

/**
 * Riwayat & Audit Perubahan KPI — tab di Input KPI. Menampilkan jejak `kpi_audit`
 * (append-only) per pegawai. SPV → tim (RLS kpiaudit_read is_my_member), HRD → semua.
 * Tabel ini tak bisa diubah/dihapus dari client (tanpa policy UPDATE/DELETE).
 */
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const labelMonth = (ym: string) => { const [y, m] = ym.split('-'); return `${MONTHS[Number(m) - 1] ?? m} ${y}`; };
const fmt = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) + ' ' +
    d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
};

export async function RiwayatView({ role, userId }: { role: string; userId: string }) {
  const supabase = await createClient();

  // Lingkup pegawai.
  let empRows: { id: string; name: string; dept: string }[] = [];
  if (role === 'hrd') {
    const { data } = await supabase.from('employees').select('id, name, dept').neq('role', 'direksi');
    empRows = data ?? [];
  } else {
    const { data: team } = await supabase.from('spv_team_members').select('employee_id').eq('spv_id', userId);
    const ids = (team ?? []).map((t) => t.employee_id);
    if (ids.length) {
      const { data } = await supabase.from('employees').select('id, name, dept').in('id', ids);
      empRows = data ?? [];
    }
  }
  if (empRows.length === 0) return <p className="text-sm text-gray-500">Belum ada anggota tim dalam lingkup Anda.</p>;
  empRows.sort((a, b) => a.name.localeCompare(b.name));
  const empById = new Map(empRows.map((e) => [e.id, e]));

  const { data: audit } = await supabase
    .from('kpi_audit')
    .select('employee_id, ym, score, changed_by, changed_at, note')
    .in('employee_id', empRows.map((e) => e.id))
    .order('changed_at', { ascending: false });
  const rows = audit ?? [];

  // Nama pengubah.
  const changerIds = [...new Set(rows.map((r) => r.changed_by).filter(Boolean) as string[])];
  const { data: changers } = changerIds.length
    ? await supabase.from('employees').select('id, name').in('id', changerIds) : { data: [] };
  const changerName = new Map((changers ?? []).map((c) => [c.id, c.name]));

  // Kelompokkan per pegawai.
  const byEmp = new Map<string, typeof rows>();
  rows.forEach((r) => { const a = byEmp.get(r.employee_id) ?? []; a.push(r); byEmp.set(r.employee_id, a); });

  if (rows.length === 0) return <p className="text-sm text-gray-500">Belum ada jejak audit KPI. Riwayat tercatat otomatis setiap input skor.</p>;

  return (
    <div className="space-y-3">
      <p className="text-[11px] text-gray-400">Jejak perubahan KPI bersifat <strong>append-only</strong> — tidak dapat diubah/dihapus.</p>
      {empRows.filter((e) => byEmp.has(e.id)).map((e) => {
        const entries = byEmp.get(e.id)!;
        return (
          <details key={e.id} className="border border-gray-200 rounded-xl overflow-hidden" open={byEmp.size <= 3}>
            <summary className="cursor-pointer select-none px-3 py-2.5 bg-gray-50 hover:bg-gray-100 flex items-center justify-between">
              <span className="text-sm font-bold text-gray-800">{e.name} <span className="text-[11px] font-normal text-gray-400">· {e.dept}</span></span>
              <span className="text-[10px] text-gray-400">{entries.length} perubahan</span>
            </summary>
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="text-[9px] uppercase tracking-wider text-gray-400 border-b border-gray-150 bg-white">
                  <th className="py-2 px-3">Bulan</th>
                  <th className="py-2 px-3 text-center">Skor</th>
                  <th className="py-2 px-3">Oleh</th>
                  <th className="py-2 px-3">Waktu</th>
                  <th className="py-2 px-3">Catatan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {entries.map((r, i) => (
                  <tr key={i}>
                    <td className="py-2 px-3 font-semibold text-gray-700">{labelMonth(r.ym)}</td>
                    <td className="py-2 px-3 text-center font-mono font-bold text-emerald-700">{r.score.toFixed(1)}</td>
                    <td className="py-2 px-3 text-gray-600">{r.changed_by ? (changerName.get(r.changed_by) ?? '—') : '—'}</td>
                    <td className="py-2 px-3 text-gray-400">{fmt(r.changed_at)}</td>
                    <td className="py-2 px-3 text-gray-500 italic">{r.note ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        );
      })}
    </div>
  );
}
