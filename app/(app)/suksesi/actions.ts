'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { canAdmin } from '@/lib/auth/roles';
import { logHrdAction, logAuditAsService } from '@/lib/audit/log';

/**
 * Promosi & Suksesi: HRD mengajukan rencana per pegawai (draft/submit), Direksi
 * merespons (approve/reject + komentar). RLS: succ_hrd (HRD all), succ_dir (Direksi
 * update), succ_read (HRD/Direksi). Pegawai tidak melihat.
 */
type Result = { ok: true } | { ok: false; error: string };

async function ctx(): Promise<
  { ok: false; error: string } | { ok: true; supabase: Awaited<ReturnType<typeof createClient>>; userId: string; role: string; isAdmin: boolean; periodId: string }
> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Sesi berakhir, silakan login ulang' };
  const { data: me } = await supabase.from('employees').select('role, is_hrd_admin').eq('id', user.id).maybeSingle();
  const role = me?.role ?? '';
  const isAdmin = canAdmin(me);
  if (!isAdmin && role !== 'direksi') return { ok: false, error: 'Tidak berwenang' };
  const { data: ap } = await supabase.from('periods').select('id').eq('status', 'active').limit(1).maybeSingle();
  if (!ap) return { ok: false, error: 'Tidak ada periode aktif' };
  return { ok: true, supabase, userId: user.id, role, isAdmin, periodId: ap.id };
}

const PlanText = z.string().trim().min(3, 'Rencana terlalu pendek').max(200);
const Just = z.string().trim().max(1000).optional();

/** HRD: buat/ubah rencana suksesi pegawai untuk periode aktif (draft atau submit). */
export async function upsertPlan(employeeId: string, rawPlan: string, rawJust: string, submit: boolean): Promise<Result> {
  const plan = PlanText.safeParse(rawPlan);
  if (!plan.success) return { ok: false, error: plan.error.issues[0].message };
  const just = Just.safeParse(rawJust || undefined);
  if (!just.success) return { ok: false, error: 'Justifikasi terlalu panjang' };

  const c = await ctx(); if (!c.ok) return c;
  if (!c.isAdmin) return { ok: false, error: 'Hanya HRD yang dapat mengajukan rencana' };

  const status = submit ? 'submitted' : 'draft';
  const { data: existing } = await c.supabase
    .from('succession_plans').select('id').eq('employee_id', employeeId).eq('period_id', c.periodId).maybeSingle();

  if (existing) {
    const { error } = await c.supabase.from('succession_plans')
      .update({ plan: plan.data, justification: just.data ?? null, status, proposed_by: c.userId })
      .eq('id', existing.id);
    if (error) return { ok: false, error: 'Gagal menyimpan: ' + error.message };
  } else {
    const { error } = await c.supabase.from('succession_plans')
      .insert({ employee_id: employeeId, period_id: c.periodId, plan: plan.data, justification: just.data ?? null, status, proposed_by: c.userId });
    if (error) return { ok: false, error: 'Gagal menambah: ' + error.message };
  }

  const { data: emp } = await c.supabase.from('employees').select('name').eq('id', employeeId).maybeSingle();
  await logHrdAction({
    action: submit ? 'succession.submit' : 'succession.save_draft', category: 'suksesi',
    summary: submit
      ? `Mengajukan rencana suksesi ${emp?.name ?? employeeId} ke Direksi: "${plan.data}"`
      : `Menyimpan draft rencana suksesi ${emp?.name ?? employeeId}: "${plan.data}"`,
    targetType: 'employee', targetId: employeeId, targetLabel: emp?.name ?? null,
  });
  revalidatePath('/suksesi');
  return { ok: true };
}

/** HRD: hapus rencana (mis. salah ajukan). */
export async function deletePlan(planId: string): Promise<Result> {
  const c = await ctx(); if (!c.ok) return c;
  if (!c.isAdmin) return { ok: false, error: 'Hanya HRD yang dapat menghapus rencana' };
  // Ambil pegawai terkait SEBELUM hapus (untuk ringkasan audit).
  const { data: plan } = await c.supabase.from('succession_plans')
    .select('employee_id').eq('id', planId).maybeSingle();
  const empName = await empNameOf(c.supabase, plan?.employee_id ?? null);
  const { error } = await c.supabase.from('succession_plans').delete().eq('id', planId);
  if (error) return { ok: false, error: 'Gagal menghapus: ' + error.message };

  await logHrdAction({
    action: 'succession.delete', category: 'suksesi',
    summary: `Menghapus rencana suksesi ${empName ?? plan?.employee_id ?? planId}`,
    targetType: 'employee', targetId: plan?.employee_id ?? null, targetLabel: empName,
  });
  revalidatePath('/suksesi');
  return { ok: true };
}

/** Direksi: respons rencana yang diajukan (approve/reject + komentar). */
export async function respondPlan(planId: string, decision: 'approved' | 'rejected', rawComment: string): Promise<Result> {
  if (decision !== 'approved' && decision !== 'rejected') return { ok: false, error: 'Keputusan tidak valid' };
  const comment = z.string().trim().max(1000).safeParse(rawComment);
  if (!comment.success) return { ok: false, error: 'Komentar terlalu panjang' };

  const c = await ctx(); if (!c.ok) return c;
  if (c.role !== 'direksi') return { ok: false, error: 'Hanya Direksi yang dapat merespons' };

  // Pegawai terkait + nama pelaku (Direksi) untuk ringkasan audit.
  const { data: plan } = await c.supabase.from('succession_plans')
    .select('employee_id').eq('id', planId).maybeSingle();
  const empName = await empNameOf(c.supabase, plan?.employee_id ?? null);

  const { error } = await c.supabase.from('succession_plans')
    .update({ status: decision, direksi_id: c.userId, direksi_comment: comment.data || null })
    .eq('id', planId);
  if (error) return { ok: false, error: 'Gagal: ' + error.message };

  // Pelaku = Direksi → RLS hrd_audit_insert menolak klien biasa; pakai service-role.
  const actorName = await empNameOf(c.supabase, c.userId);
  await logAuditAsService({
    action: 'succession.respond', category: 'suksesi',
    summary: `Direksi ${decision === 'approved' ? 'MENYETUJUI' : 'MENOLAK'} rencana suksesi ${empName ?? plan?.employee_id ?? planId}`,
    targetType: 'employee', targetId: plan?.employee_id ?? null, targetLabel: empName,
    meta: { decision },
  }, { id: c.userId, name: actorName });
  revalidatePath('/suksesi');
  return { ok: true };
}

/** Nama pegawai dari id (helper ringkasan audit; null bila tak ada). */
async function empNameOf(
  supabase: Awaited<ReturnType<typeof createClient>>, id: string | null,
): Promise<string | null> {
  if (!id) return null;
  const { data } = await supabase.from('employees').select('name').eq('id', id).maybeSingle();
  return data?.name ?? null;
}
