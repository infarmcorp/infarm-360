import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { fetchAllPaged } from '@/lib/supabase/paginate';
import { canSection } from '@/lib/auth/roles';
import { finalScoreOf, kpiAvgOf, displayedFinalOf } from '@/lib/scoring';
import { RespondForm } from './respond-form';
import { SuksesiList, type SuksesiRow } from './suksesi-list';
import { Panel } from '@/components/panel';

/**
 * Promosi & Suksesi. HRD: ajukan rencana per pegawai (berbasis Skor Akhir periode aktif).
 * Direksi: setujui/tolak yang diajukan. Pegawai tidak melihat (RLS succ_read = HRD/Direksi).
 */
const STATUS_BADGE: Record<string, { t: string; c: string }> = {
  draft: { t: 'Draf', c: 'bg-neutral-tint text-ink-soft' },
  submitted: { t: 'Diajukan', c: 'bg-warn-tint text-warn-ink' },
  approved: { t: 'Disetujui', c: 'bg-brand-tint text-brand-ink' },
  rejected: { t: 'Ditolak', c: 'bg-danger-tint text-danger-ink' },
};

export default async function SuksesiPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: me } = await supabase.from('employees').select('role, is_hrd_admin, hrd_sections').eq('id', user.id).maybeSingle();
  const role = me?.role;
  // HRD: butuh bagian 'suksesi' (akses granular Jalur A). Direksi selalu boleh (merespons).
  const admin = canSection(me, 'suksesi');
  if (!admin && role !== 'direksi') {
    return <Shell><p className="text-sm text-ink-soft">Halaman ini untuk HRD / Direksi.</p></Shell>;
  }

  const { data: ap } = await supabase.from('periods').select('id, label, has_360').eq('status', 'active').limit(1).maybeSingle();
  if (!ap) return <Shell><Header /><p className="text-sm text-ink-soft mt-4">Tidak ada periode aktif.</p></Shell>;

  const { data: plans } = await supabase
    .from('succession_plans')
    .select('id, employee_id, plan, justification, status, direksi_comment')
    .eq('period_id', ap.id);
  const planBy = new Map((plans ?? []).map((p) => [p.employee_id, p]));

  return admin
    ? <HrdView supabase={supabase} period={ap} planBy={planBy} />
    : <DireksiView supabase={supabase} plans={plans ?? []} />;
}

/** HRD: tabel pegawai + Skor Akhir + form rencana. */
async function HrdView({
  supabase, period, planBy,
}: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  period: { id: string; label: string; has_360: boolean };
  planBy: Map<string, { id: string; plan: string; justification: string | null; status: string; direksi_comment: string | null }>;
}) {
  const { data: emps } = await supabase.from('employees').select('id, name, dept').neq('role', 'direksi').eq('is_external', false).eq('is_active', true);
  const employees = emps ?? [];

  const { data: months } = await supabase.from('period_months').select('ym').eq('period_id', period.id);
  const ymList = (months ?? []).map((m) => m.ym);
  // kpi_scores semua pegawai (bulan periode) → bisa >1000; ambil penuh.
  const kpiRows = ymList.length
    ? await fetchAllPaged<{ employee_id: string; score: number }>((from, to) =>
        supabase.from('kpi_scores').select('employee_id, score').in('ym', ymList).order('employee_id').order('ym').range(from, to))
    : [];
  const kpiValsBy = new Map<string, number[]>();
  kpiRows.forEach((r) => kpiValsBy.set(r.employee_id, [...(kpiValsBy.get(r.employee_id) ?? []), Number(r.score)]));
  const { data: r360 } = await supabase.from('result_360').select('employee_id, score').eq('period_id', period.id);
  const s360By = new Map((r360 ?? []).map((r) => [r.employee_id, r.score]));
  // Laporan FINAL → Skor Akhir tersimpan (yang dilihat pegawai) — displayedFinalOf.
  const { data: reps } = await supabase.from('final_reports').select('employee_id, status, final_score').eq('period_id', period.id);
  const repBy = new Map((reps ?? []).map((r) => [r.employee_id, r]));

  const rows: SuksesiRow[] = employees.map((e) => {
    const kpiAvg = kpiAvgOf(kpiValsBy.get(e.id) ?? []);
    const live = finalScoreOf(kpiAvg, s360By.get(e.id) ?? null, period.has_360);
    const final = displayedFinalOf(live, repBy.get(e.id));
    return { id: e.id, name: e.name, dept: e.dept, final, plan: planBy.get(e.id) ?? null };
  }).sort((a, b) => (b.final ?? -1) - (a.final ?? -1));

  return (
    <Shell>
      <Header />
      <p className="text-[12px] text-ink-soft mt-1 mb-5">
        Periode aktif <span className="data-value font-semibold text-ink">{period.label}</span>. Pertimbangkan kandidat (umumnya Skor Akhir ≥ 90), ajukan rencana ke Direksi.
      </p>
      <Panel><SuksesiList rows={rows} /></Panel>
    </Shell>
  );
}

/** Direksi: rencana yang diajukan + riwayat keputusan. */
async function DireksiView({
  supabase, plans,
}: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  plans: { id: string; employee_id: string; plan: string; justification: string | null; status: string; direksi_comment: string | null }[];
}) {
  const ids = [...new Set(plans.map((p) => p.employee_id))];
  const { data: emps } = ids.length ? await supabase.from('employees').select('id, name, dept').in('id', ids) : { data: [] };
  const empBy = new Map((emps ?? []).map((e) => [e.id, e]));

  const pending = plans.filter((p) => p.status === 'submitted');
  const decided = plans.filter((p) => p.status === 'approved' || p.status === 'rejected');

  return (
    <Shell>
      <Header />
      <h2 className="text-sm font-bold text-ink mt-5 mb-2">Menunggu Keputusan ({pending.length})</h2>
      {pending.length === 0 ? (
        <p className="text-sm text-ink-soft">Tidak ada rencana yang menunggu persetujuan.</p>
      ) : (
        <div className="space-y-3">
          {pending.map((p) => {
            const e = empBy.get(p.employee_id);
            return (
              <div key={p.id} className="rounded-panel border border-warn-ink/25 bg-warn-tint/40 p-3 grid md:grid-cols-[1fr_1.4fr] gap-3">
                <div>
                  <span className="font-bold text-ink text-sm block">{e?.name ?? '—'}</span>
                  <span className="text-[11px] text-ink-faint">{e?.dept}</span>
                  <p className="mt-1.5 text-xs font-semibold text-ink-soft">{p.plan}</p>
                  {p.justification && <p className="mt-1 text-[11px] text-ink-faint">{p.justification}</p>}
                </div>
                <RespondForm planId={p.id} />
              </div>
            );
          })}
        </div>
      )}

      {decided.length > 0 && (
        <>
          <h2 className="text-sm font-bold text-ink mt-6 mb-2">Riwayat Keputusan ({decided.length})</h2>
          <div className="space-y-2">
            {decided.map((p) => {
              const e = empBy.get(p.employee_id);
              const badge = STATUS_BADGE[p.status];
              return (
                <Panel key={p.id} padded={false} className="p-3 flex items-start justify-between gap-3">
                  <div>
                    <span className="font-bold text-ink text-sm">{e?.name ?? '—'}</span>
                    <span className="text-[11px] text-ink-faint"> · {e?.dept}</span>
                    <p className="text-xs text-ink-soft mt-0.5">{p.plan}</p>
                    {p.direksi_comment && <p className="text-[10px] text-ink-faint italic mt-0.5">Komentar: “{p.direksi_comment}”</p>}
                  </div>
                  <span className={`shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full ${badge.c}`}>{badge.t}</span>
                </Panel>
              );
            })}
          </div>
        </>
      )}
    </Shell>
  );
}

function Header() {
  return (
    <div>
      <h1 className="text-[22px] font-bold tracking-[-0.01em] text-ink">Promosi &amp; Suksesi</h1>
      <p className="text-[13.5px] text-ink-soft mt-1">Pengajuan rencana karier (HRD) &amp; persetujuan eksekutif (Direksi).</p>
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <main className="w-full min-h-full bg-bg px-5 py-7 lg:px-6">{children}</main>;
}
