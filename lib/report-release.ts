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
