import { redirect } from 'next/navigation';
import { CalendarDays, Clock, Flag, Inbox, ListChecks, Lock, MessageSquareReply, PenLine } from 'lucide-react';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { fetchAllByIds } from '@/lib/supabase/paginate';
import { EmptyState } from '@/components/empty-state';
import { StatusChip } from '@/components/status-chip';
import { CARD, CardTitle, Note, PageTitle } from '@/components/infarm-ui';
import { TabBar, Tab, TabPanel } from '@/components/tab-nav';
import { INFARM_PAGE } from '@/app/infarm-fonts';
import { formatDateWib, formatDateTimeWib } from '@/lib/datetime';
import {
  loadViolationPeriod, loadViolationCategories, loadMyViolationReports, sortViolations, violationCategoryLabel,
  VIOLATION_STATUS_LABEL, VIOLATION_STATUS_TONE,
} from '@/lib/outside-notes';
import { reporterRef } from '@/lib/violation-ref';
import { OutsideNoteButton } from './report-form';

/**
 * LAPORKAN PELANGGARAN (pegawai) — halaman sendiri sejak 0061 (pemilik 2026-11-16), dua tab:
 *  - Tulis Laporan: bisa dipakai selama HRD membuka saklarnya pada periode aktif, terlepas dari 360°/formulir.
 *    Kandidat = pegawai aktif selain diri, Direksi, dan eksternal — TERMASUK rekan di daftar penilaian pelapor
 *    (pemilik 2026-11-16: penilaian kinerja ≠ laporan kejadian); server menegakkan aturan yang sama.
 *  - Laporan Saya (0062): laporan milik pelapor, dicari lewat penanda tersembunyi `reporterRef(user.id)` di server,
 *    lengkap dengan status & tanggapan HRD. Selalu tersedia (tak bergantung saklar/periode). Penanda tak pernah
 *    dikirim ke klien. Laporan sebelum 0062 tak punya penanda → tak tampil (diterima pemilik).
 * Penilai eksternal tak bisa mengirim (pemilik 2026-11-03).
 */
export default async function LaporPelanggaranPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab: tabParam } = await searchParams;
  const tab = tabParam === 'saya' ? 'saya' : 'tulis';
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: me } = await supabase.from('employees').select('is_external').eq('id', user.id).maybeSingle();
  if (!me || me.is_external) {
    return (
      <Shell>
        <EmptyState icon={<Lock className="w-6 h-6" />} title="Fitur ini belum tersedia untuk akun Anda"
          description="Laporkan Pelanggaran saat ini hanya untuk pegawai internal." />
      </Shell>
    );
  }

  const ap = await loadViolationPeriod(supabase);
  const ref = reporterRef(user.id);
  const mine = ref
    ? sortViolations(await loadMyViolationReports(createAdminClient() as unknown as Parameters<typeof loadMyViolationReports>[0], ref))
    : [];
  const openCount = mine.filter((r) => r.status !== 'done').length;

  return (
    <Shell periodLabel={ap?.label}>
      <TabBar>
        <Tab href="/lapor-pelanggaran?tab=tulis" active={tab === 'tulis'} icon={PenLine}>Tulis Laporan</Tab>
        <Tab href="/lapor-pelanggaran?tab=saya" active={tab === 'saya'} icon={ListChecks}>
          Laporan Saya
          {mine.length ? (
            <span className={`ml-1 min-w-5 h-5 px-1.5 rounded-full text-[11px] font-mono font-semibold inline-flex items-center justify-center ${openCount ? 'bg-warn-tint text-warn-ink' : 'bg-neutral-tint text-ink-soft'}`}>{mine.length}</span>
          ) : null}
        </Tab>
      </TabBar>
      <TabPanel className="space-y-4">
        {tab === 'tulis'
          ? await WriteTab({ userId: user.id, period: ap })
          : await MineTab({ rows: mine, active: !!ref })}
      </TabPanel>
    </Shell>
  );
}

/** Tab Tulis Laporan (fungsi render biasa — bukan komponen di dalam komponen). */
async function WriteTab({ userId, period }: { userId: string; period: Awaited<ReturnType<typeof loadViolationPeriod>> }) {
  if (!period) {
    return (
      <EmptyState icon={<Clock className="w-6 h-6" />} title="Belum ada periode aktif"
        description="Laporan bisa dikirim setelah HRD membuka periode dan membuka Laporkan Pelanggaran." />
    );
  }
  if (!period.open) {
    return (
      <EmptyState icon={<Lock className="w-6 h-6" />} title="Laporkan Pelanggaran sedang ditutup"
        description={`HRD belum membuka pengiriman laporan untuk ${period.label}.`}
        note="Laporan yang sudah Anda kirim tetap bisa dilihat di tab Laporan Saya." />
    );
  }
  const supabase = await createClient();
  const [{ data: emps }, categories] = await Promise.all([
    supabase.from('employees').select('id, name, dept').neq('role', 'direksi').eq('is_external', false).eq('is_active', true),
    loadViolationCategories(supabase),
  ]);
  const candidates = (emps ?? [])
    .filter((e) => e.id !== userId)
    .map((e) => ({ id: e.id, name: e.name, dept: e.dept }))
    .sort((a, b) => a.name.localeCompare(b.name, 'id'));
  return (
    <>
      <section className={`${CARD} flex flex-col`}>
        <CardTitle icon={Flag}>Tulis Laporan</CardTitle>
        <p className="text-[13px] text-ink-soft mt-1.5 leading-relaxed">
          Ceritakan kejadian yang Anda alami atau lihat langsung terkait rekan yang dilaporkan, meskipun ia bukan rekan kerja langsung Anda.
        </p>
        <p className="text-xs text-ink-soft mt-1.5 leading-relaxed">
          Penilaian kinerja rekan tetap lewat formulir penilaian; laporan ini untuk kejadian pelanggaran.
        </p>
        <div className="pt-3 flex flex-wrap items-center gap-2">
          <OutsideNoteButton candidates={candidates} categories={categories} />
        </div>
      </section>
      <Note>
        Laporan tidak memengaruhi Skor 360° dan tidak bisa diubah atau dihapus setelah dikirim. Identitas Anda tidak
        ditampilkan kepada HRD. Pantau tindak lanjutnya di tab <strong>Laporan Saya</strong>.
      </Note>
    </>
  );
}

/** Tab Laporan Saya: laporan milik pelapor + status & tanggapan HRD. */
async function MineTab({ rows, active }: { rows: Awaited<ReturnType<typeof loadMyViolationReports>>; active: boolean }) {
  if (!active) {
    return (
      <EmptyState icon={<Inbox className="w-6 h-6" />} title="Laporan Saya belum aktif"
        description="Fitur ini sedang disiapkan. Hubungi admin aplikasi bila Anda perlu menanyakan laporan." />
    );
  }
  if (rows.length === 0) {
    return (
      <EmptyState icon={<Inbox className="w-6 h-6" />} title="Belum ada laporan"
        description="Laporan yang Anda kirim akan tampil di sini beserta status dan tanggapan HRD." />
    );
  }
  const admin = createAdminClient();
  const targetIds = [...new Set(rows.map((r) => r.target_id))];
  const periodIds = [...new Set(rows.map((r) => r.period_id))];
  const [emps, { data: periods }] = await Promise.all([
    fetchAllByIds<{ id: string; name: string; dept: string }>(targetIds, (chunk, from, to) =>
      admin.from('employees').select('id, name, dept').in('id', chunk).order('id').range(from, to)),
    admin.from('periods').select('id, label').in('id', periodIds),
  ]);
  const empById = new Map(emps.map((e) => [e.id, e]));
  const periodLabel = new Map((periods ?? []).map((p) => [p.id, p.label]));
  const noAspects = new Map<string, string>();
  return (
    <>
      <Note>
        Hanya Anda yang melihat daftar ini. HRD tidak melihat siapa pengirim laporan. Status dan tanggapan diisi HRD
        setelah laporan diperiksa.
      </Note>
      {rows.map((r) => {
        const e = empById.get(r.target_id);
        return (
          <article key={r.id} className={`${CARD} space-y-2.5`}>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[13px] font-bold text-ink">{e?.name ?? '—'}</span>
              <span className="text-xs text-ink-soft">{e?.dept ?? '—'} · {periodLabel.get(r.period_id) ?? '—'}</span>
              <span className="ml-auto"><StatusChip tone={VIOLATION_STATUS_TONE[r.status]}>{VIOLATION_STATUS_LABEL[r.status]}</StatusChip></span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1 text-xs text-ink bg-infarm-surface border border-brand-tint rounded-full px-2.5 py-0.5">
                <CalendarDays className="w-3 h-3 text-brand-ink" aria-hidden />
                Tanggal kejadian <span className="font-mono">{r.incident_date ? formatDateWib(r.incident_date) : '—'}</span>
              </span>
              <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${r.is_other ? 'bg-infarm-cream text-infarm-soil' : 'bg-brand-tint text-brand-ink'}`}>
                {violationCategoryLabel(r, noAspects)}
              </span>
            </div>
            <p className="text-[13px] leading-relaxed text-ink whitespace-pre-line">{r.body}</p>
            {r.note && (
              <div className="bg-neutral-tint rounded-xl px-3 py-2.5">
                <p className="text-xs font-bold text-ink-soft mb-0.5">Catatan Anda</p>
                <p className="text-[13px] leading-relaxed text-ink whitespace-pre-line">{r.note}</p>
              </div>
            )}
            <div className="border-t border-line-soft pt-2.5">
              <p className="flex items-center gap-1.5 text-xs font-bold text-ink-soft mb-1">
                <MessageSquareReply className="w-3.5 h-3.5" aria-hidden /> Tanggapan HRD
                {r.responded_at && <span className="font-normal font-mono">· {formatDateTimeWib(r.responded_at)}</span>}
              </p>
              <p className="text-[13px] leading-relaxed text-ink whitespace-pre-line">
                {r.hrd_response ?? <span className="text-ink-soft">Belum ada tanggapan.</span>}
              </p>
            </div>
          </article>
        );
      })}
    </>
  );
}

function Shell({ children, periodLabel }: { children: React.ReactNode; periodLabel?: string }) {
  return (
    <main className={`${INFARM_PAGE} w-full min-h-full px-5 py-7 lg:px-7`}>
      <PageTitle title="Laporkan Pelanggaran">
        {periodLabel ? <>Periode aktif: {periodLabel}</> : null}
      </PageTitle>
      {children}
    </main>
  );
}
