'use client';

import { useMemo, useState } from 'react';
import { colPercents } from '@/lib/table-cols';
import { StableHeight } from '@/components/table-controls';
import Link from 'next/link';
import { AccButton } from './acc-button';
import { playerLabelOf, type PlayerClass, fmt2, NO_SCORE_LABEL, NO_SCORE_TITLE } from '@/lib/scoring';
import { TREND_META, type Trend } from '@/lib/trend';
import { displayName } from '@/lib/employee-name';
import { InfoTip } from '@/components/info-tip';
import { FIELD, PLAYER_TONE, TABLE_HEAD, TREND_CHIP } from '@/components/infarm-ui';

export type TeamRow = {
  id: string;
  name: string;
  nickname?: string | null; // nama panggilan (opsional) — tampilan ringkas; kosong → nama lengkap
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
  // ACC terkunci karena PERIODE-nya bukan periode aktif (mode tinjau kuartal lampau). Beda dari
  // accReadonly (soal SIAPA yang berhak) — ini soal KAPAN. setSpvAcc selalu menulis ke periode
  // aktif, jadi tombolnya wajib hilang di periode lampau, bukan sekadar gagal saat diklik.
  accLocked?: boolean;
};

/** Badge "Anda" untuk baris pengguna sendiri. */
function SelfBadge({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <span className="text-[11px] font-semibold text-brand-ink bg-brand-tint rounded-full px-2 py-0.5">
      Anda
    </span>
  );
}

const PLAYER_SHORT: Record<PlayerClass, string> = { A: 'A', B_CULTURE: 'B-Cul', B_KPI: 'B-KPI', C: 'C', HRD_REVIEW: 'HRD Review' };

/** Chip status laporan: Final = brand · Ditinjau = netral · Draf = warn. */
const CHIP = 'text-[11px] font-semibold px-2.5 py-0.5 rounded-full whitespace-nowrap';
/** Tombol pager (selaras tabel Dashboard Organisasi). */
const PAGER_BTN = 'text-[13px] font-semibold min-h-10 px-3.5 rounded-control bg-neutral-tint text-ink-soft hover:text-ink disabled:opacity-40 disabled:cursor-not-allowed';

/** Badge kategori 4-Box (KPI×360). KPI "belum terbaca" tak diklasifikasi — selaras Dashboard.
 *  Warna = PLAYER_TONE (Design System Infarm); HRD Review (BR-11) = tone warn. */
function PlayerBadge({ p, unread }: { p: PlayerClass | null; unread?: boolean }) {
  if (unread) return (
    <span title="KPI baru 1 dari 3 bulan kuartal terisi — tidak diklasifikasi"
      className={`${CHIP} border bg-neutral-tint text-ink-soft border-neutral-tint`}>Belum Terbaca</span>
  );
  if (!p) return <span className="text-xs text-ink-faint">—</span>;
  return (
    <span title={p === 'HRD_REVIEW' ? 'HRD Review — KPI atau Skor 360° belum tersedia; tidak diklasifikasi otomatis' : playerLabelOf(p)}
      className={`${CHIP} border ${PLAYER_TONE[p].chip}`}>
      {PLAYER_SHORT[p]}
    </span>
  );
}

/** Badge trend KPI 3 bulan (label & panah dari TREND_META, warna TREND_CHIP). */
function TrendBadge({ t, months }: { t: Trend; months: (number | null)[] }) {
  if (t === 'empty') return <span className="text-xs text-ink-faint">—</span>;
  const m = TREND_META[t];
  const tip = months.map((v, i) => `Bln ${i + 1}: ${v == null ? '—' : v}`).join(' · ');
  return (
    <span title={tip} className={`${CHIP} inline-flex items-center gap-0.5 ${TREND_CHIP[t]}`}>
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
 *   (Laporan Kinerja Tim, dari final_reports); 'live' = dihitung langsung dari KPI+360°
 *   (Monitor Kinerja) → bisa berbeda dari angka tersimpan. Hanya memengaruhi keterangan, bukan angka.
 * `showSearch` (default true) — tampilkan kotak cari nama sisi-klien.
 * `pageSize` (opsional) — bila diisi, tabel dipaginasi SISI-KLIEN (mis. 10/halaman) dengan pager
 *   "10 sebelumnya / berikutnya". Cocok untuk daftar besar (Monitor Kinerja Pegawai HRD, seluruh
 *   pegawai) yang datanya sudah dimuat penuh untuk grafik → tak perlu fetch server per halaman.
 *   Paginasi bekerja SETELAH pencarian (cari dulu → hasil dipaginasi); ganti kata kunci reset ke hal-1.
 */
export function TeamTable({
  rows, linkNames = true, showStatus = true, showAcc = true, scoreBasis = 'stored', showSearch = true, pageSize,
  periodId, has360 = true,
}: { rows: TeamRow[]; /** Periode ber-360°? Skor 360° kosong → "No Score" (BR-09); tanpa 360° → "—". */ has360?: boolean; linkNames?: boolean; showStatus?: boolean; showAcc?: boolean; scoreBasis?: 'stored' | 'live'; showSearch?: boolean; pageSize?: number;
  /** Periode yang sedang ditampilkan — diteruskan ke tautan detail (`/laporan/<id>?period=`)
   *  agar halaman detail membuka KUARTAL YANG SAMA dengan tabel, bukan selalu periode aktif. */
  periodId?: string }) {
  const [q, setQ] = useState('');
  const [page, setPage] = useState(0);
  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter(
      (r) => r.name.toLowerCase().includes(term) || (r.nickname ?? '').toLowerCase().includes(term) || (r.dept ?? '').toLowerCase().includes(term),
    );
  }, [q, rows]);
  // Halaman kembali ke awal saat kata cari berubah — di handler input (bukan effect, yang memicu render berantai).

  // Paginasi sisi-klien (opsional): potong hasil terfilter ke halaman aktif.
  const pageCount = pageSize ? Math.max(1, Math.ceil(filtered.length / pageSize)) : 1;
  const safePage = Math.min(page, pageCount - 1);
  const paged = pageSize ? filtered.slice(safePage * pageSize, safePage * pageSize + pageSize) : filtered;
  const from = filtered.length === 0 ? 0 : safePage * pageSize! + 1;
  const to = pageSize ? Math.min(filtered.length, safePage * pageSize + paged.length) : filtered.length;

  return (
    <div>
      {showSearch && (
        <div className="mb-3">
          <input
            type="search"
            value={q}
            onChange={(e) => { setQ(e.target.value); setPage(0); }}
            placeholder="Cari nama pegawai…"
            aria-label="Cari nama pegawai"
            className={`${FIELD} w-full sm:max-w-xs`}
          />
        </div>
      )}

      <StableHeight>
      {filtered.length === 0 ? (
        <p className="text-[13px] text-ink-soft">Tidak ada pegawai cocok dengan &quot;{q}&quot;.</p>
      ) : (
        <div className="overflow-x-auto">
          {/* table-fixed + colgroup: lebar kolom TETAP antar halaman/pencarian (tak bergeser saat paging). */}
          <table className="w-full table-fixed table-1line text-left text-[13px]"
            style={{ minWidth: Math.round((810 + (showStatus ? 96 : 0) + (showAcc ? 170 : 0)) * 0.78) }}>
            <colgroup>
              {colPercents([
                220, // Anggota + divisi
                90, // KPI
                100, // 360° ("No Score")
                150, // Skor Akhir (live/tersimpan)
                110, // 4-Box
                140, // Trend KPI ("Belum terbaca")
                showStatus && 96, // Status
                showAcc && 170, // ACC ("✔ ACC (batalkan)")
              ]).map((w, i) => <col key={i} style={{ width: w }} />)}
            </colgroup>
            <thead>
              <tr className={TABLE_HEAD}>
                <th className="py-2.5 px-3 rounded-l-lg">Anggota</th>
                <th className="py-2.5 px-3 text-center whitespace-nowrap">
                  KPI <InfoTip text="Rata-rata capaian KPI bulanan pegawai pada kuartal ini (0–100)." />
                </th>
                <th className="py-2.5 px-3 text-center whitespace-nowrap">
                  360° <InfoTip text="Skor umpan balik 360° kuartal ini — gabungan berbobot penilaian rekan/atasan/bawahan/lintas divisi (Self dikecualikan)." />
                </th>
                <th className="py-2.5 px-3 text-center">
                  Skor Akhir <span className="font-normal">({scoreBasis === 'live' ? 'live' : 'tersimpan'})</span>
                  <InfoTip text={scoreBasis === 'live'
                    ? 'Dihitung langsung (live): 50% KPI + 50% Skor 360°. Bila 360° nonaktif = 100% KPI.'
                    : 'Angka finalisasi tersimpan dari laporan: 50% KPI + 50% Skor 360° (100% KPI bila 360° nonaktif).'} />
                </th>
                <th className="py-2.5 px-3 text-center whitespace-nowrap">
                  4-Box <InfoTip text="Klasifikasi talenta KPI×360° (ambang 80): A (keduanya ≥80), B-Culture (360°≥80), B-KPI (KPI≥80), C (keduanya <80). KPI atau 360° kosong → HRD Review." />
                </th>
                <th className={`py-2.5 px-3 text-center ${showStatus || showAcc ? '' : 'rounded-r-lg'}`}>Trend KPI</th>
                {showStatus && <th className={`py-2.5 px-3 text-center ${showAcc ? '' : 'rounded-r-lg'}`}>Status</th>}
                {showAcc && <th className="py-2.5 px-3 text-right rounded-r-lg">ACC</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-line-soft">
              {paged.map((r) => (
                <tr key={r.id} className="hover:bg-infarm-surface/60">
                  <td className="py-3 px-3 break-words">
                    {linkNames && r.detailOpen ? (
                      <Link
                        href={periodId ? `/laporan/${r.id}?period=${periodId}` : `/laporan/${r.id}`}
                        title={r.name}
                        className="font-semibold text-ink inline-flex items-center gap-1.5 hover:text-brand-ink hover:underline"
                      >
                        {displayName(r.nickname, r.name)}
                        <SelfBadge show={r.isSelf} />
                      </Link>
                    ) : (
                      <span className="font-semibold text-ink inline-flex items-center gap-1.5" title={r.name}>
                        {displayName(r.nickname, r.name)}
                        <SelfBadge show={r.isSelf} />
                      </span>
                    )}
                    <span className="text-xs text-ink-soft block">
                      {r.dept}
                      {linkNames && !r.detailOpen && !r.isSelf && (
                        <span className="ml-1 italic">· detail menunggu rilis HRD</span>
                      )}
                    </span>
                  </td>
                  <td className="py-3 px-3 text-center font-mono text-ink-soft">
                    {r.kpiAvg != null ? fmt2(r.kpiAvg) : '—'}
                  </td>
                  <td className="py-3 px-3 text-center font-mono text-ink-soft">
                    {r.s360 != null ? fmt2(r.s360) : has360
                      ? <span className="text-xs font-semibold text-warn-ink font-sans" title={NO_SCORE_TITLE}>{NO_SCORE_LABEL}</span>
                      : '—'}
                  </td>
                  <td className="py-3 px-3 text-center font-mono font-bold text-brand">
                    {r.finalScore != null ? fmt2(r.finalScore) : '—'}
                  </td>
                  <td className="py-3 px-3 text-center"><PlayerBadge p={r.player} unread={r.trend === 'unread'} /></td>
                  <td className="py-3 px-3 text-center"><TrendBadge t={r.trend} months={r.kpiMonths} /></td>
                  {showStatus && (
                    <td className="py-3 px-3 text-center">
                      {r.status === 'finalized' ? (
                        <span className={`${CHIP} bg-brand-tint text-brand-ink`}>Final</span>
                      ) : r.status === 'in_review' ? (
                        <span className={`${CHIP} bg-neutral-tint text-ink-soft`}>Ditinjau</span>
                      ) : r.status === 'draft' ? (
                        <span className={`${CHIP} bg-warn-tint text-warn-ink`}>Draf</span>
                      ) : (
                        <span className="text-xs text-ink-faint">—</span>
                      )}
                    </td>
                  )}
                  {showAcc && (
                    <td className="py-3 px-3 text-right">
                      {r.isSelf ? (
                        <span className="text-xs text-ink-soft italic">laporan Anda</span>
                      ) : r.accLocked ? (
                        // Periode lampau: status ACC tetap terbaca, tapi tak bisa diubah.
                        !r.hasReport ? (
                          <span className="text-xs text-ink-soft italic">tanpa laporan</span>
                        ) : r.spvAcc ? (
                          <span className="text-xs font-semibold text-brand-ink">✔ Di-ACC</span>
                        ) : (
                          <span className="text-xs text-ink-soft italic">tidak di-ACC</span>
                        )
                      ) : r.accReadonly ? (
                        // Pegawai berkoordinator: ACC dilakukan koordinatornya → SPV lihat status saja.
                        !r.hasReport ? (
                          <span className="text-xs text-ink-soft italic">menunggu HRD</span>
                        ) : r.spvAcc ? (
                          <span className="text-xs font-semibold text-brand-ink">✔ Di-ACC koordinator</span>
                        ) : (
                          <span className="text-xs text-ink-soft italic">belum di-ACC koordinator</span>
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

      {/* Pager sisi-klien (hanya bila pageSize diisi & hasil melebihi 1 halaman). */}
      {pageSize && filtered.length > pageSize && (
        <div className="mt-auto pt-3 flex items-center justify-between gap-2">
          <button type="button" disabled={safePage <= 0} onClick={() => setPage(safePage - 1)}
            className={PAGER_BTN}>
            ← {pageSize} sebelumnya
          </button>
          <span className="text-xs text-ink-soft">
            <span className="font-mono">{from}–{to}</span> dari <span className="font-mono">{filtered.length}</span> · Halaman <span className="font-mono">{safePage + 1}/{pageCount}</span>
          </span>
          <button type="button" disabled={safePage >= pageCount - 1} onClick={() => setPage(safePage + 1)}
            className={PAGER_BTN}>
            {pageSize} berikutnya →
          </button>
        </div>
      )}
      </StableHeight>

      <p className="text-xs text-ink-soft mt-3">
        {scoreBasis === 'live' ? (
          <>Kolom <strong>Skor Akhir (live)</strong> dihitung langsung dari KPI + 360° periode ini —
          bisa berbeda dari angka <strong>finalisasi tersimpan</strong> di Laporan Kinerja Tim (yang mengikuti saat laporan difinalisasi).</>
        ) : (
          <>Kolom <strong>Skor Akhir (tersimpan)</strong> = angka finalisasi dari laporan; kosong (—) bila laporan belum dibuat/difinalisasi.
          Untuk angka hitung langsung, lihat <strong>Monitor Kinerja</strong>.</>
        )}
      </p>
    </div>
  );
}
