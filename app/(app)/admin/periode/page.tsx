import { redirect } from 'next/navigation';
import Link from 'next/link';
import { CalendarRange, ListChecks } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { canSection } from '@/lib/auth/roles';
import { PeriodForm } from './period-form';
import { PeriodActions } from './period-actions';
import { KpiStandardEditor } from './kpi-standard-editor';
import { DeadlineEditor } from './deadline-editor';
import { ReadinessPanel } from './readiness-panel';
import { CycleStatus } from './cycle-status';
import { EmptyState } from '@/components/empty-state';
import { Panel, PanelLabel } from '@/components/panel';
import { StatusChip } from '@/components/status-chip';
import { TabBar, Tab } from '@/components/tab-nav';

/**
 * Kelola Siklus Periode (HRD). Buat/aktivasi/kunci periode + toggle 360.
 * Periode aktif menggerakkan semua fitur lain; "Kunci & Akhiri" menghentikan input.
 *
 * Dua sub-tab (`?tab=`): 'periode' (default) = form + kesiapan + ringkasan siklus + daftar
 * periode; 'siklus' = rincian 10 langkah. Rincian dipisah ke tab agar halaman utama tak
 * memanjang — pengganti kartu Beranda yang dihapus (2026-08).
 */
export default async function PeriodePage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab: tabParam } = await searchParams;
  const tab = tabParam === 'siklus' ? 'siklus' : 'periode';
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: me } = await supabase.from('employees').select('role, is_hrd_admin, hrd_sections').eq('id', user.id).maybeSingle();
  if (!canSection(me, 'periode')) {
    return <Shell><p className="text-sm text-ink-soft">Halaman ini hanya untuk HRD Admin.</p>
      <Link href="/" className="text-xs text-brand-ink hover:underline mt-3 inline-block">← Beranda</Link></Shell>;
  }

  const { data: periods } = await supabase
    .from('periods').select('id, code, label, start_date, end_date, status, has_360, form_open, mapping_published, kpi_standard, assessment_deadline').order('start_date', { ascending: false });
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

      <div className="mb-5">
        <TabBar>
          <Tab href="/admin/periode" active={tab === 'periode'} icon={CalendarRange}>Kelola Periode</Tab>
          <Tab href="/admin/periode?tab=siklus" active={tab === 'siklus'} icon={ListChecks}>Status Siklus</Tab>
        </TabBar>
      </div>

      {/* Sub-tab "Status Siklus": rincian 10 langkah (pindahan kartu Beranda yang dihapus). */}
      {tab === 'siklus' ? (
        <CycleStatus variant="full" />
      ) : (
      <>
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

      {/* Ringkasan siklus DIHAPUS dari tab ini (2026-09-01, permintaan pengguna): ia mengulang
          informasi ReadinessPanel di atasnya dan mendorong daftar periode — pekerjaan utama
          halaman ini — turun dari layar. Rinciannya tetap ada di sub-tab "Status Siklus". */}

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
      <table className="w-full text-left min-w-[780px]">
        <thead>
          <tr className="text-[11px] uppercase tracking-[0.05em] text-ink-faint border-b border-line">
            <th className="pb-3 pr-3 font-semibold">Periode</th>
            <th className="pb-3 px-3 font-semibold">Rentang</th>
            <th className="pb-3 px-3 text-center font-semibold">360°</th>
            <th className="pb-3 px-3 text-center font-semibold">Deadline 360°</th>
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
              <td className="py-4 px-3"><DateRange start={p.start_date} end={p.end_date} /></td>
              <td className="py-4 px-3 text-center text-[13px]">
                {p.has_360
                  ? <span className="font-medium text-brand-ink">Aktif</span>
                  : <span className="text-ink-faint">Tanpa</span>}
              </td>
              <td className="py-4 px-3 text-center">
                {p.has_360
                  ? <DeadlineEditor periodId={p.id} value={p.assessment_deadline} />
                  : <span className="text-ink-faint">—</span>}
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
                <PeriodActions periodId={p.id} status={p.status} has360={p.has_360} formOpen={p.form_open} mappingPublished={p.mapping_published} />
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
      </>
      )}
    </Shell>
  );
}

const ID_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

/** Pecah 'YYYY-MM-DD' tanpa objek Date (hindari geser zona waktu). null bila format tak terduga. */
function parseYmd(s: string | null): { y: number; m: number; d: number } | null {
  const parts = (s ?? '').split('-').map(Number);
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return null;
  const [y, m, d] = parts;
  if (m < 1 || m > 12) return null;
  return { y, m, d };
}

/**
 * Rentang tanggal periode dalam bahasa manusia + strip bulan yang tercakup.
 * Menggantikan "2026-01-01 → 2026-03-31" yang datar & sulit dibaca sekilas.
 */
function DateRange({ start, end }: { start: string | null; end: string | null }) {
  const a = parseYmd(start), b = parseYmd(end);
  if (!a || !b) return <span className="text-[13px] data-value text-ink-soft">{start} → {end}</span>;

  // Tahun ditulis sekali bila sama (mis. "1 Jan – 31 Mar 2026").
  const left = `${a.d} ${ID_MONTHS[a.m - 1]}${a.y !== b.y ? ` ${a.y}` : ''}`;
  const right = `${b.d} ${ID_MONTHS[b.m - 1]} ${b.y}`;

  // Chip bulan yang dilalui (dibatasi 12 agar rentang aneh tak meledakkan baris).
  const chips: { key: string; label: string }[] = [];
  for (let y = a.y, m = a.m; (y < b.y || (y === b.y && m <= b.m)) && chips.length < 12; ) {
    chips.push({ key: `${y}-${m}`, label: ID_MONTHS[m - 1] });
    m += 1; if (m > 12) { m = 1; y += 1; }
  }

  return (
    <div className="min-w-0">
      <span className="block text-[13px] data-value text-ink whitespace-nowrap">{left} – {right}</span>
      <span className="mt-1 flex flex-wrap gap-1">
        {chips.map((c) => (
          <span key={c.key} className="text-[10px] font-semibold text-ink-soft bg-neutral-tint border border-line rounded-control px-1.5 py-0.5">
            {c.label}
          </span>
        ))}
      </span>
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <main className="w-full min-h-full bg-bg px-5 py-7 lg:px-6">{children}</main>;
}
