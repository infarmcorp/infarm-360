import type { createClient } from '@/lib/supabase/server';
import { finalScoreOf, kpiAvgOf, hasScoreDrift } from '@/lib/scoring';

/**
 * Tugas & Notifikasi in-app — DITURUNKAN dari data yang sudah ada (tanpa tabel baru).
 * Dihitung sekali di layout `(app)` lalu ditampilkan di sidebar. Setiap kueri di-scope
 * per peran + dibungkus best-effort: kegagalan satu bagian tak menjatuhkan yang lain,
 * dan tak pernah memblokir render halaman.
 */
export type TodoTone = 'amber' | 'emerald' | 'indigo' | 'rose' | 'blue';
export type TodoItem = { id: string; label: string; href: string; tone: TodoTone };

type SB = Awaited<ReturnType<typeof createClient>>;
type Role = 'employee' | 'spv' | 'hrd' | 'direksi';

export async function getTodos(
  supabase: SB, userId: string, role: Role, hrdMode: 'admin' | 'spv',
): Promise<TodoItem[]> {
  try {
    const { data: ap } = await supabase
      .from('periods').select('id, has_360, form_open, status').eq('status', 'active').limit(1).maybeSingle();
    if (!ap) return [];

    const assesses = role !== 'hrd' || hrdMode === 'spv';     // HRD murni tak punya "Penilaian Saya"
    const isSpvLike = role === 'spv' || (role === 'hrd' && hrdMode === 'spv');

    const [assessPending, reportReady, kpiMissing, hrdTodos, direksiTodos] = await Promise.all([
      assesses && ap.has_360 && ap.form_open ? countAssessPending(supabase, ap.id, userId) : Promise.resolve(0),
      (role === 'employee' || role === 'spv') ? countReportReady(supabase, ap.id, userId) : Promise.resolve(0),
      isSpvLike ? countKpiMissing(supabase, ap.id, userId) : Promise.resolve(null),
      role === 'hrd' && hrdMode === 'admin' ? hrdAdminTodos(supabase, ap.id, ap.has_360) : Promise.resolve([]),
      role === 'direksi' ? direksiSuksesi(supabase) : Promise.resolve([]),
    ]);

    const items: TodoItem[] = [];
    if (assessPending > 0) items.push({ id: 'assess', tone: 'amber', href: '/penilaian', label: `${assessPending} penilaian 360° menunggu diisi` });
    if (reportReady > 0) items.push({ id: 'report', tone: 'emerald', href: '/laporan', label: 'Laporan Hasil Anda sudah final' });
    if (kpiMissing && kpiMissing.missing > 0) items.push({ id: 'kpi', tone: 'indigo', href: '/kpi', label: `${kpiMissing.missing} anggota belum ada KPI ${kpiMissing.ym}` });
    items.push(...hrdTodos, ...direksiTodos);
    return items;
  } catch {
    return [];
  }
}

/** Penilaian 360° yang ditugaskan ke user tapi belum 'submitted' (periode aktif). */
async function countAssessPending(supabase: SB, periodId: string, userId: string): Promise<number> {
  const [{ data: maps }, { data: subs }] = await Promise.all([
    // Hanya pemetaan AKTIF (selaras halaman /penilaian) — pemetaan terhapus/nonaktif tak dihitung.
    supabase.from('mappings').select('target_id').eq('period_id', periodId).eq('assessor_id', userId).eq('is_active', true),
    // 'invalidated' (dibatalkan HRD, 0046) = bukan lagi tugas.
    supabase.from('assessments').select('target_id').eq('period_id', periodId).eq('assessor_id', userId).in('status', ['submitted', 'invalidated']),
  ]);
  if (!maps?.length) return 0;
  const done = new Set((subs ?? []).map((s) => s.target_id));
  return maps.filter((m) => !done.has(m.target_id)).length;
}

/** Laporan Hasil user yang sudah difinalisasi pada periode aktif. */
async function countReportReady(supabase: SB, periodId: string, userId: string): Promise<number> {
  const { count } = await supabase
    .from('final_reports').select('*', { count: 'exact', head: true })
    .eq('period_id', periodId).eq('employee_id', userId).eq('status', 'finalized');
  return count ?? 0;
}

/** Anggota tim SPV yang belum punya skor KPI di bulan TERAKHIR periode aktif. */
async function countKpiMissing(supabase: SB, periodId: string, userId: string): Promise<{ missing: number; ym: string } | null> {
  const { data: team } = await supabase.from('spv_team_members').select('employee_id').eq('spv_id', userId);
  const ids = (team ?? []).map((t) => t.employee_id);
  if (!ids.length) return null;
  const { data: months } = await supabase.from('period_months').select('ym').eq('period_id', periodId).order('ym', { ascending: false }).limit(1);
  const ym = months?.[0]?.ym;
  if (!ym) return null;
  const { data: have } = await supabase.from('kpi_scores').select('employee_id').eq('ym', ym).in('employee_id', ids);
  return { missing: ids.length - new Set((have ?? []).map((h) => h.employee_id)).size, ym };
}

/** Tugas HRD Admin: koreksi relasi menunggu + penilaian 360 belum lengkap + laporan belum final. */
async function hrdAdminTodos(supabase: SB, periodId: string, has360: boolean): Promise<TodoItem[]> {
  const out: TodoItem[] = [];
  if (has360) {
    const [{ count: mapCount }, { count: subCount }] = await Promise.all([
      supabase.from('mappings').select('*', { count: 'exact', head: true }).eq('period_id', periodId).eq('is_active', true),
      supabase.from('assessments').select('*', { count: 'exact', head: true }).eq('period_id', periodId).eq('status', 'submitted'),
    ]);
    const pending = (mapCount ?? 0) - (subCount ?? 0);
    if (pending > 0) out.push({ id: 'hrd-progress', tone: 'amber', href: '/admin/progress', label: `${pending} penilaian 360° belum lengkap` });
  }
  const [{ count: empCount }, { count: finalCount }, { count: corrCount }] = await Promise.all([
    supabase.from('employees').select('*', { count: 'exact', head: true }).eq('is_active', true).neq('role', 'direksi').eq('is_external', false),
    supabase.from('final_reports').select('*', { count: 'exact', head: true }).eq('period_id', periodId).eq('status', 'finalized'),
    supabase.from('relation_correction_requests').select('*', { count: 'exact', head: true }).eq('period_id', periodId).eq('status', 'pending'),
  ]);
  // Permohonan pemetaan (koreksi relasi / hapus / tambah) menunggu keputusan HRD (Pemetaan → tab Permohonan).
  if ((corrCount ?? 0) > 0) out.push({ id: 'hrd-corr', tone: 'rose', href: '/admin/pemetaan', label: `${corrCount} permohonan pemetaan menunggu` });
  const pendingReports = (empCount ?? 0) - (finalCount ?? 0);
  if (pendingReports > 0) out.push({ id: 'hrd-final', tone: 'blue', href: '/admin/laporan', label: `${pendingReports} laporan belum difinalisasi` });
  // Laporan FINAL yang skornya sudah usang (KPI/360°/punishment berubah sejak difinalisasi).
  const stale = await countStaleFinalReports(supabase, periodId, has360);
  if (stale > 0) out.push({ id: 'hrd-stale', tone: 'amber', href: '/admin/laporan', label: `${stale} laporan Final skornya berubah — perbarui di Review & Finalisasi` });
  return out;
}

/**
 * Hitung laporan FINAL yang Skor Akhir TERSIMPAN-nya beda dari skor TERKINI — artinya
 * KPI/360°/punishment berubah setelah finalisasi (pegawai masih melihat angka lama).
 * Bandingkan final_score tersimpan vs finalScoreOf(KPI,360,punishment) terkini.
 */
async function countStaleFinalReports(supabase: SB, periodId: string, has360: boolean): Promise<number> {
  const { data: reports } = await supabase.from('final_reports')
    .select('employee_id, final_score').eq('period_id', periodId).eq('status', 'finalized');
  if (!reports?.length) return 0;
  const ids = reports.map((r) => r.employee_id);

  const { data: months } = await supabase.from('period_months').select('ym').eq('period_id', periodId);
  const yms = (months ?? []).map((m) => m.ym);
  const { data: kpi } = yms.length
    ? await supabase.from('kpi_scores').select('employee_id, score').in('employee_id', ids).in('ym', yms)
    : { data: [] as { employee_id: string; score: number }[] };
  const kpiValsBy = new Map<string, number[]>();
  (kpi ?? []).forEach((r) => kpiValsBy.set(r.employee_id, [...(kpiValsBy.get(r.employee_id) ?? []), Number(r.score)]));

  const { data: r360 } = await supabase.from('result_360').select('employee_id, score').eq('period_id', periodId);
  const s360By = new Map((r360 ?? []).map((r) => [r.employee_id, r.score]));
  const { data: pen } = await supabase.from('compliance_penalties').select('employee_id, points').eq('period_id', periodId);
  const penBy = new Map((pen ?? []).map((p) => [p.employee_id, p.points]));

  let n = 0;
  for (const rep of reports) {
    const kpiAvg = kpiAvgOf(kpiValsBy.get(rep.employee_id) ?? []);
    const live = finalScoreOf(kpiAvg, s360By.get(rep.employee_id) ?? null, has360, penBy.get(rep.employee_id) ?? 0);
    if (hasScoreDrift(live, rep.final_score)) n++;
  }
  return n;
}

/** Direksi: usulan suksesi yang diajukan HRD & menunggu ACC. */
async function direksiSuksesi(supabase: SB): Promise<TodoItem[]> {
  const { count } = await supabase
    .from('succession_plans').select('*', { count: 'exact', head: true }).eq('status', 'submitted');
  return (count ?? 0) > 0
    ? [{ id: 'dir-suksesi', tone: 'indigo', href: '/suksesi', label: `${count} usulan suksesi menunggu ACC` }]
    : [];
}
