'use server';

import { createClient, createAdminClient } from '@/lib/supabase/server';
import { finalScoreOf, playerClassOf } from '@/lib/scoring';

/**
 * Ekspor dataset untuk olah data lanjutan (HRD). Halaman ini hanya untuk HRD; setelah
 * otorisasi, baca pakai service_role agar dataset lengkap (lintas RLS) — TIDAK meneruskan
 * input mentah, hanya menyusun ekspor read-only. Setiap fungsi mengembalikan baris datar.
 */
export type Row = Record<string, string | number | null>;
export type ExportResult = { ok: true; rows: Row[] } | { ok: false; error: string };

async function requireHrd(): Promise<boolean> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;
  const { data: me } = await supabase.from('employees').select('role').eq('id', user.id).maybeSingle();
  return me?.role === 'hrd';
}

const KAT = (f: number | null) =>
  f == null ? '—' : f >= 90 ? 'Sangat Baik' : f >= 80 ? 'Baik' : f >= 70 ? 'Cukup' : 'Perlu Pembinaan';

/** Dataset Pegawai (master): kode, nama, divisi, peran, status, atasan, email. */
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

/** Dataset KPI Bulanan (long): kode, nama, divisi, bulan(ym), skor. */
export async function exportKpi(): Promise<ExportResult> {
  if (!(await requireHrd())) return { ok: false, error: 'Hanya HRD' };
  const admin = createAdminClient();
  const { data: emps } = await admin.from('employees').select('id, emp_code, name, dept');
  const byId = new Map((emps ?? []).map((e) => [e.id, e]));
  const { data: kpi } = await admin.from('kpi_scores').select('employee_id, ym, score').order('ym');
  const rows: Row[] = (kpi ?? []).map((k) => {
    const e = byId.get(k.employee_id);
    return { kode: e?.emp_code ?? '', nama: e?.name ?? '', divisi: e?.dept ?? '', bulan: k.ym, skor_kpi: k.score };
  });
  return { ok: true, rows };
}

/** Dataset Rekap Kinerja per Periode: KPI rerata, 360, punishment, Skor Akhir, kategori, player. */
export async function exportRekap(): Promise<ExportResult> {
  if (!(await requireHrd())) return { ok: false, error: 'Hanya HRD' };
  const admin = createAdminClient();
  const [{ data: emps }, { data: periods }, { data: pmonths }, { data: kpi }, { data: r360 }, { data: pen }] = await Promise.all([
    admin.from('employees').select('id, emp_code, name, dept').neq('role', 'direksi'),
    admin.from('periods').select('id, label, has_360, start_date').order('start_date'),
    admin.from('period_months').select('period_id, ym'),
    admin.from('kpi_scores').select('employee_id, ym, score'),
    admin.from('result_360').select('employee_id, period_id, score'),
    admin.from('compliance_penalties').select('employee_id, period_id, points'),
  ]);
  const monthsByPeriod = new Map<string, string[]>();
  (pmonths ?? []).forEach((m) => { const a = monthsByPeriod.get(m.period_id) ?? []; a.push(m.ym); monthsByPeriod.set(m.period_id, a); });
  const kpiByCell = new Map<string, { s: number; n: number }>();
  (kpi ?? []).forEach((k) => { const key = `${k.employee_id}|${k.ym}`; const a = kpiByCell.get(key) ?? { s: 0, n: 0 }; a.s += k.score; a.n++; kpiByCell.set(key, a); });
  const s360By = new Map((r360 ?? []).map((r) => [`${r.employee_id}|${r.period_id}`, r.score]));
  const penBy = new Map((pen ?? []).map((p) => [`${p.employee_id}|${p.period_id}`, p.points]));

  const rows: Row[] = [];
  for (const p of periods ?? []) {
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
        kpi_rerata: kpiAvg != null ? Math.round(kpiAvg * 10) / 10 : null,
        skor_360: s360 != null ? Math.round(s360 * 10) / 10 : null,
        punishment: penalty,
        skor_akhir: final != null ? Math.round(final * 10) / 10 : null,
        kategori: KAT(final), player: player ?? '',
      });
    }
  }
  return { ok: true, rows };
}

/** Dataset Penilaian 360 Detail (raw feedback): periode, penilai, target, relasi, indikator, rating, komentar. */
export async function exportAssessments(): Promise<ExportResult> {
  if (!(await requireHrd())) return { ok: false, error: 'Hanya HRD' };
  const admin = createAdminClient();
  const [{ data: emps }, { data: periods }, { data: asmts }, { data: inds }, { data: maps }] = await Promise.all([
    admin.from('employees').select('id, emp_code, name, dept'),
    admin.from('periods').select('id, label'),
    admin.from('assessments').select('id, period_id, assessor_id, target_id, status').eq('status', 'submitted'),
    admin.from('indicators').select('id, text'),
    admin.from('mappings').select('assessor_id, target_id, period_id, relation'),
  ]);
  const byId = new Map((emps ?? []).map((e) => [e.id, e]));
  const periodLabel = new Map((periods ?? []).map((p) => [p.id, p.label]));
  const indText = new Map((inds ?? []).map((i) => [i.id, i.text]));
  const relBy = new Map((maps ?? []).map((m) => [`${m.assessor_id}|${m.target_id}|${m.period_id}`, m.relation]));
  const asmtIds = (asmts ?? []).map((a) => a.id);
  const scoresByAsmt = new Map<string, { indicator_id: string; rating: number | null; comment: string | null }[]>();
  if (asmtIds.length) {
    const { data: sc } = await admin.from('assessment_indicator_scores').select('assessment_id, indicator_id, rating, comment').in('assessment_id', asmtIds);
    (sc ?? []).forEach((s) => { const a = scoresByAsmt.get(s.assessment_id) ?? []; a.push(s); scoresByAsmt.set(s.assessment_id, a); });
  }
  const rows: Row[] = [];
  for (const a of asmts ?? []) {
    const penilai = byId.get(a.assessor_id); const target = byId.get(a.target_id);
    const rel = a.assessor_id === a.target_id ? 'Self' : relBy.get(`${a.assessor_id}|${a.target_id}|${a.period_id}`) ?? '';
    for (const s of scoresByAsmt.get(a.id) ?? []) {
      rows.push({
        periode: periodLabel.get(a.period_id) ?? '',
        penilai: penilai?.name ?? '', divisi_penilai: penilai?.dept ?? '',
        target: target?.name ?? '', divisi_target: target?.dept ?? '',
        relasi: rel, indikator: indText.get(s.indicator_id) ?? '',
        rating: s.rating, komentar: s.comment ?? '',
      });
    }
  }
  return { ok: true, rows };
}

/** Dataset Pemetaan: periode, penilai, target, relasi, sifat. */
export async function exportMappings(): Promise<ExportResult> {
  if (!(await requireHrd())) return { ok: false, error: 'Hanya HRD' };
  const admin = createAdminClient();
  const [{ data: emps }, { data: periods }, { data: maps }] = await Promise.all([
    admin.from('employees').select('id, name, dept'),
    admin.from('periods').select('id, label'),
    admin.from('mappings').select('assessor_id, target_id, period_id, relation, mandatory, is_active').eq('is_active', true),
  ]);
  const byId = new Map((emps ?? []).map((e) => [e.id, e]));
  const periodLabel = new Map((periods ?? []).map((p) => [p.id, p.label]));
  const rows: Row[] = (maps ?? []).map((m) => ({
    periode: periodLabel.get(m.period_id) ?? '',
    penilai: byId.get(m.assessor_id)?.name ?? '', target: byId.get(m.target_id)?.name ?? '',
    relasi: m.relation, sifat: m.mandatory ? 'Wajib' : 'Opsional',
  }));
  return { ok: true, rows };
}
