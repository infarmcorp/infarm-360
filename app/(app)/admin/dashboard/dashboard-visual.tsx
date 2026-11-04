'use client';

import { useState } from 'react';
import { colPercents } from '@/lib/table-cols';
import { motion } from 'motion/react';
import { Award, TrendingUp, Building2, Users } from 'lucide-react';
import {
  PLAYER_BOXES, type PlayerClass, perfLabelOf, perfCategoryOf, fmt2, NO_SCORE_LABEL, NO_SCORE_TITLE } from '@/lib/scoring';
import { heatColorInfarm as heatColor, HEAT_LEGEND_GRADIENT_INFARM as HEAT_LEGEND_GRADIENT } from '@/lib/score-color';
import { TREND_META, type Trend } from '@/lib/trend';
import { displayName } from '@/lib/employee-name';
import { usePager, Pager, StableHeight } from '@/components/table-controls';

/*
 * Halaman ini memakai Design System Infarm (2026-11-03): kartu putih r-16 + bayangan tipis di atas latar
 * hijau keputihan, pita ringkasan hijau brand, label eyebrow cokelat tanah, catatan berlatar krem.
 * Palet skor diskrit = jangkar heatColorInfarm: ≥90 cokelat · 80–89 hijau · 70–79 kuning · <70 merah.
 * Warna 4-Box, tren, & judul bagian dipetakan LOKAL di sini — lib/ & Monitor tetap palet lamanya.
 */
const CAT_COLOR = { exceed: '#6b4e3d', meet: '#388e3c', improve: '#ffc107', below: '#b71c1c' } as const;
/** Teks di atas segmen berwarna kategori (kuning terang → teks gelap). */
const CAT_TEXT = { exceed: '#ffffff', meet: '#ffffff', improve: '#1b1f1c', below: '#ffffff' } as const;

const PLAYER_TONE: Record<PlayerClass, { color: string; chip: string }> = {
  A: { color: '#00843b', chip: 'bg-brand text-white border-brand' },
  B_CULTURE: { color: '#96d296', chip: 'bg-infarm-light text-ink border-infarm-light' },
  B_KPI: { color: '#6b4e3d', chip: 'bg-infarm-cream text-infarm-soil border-infarm-cream' },
  C: { color: '#a23c33', chip: 'bg-danger-tint text-danger-ink border-danger-tint' },
  HRD_REVIEW: { color: '#f08c00', chip: 'bg-warn-tint text-warn-ink border-warn-tint' },
};

const TREND_CHIP: Record<Exclude<Trend, 'empty'>, string> = {
  up: 'bg-brand-tint text-brand-ink',
  down: 'bg-danger-tint text-danger-ink',
  stable: 'bg-neutral-tint text-ink-soft',
  volatile: 'bg-infarm-cream text-infarm-soil',
  unread: 'bg-neutral-tint text-ink-soft',
};

/** Kartu standar Design System Infarm. */
const CARD = 'bg-surface rounded-card shadow-card p-5';
/** Judul kartu (Montserrat via .infarm-ds h3). */
const CARD_TITLE = 'text-lg font-semibold text-ink leading-snug';

/** Judul pengelompok bagian: label eyebrow cokelat tanah + petunjuk abu. */
function SectionHeader({ label, hint }: { label: string; hint?: string; tone?: string }) {
  return (
    <div className="mt-6 mb-1 flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
      <h2 className="text-[11px] font-bold uppercase tracking-[0.09em] text-infarm-soil">{label}</h2>
      {hint && <span className="text-xs text-ink-soft">{hint}</span>}
    </div>
  );
}

/** Catatan penjelas berlatar krem (aksen hangat Design System Infarm). */
function Note({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div className="bg-infarm-cream rounded-xl px-4 py-3 text-[13px] text-ink">
      {title && <span className="block text-[11px] font-bold uppercase tracking-[0.09em] text-infarm-soil mb-1">{title}</span>}
      {children}
    </div>
  );
}

type StatItem = { value: string; label: string; sub?: React.ReactNode };
/**
 * Pita ringkasan hijau brand: satu angka utama besar (kiri) + kartu hijau muda berteks gelap.
 * (Aturan Design System: jangan teks hijau brand di atas hijau muda — kontras 2,74:1.)
 */
function SummaryBand({ lead, items }: { lead: StatItem; items: StatItem[] }) {
  return (
    <section className="bg-brand text-white rounded-card shadow-card p-6 flex flex-wrap gap-5 items-stretch">
      <div className="flex-[1_1_220px] flex flex-col justify-center gap-2">
        <span className="text-[13px] font-semibold">{lead.label}</span>
        <span className="font-mono text-[44px] leading-none font-bold">{lead.value}</span>
        {lead.sub}
      </div>
      <div className="flex-[3_1_480px] grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-3">
        {items.map((it) => (
          <div key={it.label} className="bg-infarm-light text-ink rounded-xl px-4 py-3.5 flex flex-col gap-1 min-w-0">
            <span className="text-xs font-semibold">{it.label}</span>
            <span className="font-mono text-2xl font-bold leading-tight truncate" title={it.value}>{it.value}</span>
            {it.sub != null && (typeof it.sub === 'string'
              ? <span className="text-xs truncate" title={it.sub}>{it.sub}</span>
              : <span className="text-xs">{it.sub}</span>)}
          </div>
        ))}
      </div>
    </section>
  );
}

/** Baris pegawai (primitif, serializable) yang dihitung di server. */
export type Row = {
  id: string;
  name: string;
  nickname?: string | null;
  dept: string;
  kpiAvg: number | null;
  s360: number | null;
  final: number | null;
  player: PlayerClass | null;
  // Pegawai nonaktif (resign) bisa tetap tampil bila punya data periode (Opsi B).
  // Skornya TETAP dihitung di agregat (akurat per periode, hindari survivorship bias);
  // penanda ini hanya untuk kejelasan visual di tabel.
  isActive?: boolean;
  // KPI "belum terbaca" (2 dari 3 bulan kuartal kosong) → dikecualikan dari kategorisasi/rerata KPI & Skor Akhir.
  kpiUnread?: boolean;
  // BR-11: hanya 1 sumbu (KPI saja / 360° saja, termasuk periode tanpa 360°) → player 'HRD_REVIEW',
  // tak diklasifikasi 4-Box → bucket "HRD Review".
  axisIncomplete?: boolean;
  // Trend KPI 3 bulan (trendOf) + skor bulanannya (untuk badge & tooltip di Tabel).
  trend?: Trend;
  kpiMonths?: (number | null)[];
};


/** Baris heatmap KPI per divisi: satu sel per bulan (null = belum ada data). */
export type DeptMonthRow = { dept: string; cells: { ym: string; avg: number | null }[] };
/** Baris heatmap 360° per divisi: satu sel per aspek (skor 0–100 terbobot per kelas penilai; null = belum ada data). */
export type DeptAspectRow = { dept: string; cells: { aspect: string; avg: number | null }[] };

type Props = {
  rows: Row[];
  deptScores: [string, number][];
  aspectScores: { aspek: string; score: number }[];
  monthly: { ym: string; avg: number }[];
  deptMonthly: DeptMonthRow[];
  months: string[];
  deptAspect360: DeptAspectRow[];
  aspect360Names: string[];
  yearLabel: number;
  yearMonthly: { ym: string; avg: number }[];
  year360: { label: string; avg: number }[];
  yearKpiAvg: number | null;
  year360Avg: number | null;
  has360: boolean;
  periodLabel: string;
  kpiStandard: number;
  prevLabel: string | null;
  prevFinalAvg: number | null;
  prevKpiAvg: number | null;
  prev360Avg: number | null;
  finalMove: MoveBreakdown | null;
  kpiMove: MoveBreakdown | null;
  s360Move: MoveBreakdown | null;
  aggregate: boolean;
  quarterlyDist: QuarterDist[];
};

/** Distribusi kategori kinerja (band Skor Akhir) untuk satu kuartal — untuk tren per-kuartal. */
export type QuarterDist = { label: string; exceed: number; meet: number; improve: number; below: number; total: number };

/** Rincian pergerakan rata-rata antar-periode: efek nilai (kohort) vs komposisi (masuk/keluar). */
export type MoveBreakdown = {
  cohortN: number; cohortDelta: number | null;   // pegawai berdata di kedua periode + selisih rata-ratanya
  joinerN: number; joinerAvg: number | null;     // baru berdata periode ini
  leaverN: number; leaverAvg: number | null;     // tak lagi berdata periode ini
};

type SubTab = 'compilation' | 'kpi' | 'feedback' | 'table';

const PLAYER_DESC: Record<PlayerClass, string> = {
  A: 'KPI ≥80 · 360° ≥80',
  B_CULTURE: 'KPI <80 · 360° ≥80',
  B_KPI: 'KPI ≥80 · 360° <80',
  C: 'KPI <80 · 360° <80',
  HRD_REVIEW: 'KPI atau 360° kosong',
};

/** Label ringkas untuk badge tabel. */
const PLAYER_BADGE: Record<PlayerClass, string> = {
  A: 'A', B_CULTURE: 'B · Culture', B_KPI: 'B · KPI', C: 'C', HRD_REVIEW: 'HRD Review',
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const ymLabel = (ym: string) => {
  const [y, m] = ym.split('-');
  return `${MONTHS[Number(m) - 1] ?? m} '${y.slice(2)}`;
};
const firstName = (n: string) => n.split(' ')[0];
/** Label super-ringkas untuk plot padat (scatter): nama panggilan bila ada, jika tidak → nama depan. */
const shortName = (r: { nickname?: string | null; name: string }) => r.nickname?.trim() || firstName(r.name);

/** Badge trend KPI 3 bulan (selaras Laporan Kinerja Tim). */
function TrendBadge({ t, months }: { t?: Trend; months?: (number | null)[] }) {
  if (!t || t === 'empty') return <span className="text-[11px] text-ink-faint">—</span>;
  const m = TREND_META[t];
  const tip = (months ?? []).map((v, i) => `Bln ${i + 1}: ${v == null ? '—' : fmt2(v)}`).join(' · ');
  return (
    <span title={tip} className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full inline-flex items-center gap-0.5 ${TREND_CHIP[t]}`}>
      <span aria-hidden>{m.arrow}</span> {m.label}
    </span>
  );
}
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

const TABS: { key: SubTab; label: string; icon: React.ElementType }[] = [
  { key: 'compilation', label: 'Kompilasi Kinerja Organisasi', icon: Building2 },
  { key: 'kpi', label: 'Analisis Hasil KPI', icon: Award },
  { key: 'feedback', label: 'Analisis 360 Feedback', icon: TrendingUp },
  { key: 'table', label: 'Tabel Hasil Seluruh Pegawai', icon: Users },
];

export function DashboardVisual({ rows, deptScores, aspectScores, monthly, deptMonthly, months, deptAspect360, aspect360Names, yearLabel, yearMonthly, year360, yearKpiAvg, year360Avg, has360, periodLabel, kpiStandard, prevLabel, prevFinalAvg, prevKpiAvg, prev360Avg, finalMove, kpiMove, s360Move, aggregate, quarterlyDist }: Props) {
  const [tab, setTab] = useState<SubTab>('compilation');

  return (
    <div className="space-y-5">
      {/* Sub-tab nav — pil; aktif = hijau brand solid */}
      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.key;
          return (
            <button key={t.key} type="button" onClick={() => setTab(t.key)}
              className={`flex items-center gap-2 min-h-11 px-4 rounded-full border text-sm font-semibold transition-colors ${
                active ? 'bg-brand border-brand text-white' : 'bg-surface border-line text-ink-soft hover:text-brand hover:border-infarm-light'}`}>
              <Icon className="w-4 h-4" />
              <span>{t.label}</span>
            </button>
          );
        })}
      </div>

      {tab === 'compilation' && <CompilationTab rows={rows} deptScores={deptScores} aspectScores={aspectScores} has360={has360} periodLabel={periodLabel}
        prevLabel={prevLabel} prevFinalAvg={prevFinalAvg} finalMove={finalMove} aggregate={aggregate} yearLabel={yearLabel} quarterlyDist={quarterlyDist} />}
      {tab === 'kpi' && <KpiTab rows={rows} deptScores={deptScores} monthly={monthly} deptMonthly={deptMonthly} months={months} kpiStandard={kpiStandard} yearLabel={yearLabel} yearMonthly={yearMonthly} yearKpiAvg={yearKpiAvg} prevLabel={prevLabel} prevKpiAvg={prevKpiAvg} kpiMove={kpiMove} />}
      {tab === 'feedback' && <FeedbackTab rows={rows} aspectScores={aspectScores} deptAspect360={deptAspect360} aspect360Names={aspect360Names} has360={has360} periodLabel={periodLabel} yearLabel={yearLabel} year360={year360} year360Avg={year360Avg} prevLabel={prevLabel} prev360Avg={prev360Avg} s360Move={s360Move} />}
      {tab === 'table' && <TableTab rows={rows} has360={has360} />}
    </div>
  );
}

/* ───────────────────────── TAB 1 — KOMPILASI (talenta) ───────────────────────── */
/** Delta vs periode sebelumnya: ▲ hijau (naik) / ▼ merah (turun) / ▬ abu (datar); null → tak render.
 *  Bila `move` diberi → hover menampilkan rincian pergerakan (kohort vs masuk/keluar) via tooltip. */
function Delta({ curr, prev, prevLabel, move }: { curr: number | null; prev: number | null; prevLabel?: string | null; move?: MoveBreakdown | null }) {
  if (curr == null || prev == null) return null;
  const d = curr - prev;
  const arrow = d > 0 ? '▲' : d < 0 ? '▼' : '▬';
  const tip = moveTooltip(prevLabel ?? null, move ?? null);
  return (
    <span title={tip} className={`font-mono font-semibold${tip ? ' cursor-help underline decoration-dotted decoration-1 underline-offset-2' : ''}`}>
      {arrow} {d >= 0 ? '+' : '−'}{fmt2(Math.abs(d))}{tip ? <span className="ml-0.5 opacity-70">ⓘ</span> : null}
    </span>
  );
}

/** Pil "▲ +x.xx vs Q2" di atas pita hijau (Delta berwarna putih — arah dibaca dari panah). */
function DeltaPill({ curr, prev, prevLabel, move }: { curr: number | null; prev: number | null; prevLabel: string | null; move: MoveBreakdown | null }) {
  if (!prevLabel || curr == null || prev == null) return null;
  return (
    <span className="inline-flex self-start items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1 text-xs font-semibold text-white">
      <Delta curr={curr} prev={prev} prevLabel={prevLabel} move={move} /> <span>vs {prevLabel}</span>
    </span>
  );
}

/**
 * Teks tooltip PENYEBAB PERUBAHAN rata-rata — istilah & struktur DISERAGAMKAN dengan kartu
 * "Penyebab Perubahan" di Monitor Kinerja (skor pegawai konsisten vs perubahan komposisi). Medium
 * berbeda sesuai konteks (Dashboard = scorecard ringkas → tooltip; Monitor = kartu terlihat), tetapi
 * konsep & bahasanya sama agar tak membingungkan lintas halaman.
 */
function moveTooltip(prevLabel: string | null, m: MoveBreakdown | null): string | undefined {
  if (!prevLabel || !m) return undefined;
  const fmt = (v: number | null) => (v != null ? fmt2(v) : '—');
  const signed = (v: number | null) => (v == null ? '—' : `${v >= 0 ? '+' : '−'}${fmt2(Math.abs(v))}`);
  const lines = [`Penyebab perubahan vs ${prevLabel}`, ''];
  lines.push(`• Perubahan skor pegawai konsisten (${m.cohortN}): ${signed(m.cohortDelta)}`);
  const compos: string[] = [];
  if (m.joinerN) compos.push(`+${m.joinerN} masuk (rata-rata ${fmt(m.joinerAvg)})`);
  if (m.leaverN) compos.push(`−${m.leaverN} keluar (rata-rata ${fmt(m.leaverAvg)})`);
  lines.push(`• Perubahan komposisi: ${compos.length ? compos.join(', ') : 'populasi tetap'}`);
  lines.push('');
  lines.push(m.joinerN || m.leaverN
    ? 'Sebagian selisih dari perubahan skor pegawai konsisten, sisanya dari perubahan komposisi (pegawai masuk/keluar).'
    : 'Seluruh pergerakan dari perubahan skor; komposisi pegawai tetap.');
  return lines.join('\n');
}

function CompilationTab({ rows, deptScores, aspectScores, has360, periodLabel, prevLabel, prevFinalAvg, finalMove, aggregate, yearLabel, quarterlyDist }: {
  rows: Row[]; deptScores: [string, number][]; aspectScores: { aspek: string; score: number }[];
  has360: boolean; periodLabel: string;
  prevLabel: string | null; prevFinalAvg: number | null; finalMove: MoveBreakdown | null; aggregate: boolean;
  yearLabel: number; quarterlyDist: QuarterDist[];
}) {
  // Pegawai "KPI belum terbaca" DIKECUALIKAN dari kategorisasi (data belum masuk, bukan rendah);
  // ditampilkan terpisah sebagai bucket "Belum Terbaca".
  const readable = rows.filter((r) => !r.kpiUnread);
  const unread = rows.filter((r) => r.kpiUnread);
  // BR-11: satu sumbu kosong (KPI atau 360°, termasuk periode tanpa 360°) → player 'HRD_REVIEW',
  // dikeluarkan dari 4-Box & ditampilkan di bucket "HRD Review" terpisah, seperti pola "Belum Terbaca".
  const incomplete = readable.filter((r) => r.axisIncomplete);
  const scored = readable.filter((r) => r.final != null);
  const denom = scored.length || 1;

  // Distribusi Kategori Kinerja & Rencana Tindak Lanjut — band Skor Akhir (ala legacy).
  const band = (min: number, max: number) => scored.filter((r) => (r.final ?? -1) >= min && (r.final ?? -1) < max).length;
  const categories = [
    { label: 'Melampaui Ekspektasi (Skor ≥ 90)', count: band(90, 1e9), color: CAT_COLOR.exceed },
    { label: 'Memenuhi Ekspektasi (Skor 80–89)', count: band(80, 90), color: CAT_COLOR.meet },
    { label: 'Perlu Peningkatan (Skor 70–79)', count: band(70, 80), color: CAT_COLOR.improve },
    { label: 'Di Bawah Ekspektasi (Skor < 70)', count: band(-1, 70), color: CAT_COLOR.below },
  ];
  const recommendations = [
    { label: 'Promosi Akselerasi Jabatan', count: band(90, 1e9), color: CAT_COLOR.exceed },
    { label: 'Pertahankan Posisi & Jalur Bonus', count: band(80, 90), color: CAT_COLOR.meet },
    { label: 'Program Workshop & Intervensi', count: band(70, 80), color: CAT_COLOR.improve },
    { label: 'Pelatihan Intensif Mutu', count: band(-1, 70), color: CAT_COLOR.below },
  ];

  // Papan Pertimbangan Suksesi & Promosi — pegawai Skor Akhir ≥ 90 + rencana suksesinya.
  const orgAvg = mean(scored.map((r) => r.final ?? 0));
  const aPlayers = readable.filter((r) => r.player === 'A').length;
  // Ambang <80 diselaraskan dengan 4-Box/scatter (bukan 85) → hanya ada dua sistem ambang: 80 & 90/80/70.
  const coaching = scored.filter((r) => (r.final ?? 99) < 80).length;
  const dominant = PLAYER_BOXES
    .map((b) => ({ label: b.label, n: readable.filter((r) => r.player === b.key).length }))
    .sort((a, b) => b.n - a.n)[0];

  const playerGroups = new Map<PlayerClass, Row[]>();
  readable.forEach((r) => { if (r.player && r.player !== 'HRD_REVIEW') { const a = playerGroups.get(r.player) ?? []; a.push(r); playerGroups.set(r.player, a); } });

  // 10 pegawai dengan Skor Akhir TERTINGGI / TERENDAH (bukan lagi dibatasi ambang <85).
  const rankedFinal = [...scored].sort((a, b) => (b.final ?? 0) - (a.final ?? 0));
  const top = rankedFinal.slice(0, 10);
  const bottom = [...rankedFinal].reverse().slice(0, 10);
  const topEmp = rankedFinal[0] ?? null;                                  // Skor Akhir tertinggi (pegawai + skor)
  const lowEmp = rankedFinal.length ? rankedFinal[rankedFinal.length - 1] : null; // Skor Akhir terendah

  return (
    <div className="space-y-6">
      <SectionHeader label="Ringkasan Talenta" hint="metrik utama organisasi" />
      <SummaryBand
        lead={{ value: fmt2(orgAvg), label: 'Rataan Skor Akhir Organisasi',
          sub: <DeltaPill curr={orgAvg} prev={prevFinalAvg} prevLabel={prevLabel} move={finalMove} /> }}
        items={[
          { value: topEmp?.final != null ? fmt2(topEmp.final) : '—', label: 'Skor Akhir Tertinggi', sub: topEmp ? displayName(topEmp.nickname, topEmp.name) : undefined },
          { value: lowEmp?.final != null ? fmt2(lowEmp.final) : '—', label: 'Skor Akhir Terendah', sub: lowEmp ? displayName(lowEmp.nickname, lowEmp.name) : undefined },
          { value: String(aPlayers), label: 'A Player' },
          { value: String(coaching), label: 'Perlu Coaching (<80)' },
          { value: dominant?.n ? dominant.label : '—', label: 'Kategori Dominan' },
        ]} />

      {/* Legenda ambang — menjelaskan kenapa "A Player" bisa beda band dengan Skor Akhir. */}
      <Note title="Catatan ambang">
        <strong>4-Box &amp; scatter</strong> memakai ambang <strong>80</strong> pada KPI &amp; 360° sebagai <em>dua sumbu terpisah</em>;
        <strong> band kategori Skor Akhir</strong> (kartu distribusi &amp; tindak lanjut) memakai <strong>90 / 80 / 70</strong> atas <em>satu</em> angka Skor Akhir.
        Karena beda dasar, seorang pegawai bisa berkelas <strong>A</strong> (KPI &amp; 360° ≥80) tetapi Skor Akhirnya jatuh di band <strong>Memenuhi (80–89)</strong> — itu wajar, bukan inkonsistensi.
      </Note>

      <SectionHeader label="Distribusi Organisasi" hint="komposisi & tindak lanjut" />

      {/* Distribusi Kategori Kinerja + Rencana Tindak Lanjut */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card title="Distribusi Kategori Kinerja — Skor Akhir">
          <p className="text-xs text-ink-soft mb-4 -mt-2">Skor Akhir = blend KPI 50% + 360° 50% (KPI murni bila 360° nonaktif; 360° saja bila KPI kosong). Berbeda dari tab <strong>Analisis Hasil KPI</strong> (KPI saja).{aggregate && <span className="text-infarm-soil font-semibold"> Mode agregat: rata-rata Skor Akhir per kuartal.</span>}</p>
          <CountBars items={categories} denom={denom} />
        </Card>
        <Card title="Rencana Tindak Lanjut Organisasi — Skor Akhir"><CountBars items={recommendations} denom={denom} /></Card>
      </div>

      {/* Distribusi kategori kinerja PER KUARTAL — kesehatan talenta dari waktu ke waktu. */}
      {quarterlyDist.length >= 2 && <QuarterlyDist data={quarterlyDist} yearLabel={yearLabel} />}

      <SectionHeader label="Per Divisi & Aspek" hint="skor KPI divisi · budaya 360°" />

      {/* Skor KPI per Divisi + Evaluasi Budaya 360° */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card title="Skor KPI Rata-rata per Divisi">
          <ScoreBars items={deptScores.map(([dept, score]) => ({ label: dept, score }))} empty="Belum ada data KPI." />
        </Card>
        <Card title="Evaluasi Budaya 360° (Skor Terbobot Sub-Aspek)">
          {!has360 && <p className="text-xs text-warn-ink font-semibold mb-3 bg-warn-tint rounded-xl px-3 py-2">360° nonaktif di {periodLabel} — aspek dari penilaian terkirim (bila ada).</p>}
          <ScoreBars items={aspectScores.map((a) => ({ label: a.aspek, score: a.score }))} suffix=" / 100" empty="Belum ada skor 360° terkirim." />
        </Card>
      </div>

      <SectionHeader label="Klasifikasi & Individu" hint="4-Box · sebaran · peringkat pegawai" />

      {/* 4-Box */}
      <div className={CARD}>
        <h3 className={CARD_TITLE}>Klasifikasi Pemain — Matriks 4-Box (A / B Culture / B KPI / C)</h3>
        <p className="text-xs text-ink-soft mt-1 mb-4">Pemetaan {[...playerGroups.values()].reduce((s, a) => s + a.length, 0)} pegawai berdasarkan KPI × 360° (ambang 80){incomplete.length > 0 ? ` · ${incomplete.length} HRD Review (dikecualikan)` : ''}{unread.length > 0 ? ` · ${unread.length} belum terbaca (dikecualikan)` : ''}.</p>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {PLAYER_BOXES.map((box) => {
            const emps = playerGroups.get(box.key) ?? [];
            const tone = PLAYER_TONE[box.key];
            return (
              <div key={box.key} style={{ borderTopColor: tone.color }}
                className="border border-line border-t-4 rounded-xl p-3.5 bg-surface min-h-[130px] flex flex-col">
                <div className="flex items-start justify-between gap-1">
                  <span className="text-sm font-bold text-ink leading-tight">{box.label}</span>
                  <span className="text-xl font-bold font-mono shrink-0 text-ink">{emps.length}</span>
                </div>
                <span className="text-xs text-ink-soft mt-0.5 leading-tight">{PLAYER_DESC[box.key]}</span>
                <div className="mt-2 flex flex-wrap gap-1">
                  {emps.map((e) => (
                    <span key={e.id} className="text-[11px] bg-neutral-tint text-ink-soft px-2 py-0.5 rounded-full font-semibold"
                      title={`${e.name} · KPI ${e.kpiAvg != null ? fmt2(e.kpiAvg) : 'N/A'} · 360 ${e.s360 != null ? fmt2(e.s360) : 'N/A'}`}>{shortName(e)}</span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
        {/* HRD Review & Belum Terbaca berdampingan kiri-kanan (bertumpuk di layar sempit). */}
        {(incomplete.length > 0 || unread.length > 0) && (
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
        {incomplete.length > 0 && (
          <div className="border border-line border-t-4 rounded-xl p-3.5 bg-warn-tint" style={{ borderTopColor: PLAYER_TONE.HRD_REVIEW.color }}>
            <div className="flex items-start justify-between gap-1">
              <span className="text-sm font-bold text-ink leading-tight">HRD Review</span>
              <span className="text-xl font-bold font-mono shrink-0 text-warn-ink">{incomplete.length}</span>
            </div>
            <span className="text-xs text-ink-soft mt-0.5 leading-tight block">KPI atau Skor 360° belum tersedia (No Score / Insufficient Data) → tidak diklasifikasi otomatis (tidak dianggap di bawah 80). Diputuskan HRD, atau lengkapi datanya lalu Hitung Ulang.</span>
            <div className="mt-2 flex flex-wrap gap-1">
              {incomplete.map((e) => (
                <span key={e.id} className="text-[11px] bg-surface text-ink-soft px-2 py-0.5 rounded-full font-semibold"
                  title={`${e.name} · KPI ${e.kpiAvg != null ? fmt2(e.kpiAvg) : 'kosong'} · 360 ${e.s360 != null ? fmt2(e.s360) : has360 ? NO_SCORE_LABEL : 'tanpa 360°'}`}>{shortName(e)}</span>
              ))}
            </div>
          </div>
        )}
        {unread.length > 0 && (
          <div className="border border-line border-t-4 border-t-line-strong rounded-xl p-3.5 bg-neutral-tint">
            <div className="flex items-start justify-between gap-1">
              <span className="text-sm font-bold text-ink leading-tight">Belum Terbaca (Tak Terkategori)</span>
              <span className="text-xl font-bold font-mono shrink-0 text-ink-soft">{unread.length}</span>
            </div>
            <span className="text-xs text-ink-soft mt-0.5 leading-tight block">KPI belum terbaca (baru 1 dari 3 bulan kuartal terisi) → dikecualikan dari kategorisasi &amp; rerata; bukan pekerja rendah.</span>
            <div className="mt-2 flex flex-wrap gap-1">
              {unread.map((e) => (
                <span key={e.id} className="text-[11px] bg-surface text-ink-soft px-2 py-0.5 rounded-full font-semibold"
                  title={`${e.name} · KPI belum terbaca · 360 ${e.s360 != null ? fmt2(e.s360) : 'N/A'}`}>{shortName(e)}</span>
              ))}
            </div>
          </div>
        )}
        </div>
        )}
        <p className="text-xs text-ink-soft mt-3">
          Berbasis KPI × 360° (ambang 80): A = KPI≥80 &amp; 360°≥80 · B Culture = KPI&lt;80 &amp; 360°≥80 ·
          B KPI = KPI≥80 &amp; 360°&lt;80 · C = keduanya &lt;80. Tanpa kelas D. KPI atau 360° kosong → HRD Review.
          {!has360 && <span className="text-warn-ink font-semibold"> Tanpa 360° → semua pegawai berstatus HRD Review.</span>}
        </p>
      </div>

      {/* Sebaran KPI × 360° (scatter kuadran) — lengkapi 4-Box: lihat spread & outlier. */}
      {has360 && <ScatterKpi360 rows={scored} />}

      {/* Top / bottom — satu kartu, toggle Teratas ↔ Terbawah */}
      <LeaderboardToggle metric="Skor Akhir" top={top} bottom={bottom} valueOf={(r) => r.final} />
    </div>
  );
}

/** Warna band kategori kinerja (Skor Akhir) — selaras `categories`/`recommendations`. */
const BAND_META = [
  { key: 'exceed', label: 'Melampaui (≥90)', color: CAT_COLOR.exceed },
  { key: 'meet', label: 'Memenuhi (80–89)', color: CAT_COLOR.meet },
  { key: 'improve', label: 'Perlu Peningkatan (70–79)', color: CAT_COLOR.improve },
  { key: 'below', label: 'Di Bawah (<70)', color: CAT_COLOR.below },
] as const;

/**
 * Distribusi Kategori Kinerja PER KUARTAL (stacked bar) — "kesehatan talenta dari waktu ke waktu".
 * Tiap baris = satu kuartal tahun terpilih; segmen = jumlah pegawai per band Skor Akhir. Menjawab
 * "apakah komposisi membaik antar-kuartal?" yang tak terlihat dari snapshot satu kuartal.
 */
function QuarterlyDist({ data, yearLabel }: { data: QuarterDist[]; yearLabel: number }) {
  return (
    <div className={CARD}>
      <h3 className={CARD_TITLE}>Distribusi Kategori Kinerja per Kuartal {yearLabel}</h3>
      <p className="text-xs text-ink-soft mt-1 mb-4">Komposisi pegawai per band Skor Akhir tiap kuartal — untuk melihat pergerakan komposisi (mis. Di Bawah → Memenuhi) antar waktu.</p>
      <div className="space-y-3">
        {data.map((q) => (
          <div key={q.label} className="space-y-1">
            <div className="flex items-center justify-between text-[13px]">
              <span className="font-bold text-ink">{q.label}</span>
              <span className="text-ink-soft font-mono text-xs">{q.total} pegawai</span>
            </div>
            <div className="flex h-7 w-full overflow-hidden rounded-lg bg-neutral-tint">
              {BAND_META.map((b) => {
                const n = q[b.key];
                if (!n) return null;
                const pct = (n / q.total) * 100;
                return (
                  <div key={b.key} className="h-full flex items-center justify-center text-[11px] font-semibold font-mono"
                    style={{ width: `${pct}%`, backgroundColor: b.color, color: CAT_TEXT[b.key] }} title={`${b.label}: ${n} (${pct.toFixed(0)}%)`}>
                    {pct >= 8 ? n : ''}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5">
        {BAND_META.map((b) => (
          <span key={b.key} className="inline-flex items-center gap-1.5 text-xs text-ink-soft">
            <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: b.color }} /> {b.label}
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * Scatter KPI × 360° dengan garis kuadran (ambang 80) — melengkapi 4-Box: alih-alih hanya hitungan,
 * tampak SEBARAN, outlier, & klaster tiap pegawai. Kuadran: kanan-atas A · kiri-atas B-Culture ·
 * kanan-bawah B-KPI · kiri-bawah C. Warna titik = kelas 4-Box.
 */
function ScatterKpi360({ rows }: { rows: Row[] }) {
  const pts = rows.filter((r) => r.kpiAvg != null && r.s360 != null);
  if (pts.length === 0) return null;
  const W = 460, H = 460, padL = 40, padR = 18, padT = 18, padB = 34;
  const plotL = padL, plotR = W - padR, plotT = padT, plotB = H - padB;
  // Domain adaptif tapi selalu memuat garis ambang 80 & seluruh titik.
  const vals = pts.flatMap((r) => [r.kpiAvg as number, r.s360 as number]);
  const lo = Math.max(0, Math.min(70, Math.floor((Math.min(...vals) - 4) / 5) * 5));
  const hi = 100;
  const x = (v: number) => plotL + ((v - lo) / (hi - lo)) * (plotR - plotL);
  const y = (v: number) => plotB - ((v - lo) / (hi - lo)) * (plotB - plotT);
  // B-Culture (hijau muda) diberi tepi zaitun agar titiknya tetap terlihat di atas latar putih.
  const colorOf = (p: PlayerClass | null | undefined) => (p ? PLAYER_TONE[p].color : '#8b918c');
  const ticks = [lo, (lo + hi) / 2, hi].map((t) => Math.round(t));
  const x80 = x(80), y80 = y(80);
  return (
    <div className={CARD}>
      <h3 className={CARD_TITLE}>Sebaran KPI × 360° (Kuadran 4-Box)</h3>
      <p className="text-xs text-ink-soft mt-1 mb-3">Tiap titik = 1 pegawai. Garis putus = ambang 80. Warna = kelas 4-Box. Melengkapi hitungan 4-Box dengan sebaran & outlier.</p>
      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-[520px] mx-auto" style={{ height: 'auto' }} preserveAspectRatio="xMidYMid meet">
          {/* Tint kuadran: hanya A (kanan-atas) yang diberi latar hijau keputihan */}
          <rect x={x80} y={plotT} width={plotR - x80} height={y80 - plotT} fill="#f5ffef" />
          {/* Sumbu & grid */}
          {ticks.map((t) => (
            <g key={`gx-${t}`}>
              <line x1={x(t)} y1={plotT} x2={x(t)} y2={plotB} stroke="#edefeb" strokeWidth={1} />
              <text x={x(t)} y={plotB + 14} textAnchor="middle" fill="#5b615c" fontSize={9}>{t}</text>
              <line x1={plotL} y1={y(t)} x2={plotR} y2={y(t)} stroke="#edefeb" strokeWidth={1} />
              <text x={plotL - 5} y={y(t) + 3} textAnchor="end" fill="#5b615c" fontSize={9}>{t}</text>
            </g>
          ))}
          {/* Garis ambang 80 */}
          <line x1={x80} y1={plotT} x2={x80} y2={plotB} stroke="#8b918c" strokeWidth={1.5} strokeDasharray="4 3" />
          <line x1={plotL} y1={y80} x2={plotR} y2={y80} stroke="#8b918c" strokeWidth={1.5} strokeDasharray="4 3" />
          {/* Label kuadran */}
          <text x={plotR - 4} y={plotT + 12} textAnchor="end" fill="#006b31" fontSize={10} fontWeight={800}>A</text>
          <text x={plotL + 4} y={plotT + 12} textAnchor="start" fill="#3b4a2e" fontSize={10} fontWeight={800}>B-Culture</text>
          <text x={plotR - 4} y={plotB - 5} textAnchor="end" fill="#6b4e3d" fontSize={10} fontWeight={800}>B-KPI</text>
          <text x={plotL + 4} y={plotB - 5} textAnchor="start" fill="#a23c33" fontSize={10} fontWeight={800}>C</text>
          {/* Titik pegawai */}
          {pts.map((r) => (
            <circle key={r.id} cx={x(r.kpiAvg as number)} cy={y(r.s360 as number)} r={4.5} fill={colorOf(r.player)}
              stroke={r.player === 'B_CULTURE' ? '#3b4a2e' : '#fff'} strokeWidth={1.2}>
              <title>{`${r.name} · KPI ${fmt2(r.kpiAvg as number)} · 360° ${fmt2(r.s360 as number)}`}</title>
            </circle>
          ))}
          {/* Judul sumbu */}
          <text x={(plotL + plotR) / 2} y={H - 2} textAnchor="middle" fill="#5b615c" fontSize={10} fontWeight={700}>KPI →</text>
          <text x={12} y={(plotT + plotB) / 2} textAnchor="middle" fill="#5b615c" fontSize={10} fontWeight={700} transform={`rotate(-90 12 ${(plotT + plotB) / 2})`}>360° →</text>
        </svg>
      </div>
      <div className="mt-3 flex flex-wrap justify-center gap-x-4 gap-y-1.5">
        {PLAYER_BOXES.map((b) => (
          <span key={b.key} className="inline-flex items-center gap-1.5 text-xs text-ink-soft">
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: PLAYER_TONE[b.key].color, boxShadow: b.key === 'B_CULTURE' ? 'inset 0 0 0 1px #3b4a2e' : undefined }} /> {b.label}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ───────────────────────── TAB 2 — ANALISIS KPI ───────────────────────── */
function KpiTab({ rows, deptScores, monthly, deptMonthly, months, kpiStandard, yearLabel, yearMonthly, yearKpiAvg, prevLabel, prevKpiAvg, kpiMove }: { rows: Row[]; deptScores: [string, number][]; monthly: { ym: string; avg: number }[]; deptMonthly: DeptMonthRow[]; months: string[]; kpiStandard: number; yearLabel: number; yearMonthly: { ym: string; avg: number }[]; yearKpiAvg: number | null; prevLabel: string | null; prevKpiAvg: number | null; kpiMove: MoveBreakdown | null }) {
  // "KPI belum terbaca" dikecualikan dari semua metrik KPI (rerata, distribusi, ranking).
  const readable = rows.filter((r) => !r.kpiUnread);
  const unreadCount = rows.filter((r) => r.kpiUnread).length;
  const kpis = readable.map((r) => r.kpiAvg).filter((v): v is number => v != null);
  const avgKpi = mean(kpis);
  const pctOverStd = kpis.length ? (kpis.filter((s) => s >= kpiStandard).length / kpis.length) * 100 : 0;

  const ranked = readable.filter((r) => r.kpiAvg != null).sort((a, b) => (b.kpiAvg ?? 0) - (a.kpiAvg ?? 0));
  const topEmp = ranked[0] ?? null;             // KPI tertinggi (pegawai + skor)
  const lowEmp = ranked.length ? ranked[ranked.length - 1] : null; // KPI terendah
  const top = ranked.slice(0, 10);
  const low = [...ranked].reverse().slice(0, 10);
  const maxMonthly = Math.max(...monthly.map((m) => m.avg), 1);

  return (
    <div className="space-y-6">
      <SectionHeader label="Ringkasan KPI" hint="metrik utama capaian KPI" />

      {unreadCount > 0 && (
        <Note title="KPI belum terbaca">
          <strong>{unreadCount} pegawai</strong> baru mengisi 1 dari 3 bulan kuartal — dikecualikan dari rerata, distribusi, &amp; ranking KPI (belum menggambarkan kuartal, bukan berkinerja rendah).
        </Note>
      )}

      <SummaryBand
        lead={{ value: fmt2(avgKpi), label: 'Rerata KPI Organisasi',
          sub: <DeltaPill curr={avgKpi} prev={prevKpiAvg} prevLabel={prevLabel} move={kpiMove} /> }}
        items={[
          { value: topEmp?.kpiAvg != null ? fmt2(topEmp.kpiAvg) : '—', label: 'Skor KPI Tertinggi', sub: topEmp ? displayName(topEmp.nickname, topEmp.name) : undefined },
          { value: lowEmp?.kpiAvg != null ? fmt2(lowEmp.kpiAvg) : '—', label: 'Skor KPI Terendah', sub: lowEmp ? displayName(lowEmp.nickname, lowEmp.name) : undefined },
          { value: `${pctOverStd.toFixed(0)}%`, label: `KPI Di Atas Standar (≥${kpiStandard})` },
          { value: `${monthly.length} Bulan`, label: 'Siklus Penilaian Terpilih' },
        ]} />

      <SectionHeader label="Sebaran & Tren" hint="heatmap divisi×bulan · distribusi · tren tahunan" />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2"><KpiHeatmap deptMonthly={deptMonthly} months={months} /></div>
        <CategoryPie title="Distribusi Kategori KPI" subtitle="Komposisi pegawai per kelas capaian KPI"
          unit="KPI" values={readable.map((r) => r.kpiAvg).filter((v): v is number => v != null)} />
      </div>

      <Card title={`Tren KPI Bulanan ${yearLabel} (Jan–Des)`}>
        <YearTrendCaption value={yearKpiAvg} label={`Rerata KPI ${yearLabel}`} unit="org-level, ikut filter divisi" />
        <TrendLine points={yearMonthly.map((m) => ({ label: ymShort(m.ym), value: m.avg }))} />
      </Card>

      <SectionHeader label="Per Divisi & Bulan" hint="rincian divisi & perkembangan bulanan" />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card title="Rerata KPI Bulanan per Divisi">
          <ScoreBars items={deptScores.map(([dept, score]) => ({ label: dept, score }))} suffix=" / 100" empty="Belum ada data KPI." />
        </Card>

        <Card title="Perkembangan KPI Bulanan">
          <ScoreBars items={monthly.map((m) => ({ label: ymLabel(m.ym), score: m.avg }))} max={maxMonthly} empty="Tidak ada data bulan untuk periode ini." />
        </Card>
      </div>

      <SectionHeader label="Individu" hint="peringkat pegawai" />

      <LeaderboardToggle metric="Skor KPI" top={top} bottom={low} valueOf={(r) => r.kpiAvg} />
    </div>
  );
}

/* ───────────────────────── TAB 3 — ANALISIS 360 ───────────────────────── */
function FeedbackTab({ rows, aspectScores, deptAspect360, aspect360Names, has360, periodLabel, yearLabel, year360, year360Avg, prevLabel, prev360Avg, s360Move }: { rows: Row[]; aspectScores: { aspek: string; score: number }[]; deptAspect360: DeptAspectRow[]; aspect360Names: string[]; has360: boolean; periodLabel: string; yearLabel: number; year360: { label: string; avg: number }[]; year360Avg: number | null; prevLabel: string | null; prev360Avg: number | null; s360Move: MoveBreakdown | null }) {
  const s360s = rows.map((r) => r.s360).filter((v): v is number => v != null);
  const avg360 = mean(s360s);
  const assessed = s360s.length;
  const ranked = rows.filter((r) => r.s360 != null).sort((a, b) => (b.s360 ?? 0) - (a.s360 ?? 0));
  const top = ranked[0] ?? null;
  const low = ranked.length ? ranked[ranked.length - 1] : null;

  return (
    <div className="space-y-6">
      <SectionHeader label="Ringkasan 360°" hint="metrik utama umpan balik budaya" />
      {!has360 && (
        <Note title={`${periodLabel} tanpa Evaluasi 360°`}>
          Komponen 360° tidak aktif, sehingga Skor Akhir = 100% KPI. Data di bawah hanya muncul bila ada penilaian terkirim.
        </Note>
      )}

      <SummaryBand
        lead={{ value: fmt2(avg360), label: 'Rerata Skor 360° Organisasi',
          sub: <DeltaPill curr={avg360} prev={prev360Avg} prevLabel={prevLabel} move={s360Move} /> }}
        items={[
          { value: top ? fmt2(top.s360!) : '—', label: 'Skor 360° Tertinggi', sub: top ? displayName(top.nickname, top.name) : undefined },
          { value: low ? fmt2(low.s360!) : '—', label: 'Skor 360° Terendah', sub: low ? displayName(low.nickname, low.name) : undefined },
          { value: String(assessed), label: 'Pegawai Ternilai 360°' },
        ]} />

      <SectionHeader label="Sebaran, Tren & Aspek" hint="heatmap divisi×aspek · tren kuartal · sub-aspek" />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2"><Aspect360Heatmap deptAspect={deptAspect360} aspects={aspect360Names} /></div>
        <CategoryPie title="Distribusi Kategori 360°" subtitle="Komposisi pegawai per kelas skor 360°"
          unit="360°" values={s360s} />
      </div>

      {/* Tren 360° & Evaluasi Sub-Aspek — sejajar (berdampingan) di layar lebar. */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
        <Card title={`Tren 360° per Kuartal ${yearLabel}`}>
          <YearTrendCaption value={year360Avg} label={`Rerata 360° ${yearLabel}`} unit="org-level, ikut filter divisi · hanya kuartal ber-360°" />
          <TrendLine points={year360.map((q) => ({ label: q.label, value: q.avg }))} />
        </Card>

        <Card title="Evaluasi Budaya 360° (Rataan Sub-Aspek)">
          <ScoreBars items={aspectScores.map((a) => ({ label: a.aspek, score: a.score }))} suffix=" / 100" empty="Belum ada skor 360° terkirim." />
        </Card>
      </div>

      <SectionHeader label="Individu" hint="peringkat pegawai" />

      <LeaderboardToggle metric="Skor 360°" top={ranked.slice(0, 10)} bottom={[...ranked].reverse().slice(0, 10)} valueOf={(r) => r.s360} />
    </div>
  );
}

/* ───────────────────────── TAB 4 — TABEL ───────────────────────── */
const TABLE_PAGE = 5;
function TableTab({ rows, has360 }: { rows: Row[]; has360: boolean }) {
  const [q, setQ] = useState('');
  const [player, setPlayer] = useState<'all' | PlayerClass | 'UNREAD'>('all');
  const [page, setPage] = useState(0);
  // Keterangan Player SAMA dengan Kompilasi: KPI "belum terbaca" tak diklasifikasi (bukan A/B/C/HRD Review).
  const classOfRow = (r: Row): PlayerClass | 'UNREAD' | null => (r.kpiUnread ? 'UNREAD' : r.player);
  const shown = rows.filter((r) => {
    if (q.trim() && !`${r.name} ${r.nickname ?? ''} ${r.dept}`.toLowerCase().includes(q.toLowerCase())) return false;
    if (player !== 'all' && classOfRow(r) !== player) return false;
    return true;
  });
  // Reset ke halaman awal saat filter (cari/player) berubah agar tak "nyangkut" di halaman kosong —
  // dilakukan di handler perubahan filter (bukan effect, yang memicu render berantai).
  const pageCount = Math.max(1, Math.ceil(shown.length / TABLE_PAGE));
  const safePage = Math.min(page, pageCount - 1);
  const paged = shown.slice(safePage * TABLE_PAGE, safePage * TABLE_PAGE + TABLE_PAGE);
  return (
    <div className={CARD}>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          {/* font-sans = Geist (sama dengan pil sub-tab), bukan Montserrat judul — permintaan pengguna. */}
          <h3 className={`${CARD_TITLE} font-sans`}>Tabel Hasil Seluruh Pegawai</h3>
          <p className="text-xs text-ink-soft mt-0.5"><span className="font-mono">{rows.length}</span> pegawai</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <input value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} placeholder="Cari nama / divisi…" aria-label="Cari nama atau divisi"
            className="text-sm min-h-11 px-3 border border-line rounded-control w-52 bg-infarm-surface text-ink placeholder:text-ink-soft focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand-tint" />
          <select value={player} onChange={(e) => { setPlayer(e.target.value as typeof player); setPage(0); }} aria-label="Filter player"
            className="text-sm min-h-11 px-3 border border-line rounded-control bg-infarm-surface text-ink font-semibold focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand-tint">
            <option value="all">Semua Player</option>
            {PLAYER_BOXES.map((b) => <option key={b.key} value={b.key}>{b.label}</option>)}
            <option value="HRD_REVIEW">HRD Review</option>
            <option value="UNREAD">Belum Terbaca</option>
          </select>
        </div>
      </div>
      <StableHeight className="">
      <div className="overflow-x-auto">
        {/* table-fixed + colgroup: lebar kolom TETAP antar halaman/filter (tak bergeser saat paging). */}
        <table className="w-full table-fixed table-1line text-left text-sm min-w-[660px]">
          <colgroup>
            {colPercents([
              240, // Pegawai (+ chip nonaktif) + divisi
              110, // Rerata KPI
              140, // Trend KPI ("Belum terbaca")
              110, // Skor 360°
              130, // Skor Akhir (live)
              120, // Player ("B · Culture")
            ]).map((w, i) => <col key={i} style={{ width: w }} />)}
          </colgroup>
          <thead>
            <tr className="text-xs font-semibold text-ink-soft bg-infarm-surface">
              <th className="py-2.5 px-3 rounded-l-lg">Pegawai</th>
              <th className="py-2.5 px-3 text-center">Rerata KPI</th>
              <th className="py-2.5 px-3 text-center">Trend KPI</th>
              <th className="py-2.5 px-3 text-center">Skor 360°</th>
              <th className="py-2.5 px-3 text-center" title="Laporan Final → angka tersimpan; selain itu dihitung dari KPI + 360° periode ini">Skor Akhir</th>
              <th className="py-2.5 px-3 text-center rounded-r-lg">Player</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line-soft">
            {shown.length === 0 && <tr><td colSpan={6} className="py-6 text-center text-sm text-ink-soft">Tidak ada pegawai sesuai filter.</td></tr>}
            {paged.map((r) => {
              return (
                <tr key={r.id}>
                  <td className="py-3 px-3 break-words">
                    <span className="font-semibold text-ink block" title={r.name}>
                      {displayName(r.nickname, r.name)}
                      {r.isActive === false && (
                        <span className="ml-1.5 align-middle text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-neutral-tint text-ink-soft" title="Pegawai nonaktif (resign) — data periode ini tetap dihitung">nonaktif</span>
                      )}
                    </span>
                    <span className="text-xs text-ink-soft">{r.dept}</span>
                  </td>
                  <td className="py-3 px-3 text-center font-mono text-ink-soft">{r.kpiAvg != null ? fmt2(r.kpiAvg) : '—'}</td>
                  <td className="py-3 px-3 text-center"><TrendBadge t={r.trend} months={r.kpiMonths} /></td>
                  <td className="py-3 px-3 text-center font-mono text-ink-soft">{r.s360 != null ? fmt2(r.s360) : has360
                    ? <span className="text-xs font-semibold text-warn-ink font-sans" title={NO_SCORE_TITLE}>{NO_SCORE_LABEL}</span> : '—'}</td>
                  <td className="py-3 px-3 text-center font-mono font-bold text-brand">{r.final != null ? fmt2(r.final) : '—'}</td>
                  <td className="py-3 px-3 text-center">
                    {r.kpiUnread ? (
                      <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full border bg-neutral-tint text-ink-soft border-neutral-tint" title="KPI baru 1 dari 3 bulan kuartal terisi → tidak diklasifikasi">Belum Terbaca</span>
                    ) : r.player ? (
                      <span className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full border ${PLAYER_TONE[r.player].chip}`}>{PLAYER_BADGE[r.player]}</span>
                    ) : (
                      <span className="text-ink-faint text-xs">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {shown.length > TABLE_PAGE && (
        <div className="mt-auto pt-3 flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs text-ink-soft font-mono">{safePage * TABLE_PAGE + 1}–{Math.min(shown.length, safePage * TABLE_PAGE + paged.length)} / {shown.length} pegawai</span>
          <div className="flex items-center gap-2 shrink-0">
            <button type="button" disabled={safePage <= 0} onClick={() => setPage(safePage - 1)}
              className="text-sm font-semibold min-h-10 px-3.5 rounded-control bg-neutral-tint text-ink-soft hover:text-ink disabled:opacity-40 disabled:cursor-not-allowed">← Sebelumnya</button>
            <span className="text-xs text-ink-soft font-mono">Hal. {safePage + 1}/{pageCount}</span>
            <button type="button" disabled={safePage >= pageCount - 1} onClick={() => setPage(safePage + 1)}
              className="text-sm font-semibold min-h-10 px-3.5 rounded-control bg-neutral-tint text-ink-soft hover:text-ink disabled:opacity-40 disabled:cursor-not-allowed">Berikutnya →</button>
          </div>
        </div>
      )}
      </StableHeight>
      <p className="text-xs text-ink-soft mt-3">
        Skor Akhir = blend KPI+360 (50/50); laporan yang sudah Final memakai angka tersimpannya.
        Player (A/B/C) berbasis KPI × 360° (ambang 80); <strong>HRD Review</strong> = KPI atau Skor 360° kosong → tidak diklasifikasi otomatis;
        <strong> Belum Terbaca</strong> = KPI baru 1 dari 3 bulan kuartal terisi → tidak diklasifikasi (sama dengan Kompilasi).{!has360 && ' Periode tanpa 360° → semua pegawai berstatus HRD Review.'}
      </p>
    </div>
  );
}

/* ───────────────────────── Heatmap KPI / Divisi × Bulan ───────────────────────── */
/** Label bulan ringkas dari 'YYYY-MM' (mis. "Jan"). */
const ymShort = (ym: string) => MONTHS[Number(ym.split('-')[1]) - 1] ?? ym;

/** Keterangan ringkas di atas trendline: angka rerata tahun + konteks lingkup. */
function YearTrendCaption({ value, label, unit }: { value: number | null; label: string; unit: string }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 mb-3">
      <span className="text-2xl font-bold text-ink font-mono">{value != null ? fmt2(value) : '—'}</span>
      <span className="text-xs font-semibold text-ink-soft">{label}</span>
      <span className="text-xs text-ink-soft">· {unit}</span>
    </div>
  );
}

/**
 * Trendline SVG sederhana (garis + titik berlabel) — dipakai untuk tren tahunan KPI/360°.
 * Domain-y adaptif (min−/max+ dibulatkan ke 5, lebar minimal 10) agar variasi terlihat;
 * warna titik mengikuti palet skor terpadu (`heatColor`). Label di dalam SVG sengaja
 * dikecualikan dari audit kontras (lihat CLAUDE.md) — ukuran fixed agar grafik tak berdesakan.
 */
function TrendLine({ points }: { points: { label: string; value: number }[] }) {
  if (points.length === 0) return <p className="text-sm text-ink-soft italic">Belum ada data untuk tahun ini.</p>;
  const W = 640, H = 200, padL = 40, padR = 18, padT = 20, padB = 26;
  // Inset horizontal titik plot: jarak dari sumbu-Y (kiri) & tepi kanan agar titik data
  // pertama/terakhir + label nilainya tak menempel garis sumbu.
  const padInX = 15;
  const plotL = padL + padInX, plotR = W - padR - padInX;
  const vals = points.map((p) => p.value);
  let lo = Math.max(0, Math.floor((Math.min(...vals) - 4) / 5) * 5);
  let hi = Math.min(100, Math.ceil((Math.max(...vals) + 4) / 5) * 5);
  if (hi - lo < 10) { hi = Math.min(100, lo + 10); lo = Math.max(0, hi - 10); }
  const x = (i: number) => points.length === 1
    ? (plotL + plotR) / 2
    : plotL + (i * (plotR - plotL)) / (points.length - 1);
  const y = (v: number) => padT + (H - padT - padB) * (1 - (v - lo) / (hi - lo));
  const grid = [lo, (lo + hi) / 2, hi];
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(2)} ${y(p.value).toFixed(2)}`).join(' ');
  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[480px]" style={{ height: H }} preserveAspectRatio="xMidYMid meet">
        {grid.map((g) => (
          <g key={g}>
            <line x1={padL} y1={y(g)} x2={W - padR} y2={y(g)} stroke="#edefeb" strokeWidth={1} />
            <text x={padL - 5} y={y(g) + 3} textAnchor="end" fill="#5b615c" fontSize={10}>{g.toFixed(0)}</text>
          </g>
        ))}
        {/* Garis tren = hijau brand (seri utama Design System Infarm); titik = warna skor. */}
        <path d={path} fill="none" stroke="#00843b" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
        {points.map((p, i) => {
          const { bg } = heatColor(p.value);
          return (
            <g key={`${p.label}-${i}`}>
              <circle cx={x(i)} cy={y(p.value)} r={4.5} fill={bg} stroke="#fff" strokeWidth={1.5} />
              {/* Label titik TEPI dirata-kan ke dalam (pertama=start, terakhir=end) agar tak
                  menembus sumbu-Y kiri / tepi kanan. */}
              <text
                x={x(i) + (points.length > 1 && i === 0 ? 3 : points.length > 1 && i === points.length - 1 ? -3 : 0)}
                y={y(p.value) - 9}
                textAnchor={points.length > 1 && i === 0 ? 'start' : points.length > 1 && i === points.length - 1 ? 'end' : 'middle'}
                fill="#1b1f1c" fontSize={10} fontWeight={700}>{fmt2(p.value)}</text>
              <text
                x={x(i)} y={H - 8}
                textAnchor={points.length > 1 && i === 0 ? 'start' : points.length > 1 && i === points.length - 1 ? 'end' : 'middle'}
                fill="#5b615c" fontSize={10}>{p.label}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/**
 * Pie/donut distribusi pegawai per kelas capaian KPI (palet diskrit CAT_COLOR):
 *   ≥90 Melampaui (cokelat #6b4e3d) · 80–89 Memenuhi (hijau #388e3c) ·
 *   70–79 Perlu Peningkatan (kuning #ffc107) · <70 Di Bawah (merah #b71c1c).
 * Klasifikasi memakai rerata KPI pegawai (rows.kpiAvg), bukan Skor Akhir — selaras tab KPI.
 */
// Band skor 0–100 (dipakai donut KPI & 360°) — golongan = perfCategoryOf (ambang atas nilai TERBULAT,
// sama dengan laporan; rerata KPI mentah 79,996 = 80,00 → Memenuhi) & palet diskrit CAT_COLOR.
export const SCORE_CATS = [
  { key: 'exceed', label: 'Melampaui Ekspektasi', range: '≥ 90', color: CAT_COLOR.exceed, test: (v: number) => perfCategoryOf(v) === 'exceed' },
  { key: 'meet', label: 'Memenuhi Ekspektasi', range: '80–89', color: CAT_COLOR.meet, test: (v: number) => perfCategoryOf(v) === 'meet' },
  { key: 'improve', label: 'Perlu Peningkatan', range: '70–79', color: CAT_COLOR.improve, test: (v: number) => perfCategoryOf(v) === 'improve' },
  { key: 'below', label: 'Di Bawah Ekspektasi', range: '< 70', color: CAT_COLOR.below, test: (v: number) => perfCategoryOf(v) === 'below' },
] as const;

/** Donut distribusi pegawai per kelas skor (0–100). Dipakai untuk KPI & 360°. */
function CategoryPie({ title, subtitle, unit, values }: { title: string; subtitle: string; unit: string; values: number[] }) {
  const total = values.length;
  const counts = SCORE_CATS.map((c) => ({ ...c, n: values.filter((v) => c.test(v)).length }));
  const R = 52, SW = 22, C = 2 * Math.PI * R;
  // Posisi awal tiap irisan = jumlah panjang irisan sebelumnya (dihitung di muka, bukan dimutasi saat render).
  const segs = counts.filter((c) => c.n > 0).map((c) => ({ ...c, len: (c.n / total) * C }));
  const offsets = segs.map((_, i) => segs.slice(0, i).reduce((s, x) => s + x.len, 0));
  return (
    <div className={`${CARD} flex flex-col`}>
      <h3 className={CARD_TITLE}>{title}</h3>
      <p className="text-xs text-ink-soft mt-1 mb-4">{subtitle}</p>
      {total === 0 ? (
        <p className="text-sm text-ink-soft italic">Belum ada data.</p>
      ) : (
        <div className="flex flex-col items-center gap-4">
          <svg viewBox="0 0 140 140" className="w-40 h-40 shrink-0">
            <g transform="rotate(-90 70 70)">
              {segs.map((c, i) => (
                <circle key={c.key} cx={70} cy={70} r={R} fill="none" stroke={c.color}
                  strokeWidth={SW} strokeDasharray={`${fmt2(c.len)} ${(C - c.len).toFixed(2)}`} strokeDashoffset={-offsets[i]} />
              ))}
            </g>
            <text x={70} y={68} textAnchor="middle" fill="#1b1f1c" fontSize={26} fontWeight={700} style={{ fontFamily: 'var(--font-mono)' }}>{total}</text>
            <text x={70} y={86} textAnchor="middle" fill="#5b615c" fontSize={10}>pegawai</text>
          </svg>
          <div className="w-full space-y-2">
            {counts.map((c) => (
              <div key={c.key} className="flex items-center gap-2 text-[13px]">
                <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: c.color }} />
                <span className="font-medium text-ink flex-1 leading-tight">{c.label}
                  <span className="text-ink-soft font-normal"> · {unit} {c.range}</span></span>
                <span className="font-mono font-bold text-ink">{c.n}</span>
                <span className="font-mono text-ink-soft w-9 text-right">{((c.n / total) * 100).toFixed(0)}%</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function KpiHeatmap({ deptMonthly, months }: { deptMonthly: DeptMonthRow[]; months: string[] }) {
  if (deptMonthly.length === 0 || months.length === 0) {
    return (
      <div className={CARD}>
        <h3 className={`${CARD_TITLE} mb-1`}>Capaian KPI / Divisi</h3>
        <p className="text-sm text-ink-soft italic mt-2">Belum ada data KPI bulanan untuk lingkup ini.</p>
      </div>
    );
  }
  return (
    <div className={CARD}>
      <div className="flex flex-wrap items-end justify-between gap-2 mb-4">
        <div>
          <h3 className={CARD_TITLE}>Capaian KPI / Divisi</h3>
          <p className="text-xs text-ink-soft mt-1">Rerata skor KPI per divisi per bulan</p>
        </div>
        <div className="flex items-center gap-1.5 text-xs font-semibold text-ink-soft">
          <span>Rendah</span>
          <span className="h-2.5 w-32 rounded-full" style={{ background: HEAT_LEGEND_GRADIENT }} />
          <span>Tinggi</span>
        </div>
      </div>
      <div className="overflow-x-auto">
        {/* table-fixed: kolom Divisi lebar tetap, kolom data berbagi rata — tak bergeser saat filter berubah. */}
        <table className="w-full table-fixed border-separate border-spacing-1 text-xs" style={{ minWidth: Math.max(440, Math.round((160 + months.length * 84) * 0.78)) }}>
          <colgroup>
            {colPercents([
              160, // Divisi
              ...months.map(() => 84), // tiap bulan (berbagi rata)
            ]).map((w, i) => <col key={i} style={{ width: w }} />)}
          </colgroup>
          <thead>
            <tr>
              <th className="text-left py-2 px-3 text-xs font-semibold text-ink-soft sticky left-0 bg-surface">Divisi</th>
              {months.map((ym) => (
                <th key={ym} className="text-center py-2 px-2 text-xs font-semibold text-ink-soft whitespace-nowrap">{ymLabel(ym)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {deptMonthly.map((row) => (
              <tr key={row.dept}>
                <td className="py-2 px-3 font-medium text-ink break-words sticky left-0 bg-surface">{row.dept}</td>
                {row.cells.map((c) => {
                  const { bg, fg } = heatColor(c.avg);
                  return (
                    <td key={c.ym} className="text-center font-mono font-semibold text-[13px] rounded-lg py-3 px-2"
                      style={{ backgroundColor: bg, color: fg }}
                      title={`${row.dept} · ${ymLabel(c.ym)} · ${c.avg != null ? fmt2(c.avg) : 'tanpa data'}`}>
                      {c.avg != null ? fmt2(c.avg) : '—'}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-ink-soft mt-3">Sel = rerata KPI seluruh pegawai divisi pada bulan itu (filter divisi aktif). &ldquo;—&rdquo; = belum ada input KPI.</p>
    </div>
  );
}

/** Heatmap 360°: Divisi × Aspek budaya. Sel = skor 0–100 (rerata rating ×20) semua penilaian
 *  (Self dikecualikan) terhadap pegawai divisi itu — skala 100 selaras heatmap KPI. */
function Aspect360Heatmap({ deptAspect, aspects }: { deptAspect: DeptAspectRow[]; aspects: string[] }) {
  if (deptAspect.length === 0 || aspects.length === 0) {
    return (
      <div className={CARD}>
        <h3 className={`${CARD_TITLE} mb-1`}>Capaian 360° / Divisi × Aspek</h3>
        <p className="text-sm text-ink-soft italic mt-2">Belum ada penilaian 360° terkirim untuk lingkup ini.</p>
      </div>
    );
  }
  return (
    <div className={CARD}>
      <div className="flex flex-wrap items-end justify-between gap-2 mb-4">
        <div>
          <h3 className={CARD_TITLE}>Capaian 360° / Divisi × Aspek</h3>
          <p className="text-xs text-ink-soft mt-1">Skor aspek budaya terbobot (skala 100) per divisi</p>
        </div>
        <div className="flex items-center gap-1.5 text-xs font-semibold text-ink-soft">
          <span>Rendah</span>
          <span className="h-2.5 w-32 rounded-full" style={{ background: HEAT_LEGEND_GRADIENT }} />
          <span>Tinggi</span>
        </div>
      </div>
      <div className="overflow-x-auto">
        {/* table-fixed: kolom Divisi lebar tetap, kolom data berbagi rata — tak bergeser saat filter berubah. */}
        <table className="w-full table-fixed border-separate border-spacing-1 text-xs" style={{ minWidth: Math.max(440, Math.round((160 + aspects.length * 84) * 0.78)) }}>
          <colgroup>
            {colPercents([
              160, // Divisi
              ...aspects.map(() => 84), // tiap aspek (berbagi rata)
            ]).map((w, i) => <col key={i} style={{ width: w }} />)}
          </colgroup>
          <thead>
            <tr>
              <th className="text-left py-2 px-3 text-xs font-semibold text-ink-soft sticky left-0 bg-surface">Divisi</th>
              {aspects.map((a) => (
                <th key={a} className="text-center py-2 px-2 text-xs font-semibold text-ink-soft whitespace-normal break-words leading-tight">{a}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {deptAspect.map((row) => (
              <tr key={row.dept}>
                <td className="py-2 px-3 font-medium text-ink break-words sticky left-0 bg-surface">{row.dept}</td>
                {row.cells.map((c) => {
                  const { bg, fg } = heatColor(c.avg);
                  return (
                    <td key={c.aspect} className="text-center font-mono font-semibold text-[13px] rounded-lg py-3 px-2"
                      style={{ backgroundColor: bg, color: fg }}
                      title={`${row.dept} · ${c.aspect} · ${c.avg != null ? fmt2(c.avg) : 'tanpa data'}`}>
                      {c.avg != null ? fmt2(c.avg) : '—'}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-ink-soft mt-3">Sel = skor aspek 0–100 <strong>terbobot per kelas penilai</strong> (skema bobot aktif, mis. Atasan/Peer/Cross/Bawahan; Self dikecualikan) — selaras Skor 360° resmi. Lingkup filter divisi aktif. &ldquo;—&rdquo; = belum ada penilaian.</p>
    </div>
  );
}

/* ───────────────────────── Komponen bersama ───────────────────────── */
/** Bar berlabel + hitung (Distribusi Kategori Kinerja & Rencana Tindak Lanjut). */
function CountBars({ items, denom }: { items: { label: string; count: number; color: string }[]; denom: number }) {
  const max = Math.max(...items.map((c) => c.count), 1);
  return (
    <div className="space-y-4">
      {items.map((it, idx) => (
        <div key={it.label} className="space-y-1.5">
          <div className="flex justify-between gap-3 text-[13px]">
            <span className="font-medium text-ink-soft">{it.label}</span>
            <span className="font-mono text-ink whitespace-nowrap"><b>{it.count}</b> <span className="text-ink-soft">· {((it.count / denom) * 100).toFixed(2)}%</span></span>
          </div>
          <div className="h-2.5 bg-neutral-tint rounded-full overflow-hidden">
            <motion.div initial={{ width: 0 }} animate={{ width: `${(it.count / max) * 100}%` }}
              transition={{ duration: 0.8, delay: idx * 0.1 }} style={{ backgroundColor: it.color }}
              className="h-full rounded-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Bar skor 0–100 berlabel (divisi / aspek / bulan): pil angka + batang berwarna gradasi skor
 * (heatColorInfarm). `max` = skala lebar batang (default 100; Perkembangan Bulanan memakai nilai maks).
 */
function ScoreBars({ items, suffix = '', empty, max = 100 }: { items: { label: string; score: number }[]; suffix?: string; empty: string; max?: number }) {
  if (items.length === 0) return <p className="text-sm text-ink-soft italic">{empty}</p>;
  return (
    <div className="space-y-4">
      {items.map((it, i) => {
        const hc = heatColor(it.score);
        return (
          <div key={it.label} className="space-y-1.5">
            <div className="flex justify-between items-center gap-3 text-[13px]">
              <span className="font-medium text-ink-soft">{it.label}</span>
              <span className="font-mono font-semibold text-xs px-2.5 py-0.5 rounded-full whitespace-nowrap" style={{ backgroundColor: hc.bg, color: hc.fg }}>{fmt2(it.score)}{suffix}</span>
            </div>
            <div className="h-2.5 bg-neutral-tint rounded-full overflow-hidden">
              <motion.div initial={{ width: 0 }} animate={{ width: `${Math.min((it.score / max) * 100, 100)}%` }}
                transition={{ duration: 0.8, delay: i * 0.08 }} className="h-full rounded-full" style={{ backgroundColor: hc.bg }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className={CARD}>
      <h3 className={`${CARD_TITLE} mb-4`}>{title}</h3>
      {children}
    </div>
  );
}

// Warna badge dari golongan nilai TERBULAT — sama dengan labelnya (perfLabelOf), tak bisa tak cocok.
// Selaras palet CAT_COLOR: Melampaui cokelat · Memenuhi hijau · Perlu Peningkatan kuning · Di Bawah merah.
const BAND_BADGE_CLS = {
  exceed: 'bg-infarm-cream text-infarm-soil border-infarm-cream',
  meet: 'bg-brand-tint text-brand-ink border-brand-tint',
  improve: 'bg-warn-tint text-warn-ink border-warn-tint',
  below: 'bg-danger-tint text-danger-ink border-danger-tint',
} as const;
export function bandBadgeClass(v: number | null): string | null {
  const c = perfCategoryOf(v);
  return c ? BAND_BADGE_CLS[c] : null;
}

function bandBadge(v: number | null) {
  const cls = bandBadgeClass(v);
  if (v == null || cls == null) return null;
  return <span className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full border ${cls}`}>{perfLabelOf(v)}</span>;
}

/** Baris-baris peringkat (tanpa kartu pembungkus). `startIndex` = offset peringkat absolut
 *  (agar #6–#10 tetap benar saat paginasi 5/halaman, bukan reset ke #1 tiap halaman).
 *  Sisi Terbawah: lingkaran peringkat merah lembut agar terbaca sebagai prioritas coaching. */
function LeaderboardRows({ items, valueOf, bottom, startIndex = 0 }: { items: Row[]; valueOf: (r: Row) => number | null; bottom: boolean; startIndex?: number }) {
  return (
    <div>
      {items.length === 0 && <p className="text-sm text-ink-soft italic">Belum ada data.</p>}
      {items.map((e, idx) => {
        const v = valueOf(e);
        const rank = startIndex + idx + 1;
        const rankCls = bottom ? 'bg-danger-tint text-danger-ink border-danger-tint'
          : rank <= 3 ? 'bg-brand text-white border-brand' : 'bg-infarm-surface text-brand-ink border-infarm-light';
        return (
          <div key={e.id} className="py-2.5 border-b border-line-soft last:border-b-0 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <span className={`font-mono text-xs font-bold w-7 h-7 rounded-full border flex items-center justify-center shrink-0 ${rankCls}`}>{rank}</span>
              <div className="min-w-0"><span className="font-semibold text-ink text-sm block truncate" title={e.name}>{displayName(e.nickname, e.name)}</span><span className="text-xs text-ink-soft block">{e.dept}</span></div>
            </div>
            <div className="flex items-center gap-2.5 shrink-0">
              <span className="font-mono font-bold text-sm text-ink">{v != null ? fmt2(v) : '—'}</span>
              {bandBadge(v)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Peringkat SATU kartu dengan toggle Teratas ↔ Terbawah (menggantikan pasangan berdampingan).
 * Default "Teratas". Toggle = pil bersegmen (aktif hijau brand).
 */
function LeaderboardToggle({ metric, top, bottom, valueOf }: {
  metric: string; top: Row[]; bottom: Row[]; valueOf: (r: Row) => number | null;
}) {
  const [side, setSide] = useState<'top' | 'bottom'>('top');
  const isTop = side === 'top';
  // Tampil 5/halaman + tombol Sebelumnya/Berikutnya (klik "selanjutnya" utk peringkat #6–#10).
  const { page, setPage, pageCount, shown, total, rangeFrom, rangeTo } = usePager(isTop ? top : bottom);
  const seg = (active: boolean) => `px-4 min-h-9 rounded-full text-[13px] font-semibold transition-colors ${active ? 'bg-brand text-white' : 'text-ink-soft hover:text-ink'}`;
  return (
    <div className={`${CARD} space-y-3`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className={CARD_TITLE}>{metric} {isTop ? 'Tertinggi' : 'Terendah'}</h3>
          <p className="text-xs text-ink-soft mt-0.5">
            Pegawai dengan {metric} {isTop ? 'tertinggi.' : 'terendah (prioritas mentoring/coaching).'}
          </p>
        </div>
        <div className="inline-flex gap-0.5 p-[3px] rounded-full border border-line bg-infarm-surface shrink-0" role="tablist" aria-label={`Pilih tampilan ${metric}`}>
          <button type="button" role="tab" aria-selected={isTop} onClick={() => { setSide('top'); setPage(0); }} className={seg(isTop)}>Teratas</button>
          <button type="button" role="tab" aria-selected={!isTop} onClick={() => { setSide('bottom'); setPage(0); }} className={seg(!isTop)}>Terbawah</button>
        </div>
      </div>
      <StableHeight>
        <LeaderboardRows items={shown} valueOf={valueOf} bottom={!isTop} startIndex={rangeFrom > 0 ? rangeFrom - 1 : 0} />
        <Pager page={page} pageCount={pageCount} setPage={setPage} total={total} rangeFrom={rangeFrom} rangeTo={rangeTo} unit="pegawai" />
      </StableHeight>
    </div>
  );
}
