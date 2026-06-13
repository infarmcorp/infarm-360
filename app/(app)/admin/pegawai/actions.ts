'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient, createAdminClient } from '@/lib/supabase/server';

/**
 * Kelola Pegawai (HRD): kelola akun + baris employees + keanggotaan tim SPV.
 *
 * Membuat/menghapus akun auth WAJIB lewat service_role (admin.*); baris `employees`
 * & `spv_team_members` ditulis lewat client user-scoped (RLS emp_manage/team_manage = HRD).
 * Email boleh placeholder (mis. nama@infarm.test) — login pakai email+sandi langsung,
 * tanpa verifikasi inbox; ganti ke email asli kapan saja dari sini.
 *
 * Nonaktif = is_active:false + BAN akun auth (tak bisa login) tanpa menghapus histori.
 */
type Result = { ok: true; msg?: string } | { ok: false; error: string };

const BAN_FOREVER = '876000h'; // ~100 tahun

async function requireHrd(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: 'Sesi berakhir, silakan login ulang' };
  const { data: me } = await supabase.from('employees').select('role').eq('id', user.id).maybeSingle();
  if (me?.role !== 'hrd') return { ok: false as const, error: 'Hanya HRD yang dapat mengelola pegawai' };
  return { ok: true as const, userId: user.id };
}

function revalidate() {
  revalidatePath('/admin/pegawai');
  revalidatePath('/admin/pemetaan');
  revalidatePath('/login');
}

const Role = z.enum(['employee', 'spv', 'hrd', 'direksi']);
const EmpCode = z.string().trim().regex(/^[A-Za-z]{2,6}\d{2,5}$/, 'Kode pegawai: 2–6 huruf + angka (mis. EMP010)');
const Email = z.string().trim().email('Email tidak valid');
const Password = z.string().min(6, 'Sandi minimal 6 karakter');
const OptId = z.string().uuid().nullish();

const CreateInput = z.object({
  name: z.string().trim().min(2, 'Nama minimal 2 karakter'),
  empCode: EmpCode,
  dept: z.string().trim().min(1, 'Divisi wajib diisi'),
  role: Role,
  email: Email,
  password: Password,
  spvId: OptId, // atasan/SPV (opsional)
});

/** Tambah pegawai baru: buat akun auth → baris employees → (opsional) tautkan ke tim SPV. */
export async function createEmployee(raw: unknown): Promise<Result> {
  const parsed = CreateInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Input tidak valid' };
  const { name, empCode, dept, role, email, password, spvId } = parsed.data;

  const supabase = await createClient();
  const auth = await requireHrd(supabase);
  if (!auth.ok) return { ok: false, error: auth.error };

  const admin = createAdminClient();

  // 1) Akun auth (service_role). email_confirm:true → tanpa verifikasi inbox.
  const { data: created, error: cErr } = await admin.auth.admin.createUser({
    email, password, email_confirm: true,
    user_metadata: { name, emp_code: empCode.toUpperCase() },
  });
  if (cErr || !created?.user) {
    const dup = /already|registered|exists/i.test(cErr?.message ?? '');
    return { ok: false, error: dup ? 'Email sudah dipakai akun lain' : 'Gagal membuat akun: ' + (cErr?.message ?? 'tidak diketahui') };
  }
  const newId = created.user.id;

  // 2) Baris employees (RLS emp_manage = HRD). Rollback akun bila gagal.
  const { error: eErr } = await supabase.from('employees')
    .insert({ id: newId, emp_code: empCode.toUpperCase(), name, dept, role, is_active: true });
  if (eErr) {
    await admin.auth.admin.deleteUser(newId); // bersihkan akun yatim
    return { ok: false, error: eErr.code === '23505' ? 'Kode pegawai sudah dipakai' : 'Gagal menyimpan data: ' + eErr.message };
  }

  // 3) Tautkan ke tim SPV (opsional).
  if (spvId && spvId !== newId) {
    const { error: tErr } = await supabase.from('spv_team_members').insert({ spv_id: spvId, employee_id: newId });
    if (tErr) { revalidate(); return { ok: true, msg: 'Pegawai dibuat, tapi gagal menautkan atasan: ' + tErr.message }; }
  }

  revalidate();
  return { ok: true, msg: `Pegawai ${name} berhasil ditambahkan.` };
}

const UpdateInput = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(2, 'Nama minimal 2 karakter'),
  empCode: EmpCode,
  dept: z.string().trim().min(1, 'Divisi wajib diisi'),
  role: Role,
  email: Email,
  spvId: OptId,
});

/** Ubah data pegawai: name/dept/role/emp_code + email (akun) + atasan (tim SPV tunggal). */
export async function updateEmployee(raw: unknown): Promise<Result> {
  const parsed = UpdateInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Input tidak valid' };
  const { id, name, empCode, dept, role, email, spvId } = parsed.data;

  const supabase = await createClient();
  const auth = await requireHrd(supabase);
  if (!auth.ok) return { ok: false, error: auth.error };
  const admin = createAdminClient();

  const { error: eErr } = await supabase.from('employees')
    .update({ name, emp_code: empCode.toUpperCase(), dept, role }).eq('id', id);
  if (eErr) return { ok: false, error: eErr.code === '23505' ? 'Kode pegawai sudah dipakai' : 'Gagal menyimpan: ' + eErr.message };

  // Sinkronkan email akun bila berubah.
  const { data: u } = await admin.auth.admin.getUserById(id);
  if (u?.user && u.user.email !== email) {
    const { error: uErr } = await admin.auth.admin.updateUserById(id, { email, email_confirm: true });
    if (uErr) return { ok: false, error: /already|registered|exists/i.test(uErr.message) ? 'Email sudah dipakai akun lain' : 'Data tersimpan, email gagal diubah: ' + uErr.message };
  }

  // Atasan tunggal: bersihkan keanggotaan lama pegawai ini, lalu set yang baru.
  await supabase.from('spv_team_members').delete().eq('employee_id', id);
  if (spvId && spvId !== id) {
    const { error: tErr } = await supabase.from('spv_team_members').insert({ spv_id: spvId, employee_id: id });
    if (tErr) { revalidate(); return { ok: true, msg: 'Data tersimpan, tapi gagal menautkan atasan: ' + tErr.message }; }
  }

  revalidate();
  return { ok: true, msg: 'Perubahan disimpan.' };
}

/** Aktif/nonaktif: toggle is_active + ban/unban akun auth (nonaktif → tak bisa login). */
export async function setEmployeeActive(id: string, active: boolean): Promise<Result> {
  if (!z.string().uuid().safeParse(id).success) return { ok: false, error: 'Input tidak valid' };
  const supabase = await createClient();
  const auth = await requireHrd(supabase);
  if (!auth.ok) return { ok: false, error: auth.error };
  if (id === auth.userId) return { ok: false, error: 'Tidak dapat menonaktifkan akun Anda sendiri' };

  const { error } = await supabase.from('employees').update({ is_active: active }).eq('id', id);
  if (error) return { ok: false, error: 'Gagal: ' + error.message };

  const admin = createAdminClient();
  const { error: bErr } = await admin.auth.admin.updateUserById(id, { ban_duration: active ? 'none' : BAN_FOREVER });
  if (bErr) return { ok: false, error: 'Status diubah, tapi gagal mengunci akun: ' + bErr.message };

  revalidate();
  return { ok: true, msg: active ? 'Pegawai diaktifkan.' : 'Pegawai dinonaktifkan (akun dikunci).' };
}

/** Reset sandi pegawai (HRD). Pegawai sebaiknya menggantinya sendiri setelah login. */
export async function resetPassword(id: string, newPassword: string): Promise<Result> {
  if (!z.string().uuid().safeParse(id).success) return { ok: false, error: 'Input tidak valid' };
  if (!Password.safeParse(newPassword).success) return { ok: false, error: 'Sandi minimal 6 karakter' };
  const supabase = await createClient();
  const auth = await requireHrd(supabase);
  if (!auth.ok) return { ok: false, error: auth.error };

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.updateUserById(id, { password: newPassword });
  if (error) return { ok: false, error: 'Gagal: ' + error.message };
  return { ok: true, msg: 'Sandi berhasil direset.' };
}
