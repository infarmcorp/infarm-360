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

/** Harga perkiraan (USD per 1 juta token) untuk model yang diketahui; selebihnya diisi HRD. */
export const KNOWN_PRICES: Record<string, { priceIn: number; priceOut: number }> = {
  'gemini-2.5-flash-lite': { priceIn: 0.1, priceOut: 0.4 },
  'gemini-2.5-flash': { priceIn: 0.3, priceOut: 2.5 },
  'gemini-2.5-pro': { priceIn: 1.25, priceOut: 10 },
};

/** Model yang thinking-nya bisa dimatikan (hemat token). Model lain → bawaan model (tanpa thinkingConfig). */
const THINKING_OFF_OK = new Set(['gemini-2.5-flash-lite', 'gemini-2.5-flash']);
export const thinkingFor = (model: string): 'off' | 'auto' => (THINKING_OFF_OK.has(model) ? 'off' : 'auto');

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
