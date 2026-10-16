import { getAll } from '@vercel/edge-config';

/**
 * Mode maintenance — saklar = item **`maintenance`** (boolean) di **Vercel Edge Config** yang terhubung ke
 * project (env `EDGE_CONFIG` diisi otomatis oleh Vercel). Diubah dari dashboard → berlaku seketika, TANPA
 * redeploy. Item opsional **`maintenance_until`** (teks bebas mis. "pukul 15.00 WIB") = perkiraan selesai.
 * Sengaja TANPA Supabase: maintenance sering justru karena DB sedang dirawat.
 *
 * HANYA berlaku di deployment **production** (`VERCEL_ENV==='production'`): Edge Config dibaca bersama oleh
 * production & Preview (`dev`), jadi tanpa pengaman ini Preview ikut terkunci. Lokal & Preview → selalu normal.
 * Gagal membaca Edge Config (belum dihubungkan / gangguan) → dianggap MATI (app tetap bisa dipakai).
 *
 * Pengecualian HANYA untuk developer uji coba: buka `/?bypass=<MAINTENANCE_BYPASS_TOKEN>` (env) sekali →
 * cookie httpOnly → browser itu lolos. `?bypass=off` menghapusnya. Token kosong / < 16 karakter = tak ada
 * yang bisa lolos. Semua orang lain (termasuk HRD) tetap melihat halaman maintenance.
 */
export const MAINTENANCE_PATH = '/maintenance';
export const BYPASS_COOKIE = 'maintenance_bypass';
export const BYPASS_PARAM = 'bypass';
const MIN_TOKEN_LENGTH = 16;

type Env = Record<string, string | undefined>;

export type MaintenanceConfig = { on: boolean; until: string | null };
const OFF: MaintenanceConfig = { on: false, until: null };

/** Tafsirkan isi Edge Config + lingkungan deploy jadi status maintenance (murni, diuji). */
export function resolveMaintenance(items: { maintenance?: unknown; maintenance_until?: unknown } | null | undefined, vercelEnv: string | undefined): MaintenanceConfig {
  if (vercelEnv !== 'production' || !items) return OFF;
  if (items.maintenance !== true) return OFF;
  const until = typeof items.maintenance_until === 'string' ? items.maintenance_until.trim() : '';
  return { on: true, until: until || null };
}

/** Baca status maintenance dari Edge Config. Tak pernah melempar — gagal = mati. */
export async function readMaintenance(env: Env = process.env): Promise<MaintenanceConfig> {
  if (env.VERCEL_ENV !== 'production' || !env.EDGE_CONFIG) return OFF;
  try {
    const items = await getAll(['maintenance', 'maintenance_until']);
    return resolveMaintenance(items, env.VERCEL_ENV);
  } catch {
    return OFF;
  }
}

/** Token bypass yang sah, atau null bila tak diset / terlalu pendek (= bypass mati). */
export function bypassToken(env: Env = process.env): string | null {
  const t = env.MAINTENANCE_BYPASS_TOKEN?.trim();
  return t && t.length >= MIN_TOKEN_LENGTH ? t : null;
}

/** Bandingkan waktu-konstan agar token tak bisa ditebak lewat selisih waktu respons. */
export function tokenMatches(given: string | null | undefined, token: string | null): boolean {
  if (!given || !token || given.length !== token.length) return false;
  let diff = 0;
  for (let i = 0; i < token.length; i++) diff |= given.charCodeAt(i) ^ token.charCodeAt(i);
  return diff === 0;
}

/**
 * Keputusan proxy untuk satu path:
 *   'pass' → lanjut normal · 'page' → tampilkan halaman maintenance (503)
 *   'api'  → 503 JSON (route API/cron) · 'exit' → user di /maintenance padahal boleh masuk → ke /
 */
export type MaintenanceRoute = 'pass' | 'page' | 'api' | 'exit';

export function maintenanceRoute(path: string, on: boolean, bypassed = false): MaintenanceRoute {
  const atPage = path === MAINTENANCE_PATH || path.startsWith(`${MAINTENANCE_PATH}/`);
  if (!on || bypassed) return atPage ? 'exit' : 'pass';
  if (atPage) return 'pass';
  if (path.startsWith('/api/')) return 'api';
  return 'page';
}
