import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import Link from 'next/link';
import { Sprout, Users } from 'lucide-react';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { TabBar, Tab } from '@/components/tab-nav';
import { StatusChip } from '@/components/status-chip';
import { colPercents } from '@/lib/table-cols';
import {
  canActAsSupervisor, ownerCanEdit, ownerCanWithdraw, inAdminView, planStatusLabel, planTitle, PLAN_STATUS_TONE, SUPERVISOR_KIND_LABEL,
  type HrdMode, type PlanItem, type PlanActor,
} from '@/lib/dev-plan';
import { finalizedPeriods, loadPlan, loadSupervisorResolver, loadPlanPeople } from '@/lib/dev-plan-server';
import { PlanCommentsView, PlanHeader, PlanItemsView, PlanSignatures, RevisionNotice } from './plan-view';
import { PlanEditor } from './plan-editor';
import { PeriodPicker } from './period-picker';
import { WithdrawButton } from './withdraw-button';
import { SessionsSection } from './sessions-section';
import { sessionsPanelData } from './sessions-data';

type SB = Awaited<ReturnType<typeof createClient>>;

/**
 * Rencana Pengembangan (migrasi 0055, Tahap 1). Dua tab (`?tab=saya|tim`):
 *   Rencana Saya — isi rencana per periode LAPORAN Final (laporan Q3 → Rencana Q4), kirim ke atasan, lihat komentar
 *                  & persetujuan.
 *   Tim Saya     — rencana anggota yang Anda bimbing (Koordinator/SPV/HRD Mode SPV/Direksi) atau hanya Anda lihat
 *                  (SPV dari pegawai berkoordinator). Tab tampil bila ada anggota.
 * Semua baca via service_role SETELAH cek pemilik/atasan (lib/dev-plan.ts); tulis lewat ./actions.ts.
 */
export default async function PengembanganPage({ searchParams }: { searchParams: Promise<{ tab?: string; period?: string }> }) {
  const { tab: tabParam, period: periodParam } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: me } = await supabase.from('employees')
    .select('role, is_hrd_admin, is_coordinator, hrd_sections, name').eq('id', user.id).maybeSingle();
  const jar = await cookies();
  const mode: HrdMode = jar.get('hrd_mode')?.value === 'admin' ? 'admin' : 'spv';
  const actor = { id: user.id, ...(me ?? {}) };
  // Pemisahan mode: halaman ini milik mode posisi asli. Di Mode Admin HRD memakai Pantauan.
  if (inAdminView(actor, mode)) redirect('/admin/pengembangan');
  const admin = createAdminClient() as unknown as SB;

  const probe = await loadPlan(admin, user.id, '00000000-0000-0000-0000-000000000000');
  if (probe.missing) {
    return <Shell><p className="text-sm text-ink-soft">Fitur Rencana Pengembangan belum aktif.</p></Shell>;
  }

  const [people, resolve] = await Promise.all([loadPlanPeople(admin), loadSupervisorResolver(admin)]);
  const team = people
    .filter((p) => p.id !== user.id)
    .map((p) => {
      const info = resolve(p);
      const act = canActAsSupervisor(info, actor, p.id, mode) && info.kind !== 'hrd'; // fallback HRD → halaman pantauan
      return { ...p, info, act, view: info.viewerIds.includes(user.id) };
    })
    .filter((p) => p.act || p.view);
  const tab = tabParam === 'tim' && team.length ? 'tim' : 'saya';

  return (
    <Shell>
      <TabBar>
        <Tab href="/pengembangan?tab=saya" active={tab === 'saya'} icon={Sprout}>Rencana Saya</Tab>
        {team.length > 0 && <Tab href="/pengembangan?tab=tim" active={tab === 'tim'} icon={Users}>Tim Saya</Tab>}
      </TabBar>
      <div className="pt-5">
        {tab === 'saya'
          ? await MyPlan({ admin, userId: user.id, role: me?.role ?? null, name: me?.name ?? '', periodParam, resolve, people, actor, mode })
          : await TeamPlans({ admin, team, periodParam })}
      </div>
    </Shell>
  );
}

async function MyPlan({ admin, userId, role, name, periodParam, resolve, people, actor, mode }: {
  admin: SB; userId: string; role: string | null; name: string; periodParam?: string; actor: PlanActor; mode: HrdMode;
  resolve: Awaited<ReturnType<typeof loadSupervisorResolver>>; people: Awaited<ReturnType<typeof loadPlanPeople>>;
}) {
  const periods = await finalizedPeriods(admin, userId);
  if (!periods.length) {
    return <p className="text-sm text-ink-soft">Rencana Pengembangan bisa diisi setelah laporan Anda <strong>Final</strong>. Belum ada laporan Final.</p>;
  }
  const sel = periods.find((p) => p.id === periodParam) ?? periods[0];
  const { plan, items } = await loadPlan(admin, userId, sel.id);
  const closed = !!sel.dev_plan_closed_at;
  const status = plan?.status ?? null;
  const editable = !closed && ownerCanEdit(status, role);
  const info = resolve({ id: userId, role });
  const sessionsPanel = await sessionsPanelData(admin, { plan, items, ownerId: userId, ownerRole: role, info, actor, mode, closed });
  const nameById = new Map(people.map((p) => [p.id, p.name]));
  const supLabel = info.kind === 'none' ? null
    : info.ids.length ? `${info.ids.map((id) => nameById.get(id) ?? '—').join(', ')} (${SUPERVISOR_KIND_LABEL[info.kind]})`
    : SUPERVISOR_KIND_LABEL[info.kind];
  const plainItems: PlanItem[] = items.map(({ area, target, actions, due_text, companion, success_indicator }) =>
    ({ area, target, actions, due_text, companion, success_indicator }));

  return (
    <div className="space-y-4">
      <PeriodPicker periods={periods} selected={sel.id} base="/pengembangan?tab=saya" />
      <PlanHeader title={planTitle(sel.label)} sourceLabel={sel.label} status={status} ownerRole={role}
        due={sel.dev_plan_due} closed={closed} supervisorLabel={supLabel} />
      {role !== 'direksi' && (
        <p className="text-[12.5px] text-ink-soft">
          Isi setelah sesi empat mata dengan atasan. Prioritas 1 mengacu pada &quot;Prioritas utama&quot; di bagian Perlu
          Dikembangkan pada laporan Anda. Setelah dikirim, atasan memberi komentar lalu HRD menyetujui.
        </p>
      )}
      {plan && <RevisionNotice plan={plan} />}
      {plan && !closed && ownerCanWithdraw(status, role) && <WithdrawButton periodId={sel.id} />}
      {editable
        ? <PlanEditor periodId={sel.id} initialItems={plainItems} canSubmit={role !== 'direksi'} />
        : <PlanItemsView items={plainItems} />}
      {plan && <PlanCommentsView plan={plan} />}
      {plan && role !== 'direksi' && <PlanSignatures plan={plan} ownerName={name} />}
      {sessionsPanel && <SessionsSection {...sessionsPanel} />}
    </div>
  );
}

async function TeamPlans({ admin, team, periodParam }: {
  admin: SB; team: { id: string; name: string; dept: string | null; role: string | null; act: boolean }[]; periodParam?: string;
}) {
  const periods = await finalizedPeriods(admin);
  if (!periods.length) return <p className="text-sm text-ink-soft">Belum ada laporan Final.</p>;
  const sel = periods.find((p) => p.id === periodParam) ?? periods[0];
  const ids = team.map((t) => t.id);
  const [{ data: finals }, { data: plans }] = await Promise.all([
    admin.from('final_reports').select('employee_id').eq('period_id', sel.id).eq('status', 'finalized').in('employee_id', ids),
    admin.from('development_plans').select('employee_id, status').eq('source_period_id', sel.id).in('employee_id', ids),
  ]);
  const finalSet = new Set((finals ?? []).map((f) => f.employee_id));
  const statusBy = new Map((plans ?? []).map((p) => [p.employee_id, p.status]));
  const rows = team.filter((t) => finalSet.has(t.id)).sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="space-y-4">
      <PeriodPicker periods={periods} selected={sel.id} base="/pengembangan?tab=tim" />
      <p className="text-[12.5px] text-ink-soft">{planTitle(sel.label)} · dari laporan {sel.label}. Hanya pegawai yang laporannya sudah Final.</p>
      {rows.length === 0 ? (
        <p className="text-sm text-ink-soft">Belum ada anggota dengan laporan Final di periode ini.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full table-fixed table-1line text-left text-sm min-w-[640px]">
            <colgroup>{colPercents([220, 150, 150, 140, 90]).map((w, i) => <col key={i} style={{ width: w }} />)}</colgroup>
            <thead>
              <tr className="text-[10px] uppercase tracking-[0.05em] text-ink-faint font-semibold border-b border-line">
                <th className="py-2 pr-3">Pegawai</th><th className="py-2 px-3">Divisi</th><th className="py-2 px-3">Status</th>
                <th className="py-2 px-3">Peran Anda</th><th className="py-2 pl-3 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line-soft">
              {rows.map((r) => {
                const st = statusBy.get(r.id) ?? null;
                return (
                  <tr key={r.id}>
                    <td className="py-2.5 pr-3 font-semibold text-ink">{r.name}</td>
                    <td className="py-2.5 px-3 text-ink-soft">{r.dept ?? '—'}</td>
                    <td className="py-2.5 px-3"><StatusChip tone={PLAN_STATUS_TONE[st ?? 'none']}>{planStatusLabel(st, r.role)}</StatusChip></td>
                    <td className="py-2.5 px-3 text-ink-soft">{r.act ? 'Atasan' : 'Hanya melihat'}</td>
                    <td className="py-2.5 pl-3 text-right">
                      <Link href={`/pengembangan/${r.id}?period=${sel.id}`} className="text-xs font-bold text-brand-ink hover:underline">Buka</Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="w-full min-h-full bg-bg px-5 py-7 lg:px-6">
      <div className="mb-5">
        <h1 className="text-[22px] font-bold tracking-[-0.01em] text-ink">Rencana Pengembangan</h1>
        <p className="text-[13.5px] text-ink-soft mt-1">Rencana pengembangan individu setelah laporan Final, disepakati bersama atasan dan HRD.</p>
      </div>
      {children}
    </main>
  );
}
