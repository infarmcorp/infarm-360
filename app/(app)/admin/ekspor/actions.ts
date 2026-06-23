'use server';

import { createClient, createAdminClient } from '@/lib/supabase/server';
import { canAdmin } from '@/lib/auth/roles';
import { finalScoreOf, playerClassOf } from '@/lib/scoring';

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

async function requireHrd(): Promise<boolean> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;
  const { data: me } = await supabase.from('employees').select('role, is_hrd_admin').eq('id', user.id).maybeSingle();
  return canAdmin(me);
}

const KAT = (f: number | null) =>
  f == null ? '—' : f >= 90 ? 'Sangat Baik' : f >= 80 ? 'Baik' : f >= 70 ? 'Cukup' : 'Perlu Pembinaan';
const r1 = (n: number) => Math.round(n * 10) / 10;

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
  const { data: kpi } = await admin.from('kpi_scores').select('employee_id, ym, score').order('ym');
  const rows: Row[] = (kpi ?? []).filter((k) => !allowYm || allowYm.has(k.ym)).map((k) => {
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
  const { data: audit } = await admin.from('kpi_audit')
    .select('employee_id, ym, score, changed_by, changed_at, note').order('changed_at', { ascending: false });
  const list = (audit ?? []).filter((a) => !allowYm || allowYm.has(a.ym));
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
  let q = admin.from('compliance_penalties').select('employee_id, period_id, points, reason, set_by');
  if (periodId) q = q.eq('period_id', periodId);
  const { data: pen } = await q;
  const setterIds = [...new Set((pen ?? []).map((p) => p.set_by).filter(Boolean) as string[])];
  const setterName = new Map<string, string>();
  if (setterIds.length) {
    const { data: s } = await admin.from('employees').select('id, name').in('id', setterIds);
    (s ?? []).forEach((c) => setterName.set(c.id, c.name));
  }
  const rows: Row[] = (pen ?? []).map((p) => {
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
  const [{ data: emps }, { data: periodsAll }, { data: pmonths }, { data: kpi }, { data: r360 }, { data: pen }] = await Promise.all([
    admin.from('employees').select('id, emp_code, name, dept').neq('role', 'direksi'),
    admin.from('periods').select('id, label, has_360, start_date').order('start_date'),
    admin.from('period_months').select('period_id, ym'),
    admin.from('kpi_scores').select('employee_id, ym, score'),
    admin.from('result_360').select('employee_id, period_id, score'),
    admin.from('compliance_penalties').select('employee_id, period_id, points'),
  ]);
  const periods = (periodsAll ?? []).filter((p) => !periodId || p.id === periodId);
  const monthsByPeriod = new Map<string, string[]>();
  (pmonths ?? []).forEach((m) => { const a = monthsByPeriod.get(m.period_id) ?? []; a.push(m.ym); monthsByPeriod.set(m.period_id, a); });
  const kpiByCell = new Map<string, { s: number; n: number }>();
  (kpi ?? []).forEach((k) => { const key = `${k.employee_id}|${k.ym}`; const a = kpiByCell.get(key) ?? { s: 0, n: 0 }; a.s += k.score; a.n++; kpiByCell.set(key, a); });
  const s360By = new Map((r360 ?? []).map((r) => [`${r.employee_id}|${r.period_id}`, r.score]));
  const penBy = new Map((pen ?? []).map((p) => [`${p.employee_id}|${p.period_id}`, p.points]));

  const rows: Row[] = [];
  for (const p of periods) {
    const yms = monthsByPeriod.get(p.id) ?? [];
    for (const e of emps ?? []) {
      const present = yms.map((ym) => kpiByCell.get(`${e.id}|${ym}`)).filter(Boolean).map((a) => a!.s / a!.n);
      const kpiAvg = present.length ? present.reduce((a, b) => a + b, 0) / present.length : null;
      const s360 = p.has_360 ? (s360By.get(`${e.id}|${p.id}`) ?? null) : null;
      const penalty = penBy.get(`${e.id}|${p.id}`) ?? 0;
      if (kpiAvg == null && s360 == null) continue;
      const final = finalScoreOf(kpiAvg, s360, p.has_360, penalty);
      const player = final != null && kpiAvg != null ? playerClassOf(final, kpiAvg, s360, p.has_360) : null;
      rows.push({
        periode: p.label, kode: e.emp_code, nama: e.name, divisi: e.dept,
        kpi_rerata: kpiAvg != null ? r1(kpiAvg) : null, skor_360: s360 != null ? r1(s360) : null,
        punishment: penalty, skor_akhir: final != null ? r1(final) : null,
        kategori: KAT(final), player: player ?? '',
      });
    }
  }
  return { ok: true, rows };
}

/** Dataset Penilaian 360 Detail (ANONIM penilai): periode, target, divisi, relasi, aspek, indikator, rating, komentar. */
export async function exportAssessments(periodId?: string | null): Promise<ExportResult> {
  if (!(await requireHrd())) return { ok: false, error: 'Hanya HRD' };
  const admin = createAdminClient();
  const [{ data: emps }, { data: periods }, asmtRes, { data: inds }, { data: aspects }, { data: maps }] = await Promise.all([
    admin.from('employees').select('id, emp_code, name, dept'),
    admin.from('periods').select('id, label'),
    (periodId
      ? admin.from('assessments').select('id, period_id, assessor_id, target_id, status').eq('status', 'submitted').eq('period_id', periodId)
      : admin.from('assessments').select('id, period_id, assessor_id, target_id, status').eq('status', 'submitted')),
    admin.from('indicators').select('id, text, aspect_id'),
    admin.from('culture_aspects').select('id, name'),
    admin.from('mappings').select('assessor_id, target_id, period_id, relation'),
  ]);
  const asmts = asmtRes.data ?? [];
  const byId = new Map((emps ?? []).map((e) => [e.id, e]));
  const periodLabel = new Map((periods ?? []).map((p) => [p.id, p.label]));
  const aspectName = new Map((aspects ?? []).map((a) => [a.id, a.name]));
  const indMeta = new Map((inds ?? []).map((i) => [i.id, { text: i.text, aspek: aspectName.get(i.aspect_id) ?? '' }]));
  const relBy = new Map((maps ?? []).map((m) => [`${m.assessor_id}|${m.target_id}|${m.period_id}`, m.relation]));
  const asmtIds = asmts.map((a) => a.id);
  const scoresByAsmt = new Map<string, { indicator_id: string; rating: number | null; comment: string | null }[]>();
  if (asmtIds.length) {
    const { data: sc } = await admin.from('assessment_indicator_scores').select('assessment_id, indicator_id, rating, comment').in('assessment_id', asmtIds);
    (sc ?? []).forEach((s) => { const a = scoresByAsmt.get(s.assessment_id) ?? []; a.push(s); scoresByAsmt.set(s.assessment_id, a); });
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
  const [{ data: emps }, { data: periods }, asmtRes, { data: quals }, { data: maps }] = await Promise.all([
    admin.from('employees').select('id, name, dept'),
    admin.from('periods').select('id, label'),
    (periodId
      ? admin.from('assessments').select('id, period_id, assessor_id, target_id').eq('status', 'submitted').eq('period_id', periodId)
      : admin.from('assessments').select('id, period_id, assessor_id, target_id').eq('status', 'submitted')),
    admin.from('qualitative_questions').select('id, text, order_idx').order('order_idx'),
    admin.from('mappings').select('assessor_id, target_id, period_id, relation'),
  ]);
  const asmts = asmtRes.data ?? [];
  const byId = new Map((emps ?? []).map((e) => [e.id, e]));
  const periodLabel = new Map((periods ?? []).map((p) => [p.id, p.label]));
  const qOrder = new Map((quals ?? []).map((q, i) => [q.id, i]));
  const qText = new Map((quals ?? []).map((q) => [q.id, q.text]));
  const relBy = new Map((maps ?? []).map((m) => [`${m.assessor_id}|${m.target_id}|${m.period_id}`, m.relation]));
  const asmtIds = asmts.map((a) => a.id);
  const ansByAsmt = new Map<string, { question_id: string; answer: string | null }[]>();
  if (asmtIds.length) {
    const { data: ans } = await admin.from('assessment_qual_answers').select('assessment_id, question_id, answer').in('assessment_id', asmtIds);
    (ans ?? []).forEach((x) => { const a = ansByAsmt.get(x.assessment_id) ?? []; a.push(x); ansByAsmt.set(x.assessment_id, a); });
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
  const [
    { data: periodsAll }, { data: pmonths }, { data: weights },
    { data: aspectsAll }, { data: qualsAll }, { data: mapsAll }, { data: penAll }, { data: r360 },
  ] = await Promise.all([
    admin.from('periods').select('id, code, label, status, start_date, end_date, has_360').order('start_date'),
    admin.from('period_months').select('period_id, ym'),
    admin.from('weight_schemes').select('period_id, model, weights, is_active').eq('is_active', true),
    admin.from('culture_aspects').select('id, period_id, name, order_idx').order('order_idx'),
    admin.from('qualitative_questions').select('id, period_id, text, order_idx').order('order_idx'),
    admin.from('mappings').select('period_id, is_active'),
    admin.from('compliance_penalties').select('period_id'),
    admin.from('result_360').select('period_id, score'),
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
  (mapsAll ?? []).forEach((m) => { if (pids.has(m.period_id) && m.is_active) mapCountByP.set(m.period_id, (mapCountByP.get(m.period_id) ?? 0) + 1); });
  const penCountByP = new Map<string, number>();
  (penAll ?? []).forEach((p) => { if (pids.has(p.period_id)) penCountByP.set(p.period_id, (penCountByP.get(p.period_id) ?? 0) + 1); });
  const r360CountByP = new Map<string, number>();
  (r360 ?? []).forEach((r) => { if (pids.has(r.period_id) && r.score != null) r360CountByP.set(r.period_id, (r360CountByP.get(r.period_id) ?? 0) + 1); });

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

/** Dataset Pemetaan: periode, penilai, target, relasi, sifat. */
export async function exportMappings(periodId?: string | null): Promise<ExportResult> {
  if (!(await requireHrd())) return { ok: false, error: 'Hanya HRD' };
  const admin = createAdminClient();
  const [{ data: emps }, { data: periods }] = await Promise.all([
    admin.from('employees').select('id, name, dept'),
    admin.from('periods').select('id, label'),
  ]);
  let q = admin.from('mappings').select('assessor_id, target_id, period_id, relation, mandatory, is_active').eq('is_active', true);
  if (periodId) q = q.eq('period_id', periodId);
  const { data: maps } = await q;
  const byId = new Map((emps ?? []).map((e) => [e.id, e]));
  const periodLabel = new Map((periods ?? []).map((p) => [p.id, p.label]));
  const rows: Row[] = (maps ?? []).map((m) => ({
    periode: periodLabel.get(m.period_id) ?? '',
    penilai: byId.get(m.assessor_id)?.name ?? '', target: byId.get(m.target_id)?.name ?? '',
    relasi: m.relation, sifat: m.mandatory ? 'Wajib' : 'Opsional',
  }));
  return { ok: true, rows };
}
