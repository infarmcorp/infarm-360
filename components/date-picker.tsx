'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, X } from 'lucide-react';

/**
 * Pemilih tanggal (kalender) buatan sendiri — menggantikan kalender bawaan browser agar
 * tampilannya SERAGAM di semua perangkat & selaras token redesign.
 *
 * Nilai tetap berformat `YYYY-MM-DD` (sama seperti <input type="date">) sehingga pemanggil,
 * Server Action, dan skema DB tak perlu berubah.
 *
 * Catatan tanggal: seluruh perbandingan memakai STRING `YYYY-MM-DD` (urutan leksikografis =
 * urutan kronologis) dan aritmetika y/m/d, bukan objek Date bertimestamp — supaya tak ada
 * pergeseran hari akibat zona waktu (masalah klasik `new Date('2026-01-01')` yang jadi 31 Des).
 * `new Date()` hanya dipakai untuk membaca "hari ini" lokal & jumlah hari per bulan.
 */

const MONTHS = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
// Minggu sebagai kolom pertama (mengikuti kalender acuan).
const WEEKDAYS = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];

const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

function parseYmd(s: string | undefined | null): { y: number; m: number; d: number } | null {
  const p = (s ?? '').split('-').map(Number);
  if (p.length !== 3 || p.some((n) => !Number.isFinite(n)) || p[1] < 1 || p[1] > 12) return null;
  return { y: p[0], m: p[1], d: p[2] };
}

const daysInMonth = (y: number, m: number) => new Date(y, m, 0).getDate();
const firstWeekdayOf = (y: number, m: number) => new Date(y, m - 1, 1).getDay(); // 0=Minggu

/** "8 Jun 2026" — label ringkas untuk kotak pemicu. */
function labelOf(v: string): string {
  const p = parseYmd(v);
  return p ? `${p.d} ${MONTHS_SHORT[p.m - 1]} ${p.y}` : '';
}

function todayYmd(): string {
  const t = new Date();
  return ymd(t.getFullYear(), t.getMonth() + 1, t.getDate());
}

export function DatePicker({
  value, onChange, min, max, placeholder = 'Pilih tanggal', ariaLabel, allowClear = false, className = '',
}: {
  value: string;
  onChange: (v: string) => void;
  min?: string;
  max?: string;
  placeholder?: string;
  ariaLabel?: string;
  allowClear?: boolean;   // izinkan mengosongkan (mis. Tanggal Keluar yang opsional)
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'day' | 'month'>('day');
  const today = useMemo(todayYmd, []);
  // Bulan yang sedang ditampilkan (bukan nilai terpilih) — awalnya ikut nilai, atau bulan ini.
  const initial = parseYmd(value) ?? parseYmd(today)!;
  const [view, setView] = useState({ y: initial.y, m: initial.m });
  const boxRef = useRef<HTMLDivElement>(null);

  // Saat dibuka: selalu mulai dari bulan nilai terpilih (atau bulan ini bila kosong).
  useEffect(() => {
    if (!open) return;
    const p = parseYmd(value) ?? parseYmd(today)!;
    setView({ y: p.y, m: p.m });
    setMode('day');
  }, [open, value, today]);

  // Tutup saat klik di luar atau tekan Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const outOfRange = (s: string): boolean => Boolean((min && s < min) || (max && s > max));

  // 42 sel (6 baris × 7 hari) — tinggi kalender tetap, tak "melompat" saat ganti bulan.
  const cells = useMemo(() => {
    const lead = firstWeekdayOf(view.y, view.m);
    const dim = daysInMonth(view.y, view.m);
    const prevY = view.m === 1 ? view.y - 1 : view.y;
    const prevM = view.m === 1 ? 12 : view.m - 1;
    const dimPrev = daysInMonth(prevY, prevM);
    const out: { key: string; day: number; date: string; current: boolean }[] = [];
    for (let i = lead - 1; i >= 0; i--) {
      const d = dimPrev - i;
      out.push({ key: `p${d}`, day: d, date: ymd(prevY, prevM, d), current: false });
    }
    for (let d = 1; d <= dim; d++) out.push({ key: `c${d}`, day: d, date: ymd(view.y, view.m, d), current: true });
    const nextY = view.m === 12 ? view.y + 1 : view.y;
    const nextM = view.m === 12 ? 1 : view.m + 1;
    for (let d = 1; out.length < 42; d++) out.push({ key: `n${d}`, day: d, date: ymd(nextY, nextM, d), current: false });
    return out;
  }, [view]);

  const shiftMonth = (delta: number) => setView((v) => {
    const m = v.m + delta;
    if (m < 1) return { y: v.y - 1, m: 12 };
    if (m > 12) return { y: v.y + 1, m: 1 };
    return { y: v.y, m };
  });

  const pick = (date: string) => {
    if (outOfRange(date)) return;
    onChange(date);
    setOpen(false);
  };

  return (
    <div ref={boxRef} className={`relative ${className}`}>
      {/* Pemicu — tampil seperti kotak input, tapi sebenarnya tombol (type=button agar tak
          men-submit form induk saat diklik). */}
      <button
        type="button"
        aria-label={ariaLabel ?? placeholder}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={`w-full flex items-center gap-2 rounded-control border bg-[#FDFDFC] px-3 py-2 text-left transition-colors ${
          open ? 'border-brand ring-2 ring-brand-tint' : 'border-line hover:border-line-strong'
        }`}
      >
        <CalendarDays className="w-4 h-4 text-brand shrink-0" aria-hidden />
        <span className={`flex-1 text-[13.5px] ${value ? 'data-value text-ink' : 'text-ink-faint'}`}>
          {value ? labelOf(value) : placeholder}
        </span>
        {allowClear && value && (
          <span
            role="button"
            tabIndex={-1}
            aria-label="Kosongkan tanggal"
            onClick={(e) => { e.stopPropagation(); onChange(''); }}
            className="shrink-0 rounded-control p-0.5 text-ink-faint hover:text-danger-ink hover:bg-danger-tint"
          >
            <X className="w-3.5 h-3.5" />
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Kalender"
          // Elemen mengambang → shadow diperbolehkan (lihat aturan design system).
          className="absolute z-40 mt-1 w-[266px] max-w-[calc(100vw-2rem)] rounded-panel border border-line bg-surface p-3 shadow-lg"
        >
          {/* Header: klik nama bulan → pilih bulan/tahun langsung (hindari klik ‹ berkali-kali
              untuk tanggal jauh, mis. tanggal bergabung pegawai beberapa tahun lalu). */}
          <div className="flex items-center justify-between gap-2 mb-2">
            <button type="button" onClick={() => setMode((m) => (m === 'day' ? 'month' : 'day'))}
              className="text-[13.5px] font-bold text-ink hover:text-brand-ink rounded-control px-1 -ml-1">
              {mode === 'day' ? `${MONTHS[view.m - 1]} ${view.y}` : view.y}
            </button>
            <div className="flex items-center gap-0.5">
              <NavBtn label={mode === 'day' ? 'Bulan sebelumnya' : 'Tahun sebelumnya'}
                onClick={() => (mode === 'day' ? shiftMonth(-1) : setView((v) => ({ ...v, y: v.y - 1 })))}>
                <ChevronLeft className="w-4 h-4" />
              </NavBtn>
              <NavBtn label={mode === 'day' ? 'Bulan berikutnya' : 'Tahun berikutnya'}
                onClick={() => (mode === 'day' ? shiftMonth(1) : setView((v) => ({ ...v, y: v.y + 1 })))}>
                <ChevronRight className="w-4 h-4" />
              </NavBtn>
            </div>
          </div>

          {mode === 'month' ? (
            <div className="grid grid-cols-3 gap-1">
              {MONTHS_SHORT.map((mm, i) => {
                const active = view.m === i + 1;
                return (
                  <button key={mm} type="button" onClick={() => { setView((v) => ({ ...v, m: i + 1 })); setMode('day'); }}
                    className={`py-2 text-[12px] font-semibold rounded-control transition-colors ${
                      active ? 'bg-brand text-white' : 'text-ink-soft hover:bg-neutral-tint'}`}>
                    {mm}
                  </button>
                );
              })}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-7 mb-1">
                {WEEKDAYS.map((d) => (
                  <span key={d} className="text-center text-[10px] font-bold uppercase tracking-wide text-ink-faint py-1">{d}</span>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-y-0.5">
                {cells.map((c) => {
                  const selected = value === c.date;
                  const isToday = today === c.date;
                  const disabled = outOfRange(c.date);
                  return (
                    <button
                      key={c.key}
                      type="button"
                      disabled={disabled}
                      onClick={() => pick(c.date)}
                      aria-current={isToday ? 'date' : undefined}
                      className={`mx-auto flex h-8 w-8 items-center justify-center rounded-full text-[12.5px] data-value transition-colors ${
                        selected
                          ? 'bg-brand text-white font-bold'
                          : disabled
                            ? 'text-ink-faint/40 cursor-not-allowed'
                            : c.current
                              ? `text-ink hover:bg-brand-tint ${isToday ? 'font-bold text-brand-ink ring-1 ring-brand' : ''}`
                              : 'text-ink-faint/60 hover:bg-neutral-tint'
                      }`}
                    >
                      {c.day}
                    </button>
                  );
                })}
              </div>

              <div className="mt-2 border-t border-line-soft pt-2">
                <button type="button" disabled={outOfRange(today)} onClick={() => pick(today)}
                  className="text-[12px] font-bold text-brand-ink hover:underline disabled:opacity-40 disabled:no-underline disabled:cursor-not-allowed">
                  Hari Ini
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function NavBtn({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" aria-label={label} onClick={onClick}
      className="p-1 rounded-control text-ink-soft hover:bg-neutral-tint hover:text-ink">
      {children}
    </button>
  );
}
