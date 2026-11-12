/**
 * Pengaturan "Ringkas otomatis" (tabel ai_settings, migrasi 0060) — SATU pengaturan untuk semua ringkasan
 * agar hasil antarpegawai seragam (diatur di halaman Pengaturan AI, bukan per laporan).
 *
 * Model hanya dari daftar tetap `AI_MODELS` (divalidasi server). Harga bawaan per model = perkiraan saat
 * kode ditulis; HRD bisa mengoreksinya di halaman Pengaturan AI bila daftar harga Google berubah.
 * Tabel belum ada (migrasi belum diterapkan) → pakai bawaan di kode (`source: 'default'`).
 */
import { ASPECT_PROMPT, QUAL_PROMPT } from './summary-prompt';

export type AiModel = {
  id: string;
  label: string;
  priceIn: number;   // USD per 1 juta token input
  priceOut: number;  // USD per 1 juta token output (termasuk thinking)
  /** 'off' = thinking dimatikan (hemat); 'auto' = bawaan model (model yang tak bisa mematikan thinking). */
  thinking: 'off' | 'auto';
  note: string;
};

export const AI_MODELS: AiModel[] = [
  { id: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash-Lite', priceIn: 0.1, priceOut: 0.4, thinking: 'off', note: 'Paling murah & cepat; ringkasan lebih sederhana.' },
  { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', priceIn: 0.3, priceOut: 2.5, thinking: 'off', note: 'Seimbang antara mutu dan biaya.' },
  { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', priceIn: 1.25, priceOut: 10, thinking: 'auto', note: 'Mutu tertinggi, paling mahal; selalu memakai thinking (token output lebih banyak).' },
];

export const DEFAULT_MODEL_ID = 'gemini-2.5-flash';
export const DEFAULT_USD_IDR = 16500;
export const PROMPT_MAX_LEN = 8000;

export const modelById = (id: string): AiModel | undefined => AI_MODELS.find((m) => m.id === id);

export type AiSettings = {
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
  const m = modelById(DEFAULT_MODEL_ID)!;
  return {
    model: m.id, priceIn: m.priceIn, priceOut: m.priceOut, usdIdr: DEFAULT_USD_IDR,
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
  // Model yang sudah dikeluarkan dari daftar → kembali ke bawaan (gagal aman, tak memanggil model sembarang).
  if (!modelById(r.model)) return { ...defaultAiSettings('default'), aspectPrompt: r.aspect_prompt, qualPrompt: r.qual_prompt, version: r.version };
  return {
    model: r.model, priceIn: Number(r.price_input_usd), priceOut: Number(r.price_output_usd), usdIdr: Number(r.usd_idr),
    aspectPrompt: r.aspect_prompt, qualPrompt: r.qual_prompt, version: r.version,
    updatedByName: r.updated_by_name, updatedAt: r.updated_at, source: 'db',
  };
}
