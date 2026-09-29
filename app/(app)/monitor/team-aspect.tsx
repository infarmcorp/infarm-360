'use client';

import { fmt2 } from '@/lib/scoring';

import { motion } from 'motion/react';
import { heatColor } from '@/lib/score-color';

export type AspectScore = { aspek: string; score: number; orgScore?: number };

/**
 * Profil Aspek Budaya 360° lingkup (tim/naungan/divisi) — potret STATIK skor rata-rata per aspek
 * pada periode terpilih. Melengkapi kartu "Pergerakan 360°" (yang hanya menampilkan DELTA):
 * SPV/Koordinator langsung melihat aspek terkuat & terlemah timnya. Skor 0–100 (rumus 360° resmi,
 * terbobot per kelas, Self dikecualikan). Presentasional; dihitung di server via service_role.
 *
 * PEMBANDING ORGANISASI (opsional `orgScore`): garis vertikal = rata-rata SELURUH pegawai internal
 * di aspek itu; chip Δ menunjukkan tim di ATAS (+) / BAWAH (−) rata-rata organisasi. Menjawab
 * "tim saya lemah di Kolaborasi — dan itu di bawah/atas perusahaan?".
 */
export function TeamAspectProfile({ aspects, scopeLabel }: { aspects: AspectScore[]; scopeLabel: string }) {
  if (!aspects.length) return null;
  const sorted = [...aspects].sort((a, b) => b.score - a.score);
  const hasOrg = sorted.some((a) => a.orgScore != null);
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-xs mb-4">
      <div className="flex items-center justify-between gap-2 mb-1">
        <h3 className="text-sm font-bold text-gray-800">Profil Aspek Budaya 360°</h3>
        <span className="text-[11px] text-gray-400">{scopeLabel}</span>
      </div>
      <p className="text-[11px] text-gray-500 mb-3">
        Rata-rata skor 360° tim per aspek (0–100) — aspek terkuat di atas, terlemah di bawah.
        {hasOrg && <> Garis <span className="inline-block align-middle w-[2px] h-3 bg-slate-800 mx-0.5" /> = rata-rata organisasi; chip Δ = selisih tim vs organisasi.</>}
      </p>
      <div className="space-y-3">
        {sorted.map((a, i) => {
          const hc = heatColor(a.score);
          const org = a.orgScore ?? null;
          const d = org != null ? a.score - org : null;
          return (
            <div key={a.aspek} className="space-y-1">
              <div className="flex justify-between items-center text-xs gap-2">
                <span className="font-medium text-gray-700">⭐ {a.aspek}</span>
                <div className="flex items-center gap-1.5 shrink-0">
                  {d != null && (
                    <span className={`text-[10px] font-bold font-mono px-1.5 py-0.5 rounded ${
                      d >= 0 ? 'text-emerald-700 bg-emerald-50' : 'text-rose-600 bg-rose-50'}`}
                      title={`Rata-rata organisasi: ${fmt2(org!)}`}>
                      {d >= 0 ? '▲ +' : '▼ −'}{Math.abs(d).toFixed(2)}
                    </span>
                  )}
                  <span className="font-bold font-mono px-2 py-0.5 rounded-md" style={{ backgroundColor: hc.bg, color: hc.fg }}>{fmt2(a.score)} / 100</span>
                </div>
              </div>
              <div className="relative h-2.5">
                <div className="absolute inset-0 bg-gray-100 rounded-md overflow-hidden">
                  <motion.div initial={{ width: 0 }} animate={{ width: `${Math.min(a.score, 100)}%` }}
                    transition={{ duration: 0.8, delay: i * 0.06 }} className="h-full rounded-md" style={{ backgroundColor: hc.bg }} />
                </div>
                {org != null && (
                  <span className="absolute top-[-3px] h-[calc(100%+6px)] w-[2px] bg-slate-800 rounded-sm"
                    style={{ left: `calc(${Math.min(org, 100)}% - 1px)` }}
                    title={`Rata-rata organisasi: ${fmt2(org)}`} />
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
