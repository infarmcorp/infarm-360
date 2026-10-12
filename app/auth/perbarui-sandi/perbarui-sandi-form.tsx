'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { PasswordInput } from '@/components/password-input';

/** Form sandi baru + konfirmasi. Sandi min. 8 karakter. Setelah sukses → ke beranda. */
export function PerbaruiSandiForm() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) { setError('Sandi minimal 8 karakter.'); return; }
    if (password !== confirm) { setError('Konfirmasi sandi tidak cocok.'); return; }
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setLoading(false);
      setError(/different from the old/i.test(error.message)
        ? 'Sandi baru harus berbeda dari sandi lama.'
        : 'Gagal menyimpan sandi. Minta tautan reset baru lalu coba lagi.');
      return;
    }
    setDone(true);
    setTimeout(() => { router.push('/'); router.refresh(); }, 1500);
  }

  if (done) {
    return (
      <div className="rounded-control bg-brand-tint p-4 text-sm text-brand-ink">
        Sandi berhasil diperbarui. Mengalihkan…
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <label className="block text-xs font-semibold text-ink-soft mb-1">Sandi Baru</label>
        <PasswordInput autoComplete="new-password" value={password} onChange={setPassword} placeholder="Minimal 8 karakter" />
      </div>
      <div>
        <label className="block text-xs font-semibold text-ink-soft mb-1">Ulangi Sandi Baru</label>
        <PasswordInput autoComplete="new-password" value={confirm} onChange={setConfirm} />
      </div>
      {error && <p className="text-xs text-danger-ink font-semibold">{error}</p>}
      <button
        type="submit"
        disabled={loading}
        className="w-full bg-brand hover:bg-brand-ink disabled:opacity-60 text-white text-sm font-bold py-2 rounded-control transition-colors"
      >
        {loading ? 'Menyimpan…' : 'Simpan Sandi Baru'}
      </button>
    </form>
  );
}
