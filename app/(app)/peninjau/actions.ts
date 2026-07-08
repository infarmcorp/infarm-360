'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { finalScoreOf } from '@/lib/scoring';
import { logAuditAsService } from '@/lib/audit/log';

/**
 * Peninjau Hasil Lintas Divisi (grant is_cross_reviewer, migrasi 0018) — menulis
 * Ringkasan Aspek untuk pegawai di DIVISI LAIN. Peninjau berposisi non-HRD → RLS
 * menolak tulis final_reports; jadi penulisan WAJIB lewat service_role di server ini,
 * yang lebih dulu menegakkan: (a) pelaku pemegang grant, (b) target divisi BERBEDA
 * & non-direksi/eksternal, (c) laporan belum 'finalized'. Tidak mengubah status/skor —
 * hanya narasi (selaras saveAspectSummaries HRD). Audit lewat logAuditAsService.
 */
const SummariesInput = z.record(z.string(), z.string().trim().max(2000));

export async function saveCrossAspectSummaries(
  employeeId: string,
  raw: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = SummariesInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: 'Ringkasan tidak valid' };
  const summaries: Record<string, string> = {};
  for (const [k, v] of Object.entries(parsed.data)) { if (v.trim()) summaries[k] = v.trim(); }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Sesi berakhir, silakan login ulang' };

  const admin = createAdminClient();
  const { data: reviewer } = await admin.from('employees')
    .select('name, dept, is_cross_reviewer').eq('id', user.id).maybeSingle();
  if (!reviewer?.is_cross_reviewer || !reviewer.dept) {
    return { ok: false, error: 'Anda tidak memiliki izin Peninjau Lintas Divisi' };
  }

  const { data: emp } = await admin.from('employees')
    .select('name, dept, role, is_external').eq('id', employeeId).maybeSingle();
  if (!emp || emp.role === 'direksi' || emp.is_external || emp.dept === reviewer.dept) {
    return { ok: false, error: 'Pegawai di luar lingkup Anda (hanya divisi selain divisi Anda sendiri)' };
  }

  const { data: ap } = await admin.from('periods').select('id, has_360').eq('status', 'active').limit(1).maybeSingle();
  if (!ap) return { ok: false, error: 'Tidak ada periode aktif' };

  const { data: existing } = await admin.from('final_reports')
    .select('id, content, status').eq('employee_id', employeeId).eq('period_id', ap.id).maybeSingle();

  if (existing?.status === 'finalized') {
    return { ok: false, error: 'Laporan sudah final — tidak bisa diubah. Hubungi HRD untuk membuka kembali.' };
  }

  if (existing) {
    const content = { ...(existing.content as Record<string, unknown> ?? {}), aspectSummaries: summaries };
    const { error } = await admin.from('final_reports').update({ content }).eq('id', existing.id);
    if (error) return { ok: false, error: 'Gagal menyimpan: ' + error.message };
  } else {
    // Belum ada baris laporan → buat draf. Skor dihitung sekadar mengisi kolom (HRD yang final).
    const { data: months } = await admin.from('period_months').select('ym').eq('period_id', ap.id);
    const yms = (months ?? []).map((m) => m.ym);
    const { data: kpi } = yms.length
      ? await admin.from('kpi_scores').select('score').eq('employee_id', employeeId).in('ym', yms) : { data: [] };
    const kpiAvg = kpi && kpi.length ? kpi.reduce((a, b) => a + b.score, 0) / kpi.length : null;
    const { data: r } = await admin.from('result_360').select('score')
      .eq('employee_id', employeeId).eq('period_id', ap.id).maybeSingle();
    const { data: pn } = await admin.from('compliance_penalties').select('points')
      .eq('employee_id', employeeId).eq('period_id', ap.id).maybeSingle();
    const final = finalScoreOf(kpiAvg, r?.score ?? null, ap.has_360, pn?.points ?? 0);
    const { error } = await admin.from('final_reports').insert({
      employee_id: employeeId, period_id: ap.id, final_score: final, status: 'draft',
      content: { aspectSummaries: summaries },
    });
    if (error) return { ok: false, error: 'Gagal menyimpan: ' + error.message };
  }

  await logAuditAsService({
    action: 'crossreview.save_summary', category: 'laporan',
    summary: `Peninjau lintas divisi menyimpan ringkasan aspek 360° untuk ${emp.name} (divisi ${emp.dept})`,
    targetType: 'employee', targetId: employeeId, targetLabel: emp.name,
  }, { id: user.id, name: reviewer.name ?? null });

  revalidatePath(`/peninjau/${employeeId}`);
  return { ok: true };
}

/**
 * Kembar saveCrossAspectSummaries untuk PERTANYAAN KUALITATIF → content.qualSummaries.
 * Kewenangan & penegakan identik (pemegang grant, divisi berbeda, non-final).
 */
export async function saveCrossQualSummaries(
  employeeId: string,
  raw: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = SummariesInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: 'Ringkasan tidak valid' };
  const summaries: Record<string, string> = {};
  for (const [k, v] of Object.entries(parsed.data)) { if (v.trim()) summaries[k] = v.trim(); }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Sesi berakhir, silakan login ulang' };

  const admin = createAdminClient();
  const { data: reviewer } = await admin.from('employees')
    .select('name, dept, is_cross_reviewer').eq('id', user.id).maybeSingle();
  if (!reviewer?.is_cross_reviewer || !reviewer.dept) {
    return { ok: false, error: 'Anda tidak memiliki izin Peninjau Lintas Divisi' };
  }

  const { data: emp } = await admin.from('employees')
    .select('name, dept, role, is_external').eq('id', employeeId).maybeSingle();
  if (!emp || emp.role === 'direksi' || emp.is_external || emp.dept === reviewer.dept) {
    return { ok: false, error: 'Pegawai di luar lingkup Anda (hanya divisi selain divisi Anda sendiri)' };
  }

  const { data: ap } = await admin.from('periods').select('id, has_360').eq('status', 'active').limit(1).maybeSingle();
  if (!ap) return { ok: false, error: 'Tidak ada periode aktif' };

  const { data: existing } = await admin.from('final_reports')
    .select('id, content, status').eq('employee_id', employeeId).eq('period_id', ap.id).maybeSingle();

  if (existing?.status === 'finalized') {
    return { ok: false, error: 'Laporan sudah final — tidak bisa diubah. Hubungi HRD untuk membuka kembali.' };
  }

  if (existing) {
    const content = { ...(existing.content as Record<string, unknown> ?? {}), qualSummaries: summaries };
    const { error } = await admin.from('final_reports').update({ content }).eq('id', existing.id);
    if (error) return { ok: false, error: 'Gagal menyimpan: ' + error.message };
  } else {
    const { data: months } = await admin.from('period_months').select('ym').eq('period_id', ap.id);
    const yms = (months ?? []).map((m) => m.ym);
    const { data: kpi } = yms.length
      ? await admin.from('kpi_scores').select('score').eq('employee_id', employeeId).in('ym', yms) : { data: [] };
    const kpiAvg = kpi && kpi.length ? kpi.reduce((a, b) => a + b.score, 0) / kpi.length : null;
    const { data: r } = await admin.from('result_360').select('score')
      .eq('employee_id', employeeId).eq('period_id', ap.id).maybeSingle();
    const { data: pn } = await admin.from('compliance_penalties').select('points')
      .eq('employee_id', employeeId).eq('period_id', ap.id).maybeSingle();
    const final = finalScoreOf(kpiAvg, r?.score ?? null, ap.has_360, pn?.points ?? 0);
    const { error } = await admin.from('final_reports').insert({
      employee_id: employeeId, period_id: ap.id, final_score: final, status: 'draft',
      content: { qualSummaries: summaries },
    });
    if (error) return { ok: false, error: 'Gagal menyimpan: ' + error.message };
  }

  await logAuditAsService({
    action: 'crossreview.save_qual_summary', category: 'laporan',
    summary: `Peninjau lintas divisi menyimpan ringkasan pertanyaan kualitatif 360° untuk ${emp.name} (divisi ${emp.dept})`,
    targetType: 'employee', targetId: employeeId, targetLabel: emp.name,
  }, { id: user.id, name: reviewer.name ?? null });

  revalidatePath(`/peninjau/${employeeId}`);
  return { ok: true };
}
