import type { createAdminClient } from '@/lib/supabase/server';
import { monthRangeId, ordinalId, type ReleasePeriod } from '@/lib/email/release-template';

/**
 * Data pendukung email Rilis Laporan PA (Review & Finalisasi) — dipakai halaman (pratinjau) dan
 * Server Action (kirim) agar isi email keduanya sama. Dibaca via service_role oleh pemanggil
 * yang SUDAH lolos cek HRD.
 */
type Db = ReturnType<typeof createAdminClient>;

/** Kode aksi log HRD untuk tiap gelombang kirim; `meta.sent_ids` = pegawai yang berhasil dikirimi. */
export const RELEASE_EMAIL_ACTION = 'laporan.release_email';

/** Periode untuk template: label, rentang bulan, 360° aktif, aspek budaya (urut). Null bila tak ada. */
export async function loadReleasePeriod(db: Db, periodId: string): Promise<(ReleasePeriod & { id: string }) | null> {
  const { data: p } = await db.from('periods').select('id, label, has_360').eq('id', periodId).maybeSingle();
  if (!p) return null;
  const [{ data: months }, { data: aspects }] = await Promise.all([
    db.from('period_months').select('ym').eq('period_id', periodId),
    db.from('culture_aspects').select('name').eq('period_id', periodId).order('order_idx'),
  ]);
  return {
    id: p.id, label: p.label, has360: p.has_360,
    monthRange: monthRangeId((months ?? []).map((m) => m.ym)),
    aspects: p.has_360 ? (aspects ?? []).map((a) => a.name) : [],
  };
}

/**
 * Urutan siklus bawaan (diedit HRD): jumlah periode ber-360° yang mulai paling lambat bersamaan
 * dengan periode ini, mis. Q1–Q3 2026 → "ketiga". Periode tanpa 360° → hitung semua periode.
 */
export async function defaultCycle(db: Db, periodId: string): Promise<string> {
  const { data: rows } = await db.from('periods').select('id, start_date, has_360');
  const me = (rows ?? []).find((r) => r.id === periodId);
  if (!me) return '';
  const n = (rows ?? []).filter((r) => r.start_date <= me.start_date && (!me.has_360 || r.has_360)).length;
  return ordinalId(n);
}

/**
 * Gambar pendamping email rilis — diunggah HRD per periode (isinya bertuliskan kuartal, mis. "Q3 2026"),
 * disimpan di bucket publik `email-assets` (migrasi 0051) dan disisipkan inline (CID) ke email.
 * Urutan di email = urutan di sini.
 */
export const RELEASE_BUCKET = 'email-assets';
export const RELEASE_IMAGES = [
  { key: 'panduan', label: 'Panduan setelah menerima laporan' },
  { key: 'cara-unduh', label: 'Cara mengunduh laporan PDF' },
] as const;
export type ReleaseImageKey = (typeof RELEASE_IMAGES)[number]['key'];
export type ReleaseImages = Partial<Record<ReleaseImageKey, { url: string; path: string; contentType: string }>>;

export const releaseImageFolder = (periodId: string) => `release/${periodId}`;

const EXT_TYPE: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };

/**
 * Gambar yang sudah diunggah untuk periode ini. `ok=false` = penyimpanan belum aktif (bucket belum
 * dibuat/migrasi 0051 belum dijalankan) → email tetap bisa dikirim tanpa gambar.
 * URL diberi `?v=<waktu ubah>` agar gambar yang diganti tak tertahan cache.
 */
export async function loadReleaseImages(db: Db, periodId: string): Promise<{ ok: boolean; images: ReleaseImages }> {
  const store = db.storage.from(RELEASE_BUCKET);
  const { data, error } = await store.list(releaseImageFolder(periodId));
  if (error) return { ok: false, images: {} };
  const images: ReleaseImages = {};
  for (const img of RELEASE_IMAGES) {
    const f = (data ?? []).find((o) => o.name.replace(/\.[^.]+$/, '') === img.key);
    if (!f) continue;
    const path = `${releaseImageFolder(periodId)}/${f.name}`;
    const ext = f.name.split('.').pop()?.toLowerCase() ?? '';
    const v = encodeURIComponent(f.updated_at ?? f.created_at ?? '');
    images[img.key] = { path, contentType: EXT_TYPE[ext] ?? 'image/jpeg', url: `${store.getPublicUrl(path).data.publicUrl}?v=${v}` };
  }
  return { ok: true, images };
}

/** Pegawai yang sudah pernah dikirimi email rilis untuk periode ini (gabungan semua gelombang). */
export async function loadReleaseSentIds(db: Db, periodId: string): Promise<Set<string>> {
  const { data } = await db.from('hrd_audit_log').select('meta')
    .eq('action', RELEASE_EMAIL_ACTION).eq('target_id', periodId);
  const sent = new Set<string>();
  (data ?? []).forEach((r) => {
    const ids = (r.meta as { sent_ids?: unknown } | null)?.sent_ids;
    if (Array.isArray(ids)) ids.forEach((id) => { if (typeof id === 'string') sent.add(id); });
  });
  return sent;
}
