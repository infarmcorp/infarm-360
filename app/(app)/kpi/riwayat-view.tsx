import { createClient } from '@/lib/supabase/server';
import { RiwayatList, type EmpAudit } from './riwayat-list';

/**
 * Riwayat & Audit Perubahan KPI. Menampilkan jejak `kpi_audit` (append-only) per
 * pegawai. SPV → tim (RLS kpiaudit_read is_my_member), HRD → semua. Tabel tak bisa
 * diubah/dihapus dari client. Pencarian nama di komponen klien RiwayatList.
 */
const fmt = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) + ' ' +
    d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
};

export async function RiwayatView({ role, userId, hrdMode = 'admin' }: { role: string; userId: string; hrdMode?: 'admin' | 'spv' }) {
  const supabase = await createClient();

  // Lingkup pegawai. HRD admin → semua; HRD mode-SPV → hanya DIVISINYA (selaras Input KPI);
  // SPV → anggota timnya.
  let empRows: { id: string; name: string; dept: string }[] = [];
  if (role === 'hrd' && hrdMode === 'admin') {
    const { data } = await supabase.from('employees').select('id, name, dept').neq('role', 'direksi');
    empRows = data ?? [];
  } else if (role === 'hrd') {
    const { data: me } = await supabase.from('employees').select('dept').eq('id', userId).maybeSingle();
    const { data } = await supabase.from('employees').select('id, name, dept')
      .eq('dept', me?.dept ?? '__none__').neq('role', 'direksi');
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

  const { data: audit } = await supabase
    .from('kpi_audit')
    .select('employee_id, ym, score, changed_by, changed_at, note')
    .in('employee_id', empRows.map((e) => e.id))
    .order('changed_at', { ascending: false });
  const rows = audit ?? [];
  if (rows.length === 0) return <p className="text-sm text-gray-500">Belum ada jejak audit KPI. Riwayat tercatat otomatis setiap input skor.</p>;

  // Nama pengubah.
  const changerIds = [...new Set(rows.map((r) => r.changed_by).filter(Boolean) as string[])];
  const { data: changers } = changerIds.length
    ? await supabase.from('employees').select('id, name').in('id', changerIds) : { data: [] };
  const changerName = new Map((changers ?? []).map((c) => [c.id, c.name]));

  // Kelompokkan per pegawai (serializable untuk komponen klien).
  const byEmp = new Map<string, typeof rows>();
  rows.forEach((r) => { const a = byEmp.get(r.employee_id) ?? []; a.push(r); byEmp.set(r.employee_id, a); });
  const groups: EmpAudit[] = empRows.filter((e) => byEmp.has(e.id)).map((e) => ({
    id: e.id, name: e.name, dept: e.dept,
    entries: byEmp.get(e.id)!.map((r) => ({
      ym: r.ym, score: r.score, by: r.changed_by ? (changerName.get(r.changed_by) ?? '—') : '—',
      at: fmt(r.changed_at), note: r.note,
    })),
  }));

  return <RiwayatList groups={groups} />;
}
