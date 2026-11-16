/**
 * Pengaturan "Ringkas otomatis" (tabel ai_settings, migrasi 0060) — SATU pengaturan untuk semua ringkasan
 * agar hasil antarpegawai seragam (diatur di halaman Pengaturan AI, bukan per laporan).
 *
 * MODEL: daftar diambil LANGSUNG dari Google (`listGeminiModels`, memakai kunci server) — model baru muncul
 * tanpa ubah kode; daftar tetap di kode cepat usang (2026-11-12: gemini-2.5-flash ditolak untuk pengguna
 * baru). Server tetap memvalidasi model terhadap daftar itu saat menyimpan. Tak ada model bawaan: selama
 * HRD belum memilih model, Ringkas otomatis menolak dengan arahan ke Pengaturan AI.
 * HARGA: Google tak menyertakan harga di daftar model → HRD mengisi dari daftar harga Google;
 * `KNOWN_PRICES` hanya mengisi otomatis model yang harganya diketahui saat kode ditulis.
 * Tabel belum ada (migrasi belum diterapkan) → bawaan (`source: 'missing'`).
 */
import { ASPECT_PROMPT, QUAL_PROMPT } from './summary-prompt';

/**
 * Harga resmi paket berbayar (USD per 1 juta token, input teks · output termasuk thinking) untuk model yang
 * diketahui — sumber: aistudio.google.com/docs/pricing, dicek 2026-11-12. Model ber-tier konteks memakai tier
 * ≤200k (bahan ringkasan jauh di bawahnya). Google sudah mengumumkan kenaikan untuk gemini-3.8-flash &
 * gemini-3.6-flash (×2 mulai 2027-01-01) — perbarui di sini / koreksi di halaman Pengaturan AI saat berlaku.
 * Model lain: HRD mengisi harga sendiri.
 */
export const KNOWN_PRICES: Record<string, { priceIn: number; priceOut: number }> = {
  'gemini-3.8-flash': { priceIn: 0.75, priceOut: 3.75 },
  'gemini-3.6-flash': { priceIn: 0.75, priceOut: 3.75 },
  'gemini-3.5-flash-lite': { priceIn: 0.3, priceOut: 2.5 },
  'gemini-3.1-pro-preview': { priceIn: 2, priceOut: 12 },
  'gemini-3.1-flash-lite': { priceIn: 0.25, priceOut: 1.5 },
  'gemini-3-flash-preview': { priceIn: 0.5, priceOut: 3 },
  'gemini-2.5-flash-lite': { priceIn: 0.1, priceOut: 0.4 },
  'gemini-2.5-flash': { priceIn: 0.3, priceOut: 2.5 },
  'gemini-2.5-pro': { priceIn: 1.25, priceOut: 10 },
};

/**
 * Harga yang dipakai menghitung biaya: isian Pengaturan AI; bila kosong (0) → harga resmi yang diketahui.
 * `priced` = false bila keduanya tak ada (biaya tak bisa dihitung — layar menjelaskan, bukan "Rp 0").
 */
export function effectivePrices(s: Pick<AiSettings, 'model' | 'priceIn' | 'priceOut' | 'usdIdr'>): { priceIn: number; priceOut: number; usdIdr: number; priced: boolean } {
  const known = KNOWN_PRICES[s.model];
  const priceIn = s.priceIn > 0 ? s.priceIn : known?.priceIn ?? 0;
  const priceOut = s.priceOut > 0 ? s.priceOut : known?.priceOut ?? 0;
  return { priceIn, priceOut, usdIdr: s.usdIdr, priced: priceIn > 0 || priceOut > 0 };
}

/**
 * Tingkat thinking per model. Meringkas komentar tak butuh penalaran dalam → pakai yang TERENDAH yang didukung,
 * agar cepat (bawaan gemini-3.8-flash = medium → sering melewati batas 55 dtk) & hemat token output.
 *  - 'off'     = thinkingBudget 0 (seri 2.5 Flash/Flash-Lite yang bisa dimatikan)
 *  - 'minimal' / 'low' = thinkingLevel (seri 3.x; nilai terendah per model dari dokumentasi Google, 2026-11-12)
 *  - 'auto'    = bawaan model (model yang tak dikenal — jangan menebak)
 * Bila Google menolak pengaturan ini, summarizeWithGemini mencoba sekali lagi tanpa pengaturan thinking.
 */
export type ThinkingMode = 'off' | 'minimal' | 'low' | 'auto';
const THINKING: Record<string, ThinkingMode> = {
  'gemini-2.5-flash-lite': 'off',
  'gemini-2.5-flash': 'off',
  'gemini-3.8-flash': 'low',
  'gemini-3.6-flash': 'minimal',
  'gemini-3.5-flash-lite': 'minimal',
  'gemini-3.1-pro-preview': 'low',
  'gemini-3.1-flash-lite': 'minimal',
  'gemini-3-flash-preview': 'minimal',
  'gemini-3-pro-preview': 'low',
};
export const thinkingFor = (model: string): ThinkingMode => THINKING[model] ?? 'auto';

/** Bentuk id model yang sah (tanpa awalan "models/"). */
export const MODEL_ID_RE = /^[a-z0-9][a-z0-9.\-]{1,79}$/;

export const DEFAULT_USD_IDR = 16500;
export const PROMPT_MAX_LEN = 8000;

export type AiSettings = {
  /** '' = belum dipilih HRD. */
  model: string;
  priceIn: number;
  priceOut: number;
  usdIdr: number;
  aspectPrompt: string;
  qualPrompt: string;
  version: number;
  updatedByName: string | null;
  updatedAt: string | null;
  /** 'db' = tersimpan di ai_settings; 'default' = bawaan kode; 'missing' = tabel belum ada (migrasi 0060). */
  source: 'db' | 'default' | 'missing';
};

export function defaultAiSettings(source: AiSettings['source'] = 'default'): AiSettings {
  return {
    model: '', priceIn: 0, priceOut: 0, usdIdr: DEFAULT_USD_IDR,
    aspectPrompt: ASPECT_PROMPT, qualPrompt: QUAL_PROMPT, version: 0,
    updatedByName: null, updatedAt: null, source,
  };
}

/** Tabel belum ada di database ini (migrasi belum diterapkan). */
export const tableMissing = (e: { code?: string; message?: string } | null) =>
  !!e && (e.code === 'PGRST205' || e.code === '42P01' || /could not find the table|does not exist/i.test(e.message ?? ''));

type Row = {
  model: string; price_input_usd: number | string; price_output_usd: number | string; usd_idr: number | string;
  aspect_prompt: string; qual_prompt: string; version: number; updated_by_name: string | null; updated_at: string | null;
};

// Klien service_role (tabel tanpa policy). Tipe longgar: ai_settings belum ada di database.types.
type AnyClient = { from: (t: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any

export async function loadAiSettings(admin: AnyClient): Promise<AiSettings> {
  const { data, error } = await admin.from('ai_settings').select('model, price_input_usd, price_output_usd, usd_idr, aspect_prompt, qual_prompt, version, updated_by_name, updated_at').eq('id', 1).maybeSingle();
  if (error) return defaultAiSettings(tableMissing(error) ? 'missing' : 'default');
  const r = data as Row | null;
  if (!r) return defaultAiSettings('default');
  return {
    // Id tersimpan yang bentuknya tak sah → anggap belum dipilih (gagal aman).
    model: MODEL_ID_RE.test(r.model) ? r.model : '',
    priceIn: Number(r.price_input_usd), priceOut: Number(r.price_output_usd), usdIdr: Number(r.usd_idr),
    aspectPrompt: r.aspect_prompt, qualPrompt: r.qual_prompt, version: r.version,
    updatedByName: r.updated_by_name, updatedAt: r.updated_at, source: 'db',
  };
}
