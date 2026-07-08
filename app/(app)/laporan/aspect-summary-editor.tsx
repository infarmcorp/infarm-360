'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Sparkles, Lock } from 'lucide-react';
import { saveAspectSummaries } from '@/app/(app)/admin/laporan/actions';

/**
 * Section 4 — EVALUASI ASPEK BUDAYA & PERILAKU 360° (HRD).
 * HRD meringkas/mengkalibrasi hasil 360° per aspek (naratif), tersimpan di
 * final_reports.content.aspectSummaries. Anonim — tak menyebut nama penilai.
 *
 * AUTO-SIMPAN (debounce 5s + saat blur) — tak ada tombol "Simpan" manual, kerja
 * tak hilang (pola sama dengan form penilaian). TERKUNCI bila laporan sudah
 * `finalized`: harus "Kembalikan ke Draf" dulu untuk mengedit (cegah ubah diam-diam
 * isi yang sudah dilihat pegawai).
 */
type SaveState = 'idle' | 'pending' | 'saving' | 'saved' | 'error';
type SaveResult = { ok: true } | { ok: false; error: string };
type SaveFn = (employeeId: string, vals: Record<string, string>) => Promise<SaveResult>;

export function AspectSummaryEditor({
  employeeId, aspects, initial, locked = false, saveAction = saveAspectSummaries,
  title = 'Evaluasi Aspek Budaya & Perilaku 360°',
  intro = 'Rangkuman evaluasi 360° pelaku budaya perusahaan dari seluruh komentar penilai. Pihak manajemen (HRD) melakukan kalibrasi atas aspek ini secara adil & transparan — tanpa menyebut identitas penilai.',
  noun = 'aspek',
}: {
  employeeId: string; aspects: string[]; initial: Record<string, string>; locked?: boolean;
  // Jalur HRD memakai saveAspectSummaries (default); jalur Peninjau Lintas Divisi
  // memasukkan saveCrossAspectSummaries (service_role + cek divisi). Signature sama.
  saveAction?: SaveFn;
  // Label dapat di-override agar editor yang sama dipakai untuk Ringkasan Aspek (default)
  // maupun Ringkasan Pertanyaan Kualitatif. `aspects` = daftar kunci (nama aspek / teks pertanyaan).
  title?: string;
  intro?: string;
  noun?: string;
}) {
  const [vals, setVals] = useState<Record<string, string>>(() => {
    const o: Record<string, string> = {};
    aspects.forEach((a) => { o[a] = initial[a] ?? ''; });
    return o;
  });
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const router = useRouter();
  const hydratedRef = useRef(false); // lewati render awal (mount)
  const savingRef = useRef(false);

  const changed = aspects.some((a) => (vals[a] ?? '') !== (initial[a] ?? ''));

  async function flush() {
    if (locked || savingRef.current) return;
    savingRef.current = true; setSaveState('saving');
    const res = await saveAction(employeeId, vals);
    savingRef.current = false;
    setSaveState(res.ok ? 'saved' : 'error');
    if (res.ok) router.refresh(); // sinkronkan tampilan dgn isi DB
  }

  // AUTO-SIMPAN: debounce 5s setelah perubahan terakhir.
  useEffect(() => {
    if (!hydratedRef.current) { hydratedRef.current = true; return; }
    if (locked || !changed) return;
    setSaveState('pending');
    const t = setTimeout(() => { void flush(); }, 5000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vals]);

  if (aspects.length === 0) return null;

  const STATUS_TEXT: Record<SaveState, string> = {
    idle: '', pending: 'Perubahan belum disimpan…', saving: 'Menyimpan…',
    saved: '✓ Tersimpan otomatis', error: '✗ Gagal menyimpan — coba ubah lagi',
  };

  return (
    <section className="mt-6 break-inside-avoid">
      <div className="bg-emerald-700 text-white rounded-t-xl px-4 py-2.5 flex items-center justify-between gap-2">
        <h2 className="text-sm font-extrabold uppercase tracking-wide flex items-center gap-2">
          <Sparkles className="w-4 h-4" /> {title}
        </h2>
        {locked && (
          <span className="text-[10px] font-bold bg-white/15 px-2 py-0.5 rounded inline-flex items-center gap-1">
            <Lock className="w-3 h-3" /> Terkunci (Final)
          </span>
        )}
      </div>
      <div className="border border-t-0 border-gray-200 rounded-b-xl p-4 space-y-3">
        <p className="text-[11px] text-gray-500 bg-emerald-50/60 border border-emerald-100 rounded-lg p-2">
          {intro}
          {!locked && <> Tersimpan <strong>otomatis</strong> — tak perlu tombol Simpan.</>}
        </p>
        {locked && (
          <p className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg p-2 no-print">
            <Lock className="w-3.5 h-3.5 shrink-0" />
            Laporan sudah <strong>final</strong> &amp; terlihat pegawai. Untuk mengubah ringkasan,
            klik <strong>&quot;Kembalikan ke Draf&quot;</strong> di panel atas.
          </p>
        )}
        {aspects.map((a) => (
          <div key={a} className="border border-gray-200 rounded-xl overflow-hidden">
            <div className="px-3 py-2 bg-gray-50 border-b border-gray-150">
              <span className="text-xs font-bold text-emerald-800 flex items-center gap-1.5">★ {a}</span>
            </div>
            <textarea
              value={vals[a] ?? ''}
              disabled={locked}
              onChange={(e) => { setVals((v) => ({ ...v, [a]: e.target.value })); }}
              onBlur={() => { if (!locked && changed) void flush(); }} // simpan segera saat pindah fokus
              rows={3}
              placeholder={`Ringkasan kalibrasi HRD untuk ${noun} "${a}"…`}
              className="w-full text-xs p-3 outline-none resize-y text-gray-700 leading-relaxed disabled:bg-gray-50 disabled:text-gray-500"
            />
          </div>
        ))}
        {!locked && saveState !== 'idle' && (
          <p className={`text-[11px] font-semibold no-print ${
            saveState === 'error' ? 'text-rose-600' : saveState === 'saved' ? 'text-emerald-700' : 'text-amber-700'
          }`}>
            {STATUS_TEXT[saveState]}
          </p>
        )}
      </div>
    </section>
  );
}
