'use client';

import { Download } from 'lucide-react';
import type { ReportData } from '@/lib/report';

const RELATION_LABEL: Record<string, string> = {
  Atasan: 'Atasan', Peer: 'Rekan Sejawat', Cross: 'Lintas Unit', Bawahan: 'Bawahan', Self: 'Evaluasi Diri',
};

/** Dokumen Laporan rinci: radar aspek, ringkasan skor, komentar mentah per penilai.
 * `anonymize`=true (pegawai melihat laporannya sendiri) menyamarkan nama penilai. */
export function ReportDoc({ data, anonymize, hideAssessorComments, hidePrint }: { data: ReportData; anonymize: boolean; hideAssessorComments?: boolean; hidePrint?: boolean }) {
  const aspectsWith = data.aspects.filter((a) => a.score != null);
  return (
    <div>
      <div className="flex items-start justify-between gap-3 no-print">
        <div>
          <h1 className="text-xl font-bold text-ink">Dokumen Laporan Kinerja</h1>
          <p className="text-sm text-ink-soft">{data.emp.name} · {data.emp.dept} · {data.periodLabel}</p>
        </div>
        {!hidePrint && (
          <button
            type="button"
            onClick={() => window.print()}
            className="shrink-0 inline-flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-control bg-brand hover:bg-brand-ink text-white"
          >
            <Download className="w-3.5 h-3.5" /> Unduh PDF
          </button>
        )}
      </div>

      {/* Kop cetak (hanya saat print) */}
      <div className="hidden print:block mb-4">
        <h1 className="text-lg font-black text-ink">Laporan Kinerja 360° — Infarm</h1>
        <p className="text-xs text-ink-soft">{data.emp.name} · {data.emp.dept} · Periode {data.periodLabel}</p>
      </div>

      {/* Ringkasan skor */}
      <div className="grid grid-cols-3 gap-3 mt-4">
        <ScoreCard label="Rerata KPI" value={data.kpiAvg} color="text-brand-ink" />
        <ScoreCard label="Evaluasi 360°" value={data.has360 ? data.s360 : null} color="text-brand-ink" />
        <ScoreCard label="Skor Akhir" value={data.finalScore} color="text-ink" big />
      </div>
      {data.penalty > 0 && (
        <p className="text-[11px] text-danger-ink mt-2">Termasuk pengurangan punishment kepatuhan −{data.penalty.toFixed(2)}.</p>
      )}

      {/* Radar aspek 360 */}
      {data.has360 && aspectsWith.length >= 3 && (
        <div className="mt-6 grid md:grid-cols-2 gap-4 items-center">
          <div className="break-inside-avoid">
            <Radar aspects={data.aspects} />
            {/* Legenda radar — perjelas mana garis Rekan vs Self */}
            <div className="flex items-center justify-center gap-4 mt-2 text-[10px]">
              <span className="flex items-center gap-1.5">
                <svg width="22" height="6"><line x1="0" y1="3" x2="22" y2="3" stroke="#33604A" strokeWidth="2.5" /></svg>
                <span className="font-bold text-brand-ink">Penilaian Rekan</span>
              </span>
              <span className="flex items-center gap-1.5">
                {/* Oranye solid (--color-warn) — sengaja lebih kontras dari warn-ink agar garis
                    "Evaluasi Diri" langsung terbaca berbeda dari garis hijau "Rekan". */}
                <svg width="22" height="6"><line x1="0" y1="3" x2="22" y2="3" stroke="#D97008" strokeWidth="2.5" strokeDasharray="4,3" /></svg>
                <span className="font-bold text-warn-ink">Evaluasi Diri (Self)</span>
              </span>
            </div>
          </div>
          <div className="space-y-2.5">
            <h3 className="text-sm font-bold text-ink">
              Rincian Aspek Budaya (360°) <span className="text-[10px] font-normal text-ink-faint">— nomor sesuai radar</span>
            </h3>
            {data.aspects.map((a, idx) => (
              <div key={a.name} className="space-y-1">
                <span className="text-xs text-ink-soft font-medium">
                  <span className="inline-flex items-center justify-center w-4 h-4 mr-1.5 rounded-full bg-brand-tint text-brand-ink text-[9px] font-bold align-middle data-value">{idx + 1}</span>
                  {a.name}
                </span>
                {/* Bar Rekan (gabungan penilai, Self dikecualikan) */}
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-bold text-brand-ink w-9 shrink-0">Rekan</span>
                  <div className="flex-1 h-2 bg-neutral-tint rounded-full overflow-hidden">
                    <div className="h-full bg-brand rounded-full" style={{ width: `${Math.min(a.score ?? 0, 100)}%` }} />
                  </div>
                  <span className="text-[10px] data-value font-bold text-brand-ink w-11 text-right">{a.score != null ? a.score.toFixed(2) : '—'}</span>
                </div>
                {/* Bar Diri (evaluasi diri) — pembanding */}
                {a.self != null && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-bold text-warn-ink w-9 shrink-0">Diri</span>
                    <div className="flex-1 h-2 bg-neutral-tint rounded-full overflow-hidden">
                      <div className="h-full bg-warn rounded-full" style={{ width: `${Math.min(a.self, 100)}%` }} />
                    </div>
                    <span className="text-[10px] data-value font-bold text-warn-ink w-11 text-right">{a.self.toFixed(2)}</span>
                  </div>
                )}
              </div>
            ))}
            <p className="text-[10px] text-ink-faint italic">
              Bar <span className="text-brand-ink font-bold">Rekan</span> = gabungan penilai (Self dikecualikan);
              bar <span className="text-warn-ink font-bold">Diri</span> = evaluasi diri sebagai pembanding.
            </p>
          </div>
        </div>
      )}
      {!data.has360 && (
        <p className="mt-4 text-xs text-warn-ink bg-warn-tint border border-warn-ink/25 rounded-panel p-3">
          Periode ini tanpa Evaluasi 360° — radar &amp; komentar perilaku tidak ditampilkan; Skor Akhir = 100% KPI.
        </p>
      )}

      {/* Komentar mentah per penilai */}
      {!hideAssessorComments && data.has360 && data.assessors.length > 0 && (
        <div className="mt-6">
          <h3 className="text-sm font-bold text-ink mb-2">Rincian Komentar {anonymize ? '(Anonim)' : 'per Penilai'}</h3>
          <div className="space-y-3">
            {data.assessors.map((b, i) => (
              <div key={b.assessorId + i} className="border border-line rounded-panel p-3 break-inside-avoid">
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-xs font-bold text-ink">
                    {anonymize ? (RELATION_LABEL[b.relation] ?? b.relation) : b.assessorName}
                  </span>
                  {b.isSelf && <span className="text-[10px] font-bold bg-warn-tint text-warn-ink px-1.5 py-0.5 rounded-full">Self</span>}
                  {!anonymize && <span className="text-[10px] text-ink-faint">· {RELATION_LABEL[b.relation] ?? b.relation}</span>}
                </div>
                {b.answers.map((a, j) => (
                  <div key={j} className="mb-1.5">
                    <p className="text-[10px] text-ink-faint font-semibold">{a.question}</p>
                    <p className="text-xs text-ink-soft">{a.answer}</p>
                  </div>
                ))}
                {b.comments.map((c, j) => (
                  <div key={`c${j}`} className="mb-1 flex gap-2">
                    <span className="text-[10px] text-ink-faint shrink-0">{c.indicator}{c.rating != null ? ` (${c.rating})` : ''}:</span>
                    <span className="text-xs text-ink-soft">{c.comment}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
      {!hideAssessorComments && data.has360 && data.assessors.length === 0 && (
        <p className="mt-4 text-sm text-ink-soft">Belum ada komentar dari penilai.</p>
      )}

      <p className="text-[10px] text-ink-faint mt-6 print:mt-10">
        Dicetak dari Infarm 360° Performance Appraisal · {data.periodLabel} · Skor Akhir kalibrasi.
      </p>
    </div>
  );
}

function ScoreCard({ label, value, color, big }: { label: string; value: number | null; color: string; big?: boolean }) {
  return (
    <div className="border border-line rounded-panel p-3 text-center break-inside-avoid">
      <p className="text-[10px] text-ink-faint uppercase font-bold">{label}</p>
      <p className={`font-black data-value ${color} ${big ? 'text-3xl' : 'text-xl'}`}>{value != null ? value.toFixed(2) : '—'}</p>
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
      {/* Garis "Evaluasi Diri" — oranye solid (--color-warn #D97008), kontras terhadap hijau brand. */}
      {hasSelf && <polygon points={poly('self')} fill="rgba(217,112,8,0.12)" stroke="#D97008" strokeWidth="2" strokeDasharray="4,3" />}
      <polygon points={poly('score')} fill="rgba(51,96,74,0.18)" stroke="#33604A" strokeWidth="2" />
      {/* Label sumbu = NOMOR aspek (1..n) agar nama panjang/serupa tak terpotong & tak tumpang-tindih.
          Nama lengkap tiap nomor ada di panel "Rincian Aspek Budaya" di sebelahnya. */}
      {aspects.map((_, i) => {
        const [x, y] = axis(i);
        const lx = cx + (x - cx) * 1.16, ly = cy + (y - cy) * 1.16;
        return (
          <g key={i}>
            <circle cx={lx} cy={ly} r="8.5" fill="#E9F1EC" stroke="#C9CEC7" strokeWidth="1" />
            <text x={lx} y={ly} textAnchor="middle" dominantBaseline="central" className="fill-brand-ink text-[9px] font-bold">{i + 1}</text>
          </g>
        );
      })}
    </svg>
  );
}
