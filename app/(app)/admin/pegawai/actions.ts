'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { canAdmin, canSection, isFullHrd, isHrdDept, HRD_SECTIONS } from '@/lib/auth/roles';
import { logHrdAction } from '@/lib/audit/log';

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

/**
 * Gerbang aksi Kelola Pegawai (audit 2026-09-30):
 *   - 'section' (default): HRD yang boleh membuka bagian Kelola Pegawai (canSection 'pegawai').
 *   - 'full': HANYA HRD berakses penuh — untuk aksi yang MENGUBAH IZIN (HRD Admin, bagian HRD,
 *     Koordinator + timnya). Cegah rekan HRD terbatas menaikkan aksesnya sendiri / orang lain.
 * DB juga menegakkan ini (trigger employees_guard_privileges, migrasi 0045).
 */
async function requireHrd(supabase: Awaited<ReturnType<typeof createClient>>, level: 'section' | 'full' = 'section') {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: 'Sesi berakhir, silakan login ulang' };
  const { data: me } = await supabase.from('employees').select('role, is_hrd_admin, hrd_sections').eq('id', user.id).maybeSingle();
  if (!canAdmin(me)) return { ok: false as const, error: 'Hanya HRD yang dapat mengelola pegawai' };
  if (level === 'full' && !isFullHrd(me)) {
    return { ok: false as const, error: 'Hanya HRD Admin dengan akses penuh yang dapat mengubah izin.' };
  }
  if (level === 'section' && !canSection(me, 'pegawai')) {
    return { ok: false as const, error: 'Hanya HRD dengan akses Kelola Pegawai yang dapat mengelola pegawai' };
  }
  return { ok: true as const, userId: user.id, full: isFullHrd(me) };
}

/** Akun ber-hak istimewa (HRD Admin / Direksi) hanya boleh diubah oleh HRD berakses penuh. */
const PRIVILEGED_MSG = 'Akun HRD / Direksi hanya dapat diubah oleh HRD Admin dengan akses penuh.';
async function isPrivileged(supabase: Awaited<ReturnType<typeof createClient>>, id: string): Promise<boolean> {
  const { data: t } = await supabase.from('employees').select('role, is_hrd_admin').eq('id', id).maybeSingle();
  return canAdmin(t) || t?.role === 'direksi';
}
const isPrivilegedRole = (role: string) => role === 'hrd' || role === 'direksi';

function revalidate() {
  revalidatePath('/admin/pegawai');
  revalidatePath('/admin/pemetaan');
  revalidatePath('/login');
  // Aktif/nonaktif & perubahan pemetaan langsung tercermin di Progress 360 & daftar
  // penilaian rekan (target nonaktif hilang, reaktivasi muncul lagi) tanpa tunggu cache.
  revalidatePath('/admin/progress');
  revalidatePath('/penilaian');
  // Perubahan peran/grant/koordinator/atasan/aktif langsung tercermin di Struktur Organisasi.
  revalidatePath('/admin/struktur');
  // Segarkan notifikasi sidebar (getTodos): aktif/nonaktif mengubah pemetaan aktif & anggota tim.
  revalidatePath('/', 'layout');
}

/**
 * Beri/cabut izin HRD Admin (grant `is_hrd_admin`) — kapabilitas mengoperasikan
 * aplikasi, TERPISAH dari posisi `role`. Hanya HRD Admin yang boleh; tercatat di
 * Log Aktivitas HRD. RLS emp_manage (HRD) mengizinkan UPDATE baris employees.
 */
export async function setHrdAdmin(employeeId: string, value: boolean): Promise<Result> {
  const supabase = await createClient();
  const auth = await requireHrd(supabase, 'full');
  if (!auth.ok) return auth;

  const { data: target } = await supabase.from('employees').select('name, dept').eq('id', employeeId).maybeSingle();
  // Grant HRD Admin HANYA untuk pegawai divisi HRD (kebijakan). Pencabutan selalu boleh.
  if (value && !isHrdDept(target?.dept)) {
    return { ok: false, error: 'Izin HRD Admin hanya dapat diberikan kepada pegawai divisi HRD.' };
  }
  const { error } = await supabase.from('employees').update({ is_hrd_admin: value }).eq('id', employeeId);
  if (error) return { ok: false, error: 'Gagal mengubah izin: ' + error.message };

  await logHrdAction({
    action: value ? 'employee.grant_hrd' : 'employee.revoke_hrd', category: 'pegawai',
    summary: `${value ? 'Memberi' : 'Mencabut'} izin HRD Admin untuk ${target?.name ?? employeeId}`,
    targetType: 'employee', targetId: employeeId, targetLabel: target?.name ?? null,
  });
  revalidate();
  return { ok: true, msg: value ? 'Izin HRD Admin diberikan.' : 'Izin HRD Admin dicabut.' };
}

// setCrossReviewer() DIHAPUS (migrasi 0033): "Peninjau Hasil Lintas Divisi" dipensiunkan → kini
// diberikan lewat grant halaman "Review Hasil Akhir" (lingkup "selain divisinya", izin "Boleh meringkas")
// di Manajemen Akses. Log lama employee.grant/revoke_cross_reviewer tetap ada di riwayat.

/**
 * Beri/cabut peran "Koordinator" (grant `is_coordinator`, migrasi 0021). Kapabilitas SEMPIT
 * & lihat-saja: membuka "Laporan Kinerja Tim" untuk DAFTAR pegawai eksplisit yang dinaungi.
 * TIDAK memberi akses HRD & tidak menyentuh is_hrd()/RLS. Saat DICABUT, keanggotaan timnya
 * (coordinator_team_members) ikut dibersihkan. Hanya HRD; tercatat di Log Aktivitas HRD.
 */
export async function setCoordinator(employeeId: string, value: boolean): Promise<Result> {
  if (!z.string().uuid().safeParse(employeeId).success) return { ok: false, error: 'Input tidak valid' };
  const supabase = await createClient();
  const auth = await requireHrd(supabase, 'full');
  if (!auth.ok) return auth;

  const { data: target } = await supabase.from('employees').select('name').eq('id', employeeId).maybeSingle();
  const { error } = await supabase.from('employees').update({ is_coordinator: value }).eq('id', employeeId);
  if (error) return { ok: false, error: 'Gagal mengubah peran: ' + error.message };
  // Cabut → bersihkan tim koordinasi agar tak ada baris yatim.
  if (!value) await supabase.from('coordinator_team_members').delete().eq('coordinator_id', employeeId);

  await logHrdAction({
    action: value ? 'employee.grant_coordinator' : 'employee.revoke_coordinator', category: 'pegawai',
    summary: `${value ? 'Menjadikan' : 'Mencabut peran'} Koordinator untuk ${target?.name ?? employeeId}`,
    targetType: 'employee', targetId: employeeId, targetLabel: target?.name ?? null,
  });
  revalidate();
  return { ok: true, msg: value ? 'Peran Koordinator diberikan. Atur anggota tim lewat tombol "Tim".' : 'Peran Koordinator dicabut.' };
}

/**
 * Tetapkan DAFTAR pegawai yang dinaungi seorang koordinator (ganti total isi
 * coordinator_team_members untuk koordinator ini). Koordinator tak boleh menaungi dirinya
 * sendiri. Hanya HRD; tercatat di Log Aktivitas HRD.
 */
export async function setCoordinatorTeam(coordinatorId: string, employeeIds: unknown): Promise<Result> {
  const parsed = z.object({
    coordinatorId: z.string().uuid(),
    ids: z.array(z.string().uuid()),
  }).safeParse({ coordinatorId, ids: employeeIds });
  if (!parsed.success) return { ok: false, error: 'Input tidak valid' };
  const { coordinatorId: cid, ids } = parsed.data;

  const supabase = await createClient();
  const auth = await requireHrd(supabase, 'full');
  if (!auth.ok) return auth;

  // Pastikan target memang koordinator (cegah salah pasang tim ke non-koordinator).
  const { data: coord } = await supabase.from('employees').select('name, is_coordinator, dept').eq('id', cid).maybeSingle();
  if (!coord?.is_coordinator) return { ok: false, error: 'Pegawai ini bukan Koordinator.' };

  const clean = [...new Set(ids)].filter((id) => id !== cid); // buang duplikat & diri sendiri
  // Koordinator HANYA menaungi pegawai SEDIVISI (keputusan 2026-10-07) — lingkup raw SPV per divisi
  // bergantung pada ini. Tolak seluruh simpanan bila ada anggota beda divisi.
  if (clean.length) {
    const { data: members } = await supabase.from('employees').select('id, name, dept').in('id', clean);
    if ((members ?? []).length !== clean.length) return { ok: false, error: 'Sebagian pegawai tidak ditemukan.' };
    const outside = (members ?? []).filter((m) => m.dept !== coord.dept);
    if (outside.length) {
      return { ok: false, error: `Anggota tim koordinator harus sedivisi (${coord.dept}). Di luar divisi: ${outside.map((m) => m.name).join(', ')}.` };
    }
  }
  await supabase.from('coordinator_team_members').delete().eq('coordinator_id', cid);
  if (clean.length) {
    const { error } = await supabase.from('coordinator_team_members')
      .insert(clean.map((employee_id) => ({ coordinator_id: cid, employee_id })));
    if (error) return { ok: false, error: 'Gagal menyimpan tim: ' + error.message };
  }

  await logHrdAction({
    action: 'employee.set_coordinator_team', category: 'pegawai',
    summary: `Menetapkan ${clean.length} pegawai di bawah koordinasi ${coord.name ?? cid}`,
    targetType: 'employee', targetId: cid, targetLabel: coord.name ?? null, meta: { count: clean.length },
  });
  revalidate();
  return { ok: true, msg: `Tim koordinasi disimpan (${clean.length} pegawai).` };
}

/**
 * Atur AKSES HRD GRANULAR (Jalur A, migrasi 0023): batasi rekan HRD ke sebagian halaman admin.
 *   sections = null / []  → AKSES PENUH (semua bagian).
 *   sections = [..]        → hanya bagian tercantum (subset katalog HRD_SECTIONS).
 * Hanya berlaku untuk pemegang izin HRD Admin (sections tak berarti bagi non-admin).
 * Ditegakkan juga di Server Action admin & di DB untuk tulis (hrd_can, migrasi 0045); baca tetap is_hrd().
 * Hanya HRD yang boleh; tercatat di Log Aktivitas HRD.
 */
export async function setHrdSections(employeeId: string, sections: unknown): Promise<Result> {
  const parsed = z.object({
    employeeId: z.string().uuid(),
    // null = akses penuh; array = subset katalog (nilai di luar katalog ditolak).
    sections: z.array(z.enum(HRD_SECTIONS)).nullable(),
  }).safeParse({ employeeId, sections });
  if (!parsed.success) return { ok: false, error: 'Input tidak valid' };
  const { employeeId: id, sections: secs } = parsed.data;

  const supabase = await createClient();
  const auth = await requireHrd(supabase, 'full');
  if (!auth.ok) return auth;
  // Cegah kunci-diri: HRD tak boleh membatasi akun sendiri (bisa hilang akses Kelola Pegawai).
  if (auth.userId === id) return { ok: false, error: 'Tidak dapat mengubah akses Anda sendiri.' };

  const { data: target } = await supabase.from('employees').select('name, is_hrd_admin').eq('id', id).maybeSingle();
  if (!target?.is_hrd_admin) return { ok: false, error: 'Akses per-halaman hanya untuk pemegang izin HRD Admin.' };

  // null / kosong disimpan sebagai NULL (akses penuh) — konsisten dgn canSection.
  const value = secs && secs.length ? [...new Set(secs)] : null;
  const { error } = await supabase.from('employees').update({ hrd_sections: value }).eq('id', id);
  if (error) return { ok: false, error: 'Gagal menyimpan akses: ' + error.message };

  await logHrdAction({
    action: 'employee.set_hrd_sections', category: 'pegawai',
    summary: value
      ? `Membatasi akses HRD ${target.name ?? id} ke ${value.length} bagian`
      : `Memberi akses HRD penuh (semua bagian) untuk ${target.name ?? id}`,
    targetType: 'employee', targetId: id, targetLabel: target.name ?? null,
    meta: { sections: value },
  });
  revalidate();
  return { ok: true, msg: value ? `Akses dibatasi ke ${value.length} bagian.` : 'Akses penuh (semua bagian) diberikan.' };
}

const Role = z.enum(['employee', 'spv', 'hrd', 'direksi']);
// Kode pegawai bebas mengikuti skema perusahaan (mis. EMP010 atau FT2021-001).
// Mulai alfanumerik; boleh huruf/angka + pemisah - . _ / ; 2–24 karakter.
const EmpCode = z.string().trim().min(2, 'Kode pegawai minimal 2 karakter').max(24, 'Kode pegawai maksimal 24 karakter')
  .regex(/^[A-Za-z0-9][A-Za-z0-9._/-]*$/, 'Kode pegawai: huruf/angka, boleh pemisah - . _ / (mis. FT2021-001)');
const Email = z.string().trim().email('Email tidak valid');
const Password = z.string().min(6, 'Sandi minimal 6 karakter');
const OptId = z.string().uuid().nullish();
// Nama panggilan (opsional): dipangkas; kosong → null; maks 30 karakter (label ringkas).
const OptNickname = z.union([z.string().trim().max(30, 'Nama panggilan maksimal 30 karakter'), z.literal('')])
  .nullish().transform((v) => (v ? v : null));
// Tanggal 'YYYY-MM-DD' dari <input type="date">; string kosong / null → null (tak diisi).
const OptDate = z.union([z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, 'Tanggal tidak valid'), z.literal('')])
  .nullish().transform((v) => (v ? v : null));
/** Tanggal hari ini (YYYY-MM-DD) untuk stempel otomatis masuk/nonaktif. */
const todayStr = () => new Date().toISOString().slice(0, 10);

const CreateInput = z.object({
  name: z.string().trim().min(2, 'Nama minimal 2 karakter'),
  nickname: OptNickname, // nama panggilan (opsional) — label ringkas di tampilan padat
  empCode: EmpCode,
  dept: z.string().trim().min(1, 'Divisi wajib diisi'),
  role: Role,
  email: Email,
  password: Password,
  spvId: OptId, // atasan/SPV (opsional)
  isExternal: z.boolean().optional().default(false), // penilai eksternal (vendor/freelance)
  joinedOn: OptDate, // tgl masuk/aktif (opsional; default hari ini)
});

/** Tambah pegawai baru: buat akun auth → baris employees → (opsional) tautkan ke tim SPV. */
export async function createEmployee(raw: unknown): Promise<Result> {
  const parsed = CreateInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Input tidak valid' };
  const { name, nickname, empCode, dept, role, email, password, spvId, isExternal, joinedOn } = parsed.data;

  const supabase = await createClient();
  const auth = await requireHrd(supabase);
  if (!auth.ok) return { ok: false, error: auth.error };
  if (!auth.full && isPrivilegedRole(role)) return { ok: false, error: PRIVILEGED_MSG };

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
    .insert({ id: newId, emp_code: empCode.toUpperCase(), name, nickname, dept, role, is_external: isExternal, is_active: true, joined_on: joinedOn ?? todayStr() });
  if (eErr) {
    await admin.auth.admin.deleteUser(newId); // bersihkan akun yatim
    return { ok: false, error: eErr.code === '23505' ? 'Kode pegawai sudah dipakai' : 'Gagal menyimpan data: ' + eErr.message };
  }

  // 3) Tautkan ke tim SPV (opsional).
  if (spvId && spvId !== newId) {
    const { error: tErr } = await supabase.from('spv_team_members').insert({ spv_id: spvId, employee_id: newId });
    if (tErr) { revalidate(); return { ok: true, msg: 'Pegawai dibuat, tapi gagal menautkan atasan: ' + tErr.message }; }
  }

  await logHrdAction({
    action: 'employee.create', category: 'pegawai',
    summary: `Menambah pegawai ${name} (${empCode.toUpperCase()}, ${role}, ${dept})${isExternal ? ' — Eksternal' : ''}`,
    targetType: 'employee', targetId: newId, targetLabel: name, meta: { emp_code: empCode.toUpperCase(), role, dept, email, is_external: isExternal },
  });
  revalidate();
  return { ok: true, msg: `Pegawai ${name} berhasil ditambahkan.` };
}

// ── Impor pegawai massal dari Excel ────────────────────────────────────────
const BulkRow = z.object({
  name: z.string().trim().min(2, 'Nama minimal 2 karakter'),
  empCode: EmpCode,
  dept: z.string().trim().min(1, 'Divisi wajib diisi'),
  role: Role,
  email: Email,
  password: Password,
  spvCode: z.string().trim().optional().default(''), // kode pegawai atasan (opsional)
});

export type BulkResult =
  | { ok: true; created: number; skipped: number; failed: { code: string; reason: string }[] }
  | { ok: false; error: string };

/**
 * Tambah BANYAK pegawai sekaligus (HRD). Tiap baris: buat akun auth → employees →
 * (opsional) tautkan atasan via KODE pegawai (harus sudah ada / dibuat di baris sebelumnya).
 * Idempoten-aman: baris dengan kode/email yang sudah dipakai DILEWATI (bukan menimpa).
 * Diproses berurutan agar rollback per-baris bersih & kode atasan dari batch bisa dirujuk.
 */
export async function createEmployeesBulk(rawRows: unknown): Promise<BulkResult> {
  const parsed = z.array(BulkRow).min(1, 'Tidak ada baris').max(500, 'Maksimal 500 baris per impor').safeParse(rawRows);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Data impor tidak valid' };

  const supabase = await createClient();
  const auth = await requireHrd(supabase);
  if (!auth.ok) return { ok: false, error: auth.error };
  const admin = createAdminClient();

  // Peta kode→id pegawai yang sudah ada (untuk deteksi duplikat & resolusi atasan).
  const { data: existing } = await supabase.from('employees').select('id, emp_code');
  const codeToId = new Map<string, string>();
  (existing ?? []).forEach((e) => codeToId.set(e.emp_code.toUpperCase(), e.id));

  let created = 0, skipped = 0;
  const failed: { code: string; reason: string }[] = [];
  const seenCode = new Set<string>();
  const seenEmail = new Set<string>();

  for (const r of parsed.data) {
    const code = r.empCode.toUpperCase();
    const email = r.email.toLowerCase();

    // Lewati duplikat (dalam batch maupun yang sudah ada di DB).
    if (seenCode.has(code) || codeToId.has(code)) { skipped++; continue; }
    if (seenEmail.has(email)) { skipped++; continue; }
    seenCode.add(code); seenEmail.add(email);
    if (!auth.full && isPrivilegedRole(r.role)) { failed.push({ code, reason: PRIVILEGED_MSG }); continue; }

    // 1) Akun auth.
    const { data: cu, error: cErr } = await admin.auth.admin.createUser({
      email: r.email, password: r.password, email_confirm: true,
      user_metadata: { name: r.name, emp_code: code },
    });
    if (cErr || !cu?.user) {
      if (/already|registered|exists/i.test(cErr?.message ?? '')) { skipped++; }
      else failed.push({ code, reason: 'akun gagal: ' + (cErr?.message ?? 'tidak diketahui') });
      continue;
    }
    const newId = cu.user.id;

    // 2) Baris employees (rollback akun bila gagal).
    const { error: eErr } = await supabase.from('employees')
      .insert({ id: newId, emp_code: code, name: r.name, dept: r.dept, role: r.role, is_active: true, joined_on: todayStr() });
    if (eErr) {
      await admin.auth.admin.deleteUser(newId);
      if (eErr.code === '23505') { skipped++; } else failed.push({ code, reason: 'data gagal: ' + eErr.message });
      continue;
    }
    codeToId.set(code, newId); // bisa jadi atasan untuk baris berikutnya

    // 3) Tautkan atasan via kode (opsional; abaikan bila kode tak dikenal).
    const spvId = r.spvCode ? codeToId.get(r.spvCode.toUpperCase()) : undefined;
    if (spvId && spvId !== newId) {
      await supabase.from('spv_team_members').insert({ spv_id: spvId, employee_id: newId });
    }
    created++;
  }

  await logHrdAction({
    action: 'employee.import', category: 'pegawai',
    summary: `Impor massal pegawai: ${created} dibuat, ${skipped} dilewati${failed.length ? `, ${failed.length} gagal` : ''}`,
    meta: { created, skipped, failed: failed.length },
  });
  revalidate();
  return { ok: true, created, skipped, failed };
}

const UpdateInput = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(2, 'Nama minimal 2 karakter'),
  nickname: OptNickname,
  empCode: EmpCode,
  dept: z.string().trim().min(1, 'Divisi wajib diisi'),
  role: Role,
  email: Email,
  spvId: OptId,
  isExternal: z.boolean().optional().default(false),
  joinedOn: OptDate, // tgl masuk/aktif — koreksi manual
  leftOn: OptDate,   // tgl nonaktif — koreksi manual (kosong = masih aktif / tak dicatat)
});

/** Ubah data pegawai: name/dept/role/emp_code + email (akun) + atasan + tgl masuk/nonaktif. */
export async function updateEmployee(raw: unknown): Promise<Result> {
  const parsed = UpdateInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Input tidak valid' };
  const { id, name, nickname, empCode, dept, role, email, spvId, isExternal, joinedOn, leftOn } = parsed.data;

  const supabase = await createClient();
  const auth = await requireHrd(supabase);
  if (!auth.ok) return { ok: false, error: auth.error };
  if (!auth.full && (isPrivilegedRole(role) || await isPrivileged(supabase, id))) return { ok: false, error: PRIVILEGED_MSG };
  const admin = createAdminClient();

  const { error: eErr } = await supabase.from('employees')
    .update({ name, nickname, emp_code: empCode.toUpperCase(), dept, role, is_external: isExternal, joined_on: joinedOn, left_on: leftOn }).eq('id', id);
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

  await logHrdAction({
    action: 'employee.update', category: 'pegawai',
    summary: `Mengubah data pegawai ${name} (${empCode.toUpperCase()}, ${role}, ${dept})${isExternal ? ' — Eksternal' : ''}`,
    targetType: 'employee', targetId: id, targetLabel: name, meta: { emp_code: empCode.toUpperCase(), role, dept, email, is_external: isExternal },
  });
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
  if (!auth.full && await isPrivileged(supabase, id)) return { ok: false, error: PRIVILEGED_MSG };

  // Stempel tanggal otomatis (dapat dikoreksi via "Ubah"): nonaktif → left_on = hari ini;
  // aktif kembali → left_on dikosongkan (joined_on = tgl masuk dipertahankan sbg histori).
  const today = todayStr();
  const datePatch = active ? { left_on: null } : { left_on: today };
  const { error } = await supabase.from('employees').update({ is_active: active, ...datePatch }).eq('id', id);
  if (error) return { ok: false, error: 'Gagal: ' + error.message };

  // Pemetaan ikut dinonaktifkan/diaktifkan → orang keluar/masuk siklus penilaian (tak lagi
  // dihitung di Progress 360 & tak jadi tugas penilai lain) TANPA menghapus data (reversibel).
  if (!active) {
    // Nonaktif: matikan SEMUA pemetaan orang ini (sebagai penilai maupun yang dinilai).
    const { error: mErr } = await supabase.from('mappings')
      .update({ is_active: false }).or(`assessor_id.eq.${id},target_id.eq.${id}`);
    if (mErr) return { ok: false, error: 'Status diubah, tapi gagal memperbarui pemetaan: ' + mErr.message };
  } else {
    // Reaktivasi: HANYA hidupkan pemetaan yang sisi LAWANNYA juga aktif → cegah pemetaan
    // menunjuk ke pegawai yang masih nonaktif (kasus deaktivasi-ganda lalu reaktivasi sebagian).
    const { data: myMaps } = await supabase.from('mappings')
      .select('id, assessor_id, target_id').or(`assessor_id.eq.${id},target_id.eq.${id}`);
    const otherIds = [...new Set((myMaps ?? []).map((m) => (m.assessor_id === id ? m.target_id : m.assessor_id)))];
    const activeOthers = new Set<string>();
    if (otherIds.length) {
      const { data: act } = await supabase.from('employees').select('id').in('id', otherIds).eq('is_active', true);
      (act ?? []).forEach((e) => activeOthers.add(e.id));
    }
    const toEnable = (myMaps ?? [])
      .filter((m) => activeOthers.has(m.assessor_id === id ? m.target_id : m.assessor_id))
      .map((m) => m.id);
    if (toEnable.length) {
      const { error: mErr } = await supabase.from('mappings').update({ is_active: true }).in('id', toEnable);
      if (mErr) return { ok: false, error: 'Status diubah, tapi gagal memperbarui pemetaan: ' + mErr.message };
    }
  }

  const admin = createAdminClient();
  const { error: bErr } = await admin.auth.admin.updateUserById(id, { ban_duration: active ? 'none' : BAN_FOREVER });
  if (bErr) return { ok: false, error: 'Status diubah, tapi gagal mengunci akun: ' + bErr.message };

  const { data: emp } = await supabase.from('employees').select('name').eq('id', id).maybeSingle();
  await logHrdAction({
    action: active ? 'employee.activate' : 'employee.deactivate', category: 'pegawai',
    summary: `${active ? 'Mengaktifkan' : `Menonaktifkan (mengunci akun) per ${today}`} pegawai ${emp?.name ?? id} + ${active ? 'mengaktifkan' : 'menonaktifkan'} pemetaannya`,
    targetType: 'employee', targetId: id, targetLabel: emp?.name ?? null, meta: { effective_date: today, active },
  });
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
  // Reset sandi SENGAJA boleh untuk HRD (bantu pegawai yang lupa sandi) — tapi akun HRD/Direksi
  // hanya oleh HRD berakses penuh (cegah pengambilalihan akun ber-hak lebih tinggi).
  if (!auth.full && await isPrivileged(supabase, id)) return { ok: false, error: PRIVILEGED_MSG };

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.updateUserById(id, { password: newPassword });
  if (error) return { ok: false, error: 'Gagal: ' + error.message };

  const { data: emp } = await supabase.from('employees').select('name').eq('id', id).maybeSingle();
  await logHrdAction({
    action: 'employee.reset_password', category: 'pegawai',
    summary: `Mereset sandi pegawai ${emp?.name ?? id}`, // sandi TIDAK dicatat
    targetType: 'employee', targetId: id, targetLabel: emp?.name ?? null,
  });
  return { ok: true, msg: 'Sandi berhasil direset.' };
}
