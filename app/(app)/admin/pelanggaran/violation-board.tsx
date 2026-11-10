'use client';

import { useMemo, useState } from 'react';
import { CalendarDays, Search } from 'lucide-react';
import { CARD, FIELD } from '@/components/infarm-ui';
import { formatDateWib } from '@/lib/datetime';

export type BoardReport = { key: string; date: string | null; category: string; isOther: boolean; body: string; note: string | null };
export type BoardPerson = { id: string; name: string; dept: string; isActive: boolean; reports: BoardReport[] };

/**
 * Papan Laporan Pelanggaran: kiri = pegawai yang dilaporkan (terbanyak dulu), kanan = laporan pegawai terpilih,
 * satu kartu per laporan. Data sudah anonim dari server (tanpa pelapor/waktu kirim) dan sudah diurutkan
 * (tanggal kejadian terbaru → abjad isi). Filter divisi/kategori/nama hanya menyaring tampilan.
 */
export function ViolationBoard({ people, categories }: { people: BoardPerson[]; categories: string[] }) {
  const [dept, setDept] = useState('');
  const [cat, setCat] = useState('');
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<string | null>(null);

  const depts = useMemo(() => [...new Set(people.map((p) => p.dept))].sort((a, b) => a.localeCompare(b, 'id')), [people]);
  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return people
      .filter((p) => (!dept || p.dept === dept) && (!needle || p.name.toLowerCase().includes(needle)))
      .map((p) => ({ ...p, reports: cat ? p.reports.filter((r) => r.category === cat) : p.reports }))
      .filter((p) => p.reports.length > 0)
      .sort((a, b) => b.reports.length - a.reports.length || a.name.localeCompare(b.name, 'id'));
  }, [people, dept, cat, q]);
  // Pilihan yang tersaring keluar → tampilkan pegawai teratas (diturunkan saat render, tanpa effect).
  const sel = visible.find((p) => p.id === picked) ?? visible[0] ?? null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <label className="inline-flex items-center gap-2 text-[13px] text-ink-soft">Divisi:
          <select value={dept} onChange={(e) => setDept(e.target.value)} className={`${FIELD} bg-surface`}>
            <option value="">Semua divisi</option>
            {depts.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </label>
        <label className="inline-flex items-center gap-2 text-[13px] text-ink-soft">Kategori:
          <select value={cat} onChange={(e) => setCat(e.target.value)} className={`${FIELD} bg-surface`}>
            <option value="">Semua kategori</option>
            {categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <div className="relative flex-1 min-w-[200px] max-w-xs ml-auto">
          <Search className="w-4 h-4 text-ink-faint absolute left-3 top-1/2 -translate-y-1/2" aria-hidden />
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari nama pegawai"
            className={`${FIELD} bg-surface w-full pl-9`} />
        </div>
      </div>

      {visible.length === 0 ? (
        <div className={CARD}><p className="text-[13px] text-ink-soft">Tidak ada laporan yang cocok dengan filter.</p></div>
      ) : (
        <div className="flex flex-wrap gap-4 items-start">
          <div className="flex-[1_1_280px] max-w-sm min-w-0 bg-surface border border-line rounded-card shadow-card overflow-hidden">
            <div className="px-4 py-3 border-b border-line-soft flex items-baseline justify-between gap-2">
              <h2 className="text-base font-bold text-ink">Pegawai dilaporkan</h2>
              <span className="text-xs text-ink-soft">terbanyak dulu</span>
            </div>
            <div className="max-h-[560px] overflow-y-auto">
              {visible.map((p) => {
                const active = sel?.id === p.id;
                return (
                  <button key={p.id} type="button" onClick={() => setPicked(p.id)}
                    className={`block w-full text-left px-4 py-3 border-b border-line-soft last:border-b-0 transition-colors ${active ? 'bg-brand-tint shadow-[inset_3px_0_0_var(--color-brand)]' : 'bg-surface hover:bg-infarm-surface'}`}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-[13px] font-bold text-ink truncate">
                          {p.name}
                          {!p.isActive && <span className="ml-1.5 align-middle text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-neutral-tint text-ink-soft">nonaktif</span>}
                        </p>
                        <p className="text-xs text-ink-soft truncate">{p.dept}</p>
                      </div>
                      <span className="shrink-0 min-w-7 h-6 px-2 rounded-full bg-danger-tint text-danger-ink font-mono text-xs font-semibold inline-flex items-center justify-center">{p.reports.length}</span>
                    </div>
                    <div className="flex flex-wrap gap-1 mt-2">
                      {[...new Set(p.reports.map((r) => r.category))].map((c) => (
                        <span key={c} className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-neutral-tint text-ink-soft">{c}</span>
                      ))}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {sel && (
            <div className="flex-[999_1_480px] min-w-0 space-y-3">
              <div className={`${CARD} flex flex-wrap items-center justify-between gap-2`}>
                <div>
                  <h2 className="text-base font-bold text-ink">{sel.name}</h2>
                  <p className="text-xs text-ink-soft mt-0.5">
                    {sel.dept} · <span className="font-mono">{sel.reports.length}</span> laporan · urut tanggal kejadian terbaru
                  </p>
                </div>
              </div>
              {sel.reports.map((r, i) => (
                <article key={r.key} className={`${CARD} space-y-2.5`}>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-bold uppercase tracking-[0.06em] text-ink-soft">Laporan {i + 1}</span>
                    <span className="inline-flex items-center gap-1 text-xs text-ink bg-infarm-surface border border-brand-tint rounded-full px-2.5 py-0.5">
                      <CalendarDays className="w-3 h-3 text-brand-ink" aria-hidden />
                      Kejadian <span className="font-mono">{r.date ? formatDateWib(r.date) : '—'}</span>
                    </span>
                    <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${r.isOther ? 'bg-infarm-cream text-infarm-soil' : 'bg-brand-tint text-brand-ink'}`}>{r.category}</span>
                  </div>
                  <p className="text-[13px] leading-relaxed text-ink whitespace-pre-line">{r.body}</p>
                  {r.note && (
                    <div className="bg-neutral-tint rounded-xl px-3 py-2.5">
                      <p className="text-xs font-bold text-ink-soft mb-0.5">Catatan pelapor</p>
                      <p className="text-[13px] leading-relaxed text-ink whitespace-pre-line">{r.note}</p>
                    </div>
                  )}
                </article>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
