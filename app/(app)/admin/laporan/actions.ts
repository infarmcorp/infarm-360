'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { canAdmin } from '@/lib/auth/roles';
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
  // allow360Only: subjek ber-360°-tanpa-KPI (mis. Direksi) → Skor Akhir dihitung dari 360° saja.
  return { kpiAvg, s360, penalty, final: finalScoreOf(kpiAvg, s360, has360, penalty, true) };
}

export type FinalizeResult = { ok: true; finalScore: number; finalized: boolean } | { ok: false; error: string };

export async function saveOrFinalizeReport(employeeId: string, finalize: boolean): Promise<FinalizeResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Sesi berakhir, silakan login ulang' };
  const { data: me } = await supabase.from('employees').select('role, is_hrd_admin').eq('id', user.id).maybeSingle();
  if (!canAdmin(me)) return { ok: false, error: 'Hanya HRD yang dapat memfinalisasi laporan' };

  const { data: ap } = await supabase
    .from('periods').select('id, has_360, status').eq('status', 'active').limit(1).maybeSingle();
  if (!ap) return { ok: false, error: 'Tidak ada periode aktif' };

  const { final } = await computeFinal(supabase, ap.id, ap.has_360, employeeId);
  if (final == null) {
    // Tolak hanya bila KPI DAN 360° dua-duanya kosong (tak ada dasar skor). Subjek ber-360°-
    // tanpa-KPI (mis. Direksi) TETAP boleh: Skor Akhir dari 360° (lihat computeFinal allow360Only).
    return { ok: false, error: 'Skor Akhir belum bisa dihitung (KPI & Skor 360° pegawai keduanya masih kosong)' };
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
  const { data: me } = await supabase.from('employees').select('role, is_hrd_admin').eq('id', user.id).maybeSingle();
  if (!canAdmin(me)) return { ok: false, error: 'Hanya HRD yang dapat merilis laporan' };

  const { data: ap } = await supabase
    .from('periods').select('id, has_360, status').eq('status', 'active').limit(1).maybeSingle();
  if (!ap) return { ok: false, error: 'Tidak ada periode aktif' };

  const { final } = await computeFinal(supabase, ap.id, ap.has_360, employeeId);
  if (final == null) {
    // Tolak hanya bila KPI & 360° dua-duanya kosong (selaras saveOrFinalizeReport).
    return { ok: false, error: 'Skor Akhir belum bisa dihitung (KPI & Skor 360° pegawai keduanya masih kosong)' };
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
  const { data: me } = await supabase.from('employees').select('role, is_hrd_admin').eq('id', user.id).maybeSingle();
  if (!canAdmin(me)) return { ok: false, error: 'Hanya HRD yang dapat menyimpan ringkasan' };

  const { data: ap } = await supabase.from('periods').select('id, has_360').eq('status', 'active').limit(1).maybeSingle();
  if (!ap) return { ok: false, error: 'Tidak ada periode aktif' };

  const { data: existing } = await supabase.from('final_reports')
    .select('id, content, status').eq('employee_id', employeeId).eq('period_id', ap.id).maybeSingle();

  // Laporan FINAL terkunci: ringkasan tak bisa diubah sampai dikembalikan ke draf
  // (selaras penguncian editor di UI — sumber kebenaran yang dilihat pegawai tak berubah diam-diam).
  if (existing?.status === 'finalized') {
    return { ok: false, error: 'Laporan sudah final — kembalikan ke draf dulu untuk mengedit ringkasan.' };
  }

  if (existing) {
    const content = { ...(existing.content as Record<string, unknown> ?? {}), aspectSummaries: summaries };
    // .select() agar tahu jumlah baris terupdate — RLS yang menolak diam-diam (0 baris,
    // tanpa error) tak lagi lolos sebagai "tersimpan".
    const { data: upd, error } = await supabase.from('final_reports')
      .update({ content }).eq('id', existing.id).select('id');
    if (error) return { ok: false, error: 'Gagal menyimpan: ' + error.message };
    if (!upd || upd.length === 0) return { ok: false, error: 'Gagal menyimpan ringkasan (akses ditolak / laporan tak ditemukan)' };
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

/**
 * Simpan ringkasan HRD per PERTANYAAN KUALITATIF (esai) → final_reports.content.qualSummaries.
 * Kembar dari saveAspectSummaries; hanya field content yang berbeda. Tidak mengubah status/skor;
 * membuat baris draft bila belum ada. Terkunci bila laporan sudah 'finalized'.
 */
export async function saveQualSummaries(employeeId: string, raw: unknown): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = SummariesInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: 'Ringkasan tidak valid' };
  const summaries: Record<string, string> = {};
  for (const [k, v] of Object.entries(parsed.data)) { if (v.trim()) summaries[k] = v.trim(); }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Sesi berakhir, silakan login ulang' };
  const { data: me } = await supabase.from('employees').select('role, is_hrd_admin').eq('id', user.id).maybeSingle();
  if (!canAdmin(me)) return { ok: false, error: 'Hanya HRD yang dapat menyimpan ringkasan' };

  const { data: ap } = await supabase.from('periods').select('id, has_360').eq('status', 'active').limit(1).maybeSingle();
  if (!ap) return { ok: false, error: 'Tidak ada periode aktif' };

  const { data: existing } = await supabase.from('final_reports')
    .select('id, content, status').eq('employee_id', employeeId).eq('period_id', ap.id).maybeSingle();

  if (existing?.status === 'finalized') {
    return { ok: false, error: 'Laporan sudah final — kembalikan ke draf dulu untuk mengedit ringkasan.' };
  }

  if (existing) {
    const content = { ...(existing.content as Record<string, unknown> ?? {}), qualSummaries: summaries };
    const { data: upd, error } = await supabase.from('final_reports')
      .update({ content }).eq('id', existing.id).select('id');
    if (error) return { ok: false, error: 'Gagal menyimpan: ' + error.message };
    if (!upd || upd.length === 0) return { ok: false, error: 'Gagal menyimpan ringkasan (akses ditolak / laporan tak ditemukan)' };
  } else {
    const { final } = await computeFinal(supabase, ap.id, ap.has_360, employeeId);
    const { error } = await supabase.from('final_reports').insert({
      employee_id: employeeId, period_id: ap.id, final_score: final, status: 'draft',
      content: { qualSummaries: summaries },
    });
    if (error) return { ok: false, error: 'Gagal menyimpan: ' + error.message };
  }

  const { data: emp } = await supabase.from('employees').select('name').eq('id', employeeId).maybeSingle();
  await logHrdAction({
    action: 'report.save_qual_summary', category: 'laporan',
    summary: `Menyimpan ringkasan pertanyaan kualitatif 360° untuk ${emp?.name ?? employeeId}`,
    targetType: 'employee', targetId: employeeId, targetLabel: emp?.name ?? null,
  });
  revalidatePath(`/laporan/${employeeId}`);
  return { ok: true };
}
