import { redirect } from 'next/navigation';
import Link from 'next/link';
import { CalendarClock, ClipboardCheck, ClipboardList, Clock, Inbox, ListChecks, Lock, MessageSquareText, UserPlus } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { CorrectionButton } from './correction-button';
import { AdhocDeleteButton } from './adhoc-delete-button';
import { RequestRemoveButton } from './request-remove-button';
import { EmptyState } from '@/components/empty-state';
import { colPercents } from '@/lib/table-cols';
import { StatusChip } from '@/components/status-chip';
import { CARD, CardTitle, Note, PageTitle, TABLE_HEAD, pillCls } from '@/components/infarm-ui';
import { INFARM_PAGE } from '@/app/infarm-fonts';
import { BTN_GHOST, BTN_PRIMARY } from './penilaian-ui';
import { RequestAssessmentButton } from './request-assessment-form';
import { MyRequests, type MyRequest } from './my-requests';
import { OutsideNoteButton } from './outside-note-form';
import { LATE_PENALTY_360, formatWib, isPastDeadline, ajuanPenaltyApplies, progressStatusOf, PROGRESS_STATUS_LABEL, type ProgressStatus } from '@/lib/late';

const REL_LABEL: Record<string, string> = {
  Atasan: 'Atasan', Peer: 'Rekan (Peer)', Cross: 'Lintas Divisi', Self: 'Diri Sendiri', Bawahan: 'Bawahan',
};

/**
 * Daftar Penilaian Saya (read-only, versi termigrasi Supabase).
 * Membaca mapping kuartal aktif di mana user = penilai, + status assessment-nya.
 * Semua query tunduk RLS (map_read/asmt_read): user hanya melihat mapping/penilaian
 * miliknya. Query datar (tanpa embedded join) agar ter-tipe penuh.
 *
 * DUA SUB-TAB (`?tab=penilaian|pengajuan`, pil Design System Infarm):
 *   Penilaian → daftar rekan yang harus dinilai (pekerjaan utama halaman ini)
 *   Pengajuan → menambah rekan (Ad-Hoc instan / ajukan ke HRD) + status "Permohonan Saya"
 * Dipisah karena panel-panel pengajuan sebelumnya menumpuk di atas tabel dan menggeser
 * pekerjaan utama ke bawah layar.
 */
export default async function PenilaianPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab: tabParam } = await searchParams;
  const tab = tabParam === 'pengajuan' ? 'pengajuan' : 'penilaian';
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: ap } = await supabase
    .from('periods').select('id, label, has_360, form_open, mapping_published, assessment_deadline, start_date').eq('status', 'active').limit(1).maybeSingle();
  if (!ap) {
    return (
      <Shell>
        <EmptyState
          icon={<Clock className="w-6 h-6" />}
          title="Belum ada periode penilaian yang dibuka"
          description="Saat ini tidak ada periode aktif, jadi belum ada penilaian yang bisa diisi. Periode dibuka oleh HRD."
          note="Anda akan melihat daftar tugas penilaian di sini begitu HRD mengaktifkan periode baru."
        />
      </Shell>
    );
  }
  // Komponen 360° belum dibuka HRD (periode aktif tapi 360° "tanpa") → form belum tampil.
  if (!ap.has_360) {
    return (
      <Shell periodLabel={ap.label}>
        <EmptyState
          icon={<Lock className="w-6 h-6" />}
          title="Penilaian 360° belum dibuka"
          description="HRD belum membuka komponen 360° untuk periode ini. Daftar penilaian akan muncul di sini begitu HRD mengaktifkannya."
          note="Tidak ada yang perlu Anda lakukan sekarang — tunggu pengumuman dari HRD."
        />
      </Shell>
    );
  }
  // Form ditutup HRD. DUA fase berbeda memakai flag yang sama, dibedakan `mapping_published`:
  //  (a) SEBELUM form dibuka & pemetaan sudah diumumkan → FASE TINJAU: pegawai melihat daftar
  //      penilaiannya (belum bisa mengisi) & boleh mengajukan hapus/tambah/koreksi relasi.
  //  (b) selain itu (belum diumumkan, atau pembekuan di akhir siklus) → terkunci seperti dulu.
  const reviewPhase = !ap.form_open && ap.mapping_published;
  if (!ap.form_open && !reviewPhase) {
    return (
      <Shell periodLabel={ap.label}>
        <EmptyState
          icon={<Lock className="w-6 h-6" />}
          title="Form penilaian sedang ditutup"
          description="HRD sementara menutup pengisian penilaian 360° untuk periode ini (tahap peninjauan hasil)."
          note="Penilaian yang sudah Anda kirim tetap tersimpan. Bila Anda merasa masih perlu mengisi, hubungi HRD."
        />
      </Shell>
    );
  }

  const { data: maps } = await supabase
    .from('mappings')
    .select('id, target_id, relation, mandatory, is_adhoc')
    .eq('assessor_id', user.id)
    .eq('period_id', ap.id)
    .eq('is_active', true);
  const rows = maps ?? [];

  const targetIds = rows.map((r) => r.target_id);
  const { data: emps } = targetIds.length
    ? await supabase.from('employees').select('id, name, dept').in('id', targetIds)
    : { data: [] };
  const empById = new Map((emps ?? []).map((e) => [e.id, e]));

  const { data: asmts } = await supabase
    .from('assessments').select('id, target_id, status, first_submitted_at, forced_by_hrd')
    .eq('assessor_id', user.id).eq('period_id', ap.id);
  const statusByTarget = new Map((asmts ?? []).map((a) => [a.target_id, a.status]));
  const firstSubByTarget = new Map((asmts ?? []).map((a) => [a.target_id, a.first_submitted_at]));
  const forcedByTarget = new Map((asmts ?? []).map((a) => [a.target_id, a.forced_by_hrd]));
  const deadline = ap.assessment_deadline;
  const deadlinePassed = isPastDeadline(deadline);

  // Progres DRAF (Decision 03 / mockup Screen 01): "x dari N indikator selesai" — indikator lengkap =
  // rating 1–5 + evidence ≥ 20 karakter, dari indikator AKTIF periode ini (RLS: hanya milik sendiri).
  const draftIds = (asmts ?? []).filter((a) => a.status === 'draft').map((a) => a.id);
  const draftDoneBy = new Map<string, number>();
  let indicatorTotal = 0;
  if (draftIds.length) {
    const { data: asp } = await supabase.from('culture_aspects').select('id').eq('period_id', ap.id);
    const { data: inds } = (asp ?? []).length
      ? await supabase.from('indicators').select('id').in('aspect_id', (asp ?? []).map((a) => a.id)).eq('is_active', true)
      : { data: [] as { id: string }[] };
    const activeInd = new Set((inds ?? []).map((i) => i.id));
    indicatorTotal = activeInd.size;
    const { data: sc } = await supabase.from('assessment_indicator_scores')
      .select('assessment_id, indicator_id, rating, comment').in('assessment_id', draftIds);
    (sc ?? []).forEach((s) => {
      if (!activeInd.has(s.indicator_id) || s.rating == null || (s.comment ?? '').trim().length < 20) return;
      draftDoneBy.set(s.assessment_id, (draftDoneBy.get(s.assessment_id) ?? 0) + 1);
    });
  }
  const draftIdByTarget = new Map((asmts ?? []).filter((a) => a.status === 'draft').map((a) => [a.target_id, a.id]));

  // Permohonan pemetaan milik user di periode ini: yang PENDING dipakai menandai baris
  // (satu permohonan aktif per rekan), seluruhnya dipakai panel "Permohonan Saya".
  const { data: corrs } = await supabase
    .from('relation_correction_requests')
    .select('id, kind, target_id, old_relation, new_relation, reason, reject_reason, status')
    .eq('assessor_id', user.id).eq('period_id', ap.id)
    .order('created_at', { ascending: false });
  const myReqs = corrs ?? [];
  const pendingCorr = new Set(myReqs.filter((c) => c.status === 'pending').map((c) => c.target_id));
  // AJUAN yang disetujui HRD (permohonan "tambah penilaian") → pemetaan Opsional yang tetap WAJIB
  // dituntaskan sebelum deadline (ikut potongan keterlambatan, 2026-09-29).
  // Berlaku untuk periode Q3 2026 dst. (ajuanPenaltyApplies); periode sebelumnya → kosong.
  const approvedAjuan = new Set(ajuanPenaltyApplies(ap.start_date)
    ? myReqs.filter((c) => c.kind === 'add' && c.status === 'approved').map((c) => c.target_id)
    : []);

  // Kandidat Ad-Hoc: pegawai non-direksi, bukan diri, belum ada di daftar penilaian.
  const alreadyListed = new Set<string>([user.id, ...targetIds]);
  // Eksternal (vendor/freelance) hanya MENILAI, tak boleh jadi target → keluarkan dari kandidat Ad-Hoc.
  const { data: allEmps } = await supabase.from('employees').select('id, name, dept, role').neq('role', 'direksi').eq('is_external', false).eq('is_active', true);
  const candidates = (allEmps ?? [])
    .filter((e) => !alreadyListed.has(e.id))
    .map((e) => ({ id: e.id, name: e.name, dept: e.dept }))
    .sort((a, b) => a.name.localeCompare(b.name));

  // Catatan di Luar Pemetaan (0054): kandidat = daftar yang sama dengan Ajukan Penilaian; aspek dari
  // culture_aspects periode aktif. Penilai eksternal tak melihat kartunya.
  const { data: meRow } = await supabase.from('employees').select('is_external').eq('id', user.id).maybeSingle();
  const showNoteCard = !!meRow && !meRow.is_external;
  const { data: aspRows } = showNoteCard && ap.form_open
    ? await supabase.from('culture_aspects').select('id, name').eq('period_id', ap.id).order('order_idx')
    : { data: [] as { id: string; name: string }[] };
  const noteAspects = (aspRows ?? []).map((a) => ({ id: a.id, name: a.name }));

  // Nama untuk SEMUA target permohonan: target 'add' belum jadi mapping, jadi tak ada di empById.
  const nameByAny = new Map<string, string>([
    ...[...empById.entries()].map(([id, e]) => [id, e.name] as const),
    ...(allEmps ?? []).map((e) => [e.id, e.name] as const),
  ]);

  const items = rows
    .map((r) => ({
      id: r.id,
      targetId: r.target_id,
      name: empById.get(r.target_id)?.name ?? '(tidak diketahui)',
      dept: empById.get(r.target_id)?.dept ?? '—',
      mappingId: r.id,
      relation: r.relation as string,
      mandatory: r.mandatory,
      isAdhoc: r.is_adhoc,
      requested: !r.mandatory && !r.is_adhoc && approvedAjuan.has(r.target_id),
      status: statusByTarget.get(r.target_id) ?? null,
      // BR-07: 4 status (Belum Mulai / Sedang Diisi / Selesai – Tepat Waktu / Selesai – Terlambat).
      // Tepat Waktu/Terlambat hanya untuk penilaian yang TERHITUNG potongan (Wajib/ajuan, non-Ad-Hoc);
      // keputusan potongan final (incl. pemetaan pasca-deadline) tetap dihitung server (lib/late-server).
      progress: progressStatusOf(statusByTarget.get(r.target_id), firstSubByTarget.get(r.target_id), deadline, forcedByTarget.get(r.target_id) ?? false),
      counted: (r.mandatory || approvedAjuan.has(r.target_id)) && !r.is_adhoc,
      corrPending: pendingCorr.has(r.target_id),
      draftDone: draftIdByTarget.has(r.target_id) ? (draftDoneBy.get(draftIdByTarget.get(r.target_id)!) ?? 0) : null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  // Ringkasan penilaian WAJIB (sifat = Wajib) — berapa harus dinilai vs sudah dikirim.
  // Penilaian yang dibatalkan validitasnya oleh HRD (0046) bukan lagi kewajiban.
  const mandatoryItems = items.filter((it) => it.mandatory && it.status !== 'invalidated');
  const mandTotal = mandatoryItems.length;
  const mandDone = mandatoryItems.filter((it) => it.status === 'submitted').length;
  // Ajuan (Q3 2026 dst.) yang belum dikirim — ikut potongan bila deadline lewat.
  const ajuanPendingN = items.filter((it) => it.requested && it.status !== 'submitted' && it.status !== 'invalidated').length;

  // Panel "Permohonan Saya" — status pengajuan (hapus/tambah/koreksi) + alasan penolakan HRD.
  const myRequestRows: MyRequest[] = myReqs.map((c) => ({
    id: c.id,
    kind: (c.kind ?? 'relation') as MyRequest['kind'],
    targetName: nameByAny.get(c.target_id) ?? '(pegawai)',
    oldRelation: c.old_relation,
    newRelation: c.new_relation,
    reason: c.reason,
    rejectReason: c.reject_reason,
    status: c.status,
  }));
  const pendingReqN = myRequestRows.filter((r) => r.status === 'pending').length;

  type Item = (typeof items)[number];
  const primaryLabel = (it: Item) =>
    // Decision 01: terkirim → Edit sampai deadline, sesudahnya Lihat (read-only).
    it.status === 'submitted' ? (deadlinePassed ? 'Lihat' : 'Edit') : it.status === 'draft' ? 'Lanjutkan' : 'Mulai Nilai';
  /** Aksi sekunder (koreksi relasi / ajukan hapus / hapus ad-hoc) — dipakai tabel & kartu HP. */
  const secondaryActions = (it: Item) => (
    <>
      {it.isAdhoc && (
        <AdhocDeleteButton targetId={it.targetId} targetName={it.name} submitted={it.status === 'submitted'} />
      )}
      {/* Minta Koreksi tersedia untuk SEMUA pemetaan (termasuk Ad-Hoc): target ad-hoc dikunci relasi 'Cross'
          saat dibuat, padahal hubungan sebenarnya bisa berbeda. HRD yang menyetujui. Self dikecualikan. */}
      {it.relation !== 'Self' && it.status !== 'invalidated' && (
        <CorrectionButton mappingId={it.mappingId} targetId={it.targetId} targetName={it.name}
          currentRelation={it.relation} pending={it.corrPending} />
      )}
      {/* Ajukan Hapus: untuk pemetaan dari HRD ('Self' dikecualikan). */}
      {!it.isAdhoc && it.relation !== 'Self' && it.status !== 'invalidated' && (
        <RequestRemoveButton mappingId={it.mappingId} targetId={it.targetId} targetName={it.name} pending={it.corrPending} />
      )}
    </>
  );
  /** Aksi utama — satu per baris: Mulai Nilai/Lanjutkan = hijau solid; Edit/Lihat = netral. HP = selebar kartu. */
  const primaryAction = (it: Item, asButton: boolean) => {
    if (it.status === 'invalidated') {
      return <span className="text-xs text-ink-faint italic" title="HRD membatalkan validitas penilaian ini — tidak dihitung & tidak bisa diubah.">dibatalkan HRD</span>;
    }
    if (reviewPhase) return <span className="text-xs text-ink-faint italic">belum dibuka</span>;
    const label = primaryLabel(it);
    const solid = label === 'Mulai Nilai' || label === 'Lanjutkan';
    return (
      <Link href={`/penilaian/${it.targetId}`} prefetch={false}
        className={`${solid ? BTN_PRIMARY : BTN_GHOST} shrink-0 whitespace-nowrap ${asButton ? 'w-full' : ''}`}>
        {label === 'Edit' && asButton ? 'Edit Penilaian' : label}
      </Link>
    );
  };
  const draftProgress = (it: Item) => it.status === 'draft' && it.draftDone != null && indicatorTotal > 0 ? (
    <div className="mt-1.5">
      <p className="text-xs text-ink-soft"><span className="data-value font-semibold text-ink">{it.draftDone}</span> dari <span className="data-value">{indicatorTotal}</span> indikator selesai</p>
      <div className="h-1.5 mt-1 bg-neutral-tint rounded-full overflow-hidden">
        <div className="h-full bg-warn rounded-full" style={{ width: `${Math.round((it.draftDone / indicatorTotal) * 100)}%` }} />
      </div>
    </div>
  ) : null;
  /** Chip Sifat: Wajib = warn; Opsional = netral; ajuan yang disetujui HRD tetap wajib diselesaikan (warn). */
  const sifatChips = (it: Item) => (
    <>
      <StatusChip tone={it.mandatory ? 'warn' : 'neutral'} className="whitespace-nowrap">{it.mandatory ? 'Wajib' : 'Opsional'}</StatusChip>
      {it.requested && (
        <span title="Penilaian ini Anda ajukan sendiri & sudah disetujui HRD — tetap harus dikirim sebelum deadline, bila tidak Skor 360° Anda terkena potongan keterlambatan.">
          <StatusChip tone="warn" className="whitespace-nowrap">Ajuan · wajib selesai</StatusChip>
        </span>
      )}
    </>
  );
  const mandPct = mandTotal ? Math.round((mandDone / mandTotal) * 100) : 0;

  return (
    <Shell periodLabel={ap.label}>
      <div className="space-y-4">
      {/* FASE TINJAU: pemetaan sudah diumumkan tapi form belum dibuka. */}
      {reviewPhase && (
        <Note tone="warn" title="Tahap peninjauan pemetaan — pengisian belum dibuka">
          Berikut daftar rekan yang akan Anda nilai kuartal ini. <strong>Periksa dulu:</strong> bila ada yang
          tidak sesuai, ajukan penghapusan; bila ada rekan yang seharusnya Anda nilai tapi belum tercantum,
          ajukan lewat form di bawah. Semua permohonan diputuskan HRD. Tombol <strong>Mulai Nilai</strong> muncul
          setelah HRD membuka form.
        </Note>
      )}

      {/* Sub-tab pil (Design System Infarm) — href & logika aktif tetap. */}
      <div className="flex flex-wrap gap-2">
        <Link href="/penilaian?tab=penilaian" prefetch={false} className={`${pillCls(tab === 'penilaian')} shrink-0`}>
          <ClipboardList className="w-4 h-4" aria-hidden /> Penilaian
          {items.length ? <CountChip active={tab === 'penilaian'}>{items.length}</CountChip> : null}
        </Link>
        <Link href="/penilaian?tab=pengajuan" prefetch={false} className={`${pillCls(tab === 'pengajuan')} shrink-0`}>
          <Inbox className="w-4 h-4" aria-hidden /> Pengajuan
          {pendingReqN ? <CountChip active={tab === 'pengajuan'} warn>{pendingReqN}</CountChip> : null}
        </Link>
      </div>

      {tab === 'pengajuan' ? (
        <>
          {/* Satu jalur menambah rekan yang dinilai (BR-04, Q3 2026): Ad-Hoc instan
              dinonaktifkan — semua penambahan wajib alasan + ACC HRD. */}
          {/* Berdampingan di layar lebar, bertumpuk di HP. Kartu catatan disembunyikan untuk penilai
              eksternal (belum boleh mengirim — keputusan pemilik 2026-11-03; server juga menolak). */}
          <div className={`grid gap-4 ${showNoteCard ? 'sm:grid-cols-2' : ''}`}>
          <section className={`${CARD} flex flex-col`}>
            <CardTitle icon={UserPlus}>Menambah Rekan yang Anda Nilai</CardTitle>
            <p className="text-[13px] text-ink-soft mt-1.5 leading-relaxed">
              Ada rekan yang seharusnya Anda nilai tapi belum tercantum? Ajukan lewat{' '}
              <strong className="text-ink">Ajukan Penilaian</strong> — sertakan alasan, lalu tunggu keputusan HRD.
            </p>
            <div className="mt-auto pt-3 flex flex-wrap items-center gap-2">
              <RequestAssessmentButton candidates={candidates} />
            </div>
          </section>
          {showNoteCard && (
            <section className="bg-infarm-cream border border-line rounded-card shadow-card p-4 flex flex-col">
              <CardTitle icon={MessageSquareText}>Catatan di Luar Pemetaan</CardTitle>
              <p className="text-[13px] text-ink-soft mt-1.5 leading-relaxed">
                Ada kejadian yang perlu HRD ketahui tentang rekan di luar daftar penilaian Anda? Tulis di sini
                tanpa rating dan tanpa nama Anda.
              </p>
              {ap.form_open ? (
                <>
                  <p className="text-xs text-ink-soft mt-1">Bisa dikirim selama penilaian {ap.label} berlangsung.</p>
                  <div className="mt-auto pt-3 flex flex-wrap items-center gap-2">
                    <OutsideNoteButton candidates={candidates} aspects={noteAspects} />
                  </div>
                </>
              ) : (
                <p className="text-xs text-ink-soft mt-2 leading-relaxed">
                  Belum bisa dikirim — catatan dibuka bersamaan dengan form penilaian oleh HRD.
                </p>
              )}
            </section>
          )}
          </div>

          <div>
          {showNoteCard && (
            <p className="mb-2 text-xs text-ink-soft">
              Catatan di luar pemetaan tidak tercantum di sini, karena tidak tersimpan dengan nama Anda.
            </p>
          )}
          {myRequestRows.length === 0 ? (
            <section className={CARD}>
              <CardTitle icon={ListChecks}>Permohonan Saya</CardTitle>
              <p className="text-[13px] text-ink-soft mt-1.5">Belum ada permohonan. Pengajuan Anda beserta keputusan HRD akan tampil di sini.</p>
            </section>
          ) : (
            <MyRequests requests={myRequestRows} />
          )}
          </div>
        </>
      ) : (
        <>
      {mandTotal > 0 && !reviewPhase && (
        <section className={CARD}>
          <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
            <div className="min-w-0">
              <CardTitle icon={ClipboardCheck}>Penilaian Wajib Anda</CardTitle>
              <p className="text-[13px] text-ink-soft mt-1.5">
                <span className="data-value text-xl font-bold text-ink leading-none">{mandDone}</span>
                <span className="data-value text-ink-soft"> / {mandTotal}</span> sudah dikirim
                {mandDone < mandTotal ? <> · sisa <span className="data-value font-semibold text-ink">{mandTotal - mandDone}</span> untuk dikerjakan</> : ' · selesai semua'}
              </p>
            </div>
            {deadline && (
              <p className="flex items-center gap-1.5 text-xs text-ink-soft">
                <CalendarClock className="w-4 h-4 text-brand shrink-0" aria-hidden />
                Deadline: <span className="data-value font-semibold text-ink">{formatWib(deadline)}</span>
              </p>
            )}
          </div>
          <div className="mt-3 flex items-center gap-3">
            <div className="flex-1 h-2 bg-neutral-tint rounded-full overflow-hidden">
              <div className="h-full bg-brand rounded-full transition-all" style={{ width: `${mandPct}%` }} />
            </div>
            <span className="data-value text-xs font-bold text-brand-ink shrink-0">{mandPct}%</span>
          </div>
        </section>
      )}
      {deadlinePassed && !reviewPhase && (mandDone < mandTotal || ajuanPendingN > 0) && (
        <Note tone="warn" title="Deadline penilaian sudah lewat">
          Form masih bisa diisi, tetapi penilaian wajib{ajuanPendingN > 0 ? ' (termasuk ajuan Anda)' : ''} yang dikirim sekarang tercatat <strong>Terlambat</strong> dan
          Skor 360° Anda dipotong <span className="data-value">{LATE_PENALTY_360}</span> poin (sekali per periode).
          Penilaian Anda tetap dihitung untuk rekan yang dinilai. Penilaian yang <strong>sudah terkirim</strong> kini
          terkunci (hanya bisa dilihat).
        </Note>
      )}
      {items.length === 0 ? (
        <section className={CARD}>
          <p className="text-[13px] text-ink-soft">
            Belum ada penilaian rutin yang ditugaskan. Buka tab <strong className="text-ink">Pengajuan</strong> untuk menambah rekan
            yang ingin Anda nilai.
          </p>
        </section>
      ) : (
        <>
          <Note>
            Periksa kolom <strong className="text-ink">Garis Hubungan</strong> tiap rekan. Bila relasi Anda dengan rekan itu
            keliru (mis. tertulis Rekan padahal Anda atasannya), klik <strong className="text-ink">“Minta Koreksi”</strong>{' '}
            agar HRD memperbaikinya — relasi menentukan <strong className="text-ink">bobot Skor 360°</strong>, sehingga
            memengaruhi hasil akhir pegawai.
          </Note>
          {/* HP (Decision 03, opsi kartu): satu kartu per rekan — nama, divisi · relasi, status, progres draf,
              tombol utama penuh; aksi sekunder kecil di bawahnya. Layar ≥ sm tetap tabel. */}
          <ul className="sm:hidden space-y-3">
            {items.map((it) => (
              <li key={it.id} className={CARD}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[13px] font-bold text-ink leading-tight">{it.name}</p>
                    <p className="text-xs text-ink-soft mt-0.5">{it.dept} · {REL_LABEL[it.relation] ?? it.relation}</p>
                  </div>
                  <StatusBadge status={it.progress} counted={it.counted} />
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">{sifatChips(it)}</div>
                {draftProgress(it)}
                <div className="mt-3 flex">{primaryAction(it, true)}</div>
                <div className="mt-2 flex flex-wrap items-center justify-end gap-3">{secondaryActions(it)}</div>
              </li>
            ))}
          </ul>
          <section className="hidden sm:block bg-surface border border-line rounded-card shadow-card overflow-hidden">
          <div className="overflow-x-auto">
          {/* table-fixed + colgroup: lebar kolom TETAP antar tab (tak bergeser saat berpindah tab). */}
          <table className="w-full table-fixed text-left text-[13px] min-w-[760px]">
            <colgroup>
              {colPercents([
                230, // Yang Dinilai + divisi
                130, // Garis Hubungan
                130, // Sifat (+ "Ajuan · wajib selesai")
                160, // Status (+ progres draf)
                250, // Aksi (sekunder + utama)
              ]).map((w, i) => <col key={i} style={{ width: w }} />)}
            </colgroup>
            <thead>
              <tr className={`${TABLE_HEAD} border-b border-line`}>
                <th className="py-2.5 pl-4 pr-3 font-semibold">Yang Dinilai</th>
                <th className="py-2.5 px-3 font-semibold">Garis Hubungan</th>
                <th className="py-2.5 px-3 font-semibold">Sifat</th>
                <th className="py-2.5 px-3 font-semibold">Status</th>
                <th className="py-2.5 pl-3 pr-4 font-semibold text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line-soft">
              {items.map((it) => (
                <tr key={it.id} className="align-top">
                  <td className="py-3 pl-4 pr-3">
                    <span className="font-bold text-ink block truncate" title={it.name}>{it.name}</span>
                    <span className="text-xs text-ink-soft block truncate">{it.dept}</span>
                  </td>
                  <td className="py-3 px-3 text-ink-soft">{REL_LABEL[it.relation] ?? it.relation}</td>
                  <td className="py-3 px-3">
                    <div className="flex flex-col items-start gap-1">{sifatChips(it)}</div>
                  </td>
                  <td className="py-3 px-3">
                    <StatusBadge status={it.progress} counted={it.counted} />
                    {draftProgress(it)}
                  </td>
                  <td className="py-3 pl-3 pr-4">
                    <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1.5">
                      {secondaryActions(it)}
                      {primaryAction(it, false)}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
          </section>
        </>
      )}
        </>
      )}
      </div>
    </Shell>
  );
}

/** Chip jumlah di dalam pil sub-tab (kontras di atas pil aktif hijau maupun pil putih). */
function CountChip({ active, warn = false, children }: { active: boolean; warn?: boolean; children: React.ReactNode }) {
  const cls = active ? 'bg-white/20 text-white' : warn ? 'bg-warn-tint text-warn-ink' : 'bg-neutral-tint text-ink-soft';
  return <span className={`data-value text-[11px] font-bold px-1.5 py-0.5 rounded-full leading-none ${cls}`}>{children}</span>;
}

/** BR-07 → nada chip: Belum Mulai netral · Sedang Diisi warn · Tepat Waktu/Terkirim brand · Terlambat danger · Dibatalkan netral. */
const STATUS_TONE: Record<ProgressStatus, 'neutral' | 'warn' | 'brand' | 'danger'> = {
  not_started: 'neutral',
  in_progress: 'warn',
  on_time: 'brand',
  late: 'danger',
  invalidated: 'neutral',
};
const STATUS_TITLE: Record<ProgressStatus, string> = {
  not_started: 'Not Started — penilaian belum mulai dikerjakan',
  in_progress: 'In Progress — sudah mulai diisi, belum dikirim final',
  on_time: 'Completed – On Time — dikirim pertama kali sebelum/tepat pada deadline',
  late: 'Completed – Late — dikirim pertama kali sesudah deadline',
  invalidated: 'Dibatalkan HRD — penilaian dinyatakan tidak valid; tidak dihitung dan bukan lagi kewajiban',
};

/** BR-07: status penyelesaian. Penilaian yang tak dihitung potongan (Opsional biasa / Ad-Hoc lama)
 *  cukup "Terkirim" — label tepat waktu/terlambat tak relevan untuknya. */
function StatusBadge({ status, counted }: { status: ProgressStatus; counted: boolean }) {
  const done = status === 'on_time' || status === 'late'; // invalidated tetap berlabel "Dibatalkan"
  const key: ProgressStatus = done && !counted ? 'on_time' : status;
  const label = done && !counted ? 'Terkirim' : PROGRESS_STATUS_LABEL[status];
  return (
    <span className="inline-flex shrink-0" title={done && !counted ? 'Penilaian opsional sudah dikirim' : STATUS_TITLE[status]}>
      <StatusChip tone={STATUS_TONE[key]} className="whitespace-nowrap">{label}</StatusChip>
    </span>
  );
}

function Shell({ children, periodLabel }: { children: React.ReactNode; periodLabel?: string }) {
  return (
    <main className={`${INFARM_PAGE} w-full min-h-full px-5 py-7 lg:px-7`}>
      <PageTitle title="Daftar Penilaian Saya">
        {periodLabel ? <>Periode aktif: {periodLabel}</> : null}
      </PageTitle>
      {children}
    </main>
  );
}
