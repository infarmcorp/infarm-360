import { createClient, createAdminClient } from '@/lib/supabase/server';
import { RiwayatList, type FlatAudit } from './riwayat-list';

// Ukuran halaman audit (server-paginated). Log → 10/hal (selaras Log Aktivitas HRD).
// DIDEFINISIKAN DI SERVER: konstanta dari modul 'use client' yang di-impor server component
// menjadi referensi client (bukan angka) → range() jadi NaN. Jadi definisikan di sini.
const AUDIT_PAGE_SIZE = 10;

/**
 * Riwayat & Audit Perubahan KPI. Menampilkan jejak `kpi_audit` (append-only) per pegawai.
 * SPV → tim (RLS kpiaudit_read is_my_member), HRD → semua. Tabel tak bisa diubah/dihapus.
 *
 * EGRESS: `kpi_audit` append-only → cepat ribuan baris. Karena itu daftar dipaginasi & dicari
 * DI SERVER — hanya SATU halaman baris yang ditarik per render (bukan seluruh riwayat lalu dipotong
 * di klien). Pencarian menyaring pegawai dalam lingkup lebih dulu (nama/divisi) → id hasil dipakai
 * membatasi query audit. Navigasi halaman/pencarian lewat URL (?auditPage=&auditQ=).
 */
const fmt = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) + ' ' +
    d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
};

export async function RiwayatView({
  role, canAdmin = false, userId, hrdMode = 'admin', byPeriod = false, periodParam, scopedIds,
  page = 0, query = '',
}: {
  role: string; canAdmin?: boolean; userId: string; hrdMode?: 'admin' | 'spv';
  byPeriod?: boolean; periodParam?: string; scopedIds?: string[] | null;
  page?: number; query?: string;
}) {
  // Jalur GRANT non-HRD (Manajemen Akses): pemegang grant diblokir RLS → baca via service_role,
  // dibatasi ke daftar id yang SUDAH disaring per-lingkup di page.tsx (employeeInScopes).
  const supabase = scopedIds ? createAdminClient() : await createClient();

  // Penyaringan per periode (halaman Monitoring): batasi audit ke bulan periode terpilih —
  // resolusi SAMA dgn RekapView agar satu dropdown ?period= mengatur kedua tab.
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

  // Lingkup pegawai. Izin HRD (canAdmin) mode admin → semua; HRD-posisi mode-SPV → DIVISINYA;
  // SPV → anggota timnya + dirinya. Pemegang grant non-HRD pakai daftar tersaring (scopedIds).
  let empRows: { id: string; name: string; dept: string }[] = [];
  if (scopedIds) {
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
    const ids = [...new Set([userId, ...(team ?? []).map((t) => t.employee_id)])];
    const { data } = await supabase.from('employees').select('id, name, dept').in('id', ids);
    empRows = data ?? [];
  }
  if (empRows.length === 0) return <p className="text-sm text-gray-500">Belum ada anggota tim dalam lingkup Anda.</p>;
  const empById = new Map(empRows.map((e) => [e.id, e]));

  // Pencarian DI SERVER: saring pegawai dalam lingkup dulu (nama/divisi), lalu batasi query audit
  // ke id hasil — sehingga pencarian tak perlu menarik seluruh riwayat.
  const q = query.trim().toLowerCase();
  const scopeIds = q
    ? empRows.filter((e) => `${e.name} ${e.dept}`.toLowerCase().includes(q)).map((e) => e.id)
    : empRows.map((e) => e.id);

  // Query audit HANYA satu halaman (range + count) — inti penghematan egress. Urut terbaru di atas.
  type AuditT = { employee_id: string; ym: string; score: number; changed_by: string | null; changed_at: string; note: string | null; action: string | null };
  let rows: AuditT[] = [];
  let total = 0;
  if (scopeIds.length > 0) {
    let countQ = supabase.from('kpi_audit').select('*', { count: 'exact', head: true }).in('employee_id', scopeIds);
    if (ymFilter) countQ = countQ.in('ym', ymFilter);
    const { count } = await countQ;
    total = count ?? 0;

    const from = page * AUDIT_PAGE_SIZE;
    let dataQ = supabase.from('kpi_audit')
      .select('employee_id, ym, score, changed_by, changed_at, note, action')
      .in('employee_id', scopeIds);
    if (ymFilter) dataQ = dataQ.in('ym', ymFilter);
    const { data } = await dataQ.order('changed_at', { ascending: false }).order('employee_id').range(from, from + AUDIT_PAGE_SIZE - 1);
    rows = (data ?? []) as AuditT[];
  }

  // Nama pengubah HANYA untuk baris halaman ini (termasuk KOORDINATOR — changed_by memuat id-nya).
  const changerIds = [...new Set(rows.map((r) => r.changed_by).filter(Boolean) as string[])];
  const { data: changers } = changerIds.length
    ? await supabase.from('employees').select('id, name').in('id', changerIds) : { data: [] };
  const changerName = new Map((changers ?? []).map((c) => [c.id, c.name]));

  const entries: FlatAudit[] = rows.map((r) => ({
    empId: r.employee_id,
    name: empById.get(r.employee_id)?.name ?? '—',
    dept: empById.get(r.employee_id)?.dept ?? '',
    ym: r.ym, score: r.score,
    by: r.changed_by ? (changerName.get(r.changed_by) ?? '—') : '—',
    at: fmt(r.changed_at), note: r.note, action: r.action ?? undefined,
  }));

  return <RiwayatList entries={entries} page={page} total={total} pageSize={AUDIT_PAGE_SIZE} query={query} />;
}
