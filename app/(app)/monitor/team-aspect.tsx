'use client';

import { fmt2 } from '@/lib/scoring';

import { motion } from 'motion/react';
import { Sparkles } from 'lucide-react';
import { heatColorInfarm } from '@/lib/score-color';
import { CARD, CardTitle } from '@/components/infarm-ui';

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
    <div className={`${CARD} mb-4`}>
      <div className="flex items-center justify-between gap-2 mb-1">
        <CardTitle icon={Sparkles}>Profil Aspek Budaya 360°</CardTitle>
        <span className="text-xs text-ink-soft">{scopeLabel}</span>
      </div>
      <p className="text-xs text-ink-soft mt-1 mb-4">
        Rata-rata skor 360° tim per aspek (0–100) — aspek terkuat di atas, terlemah di bawah.
        {hasOrg && <> Garis <span className="inline-block align-middle w-[2px] h-3 bg-infarm-dark mx-0.5" /> = rata-rata organisasi; chip Δ = selisih tim vs organisasi.</>}
      </p>
      <div className="space-y-3">
        {sorted.map((a, i) => {
          const hc = heatColorInfarm(a.score);
          const org = a.orgScore ?? null;
          const d = org != null ? a.score - org : null;
          return (
            <div key={a.aspek} className="space-y-1">
              <div className="flex justify-between items-center text-xs gap-2">
                <span className="text-[13px] font-semibold text-ink">{a.aspek}</span>
                <div className="flex items-center gap-1.5 shrink-0">
                  {d != null && (
                    <span className={`text-[11px] font-bold font-mono px-2 py-0.5 rounded-full ${
                      d >= 0 ? 'text-brand-ink bg-brand-tint' : 'text-danger-ink bg-danger-tint'}`}
                      title={`Rata-rata organisasi: ${fmt2(org!)}`}>
                      {d >= 0 ? '▲ +' : '▼ −'}{fmt2(Math.abs(d))}
                    </span>
                  )}
                  <span className="font-bold font-mono px-2.5 py-0.5 rounded-full" style={{ backgroundColor: hc.bg, color: hc.fg }}>{fmt2(a.score)} / 100</span>
                </div>
              </div>
              <div className="relative h-2.5">
                <div className="absolute inset-0 bg-neutral-tint rounded-full overflow-hidden">
                  <motion.div initial={{ width: 0 }} animate={{ width: `${Math.min(a.score, 100)}%` }}
                    transition={{ duration: 0.8, delay: i * 0.06 }} className="h-full rounded-full" style={{ backgroundColor: hc.bg }} />
                </div>
                {org != null && (
                  <span className="absolute top-[-3px] h-[calc(100%+6px)] w-[2px] bg-infarm-dark rounded-sm"
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
