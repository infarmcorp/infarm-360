import { createAdminClient, type createClient } from '@/lib/supabase/server';
import { finalScoreOf } from '@/lib/scoring';

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
  penalty: number;
  aspects: AspectScore[];
  assessors: AssessorBlock[];
  // Tambahan untuk view HRD (anonim, dikelompokkan):
  byAspect: AspectRaw[];          // raw feedback per aspek → indikator (+ akumulasi rating)
  essays: EssayGroup[];           // jawaban esai dikelompokkan per pertanyaan
  aspectSummaries: Record<string, string>; // ringkasan HRD per aspek (tersimpan di content)
};

/**
 * Muat data Dokumen Laporan rinci untuk satu pegawai+periode (tunduk RLS pemanggil).
 * Aspek 360° = rerata rating per aspek ×20 (Self dikecualikan dari skor aspek "others",
 * tetapi disimpan terpisah di .self). Komentar mentah dikelompokkan per penilai.
 */
export async function loadReport(supabase: SB, employeeId: string, period: { id: string; label: string; has_360: boolean }): Promise<ReportData | null> {
  const { data: emp } = await supabase.from('employees').select('id, name, dept').eq('id', employeeId).maybeSingle();
  if (!emp) return null;

  // Skor inti.
  const { data: months } = await supabase.from('period_months').select('ym').eq('period_id', period.id);
  const yms = (months ?? []).map((m) => m.ym);
  const { data: kpi } = yms.length
    ? await supabase.from('kpi_scores').select('score').eq('employee_id', employeeId).in('ym', yms) : { data: [] };
  const kpiAvg = kpi && kpi.length ? kpi.reduce((a, b) => a + b.score, 0) / kpi.length : null;
  const { data: r } = await supabase.from('result_360').select('score').eq('employee_id', employeeId).eq('period_id', period.id).maybeSingle();
  const s360 = r?.score ?? null;
  const { data: pen } = await supabase.from('compliance_penalties').select('points').eq('employee_id', employeeId).eq('period_id', period.id).maybeSingle();
  const penalty = pen?.points ?? 0;
  const { data: fr } = await supabase.from('final_reports').select('status, final_score, content').eq('employee_id', employeeId).eq('period_id', period.id).maybeSingle();
  const finalScore = fr?.final_score ?? finalScoreOf(kpiAvg, s360, period.has_360, penalty);
  const frContent = (fr?.content ?? {}) as { aspectSummaries?: Record<string, string> };
  const aspectSummaries = frContent.aspectSummaries ?? {};

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

  // Aspek skor (others vs self).
  const aggOther = new Map<string, { sum: number; n: number }>();
  const aggSelf = new Map<string, { sum: number; n: number }>();
  for (const s of scoreRows ?? []) {
    if (s.rating == null) continue;
    const aid = indAspect.get(s.indicator_id); if (!aid) continue;
    const asmt = asmtList.find((a) => a.id === s.assessment_id); if (!asmt) continue;
    const isSelf = asmt.assessor_id === employeeId;
    const bag = isSelf ? aggSelf : aggOther;
    const a = bag.get(aid) ?? { sum: 0, n: 0 }; a.sum += s.rating; a.n += 1; bag.set(aid, a);
  }
  const aspects: AspectScore[] = aspectList.map((a) => ({
    name: a.name,
    score: aggOther.has(a.id) ? (aggOther.get(a.id)!.sum / aggOther.get(a.id)!.n) * 20 : null,
    self: aggSelf.has(a.id) ? (aggSelf.get(a.id)!.sum / aggSelf.get(a.id)!.n) * 20 : null,
  }));

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
    finalScore, kpiAvg, s360, penalty, aspects, assessors,
    byAspect, essays, aspectSummaries,
  };
}

/**
 * Laporan untuk SPV (Laporan Kinerja Tim) — HANYA detail AGREGAT, tanpa umpan
 * balik mentah lapis 3 (komentar/identitas per penilai). Dipakai menggantikan
 * loadReport pada jalur SPV karena RLS kini mencabut akses SPV ke tabel mentah
 * 360° (migrasi 0012) — agregat dihitung di server via service_role lalu lapis 3
 * DIBUANG sebelum dikembalikan.
 *
 * Visibilitas (sama untuk anggota tim & diri sendiri):
 *  - Tampak bila HRD sudah merilis (status 'in_review') atau sudah 'finalized'.
 *  - SPV boleh meninjau detail agregat DIRINYA sendiri sejak 'in_review' (ACC diri tetap
 *    nonaktif). Halaman pegawai "Laporan Hasil Saya" tetap terpisah & final-only.
 *  - Di luar tim / status lebih awal (draft) → null (ditolak).
 *
 * Mengembalikan ReportData dengan assessors/byAspect/essays DIKOSONGKAN; pemanggil
 * tetap wajib merender anonim (anonymize + hideAssessorComments).
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
  // Buang lapis 3 (komentar mentah + per-penilai) sebelum keluar ke SPV.
  return { ...full, assessors: [], byAspect: [], essays: [] };
}

/**
 * Versi HRD mode-SPV dari loadTeamReportForSpv. HRD secara RLS punya akses penuh,
 * tetapi saat bertindak SEBAGAI SPV (cookie hrd_mode='spv') harus dibatasi setara
 * SPV: HANYA detail agregat (L1+L2), TANPA umpan balik mentah (L3). Lingkup =
 * pegawai SEDIVISI HRD (selaras Laporan Kinerja Tim mode-SPV & Input KPI), bukan
 * spv_team_members (HRD umumnya tak punya entri di situ).
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
  return { ...full, assessors: [], byAspect: [], essays: [] };
}

/**
 * Laporan untuk PENINJAU HASIL LINTAS DIVISI (grant is_cross_reviewer, migrasi 0018).
 * Tujuan: membantu HRD meringkas Hasil Akhir 360° pegawai di DIVISI LAIN — sengaja
 * MENGECUALIKAN divisi peninjau sendiri (konflik kepentingan/privasi rekan sedivisi).
 *
 * Keamanan (penegakan privasi NYATA, bukan app-only): peninjau berposisi non-HRD →
 * RLS menolak akses tabel mentah, jadi SATU-SATUNYA jalur baca adalah fungsi ini yang
 * memakai service_role TAPI menolak bila target sedivisi/peminjau bukan pemegang grant.
 *
 * Kedalaman data = L2 + komentar ANONIM (skor, radar/aspek, byAspect, essays) — yang
 * dibutuhkan untuk menulis Ringkasan Aspek. Blok per-penilai BERNAMA (assessors / L3)
 * tetap DIBUANG. Tak ada gerbang status: peninjau mendampingi kerja review HRD sejak draf.
 */
export async function loadCrossDivisionReport(
  reviewerId: string,
  employeeId: string,
  period: { id: string; label: string; has_360: boolean },
): Promise<ReportData | null> {
  const admin = createAdminClient() as unknown as SB;

  const { data: reviewer } = await admin.from('employees')
    .select('dept, is_cross_reviewer').eq('id', reviewerId).maybeSingle();
  if (!reviewer?.is_cross_reviewer || !reviewer.dept) return null; // bukan pemegang grant

  const { data: emp } = await admin.from('employees')
    .select('dept, role, is_external').eq('id', employeeId).maybeSingle();
  // Target wajib: ada, non-direksi, non-eksternal, & DIVISI BERBEDA dari peninjau.
  if (!emp || emp.role === 'direksi' || emp.is_external || emp.dept === reviewer.dept) return null;

  const full = await loadReport(admin, employeeId, period);
  if (!full) return null;
  // Buang blok per-penilai bernama (L3). Pertahankan byAspect/essays (komentar anonim).
  return { ...full, assessors: [] };
}
