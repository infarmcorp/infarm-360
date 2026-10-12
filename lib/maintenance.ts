/**
 * Mode maintenance — saklar = env Vercel `MAINTENANCE_MODE=true` (+ Redeploy). Sengaja TANPA DB:
 * maintenance sering justru karena Supabase sedang dirawat, jadi pengecekan tak boleh bergantung
 * padanya. `MAINTENANCE_UNTIL` (opsional, teks bebas mis. "pukul 15.00 WIB") = perkiraan selesai.
 *
 * Pengecualian HANYA untuk developer uji coba (2026-10-12): buka `/?bypass=<MAINTENANCE_BYPASS_TOKEN>`
 * sekali → cookie httpOnly → browser itu lolos. `?bypass=off` menghapusnya. Token kosong / < 16 karakter
 * = tak ada yang bisa lolos. Semua orang lain (termasuk HRD) tetap melihat halaman maintenance.
 */
export const MAINTENANCE_PATH = '/maintenance';
export const BYPASS_COOKIE = 'maintenance_bypass';
export const BYPASS_PARAM = 'bypass';
const MIN_TOKEN_LENGTH = 16;

type Env = Record<string, string | undefined>;

export function isMaintenanceOn(env: Env = process.env): boolean {
  return env.MAINTENANCE_MODE?.trim().toLowerCase() === 'true';
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
