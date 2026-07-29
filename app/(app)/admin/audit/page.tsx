import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { canSection } from '@/lib/auth/roles';
import { AuditClient, type AuditRow } from './audit-client';

/**
 * Log Aktivitas HRD — jejak audit aksi sensitif (kunci periode, bobot, finalisasi,
 * punishment, kelola akun, dll). Read-only untuk HRD & Direksi (RLS hrd_audit_read).
 * Tabel append-only; tak ada cara mengubah/menghapus baris dari aplikasi.
 *
 * OPTIMASI EGRESS (2026-07-15): paginasi di SISI SERVER — hanya 10 baris per halaman
 * diambil via `.range()` (bukan 500 sekaligus). Filter kategori & pencarian juga
 * ditegakkan di server (`.eq`/`.or ilike`) agar tetap lintas-seluruh-data tanpa
 * mengunduh semuanya. Navigasi "10 berikutnya" lewat ?page= (server fetch baru).
 */
const PAGE_SIZE = 5;

/** Tanggal (YYYY-MM-DD) + 1 hari → batas EKSKLUSIF agar seluruh hari `end_date` ikut terhitung. */
function nextDay(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; cat?: string; q?: string; period?: string }>;
}) {
  const { page: pageParam, cat, q, period } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: me } = await supabase.from('employees').select('role, is_hrd_admin, hrd_sections').eq('id', user.id).maybeSingle();
  const role = me?.role ?? 'employee';
  if (!canSection(me, 'audit') && role !== 'direksi') {
    return (
      <main className="w-full p-4 sm:p-5 lg:p-6">
        <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
          <p className="text-sm text-gray-600">Halaman ini hanya untuk HRD &amp; Direksi.</p>
        </div>
      </main>
    );
  }

  const page = Math.max(0, Number.parseInt(pageParam ?? '0', 10) || 0);
  const category = cat ?? 'all';
  // Sanitasi kata kunci: buang karakter khusus grammar PostgREST (.or) agar aman disisipkan.
  const needle = (q ?? '').trim().replace(/[,()*:%\\]/g, ' ').trim();

  // Daftar periode untuk dropdown filter (terbaru dulu). Filter periode = penyaringan TAMPILAN
  // by rentang tanggal periode (created_at ∈ [start_date, end_date]) — log tetap lengkap lintas
  // waktu (tak dihapus); ini hanya membatasi yang ditampilkan agar "periode baru = log terlihat fresh".
  const { data: periods } = await supabase
    .from('periods').select('id, label, start_date, end_date').order('start_date', { ascending: false });
  const periodParam = period ?? 'all';
  const selPeriod = periodParam !== 'all' ? (periods ?? []).find((p) => p.id === periodParam) ?? null : null;

  let query = supabase
    .from('hrd_audit_log')
    .select('id, actor_name, action, category, summary, target_label, created_at', { count: 'exact' });
  if (category !== 'all') query = query.eq('category', category);
  if (selPeriod?.start_date && selPeriod?.end_date) {
    query = query.gte('created_at', selPeriod.start_date).lt('created_at', nextDay(selPeriod.end_date));
  }
  if (needle) {
    query = query.or(
      `summary.ilike.*${needle}*,actor_name.ilike.*${needle}*,target_label.ilike.*${needle}*,action.ilike.*${needle}*`,
    );
  }
  const { data, count } = await query
    .order('created_at', { ascending: false })
    .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);

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
      <AuditClient
        rows={rows}
        page={page}
        pageSize={PAGE_SIZE}
        total={count ?? 0}
        cat={category}
        q={q ?? ''}
        period={periodParam}
        periods={(periods ?? []).map((p) => ({ id: p.id, label: p.label }))}
      />
    </main>
  );
}
