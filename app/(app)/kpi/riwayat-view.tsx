import { createClient, createAdminClient } from '@/lib/supabase/server';
import { fetchAllByIds } from '@/lib/supabase/paginate';
import { RiwayatList, type FlatAudit } from './riwayat-list';

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

export async function RiwayatView({ role, canAdmin = false, userId, hrdMode = 'admin', byPeriod = false, periodParam, scopedIds }: { role: string; canAdmin?: boolean; userId: string; hrdMode?: 'admin' | 'spv'; byPeriod?: boolean; periodParam?: string; scopedIds?: string[] | null }) {
  // Jalur GRANT non-HRD (Manajemen Akses): pemegang grant diblokir RLS → baca via service_role,
  // dibatasi ke daftar id yang SUDAH disaring per-lingkup di page.tsx (employeeInScopes).
  const supabase = scopedIds ? createAdminClient() : await createClient();

  // Penyaringan per periode (untuk halaman Monitoring berdampingan): batasi audit ke
  // bulan periode terpilih — resolusi SAMA dgn RekapView agar satu dropdown ?period=
  // mengatur kedua panel. Bila byPeriod=false (mis. tab SPV) → tampilkan semua periode.
  let ymFilter: string[] | null = null;
  if (byPeriod) {
    const { data: periods } = await supabase.from('periods').select('id, label, status').order('label');
    const list = periods ?? [];
    const sel = list.find((p) => p.id === periodParam)
      ?? list.find((p) => p.status === 'active')
      ?? list[0];
    if (!sel) return <p className="text-sm text-gray-500">Belum ada periode.</p>;
    const { data: months } = await supabase.from('period_months').select('ym').eq('period_id', sel.id);
    ymFilter = (months ?? []).map((m) => m.ym);
    if (ymFilter.length === 0) return <p className="text-sm text-gray-500">Periode ini belum memiliki bulan.</p>;
  }

  // Lingkup pegawai. Izin HRD (canAdmin) di mode admin → semua; HRD-posisi mode-SPV → DIVISINYA
  // (selaras Input KPI); SPV → anggota timnya. Pemegang grant non-HRD pakai cabang admin (semua).
  let empRows: { id: string; name: string; dept: string }[] = [];
  if (scopedIds) {
    // Grant berlingkup: hanya pegawai dalam daftar tersaring (id sudah dibatasi lingkup di server).
    const { data } = scopedIds.length
      ? await supabase.from('employees').select('id, name, dept').in('id', scopedIds)
      : { data: [] };
    empRows = data ?? [];
  } else if (canAdmin && hrdMode === 'admin') {
    const { data } = await supabase.from('employees').select('id, name, dept').neq('role', 'direksi').eq('is_external', false);
    empRows = data ?? [];
  } else if (role === 'hrd') {
    const { data: me } = await supabase.from('employees').select('dept').eq('id', userId).maybeSingle();
    const { data } = await supabase.from('employees').select('id, name, dept')
      .eq('dept', me?.dept ?? '__none__').neq('role', 'direksi').eq('is_external', false);
    empRows = data ?? [];
  } else {
    const { data: team } = await supabase.from('spv_team_members').select('employee_id').eq('spv_id', userId);
    // SPV juga mencatat KPI dirinya sendiri (migrasi 0008) → sertakan dalam lingkup audit.
    const ids = [...new Set([userId, ...(team ?? []).map((t) => t.employee_id)])];
    const { data } = await supabase.from('employees').select('id, name, dept').in('id', ids);
    empRows = data ?? [];
  }
  if (empRows.length === 0) return <p className="text-sm text-gray-500">Belum ada anggota tim dalam lingkup Anda.</p>;
  empRows.sort((a, b) => a.name.localeCompare(b.name));

  // kpi_audit = tabel APPEND-ONLY yang menumpuk tiap input/edit KPI → cepat >1000 baris.
  // Ambil PENUH (chunk id pegawai + paginasi baris), lalu urutkan ulang terbaru-di-atas di memori
  // (fetchAllByIds menggabung per-chunk sehingga urutan global harus disusun ulang).
  type AuditT = { employee_id: string; ym: string; score: number; changed_by: string | null; changed_at: string; note: string | null; action: string | null };
  const audit = await fetchAllByIds<AuditT>(empRows.map((e) => e.id), (chunk, from, to) => {
    let q = supabase.from('kpi_audit').select('employee_id, ym, score, changed_by, changed_at, note, action').in('employee_id', chunk);
    if (ymFilter) q = q.in('ym', ymFilter);
    return q.order('changed_at', { ascending: false }).order('employee_id').range(from, to);
  });
  const rows = audit.sort((a, b) => (a.changed_at < b.changed_at ? 1 : a.changed_at > b.changed_at ? -1 : 0));
  if (rows.length === 0) return <p className="text-sm text-gray-500">{byPeriod ? 'Belum ada jejak audit KPI untuk periode ini.' : 'Belum ada jejak audit KPI. Riwayat tercatat otomatis setiap input skor.'}</p>;

  // Nama pengubah (termasuk KOORDINATOR — kpi_audit.changed_by memuat id koordinator saat ia
  // input KPI via service_role, sehingga input koordinator tetap terlacak atas namanya).
  const changerIds = [...new Set(rows.map((r) => r.changed_by).filter(Boolean) as string[])];
  const { data: changers } = changerIds.length
    ? await supabase.from('employees').select('id, name').in('id', changerIds) : { data: [] };
  const changerName = new Map((changers ?? []).map((c) => [c.id, c.name]));
  const empById = new Map(empRows.map((e) => [e.id, e]));

  // RATA (flat) + urut TERBARU DI ATAS. `rows` sudah diurut changed_at desc dari query →
  // pertahankan urutannya (siapa paling baru mengubah muncul teratas), bukan dikelompokkan per nama.
  const entries: FlatAudit[] = rows.map((r) => ({
    empId: r.employee_id,
    name: empById.get(r.employee_id)?.name ?? '—',
    dept: empById.get(r.employee_id)?.dept ?? '',
    ym: r.ym, score: r.score,
    by: r.changed_by ? (changerName.get(r.changed_by) ?? '—') : '—',
    at: fmt(r.changed_at), note: r.note, action: r.action ?? undefined,
  }));

  return <RiwayatList entries={entries} />;
}
