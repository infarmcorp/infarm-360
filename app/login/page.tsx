import { redirect } from 'next/navigation';
import { safeNext } from '@/lib/safe-next';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { DEMO_USERS } from '@/lib/auth/demo-users';
import { BrandLogo } from '@/components/brand-logo';
import { LoginForm } from './login-form';

type RosterUser = { email: string; name: string; role: string; dept: string };

/**
 * Roster login dari DB (employees aktif + email dari auth via service_role), agar
 * pegawai yang ditambah lewat "Kelola Pegawai" otomatis muncul. Fallback ke DEMO_USERS
 * bila service key tak tersedia (mis. dev tanpa env).
 */
async function loadRoster(): Promise<RosterUser[]> {
  try {
    const admin = createAdminClient();
    const { data: emps, error } = await admin
      .from('employees').select('id, name, role, dept').eq('is_active', true);
    if (error || !emps?.length) throw error ?? new Error('kosong');

    const emailById = new Map<string, string>();
    let page = 1;
    for (;;) {
      const { data, error: lErr } = await admin.auth.admin.listUsers({ page, perPage: 200 });
      if (lErr) break;
      data.users.forEach((u) => { if (u.email) emailById.set(u.id, u.email); });
      if (data.users.length < 200) break;
      page++;
    }
    const roster = emps
      .map((e) => ({ email: emailById.get(e.id) ?? '', name: e.name, role: e.role, dept: e.dept }))
      .filter((u) => u.email);
    if (roster.length) return roster;
  } catch { /* fallback di bawah */ }
  return DEMO_USERS.map((u) => ({ email: u.email, name: u.name, role: u.role, dept: u.dept }));
}

/**
 * Login Supabase (email + sandi). Pengganti login demo SPA (1-sandi + localStorage).
 * Kalau sudah ada sesi, langsung ke tujuan.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const sp = await searchParams;
  const next = safeNext(sp.next);

  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (data.user) redirect(next);

  // Roster (tanpa password) untuk dropdown login ala legacy.
  const users = await loadRoster();

  return (
    // TANPA SCROLL DI HP: tinggi dikunci ke `100dvh` (dvh = tinggi viewport nyata setelah bilah
    // alamat browser HP, tak seperti `100vh` yang bikin halaman "kepanjangan" lalu bisa digulir),
    // dan `overflow-hidden` mematikan gulir halaman. Kartu sendiri diberi `overflow-y-auto`
    // sebagai jaring pengaman: di layar sangat pendek isinya tetap bisa dijangkau tanpa membuat
    // SELURUH halaman ikut bergoyang. Logo/jarak dipadatkan di HP agar muat utuh.
    <main className="h-[100dvh] overflow-hidden flex items-center justify-center bg-bg p-4 sm:p-6">
      <div className="w-full max-w-sm max-h-full overflow-y-auto bg-surface border border-line rounded-panel p-5 sm:p-6">
        <div className="flex flex-col items-center text-center mb-4 sm:mb-5">
          <BrandLogo className="w-12 h-12 sm:w-16 sm:h-16 mb-2 sm:mb-3" />
          <h1 className="text-[15px] sm:text-lg font-bold text-ink">Infarm Performance Appraisal</h1>
        </div>
        <LoginForm next={next} users={users} />
      </div>
    </main>
  );
}
