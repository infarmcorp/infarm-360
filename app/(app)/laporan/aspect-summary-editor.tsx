'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Sparkles, Lock, Star, Check, X } from 'lucide-react';
import { CARD, CardTitle } from '@/components/infarm-ui';
import { saveAspectSummaries } from '@/app/(app)/admin/laporan/actions';
import { hasSummaryMarkup } from '@/lib/summary-format';
import { SummaryText } from './summary-text';

/**
 * Section 4 — EVALUASI ASPEK BUDAYA & PERILAKU 360° (HRD).
 * HRD meringkas/mengkalibrasi hasil 360° per aspek (naratif), tersimpan di
 * final_reports.content.aspectSummaries. Anonim — tak menyebut nama penilai.
 *
 * AUTO-SIMPAN (debounce 5s + saat blur) — tak ada tombol "Simpan" manual, kerja
 * tak hilang (pola sama dengan form penilaian). TERKUNCI bila laporan sudah
 * `finalized`: harus "Buka Kembali (ke Draf)" dulu untuk mengedit (cegah ubah diam-diam
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
    // Disengaja: status "menunggu simpan" menyertai timer simpan otomatis (sistem luar = timer + server).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSaveState('pending');
    const t = setTimeout(() => { void flush(); }, 5000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vals]);

  if (aspects.length === 0) return null;

  const STATUS_TEXT: Record<SaveState, string> = {
    idle: '', pending: 'Perubahan belum disimpan…', saving: 'Menyimpan…',
    saved: 'Tersimpan otomatis', error: 'Gagal menyimpan — coba ubah lagi',
  };

  return (
    <section className={`${CARD} print:shadow-none mt-4 break-inside-avoid`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <CardTitle icon={Sparkles}>{title}</CardTitle>
        {locked && (
          <span className="text-xs font-semibold bg-brand-tint text-brand-ink px-2 py-0.5 rounded-full inline-flex items-center gap-1">
            <Lock className="w-3 h-3" /> Terkunci (Final)
          </span>
        )}
      </div>
      <p className="text-xs text-ink-soft mt-1.5">
        {intro}
        {!locked && <> Tersimpan <strong>otomatis</strong> — tak perlu tombol Simpan.</>}
      </p>
      <div className="mt-3 space-y-3">
        {locked && (
          <p className="flex items-center gap-1.5 text-xs font-semibold text-brand-ink bg-brand-tint rounded-xl px-3.5 py-2.5 no-print">
            <Lock className="w-3.5 h-3.5 shrink-0" />
            <span>
              Laporan sudah <strong>final</strong> &amp; terlihat pegawai. Untuk mengubah ringkasan,
              klik <strong>&quot;Buka Kembali (ke Draf)&quot;</strong> di panel atas.
            </span>
          </p>
        )}
        {aspects.map((a) => (
          <div key={a} className="border border-line rounded-control bg-infarm-surface print:bg-white overflow-hidden">
            <div className="px-3 py-2 border-b border-line">
              <span className="text-[13px] font-bold text-brand-ink flex items-center gap-1.5">
                <Star className="w-3.5 h-3.5 shrink-0" aria-hidden /> {a}
              </span>
            </div>
            <textarea
              value={vals[a] ?? ''}
              disabled={locked}
              onChange={(e) => { setVals((v) => ({ ...v, [a]: e.target.value })); }}
              onBlur={() => { if (!locked && changed) void flush(); }} // simpan segera saat pindah fokus
              rows={Math.min(14, Math.max(3, (vals[a] ?? '').split('\n').length + 1))}
              placeholder={`Ringkasan kalibrasi HRD untuk ${noun} "${a}"…`}
              className="block w-full text-[13px] p-3 bg-surface outline-none focus:ring-2 focus:ring-inset focus:ring-brand-tint resize-y text-ink leading-relaxed placeholder:text-ink-soft disabled:bg-neutral-tint disabled:text-ink-soft no-print"
            />
            {/* Pratinjau berformat (tebal/poin) — selalu dipakai saat cetak/Unduh PDF. */}
            {(vals[a] ?? '').trim() && (
              <div className={`border-t border-line bg-infarm-surface ${hasSummaryMarkup(vals[a] ?? '') ? '' : 'hidden print:block'} print:border-0 print:bg-transparent`}>
                <p className="text-[10px] font-semibold uppercase tracking-[0.05em] text-ink-soft px-3 pt-2 no-print">Pratinjau</p>
                <SummaryText text={vals[a] ?? ''} className="text-[13px] p-3 text-ink leading-relaxed" />
              </div>
            )}
          </div>
        ))}
        {!locked && (
          <p className="text-xs text-ink-soft no-print">
            Format: <code className="data-value bg-neutral-tint px-1 rounded">**teks**</code> = tebal ·
            baris diawali <code className="data-value bg-neutral-tint px-1 rounded">- </code> = poin (baris berikutnya tanpa “- ” = lanjutan poin) ·
            baris kosong = paragraf baru.
          </p>
        )}
        {!locked && saveState !== 'idle' && (
          <p className={`flex items-center gap-1 text-xs font-semibold no-print ${
            saveState === 'error' ? 'text-danger-ink' : saveState === 'saved' ? 'text-brand-ink' : 'text-warn-ink'
          }`}>
            {saveState === 'saved' && <Check className="w-3.5 h-3.5 shrink-0" aria-hidden />}
            {saveState === 'error' && <X className="w-3.5 h-3.5 shrink-0" aria-hidden />}
            {STATUS_TEXT[saveState]}
          </p>
        )}
      </div>
    </section>
  );
}
