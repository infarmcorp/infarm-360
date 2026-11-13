'use client';

import { useState } from 'react';
import { fmt2, NO_SCORE_LABEL, NO_SCORE_TITLE } from '@/lib/scoring';

import { Award, Download, Gauge, MessageSquareText, Radar as RadarIcon, Users, type LucideIcon } from 'lucide-react';
import type { ReportData } from '@/lib/report';
import { CARD, CardTitle, Note } from '@/components/infarm-ui';

const RELATION_LABEL: Record<string, string> = {
  Atasan: 'Atasan', Peer: 'Rekan Sejawat', Cross: 'Lintas Divisi', Bawahan: 'Bawahan', Self: 'Evaluasi Diri',
};

/** Kartu dokumen (Design System Infarm) — bayangan dimatikan saat cetak. */
const DOC_CARD = `${CARD} print:shadow-none`;

/** Dokumen Laporan rinci: radar aspek, ringkasan skor, komentar mentah per penilai.
 * `anonymize`=true (pegawai melihat laporannya sendiri) menyamarkan nama penilai.
 * `pdfFolder` (Laporan Hasil Saya): "Unduh PDF" membuka Folder Laporan Drive pegawai, bukan mencetak;
 * url null → pesan "PDF belum tersedia". Tanpa prop ini tombol tetap mencetak (HRD/SPV/Direksi). */
export function ReportDoc({ data, anonymize, hideAssessorComments, hidePrint, pdfFolder }: { data: ReportData; anonymize: boolean; hideAssessorComments?: boolean; hidePrint?: boolean; pdfFolder?: { url: string | null } }) {
  const aspectsWith = data.aspects.filter((a) => a.score != null);
  const [noPdf, setNoPdf] = useState(false);
  const btnCls = 'shrink-0 inline-flex items-center gap-1.5 text-[13px] font-bold min-h-9 px-4 rounded-control bg-brand hover:bg-brand-ink text-white';
  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3 no-print">
        <div className="min-w-0">
          <h1 className="text-[22px] leading-tight font-bold tracking-[-0.01em] text-ink">Dokumen Laporan Kinerja</h1>
          <p className="text-[13px] text-ink-soft mt-1.5">{data.emp.name} · {data.emp.dept} · {data.periodLabel}</p>
        </div>
        {!hidePrint && (pdfFolder ? (
          pdfFolder.url ? (
            <a href={pdfFolder.url} target="_blank" rel="noopener noreferrer" className={btnCls}>
              <Download className="w-4 h-4" /> Unduh PDF
            </a>
          ) : (
            <button type="button" onClick={() => setNoPdf(true)} className={btnCls}>
              <Download className="w-4 h-4" /> Unduh PDF
            </button>
          )
        ) : (
          <button type="button" onClick={() => window.print()} className={btnCls}>
            <Download className="w-4 h-4" /> Unduh PDF
          </button>
        ))}
      </div>
      {noPdf && (
        <div className="no-print mt-3"><Note tone="warn">PDF belum tersedia, hubungi HRD.</Note></div>
      )}

      {/* Kop cetak (hanya saat print) */}
      <div className="hidden print:block mb-4">
        <h1 className="text-lg font-black text-ink">Laporan Kinerja 360° — Infarm</h1>
        <p className="text-xs text-ink-soft">{data.emp.name} · {data.emp.dept} · Periode {data.periodLabel}</p>
      </div>

      {/* Ringkasan skor — kartu terpisah berikon; hanya Skor Akhir yang hijau (angka utama). */}
      <div className="grid grid-cols-1 sm:grid-cols-3 print:grid-cols-3 gap-4 print:gap-3 mt-4">
        <ScoreCard label="Rerata KPI" value={data.kpiAvg} icon={Gauge} />
        <ScoreCard label="Evaluasi 360°" value={data.has360 ? data.s360 : null} icon={Users} noScore={data.has360} />
        <ScoreCard label="Skor Akhir" value={data.finalScore} icon={Award} lead />
      </div>
      {data.has360 && data.latePenalty360 > 0 && data.s360 != null && (
        <p className="text-xs text-warn-ink mt-2">Evaluasi 360° termasuk potongan keterlambatan menilai −{fmt2(data.latePenalty360)}.</p>
      )}

      {/* Radar aspek 360 */}
      {data.has360 && aspectsWith.length >= 3 && (
        <div className={`${DOC_CARD} mt-4 break-inside-avoid @container`}>
          <CardTitle icon={RadarIcon}>Rincian Aspek Budaya (360°)</CardTitle>
          {/* Dua kolom bila KARTU ≥ 42rem (container query) — juga rapi di kolom kiri tinjau dua kolom. */}
          <div className="mt-3 grid @2xl:grid-cols-2 print:grid-cols-2 gap-4 items-center">
            <div className="break-inside-avoid">
              <Radar aspects={data.aspects} />
              {/* Legenda radar — perjelas mana garis Rekan vs Self */}
              <div className="flex items-center justify-center gap-4 mt-2 text-xs">
                <span className="flex items-center gap-1.5">
                  <svg width="22" height="6"><line x1="0" y1="3" x2="22" y2="3" stroke="#00843b" strokeWidth="2.5" /></svg>
                  <span className="font-bold text-brand-ink">Penilaian Rekan</span>
                </span>
                <span className="flex items-center gap-1.5">
                  {/* Oranye solid (--color-warn) — sengaja lebih kontras dari warn-ink agar garis
                      "Evaluasi Diri" langsung terbaca berbeda dari garis hijau "Rekan" (keputusan pemilik). */}
                  <svg width="22" height="6"><line x1="0" y1="3" x2="22" y2="3" stroke="#F08C00" strokeWidth="2.5" strokeDasharray="6,3" /></svg>
                  <span className="font-bold text-warn-ink">Evaluasi Diri</span>
                </span>
              </div>
            </div>
            <div className="space-y-2.5">
              <p className="text-xs text-ink-soft">Nomor sesuai radar</p>
              {data.aspects.map((a, idx) => (
                <div key={a.name} className="space-y-1">
                  <span className="text-[13px] text-ink font-medium">
                    <span className="inline-flex items-center justify-center w-5 h-5 mr-1.5 rounded-full bg-brand-tint text-brand-ink text-[10px] font-bold align-middle data-value">{idx + 1}</span>
                    {a.name}
                  </span>
                  {/* Bar Rekan (gabungan penilai, Self dikecualikan) */}
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-bold text-brand-ink w-11 shrink-0">Rekan</span>
                    <div className="flex-1 h-2 bg-neutral-tint rounded-full overflow-hidden">
                      <div className="h-full bg-brand rounded-full" style={{ width: `${Math.min(a.score ?? 0, 100)}%` }} />
                    </div>
                    <span className="text-xs data-value font-bold text-brand-ink w-12 text-right">{a.score != null ? fmt2(a.score) : '—'}</span>
                  </div>
                  {/* Bar Diri (evaluasi diri) — pembanding, oranye #F08C00 (--color-warn) */}
                  {a.self != null && (
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-bold text-warn-ink w-11 shrink-0">Diri</span>
                      <div className="flex-1 h-2 bg-neutral-tint rounded-full overflow-hidden">
                        <div className="h-full bg-warn rounded-full" style={{ width: `${Math.min(a.self, 100)}%` }} />
                      </div>
                      <span className="text-xs data-value font-bold text-warn-ink w-12 text-right">{fmt2(a.self)}</span>
                    </div>
                  )}
                </div>
              ))}
              <p className="text-xs text-ink-soft">
                Batang <span className="text-brand-ink font-bold">Rekan</span> = gabungan penilai tanpa evaluasi diri; batang <span className="text-warn-ink font-bold">Diri</span> = evaluasi diri sebagai pembanding.
              </p>
            </div>
          </div>
        </div>
      )}
      {!data.has360 && (
        <div className="mt-4">
          <Note tone="warn">Periode ini tanpa Evaluasi 360°, jadi radar dan komentar perilaku tidak ditampilkan. Skor Akhir = 100% KPI.</Note>
        </div>
      )}

      {/* Komentar mentah per penilai */}
      {!hideAssessorComments && data.has360 && data.assessors.length > 0 && (
        <div className={`${DOC_CARD} mt-4`}>
          <CardTitle icon={MessageSquareText}>Rincian Komentar {anonymize ? '(Anonim)' : 'per Penilai'}</CardTitle>
          <div className="space-y-3 mt-3">
            {data.assessors.map((b, i) => (
              <div key={b.assessorId + i} className="border border-line rounded-control bg-infarm-surface print:bg-white p-3 break-inside-avoid">
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-[13px] font-bold text-ink">
                    {anonymize ? (RELATION_LABEL[b.relation] ?? b.relation) : b.assessorName}
                  </span>
                  {b.isSelf && <span className="text-[10px] font-bold bg-warn-tint text-warn-ink px-1.5 py-0.5 rounded-full">Diri Sendiri</span>}
                  {!anonymize && <span className="text-xs text-ink-soft">· {RELATION_LABEL[b.relation] ?? b.relation}</span>}
                </div>
                {b.answers.map((a, j) => (
                  <div key={j} className="mb-1.5">
                    <p className="text-xs text-ink-soft font-semibold">{a.question}</p>
                    <p className="text-[13px] text-ink">{a.answer}</p>
                  </div>
                ))}
                {b.comments.map((c, j) => (
                  <div key={`c${j}`} className="mb-1 flex gap-2">
                    <span className="text-xs text-ink-soft shrink-0">{c.indicator}{c.rating != null ? ` (${c.rating})` : ''}:</span>
                    <span className="text-[13px] text-ink">{c.comment}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
      {!hideAssessorComments && data.has360 && data.assessors.length === 0 && (
        <p className="mt-4 text-[13px] text-ink-soft">Belum ada komentar dari penilai.</p>
      )}

      <p className="text-xs text-ink-faint mt-6 print:mt-10">
        Dicetak dari Infarm 360° Performance Appraisal · {data.periodLabel} · Skor Akhir kalibrasi.
      </p>
    </div>
  );
}

/** Kartu skor bergaya StatCard Design System Infarm (ikon + angka mono). `lead` (Skor Akhir) = hijau brand —
 * saat cetak kembali putih bergaris (warna latar tak dijamin ikut tercetak). `noScore`: nilai kosong ditampilkan
 * sebagai "No Score" (BR-09, Skor 360° periode ber-360°), bukan "—". */
function ScoreCard({ label, value, icon: Icon, lead, noScore }: { label: string; value: number | null; icon: LucideIcon; lead?: boolean; noScore?: boolean }) {
  const box = lead
    ? 'bg-brand text-white border border-brand print:bg-white print:text-ink print:border-line'
    : 'bg-surface text-ink border border-line';
  const tile = lead ? 'bg-white/15 print:bg-brand-tint print:text-brand-ink' : 'bg-brand-tint text-brand-ink';
  const sub = lead ? 'text-white print:text-ink-soft' : 'text-ink-soft';
  return (
    <div className={`${box} rounded-card shadow-card print:shadow-none p-4 flex items-center gap-3 min-w-0 break-inside-avoid`}>
      <span className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${tile}`} aria-hidden><Icon className="w-5 h-5" /></span>
      <div className="min-w-0 flex flex-col gap-0.5">
        {value == null && noScore
          ? <span className="font-bold text-warn-ink text-lg leading-tight" title={NO_SCORE_TITLE}>{NO_SCORE_LABEL}<span className="block text-xs font-semibold text-ink-soft">Insufficient Data</span></span>
          : <span className={`data-value font-bold leading-tight ${lead ? 'text-xl' : 'text-lg'}`}>{value != null ? fmt2(value) : '—'}</span>}
        <span className={`text-[13px] font-semibold ${sub}`}>{label}</span>
      </div>
    </div>
  );
}

/** Radar (poligon) aspek: garis penuh = others, putus-putus = self. */
function Radar({ aspects }: { aspects: ReportData['aspects'] }) {
  const n = aspects.length;
  const cx = 150, cy = 140, R = 100;
  const pt = (i: number, val: number) => {
    const ang = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    const r = (Math.max(0, Math.min(val, 100)) / 100) * R;
    return [cx + r * Math.cos(ang), cy + r * Math.sin(ang)] as const;
  };
  const axis = (i: number) => {
    const ang = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    return [cx + R * Math.cos(ang), cy + R * Math.sin(ang)] as const;
  };
  const poly = (key: 'score' | 'self') =>
    aspects.map((a, i) => pt(i, a[key] ?? 0).join(',')).join(' ');
  const hasSelf = aspects.some((a) => a.self != null);

  return (
    <svg viewBox="0 0 300 300" className="w-full max-w-[320px] mx-auto">
      {[0.25, 0.5, 0.75, 1].map((f) => (
        <polygon key={f}
          points={aspects.map((_, i) => { const [x, y] = axis(i); return `${cx + (x - cx) * f},${cy + (y - cy) * f}`; }).join(' ')}
          fill="none" stroke="#E4E6E2" strokeWidth="1" />
      ))}
      {aspects.map((_, i) => { const [x, y] = axis(i); return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="#E4E6E2" strokeWidth="1" />; })}
      {/* Garis "Evaluasi Diri" — oranye terang (--color-warn #F08C00) + garis lebih tebal & putus-
          putus lebih panjang, agar jelas beda dari garis hijau "Rekan" sekalipun keduanya bertumpuk. */}
      {hasSelf && <polygon points={poly('self')} fill="rgba(240,140,0,0.14)" stroke="#F08C00" strokeWidth="2.5" strokeDasharray="6,3" strokeLinejoin="round" />}
      {/* Hex diselaraskan dengan --color-brand (#00843b) di globals.css — SVG tak bisa memakai
          utilitas Tailwind, jadi bila token brand berubah, nilai di sini ikut diubah manual. */}
      <polygon points={poly('score')} fill="rgba(0,132,59,0.16)" stroke="#00843b" strokeWidth="2" />
      {/* Label sumbu = NOMOR aspek (1..n) agar nama panjang/serupa tak terpotong & tak tumpang-tindih.
          Nama lengkap tiap nomor ada di panel "Rincian Aspek Budaya" di sebelahnya. */}
      {aspects.map((_, i) => {
        const [x, y] = axis(i);
        const lx = cx + (x - cx) * 1.16, ly = cy + (y - cy) * 1.16;
        return (
          <g key={i}>
            <circle cx={lx} cy={ly} r="8.5" fill="#E4F3E9" stroke="#C9CEC7" strokeWidth="1" />
            <text x={lx} y={ly} textAnchor="middle" dominantBaseline="central" className="fill-brand-ink text-[9px] font-bold">{i + 1}</text>
          </g>
        );
      })}
    </svg>
  );
}
