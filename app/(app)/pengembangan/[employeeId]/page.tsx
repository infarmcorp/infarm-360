import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import Link from 'next/link';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import {
  canActAsSupervisor, canHrdSign, canViewPlan, planTitle, SUPERVISOR_KIND_LABEL, type HrdMode, type PlanItem,
} from '@/lib/dev-plan';
import { finalizedPeriods, loadPlan, loadSupervisorResolver, loadPlanPeople } from '@/lib/dev-plan-server';
import { PlanCommentsView, PlanHeader, PlanItemsView, PlanSignatures, RevisionNotice } from '../plan-view';
import { SupervisorForm } from '../supervisor-form';
import { HrdBar } from '../hrd-bar';
import { PeriodPicker } from '../period-picker';
import { SessionsSection } from '../sessions-section';
import { sessionsPanelData } from '../sessions-data';

type SB = Awaited<ReturnType<typeof createClient>>;

/**
 * Detail Rencana Pengembangan satu pegawai — untuk atasan (komentar + Setujui / Minta Perbaikan), SPV-pengamat
 * (lihat), HRD Mode Admin (lihat; posisi HRD: Setujui (HRD) & Buka Kembali; juga atasan cadangan), Direksi (lihat;
 * atasan SPV). Pemilik diarahkan ke tab Rencana Saya. Baca via service_role SETELAH canViewPlan.
 */
export default async function PlanDetailPage({ params, searchParams }: {
  params: Promise<{ employeeId: string }>;
  searchParams: Promise<{ period?: string; from?: string }>;
}) {
  const { employeeId } = await params;
  const { period: periodParam, from } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  if (employeeId === user.id) redirect(`/pengembangan?tab=saya${periodParam ? `&period=${periodParam}` : ''}`);
  const { data: me } = await supabase.from('employees')
    .select('role, is_hrd_admin, is_coordinator, hrd_sections, name').eq('id', user.id).maybeSingle();
  const jar = await cookies();
  const mode: HrdMode = jar.get('hrd_mode')?.value === 'admin' ? 'admin' : 'spv';
  const actor = { id: user.id, ...(me ?? {}) };
  const admin = createAdminClient() as unknown as SB;
  const back = from === 'admin'
    ? { href: `/admin/pengembangan${periodParam ? `?period=${periodParam}` : ''}`, label: '← Pantauan Rencana Pengembangan' }
    : { href: `/pengembangan?tab=tim${periodParam ? `&period=${periodParam}` : ''}`, label: '← Tim Saya' };

  const [people, resolve] = await Promise.all([loadPlanPeople(admin), loadSupervisorResolver(admin)]);
  const emp = people.find((p) => p.id === employeeId);
  const info = emp ? resolve(emp) : null;
  if (!emp || !info || !canViewPlan(info, actor, emp.id, mode)) {
    return <Shell back={back}><p className="text-sm text-ink-soft">Rencana ini di luar akses Anda.</p></Shell>;
  }

  const periods = await finalizedPeriods(admin, emp.id);
  if (!periods.length) return <Shell back={back}><p className="text-sm text-ink-soft">Laporan {emp.name} belum ada yang Final.</p></Shell>;
  const sel = periods.find((p) => p.id === periodParam) ?? periods[0];
  const { plan, items } = await loadPlan(admin, emp.id, sel.id);
  const closed = !!sel.dev_plan_closed_at;
  const nameById = new Map(people.map((p) => [p.id, p.name]));
  const supLabel = info.kind === 'none' ? null
    : info.ids.length ? `${info.ids.map((id) => nameById.get(id) ?? '—').join(', ')} (${SUPERVISOR_KIND_LABEL[info.kind]})`
    : SUPERVISOR_KIND_LABEL[info.kind];
  const plainItems: PlanItem[] = items.map(({ area, target, actions, due_text, companion, success_indicator }) =>
    ({ area, target, actions, due_text, companion, success_indicator }));

  const supervises = canActAsSupervisor(info, actor, emp.id, mode);
  const hrd = canHrdSign(actor, mode);
  const isDireksiPlan = emp.role === 'direksi';
  const sessionsPanel = await sessionsPanelData(admin, { plan, items, ownerId: emp.id, ownerRole: emp.role, info, actor, mode, closed });

  return (
    <Shell back={back}>
      <p className="text-[13px] text-ink-soft mb-1"><strong className="text-ink">{emp.name}</strong> · {emp.dept ?? '—'}</p>
      <div className="space-y-4">
        <PeriodPicker periods={periods} selected={sel.id} base={`/pengembangan/${emp.id}?from=${from ?? ''}`} />
        <PlanHeader title={planTitle(sel.label)} sourceLabel={sel.label} status={plan?.status ?? null} ownerRole={emp.role}
          due={sel.dev_plan_due} closed={closed} supervisorLabel={supLabel} />
        {plan && <RevisionNotice plan={plan} />}
        {!plan ? <p className="text-sm text-ink-soft">Pegawai belum mengisi rencana.</p> : <PlanItemsView items={plainItems} />}
        {plan && !closed && hrd && !isDireksiPlan && (
          <HrdBar planId={plan.id} canApprove={plan.status === 'waiting_hrd'} canReopen={plan.status !== 'draft'} />
        )}
        {plan && !closed && supervises && plan.status === 'waiting_supervisor' ? (
          <SupervisorForm planId={plan.id} initial={{
            confirmation: plan.sup_confirmation ?? '', context: plan.sup_context ?? '',
            support: plan.sup_support ?? '', hope: plan.sup_hope ?? '',
          }} />
        ) : plan && <PlanCommentsView plan={plan} />}
        {plan && !isDireksiPlan && <PlanSignatures plan={plan} ownerName={emp.name} />}
        {sessionsPanel && <SessionsSection {...sessionsPanel} />}
      </div>
    </Shell>
  );
}

function Shell({ back, children }: { back: { href: string; label: string }; children: React.ReactNode }) {
  return (
    <main className="w-full min-h-full bg-bg px-5 py-7 lg:px-6">
      <Link href={back.href} className="text-xs text-ink-faint hover:text-ink-soft">{back.label}</Link>
      <h1 className="text-[22px] font-bold tracking-[-0.01em] text-ink mt-2 mb-4">Rencana Pengembangan</h1>
      {children}
    </main>
  );
}
