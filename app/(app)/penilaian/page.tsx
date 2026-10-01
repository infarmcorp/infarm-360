import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ClipboardList, Inbox } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { CorrectionButton } from './correction-button';
import { AdhocDeleteButton } from './adhoc-delete-button';
import { RequestRemoveButton } from './request-remove-button';
import { EmptyState } from '@/components/empty-state';
import { TabBar, Tab } from '@/components/tab-nav';
import { RequestAssessmentButton } from './request-assessment-form';
import { MyRequests, type MyRequest } from './my-requests';
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
 * DUA SUB-TAB (`?tab=penilaian|pengajuan`, pola seragam TabBar):
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
          icon="⏳"
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
          icon="🔒"
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
          icon="🔒"
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
  const mandatoryItems = items.filter((it) => it.mandatory);
  const mandTotal = mandatoryItems.length;
  const mandDone = mandatoryItems.filter((it) => it.status === 'submitted').length;
  // Ajuan (Q3 2026 dst.) yang belum dikirim — ikut potongan bila deadline lewat.
  const ajuanPendingN = items.filter((it) => it.requested && it.status !== 'submitted').length;

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
      {it.relation !== 'Self' && (
        <CorrectionButton mappingId={it.mappingId} targetId={it.targetId} targetName={it.name}
          currentRelation={it.relation} pending={it.corrPending} />
      )}
      {/* Ajukan Hapus: untuk pemetaan dari HRD ('Self' dikecualikan). */}
      {!it.isAdhoc && it.relation !== 'Self' && (
        <RequestRemoveButton mappingId={it.mappingId} targetId={it.targetId} targetName={it.name} pending={it.corrPending} />
      )}
    </>
  );
  /** Aksi utama — teks (tabel) atau tombol penuh (kartu HP). Fase tinjau: belum ada tautan. */
  const primaryAction = (it: Item, asButton: boolean) => {
    if (reviewPhase) return <span className="text-[11px] text-ink-faint italic">belum dibuka</span>;
    const label = primaryLabel(it);
    const solid = label === 'Mulai Nilai' || label === 'Lanjutkan';
    return (
      <Link href={`/penilaian/${it.targetId}`}
        className={asButton
          ? `block w-full text-center text-sm font-bold py-2.5 rounded-control ${solid ? 'bg-brand hover:bg-brand-ink text-white' : 'border border-line text-ink bg-surface hover:bg-neutral-tint'}`
          : 'text-xs font-bold text-brand-ink hover:underline'}>
        {label === 'Edit' && asButton ? 'Edit Penilaian' : label}
      </Link>
    );
  };
  const draftProgress = (it: Item) => it.status === 'draft' && it.draftDone != null && indicatorTotal > 0 ? (
    <div className="mt-1.5">
      <p className="text-[11px] text-ink-soft"><span className="data-value font-semibold">{it.draftDone}</span> dari <span className="data-value">{indicatorTotal}</span> indikator selesai</p>
      <div className="h-1.5 mt-1 bg-neutral-tint rounded-full overflow-hidden">
        <div className="h-full bg-brand rounded-full" style={{ width: `${Math.round((it.draftDone / indicatorTotal) * 100)}%` }} />
      </div>
    </div>
  ) : null;

  return (
    <Shell periodLabel={ap.label}>
      {/* FASE TINJAU: pemetaan sudah diumumkan tapi form belum dibuka. */}
      {reviewPhase && (
        <div className="mb-4 rounded-panel border border-warn-ink/25 bg-warn-tint p-3.5">
          <p className="text-[12.5px] font-bold text-warn-ink">Tahap peninjauan pemetaan — pengisian belum dibuka</p>
          <p className="text-[11.5px] text-warn-ink/90 mt-1 leading-relaxed">
            Berikut daftar rekan yang akan Anda nilai kuartal ini. <strong>Periksa dulu:</strong> bila ada yang
            tidak sesuai, ajukan penghapusan; bila ada rekan yang seharusnya Anda nilai tapi belum tercantum,
            ajukan lewat form di bawah. Semua permohonan diputuskan HRD. Tombol <strong>Mulai Nilai</strong> muncul
            setelah HRD membuka form.
          </p>
        </div>
      )}

      <TabBar>
        <Tab href="/penilaian?tab=penilaian" active={tab === 'penilaian'} icon={ClipboardList}>
          Penilaian
          {items.length ? <span className="ml-1.5 text-[10px] data-value bg-neutral-tint text-ink-soft border border-line px-1.5 py-0.5 rounded-full">{items.length}</span> : null}
        </Tab>
        <Tab href="/penilaian?tab=pengajuan" active={tab === 'pengajuan'} icon={Inbox}>
          Pengajuan
          {pendingReqN ? <span className="ml-1.5 text-[10px] data-value bg-warn-tint text-warn-ink border border-warn-ink/25 px-1.5 py-0.5 rounded-full">{pendingReqN}</span> : null}
        </Tab>
      </TabBar>

      <div className="pt-5">
      {tab === 'pengajuan' ? (
        <>
          {/* Satu jalur menambah rekan yang dinilai (BR-04, Q3 2026): Ad-Hoc instan
              dinonaktifkan — semua penambahan wajib alasan + ACC HRD. */}
          <section className="mb-5 rounded-panel border border-line bg-surface p-4">
            <h3 className="text-xs font-bold text-ink uppercase tracking-wide">Menambah Rekan yang Anda Nilai</h3>
            <p className="text-[11.5px] text-ink-soft mt-1 leading-relaxed">
              Ada rekan yang seharusnya Anda nilai tapi belum tercantum? Ajukan lewat{' '}
              <strong>Ajukan Penilaian</strong> — sertakan alasan, lalu tunggu keputusan HRD.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <RequestAssessmentButton candidates={candidates} />
            </div>
          </section>

          {myRequestRows.length === 0 ? (
            <p className="text-sm text-ink-soft">Belum ada permohonan. Pengajuan Anda beserta keputusan HRD akan tampil di sini.</p>
          ) : (
            <MyRequests requests={myRequestRows} />
          )}
        </>
      ) : (
        <>
      {mandTotal > 0 && !reviewPhase && (
        <div className="mb-4 flex items-center justify-between gap-3 bg-brand-tint border border-brand-ink/20 rounded-panel p-3">
          <div className="min-w-0">
            <p className="text-xs font-extrabold text-brand-ink">Penilaian Wajib Anda</p>
            <p className="text-[11px] text-brand-ink/80">
              {mandDone} dari {mandTotal} sudah dikirim
              {mandDone < mandTotal ? ` · sisa ${mandTotal - mandDone} untuk dikerjakan` : ' · selesai semua 🎉'}
            </p>
            {deadline && (
              <p className="text-[11px] text-brand-ink/80 mt-0.5">
                Deadline: <span className="data-value font-semibold">{formatWib(deadline)}</span>
              </p>
            )}
          </div>
          <div className="w-24 sm:w-32 h-2 bg-brand/20 rounded-full overflow-hidden shrink-0">
            <div className="h-full bg-brand rounded-full transition-all"
              style={{ width: `${mandTotal ? Math.round((mandDone / mandTotal) * 100) : 0}%` }} />
          </div>
        </div>
      )}
      {deadlinePassed && !reviewPhase && (mandDone < mandTotal || ajuanPendingN > 0) && (
        <div className="mb-4 rounded-panel border border-warn-ink/25 bg-warn-tint p-3">
          <p className="text-[12px] font-bold text-warn-ink">Deadline penilaian sudah lewat</p>
          <p className="text-[11.5px] text-warn-ink/90 mt-0.5 leading-relaxed">
            Form masih bisa diisi, tetapi penilaian wajib{ajuanPendingN > 0 ? ' (termasuk ajuan Anda)' : ''} yang dikirim sekarang tercatat <strong>Terlambat</strong> dan
            Skor 360° Anda dipotong <span className="data-value">{LATE_PENALTY_360}</span> poin (sekali per periode).
            Penilaian Anda tetap dihitung untuk rekan yang dinilai. Penilaian yang <strong>sudah terkirim</strong> kini
            terkunci (hanya bisa dilihat).
          </p>
        </div>
      )}
      {items.length === 0 ? (
        <p className="text-sm text-ink-soft">
          Belum ada penilaian rutin yang ditugaskan. Buka tab <strong>Pengajuan</strong> untuk menambah rekan
          yang ingin Anda nilai.
        </p>
      ) : (
        <>
          <div className="mb-4 flex items-start gap-2 bg-neutral-tint border border-line rounded-panel p-3 text-[12px] text-ink-soft">
            <span aria-hidden>ℹ️</span>
            <p className="leading-relaxed">
              Periksa kolom <strong>Garis Hubungan</strong> tiap rekan. Bila relasi Anda dengan rekan itu
              keliru (mis. tertulis Rekan padahal Anda atasannya), klik <strong>“Minta Koreksi”</strong>
              agar HRD memperbaikinya — relasi menentukan <strong>bobot Skor 360°</strong>, sehingga
              memengaruhi hasil akhir pegawai.
            </p>
          </div>
          {/* HP (Decision 03, opsi kartu): satu kartu per rekan — nama, divisi · relasi, status, progres draf,
              tombol utama penuh; aksi sekunder kecil di bawahnya. Layar ≥ sm tetap tabel. */}
          <ul className="sm:hidden space-y-3">
            {items.map((it) => (
              <li key={it.id} className="rounded-panel border border-line bg-surface p-3.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-bold text-ink leading-tight">{it.name}</p>
                    <p className="text-[11.5px] text-ink-faint mt-0.5">{it.dept} · {REL_LABEL[it.relation] ?? it.relation}</p>
                  </div>
                  <StatusBadge status={it.progress} counted={it.counted} />
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-control border ${it.mandatory ? 'bg-warn-tint text-warn-ink border-warn-ink/25' : 'bg-neutral-tint text-ink-faint border-line'}`}>
                    {it.mandatory ? 'Wajib' : 'Opsional'}
                  </span>
                  {it.requested && <span className="text-[9.5px] font-semibold text-warn-ink">Ajuan · wajib selesai</span>}
                </div>
                {draftProgress(it)}
                <div className="mt-3">{primaryAction(it, true)}</div>
                <div className="mt-2 flex flex-wrap items-center justify-end gap-3">{secondaryActions(it)}</div>
              </li>
            ))}
          </ul>
          <div className="hidden sm:block overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-[10px] uppercase tracking-[0.05em] text-ink-faint font-semibold border-b border-line">
                <th className="py-2 pr-3">Yang Dinilai</th>
                <th className="py-2 px-3">Garis Hubungan</th>
                <th className="py-2 px-3 text-center">Sifat</th>
                <th className="py-2 px-3 text-right">Status</th>
                <th className="py-2 pl-3 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line-soft">
              {items.map((it) => (
                <tr key={it.id}>
                  <td className="py-3 pr-3">
                    <span className="font-bold text-ink block">{it.name}</span>
                    <span className="text-[11px] text-ink-faint">{it.dept}</span>
                  </td>
                  <td className="py-3 px-3 text-ink-soft">{REL_LABEL[it.relation] ?? it.relation}</td>
                  <td className="py-3 px-3 text-center">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-control border ${
                      it.mandatory
                        ? 'bg-warn-tint text-warn-ink border-warn-ink/25'
                        : 'bg-neutral-tint text-ink-faint border-line'
                    }`}>
                      {it.mandatory ? 'Wajib' : 'Opsional'}
                    </span>
                    {it.requested && (
                      <span className="block mt-1 text-[9.5px] font-semibold text-warn-ink"
                        title="Penilaian ini Anda ajukan sendiri & sudah disetujui HRD — tetap harus dikirim sebelum deadline, bila tidak Skor 360° Anda terkena potongan keterlambatan.">
                        Ajuan · wajib selesai
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-3 text-right">
                    <StatusBadge status={it.progress} counted={it.counted} />
                    {draftProgress(it)}
                  </td>
                  <td className="py-3 pl-3 text-right">
                    <div className="flex items-center justify-end gap-3">
                      {secondaryActions(it)}
                      {primaryAction(it, false)}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </>
      )}
        </>
      )}
      </div>
    </Shell>
  );
}

const STATUS_CLS: Record<ProgressStatus, string> = {
  not_started: 'bg-neutral-tint text-ink-faint border-line',
  in_progress: 'bg-warn-tint text-warn-ink border-warn-ink/25',
  on_time: 'bg-brand-tint text-brand-ink border-brand-ink/20',
  late: 'bg-danger-tint text-danger-ink border-danger-ink/25',
};
const STATUS_TITLE: Record<ProgressStatus, string> = {
  not_started: 'Not Started — penilaian belum mulai dikerjakan',
  in_progress: 'In Progress — sudah mulai diisi, belum dikirim final',
  on_time: 'Completed – On Time — dikirim pertama kali sebelum/tepat pada deadline',
  late: 'Completed – Late — dikirim pertama kali sesudah deadline',
};

/** BR-07: status penyelesaian. Penilaian yang tak dihitung potongan (Opsional biasa / Ad-Hoc lama)
 *  cukup "Terkirim" — label tepat waktu/terlambat tak relevan untuknya. */
function StatusBadge({ status, counted }: { status: ProgressStatus; counted: boolean }) {
  const done = status === 'on_time' || status === 'late';
  const key: ProgressStatus = done && !counted ? 'on_time' : status;
  const label = done && !counted ? 'Terkirim' : PROGRESS_STATUS_LABEL[status];
  return (
    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-control border whitespace-nowrap ${STATUS_CLS[key]}`}
      title={done && !counted ? 'Penilaian opsional sudah dikirim' : STATUS_TITLE[status]}>{label}</span>
  );
}

function Shell({ children, periodLabel }: { children: React.ReactNode; periodLabel?: string }) {
  return (
    <main className="w-full min-h-full bg-bg px-5 py-7 lg:px-6">
      {/* Tanpa bingkai/kartu: judul & isi langsung di atas kanvas halaman (pola Dashboard/Monitor). */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-[22px] font-bold tracking-[-0.01em] text-ink">Daftar Penilaian Saya</h1>
          {periodLabel && <p className="text-[13.5px] text-ink-soft mt-1">Periode aktif: {periodLabel}</p>}
        </div>
        <Link href="/" className="text-xs text-ink-faint hover:text-ink-soft">← Beranda</Link>
      </div>
      {children}
    </main>
  );
}
