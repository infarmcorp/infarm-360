'use client';

import { useState } from 'react';
import { KeyRound, Check } from 'lucide-react';
import { changeOwnPassword } from './actions';

/** Form ganti sandi: sandi saat ini + sandi baru + konfirmasi. Min. 8 karakter. */
export function AkunForm() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (next.length < 8) { setMsg({ ok: false, text: 'Sandi baru minimal 8 karakter.' }); return; }
    if (next !== confirm) { setMsg({ ok: false, text: 'Konfirmasi sandi tidak cocok.' }); return; }
    setBusy(true);
    const res = await changeOwnPassword({ current, next });
    setBusy(false);
    if (!res.ok) { setMsg({ ok: false, text: res.error }); return; }
    setMsg({ ok: true, text: 'Sandi berhasil diperbarui.' });
    setCurrent(''); setNext(''); setConfirm('');
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <Field label="Sandi Saat Ini" value={current} onChange={setCurrent} autoComplete="current-password" />
      <Field label="Sandi Baru" value={next} onChange={setNext} autoComplete="new-password" placeholder="Minimal 8 karakter" />
      <Field label="Ulangi Sandi Baru" value={confirm} onChange={setConfirm} autoComplete="new-password" />
      {msg && (
        <p className={`text-xs font-semibold ${msg.ok ? 'text-emerald-700' : 'text-rose-600'}`}>{msg.text}</p>
      )}
      <button type="submit" disabled={busy}
        className="inline-flex items-center gap-1.5 bg-emerald-700 hover:bg-emerald-800 disabled:opacity-60 text-white text-sm font-bold px-4 py-2 rounded-lg transition-colors">
        {msg?.ok ? <Check className="w-4 h-4" /> : <KeyRound className="w-4 h-4" />}
        {busy ? 'Menyimpan…' : 'Simpan Sandi Baru'}
      </button>
      <p className="text-[10px] text-gray-500 italic">
        Demi keamanan, masukkan sandi saat ini untuk mengonfirmasi. Sandi tidak pernah dicatat.
      </p>
    </form>
  );
}

function Field({
  label, value, onChange, autoComplete, placeholder,
}: {
  label: string; value: string; onChange: (v: string) => void; autoComplete: string; placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-600 mb-1">{label}</label>
      <input
        type="password"
        required
        autoComplete={autoComplete}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full text-sm px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
      />
    </div>
  );
}
