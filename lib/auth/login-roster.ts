import { createAdminClient } from '@/lib/supabase/server';
import { DEMO_USERS } from '@/lib/auth/demo-users';

/**
 * Satu opsi dropdown "Pilih dari daftar" di halaman login. SENGAJA tanpa email: halaman login
 * publik (tanpa sesi), jadi apa pun di sini terbaca siapa saja. Peran & divisi memang tampil di
 * label opsi; email tidak pernah tampil → tak dikirim. Email dicari di server dari `id` saat login.
 */
export type LoginOption = { id: string; name: string; role: string; dept: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Roster demo (dev tanpa service key): id = emp_code, tetap tanpa email. */
function demoRoster(): LoginOption[] {
  return DEMO_USERS.map((u) => ({ id: u.emp_code, name: u.name, role: u.role, dept: u.dept }));
}

/**
 * Roster login dari DB (employees aktif yang punya akun auth ber-email), agar pegawai yang ditambah
 * lewat "Kelola Pegawai" otomatis muncul. Fallback ke DEMO_USERS bila service key tak tersedia.
 */
export async function loadLoginRoster(): Promise<LoginOption[]> {
  try {
    const admin = createAdminClient();
    const { data: emps, error } = await admin
      .from('employees').select('id, name, role, dept').eq('is_active', true);
    if (error || !emps?.length) throw error ?? new Error('kosong');

    // Hanya pegawai yang punya akun auth ber-email (sama seperti sebelumnya) — email TIDAK disimpan.
    const hasEmail = new Set<string>();
    let page = 1;
    for (;;) {
      const { data, error: lErr } = await admin.auth.admin.listUsers({ page, perPage: 200 });
      if (lErr) break;
      data.users.forEach((u) => { if (u.email) hasEmail.add(u.id); });
      if (data.users.length < 200) break;
      page++;
    }
    const roster = emps
      .filter((e) => hasEmail.has(e.id))
      .map((e) => ({ id: e.id, name: e.name, role: e.role, dept: e.dept }));
    if (roster.length) return roster;
  } catch { /* fallback di bawah */ }
  return demoRoster();
}

/**
 * Email login untuk `id` dari dropdown — hanya pegawai AKTIF (nonaktif → null, akunnya juga di-ban
 * di Auth). id non-UUID = roster demo (emp_code). null = tak dikenal; pemanggil wajib membalas
 * pesan gagal yang sama dengan sandi salah.
 */
export async function emailForLoginId(id: string): Promise<string | null> {
  if (!UUID_RE.test(id)) return DEMO_USERS.find((u) => u.emp_code === id)?.email ?? null;
  try {
    const admin = createAdminClient();
    const { data: emp } = await admin.from('employees').select('id').eq('id', id).eq('is_active', true).maybeSingle();
    if (!emp) return null;
    const { data, error } = await admin.auth.admin.getUserById(id);
    if (error) return null;
    return data.user?.email ?? null;
  } catch {
    return null;
  }
}
