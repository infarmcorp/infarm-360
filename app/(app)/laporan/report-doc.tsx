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
          <h1 className="text-xl font-bold text-gray-800">Dokumen Laporan Kinerja</h1>
          <p className="text-sm text-gray-500">{data.emp.name} · {data.emp.dept} · {data.periodLabel}</p>
        </div>
        {!hidePrint && (
          <button
            type="button"
            onClick={() => window.print()}
            className="shrink-0 inline-flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-900 text-white"
          >
            <Download className="w-3.5 h-3.5" /> Unduh PDF
          </button>
        )}
      </div>

      {/* Kop cetak (hanya saat print) */}
      <div className="hidden print:block mb-4">
        <h1 className="text-lg font-black text-gray-900">Laporan Kinerja 360° — Infarm</h1>
        <p className="text-xs text-gray-600">{data.emp.name} · {data.emp.dept} · Periode {data.periodLabel}</p>
      </div>

      {/* Ringkasan skor */}
      <div className="grid grid-cols-3 gap-3 mt-4">
        <ScoreCard label="Rerata KPI" value={data.kpiAvg} color="text-emerald-700" />
        <ScoreCard label="Evaluasi 360°" value={data.has360 ? data.s360 : null} color="text-indigo-700" />
        <ScoreCard label="Skor Akhir" value={data.finalScore} color="text-slate-900" big />
      </div>
      {data.penalty > 0 && (
        <p className="text-[11px] text-rose-600 mt-2">Termasuk pengurangan punishment kepatuhan −{data.penalty.toFixed(1)}.</p>
      )}

      {/* Radar aspek 360 */}
      {data.has360 && aspectsWith.length >= 3 && (
        <div className="mt-6 grid md:grid-cols-2 gap-4 items-center">
          <div className="break-inside-avoid">
            <Radar aspects={data.aspects} />
            {/* Legenda radar — perjelas mana garis Rekan vs Self */}
            <div className="flex items-center justify-center gap-4 mt-2 text-[10px]">
              <span className="flex items-center gap-1.5">
                <svg width="22" height="6"><line x1="0" y1="3" x2="22" y2="3" stroke="#4f46e5" strokeWidth="2.5" /></svg>
                <span className="font-bold text-indigo-700">Penilaian Rekan</span>
              </span>
              <span className="flex items-center gap-1.5">
                <svg width="22" height="6"><line x1="0" y1="3" x2="22" y2="3" stroke="#f59e0b" strokeWidth="2.5" strokeDasharray="4,3" /></svg>
                <span className="font-bold text-amber-600">Evaluasi Diri (Self)</span>
              </span>
            </div>
          </div>
          <div className="space-y-2.5">
            <h3 className="text-sm font-bold text-gray-700">Rincian Aspek Budaya (360°)</h3>
            {data.aspects.map((a) => (
              <div key={a.name} className="space-y-1">
                <span className="text-xs text-gray-700 font-medium">{a.name}</span>
                {/* Bar Rekan (gabungan penilai, Self dikecualikan) */}
                <div className="flex items-center gap-1.5">
                  <span className="text-[9px] font-bold text-indigo-700 w-9 shrink-0">Rekan</span>
                  <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${Math.min(a.score ?? 0, 100)}%` }} />
                  </div>
                  <span className="text-[9px] font-mono font-bold text-indigo-700 w-7 text-right">{a.score != null ? a.score.toFixed(0) : '—'}</span>
                </div>
                {/* Bar Diri (evaluasi diri) — pembanding */}
                {a.self != null && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-[9px] font-bold text-amber-600 w-9 shrink-0">Diri</span>
                    <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full bg-amber-400 rounded-full" style={{ width: `${Math.min(a.self, 100)}%` }} />
                    </div>
                    <span className="text-[9px] font-mono font-bold text-amber-600 w-7 text-right">{a.self.toFixed(0)}</span>
                  </div>
                )}
              </div>
            ))}
            <p className="text-[10px] text-gray-400 italic">
              Bar <span className="text-indigo-700 font-bold">Rekan</span> = gabungan penilai (Self dikecualikan);
              bar <span className="text-amber-600 font-bold">Diri</span> = evaluasi diri sebagai pembanding.
            </p>
          </div>
        </div>
      )}
      {!data.has360 && (
        <p className="mt-4 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl p-3">
          Periode ini tanpa Evaluasi 360° — radar &amp; komentar perilaku tidak ditampilkan; Skor Akhir = 100% KPI.
        </p>
      )}

      {/* Komentar mentah per penilai */}
      {!hideAssessorComments && data.has360 && data.assessors.length > 0 && (
        <div className="mt-6">
          <h3 className="text-sm font-bold text-gray-700 mb-2">Rincian Komentar {anonymize ? '(Anonim)' : 'per Penilai'}</h3>
          <div className="space-y-3">
            {data.assessors.map((b, i) => (
              <div key={b.assessorId + i} className="border border-gray-200 rounded-xl p-3 break-inside-avoid">
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-xs font-bold text-gray-800">
                    {anonymize ? (RELATION_LABEL[b.relation] ?? b.relation) : b.assessorName}
                  </span>
                  {b.isSelf && <span className="text-[9px] font-bold bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded-full">Self</span>}
                  {!anonymize && <span className="text-[9px] text-gray-400">· {RELATION_LABEL[b.relation] ?? b.relation}</span>}
                </div>
                {b.answers.map((a, j) => (
                  <div key={j} className="mb-1.5">
                    <p className="text-[10px] text-gray-400 font-semibold">{a.question}</p>
                    <p className="text-xs text-gray-700">{a.answer}</p>
                  </div>
                ))}
                {b.comments.map((c, j) => (
                  <div key={`c${j}`} className="mb-1 flex gap-2">
                    <span className="text-[10px] text-gray-400 shrink-0">{c.indicator}{c.rating != null ? ` (${c.rating})` : ''}:</span>
                    <span className="text-xs text-gray-700">{c.comment}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
      {!hideAssessorComments && data.has360 && data.assessors.length === 0 && (
        <p className="mt-4 text-sm text-gray-500">Belum ada komentar dari penilai.</p>
      )}

      <p className="text-[10px] text-gray-400 mt-6 print:mt-10">
        Dicetak dari Infarm 360° Performance Appraisal · {data.periodLabel} · Skor Akhir kalibrasi.
      </p>
    </div>
  );
}

function ScoreCard({ label, value, color, big }: { label: string; value: number | null; color: string; big?: boolean }) {
  return (
    <div className="border border-gray-200 rounded-xl p-3 text-center break-inside-avoid">
      <p className="text-[10px] text-gray-400 uppercase font-bold">{label}</p>
      <p className={`font-black font-mono ${color} ${big ? 'text-3xl' : 'text-xl'}`}>{value != null ? value.toFixed(1) : '—'}</p>
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
          fill="none" stroke="#e5e7eb" strokeWidth="1" />
      ))}
      {aspects.map((_, i) => { const [x, y] = axis(i); return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="#e5e7eb" strokeWidth="1" />; })}
      {hasSelf && <polygon points={poly('self')} fill="rgba(245,158,11,0.10)" stroke="#f59e0b" strokeWidth="1.5" strokeDasharray="4,3" />}
      <polygon points={poly('score')} fill="rgba(79,70,229,0.18)" stroke="#4f46e5" strokeWidth="2" />
      {aspects.map((a, i) => {
        const [x, y] = axis(i);
        const lx = cx + (x - cx) * 1.16, ly = cy + (y - cy) * 1.16;
        return <text key={i} x={lx} y={ly} textAnchor="middle" dominantBaseline="middle" className="fill-gray-500 text-[8px] font-bold">{a.name.split(' ')[0]}</text>;
      })}
    </svg>
  );
}
