import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { finalScoreOf } from '@/lib/scoring';
import { PlanForm } from './plan-form';
import { RespondForm } from './respond-form';

/**
 * Promosi & Suksesi. HRD: ajukan rencana per pegawai (berbasis Skor Akhir periode aktif).
 * Direksi: setujui/tolak yang diajukan. Pegawai tidak melihat (RLS succ_read = HRD/Direksi).
 */
const STATUS_BADGE: Record<string, { t: string; c: string }> = {
  draft: { t: 'Draf', c: 'bg-gray-100 text-gray-600' },
  submitted: { t: 'Diajukan', c: 'bg-amber-100 text-amber-800' },
  approved: { t: 'Disetujui', c: 'bg-emerald-100 text-emerald-800' },
  rejected: { t: 'Ditolak', c: 'bg-rose-100 text-rose-700' },
};

export default async function SuksesiPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: me } = await supabase.from('employees').select('role').eq('id', user.id).maybeSingle();
  const role = me?.role;
  if (role !== 'hrd' && role !== 'direksi') {
    return <Shell><p className="text-sm text-gray-600">Halaman ini untuk HRD / Direksi.</p></Shell>;
  }

  const { data: ap } = await supabase.from('periods').select('id, label, has_360').eq('status', 'active').limit(1).maybeSingle();
  if (!ap) return <Shell><Header /><p className="text-sm text-gray-500 mt-4">Tidak ada periode aktif.</p></Shell>;

  const { data: plans } = await supabase
    .from('succession_plans')
    .select('id, employee_id, plan, justification, status, direksi_comment')
    .eq('period_id', ap.id);
  const planBy = new Map((plans ?? []).map((p) => [p.employee_id, p]));

  return role === 'hrd'
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
  const { data: emps } = await supabase.from('employees').select('id, name, dept').neq('role', 'direksi');
  const employees = emps ?? [];

  const { data: months } = await supabase.from('period_months').select('ym').eq('period_id', period.id);
  const ymList = (months ?? []).map((m) => m.ym);
  const { data: kpiRows } = ymList.length
    ? await supabase.from('kpi_scores').select('employee_id, score').in('ym', ymList) : { data: [] };
  const kpiAgg = new Map<string, { sum: number; n: number }>();
  (kpiRows ?? []).forEach((r) => { const a = kpiAgg.get(r.employee_id) ?? { sum: 0, n: 0 }; a.sum += r.score; a.n += 1; kpiAgg.set(r.employee_id, a); });
  const { data: r360 } = await supabase.from('result_360').select('employee_id, score').eq('period_id', period.id);
  const s360By = new Map((r360 ?? []).map((r) => [r.employee_id, r.score]));
  const { data: pen } = await supabase.from('compliance_penalties').select('employee_id, points').eq('period_id', period.id);
  const penBy = new Map((pen ?? []).map((p) => [p.employee_id, p.points]));

  const rows = employees.map((e) => {
    const agg = kpiAgg.get(e.id);
    const kpiAvg = agg ? agg.sum / agg.n : null;
    const final = finalScoreOf(kpiAvg, s360By.get(e.id) ?? null, period.has_360, penBy.get(e.id) ?? 0);
    return { ...e, final, plan: planBy.get(e.id) ?? null };
  }).sort((a, b) => (b.final ?? -1) - (a.final ?? -1));

  return (
    <Shell>
      <Header />
      <p className="text-[11px] text-gray-500 mt-1 mb-4">
        Periode aktif: {period.label}. Pertimbangkan kandidat (umumnya Skor Akhir ≥ 90), ajukan rencana ke Direksi.
      </p>
      <div className="space-y-3">
        {rows.map((r) => {
          const badge = r.plan ? STATUS_BADGE[r.plan.status] : null;
          return (
            <div key={r.id} className="border border-gray-200 rounded-xl p-3 grid md:grid-cols-[1fr_1.6fr] gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-gray-800 text-sm">{r.name}</span>
                  {r.final != null && r.final >= 90 && <span className="text-[10px] font-bold bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded-full">Kandidat</span>}
                </div>
                <div className="text-[11px] text-gray-500">{r.dept}</div>
                <div className="mt-1 text-xs">Skor Akhir: <span className="font-mono font-black text-slate-800">{r.final != null ? r.final.toFixed(1) : '—'}</span></div>
                {badge && <span className={`inline-block mt-1.5 text-[10px] font-bold px-2 py-0.5 rounded-full ${badge.c}`}>{badge.t}</span>}
                {r.plan?.direksi_comment && <p className="mt-1 text-[10px] text-gray-500 italic">Direksi: “{r.plan.direksi_comment}”</p>}
              </div>
              <PlanForm
                employeeId={r.id}
                planId={r.plan?.id ?? null}
                currentPlan={r.plan?.plan ?? ''}
                currentJust={r.plan?.justification ?? ''}
                status={r.plan?.status ?? null}
              />
            </div>
          );
        })}
      </div>
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
      <h2 className="text-sm font-bold text-gray-700 mt-4 mb-2">Menunggu Keputusan ({pending.length})</h2>
      {pending.length === 0 ? (
        <p className="text-sm text-gray-500">Tidak ada rencana yang menunggu persetujuan.</p>
      ) : (
        <div className="space-y-3">
          {pending.map((p) => {
            const e = empBy.get(p.employee_id);
            return (
              <div key={p.id} className="border border-amber-200 bg-amber-50/40 rounded-xl p-3 grid md:grid-cols-[1fr_1.4fr] gap-3">
                <div>
                  <span className="font-bold text-gray-800 text-sm block">{e?.name ?? '—'}</span>
                  <span className="text-[11px] text-gray-500">{e?.dept}</span>
                  <p className="mt-1.5 text-xs font-semibold text-gray-700">{p.plan}</p>
                  {p.justification && <p className="mt-1 text-[11px] text-gray-500">{p.justification}</p>}
                </div>
                <RespondForm planId={p.id} />
              </div>
            );
          })}
        </div>
      )}

      {decided.length > 0 && (
        <>
          <h2 className="text-sm font-bold text-gray-700 mt-6 mb-2">Riwayat Keputusan ({decided.length})</h2>
          <div className="space-y-2">
            {decided.map((p) => {
              const e = empBy.get(p.employee_id);
              const badge = STATUS_BADGE[p.status];
              return (
                <div key={p.id} className="border border-gray-200 rounded-xl p-3 flex items-start justify-between gap-3">
                  <div>
                    <span className="font-bold text-gray-800 text-sm">{e?.name ?? '—'}</span>
                    <span className="text-[11px] text-gray-500"> · {e?.dept}</span>
                    <p className="text-xs text-gray-600 mt-0.5">{p.plan}</p>
                    {p.direksi_comment && <p className="text-[10px] text-gray-500 italic mt-0.5">Komentar: “{p.direksi_comment}”</p>}
                  </div>
                  <span className={`shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full ${badge.c}`}>{badge.t}</span>
                </div>
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
      <h1 className="text-xl font-bold text-gray-800">Promosi &amp; Suksesi</h1>
      <p className="text-sm text-gray-500">Pengajuan rencana karier (HRD) &amp; persetujuan eksekutif (Direksi).</p>
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="w-full p-4 sm:p-5 lg:p-6">
      <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">{children}</div>
    </main>
  );
}
