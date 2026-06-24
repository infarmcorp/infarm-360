'use client';

import { useTransition } from 'react';
import { Trash2 } from 'lucide-react';
import { removeAdhocTarget } from './adhoc-actions';

/** Tombol hapus target Ad-Hoc (hanya untuk baris ber-`is_adhoc` milik penilai).
 * Nonaktif bila penilaian sudah TERKIRIM (tak boleh dihapus — jaga integritas data). */
export function AdhocDeleteButton({ targetId, targetName, submitted = false }: { targetId: string; targetName: string; submitted?: boolean }) {
  const [pending, start] = useTransition();

  function onClick() {
    if (!window.confirm(`Hapus penilaian ad-hoc untuk ${targetName}? Draf yang belum dikirim ikut terhapus.`)) return;
    start(async () => {
      const res = await removeAdhocTarget(targetId);
      if (!res.ok) window.alert(res.error);
      // sukses → revalidatePath di server menyegarkan daftar.
    });
  }

  if (submitted) {
    return (
      <span
        title="Sudah dikirim — tidak bisa dihapus"
        className="inline-flex items-center gap-1 text-xs font-bold text-gray-300 cursor-not-allowed"
      >
        <Trash2 className="w-3.5 h-3.5" /> Hapus
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      title="Hapus penilaian ad-hoc ini"
      className="inline-flex items-center gap-1 text-xs font-bold text-rose-600 hover:text-rose-700 hover:underline disabled:opacity-50"
    >
      <Trash2 className="w-3.5 h-3.5" /> {pending ? 'Menghapus…' : 'Hapus'}
    </button>
  );
}
