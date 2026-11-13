'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { FIELD_LABEL } from '@/components/infarm-ui';
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
        : 'Gagal menyimpan sandi. Minta tautan baru, lalu coba lagi.');
      return;
    }
    setDone(true);
    setTimeout(() => { router.push('/'); router.refresh(); }, 1500);
  }

  if (done) {
    return (
      <div className="flex items-start gap-2 rounded-xl bg-brand-tint p-4 text-[13px] leading-relaxed text-brand-ink">
        <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" aria-hidden />
        <div>Sandi berhasil diperbarui. Mengalihkan…</div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <label className={FIELD_LABEL}>Sandi Baru</label>
        <PasswordInput autoComplete="new-password" value={password} onChange={setPassword} placeholder="Minimal 8 karakter" />
      </div>
      <div>
        <label className={FIELD_LABEL}>Ulangi Sandi Baru</label>
        <PasswordInput autoComplete="new-password" value={confirm} onChange={setConfirm} />
      </div>
      {error && <p className="flex items-start gap-1.5 rounded-control bg-danger-tint px-3 py-2 text-xs text-danger-ink font-semibold"><AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" aria-hidden />{error}</p>}
      <button
        type="submit"
        disabled={loading}
        className="w-full min-h-9 bg-brand hover:bg-brand-ink disabled:opacity-60 text-white text-[13px] font-bold rounded-xl transition-colors"
      >
        {loading ? 'Menyimpan…' : 'Simpan Sandi Baru'}
      </button>
    </form>
  );
}
