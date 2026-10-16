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
    <div className="text-[10px] text-ink-faint mt-0.5">
      Terisi <span className="data-value font-semibold text-ink-soft">{n}/{total}</span> <span className="data-value">({pct}%)</span>
      {!full && <span className="text-warn-ink font-semibold"> · <span className="data-value">{total - n}</span> belum</span>}
    </div>
  );
}
