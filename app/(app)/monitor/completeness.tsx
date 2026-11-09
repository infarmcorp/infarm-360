/**
 * Baris ringkas Kelengkapan Data — ditempel DI BAWAH scorecard terkait (KPI di bawah kartu KPI,
 * 360° di bawah kartu 360°) agar hemat ruang. Menunjukkan berapa pegawai lingkup yang datanya
 * sudah terisi pada periode terpilih. Bukan penilaian kinerja — hanya kelengkapan input.
 */
export function FilledNote({ n, total }: { n: number; total: number }) {
  if (total <= 0) return null;
  const pct = Math.round((n / total) * 100);
  const full = n >= total;
  return (
    <div className="text-xs text-ink-soft mt-0.5">
      Terisi <span className="font-mono font-semibold text-ink">{n}/{total}</span> <span className="font-mono">({pct}%)</span>
      {!full && <span className="text-warn-ink font-semibold"> · <span className="font-mono">{total - n}</span> belum</span>}
    </div>
  );
}
