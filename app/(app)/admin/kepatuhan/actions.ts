'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { canAdmin } from '@/lib/auth/roles';
import { logHrdAction } from '@/lib/audit/log';
import { refreshLatePenalties } from '@/lib/late-server';

/**
 * Punishment kepatuhan (HRD): pengurangan poin per pegawai per periode.
 * Ditulis ke compliance_penalties (RLS penalty_write = HRD). Memotong Skor Akhir
 * (lihat lib/scoring.finalScoreOf) → menjalar ke Dashboard, Review Hasil Akhir, Laporan.
 */
const Input = z.object({
  employeeId: z.string().uuid(),
  points: z.coerce.number().min(0, 'Poin minimal 0').max(100, 'Poin maksimal 100'),
  reason: z.string().trim().max(300).optional().default(''),
});

/**
 * Pengecualian POTONGAN KETERLAMBATAN (−3 Skor 360°, migrasi 0036) untuk satu pegawai di
 * periode aktif — mis. sakit/cuti. `reason` kosong/null = CABUT pengecualian. Alasan wajib
 * (≥3 karakter) saat memberi. Skor 360° pegawai langsung diterapkan ulang.
 */
const WaiverInput = z.object({
  employeeId: z.string().uuid(),
  reason: z.string().trim().max(300).nullable(),
});

export async function setLateWaiver(raw: unknown): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = WaiverInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Input tidak valid' };
  const { employeeId } = parsed.data;
  const reason = parsed.data.reason?.trim() || null;
  if (reason !== null && reason.length < 3) return { ok: false, error: 'Alasan pengecualian minimal 3 karakter' };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Sesi berakhir, silakan login ulang' };
  const { data: me } = await supabase.from('employees').select('role, is_hrd_admin').eq('id', user.id).maybeSingle();
  if (!canAdmin(me)) return { ok: false, error: 'Hanya HRD yang dapat mengecualikan potongan' };

  const { data: ap } = await supabase.from('periods').select('id').eq('status', 'active').limit(1).maybeSingle();
  if (!ap) return { ok: false, error: 'Tidak ada periode aktif' };

  const { error } = reason
    ? await supabase.from('late_penalty_waivers').upsert(
        { employee_id: employeeId, period_id: ap.id, reason, set_by: user.id },
        { onConflict: 'employee_id,period_id' })
    : await supabase.from('late_penalty_waivers').delete().eq('employee_id', employeeId).eq('period_id', ap.id);
  if (error) return { ok: false, error: 'Gagal menyimpan pengecualian: ' + error.message };

  try { await refreshLatePenalties(ap.id, [employeeId]); } catch (e) {
    return { ok: false, error: 'Pengecualian tersimpan, tapi gagal menerapkan ke Skor 360°: ' + (e instanceof Error ? e.message : String(e)) };
  }

  const { data: emp } = await supabase.from('employees').select('name').eq('id', employeeId).maybeSingle();
  await logHrdAction({
    action: reason ? 'late_penalty.waive' : 'late_penalty.unwaive', category: 'kepatuhan',
    summary: reason
      ? `Mengecualikan potongan keterlambatan menilai untuk ${emp?.name ?? employeeId} — alasan: ${reason}`
      : `Mencabut pengecualian potongan keterlambatan menilai untuk ${emp?.name ?? employeeId}`,
    targetType: 'employee', targetId: employeeId, targetLabel: emp?.name ?? null, meta: { reason },
  });
  revalidatePath('/admin/kepatuhan');
  revalidatePath('/admin/dashboard');
  revalidatePath('/admin/laporan');
  revalidatePath('/laporan');
  return { ok: true };
}

export type PenaltyResult ={ ok: true; points: number } | { ok: false; error: string };

export async function setPenalty(raw: unknown): Promise<PenaltyResult> {
  const parsed = Input.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Input tidak valid' };
  const { employeeId, points, reason } = parsed.data;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Sesi berakhir, silakan login ulang' };
  const { data: me } = await supabase.from('employees').select('role, is_hrd_admin').eq('id', user.id).maybeSingle();
  if (!canAdmin(me)) return { ok: false, error: 'Hanya HRD yang dapat memberi punishment' };

  const { data: ap } = await supabase
    .from('periods').select('id').eq('status', 'active').limit(1).maybeSingle();
  if (!ap) return { ok: false, error: 'Tidak ada periode aktif' };

  const { error } = await supabase.from('compliance_penalties').upsert(
    { employee_id: employeeId, period_id: ap.id, points, reason: reason || null, set_by: user.id },
    { onConflict: 'employee_id,period_id' },
  );
  if (error) return { ok: false, error: 'Gagal menyimpan punishment: ' + error.message };

  const { data: emp } = await supabase.from('employees').select('name').eq('id', employeeId).maybeSingle();
  await logHrdAction({
    action: 'penalty.set', category: 'kepatuhan',
    summary: `Menetapkan punishment ${points} poin untuk ${emp?.name ?? employeeId}${reason ? ` — alasan: ${reason}` : ''}`,
    targetType: 'employee', targetId: employeeId, targetLabel: emp?.name ?? null, meta: { points, reason: reason || null },
  });
  revalidatePath('/admin/kepatuhan');
  revalidatePath('/admin/dashboard');
  revalidatePath('/admin/laporan');
  revalidatePath('/laporan');
  return { ok: true, points };
}

/**
 * Terapkan POTONGAN KETERLAMBATAN (−3) ke seluruh Skor 360° tersimpan periode aktif — tombol di
 * halaman Flag Kepatuhan (audit 2026-09-29). Pengganti cron yang dinonaktifkan: potongan bagi
 * penilai yang TAK PERNAH mengirim sampai deadline lewat baru masuk skor lewat aksi ini (atau
 * Hitung Ulang Skor 360°). Hanya memperbarui baris result_360 yang ada — tak menghitung ulang
 * rumus 360°. HRD-only.
 */
export async function applyLatePenalties(): Promise<{ ok: true; changed: number } | { ok: false; error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Sesi berakhir, silakan login ulang' };
  const { data: me } = await supabase.from('employees').select('role, is_hrd_admin').eq('id', user.id).maybeSingle();
  if (!canAdmin(me)) return { ok: false, error: 'Hanya HRD yang dapat menerapkan potongan keterlambatan' };

  const { data: ap } = await supabase.from('periods').select('id, label').eq('status', 'active').limit(1).maybeSingle();
  if (!ap) return { ok: false, error: 'Tidak ada periode aktif' };

  let changed = 0;
  try { changed = await refreshLatePenalties(ap.id); } catch (e) {
    return { ok: false, error: 'Gagal menerapkan potongan: ' + (e instanceof Error ? e.message : String(e)) };
  }

  await logHrdAction({
    action: 'late_penalty.apply', category: 'kepatuhan',
    summary: `Menerapkan potongan keterlambatan menilai ke Skor 360° periode "${ap.label}" (${changed} pegawai diperbarui)`,
    targetType: 'period', targetId: ap.id, targetLabel: ap.label, meta: { changed },
  });
  revalidatePath('/admin/kepatuhan');
  revalidatePath('/admin/laporan');
  revalidatePath('/admin/dashboard');
  return { ok: true, changed };
}
