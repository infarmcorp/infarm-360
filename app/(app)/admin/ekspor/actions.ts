'use server';

import { createClient, createAdminClient } from '@/lib/supabase/server';
import { fetchAllPaged } from '@/lib/supabase/paginate';
import { canAdmin } from '@/lib/auth/roles';
import { finalScoreOf, playerClassOf, playerLabelOf, perfLabelOf } from '@/lib/scoring';
import { classOf, avg, weightedScore360, type Groups360 } from '@/lib/score360';
import type { RelationKind, WeightValues } from '@/lib/database.types';

/**
 * Ekspor dataset untuk olah data lanjutan (HRD). Halaman ini hanya untuk HRD; setelah
 * otorisasi, baca pakai service_role agar dataset lengkap (lintas RLS) — TIDAK meneruskan
 * input mentah, hanya menyusun ekspor read-only. Setiap fungsi mengembalikan baris datar.
 *
 * Semua fungsi menerima `periodId` opsional: null/undefined = seluruh periode; bila diisi,
 * dataset disaring ke periode itu (dataset Pegawai bersifat master → mengabaikan filter).
 */
export type Row = Record<string, string | number | null>;
export type ExportResult = { ok: true; rows: Row[] } | { ok: false; error: string };
export type Sheet = { name: string; rows: Row[] };
export type ConfigResult = { ok: true; sheets: Sheet[] } | { ok: false; error: string };
type Admin = ReturnType<typeof createAdminClient>;

/**
 * Ambil SELURUH baris tabel anak yang difilter `.in(col, ids)`, menembus DUA batas Supabase:
 *  - CHUNK: `.in()` menaruh tiap id di URL → daftar id terlalu panjang (~16KB header) ditolak
 *    total. Pecah ids jadi kelompok kecil dulu.
 *  - PAGE: PostgREST membatasi 1000 baris/request (db.max_rows) → paginasi `.range()` tiap chunk.
 * `run` harus menyertakan `.order(...)` deterministik agar paginasi antar-halaman tak bocor/dobel.
 */
async function fetchAllChunked<T>(
  ids: string[],
  run: (chunk: string[], from: number, to: number) => PromiseLike<{ data: T[] | null }>,
): Promise<T[]> {
  const CHUNK = 150;  // ~150 uuid × ~40 char ≈ 6KB — jauh di bawah batas header
  const PAGE = 1000;  // batas baris/request PostgREST
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK);
    for (let from = 0; ; from += PAGE) {
      const { data } = await run(chunk, from, from + PAGE - 1);
      if (data?.length) out.push(...data);
      if (!data || data.length < PAGE) break;
    }
  }
  return out;
}

async function requireHrd(): Promise<boolean> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;
  const { data: me } = await supabase.from('employees').select('role, is_hrd_admin').eq('id', user.id).maybeSingle();
  return canAdmin(me);
}

const KAT = (f: number | null) => perfLabelOf(f);
// 2 desimal — selaras tampilan app (round2) & perhitungan manual HRD dari ekspor.
const r2 = (n: number) => Math.round(n * 100) / 100;

/** ym→label periode + himpunan ym yang diizinkan bila difilter ke satu periode. */
async function periodMaps(admin: Admin, periodId?: string | null) {
  const [{ data: pm }, { data: periods }] = await Promise.all([
    admin.from('period_months').select('period_id, ym'),
    admin.from('periods').select('id, label'),
  ]);
  const plabel = new Map((periods ?? []).map((p) => [p.id, p.label]));
  const ymToPid = new Map((pm ?? []).map((m) => [m.ym, m.period_id]));
  const allowYm = periodId ? new Set((pm ?? []).filter((m) => m.period_id === periodId).map((m) => m.ym)) : null;
  return { plabel, ymToPid, allowYm };
}

/** Dataset Pegawai (master, lintas periode): kode, nama, divisi, peran, status, atasan, email. */
export async function exportEmployees(): Promise<ExportResult> {
  if (!(await requireHrd())) return { ok: false, error: 'Hanya HRD' };
  const admin = createAdminClient();
  const { data: emps } = await admin.from('employees').select('id, emp_code, name, dept, role, is_active').order('emp_code');
  const list = emps ?? [];
  const nameById = new Map(list.map((e) => [e.id, e.name]));
  const { data: teams } = await admin.from('spv_team_members').select('spv_id, employee_id');
  const spvByEmp = new Map<string, string>();
  (teams ?? []).forEach((t) => { if (!spvByEmp.has(t.employee_id)) spvByEmp.set(t.employee_id, t.spv_id); });
  const emailById = new Map<string, string>();
  try {
    let page = 1;
    for (;;) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
      if (error) break;
      data.users.forEach((u) => { if (u.email) emailById.set(u.id, u.email); });
      if (data.users.length < 200) break; page++;
    }
  } catch { /* email opsional */ }
  const rows: Row[] = list.map((e) => ({
    kode: e.emp_code, nama: e.name, divisi: e.dept, peran: e.role,
    status: e.is_active ? 'aktif' : 'nonaktif',
    atasan: spvByEmp.get(e.id) ? nameById.get(spvByEmp.get(e.id)!) ?? '' : '',
    email: emailById.get(e.id) ?? '',
  }));
  return { ok: true, rows };
}

/** Dataset KPI Bulanan (long): periode, kode, nama, divisi, bulan, skor. */
export async function exportKpi(periodId?: string | null): Promise<ExportResult> {
  if (!(await requireHrd())) return { ok: false, error: 'Hanya HRD' };
  const admin = createAdminClient();
  const { plabel, ymToPid, allowYm } = await periodMaps(admin, periodId);
  const { data: emps } = await admin.from('employees').select('id, emp_code, name, dept');
  const byId = new Map((emps ?? []).map((e) => [e.id, e]));
  const kpi = await fetchAllPaged<{ employee_id: string; ym: string; score: number }>((from, to) =>
    admin.from('kpi_scores').select('employee_id, ym, score').order('ym').order('employee_id').range(from, to));
  const rows: Row[] = kpi.filter((k) => !allowYm || allowYm.has(k.ym)).map((k) => {
    const e = byId.get(k.employee_id);
    return { periode: plabel.get(ymToPid.get(k.ym) ?? '') ?? '', kode: e?.emp_code ?? '', nama: e?.name ?? '', divisi: e?.dept ?? '', bulan: k.ym, skor_kpi: k.score };
  });
  return { ok: true, rows };
}

/** Dataset Log Audit KPI: periode, kode, nama, divisi, bulan, skor, diubah_oleh, waktu, catatan. */
export async function exportKpiAudit(periodId?: string | null): Promise<ExportResult> {
  if (!(await requireHrd())) return { ok: false, error: 'Hanya HRD' };
  const admin = createAdminClient();
  const { plabel, ymToPid, allowYm } = await periodMaps(admin, periodId);
  const { data: emps } = await admin.from('employees').select('id, emp_code, name, dept');
  const byId = new Map((emps ?? []).map((e) => [e.id, e]));
  const audit = await fetchAllPaged<{ employee_id: string; ym: string; score: number; changed_by: string | null; changed_at: string; note: string | null }>((from, to) =>
    admin.from('kpi_audit').select('employee_id, ym, score, changed_by, changed_at, note')
      .order('changed_at', { ascending: false }).order('employee_id').range(from, to));
  const list = audit.filter((a) => !allowYm || allowYm.has(a.ym));
  const changerIds = [...new Set(list.map((a) => a.changed_by).filter(Boolean) as string[])];
  const changerName = new Map<string, string>();
  if (changerIds.length) {
    const { data: ch } = await admin.from('employees').select('id, name').in('id', changerIds);
    (ch ?? []).forEach((c) => changerName.set(c.id, c.name));
  }
  const rows: Row[] = list.map((a) => {
    const e = byId.get(a.employee_id);
    return {
      periode: plabel.get(ymToPid.get(a.ym) ?? '') ?? '', kode: e?.emp_code ?? '', nama: e?.name ?? '', divisi: e?.dept ?? '',
      bulan: a.ym, skor: a.score, diubah_oleh: a.changed_by ? (changerName.get(a.changed_by) ?? '—') : '—',
      waktu: a.changed_at, catatan: a.note ?? '',
    };
  });
  return { ok: true, rows };
}

/** Dataset Kepatuhan / Punishment: periode, kode, nama, divisi, poin, alasan, ditetapkan_oleh. */
export async function exportPenalties(periodId?: string | null): Promise<ExportResult> {
  if (!(await requireHrd())) return { ok: false, error: 'Hanya HRD' };
  const admin = createAdminClient();
  const { data: emps } = await admin.from('employees').select('id, emp_code, name, dept');
  const byId = new Map((emps ?? []).map((e) => [e.id, e]));
  const { data: periods } = await admin.from('periods').select('id, label');
  const plabel = new Map((periods ?? []).map((p) => [p.id, p.label]));
  const pen = await fetchAllPaged<{ employee_id: string; period_id: string; points: number; reason: string | null; set_by: string | null }>((from, to) => {
    let q = admin.from('compliance_penalties').select('employee_id, period_id, points, reason, set_by');
    if (periodId) q = q.eq('period_id', periodId);
    return q.order('period_id').order('employee_id').range(from, to);
  });
  const setterIds = [...new Set(pen.map((p) => p.set_by).filter(Boolean) as string[])];
  const setterName = new Map<string, string>();
  if (setterIds.length) {
    const { data: s } = await admin.from('employees').select('id, name').in('id', setterIds);
    (s ?? []).forEach((c) => setterName.set(c.id, c.name));
  }
  const rows: Row[] = pen.map((p) => {
    const e = byId.get(p.employee_id);
    return {
      periode: plabel.get(p.period_id) ?? '', kode: e?.emp_code ?? '', nama: e?.name ?? '', divisi: e?.dept ?? '',
      poin_punishment: p.points, alasan: p.reason ?? '', ditetapkan_oleh: p.set_by ? (setterName.get(p.set_by) ?? '—') : '—',
    };
  });
  return { ok: true, rows };
}

/** Dataset Rekap Kinerja per Periode: KPI rerata, 360, punishment, Skor Akhir, kategori, player. */
export async function exportRekap(periodId?: string | null): Promise<ExportResult> {
  if (!(await requireHrd())) return { ok: false, error: 'Hanya HRD' };
  const admin = createAdminClient();
  // kpi_scores/result_360/penalties LINTAS periode → bisa >1000; ambil penuh.
  const [{ data: emps }, { data: periodsAll }, { data: pmonths }, kpi, r360, pen] = await Promise.all([
    // Direksi SENGAJA IKUT (subjek 360° — keputusan 2026-07-08): guard `kpiAvg==null && s360==null`
    // di bawah memastikan hanya yang PUNYA data (mis. Direksi ber-360°) yang muncul.
    admin.from('employees').select('id, emp_code, name, dept'),
    admin.from('periods').select('id, label, has_360, start_date').order('start_date'),
    admin.from('period_months').select('period_id, ym'),
    fetchAllPaged<{ employee_id: string; ym: string; score: number }>((from, to) =>
      admin.from('kpi_scores').select('employee_id, ym, score').order('employee_id').order('ym').range(from, to)),
    fetchAllPaged<{ employee_id: string; period_id: string; score: number | null }>((from, to) =>
      admin.from('result_360').select('employee_id, period_id, score').order('employee_id').order('period_id').range(from, to)),
    fetchAllPaged<{ employee_id: string; period_id: string; points: number }>((from, to) =>
      admin.from('compliance_penalties').select('employee_id, period_id, points').order('employee_id').order('period_id').range(from, to)),
  ]);
  const periods = (periodsAll ?? []).filter((p) => !periodId || p.id === periodId);
  const monthsByPeriod = new Map<string, string[]>();
  (pmonths ?? []).forEach((m) => { const a = monthsByPeriod.get(m.period_id) ?? []; a.push(m.ym); monthsByPeriod.set(m.period_id, a); });
  const kpiByCell = new Map<string, { s: number; n: number }>();
  kpi.forEach((k) => { const key = `${k.employee_id}|${k.ym}`; const a = kpiByCell.get(key) ?? { s: 0, n: 0 }; a.s += k.score; a.n++; kpiByCell.set(key, a); });
  const s360By = new Map(r360.map((r) => [`${r.employee_id}|${r.period_id}`, r.score]));
  const penBy = new Map(pen.map((p) => [`${p.employee_id}|${p.period_id}`, p.points]));

  const rows: Row[] = [];
  for (const p of periods) {
    const yms = monthsByPeriod.get(p.id) ?? [];
    for (const e of emps ?? []) {
      const present = yms.map((ym) => kpiByCell.get(`${e.id}|${ym}`)).filter(Boolean).map((a) => a!.s / a!.n);
      const kpiAvg = present.length ? present.reduce((a, b) => a + b, 0) / present.length : null;
      const s360 = p.has_360 ? (s360By.get(`${e.id}|${p.id}`) ?? null) : null;
      const penalty = penBy.get(`${e.id}|${p.id}`) ?? 0;
      if (kpiAvg == null && s360 == null) continue;
      // allow360Only: subjek ber-360°-tanpa-KPI (mis. Direksi) → Skor Akhir dari 360° saja.
      const final = finalScoreOf(kpiAvg, s360, p.has_360, penalty, true);
      const player = playerClassOf(kpiAvg, s360); // s360 sudah null bila 360 nonaktif
      rows.push({
        periode: p.label, kode: e.emp_code, nama: e.name, divisi: e.dept,
        kpi_rerata: kpiAvg != null ? r2(kpiAvg) : null, skor_360: s360 != null ? r2(s360) : null,
        punishment: penalty, skor_akhir: final != null ? r2(final) : null,
        kategori: KAT(final), player: playerLabelOf(player),
      });
    }
  }
  return { ok: true, rows };
}

/**
 * Dataset Ringkasan Naratif (HRD/Peninjau): teks evaluasi yang ditulis di Review Hasil Akhir,
 * tersimpan di final_reports.content — baik ringkasan ASPEK 360° (aspectSummaries) maupun
 * ringkasan PERTANYAAN KUALITATIF (qualSummaries). Satu baris per (pegawai × item) yang punya
 * ringkasan; entri kosong dilewati. Kolom `jenis` membedakan Aspek vs Pertanyaan Kualitatif.
 */
export async function exportAspectSummaries(periodId?: string | null): Promise<ExportResult> {
  if (!(await requireHrd())) return { ok: false, error: 'Hanya HRD' };
  const admin = createAdminClient();
  const [{ data: emps }, { data: periods }, reports] = await Promise.all([
    admin.from('employees').select('id, emp_code, name, dept'),
    admin.from('periods').select('id, label, start_date').order('start_date'),
    // final_reports lintas periode (employee × period) → bisa >1000; ambil penuh.
    fetchAllPaged<{ employee_id: string; period_id: string; status: string; content: Record<string, unknown> | null }>((from, to) =>
      admin.from('final_reports').select('employee_id, period_id, status, content').order('period_id').order('employee_id').range(from, to)),
  ]);
  const empById = new Map((emps ?? []).map((e) => [e.id, e]));
  const plabel = new Map((periods ?? []).map((p) => [p.id, p.label]));
  const STATUS: Record<string, string> = { draft: 'Draf', in_review: 'Ditinjau SPV', finalized: 'Final' };

  const rows: Row[] = [];
  for (const r of reports) {
    if (periodId && r.period_id !== periodId) continue;
    const content = (r.content ?? {}) as {
      aspectSummaries?: Record<string, string>;
      qualSummaries?: Record<string, string>;
    };
    const e = empById.get(r.employee_id);
    const emit = (jenis: string, obj: Record<string, string>) => {
      for (const [item, teks] of Object.entries(obj)) {
        if (!teks || !teks.trim()) continue;
        rows.push({
          periode: plabel.get(r.period_id) ?? r.period_id,
          kode: e?.emp_code ?? null, nama: e?.name ?? '—', divisi: e?.dept ?? '—',
          status_laporan: STATUS[r.status] ?? r.status,
          jenis, aspek_atau_pertanyaan: item, ringkasan: teks.trim(),
        });
      }
    };
    emit('Aspek', content.aspectSummaries ?? {});
    emit('Pertanyaan Kualitatif', content.qualSummaries ?? {});
  }
  rows.sort((a, b) =>
    String(a.periode).localeCompare(String(b.periode)) ||
    String(a.nama).localeCompare(String(b.nama)) ||
    String(a.jenis).localeCompare(String(b.jenis)) ||
    String(a.aspek_atau_pertanyaan).localeCompare(String(b.aspek_atau_pertanyaan)));
  return { ok: true, rows };
}

/** Dataset Penilaian 360 Detail (ANONIM penilai): periode, target, divisi, relasi, aspek, indikator, rating, komentar. */
export async function exportAssessments(periodId?: string | null): Promise<ExportResult> {
  if (!(await requireHrd())) return { ok: false, error: 'Hanya HRD' };
  const admin = createAdminClient();
  // assessments & mappings lintas periode → bisa >1000; ambil penuh.
  const [{ data: emps }, { data: periods }, asmts, { data: inds }, { data: aspects }, mapsAll] = await Promise.all([
    admin.from('employees').select('id, emp_code, name, dept'),
    admin.from('periods').select('id, label'),
    fetchAllPaged<{ id: string; period_id: string; assessor_id: string; target_id: string; status: string }>((from, to) => {
      let q = admin.from('assessments').select('id, period_id, assessor_id, target_id, status').eq('status', 'submitted');
      if (periodId) q = q.eq('period_id', periodId);
      return q.order('id').range(from, to);
    }),
    admin.from('indicators').select('id, text, aspect_id'),
    admin.from('culture_aspects').select('id, name'),
    fetchAllPaged<{ assessor_id: string; target_id: string; period_id: string; relation: RelationKind }>((from, to) =>
      admin.from('mappings').select('assessor_id, target_id, period_id, relation').order('assessor_id').order('target_id').range(from, to)),
  ]);
  const byId = new Map((emps ?? []).map((e) => [e.id, e]));
  const periodLabel = new Map((periods ?? []).map((p) => [p.id, p.label]));
  const aspectName = new Map((aspects ?? []).map((a) => [a.id, a.name]));
  const indMeta = new Map((inds ?? []).map((i) => [i.id, { text: i.text, aspek: aspectName.get(i.aspect_id) ?? '' }]));
  const relBy = new Map(mapsAll.map((m) => [`${m.assessor_id}|${m.target_id}|${m.period_id}`, m.relation]));
  const asmtIds = asmts.map((a) => a.id);
  const scoresByAsmt = new Map<string, { indicator_id: string; rating: number | null; comment: string | null }[]>();
  if (asmtIds.length) {
    // Tarik SEMUA skor per-indikator, menembus batas 1000-baris/request & panjang URL .in()
    // (lihat fetchAllChunked) — di kuartal penuh baris (assessment × indikator) mudah > 1000
    // dan jumlah id mudah membuat URL .in() kepanjangan.
    const sc = await fetchAllChunked(asmtIds, (chunk, from, to) =>
      admin.from('assessment_indicator_scores')
        .select('assessment_id, indicator_id, rating, comment')
        .in('assessment_id', chunk)
        .order('assessment_id').order('indicator_id')
        .range(from, to));
    sc.forEach((s) => { const a = scoresByAsmt.get(s.assessment_id) ?? []; a.push(s); scoresByAsmt.set(s.assessment_id, a); });
  }
  const rows: Row[] = [];
  for (const a of asmts) {
    const target = byId.get(a.target_id);
    const rel = a.assessor_id === a.target_id ? 'Self' : relBy.get(`${a.assessor_id}|${a.target_id}|${a.period_id}`) ?? '';
    for (const s of scoresByAsmt.get(a.id) ?? []) {
      const ind = indMeta.get(s.indicator_id);
      rows.push({
        periode: periodLabel.get(a.period_id) ?? '',
        dinilai: target?.name ?? '', divisi: target?.dept ?? '',
        relasi: rel, aspek: ind?.aspek ?? '', indikator: ind?.text ?? '',
        rating: s.rating, komentar: s.comment ?? '',
      });
    }
  }
  return { ok: true, rows };
}

/**
 * Dataset Umpan Balik Kualitatif 360° / esai (ANONIM penilai): periode, target, divisi,
 * relasi, pertanyaan, jawaban. Sumber `assessment_qual_answers` → `qualitative_questions`
 * (jawaban esai terpisah, beda dari komentar per-indikator di exportAssessments).
 */
export async function exportQualAnswers(periodId?: string | null): Promise<ExportResult> {
  if (!(await requireHrd())) return { ok: false, error: 'Hanya HRD' };
  const admin = createAdminClient();
  // assessments & mappings lintas periode → bisa >1000; ambil penuh.
  const [{ data: emps }, { data: periods }, asmts, { data: quals }, mapsAll] = await Promise.all([
    admin.from('employees').select('id, name, dept'),
    admin.from('periods').select('id, label'),
    fetchAllPaged<{ id: string; period_id: string; assessor_id: string; target_id: string }>((from, to) => {
      let q = admin.from('assessments').select('id, period_id, assessor_id, target_id').eq('status', 'submitted');
      if (periodId) q = q.eq('period_id', periodId);
      return q.order('id').range(from, to);
    }),
    admin.from('qualitative_questions').select('id, text, order_idx').order('order_idx'),
    fetchAllPaged<{ assessor_id: string; target_id: string; period_id: string; relation: RelationKind }>((from, to) =>
      admin.from('mappings').select('assessor_id, target_id, period_id, relation').order('assessor_id').order('target_id').range(from, to)),
  ]);
  const byId = new Map((emps ?? []).map((e) => [e.id, e]));
  const periodLabel = new Map((periods ?? []).map((p) => [p.id, p.label]));
  const qOrder = new Map((quals ?? []).map((q, i) => [q.id, i]));
  const qText = new Map((quals ?? []).map((q) => [q.id, q.text]));
  const relBy = new Map(mapsAll.map((m) => [`${m.assessor_id}|${m.target_id}|${m.period_id}`, m.relation]));
  const asmtIds = asmts.map((a) => a.id);
  const ansByAsmt = new Map<string, { question_id: string; answer: string | null }[]>();
  if (asmtIds.length) {
    // Tarik SEMUA jawaban esai — lihat catatan di fetchAllChunked (batas 1000-baris & panjang URL .in()).
    const ans = await fetchAllChunked(asmtIds, (chunk, from, to) =>
      admin.from('assessment_qual_answers')
        .select('assessment_id, question_id, answer')
        .in('assessment_id', chunk)
        .order('assessment_id').order('question_id')
        .range(from, to));
    ans.forEach((x) => { const a = ansByAsmt.get(x.assessment_id) ?? []; a.push(x); ansByAsmt.set(x.assessment_id, a); });
  }
  const rows: Row[] = [];
  for (const a of asmts) {
    const target = byId.get(a.target_id);
    const rel = a.assessor_id === a.target_id ? 'Self' : relBy.get(`${a.assessor_id}|${a.target_id}|${a.period_id}`) ?? '';
    const answers = (ansByAsmt.get(a.id) ?? [])
      .filter((x) => x.answer && x.answer.trim())
      .sort((x, y) => (qOrder.get(x.question_id) ?? 0) - (qOrder.get(y.question_id) ?? 0));
    for (const x of answers) {
      rows.push({
        periode: periodLabel.get(a.period_id) ?? '',
        dinilai: target?.name ?? '', divisi: target?.dept ?? '',
        relasi: rel, pertanyaan: qText.get(x.question_id) ?? '', jawaban: x.answer ?? '',
      });
    }
  }
  return { ok: true, rows };
}

/**
 * Ringkasan 360° per pegawai (ANONIM) — satu baris per (periode × pegawai dinilai):
 * jumlah penilai DIPETAKAN (Atasan / Internal = Peer+Cross+Bawahan), rata-rata skor per kelas
 * (skala 1–5), Nilai Self, Nilai 360° terbobot (1–5), Gap Self−Others, & Skala 100.
 *
 * Definisi (dikonfirmasi HRD 2026-07-12):
 *  - Jml Penilai   = penilai NON-Self yang DIPETAKAN (mappings), = Jml Atasan + Jml Internal.
 *  - Nilai per kelas = rata-rata skor per-penilai (mean rating ×20 → dibagi 20 utk skala 1–5),
 *    Internal = gabungan Peer+Cross+Bawahan (selaras weightedScore360 2-kelas).
 *  - Nilai 360° (1–5) = weightedScore360 (model/bobot aktif periode) ÷ 20; Self DIKECUALIKAN.
 *  - Skala 100 = weightedScore360 (skor resmi, dihitung fresh dari rating saat ini).
 * Dihitung LIVE dari rating agar sheet konsisten internal (nilai_360×20 = skala_100) & selaras
 * cara hitung manual HRD — bisa beda dari result_360 tersimpan yang basi sampai "Hitung Ulang".
 */
export async function exportSummary360(periodId?: string | null): Promise<ExportResult> {
  if (!(await requireHrd())) return { ok: false, error: 'Hanya HRD' };
  const admin = createAdminClient();
  // assessments & mappings lintas periode → bisa >1000; ambil penuh. weight_schemes 1/periode (kecil).
  const [{ data: emps }, { data: periodsAll }, asmts, mapsAll, { data: ws }] = await Promise.all([
    admin.from('employees').select('id, emp_code, name, dept'),
    admin.from('periods').select('id, label, start_date').order('start_date'),
    fetchAllPaged<{ id: string; period_id: string; assessor_id: string; target_id: string }>((from, to) => {
      let q = admin.from('assessments').select('id, period_id, assessor_id, target_id').eq('status', 'submitted');
      if (periodId) q = q.eq('period_id', periodId);
      return q.order('id').range(from, to);
    }),
    fetchAllPaged<{ assessor_id: string; target_id: string; period_id: string; relation: RelationKind }>((from, to) => {
      let q = admin.from('mappings').select('assessor_id, target_id, period_id, relation');
      if (periodId) q = q.eq('period_id', periodId);
      return q.order('assessor_id').order('target_id').range(from, to);
    }),
    (periodId
      ? admin.from('weight_schemes').select('period_id, model, weights').eq('is_active', true).eq('period_id', periodId)
      : admin.from('weight_schemes').select('period_id, model, weights').eq('is_active', true)),
  ]);
  const empById = new Map((emps ?? []).map((e) => [e.id, e]));
  const periodLabel = new Map((periodsAll ?? []).map((p) => [p.id, p.label]));
  const wsByPeriod = new Map((ws ?? []).map((w) => [w.period_id, { model: w.model as '4class' | '2class', weights: w.weights as WeightValues }]));
  const relBy = new Map(mapsAll.map((m) => [`${m.assessor_id}|${m.target_id}|${m.period_id}`, m.relation as RelationKind]));

  // Hitung penilai DIPETAKAN per (periode|target): Atasan vs Internal (Peer+Cross+Bawahan); Self dilewati.
  const counts = new Map<string, { atasan: number; internal: number; periodId: string; targetId: string }>();
  mapsAll.forEach((m) => {
    if ((m.relation as RelationKind) === 'Self' || m.assessor_id === m.target_id) return;
    const key = `${m.period_id}|${m.target_id}`;
    const c = counts.get(key) ?? { atasan: 0, internal: 0, periodId: m.period_id, targetId: m.target_id };
    if ((m.relation as RelationKind) === 'Atasan') c.atasan += 1; else c.internal += 1;
    counts.set(key, c);
  });

  // Skor per-penilai (mean rating ×20) → grup per kelas per (periode|target).
  const asmtIds = asmts.map((a) => a.id);
  const ratingsByAsmt = new Map<string, number[]>();
  if (asmtIds.length) {
    const sc = await fetchAllChunked<{ assessment_id: string; rating: number | null }>(asmtIds, (chunk, from, to) =>
      admin.from('assessment_indicator_scores').select('assessment_id, rating')
        .in('assessment_id', chunk).order('assessment_id').order('indicator_id').range(from, to));
    sc.forEach((s) => { if (s.rating == null) return; const a = ratingsByAsmt.get(s.assessment_id) ?? []; a.push(s.rating); ratingsByAsmt.set(s.assessment_id, a); });
  }
  const groups = new Map<string, Groups360>();
  for (const a of asmts) {
    const rs = ratingsByAsmt.get(a.id);
    const m = rs && avg(rs);
    if (m == null) continue;
    const score100 = m * 20;
    if (score100 <= 0) continue;
    const rel: RelationKind = a.assessor_id === a.target_id ? 'Self' : relBy.get(`${a.assessor_id}|${a.target_id}|${a.period_id}`) ?? 'Peer';
    const key = `${a.period_id}|${a.target_id}`;
    const g = groups.get(key) ?? { atasan: [], peer: [], cross: [], bawahan: [], self: [] };
    g[classOf(rel)].push(score100);
    groups.set(key, g);
  }

  // Roster = semua (periode|target) yang punya pemetaan non-self, disaring ke periode terpilih.
  const to5 = (v: number | null) => (v == null ? null : r2(v / 20));
  const rows: Row[] = [];
  for (const [key, c] of counts) {
    if (periodId && c.periodId !== periodId) continue;
    const emp = empById.get(c.targetId);
    if (!emp) continue;
    const g = groups.get(key) ?? { atasan: [], peer: [], cross: [], bawahan: [], self: [] };
    const wsp = wsByPeriod.get(c.periodId);
    const s100 = wsp ? weightedScore360(g, wsp.model, wsp.weights) : null;
    const nilai360 = to5(s100);
    const nilaiSelf = to5(avg(g.self));
    rows.push({
      periode: periodLabel.get(c.periodId) ?? '',
      kode: emp.emp_code, nama: emp.name, divisi: emp.dept,
      jml_penilai: c.atasan + c.internal, jml_atasan: c.atasan, jml_internal: c.internal,
      nilai_atasan: to5(avg(g.atasan)),
      nilai_internal: to5(avg([...g.peer, ...g.cross, ...g.bawahan])),
      nilai_self: nilaiSelf,
      nilai_360: nilai360,
      gap_self_vs_others: nilaiSelf != null && nilai360 != null ? r2(nilaiSelf - nilai360) : null,
      skala_100: s100 != null ? r2(s100) : null,
    });
  }
  rows.sort((a, b) => String(a.periode).localeCompare(String(b.periode)) || String(a.nama).localeCompare(String(b.nama)));
  return { ok: true, rows };
}

/**
 * Rekap Nilai per ASPEK BUDAYA (ANONIM penilai) — per pegawai × aspek: Skor 360° TERBOBOT
 * (others per kelas via weightedScore360, konsisten dgn radar/laporan) + Nilai Diri (self) +
 * Gap. Bulk memakai primitif TERKUNCI lib/score360 (bukan 52× loadReport). Skala 0–100.
 */
export async function exportAspectScores(periodId?: string | null): Promise<ExportResult> {
  if (!(await requireHrd())) return { ok: false, error: 'Hanya HRD' };
  const admin = createAdminClient();
  // assessments & mappings lintas periode → bisa >1000; ambil penuh.
  const [{ data: emps }, { data: periodsAll }, asmts, mapsAll, { data: ws }, { data: inds }, { data: aspects }] = await Promise.all([
    admin.from('employees').select('id, emp_code, name, dept'),
    admin.from('periods').select('id, label, start_date').order('start_date'),
    fetchAllPaged<{ id: string; period_id: string; assessor_id: string; target_id: string }>((from, to) => {
      let q = admin.from('assessments').select('id, period_id, assessor_id, target_id').eq('status', 'submitted');
      if (periodId) q = q.eq('period_id', periodId);
      return q.order('id').range(from, to);
    }),
    fetchAllPaged<{ assessor_id: string; target_id: string; period_id: string; relation: RelationKind }>((from, to) => {
      let q = admin.from('mappings').select('assessor_id, target_id, period_id, relation');
      if (periodId) q = q.eq('period_id', periodId);
      return q.order('assessor_id').order('target_id').range(from, to);
    }),
    (periodId
      ? admin.from('weight_schemes').select('period_id, model, weights').eq('is_active', true).eq('period_id', periodId)
      : admin.from('weight_schemes').select('period_id, model, weights').eq('is_active', true)),
    admin.from('indicators').select('id, aspect_id'),
    admin.from('culture_aspects').select('id, period_id, name, order_idx'),
  ]);
  const empById = new Map((emps ?? []).map((e) => [e.id, e]));
  const periodLabel = new Map((periodsAll ?? []).map((p) => [p.id, p.label]));
  const wsByPeriod = new Map((ws ?? []).map((w) => [w.period_id, { model: w.model as '4class' | '2class', weights: w.weights as WeightValues }]));
  const relBy = new Map(mapsAll.map((m) => [`${m.assessor_id}|${m.target_id}|${m.period_id}`, m.relation as RelationKind]));
  const aspectOf = new Map((inds ?? []).map((i) => [i.id, i.aspect_id])); // indikator → aspek
  const aspectMeta = new Map((aspects ?? []).map((a) => [a.id, { name: a.name, ord: a.order_idx ?? 0 }]));

  const asmtIds = asmts.map((a) => a.id);
  // rating per (assessment|aspek) → mean ×20 = skor penilai utk aspek itu (meniru loadReport).
  const ratByAsmtAspect = new Map<string, number[]>();
  if (asmtIds.length) {
    const sc = await fetchAllChunked<{ assessment_id: string; indicator_id: string; rating: number | null }>(asmtIds, (chunk, from, to) =>
      admin.from('assessment_indicator_scores').select('assessment_id, indicator_id, rating')
        .in('assessment_id', chunk).order('assessment_id').order('indicator_id').range(from, to));
    sc.forEach((s) => {
      if (s.rating == null) return;
      const aid = aspectOf.get(s.indicator_id); if (!aid) return;
      const k = `${s.assessment_id}|${aid}`;
      const arr = ratByAsmtAspect.get(k) ?? []; arr.push(s.rating); ratByAsmtAspect.set(k, arr);
    });
  }

  // Grup skor per-penilai ke kelas, per (periode|target|aspek). Self dikelompokkan terpisah.
  const asmtById = new Map(asmts.map((a) => [a.id, a]));
  const groups = new Map<string, Groups360>();
  for (const [k, ratings] of ratByAsmtAspect) {
    const sep = k.indexOf('|');
    const asmtId = k.slice(0, sep), aid = k.slice(sep + 1);
    const a = asmtById.get(asmtId); if (!a) continue;
    const m = avg(ratings); if (m == null) continue;
    const score100 = m * 20; if (score100 <= 0) continue;
    const rel: RelationKind = a.assessor_id === a.target_id ? 'Self' : relBy.get(`${a.assessor_id}|${a.target_id}|${a.period_id}`) ?? 'Peer';
    const gk = `${a.period_id}|${a.target_id}|${aid}`;
    const g = groups.get(gk) ?? { atasan: [], peer: [], cross: [], bawahan: [], self: [] };
    g[classOf(rel)].push(score100);
    groups.set(gk, g);
  }

  const out: { periode: string; nama: string; ord: number; row: Row }[] = [];
  for (const [gk, g] of groups) {
    const p1 = gk.indexOf('|'), p2 = gk.indexOf('|', p1 + 1);
    const pid = gk.slice(0, p1), tid = gk.slice(p1 + 1, p2), aid = gk.slice(p2 + 1);
    const emp = empById.get(tid); const asp = aspectMeta.get(aid);
    if (!emp || !asp) continue;
    const wsp = wsByPeriod.get(pid);
    const s100 = wsp ? weightedScore360(g, wsp.model, wsp.weights) : null; // 360° terbobot (self dikecualikan)
    const self100 = avg(g.self);
    const skor360 = s100 != null ? r2(s100) : null;
    const skorDiri = self100 != null ? r2(self100) : null;
    out.push({
      periode: periodLabel.get(pid) ?? '', nama: emp.name, ord: asp.ord,
      row: {
        periode: periodLabel.get(pid) ?? '', kode: emp.emp_code, nama: emp.name, divisi: emp.dept,
        aspek: asp.name, skor_360: skor360, skor_diri: skorDiri,
        gap_diri_vs_360: skorDiri != null && skor360 != null ? r2(skorDiri - skor360) : null,
      },
    });
  }
  out.sort((a, b) => a.periode.localeCompare(b.periode) || a.nama.localeCompare(b.nama) || a.ord - b.ord);
  return { ok: true, rows: out.map((o) => o.row) };
}

/** Ringkas nilai bobot jadi string "Atasan 40% · Peer 25% · …" sesuai model. */
function weightsSummary(model: string | null, w: Record<string, number> | null): string {
  if (!model || !w) return '—';
  const order = model === '2class' ? ['atasan', 'internal'] : ['atasan', 'peer', 'cross', 'bawahan', 'self'];
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  return order.filter((k) => w[k] != null).map((k) => `${cap(k)} ${w[k]}%`).join(' · ') || '—';
}

/**
 * Rekap Konfigurasi Periode (HRD) — "potret" SEMUA pengaturan yang diterapkan HRD per kuartal:
 * status & tanggal, pakai 360° atau tidak, bulan KPI (sumber data KPI), model & bobot penilai,
 * aspek + indikator, pertanyaan esai, serta jumlah pemetaan/punishment/skor 360 terhitung.
 * Multi-sheet: Ringkasan · Bobot Penilai · Bulan KPI · Aspek & Indikator · Pertanyaan Esai.
 * Bila periodId null → mencakup seluruh periode (satu baris per periode di tiap sheet).
 */
export async function exportPeriodConfig(periodId?: string | null): Promise<ConfigResult> {
  if (!(await requireHrd())) return { ok: false, error: 'Hanya HRD' };
  const admin = createAdminClient();
  // mappings/penalties/result_360 lintas periode → bisa >1000; ambil penuh (dipakai untuk hitung
  // jumlah per periode — kalau terpotong, angka "jumlah pemetaan/punishment/skor 360" jadi salah).
  const [
    { data: periodsAll }, { data: pmonths }, { data: weights },
    { data: aspectsAll }, { data: qualsAll }, mapsAll, penAll, r360,
  ] = await Promise.all([
    admin.from('periods').select('id, code, label, status, start_date, end_date, has_360').order('start_date'),
    admin.from('period_months').select('period_id, ym'),
    admin.from('weight_schemes').select('period_id, model, weights, is_active').eq('is_active', true),
    admin.from('culture_aspects').select('id, period_id, name, order_idx').order('order_idx'),
    admin.from('qualitative_questions').select('id, period_id, text, order_idx').order('order_idx'),
    fetchAllPaged<{ period_id: string; is_active: boolean }>((from, to) =>
      admin.from('mappings').select('period_id, is_active').order('period_id').range(from, to)),
    fetchAllPaged<{ period_id: string }>((from, to) =>
      admin.from('compliance_penalties').select('period_id').order('period_id').range(from, to)),
    fetchAllPaged<{ period_id: string; score: number | null }>((from, to) =>
      admin.from('result_360').select('period_id, score').order('period_id').range(from, to)),
  ]);
  const periods = (periodsAll ?? []).filter((p) => !periodId || p.id === periodId);
  if (periods.length === 0) return { ok: false, error: 'Periode tidak ditemukan.' };
  const pids = new Set(periods.map((p) => p.id));

  // Indikator hanya bisa difilter via aspect → bangun peta aspect→period dulu.
  const aspects = (aspectsAll ?? []).filter((a) => pids.has(a.period_id));
  const aspectPid = new Map(aspects.map((a) => [a.id, a.period_id]));
  const aspectName = new Map(aspects.map((a) => [a.id, a.name]));
  const { data: indsAll } = aspects.length
    ? await admin.from('indicators').select('id, aspect_id, text, is_active, description, rating_guide')
        .in('aspect_id', aspects.map((a) => a.id))
    : { data: [] as { id: string; aspect_id: string; text: string; is_active: boolean; description: string | null; rating_guide: Record<string, string> | null }[] };
  const inds = indsAll ?? [];

  // Agregat per periode.
  const ymByP = new Map<string, string[]>();
  (pmonths ?? []).forEach((m) => { if (pids.has(m.period_id)) { const a = ymByP.get(m.period_id) ?? []; a.push(m.ym); ymByP.set(m.period_id, a); } });
  const wByP = new Map((weights ?? []).filter((w) => pids.has(w.period_id)).map((w) => [w.period_id, w]));
  const aspectCountByP = new Map<string, number>();
  aspects.forEach((a) => aspectCountByP.set(a.period_id, (aspectCountByP.get(a.period_id) ?? 0) + 1));
  const indActiveByP = new Map<string, number>(), indTotalByP = new Map<string, number>();
  inds.forEach((i) => {
    const pid = aspectPid.get(i.aspect_id); if (!pid) return;
    indTotalByP.set(pid, (indTotalByP.get(pid) ?? 0) + 1);
    if (i.is_active) indActiveByP.set(pid, (indActiveByP.get(pid) ?? 0) + 1);
  });
  const qualCountByP = new Map<string, number>();
  (qualsAll ?? []).forEach((q) => { if (pids.has(q.period_id)) qualCountByP.set(q.period_id, (qualCountByP.get(q.period_id) ?? 0) + 1); });
  const mapCountByP = new Map<string, number>();
  mapsAll.forEach((m) => { if (pids.has(m.period_id) && m.is_active) mapCountByP.set(m.period_id, (mapCountByP.get(m.period_id) ?? 0) + 1); });
  const penCountByP = new Map<string, number>();
  penAll.forEach((p) => { if (pids.has(p.period_id)) penCountByP.set(p.period_id, (penCountByP.get(p.period_id) ?? 0) + 1); });
  const r360CountByP = new Map<string, number>();
  r360.forEach((r) => { if (pids.has(r.period_id) && r.score != null) r360CountByP.set(r.period_id, (r360CountByP.get(r.period_id) ?? 0) + 1); });

  const STATUS = (s: string) => (s === 'active' ? 'Aktif' : 'Terkunci/Selesai');

  // Sheet 1 — Ringkasan: satu baris per periode, seluruh pengaturan inti.
  const ringkasan: Row[] = periods.map((p) => {
    const w = wByP.get(p.id);
    const yms = (ymByP.get(p.id) ?? []).sort();
    return {
      periode: p.label, kode: p.code, status: STATUS(p.status),
      mulai: p.start_date, selesai: p.end_date,
      pakai_360: p.has_360 ? 'Ya' : 'Tidak',
      jumlah_bulan_kpi: yms.length, bulan_kpi: yms.join(', '),
      model_bobot: w ? (w.model === '4class' ? '4-Kelas' : '2-Kelas') : '—',
      bobot: weightsSummary(w?.model ?? null, (w?.weights as Record<string, number>) ?? null),
      jumlah_aspek: aspectCountByP.get(p.id) ?? 0,
      indikator_aktif: indActiveByP.get(p.id) ?? 0,
      indikator_total: indTotalByP.get(p.id) ?? 0,
      pertanyaan_esai: qualCountByP.get(p.id) ?? 0,
      jumlah_pemetaan: mapCountByP.get(p.id) ?? 0,
      jumlah_punishment: penCountByP.get(p.id) ?? 0,
      skor_360_terhitung: p.has_360 ? (r360CountByP.get(p.id) ?? 0) : '—',
    };
  });

  // Sheet 2 — Bobot Penilai: rincian tiap komponen bobot per periode.
  const bobot: Row[] = periods.map((p) => {
    const w = wByP.get(p.id);
    const v = (w?.weights as Record<string, number>) ?? {};
    return {
      periode: p.label,
      model: w ? (w.model === '4class' ? '4-Kelas' : '2-Kelas') : '— (belum diatur)',
      atasan_pct: v.atasan ?? null, peer_pct: v.peer ?? null, cross_pct: v.cross ?? null,
      bawahan_pct: v.bawahan ?? null, self_pct: v.self ?? null, internal_pct: v.internal ?? null,
    };
  });

  // Sheet 3 — Bulan KPI: sumber data KPI (satu baris per bulan per periode).
  const bulanKpi: Row[] = [];
  for (const p of periods) for (const ym of (ymByP.get(p.id) ?? []).sort()) bulanKpi.push({ periode: p.label, bulan: ym });

  // Sheet 4 — Aspek & Indikator: pertanyaan kuantitatif yang dipakai.
  const aspekInd: Row[] = inds
    .filter((i) => aspectPid.has(i.aspect_id))
    .map((i) => {
      const pid = aspectPid.get(i.aspect_id)!;
      const plabel = periods.find((p) => p.id === pid)?.label ?? '';
      return {
        periode: plabel, aspek: aspectName.get(i.aspect_id) ?? '', indikator: i.text,
        status: i.is_active ? 'Aktif' : 'Nonaktif',
        deskripsi: i.description ?? '',
        panduan_rating: i.rating_guide && Object.keys(i.rating_guide).length ? 'Ada' : '—',
      };
    });

  // Sheet 5 — Pertanyaan Esai (kualitatif).
  const esai: Row[] = (qualsAll ?? [])
    .filter((q) => pids.has(q.period_id))
    .map((q) => ({ periode: periods.find((p) => p.id === q.period_id)?.label ?? '', pertanyaan: q.text }));

  return {
    ok: true,
    sheets: [
      { name: 'Ringkasan', rows: ringkasan },
      { name: 'Bobot Penilai', rows: bobot },
      { name: 'Bulan KPI', rows: bulanKpi },
      { name: 'Aspek & Indikator', rows: aspekInd },
      { name: 'Pertanyaan Esai', rows: esai },
    ],
  };
}

/**
 * Dataset Log Aktivitas HRD (append-only, LINTAS PERIODE → mengabaikan filter periode).
 * Jejak aksi sensitif HRD dari `hrd_audit_log`: waktu, pelaku, kategori, aksi, ringkasan, target,
 * + detail meta (JSON). Terbaru di atas. Paginasi `.range()` karena log tumbuh > 1000 baris.
 */
export async function exportHrdAuditLog(): Promise<ExportResult> {
  if (!(await requireHrd())) return { ok: false, error: 'Hanya HRD' };
  const admin = createAdminClient();
  const PAGE = 1000;
  const list: { created_at: string; actor_name: string | null; category: string; action: string;
    summary: string; target_type: string | null; target_label: string | null; meta: Record<string, unknown> | null }[] = [];
  for (let from = 0; ; from += PAGE) {
    // Urut created_at + id (deterministik antar-halaman agar paginasi tak bocor/dobel).
    const { data } = await admin.from('hrd_audit_log')
      .select('created_at, actor_name, category, action, summary, target_type, target_label, meta')
      .order('created_at', { ascending: false }).order('id', { ascending: false })
      .range(from, from + PAGE - 1);
    if (data?.length) list.push(...data);
    if (!data || data.length < PAGE) break;
  }
  const rows: Row[] = list.map((a) => ({
    waktu: a.created_at, pelaku: a.actor_name ?? '—', kategori: a.category, aksi: a.action,
    ringkasan: a.summary, tipe_target: a.target_type ?? '', target: a.target_label ?? '',
    detail: a.meta && Object.keys(a.meta).length ? JSON.stringify(a.meta) : '',
  }));
  return { ok: true, rows };
}

/** Dataset Pemetaan: periode, penilai, target, relasi, sifat. */
export async function exportMappings(periodId?: string | null): Promise<ExportResult> {
  if (!(await requireHrd())) return { ok: false, error: 'Hanya HRD' };
  const admin = createAdminClient();
  const [{ data: emps }, { data: periods }] = await Promise.all([
    admin.from('employees').select('id, name, dept'),
    admin.from('periods').select('id, label'),
  ]);
  const maps = await fetchAllPaged<{ assessor_id: string; target_id: string; period_id: string; relation: RelationKind; mandatory: boolean; is_active: boolean }>((from, to) => {
    let q = admin.from('mappings').select('assessor_id, target_id, period_id, relation, mandatory, is_active').eq('is_active', true);
    if (periodId) q = q.eq('period_id', periodId);
    return q.order('assessor_id').order('target_id').range(from, to);
  });
  const byId = new Map((emps ?? []).map((e) => [e.id, e]));
  const periodLabel = new Map((periods ?? []).map((p) => [p.id, p.label]));
  const rows: Row[] = maps.map((m) => ({
    periode: periodLabel.get(m.period_id) ?? '',
    penilai: byId.get(m.assessor_id)?.name ?? '', target: byId.get(m.target_id)?.name ?? '',
    relasi: m.relation, sifat: m.mandatory ? 'Wajib' : 'Opsional',
  }));
  return { ok: true, rows };
}
