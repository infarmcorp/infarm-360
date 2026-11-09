import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import Link from 'next/link';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { CheckCircle2, CircleDashed, Clock, FilePen, Hourglass, RotateCcw, Sprout, Users, type LucideIcon } from 'lucide-react';
import { CARD, CardTitle, PageTitle, StatCards, TABLE_HEAD, type StatTone } from '@/components/infarm-ui';
import { INFARM_PAGE } from '@/app/infarm-fonts';
import { StatusChip } from '@/components/status-chip';
import { colPercents } from '@/lib/table-cols';
import { formatDateWib } from '@/lib/datetime';
import {
  canHrdManage, planStatusLabel, planTitle, PLAN_STATUS_LABEL, PLAN_STATUS_TONE, SUPERVISOR_KIND_LABEL, type HrdMode,
} from '@/lib/dev-plan';
import { finalizedPeriods, loadPlan, loadSupervisorResolver, loadPlanPeople } from '@/lib/dev-plan-server';
import type { DevPlanStatus } from '@/lib/database.types';
import { PeriodPicker } from '@/app/(app)/pengembangan/period-picker';
import { WindowForm } from './window-form';

type SB = Awaited<ReturnType<typeof createClient>>;

/** Kartu ringkasan per status (Design System Infarm): ikon + nada selaras PLAN_STATUS_TONE (netral → soil). */
const STATUS_CARD: Record<DevPlanStatus | 'none', { icon: LucideIcon; tone: StatTone }> = {
  none: { icon: CircleDashed, tone: 'soil' },
  draft: { icon: FilePen, tone: 'soil' },
  waiting_supervisor: { icon: Clock, tone: 'warn' },
  revision: { icon: RotateCcw, tone: 'danger' },
  waiting_hrd: { icon: Hourglass, tone: 'warn' },
  agreed: { icon: CheckCircle2, tone: 'brand' },
};

/**
 * Pantauan Rencana Pengembangan (migrasi 0055). HRD Mode Admin berbagian "Rencana Pengembangan" (+ atur batas &
 * tutup/buka rencana per periode laporan) dan Direksi (hanya baca). Satu baris per pegawai yang laporannya Final
 * di periode terpilih: atasan, status, jumlah prioritas, terakhir diperbarui. Keterlambatan tidak dicatat.
 */
export default async function PantauanRencanaPage({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  const { period: periodParam } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: me } = await supabase.from('employees').select('role, is_hrd_admin, hrd_sections').eq('id', user.id).maybeSingle();
  const jar = await cookies();
  const mode: HrdMode = jar.get('hrd_mode')?.value === 'admin' ? 'admin' : 'spv';
  const manage = canHrdManage(me ? { id: user.id, ...me } : null, mode);
  if (!manage && me?.role !== 'direksi') {
    return <Shell><div className={CARD}><p className="text-[13px] text-ink-soft">Halaman ini untuk HRD (Mode Admin) dan Direksi.</p></div></Shell>;
  }
  const admin = createAdminClient() as unknown as SB;
  if ((await loadPlan(admin, user.id, '00000000-0000-0000-0000-000000000000')).missing) {
    return <Shell><div className={CARD}><p className="text-[13px] text-ink-soft">Fitur Rencana Pengembangan belum aktif.</p></div></Shell>;
  }

  const periods = await finalizedPeriods(admin);
  if (!periods.length) return <Shell><div className={CARD}><p className="text-[13px] text-ink-soft">Belum ada laporan Final.</p></div></Shell>;
  const sel = periods.find((p) => p.id === periodParam) ?? periods[0];

  const [people, resolve, { data: finals }, { data: plans }] = await Promise.all([
    loadPlanPeople(admin),
    loadSupervisorResolver(admin),
    admin.from('final_reports').select('employee_id').eq('period_id', sel.id).eq('status', 'finalized'),
    admin.from('development_plans').select('id, employee_id, status, updated_at').eq('source_period_id', sel.id),
  ]);
  const finalSet = new Set((finals ?? []).map((f) => f.employee_id));
  const planBy = new Map((plans ?? []).map((p) => [p.employee_id, p]));
  const planIds = (plans ?? []).map((p) => p.id);
  const { data: itemRows } = planIds.length
    ? await admin.from('development_plan_items').select('plan_id').in('plan_id', planIds)
    : { data: [] as { plan_id: string }[] };
  // Catatan sesi (0056): jumlah & tanggal terakhir per jenis — informasi saja, tanpa penanda terlambat.
  const { data: sessRows } = planIds.length
    ? await admin.from('development_plan_sessions').select('plan_id, kind, session_date').in('plan_id', planIds)
    : { data: [] as { plan_id: string; kind: string; session_date: string }[] };
  const sessBy = new Map<string, { n: number; last: string }>();
  for (const r of sessRows ?? []) {
    const k = `${r.plan_id}|${r.kind}`;
    const cur = sessBy.get(k);
    sessBy.set(k, { n: (cur?.n ?? 0) + 1, last: !cur || r.session_date > cur.last ? r.session_date : cur.last });
  }
  const sessLabel = (planId: string | undefined, kind: string) => {
    const v = planId ? sessBy.get(`${planId}|${kind}`) : undefined;
    return v ? `${v.n} · ${formatDateWib(v.last)}` : '—';
  };
  const itemCount = new Map<string, number>();
  for (const r of itemRows ?? []) itemCount.set(r.plan_id, (itemCount.get(r.plan_id) ?? 0) + 1);
  const nameById = new Map(people.map((p) => [p.id, p.name]));

  // Pegawai yang sudah keluar tampil HANYA bila sudah punya rencana (bisa dibuka, lihat saja) — tidak dihitung
  // sebagai "belum mengisi".
  const rows = people.filter((p) => finalSet.has(p.id) && (p.is_active || planBy.has(p.id))).map((p) => {
    const info = resolve(p);
    const plan = planBy.get(p.id);
    return {
      ...p, plan,
      status: (plan?.status ?? null) as DevPlanStatus | null,
      supervisor: info.kind === 'none' ? '—'
        : info.ids.length ? `${info.ids.map((id) => nameById.get(id) ?? '—').join(', ')} (${SUPERVISOR_KIND_LABEL[info.kind]})`
        : SUPERVISOR_KIND_LABEL[info.kind],
      items: plan ? itemCount.get(plan.id) ?? 0 : 0,
      oneOnOne: sessLabel(plan?.id, 'one_on_one'),
      hrdReview: sessLabel(plan?.id, 'hrd_monthly'),
    };
  }).sort((a, b) => (a.dept ?? '').localeCompare(b.dept ?? '') || a.name.localeCompare(b.name));

  const counts = new Map<string, number>();
  for (const r of rows) {
    const k = r.status ?? 'none';
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const closed = !!sel.dev_plan_closed_at;

  return (
    <Shell>
      <div className="space-y-4">
        <PeriodPicker periods={periods} selected={sel.id} base="/admin/pengembangan" />
        <div className={CARD}>
          <CardTitle icon={Sprout}>{planTitle(sel.label)} · dari laporan {sel.label}</CardTitle>
          <p className="text-[13px] text-ink-soft mt-1.5">
            {sel.dev_plan_due ? <>Batas rencana disepakati: <span className="font-mono">{formatDateWib(sel.dev_plan_due)}</span></> : 'Batas rencana disepakati belum ditetapkan.'}
            {' '}· Rencana periode ini <strong className="text-ink">{closed ? 'sudah ditutup' : 'terbuka'}</strong>.
          </p>
          {manage && <div className="mt-4 pt-4 border-t border-line-soft"><WindowForm key={sel.id} periodId={sel.id} title={planTitle(sel.label)} due={sel.dev_plan_due} closed={closed} /></div>}
        </div>

        {/* Ringkasan status = kartu terpisah berikon (nada selaras chip status). */}
        <StatCards items={(['none', 'draft', 'waiting_supervisor', 'revision', 'waiting_hrd', 'agreed'] as const).map((k) => ({
          value: String(counts.get(k) ?? 0), label: PLAN_STATUS_LABEL[k], icon: STATUS_CARD[k].icon, tone: STATUS_CARD[k].tone,
        }))} />

        <div className={CARD}>
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <CardTitle icon={Users}>Rencana per Pegawai</CardTitle>
            <span className="text-xs text-ink-soft font-mono">{rows.length} pegawai</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full table-fixed table-1line text-left text-[13px] min-w-[1060px]">
              <colgroup>{colPercents([190, 110, 200, 130, 70, 120, 120, 100, 60]).map((w, i) => <col key={i} style={{ width: w }} />)}</colgroup>
              <thead>
                <tr className={TABLE_HEAD}>
                  <th className="py-2.5 px-3 rounded-l-lg">Pegawai</th><th className="py-2.5 px-3">Divisi</th><th className="py-2.5 px-3">Atasan</th>
                  <th className="py-2.5 px-3">Status</th><th className="py-2.5 px-3 text-right">Prioritas</th>
                  <th className="py-2.5 px-3">Sesi 1-on-1</th><th className="py-2.5 px-3">Tinjauan HRD</th>
                  <th className="py-2.5 px-3">Diperbarui</th><th className="py-2.5 px-3 text-right rounded-r-lg">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line-soft">
                {rows.map((r) => (
                  <tr key={r.id} className="hover:bg-infarm-surface/60">
                    <td className="py-2.5 px-3 font-semibold text-ink" title={r.name}>
                      {r.name}
                      {!r.is_active && <span className="ml-1.5 align-middle text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-neutral-tint text-ink-soft" title="Pegawai nonaktif — rencana hanya dapat dilihat">nonaktif</span>}
                    </td>
                    <td className="py-2.5 px-3 text-ink-soft">{r.dept ?? '—'}</td>
                    <td className="py-2.5 px-3 text-ink-soft" title={r.supervisor}>{r.supervisor}</td>
                    <td className="py-2.5 px-3"><StatusChip tone={PLAN_STATUS_TONE[r.status ?? 'none']}>{planStatusLabel(r.status, r.role)}</StatusChip></td>
                    <td className="py-2.5 px-3 text-right font-mono">{r.items}</td>
                    <td className="py-2.5 px-3 text-xs text-ink-soft font-mono">{r.oneOnOne}</td>
                    <td className="py-2.5 px-3 text-xs text-ink-soft font-mono">{r.hrdReview}</td>
                    <td className="py-2.5 px-3 text-xs text-ink-soft font-mono">{r.plan ? formatDateWib(r.plan.updated_at) : '—'}</td>
                    <td className="py-2.5 px-3 text-right">
                      <Link href={`/pengembangan/${r.id}?period=${sel.id}&from=admin`} className="text-xs font-bold text-brand-ink hover:underline">Buka</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className={`${INFARM_PAGE} w-full min-h-full px-5 py-7 lg:px-7`}>
      <PageTitle title="Pantauan Rencana Pengembangan">Status rencana pengembangan per pegawai setelah laporan Final.</PageTitle>
      {children}
    </main>
  );
}
