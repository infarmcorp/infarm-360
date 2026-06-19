'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { SearchableSelect } from '@/components/searchable-select';

// Fitur "Lupa Sandi" (Opsi 2) dormant sampai email aktif — tampil hanya bila flag 'true'.
const PW_RESET_ON = process.env.NEXT_PUBLIC_ENABLE_PW_RESET === 'true';

type RosterUser = { email: string; name: string; role: string; dept: string };

const ROLE_LABEL: Record<string, string> = {
  employee: 'Pegawai', spv: 'Supervisor (SPV)', hrd: 'HRD Admin', direksi: 'Direktur',
};
const ROLE_ORDER = ['employee', 'spv', 'hrd', 'direksi'];

export function LoginForm({ next, users }: { next: string; users: RosterUser[] }) {
  const router = useRouter();
  const [role, setRole] = useState('');
  const [email, setEmail] = useState(''); // email user terpilih (atau input manual)
  const [manual, setManual] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const roles = useMemo(
    () => ROLE_ORDER.filter((r) => users.some((u) => u.role === r)),
    [users],
  );
  const namesForRole = useMemo(
    () => users.filter((u) => u.role === role).sort((a, b) => a.name.localeCompare(b.name)),
    [users, role],
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email) {
      setError(manual ? 'Masukkan email.' : 'Pilih peran dan nama Anda dahulu.');
      return;
    }
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setLoading(false);
      setError('Sandi salah atau akun tidak ditemukan.');
      return;
    }
    // Reset mode tampilan: tiap login mulai dari Mode posisi-asli (base) — cegah cookie
    // 'hrd_mode' sesi/pengguna sebelumnya membawa langsung ke Mode Admin di browser bersama.
    document.cookie = 'hrd_mode=; path=/; max-age=0; samesite=lax';
    router.push(next);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {!manual ? (
        <>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Peran</label>
            <select
              value={role}
              onChange={(e) => { setRole(e.target.value); setEmail(''); }}
              className="w-full text-sm px-3 py-2 border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600"
            >
              <option value="">— Pilih Peran —</option>
              {roles.map((r) => <option key={r} value={r}>{ROLE_LABEL[r] ?? r}</option>)}
            </select>
          </div>
          {role && (
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Nama Pegawai</label>
              <SearchableSelect
                value={email}
                onChange={setEmail}
                placeholder="— Pilih Nama —"
                options={namesForRole.map((u) => ({ value: u.email, label: `${u.name} · ${u.dept}` }))}
                className="text-sm px-3 py-2 border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600"
              />
            </div>
          )}
        </>
      ) : (
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">Email</label>
          <input
            type="email"
            required
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="nama@infarm.test"
            className="w-full text-sm px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
          />
        </div>
      )}

      <div>
        <label className="block text-xs font-semibold text-gray-600 mb-1">Sandi</label>
        <input
          type="password"
          required
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full text-sm px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
        />
      </div>

      {error && <p className="text-xs text-rose-600 font-semibold">{error}</p>}

      <button
        type="submit"
        disabled={loading}
        className="w-full bg-emerald-700 hover:bg-emerald-800 disabled:opacity-60 text-white text-sm font-bold py-2 rounded-lg transition-colors"
      >
        {loading ? 'Memproses…' : 'Masuk'}
      </button>

      <button
        type="button"
        onClick={() => { setManual((v) => !v); setEmail(''); setRole(''); setError(null); }}
        className="w-full text-[11px] text-gray-500 hover:text-gray-600 hover:underline"
      >
        {manual ? '← Pilih dari daftar' : 'Masuk dengan email manual'}
      </button>

      {PW_RESET_ON ? (
        <Link href="/auth/lupa-sandi" className="block text-center text-[11px] text-emerald-700 hover:text-emerald-800 hover:underline">
          Lupa sandi?
        </Link>
      ) : (
        <p className="text-center text-[11px] text-gray-500">
          Lupa sandi? <span className="text-gray-500 font-semibold">Hubungi HRD untuk reset.</span>
        </p>
      )}
    </form>
  );
}
