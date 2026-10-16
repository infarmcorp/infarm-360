'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { SearchableSelect } from '@/components/searchable-select';
import { PasswordInput } from '@/components/password-input';
import { LOGIN_FAILED } from '@/lib/auth/login-messages';
import type { LoginOption } from '@/lib/auth/login-roster';
import { signInWithLoginId } from './actions';

// Fitur "Lupa Sandi" (Opsi 2) dormant sampai email aktif — tampil hanya bila flag 'true'.
const PW_RESET_ON = process.env.NEXT_PUBLIC_ENABLE_PW_RESET === 'true';

const ROLE_LABEL: Record<string, string> = {
  employee: 'Pegawai', spv: 'Supervisor (SPV)', hrd: 'HRD Admin', direksi: 'Direktur',
};
const ROLE_ORDER = ['employee', 'spv', 'hrd', 'direksi'];

export function LoginForm({ next, users }: { next: string; users: LoginOption[] }) {
  const router = useRouter();
  const [role, setRole] = useState('');
  const [loginId, setLoginId] = useState(''); // id pegawai terpilih dari daftar (email dicari server)
  const [email, setEmail] = useState(''); // input email manual
  const [manual, setManual] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const roles = useMemo(
    () => ROLE_ORDER.filter((r) => users.some((u) => u.role === r)),
    [users],
  );
  // Opsi nama (urut), tersaring oleh Peran (opsional). Label menyertakan PERAN agar
  // tersampaikan sejak login. Pencarian teks ditangani DI DALAM SearchableSelect.
  const nameOptions = useMemo(
    () =>
      (role ? users.filter((u) => u.role === role) : [...users])
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((u) => ({ value: u.id, label:`${u.name} · ${u.dept} — ${ROLE_LABEL[u.role] ?? u.role}` })),
    [users, role],
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (manual ? !email : !loginId) {
      setError(manual ? 'Masukkan email.' : 'Pilih peran dan nama Anda dahulu.');
      return;
    }
    setLoading(true);
    setError(null);
    // Dari daftar: id + sandi ke server (email tak pernah dikirim ke browser). Manual: seperti biasa.
    let failed: boolean;
    if (manual) {
      const { error } = await createClient().auth.signInWithPassword({ email, password });
      failed = !!error;
    } else {
      try {
        failed = !(await signInWithLoginId(loginId, password)).ok;
      } catch {
        failed = true;
      }
    }
    if (failed) {
      setLoading(false);
      setError(LOGIN_FAILED);
      return;
    }
    // Reset mode tampilan: tiap login mulai dari Mode posisi-asli (base) — cegah cookie
    // 'hrd_mode' sesi/pengguna sebelumnya membawa langsung ke Mode Admin di browser bersama.
    document.cookie = 'hrd_mode=; path=/; max-age=0; samesite=lax';
    // Karena mode direset ke base, JANGAN ikuti `next` yang menuju rute admin (mis. middleware
    // menyimpan /admin/dashboard saat sesi habis) — itu membuat halaman = Admin tapi toggle = SPV.
    // Lewatkan ke '/' agar gerbang memilih landing sesuai posisi-asli (base). Rute non-admin tetap.
    const target = next.startsWith('/admin') ? '/' : next;
    router.push(target);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {!manual ? (
        <>
          {/* Peran = penyaring opsional. <select> native → andal di semua HP. */}
          <div>
            <label className="block text-xs font-semibold text-ink-soft mb-1">Peran (opsional)</label>
            <select
              value={role}
              onChange={(e) => { setRole(e.target.value); setLoginId(''); }}
              className="w-full text-sm px-3 py-2 border border-line rounded-control bg-surface text-ink focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand-tint"
            >
              <option value="">— Semua Peran —</option>
              {roles.map((r) => <option key={r} value={r}>{ROLE_LABEL[r] ?? r}</option>)}
            </select>
          </div>
          {/* Nama SELALU tampil (tak digerbang state `role`) → akar bug "field tak muncul"
              hilang. Combobox dgn PENCARIAN DI DALAM dropdown; tiap opsi menyertakan PERAN.
              Bila combobox bermasalah di perangkat tertentu, tersedia "email manual" di bawah. */}
          <div>
            <label className="block text-xs font-semibold text-ink-soft mb-1">Nama Pegawai</label>
            <SearchableSelect
              value={loginId}
              onChange={(val) => {
                setLoginId(val);
                // Auto-isi Peran dari nama terpilih → konfirmasi peran sebelum sandi.
                const u = users.find((x) => x.id === val);
                if (u) setRole(u.role);
              }}
              options={nameOptions}
              placeholder="— Pilih / Cari Nama —"
              searchPlaceholder="Cari nama / divisi…"
              className="text-sm px-3 py-2 border border-line rounded-control bg-surface text-ink focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand-tint"
            />
          </div>
        </>
      ) : (
        <div>
          <label className="block text-xs font-semibold text-ink-soft mb-1">Email</label>
          <input
            type="email"
            required
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="nama@infarm.test"
            className="w-full text-sm px-3 py-2 border border-line rounded-control bg-surface text-ink focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand-tint"
          />
        </div>
      )}

      <div>
        <label className="block text-xs font-semibold text-ink-soft mb-1">Sandi</label>
        <PasswordInput autoComplete="current-password" value={password} onChange={setPassword} />
      </div>

      {error && <p className="text-xs text-danger-ink font-semibold">{error}</p>}

      <button
        type="submit"
        disabled={loading}
        className="w-full bg-brand hover:bg-brand-ink disabled:opacity-60 text-white text-sm font-bold py-2 rounded-control transition-colors"
      >
        {loading ? 'Memproses…' : 'Masuk'}
      </button>

      <button
        type="button"
        onClick={() => { setManual((v) => !v); setEmail(''); setLoginId(''); setRole(''); setError(null); }}
        className="w-full text-[11px] text-ink-faint hover:text-ink-soft hover:underline"
      >
        {manual ? '← Pilih dari daftar' : 'Masuk dengan email manual'}
      </button>

      {PW_RESET_ON ? (
        <Link href="/auth/lupa-sandi" className="block text-center text-[11px] text-brand-ink hover:underline">
          Lupa sandi?
        </Link>
      ) : (
        <p className="text-center text-[11px] text-ink-faint">
          Lupa sandi? <span className="font-semibold text-ink-soft">Hubungi HRD untuk reset.</span>
        </p>
      )}
    </form>
  );
}
