'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

/**
 * Kirim email reset sandi. redirectTo → /auth/callback (tukar code jadi sesi) lalu
 * ke /auth/perbarui-sandi (buat sandi baru). Pesan sukses sengaja netral (tak
 * membocorkan apakah email terdaftar).
 */
export function LupaSandiForm() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email) return;
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const redirectTo = `${window.location.origin}/auth/callback?next=/auth/perbarui-sandi`;
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
    setLoading(false);
    if (error) { setError('Gagal mengirim email. Coba lagi nanti.'); return; }
    setSent(true);
  }

  if (sent) {
    return (
      <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-4 text-sm text-emerald-800">
        Jika email <strong>{email}</strong> terdaftar, tautan untuk membuat sandi baru telah dikirim.
        Periksa kotak masuk (dan folder spam).
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
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
      {error && <p className="text-xs text-rose-600 font-semibold">{error}</p>}
      <button
        type="submit"
        disabled={loading}
        className="w-full bg-emerald-700 hover:bg-emerald-800 disabled:opacity-60 text-white text-sm font-bold py-2 rounded-lg transition-colors"
      >
        {loading ? 'Mengirim…' : 'Kirim Tautan Reset'}
      </button>
    </form>
  );
}
