/**
 * Waktu jadwal Email Rilis (WIB) — fungsi MURNI, aman dipakai di komponen klien maupun server
 * (lib/release-schedule.ts memuat modul email khusus server, jadi bagian ini dipisah).
 */
export const SCHEDULE_MIN_LEAD_MS = 5 * 60 * 1000;          // jadwal minimal 5 menit ke depan
export const SCHEDULE_MAX_AHEAD_MS = 120 * 24 * 3600 * 1000; // maksimal ±4 bulan ke depan
const WIB_OFFSET_H = 7;

/** "2027-01-16" + "09:00" (WIB) → ISO UTC. Null bila format/tanggal tak sah. */
export function wibToIso(date: string, time: string): string | null {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date); const t = /^(\d{2}):(\d{2})$/.exec(time);
  if (!d || !t) return null;
  const [y, m, day, h, mi] = [+d[1], +d[2], +d[3], +t[1], +t[2]];
  if (m < 1 || m > 12 || day < 1 || day > 31 || h > 23 || mi > 59) return null;
  const ms = Date.UTC(y, m - 1, day, h - WIB_OFFSET_H, mi);
  const back = new Date(ms + WIB_OFFSET_H * 3600 * 1000);
  if (back.getUTCDate() !== day || back.getUTCMonth() !== m - 1) return null; // mis. 31 Februari
  return new Date(ms).toISOString();
}

/** ISO → { date: "YYYY-MM-DD", time: "HH:MM" } dalam WIB (untuk mengisi ulang formulir). */
export function isoToWibParts(iso: string): { date: string; time: string } {
  const w = new Date(Date.parse(iso) + WIB_OFFSET_H * 3600 * 1000);
  const p = (n: number) => String(n).padStart(2, '0');
  return { date: `${w.getUTCFullYear()}-${p(w.getUTCMonth() + 1)}-${p(w.getUTCDate())}`, time: `${p(w.getUTCHours())}:${p(w.getUTCMinutes())}` };
}

/** Teks WIB untuk layar, mis. "Sabtu, 16 Januari 2027 pukul 09.00 WIB". */
export function fmtScheduleWib(iso: string): string {
  const d = new Date(iso);
  const day = d.toLocaleDateString('id-ID', { timeZone: 'Asia/Jakarta', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const time = d.toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', hour12: false }).replace(':', '.');
  return `${day} pukul ${time} WIB`;
}

/** Validasi jam kirim terhadap `now`: minimal 5 menit ke depan, maksimal ±4 bulan. Null = sah. */
export function sendAtError(iso: string, now: number): string | null {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return 'Tanggal/jam tidak sah.';
  if (t < now + SCHEDULE_MIN_LEAD_MS) return 'Jam kirim minimal 5 menit dari sekarang.';
  if (t > now + SCHEDULE_MAX_AHEAD_MS) return 'Jam kirim maksimal 4 bulan dari sekarang.';
  return null;
}

