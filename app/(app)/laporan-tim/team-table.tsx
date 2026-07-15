'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { AccButton } from './acc-button';
import { PLAYER_BOXES, playerLabelOf, type PlayerClass } from '@/lib/scoring';
import { TREND_META, type Trend } from '@/lib/trend';

export type TeamRow = {
  id: string;
  name: string;
  dept: string | null;
  kpiAvg: number | null;   // rerata KPI periode aktif (L1)
  s360: number | null;     // Skor 360° terhitung (result_360, L1)
  finalScore: number | null;
  player: PlayerClass | null; // 4-Box KPI×360 (playerClassOf)
  trend: Trend;               // trend KPI 3 bulan (trendOf)
  kpiMonths: (number | null)[]; // skor KPI per bulan (untuk tooltip trend)
  status: string | null;
  hasReport: boolean;
  spvAcc: boolean;
  isSelf: boolean;
  detailOpen: boolean; // boleh buka detail laporan (lapis 2)? — SPV hanya bila sudah dirilis HRD
  canAcc: boolean;     // boleh beri ACC? — hanya setelah HRD "Rilis ke SPV" (in_review/finalized)
  accReadonly?: boolean; // ACC baris ini milik pihak lain (mis. koordinator) → tampil status, bukan tombol
};

/** Badge "Anda" untuk baris pengguna sendiri. */
function SelfBadge({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <span className="text-[10px] font-bold uppercase tracking-wide text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-1 py-0.5">
      Anda
    </span>
  );
}

const PLAYER_SHORT: Record<PlayerClass, string> = { A: 'A', B_CULTURE: 'B-Cul', B_KPI: 'B-KPI', C: 'C' };
const playerColor = (p: PlayerClass) => PLAYER_BOXES.find((b) => b.key === p)?.color ?? '#6b7280';

/** Badge kategori 4-Box (KPI×360). */
function PlayerBadge({ p }: { p: PlayerClass | null }) {
  if (!p) return <span className="text-[10px] text-gray-400">—</span>;
  const c = playerColor(p);
  return (
    <span title={playerLabelOf(p)} className="text-[10px] font-bold px-2 py-0.5 rounded-full"
      style={{ color: c, backgroundColor: `${c}1a` }}>
      {PLAYER_SHORT[p]}
    </span>
  );
}

/** Badge trend KPI 3 bulan. */
function TrendBadge({ t, months }: { t: Trend; months: (number | null)[] }) {
  if (t === 'empty') return <span className="text-[10px] text-gray-400">—</span>;
  const m = TREND_META[t];
  const tip = months.map((v, i) => `Bln ${i + 1}: ${v == null ? '—' : v}`).join(' · ');
  return (
    <span title={tip} className="text-[10px] font-bold px-2 py-0.5 rounded-full inline-flex items-center gap-0.5"
      style={{ color: m.color, backgroundColor: `${m.color}1a` }}>
      <span aria-hidden>{m.arrow}</span> {m.label}
    </span>
  );
}

/**
 * Tabel Laporan Kinerja Tim dengan pencarian nama pegawai.
 * Baris SPV sendiri (isSelf) ditandai "Anda" dan ACC dinonaktifkan
 * (SPV tidak boleh meng-ACC laporannya sendiri — lihat migrasi 0009).
 */
/**
 * `linkNames` (default true) — nama jadi tautan Tinjau (laporan). false → teks biasa (Monitor).
 * `showStatus`/`showAcc` (default true) — sembunyikan kolom Status/ACC untuk Monitor Kinerja.
 * `scoreBasis` (default 'stored') — sumber angka Skor Akhir: 'stored' = nilai finalisasi tersimpan
 *   (Laporan Kinerja Tim, dari final_reports); 'live' = dihitung langsung dari KPI+360°−punishment
 *   (Monitor Kinerja) → bisa berbeda dari angka tersimpan. Hanya memengaruhi keterangan, bukan angka.
 */
export function TeamTable({
  rows, linkNames = true, showStatus = true, showAcc = true, scoreBasis = 'stored',
}: { rows: TeamRow[]; linkNames?: boolean; showStatus?: boolean; showAcc?: boolean; scoreBasis?: 'stored' | 'live' }) {
  const [q, setQ] = useState('');
  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter(
      (r) => r.name.toLowerCase().includes(term) || (r.dept ?? '').toLowerCase().includes(term),
    );
  }, [q, rows]);

  return (
    <div>
      <div className="mb-3">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Cari nama pegawai…"
          aria-label="Cari nama pegawai"
          className="w-full sm:max-w-xs rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
        />
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-gray-500">Tidak ada pegawai cocok dengan "{q}".</p>
      ) : (
        <div className="overflow-x-auto">
          <table className={`w-full text-left text-sm ${showStatus || showAcc ? 'min-w-[840px]' : 'min-w-[680px]'}`}>
            <thead>
              <tr className="text-[11px] uppercase tracking-wider text-gray-500 border-b border-gray-200">
                <th className="py-2 pr-3">Anggota</th>
                <th className="py-2 px-3 text-center">KPI</th>
                <th className="py-2 px-3 text-center">360°</th>
                <th className="py-2 px-3 text-center" title={scoreBasis === 'live'
                  ? 'Dihitung langsung (live) dari KPI + 360° − punishment periode ini'
                  : 'Angka finalisasi tersimpan (dari laporan)'}>
                  Skor Akhir <span className="normal-case font-normal text-gray-400">({scoreBasis === 'live' ? 'live' : 'tersimpan'})</span>
                </th>
                <th className="py-2 px-3 text-center">4-Box</th>
                <th className={`py-2 px-3 text-center ${showStatus || showAcc ? '' : 'pr-0'}`}>Trend KPI</th>
                {showStatus && <th className="py-2 px-3 text-center">Status</th>}
                {showAcc && <th className="py-2 pl-3 text-right">ACC</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((r) => (
                <tr key={r.id}>
                  <td className="py-3 pr-3">
                    {linkNames && r.detailOpen ? (
                      <Link
                        href={`/laporan/${r.id}`}
                        className="font-bold text-gray-800 inline-flex items-center gap-1.5 hover:text-emerald-700 hover:underline"
                      >
                        {r.name}
                        <SelfBadge show={r.isSelf} />
                      </Link>
                    ) : (
                      <span className="font-bold text-gray-800 inline-flex items-center gap-1.5">
                        {r.name}
                        <SelfBadge show={r.isSelf} />
                      </span>
                    )}
                    <span className="text-[11px] text-gray-500 block">
                      {r.dept}
                      {linkNames && !r.detailOpen && !r.isSelf && (
                        <span className="ml-1 italic text-gray-400">· detail menunggu rilis HRD</span>
                      )}
                    </span>
                  </td>
                  <td className="py-3 px-3 text-center font-mono text-slate-600">
                    {r.kpiAvg != null ? r.kpiAvg.toFixed(2) : '—'}
                  </td>
                  <td className="py-3 px-3 text-center font-mono text-slate-600">
                    {r.s360 != null ? r.s360.toFixed(2) : '—'}
                  </td>
                  <td className="py-3 px-3 text-center font-mono font-black text-slate-800">
                    {r.finalScore != null ? r.finalScore.toFixed(2) : '—'}
                  </td>
                  <td className="py-3 px-3 text-center"><PlayerBadge p={r.player} /></td>
                  <td className="py-3 px-3 text-center"><TrendBadge t={r.trend} months={r.kpiMonths} /></td>
                  {showStatus && (
                    <td className="py-3 px-3 text-center">
                      {r.status === 'finalized' ? (
                        <span className="text-[10px] font-bold text-emerald-700">Final</span>
                      ) : r.status === 'in_review' ? (
                        <span className="text-[10px] font-bold text-indigo-700">Ditinjau</span>
                      ) : r.status === 'draft' ? (
                        <span className="text-[10px] font-bold text-amber-700">Draf</span>
                      ) : (
                        <span className="text-[10px] text-gray-500">—</span>
                      )}
                    </td>
                  )}
                  {showAcc && (
                    <td className="py-3 pl-3 text-right">
                      {r.isSelf ? (
                        <span className="text-[10px] text-gray-500 italic">laporan Anda</span>
                      ) : r.accReadonly ? (
                        // Pegawai berkoordinator: ACC dilakukan koordinatornya → SPV lihat status saja.
                        !r.hasReport ? (
                          <span className="text-[10px] text-gray-500 italic">menunggu HRD</span>
                        ) : r.spvAcc ? (
                          <span className="text-[10px] font-bold text-emerald-700">✔ Di-ACC koordinator</span>
                        ) : (
                          <span className="text-[10px] text-gray-500 italic">belum di-ACC koordinator</span>
                        )
                      ) : (
                        <AccButton employeeId={r.id} acc={r.spvAcc} hasReport={r.hasReport} canAcc={r.canAcc} />
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-[10px] text-gray-500 italic mt-3">
        {scoreBasis === 'live' ? (
          <>Kolom <strong>Skor Akhir (live)</strong> dihitung langsung dari KPI + 360° − punishment periode ini —
          bisa berbeda dari angka <strong>finalisasi tersimpan</strong> di Laporan Kinerja Tim (yang mengikuti saat laporan difinalisasi).</>
        ) : (
          <>Kolom <strong>Skor Akhir (tersimpan)</strong> = angka finalisasi dari laporan; kosong (—) bila laporan belum dibuat/difinalisasi.
          Untuk angka hitung langsung, lihat <strong>Monitor Kinerja</strong>.</>
        )}
      </p>
    </div>
  );
}
