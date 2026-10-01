import { createAdminClient, type createClient } from '@/lib/supabase/server';
import { finalScoreOf, kpiAvgOf, displayedFinalOf } from '@/lib/scoring';
import { classOf, weightedScore360, effectiveModel, type Groups360, type Model360 } from '@/lib/score360';
import type { RelationKind, WeightValues } from '@/lib/database.types';

type SB = Awaited<ReturnType<typeof createClient>>;

export type AspectScore = { name: string; score: number | null; self: number | null };
export type AssessorBlock = {
  assessorId: string;
  assessorName: string;
  relation: string;
  isSelf: boolean;
  comments: { indicator: string; rating: number | null; comment: string }[];
  answers: { question: string; answer: string }[];
};
/** Raw feedback ANONIM per indikator (untuk HRD): daftar rating mentah + komentar, tanpa nama penilai. */
export type IndicatorRaw = { num: number; text: string; ratings: number[]; comments: string[] };
export type AspectRaw = { name: string; indicators: IndicatorRaw[] };
export type EssayGroup = { question: string; answers: string[] };
export type ReportData = {
  emp: { id: string; name: string; dept: string };
  periodLabel: string;
  has360: boolean;
  status: string | null;
  finalScore: number | null;
  kpiAvg: number | null;
  s360: number | null;
  /** Potongan keterlambatan menilai yang SUDAH termasuk di s360 (migrasi 0036). 0 = tanpa. */
  latePenalty360: number;
  aspects: AspectScore[];
  assessors: AssessorBlock[];
  // Tambahan untuk view HRD (anonim, dikelompokkan):
  byAspect: AspectRaw[];          // raw feedback per aspek → indikator (+ akumulasi rating)
  essays: EssayGroup[];           // jawaban esai dikelompokkan per pertanyaan
  aspectSummaries: Record<string, string>; // ringkasan HRD per aspek (tersimpan di content)
  qualSummaries: Record<string, string>;   // ringkasan HRD per pertanyaan kualitatif (content)
  qualQuestions: string[];        // teks semua pertanyaan kualitatif periode (urut) — untuk editor
};

/**
 * Muat data Dokumen Laporan rinci untuk satu pegawai+periode (tunduk RLS pemanggil).
 * Aspek 360° "others" = skor TERBOBOT per kelas penilai (Atasan/Peer/Cross/Bawahan) via
 * weightedScore360 + skema bobot aktif — konsisten dgn Skor 360° headline & dashboard; Self
 * dikecualikan & disimpan terpisah di .self (rata-rata biasa). Komentar mentah per penilai.
 */
export async function loadReport(supabase: SB, employeeId: string, period: { id: string; label: string; has_360: boolean }): Promise<ReportData | null> {
  const { data: emp } = await supabase.from('employees').select('id, name, dept').eq('id', employeeId).maybeSingle();
  if (!emp) return null;

  // Skor inti.
  const { data: months } = await supabase.from('period_months').select('ym').eq('period_id', period.id);
  const yms = (months ?? []).map((m) => m.ym);
  const { data: kpi } = yms.length
    ? await supabase.from('kpi_scores').select('score').eq('employee_id', employeeId).in('ym', yms) : { data: [] };
  const kpiAvg = kpiAvgOf((kpi ?? []).map((k) => Number(k.score)));
  const { data: r } = await supabase.from('result_360').select('score, late_penalty').eq('employee_id', employeeId).eq('period_id', period.id).maybeSingle();
  const s360 = r?.score ?? null;
  const latePenalty360 = Number(r?.late_penalty ?? 0);
  const { data: fr } = await supabase.from('final_reports').select('status, final_score, content').eq('employee_id', employeeId).eq('period_id', period.id).maybeSingle();
  // Laporan FINAL → angka tersimpan (yang dilihat pegawai); selain itu angka hidup (rumus resmi tunggal).
  const finalScore = displayedFinalOf(finalScoreOf(kpiAvg, s360, period.has_360), fr);
  const frContent = (fr?.content ?? {}) as {
    aspectSummaries?: Record<string, string>;
    qualSummaries?: Record<string, string>;
  };
  const aspectSummaries = frContent.aspectSummaries ?? {};
  const qualSummaries = frContent.qualSummaries ?? {};

  // Aspek & indikator periode.
  const { data: aspectRows } = await supabase.from('culture_aspects').select('id, name, order_idx').eq('period_id', period.id).order('order_idx');
  const aspectList = aspectRows ?? [];
  const { data: indRows } = aspectList.length
    ? await supabase.from('indicators').select('id, aspect_id, text, order_idx').in('aspect_id', aspectList.map((a) => a.id)).order('order_idx') : { data: [] };
  const indById = new Map((indRows ?? []).map((i) => [i.id, i]));
  const indAspect = new Map((indRows ?? []).map((i) => [i.id, i.aspect_id]));

  // Penilaian terkirim untuk pegawai ini.
  const { data: asmts } = await supabase
    .from('assessments').select('id, assessor_id').eq('target_id', employeeId).eq('period_id', period.id).eq('status', 'submitted');
  const asmtList = asmts ?? [];
  const asmtIds = asmtList.map((a) => a.id);

  const { data: scoreRows } = asmtIds.length
    ? await supabase.from('assessment_indicator_scores').select('assessment_id, indicator_id, rating, comment').in('assessment_id', asmtIds) : { data: [] };
  const { data: qaRows } = asmtIds.length
    ? await supabase.from('assessment_qual_answers').select('assessment_id, question_id, answer').in('assessment_id', asmtIds) : { data: [] };
  const { data: quals } = await supabase.from('qualitative_questions').select('id, text').eq('period_id', period.id).order('order_idx');
  const qualById = new Map((quals ?? []).map((q) => [q.id, q.text]));

  const assessorIds = [...new Set(asmtList.map((a) => a.assessor_id))];
  const { data: assessorEmps } = assessorIds.length
    ? await supabase.from('employees').select('id, name').in('id', assessorIds) : { data: [] };
  const nameById = new Map((assessorEmps ?? []).map((e) => [e.id, e.name]));
  const { data: maps } = await supabase.from('mappings').select('assessor_id, relation').eq('target_id', employeeId).eq('period_id', period.id);
  const relById = new Map((maps ?? []).map((m) => [m.assessor_id, m.relation]));
  // Skema bobot aktif (config; dibaca via service_role agar andal untuk semua pemanggil —
  // pegawai/SPV/Direksi belum tentu punya RLS baca weight_schemes).
  const cfg = createAdminClient();
  const [{ data: ws }, { data: ovr }, { data: pmeta }] = await Promise.all([
    cfg.from('weight_schemes').select('model, weights').eq('period_id', period.id).eq('is_active', true).maybeSingle(),
    // Bobot KHUSUS pegawai ini (migrasi 0031) — sama dengan computeResult360 (audit 2026-09-29).
    cfg.from('employee_weight_overrides').select('model, weights').eq('period_id', period.id).eq('employee_id', employeeId).maybeSingle(),
    cfg.from('periods').select('start_date').eq('id', period.id).maybeSingle(),
  ]);
  const scheme = ovr ?? ws;
  // Bobot khusus dipakai apa adanya; skema periode 2 kelas Q3 dst. → bobot otomatis BR-10.
  const wModel = ovr
    ? (ovr.model as Model360)
    : effectiveModel((ws?.model ?? '4class') as Model360, pmeta?.start_date);
  const wVals = (scheme?.weights ?? {}) as WeightValues;
  const hasWS = !!scheme;

  // Aspek skor: OTHERS = TERBOBOT per kelas penilai (meniru computeResult360 — konsisten dgn Skor
  // 360° headline); SELF = rata-rata biasa (satu penilai, tak ada kelas). Kumpulkan rating per
  // (aspek, penilai) → skor per-penilai per-aspek ×20 → kelompokkan per kelas → weightedScore360.
  const aaBag = new Map<string, { sum: number; n: number }>(); // `${aspectId}|${assessorId}` (non-self)
  const aggSelf = new Map<string, { sum: number; n: number }>();
  for (const s of scoreRows ?? []) {
    if (s.rating == null) continue;
    const aid = indAspect.get(s.indicator_id); if (!aid) continue;
    const asmt = asmtList.find((a) => a.id === s.assessment_id); if (!asmt) continue;
    if (asmt.assessor_id === employeeId) {
      const a = aggSelf.get(aid) ?? { sum: 0, n: 0 }; a.sum += s.rating; a.n += 1; aggSelf.set(aid, a);
    } else {
      const k = `${aid}|${asmt.assessor_id}`;
      const a = aaBag.get(k) ?? { sum: 0, n: 0 }; a.sum += s.rating; a.n += 1; aaBag.set(k, a);
    }
  }
  const emptyG = (): Groups360 => ({ atasan: [], peer: [], cross: [], bawahan: [], self: [] });
  const aspectG = new Map<string, Groups360>();
  for (const [k, v] of aaBag) {
    const sep = k.indexOf('|');
    const aid = k.slice(0, sep), assessorId = k.slice(sep + 1);
    const cls = classOf((relById.get(assessorId) ?? 'Peer') as RelationKind);
    let g = aspectG.get(aid); if (!g) { g = emptyG(); aspectG.set(aid, g); }
    g[cls].push((v.sum / v.n) * 20);
  }
  const scoreOfG = (g: Groups360): number | null => {
    if (hasWS) return weightedScore360(g, wModel, wVals);
    const all = [...g.atasan, ...g.peer, ...g.cross, ...g.bawahan];
    return all.length ? all.reduce((a, b) => a + b, 0) / all.length : null;
  };
  const aspects: AspectScore[] = aspectList.map((a) => {
    const g = aspectG.get(a.id);
    return {
      name: a.name,
      score: g ? scoreOfG(g) : null,
      self: aggSelf.has(a.id) ? (aggSelf.get(a.id)!.sum / aggSelf.get(a.id)!.n) * 20 : null,
    };
  });

  // Raw feedback ANONIM per aspek → indikator (untuk HRD). Self dikecualikan agar
  // konsisten dgn skor "Rekan". Akumulasi rating mentah (mis. 4,5,2,3,4,1) + komentar.
  const asmtAssessor = new Map(asmtList.map((a) => [a.id, a.assessor_id]));
  const isSelfAsmt = (asmtId: string) => asmtAssessor.get(asmtId) === employeeId;
  let qnum = 0;
  const byAspect: AspectRaw[] = aspectList.map((asp) => {
    const inds = (indRows ?? []).filter((i) => i.aspect_id === asp.id);
    const indicators: IndicatorRaw[] = inds.map((ind) => {
      qnum += 1;
      const rows = (scoreRows ?? []).filter((s) => s.indicator_id === ind.id && !isSelfAsmt(s.assessment_id));
      const ratings = rows.filter((s) => s.rating != null).map((s) => s.rating as number);
      const comments = rows.filter((s) => s.comment && s.comment.trim()).map((s) => s.comment!.trim());
      return { num: qnum, text: ind.text, ratings, comments };
    });
    return { name: asp.name, indicators };
  });

  // Esai dikelompokkan per pertanyaan (anonim, Self dikecualikan).
  const essays: EssayGroup[] = (quals ?? []).map((q) => ({
    question: q.text,
    answers: (qaRows ?? [])
      .filter((a) => a.question_id === q.id && !isSelfAsmt(a.assessment_id) && a.answer && a.answer.trim())
      .map((a) => a.answer!.trim()),
  })).filter((g) => g.answers.length > 0);

  // Komentar per penilai.
  const assessors: AssessorBlock[] = asmtList.map((a) => {
    const isSelf = a.assessor_id === employeeId;
    const comments = (scoreRows ?? [])
      .filter((s) => s.assessment_id === a.id && s.comment && s.comment.trim())
      .map((s) => ({ indicator: indById.get(s.indicator_id)?.text ?? '—', rating: s.rating, comment: s.comment!.trim() }));
    const answers = (qaRows ?? [])
      .filter((q) => q.assessment_id === a.id && q.answer && q.answer.trim())
      .map((q) => ({ question: qualById.get(q.question_id) ?? '—', answer: q.answer!.trim() }));
    return {
      assessorId: a.assessor_id,
      assessorName: nameById.get(a.assessor_id) ?? '—',
      relation: isSelf ? 'Self' : (relById.get(a.assessor_id) ?? '—'),
      isSelf,
      comments,
      answers,
    };
  }).filter((b) => b.comments.length > 0 || b.answers.length > 0);

  return {
    emp, periodLabel: period.label, has360: period.has_360, status: fr?.status ?? null,
    finalScore, kpiAvg, s360, latePenalty360, aspects, assessors,
    byAspect, essays, aspectSummaries,
    qualSummaries, qualQuestions: (quals ?? []).map((q) => q.text),
  };
}

/**
 * Laporan untuk SPV (Laporan Kinerja Tim) — detail AGREGAT (L1+L2) + umpan balik mentah
 * ANONIM (byAspect/essays). Hanya blok per-penilai BERNAMA (L3 `assessors`, dgn identitas)
 * yang DIBUANG. Dipakai menggantikan loadReport pada jalur SPV karena RLS mencabut akses SPV
 * ke tabel mentah 360° (migrasi 0012) — agregat + raw anonim dihitung server via service_role.
 *
 * Visibilitas (sama untuk anggota tim & diri sendiri):
 *  - Tampak bila HRD sudah merilis (status 'in_review') atau sudah 'finalized'.
 *  - SPV boleh meninjau detail agregat DIRINYA sendiri sejak 'in_review' (ACC diri tetap
 *    nonaktif). Halaman pegawai "Laporan Hasil Saya" tetap terpisah & final-only.
 *  - Di luar tim / status lebih awal (draft) → null (ditolak).
 *
 * Mengembalikan ReportData dengan `assessors` DIKOSONGKAN (L3 bernama) tetapi byAspect/essays
 * DIPERTAHANKAN (raw anonim); pemanggil merender anonim (anonymize + hideAssessorComments +
 * RawFeedback). ⚠️ Umpan balik anonim tetap bisa ter-de-anonimisasi pada kelas penilai kecil.
 */
export async function loadTeamReportForSpv(
  spvId: string,
  employeeId: string,
  period: { id: string; label: string; has_360: boolean },
): Promise<ReportData | null> {
  const admin = createAdminClient() as unknown as SB;

  const isSelf = employeeId === spvId;
  if (!isSelf) {
    const { data: mem } = await admin.from('spv_team_members')
      .select('employee_id').eq('spv_id', spvId).eq('employee_id', employeeId).maybeSingle();
    if (!mem) return null; // di luar tim formal
  }

  const { data: fr } = await admin.from('final_reports')
    .select('status').eq('employee_id', employeeId).eq('period_id', period.id).maybeSingle();
  const status = fr?.status ?? null;
  const visible = status === 'in_review' || status === 'finalized'; // termasuk diri sendiri
  if (!visible) return null; // belum dirilis HRD

  const full = await loadReport(admin, employeeId, period);
  if (!full) return null;
  // Buang HANYA blok per-penilai BERNAMA (L3 `assessors`); pertahankan byAspect/essays
  // (umpan balik mentah ANONIM) agar SPV bisa membaca komentar/rating tanpa identitas penilai.
  return { ...full, assessors: [] };
}

/**
 * Laporan untuk KOORDINATOR (grant `is_coordinator`, migrasi 0021) meninjau anggota tim
 * yang dinaunginya. Cermin loadTeamReportForSpv, tetapi lingkup = `coordinator_team_members`
 * (bukan spv_team_members). Kedalaman = detail agregat (L1+L2) + umpan balik mentah ANONIM
 * (byAspect/essays); hanya blok per-penilai BERNAMA (L3 `assessors`) yang dibuang. Tampak
 * hanya setelah HRD merilis ('in_review'/'finalized'). Karena is_coordinator TIDAK menyalakan
 * RLS, seluruh baca lewat service_role.
 */
export async function loadTeamReportForCoordinator(
  coordinatorId: string,
  employeeId: string,
  period: { id: string; label: string; has_360: boolean },
): Promise<ReportData | null> {
  const admin = createAdminClient() as unknown as SB;

  const { data: mem } = await admin.from('coordinator_team_members')
    .select('employee_id').eq('coordinator_id', coordinatorId).eq('employee_id', employeeId).maybeSingle();
  if (!mem) return null; // di luar tim koordinator

  const { data: fr } = await admin.from('final_reports')
    .select('status').eq('employee_id', employeeId).eq('period_id', period.id).maybeSingle();
  const status = fr?.status ?? null;
  const visible = status === 'in_review' || status === 'finalized';
  if (!visible) return null; // belum dirilis HRD

  const full = await loadReport(admin, employeeId, period);
  if (!full) return null;
  return { ...full, assessors: [] }; // buang L3 bernama; pertahankan byAspect/essays (raw anonim)
}

/**
 * Versi HRD mode-SPV dari loadTeamReportForSpv. HRD secara RLS punya akses penuh,
 * tetapi saat bertindak SEBAGAI SPV (cookie hrd_mode='spv') harus dibatasi setara
 * SPV: detail agregat (L1+L2) + raw ANONIM (byAspect/essays), TANPA L3 bernama (assessors).
 * Lingkup = pegawai SEDIVISI HRD (selaras Laporan Kinerja Tim mode-SPV & Input KPI), bukan
 * spv_team_members (HRD umumnya tak punya entri di situ). Paritas dgn SPV biasa.
 */
export async function loadTeamReportForHrdSpv(
  hrdId: string,
  employeeId: string,
  period: { id: string; label: string; has_360: boolean },
): Promise<ReportData | null> {
  const admin = createAdminClient() as unknown as SB;

  const isSelf = employeeId === hrdId;
  if (!isSelf) {
    const { data: me } = await admin.from('employees').select('dept').eq('id', hrdId).maybeSingle();
    const { data: emp } = await admin.from('employees').select('dept, role').eq('id', employeeId).maybeSingle();
    if (!emp || emp.role === 'direksi' || !me?.dept || emp.dept !== me.dept) return null; // di luar divisi
  }

  const { data: fr } = await admin.from('final_reports')
    .select('status').eq('employee_id', employeeId).eq('period_id', period.id).maybeSingle();
  const status = fr?.status ?? null;
  const visible = status === 'in_review' || status === 'finalized'; // termasuk diri sendiri
  if (!visible) return null;

  const full = await loadReport(admin, employeeId, period);
  if (!full) return null;
  return { ...full, assessors: [] }; // buang L3 bernama; pertahankan byAspect/essays (raw anonim)
}

/**
 * Laporan untuk DIREKSI meninjau laporan SPV (alur eskalasi: Pegawai→SPV, SPV→Direksi).
 * Cermin loadTeamReportForSpv, tetapi lingkupnya subjek berperan SPV. Direksi berperan
 * read-only di level RLS untuk tabel mentah 360°, jadi agregat + raw anonim dihitung server
 * via service_role; hanya blok per-penilai BERNAMA (L3 `assessors`) yang DIBUANG. Direksi
 * melihat L1+L2 + umpan balik mentah ANONIM (byAspect/essays), tanpa identitas penilai.
 *
 * Visibilitas: tampak bila HRD sudah merilis ('in_review') atau 'finalized' — sama
 * seperti SPV meninjau timnya. Target wajib subjek-SPV (lihat isDireksiReviewSubject: role='spv'
 * atau pemimpin tim, non-Direksi); pelaku wajib 'direksi'.
 */
/**
 * Subjek yang ditinjau Direksi (eskalasi SPV→Direksi). Definisi: **bukan Direksi**, non-eksternal,
 * dan **(role='spv' ATAU memimpin tim)** — mencakup SPV literal sekaligus "HRD-posisi yang bertindak
 * sebagai SPV" (mis. memimpin tim di divisinya). role='spv' tanpa anggota tetap masuk.
 */
export async function isDireksiReviewSubject(employeeId: string, adminClient?: SB): Promise<boolean> {
  const admin = adminClient ?? (createAdminClient() as unknown as SB);
  const { data: emp } = await admin.from('employees').select('role, is_external').eq('id', employeeId).maybeSingle();
  if (!emp || emp.role === 'direksi' || emp.is_external) return false;
  if (emp.role === 'spv') return true;
  const { count } = await admin.from('spv_team_members').select('*', { count: 'exact', head: true }).eq('spv_id', employeeId);
  return (count ?? 0) > 0;
}

export async function loadSpvReportForDireksi(
  direksiId: string,
  employeeId: string,
  period: { id: string; label: string; has_360: boolean },
): Promise<ReportData | null> {
  const admin = createAdminClient() as unknown as SB;

  const { data: actor } = await admin.from('employees').select('role').eq('id', direksiId).maybeSingle();
  if (actor?.role !== 'direksi') return null; // hanya Direksi

  if (!(await isDireksiReviewSubject(employeeId, admin))) return null; // hanya subjek SPV / pemimpin tim

  const { data: fr } = await admin.from('final_reports')
    .select('status').eq('employee_id', employeeId).eq('period_id', period.id).maybeSingle();
  const status = fr?.status ?? null;
  const visible = status === 'in_review' || status === 'finalized';
  if (!visible) return null; // belum dirilis HRD

  const full = await loadReport(admin, employeeId, period);
  if (!full) return null;
  return { ...full, assessors: [] }; // buang L3 bernama; pertahankan byAspect/essays (raw anonim)
}

/**
 * Laporan untuk halaman "Review Hasil Akhir" DIREKSI (read-only, oversight eksekutif).
 * Beda dari loadSpvReportForDireksi: lingkup **SEMUA pegawai** (termasuk non-SPV & Direksi/diri
 * sendiri), kedalaman lebih (**L2 + raw feedback ANONIM** byAspect/essays + ringkasan aspek &
 * kualitatif), **TANPA gerbang status** (semua status termasuk draf). Hanya blok per-penilai
 * BERNAMA (L3 `assessors`) yang dibuang. Baca via service_role; Direksi **tak menulis apa pun**.
 * Pelaku wajib 'direksi'.
 */
export async function loadReportForDireksiReview(
  direksiId: string,
  employeeId: string,
  period: { id: string; label: string; has_360: boolean },
): Promise<ReportData | null> {
  const admin = createAdminClient() as unknown as SB;
  const { data: actor } = await admin.from('employees').select('role').eq('id', direksiId).maybeSingle();
  if (actor?.role !== 'direksi') return null; // hanya Direksi
  const full = await loadReport(admin, employeeId, period);
  if (!full) return null;
  return { ...full, assessors: [] }; // buang L3 bernama; pertahankan byAspect/essays (raw anonim)
}
// (loadCrossDivisionReport dihapus — Peninjau Lintas Divisi kini = grant halaman "Review Hasil
//  Akhir" berlingkup, memakai jalur loader Review biasa. Lihat migrasi 0033.)
