import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { canSection } from '@/lib/auth/roles';
import { PeriodForm } from './period-form';
import { PeriodActions } from './period-actions';
import { KpiStandardEditor } from './kpi-standard-editor';
import { ReadinessPanel } from './readiness-panel';
import { EmptyState } from '@/components/empty-state';
import { Panel, PanelLabel } from '@/components/panel';
import { StatusChip } from '@/components/status-chip';

/**
 * Kelola Siklus Periode (HRD). Buat/aktivasi/kunci periode + toggle 360.
 * Periode aktif menggerakkan semua fitur lain; "Kunci & Akhiri" menghentikan input.
 */
export default async function PeriodePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: me } = await supabase.from('employees').select('role, is_hrd_admin, hrd_sections').eq('id', user.id).maybeSingle();
  if (!canSection(me, 'periode')) {
    return <Shell><p className="text-sm text-ink-soft">Halaman ini hanya untuk HRD Admin.</p>
      <Link href="/" className="text-xs text-brand-ink hover:underline mt-3 inline-block">← Beranda</Link></Shell>;
  }

  const { data: periods } = await supabase
    .from('periods').select('id, code, label, start_date, end_date, status, has_360, form_open, kpi_standard').order('start_date', { ascending: false });
  const list = periods ?? [];

  const { data: monthRows } = await supabase.from('period_months').select('period_id');
  const monthCount = new Map<string, number>();
  (monthRows ?? []).forEach((m) => monthCount.set(m.period_id, (monthCount.get(m.period_id) ?? 0) + 1));

  // Kesiapan peluncuran 360° untuk periode AKTIF (informatif, read-only).
  const active = list.find((p) => p.status === 'active') ?? null;
  let readiness: { indCount: number; mapCount: number; hasWeights: boolean } | null = null;
  if (active) {
    const { data: aspects } = await supabase.from('culture_aspects').select('id').eq('period_id', active.id);
    const aspectIds = (aspects ?? []).map((a) => a.id);
    const [ind, map, wt] = await Promise.all([
      aspectIds.length
        ? supabase.from('indicators').select('*', { count: 'exact', head: true }).in('aspect_id', aspectIds).eq('is_active', true)
        : Promise.resolve({ count: 0 }),
      supabase.from('mappings').select('*', { count: 'exact', head: true }).eq('period_id', active.id).eq('is_active', true),
      supabase.from('weight_schemes').select('id').eq('period_id', active.id).eq('is_active', true).maybeSingle(),
    ]);
    readiness = { indCount: ind.count ?? 0, mapCount: map.count ?? 0, hasWeights: !!wt.data };
  }

  return (
    <Shell>
      <div className="flex items-start justify-between mb-7">
        <div>
          <h1 className="text-[22px] font-bold tracking-[-0.01em] text-ink">Kelola Siklus Periode</h1>
          <p className="text-[13.5px] text-ink-soft mt-1 max-w-xl">Aktivasi membuka pengisian; Kunci &amp; Akhiri menghentikannya.</p>
        </div>
        <Link href="/" className="text-[12.5px] text-ink-faint hover:text-ink-soft whitespace-nowrap mt-1">← Beranda</Link>
      </div>

      <Panel className="mb-5">
        <PanelLabel className="mb-[18px]">Buat Periode Baru</PanelLabel>
        <PeriodForm />
      </Panel>

      {active && readiness && (
        <ReadinessPanel
          periodLabel={active.label}
          indCount={readiness.indCount}
          mapCount={readiness.mapCount}
          hasWeights={readiness.hasWeights}
          has360={active.has_360}
        />
      )}

      {list.length === 0 ? (
        <EmptyState
          icon="🗓️"
          title="Belum ada periode"
          description="Periode (kuartal) adalah gerbang seluruh proses penilaian. Buat yang pertama lewat form di atas, lalu lengkapi langkah berikut sebelum penilaian dapat diisi."
          steps={[
            { text: <>Buat periode/kuartal pertama (form di atas)</> },
            { text: <>Susun <strong>Pertanyaan</strong> & atur <strong>Bobot Penilai</strong></> },
            { text: <>Atur <strong>Pemetaan</strong> penilai (siapa menilai siapa)</> },
            { text: <>Tekan <strong>Aktivasi</strong> — pengisian 360° & KPI terbuka</> },
          ]}
          note="Hanya satu periode aktif pada satu waktu."
        />
      ) : (
      <Panel>
      <div className="overflow-x-auto">
      <table className="w-full text-left min-w-[600px]">
        <thead>
          <tr className="text-[11px] uppercase tracking-[0.05em] text-ink-faint border-b border-line">
            <th className="pb-3 pr-3 font-semibold">Periode</th>
            <th className="pb-3 px-3 font-semibold">Rentang</th>
            <th className="pb-3 px-3 text-center font-semibold">360°</th>
            <th className="pb-3 px-3 text-center font-semibold">Standar KPI</th>
            <th className="pb-3 px-3 text-center font-semibold">Status</th>
            <th className="pb-3 pl-3 text-right font-semibold"></th>
          </tr>
        </thead>
        <tbody>
          {list.map((p) => (
            <tr key={p.id} className="border-b border-line-soft last:border-0">
              <td className="py-4 pr-3">
                <span className="block text-[14px] font-bold text-ink">{p.label}</span>
                <span className="text-[12px] text-ink-faint data-value">{p.code} · {monthCount.get(p.id) ?? 0} bln</span>
              </td>
              <td className="py-4 px-3 text-[13px] data-value text-ink-soft">{p.start_date} → {p.end_date}</td>
              <td className="py-4 px-3 text-center text-[13px]">
                {p.has_360
                  ? <span className="font-medium text-brand-ink">Aktif</span>
                  : <span className="text-ink-faint">Tanpa</span>}
              </td>
              <td className="py-4 px-3 text-center">
                <KpiStandardEditor periodId={p.id} value={p.kpi_standard} />
              </td>
              <td className="py-4 px-3 text-center">
                {p.status === 'active'
                  ? <StatusChip tone="brand">Aktif</StatusChip>
                  : <StatusChip tone="neutral">Terkunci</StatusChip>}
              </td>
              <td className="py-4 pl-3 text-right">
                <PeriodActions periodId={p.id} status={p.status} has360={p.has_360} formOpen={p.form_open} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
      </Panel>
      )}
      <p className="text-[12px] text-ink-faint mt-5">
        Hanya satu periode aktif pada satu waktu — mengaktivasi periode akan mengunci yang lain.
        Periode baru harus diisi pertanyaan &amp; pemetaan (kelola terpisah) sebelum penilaian.
      </p>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <main className="w-full min-h-full bg-bg px-5 py-7 lg:px-6">{children}</main>;
}
