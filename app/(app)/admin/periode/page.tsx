import { redirect } from 'next/navigation';
import { CalendarPlus, CalendarRange, CalendarX, ListChecks } from 'lucide-react';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { isBackfilledPeriod } from '@/lib/backfill-guard';
import { canSection } from '@/lib/auth/roles';
import { PeriodForm } from './period-form';
import { PeriodActions } from './period-actions';
import { KpiStandardEditor } from './kpi-standard-editor';
import { DeadlineEditor } from './deadline-editor';
import { ReadinessPanel } from './readiness-panel';
import { CycleStatus } from './cycle-status';
import { EmptyState } from '@/components/empty-state';
import { StatusChip } from '@/components/status-chip';
import { CARD, CardTitle, Note, PageTitle, TABLE_HEAD } from '@/components/infarm-ui';
import { TabBar, Tab, TabPanel } from '@/components/tab-nav';
import { INFARM_PAGE } from '@/app/infarm-fonts';

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
    return <Shell><div className={CARD}><p className="text-[13px] text-ink-soft">Halaman ini hanya untuk HRD Admin.</p></div></Shell>;
  }

  const { data: periods } = await supabase
    .from('periods').select('id, code, label, start_date, end_date, status, has_360, form_open, mapping_published, kpi_standard, assessment_deadline').order('start_date', { ascending: false });
  const list = periods ?? [];

  const { data: monthRows } = await supabase.from('period_months').select('period_id');
  const monthCount = new Map<string, number>();
  (monthRows ?? []).forEach((m) => monthCount.set(m.period_id, (monthCount.get(m.period_id) ?? 0) + 1));

  // Kesiapan peluncuran 360° untuk periode AKTIF (informatif, read-only).
  const active = list.find((p) => p.status === 'active') ?? null;
  let readiness: { indCount: number; mapCount: number; hasWeights: boolean; backfilled: boolean } | null = null;
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
    readiness = { indCount: ind.count ?? 0, mapCount: map.count ?? 0, hasWeights: !!wt.data, backfilled: await isBackfilledPeriod(createAdminClient(), active.id) };
  }

  return (
    <Shell>
      <PageTitle title="Kelola Siklus Periode">
        Aktivasi membuka pengisian; Kunci &amp; Akhiri menghentikannya.
      </PageTitle>

      <TabBar>
        <Tab href="/admin/periode" active={tab === 'periode'} icon={CalendarRange}>Kelola Periode</Tab>
        <Tab href="/admin/periode?tab=siklus" active={tab === 'siklus'} icon={ListChecks}>Status Siklus</Tab>
      </TabBar>
      <TabPanel>

      {/* Sub-tab "Status Siklus": rincian 10 langkah (pindahan kartu Beranda yang dihapus). */}
      {tab === 'siklus' ? (
        <CycleStatus variant="full" />
      ) : (
      <>
      <div className={`${CARD} mb-4`}>
        <CardTitle icon={CalendarPlus} className="mb-3">Buat Periode Baru</CardTitle>
        <PeriodForm />
      </div>

      {active && readiness && (
        <ReadinessPanel
          periodLabel={active.label}
          indCount={readiness.indCount}
          mapCount={readiness.mapCount}
          hasWeights={readiness.hasWeights}
          backfilled={readiness.backfilled}
          has360={active.has_360}
        />
      )}

      {/* Ringkasan siklus DIHAPUS dari tab ini (2026-09-01, permintaan pengguna): ia mengulang
          informasi ReadinessPanel di atasnya dan mendorong daftar periode — pekerjaan utama
          halaman ini — turun dari layar. Rinciannya tetap ada di sub-tab "Status Siklus". */}

      {list.length === 0 ? (
        <EmptyState
          icon={<CalendarX className="w-6 h-6" />}
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
      <div className={CARD}>
      <CardTitle icon={CalendarRange} className="mb-3">Daftar Periode <span className="data-value text-[12px] font-semibold text-ink-soft">· {list.length}</span></CardTitle>
      <div className="overflow-x-auto">
      <table className="w-full text-left text-[13px] min-w-[780px]">
        <thead>
          <tr className={`${TABLE_HEAD} border-b border-line`}>
            <th className="py-2.5 px-3 font-semibold">Periode</th>
            <th className="py-2.5 px-3 font-semibold">Rentang</th>
            <th className="py-2.5 px-3 text-center font-semibold">360°</th>
            <th className="py-2.5 px-3 text-center font-semibold">Deadline 360°</th>
            <th className="py-2.5 px-3 text-center font-semibold">Standar KPI</th>
            <th className="py-2.5 px-3 text-center font-semibold">Status</th>
            <th className="py-2.5 px-3 text-right font-semibold"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line-soft">
          {list.map((p) => (
            <tr key={p.id}>
              <td className="py-3 px-3">
                <span className="block text-[13px] font-bold text-ink">{p.label}</span>
                <span className="text-[12px] text-ink-soft data-value">{p.code} · {monthCount.get(p.id) ?? 0} bln</span>
              </td>
              <td className="py-3 px-3"><DateRange start={p.start_date} end={p.end_date} /></td>
              <td className="py-3 px-3 text-center">
                {p.has_360
                  ? <span className="inline-flex rounded-full px-2.5 py-0.5 text-[12px] font-semibold bg-brand-tint text-brand-ink">Aktif</span>
                  : <span className="inline-flex rounded-full px-2.5 py-0.5 text-[12px] font-semibold bg-neutral-tint text-ink-soft">Tanpa</span>}
              </td>
              <td className="py-3 px-3 text-center">
                {p.has_360
                  ? <DeadlineEditor periodId={p.id} value={p.assessment_deadline} />
                  : <span className="text-ink-soft">—</span>}
              </td>
              <td className="py-3 px-3 text-center">
                <KpiStandardEditor periodId={p.id} value={p.kpi_standard} />
              </td>
              <td className="py-3 px-3 text-center">
                {p.status === 'active'
                  ? <StatusChip tone="brand">Aktif</StatusChip>
                  : <StatusChip tone="neutral">Terkunci</StatusChip>}
              </td>
              <td className="py-3 px-3 text-right">
                <PeriodActions periodId={p.id} status={p.status} has360={p.has_360} formOpen={p.form_open} mappingPublished={p.mapping_published} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
      </div>
      )}
      <div className="mt-4"><Note>
        Hanya satu periode aktif pada satu waktu — mengaktivasi periode akan mengunci yang lain.
        Periode baru harus diisi pertanyaan &amp; pemetaan (kelola terpisah) sebelum penilaian.
      </Note></div>
      </>
      )}
      </TabPanel>
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
  if (!a || !b) return <span className="text-[13px] data-value text-ink-soft">{start} – {end}</span>;

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
          <span key={c.key} className="text-[10px] font-semibold text-ink-soft bg-neutral-tint rounded-full px-1.5 py-0.5">
            {c.label}
          </span>
        ))}
      </span>
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <main className={`${INFARM_PAGE} w-full min-h-full px-5 py-7 lg:px-7`}>{children}</main>;
}
