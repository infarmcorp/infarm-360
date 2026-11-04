'use client';

import { useState } from 'react';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { FIELD, FIELD_LABEL } from '@/components/infarm-ui';

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
      <div className="flex items-start gap-2 rounded-xl bg-brand-tint p-4 text-[13px] leading-relaxed text-brand-ink">
        <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" aria-hidden />
        <div>
          Jika email <strong>{email}</strong> terdaftar, tautan untuk membuat sandi baru telah dikirim.
          Periksa kotak masuk (dan folder spam).
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <label className={FIELD_LABEL}>Email</label>
        <input
          type="email"
          required
          autoComplete="username"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="nama@infarm.test"
          className={`w-full ${FIELD}`}
        />
      </div>
      {error && <p className="flex items-start gap-1.5 rounded-control bg-danger-tint px-3 py-2 text-xs text-danger-ink font-semibold"><AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" aria-hidden />{error}</p>}
      <button
        type="submit"
        disabled={loading}
        className="w-full min-h-9 bg-brand hover:bg-brand-ink disabled:opacity-60 text-white text-[13px] font-bold rounded-xl transition-colors"
      >
        {loading ? 'Mengirim…' : 'Kirim Tautan Reset'}
      </button>
    </form>
  );
}
