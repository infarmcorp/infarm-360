'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { logHrdAction } from '@/lib/audit/log';
import { finalScoreOf } from '@/lib/scoring';

/**
 * Review Hasil Akhir (HRD): hitung Skor Akhir kalibrasi & tulis final_reports.
 *
 * Keamanan: RLS fr_hrd mengizinkan HRD menulis final_reports (tak perlu service_role).
 * Finalisasi mengubah status → 'finalized' sehingga pegawai bisa melihat (fr_read).
 */
async function computeFinal(
  supabase: Awaited<ReturnType<typeof createClient>>,
  periodId: string, has360: boolean, employeeId: string,
) {
  const { data: months } = await supabase.from('period_months').select('ym').eq('period_id', periodId);
  const yms = (months ?? []).map((m) => m.ym);
  const { data: kpi } = yms.length
    ? await supabase.from('kpi_scores').select('score').eq('employee_id', employeeId).in('ym', yms)
    : { data: [] };
  const kpiAvg = kpi && kpi.length ? kpi.reduce((a, b) => a + b.score, 0) / kpi.length : null;
  const { data: r } = await supabase.from('result_360').select('score')
    .eq('employee_id', employeeId).eq('period_id', periodId).maybeSingle();
  const s360 = r?.score ?? null;
  const { data: p } = await supabase.from('compliance_penalties').select('points')
    .eq('employee_id', employeeId).eq('period_id', periodId).maybeSingle();
  const penalty = p?.points ?? 0;
  return { kpiAvg, s360, penalty, final: finalScoreOf(kpiAvg, s360, has360, penalty) };
}

export type FinalizeResult = { ok: true; finalScore: number; finalized: boolean } | { ok: false; error: string };

export async function saveOrFinalizeReport(employeeId: string, finalize: boolean): Promise<FinalizeResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Sesi berakhir, silakan login ulang' };
  const { data: me } = await supabase.from('employees').select('role').eq('id', user.id).maybeSingle();
  if (me?.role !== 'hrd') return { ok: false, error: 'Hanya HRD yang dapat memfinalisasi laporan' };

  const { data: ap } = await supabase
    .from('periods').select('id, has_360, status').eq('status', 'active').limit(1).maybeSingle();
  if (!ap) return { ok: false, error: 'Tidak ada periode aktif' };

  const { kpiAvg, final } = await computeFinal(supabase, ap.id, ap.has_360, employeeId);
  if (kpiAvg == null || final == null) {
    return { ok: false, error: 'Skor Akhir belum bisa dihitung (KPI pegawai masih kosong)' };
  }

  const status = finalize ? 'finalized' : 'draft';
  const { data: existing } = await supabase
    .from('final_reports').select('id')
    .eq('employee_id', employeeId).eq('period_id', ap.id).maybeSingle();

  if (existing) {
    const { error } = await supabase.from('final_reports')
      .update({ final_score: final, status, finalized_by: finalize ? user.id : null })
      .eq('id', existing.id);
    if (error) return { ok: false, error: 'Gagal menyimpan: ' + error.message };
  } else {
    const { error } = await supabase.from('final_reports')
      .insert({ employee_id: employeeId, period_id: ap.id, final_score: final, status, finalized_by: finalize ? user.id : null });
    if (error) return { ok: false, error: 'Gagal menyimpan: ' + error.message };
  }

  const { data: emp } = await supabase.from('employees').select('name').eq('id', employeeId).maybeSingle();
  await logHrdAction({
    action: finalize ? 'report.finalize' : 'report.save_draft', category: 'laporan',
    summary: finalize
      ? `Memfinalisasi Hasil Akhir ${emp?.name ?? employeeId} (Skor Akhir ${final}) — laporan dirilis ke pegawai`
      : `Menyimpan draft Hasil Akhir ${emp?.name ?? employeeId} (Skor Akhir ${final})`,
    targetType: 'employee', targetId: employeeId, targetLabel: emp?.name ?? null,
    meta: { final_score: final, period_id: ap.id },
  });
  revalidatePath('/admin/laporan');
  revalidatePath('/laporan');
  return { ok: true, finalScore: final, finalized: finalize };
}

/**
 * Rilis hasil ke SPV (HRD): status 'draft' → 'in_review'. Setelah ini SPV anggota
 * tim boleh melihat DETAIL AGREGAT (radar/aspek + ringkasan aspek HRD, tanpa raw).
 * Tidak mengubah skor; menghitung & menyimpan final_score bila baris belum ada.
 * NON-BLOK terhadap finalisasi — HRD tetap bisa finalisasi tanpa menunggu ACC SPV.
 */
export async function releaseToSpv(employeeId: string): Promise<FinalizeResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Sesi berakhir, silakan login ulang' };
  const { data: me } = await supabase.from('employees').select('role').eq('id', user.id).maybeSingle();
  if (me?.role !== 'hrd') return { ok: false, error: 'Hanya HRD yang dapat merilis laporan' };

  const { data: ap } = await supabase
    .from('periods').select('id, has_360, status').eq('status', 'active').limit(1).maybeSingle();
  if (!ap) return { ok: false, error: 'Tidak ada periode aktif' };

  const { kpiAvg, final } = await computeFinal(supabase, ap.id, ap.has_360, employeeId);
  if (kpiAvg == null || final == null) {
    return { ok: false, error: 'Skor Akhir belum bisa dihitung (KPI pegawai masih kosong)' };
  }

  const { data: existing } = await supabase
    .from('final_reports').select('id, status')
    .eq('employee_id', employeeId).eq('period_id', ap.id).maybeSingle();

  if (existing?.status === 'finalized') {
    return { ok: false, error: 'Laporan sudah difinalisasi — tidak bisa dikembalikan ke tahap tinjauan SPV' };
  }

  if (existing) {
    const { error } = await supabase.from('final_reports')
      .update({ final_score: final, status: 'in_review', finalized_by: null })
      .eq('id', existing.id);
    if (error) return { ok: false, error: 'Gagal merilis: ' + error.message };
  } else {
    const { error } = await supabase.from('final_reports')
      .insert({ employee_id: employeeId, period_id: ap.id, final_score: final, status: 'in_review' });
    if (error) return { ok: false, error: 'Gagal merilis: ' + error.message };
  }

  const { data: emp } = await supabase.from('employees').select('name').eq('id', employeeId).maybeSingle();
  await logHrdAction({
    action: 'report.release_spv', category: 'laporan',
    summary: `Merilis Hasil Akhir ${emp?.name ?? employeeId} ke SPV untuk ditinjau (Skor Akhir ${final})`,
    targetType: 'employee', targetId: employeeId, targetLabel: emp?.name ?? null,
    meta: { final_score: final, period_id: ap.id },
  });
  revalidatePath('/admin/laporan');
  revalidatePath('/laporan-tim');
  revalidatePath(`/laporan/${employeeId}`);
  return { ok: true, finalScore: final, finalized: false };
}

/**
 * Simpan ringkasan HRD per aspek (kalibrasi naratif) ke final_reports.content.aspectSummaries.
 * Tidak mengubah status/skor — hanya menulis narasi. Membuat baris draft bila belum ada.
 */
const SummariesInput = z.record(z.string(), z.string().trim().max(2000));
export async function saveAspectSummaries(employeeId: string, raw: unknown): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = SummariesInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: 'Ringkasan tidak valid' };
  // Buang entri kosong.
  const summaries: Record<string, string> = {};
  for (const [k, v] of Object.entries(parsed.data)) { if (v.trim()) summaries[k] = v.trim(); }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Sesi berakhir, silakan login ulang' };
  const { data: me } = await supabase.from('employees').select('role').eq('id', user.id).maybeSingle();
  if (me?.role !== 'hrd') return { ok: false, error: 'Hanya HRD yang dapat menyimpan ringkasan' };

  const { data: ap } = await supabase.from('periods').select('id, has_360').eq('status', 'active').limit(1).maybeSingle();
  if (!ap) return { ok: false, error: 'Tidak ada periode aktif' };

  const { data: existing } = await supabase.from('final_reports')
    .select('id, content').eq('employee_id', employeeId).eq('period_id', ap.id).maybeSingle();

  if (existing) {
    const content = { ...(existing.content as Record<string, unknown> ?? {}), aspectSummaries: summaries };
    const { error } = await supabase.from('final_reports').update({ content }).eq('id', existing.id);
    if (error) return { ok: false, error: 'Gagal menyimpan: ' + error.message };
  } else {
    const { final } = await computeFinal(supabase, ap.id, ap.has_360, employeeId);
    const { error } = await supabase.from('final_reports').insert({
      employee_id: employeeId, period_id: ap.id, final_score: final, status: 'draft',
      content: { aspectSummaries: summaries },
    });
    if (error) return { ok: false, error: 'Gagal menyimpan: ' + error.message };
  }

  const { data: emp } = await supabase.from('employees').select('name').eq('id', employeeId).maybeSingle();
  await logHrdAction({
    action: 'report.save_summary', category: 'laporan',
    summary: `Menyimpan ringkasan aspek 360° untuk ${emp?.name ?? employeeId}`,
    targetType: 'employee', targetId: employeeId, targetLabel: emp?.name ?? null,
  });
  revalidatePath(`/laporan/${employeeId}`);
  return { ok: true };
}
