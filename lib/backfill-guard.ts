import type { createAdminClient } from '@/lib/supabase/server';

type Admin = ReturnType<typeof createAdminClient>;

/** Pesan baku saat Skor 360° periode hasil impor Looker dilindungi dari hitung ulang. */
export const BACKFILL_LOCK_MSG =
  'Skor 360° periode ini hasil impor resmi (Looker) dan dikunci — tidak boleh dihitung ulang dari aplikasi agar angkanya tidak tertimpa.';

/**
 * Periode yang Skor 360°-nya DI-IMPOR (skrip `import-360-backfill`, tercatat sebagai
 * `hrd_audit_log.action = 'score360.backfill'`, mis. Q1 2026) tidak boleh dihitung ulang dari
 * aplikasi: struktur penilaiannya sintetis, sehingga `computeResult360` akan menimpa angka resmi.
 * Periode lama boleh dibuka kembali (lihat CLAUDE.md), jadi pengaman ini wajib di sisi server.
 */
export async function isBackfilledPeriod(admin: Admin, periodId: string): Promise<boolean> {
  const { count } = await admin.from('hrd_audit_log').select('*', { count: 'exact', head: true })
    .eq('action', 'score360.backfill').eq('target_id', periodId);
  return (count ?? 0) > 0;
}
