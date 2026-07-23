import { createClient, createAdminClient } from '@/lib/supabase/server';

/**
 * Jejak audit aksi sensitif HRD → tabel hrd_audit_log (append-only).
 *
 * Dipanggil dari Server Action SETELAH aksi utama berhasil. Sengaja "best-effort":
 * kegagalan mencatat audit TIDAK boleh menggagalkan aksi HRD-nya (dibungkus try/catch).
 * Pelaku diambil dari sesi (auth.uid); RLS hrd_audit_insert memastikan hanya HRD menulis.
 */
export type AuditCategory =
  | 'periode' | 'bobot' | 'skor' | 'laporan' | 'kepatuhan'
  | 'pegawai' | 'pemetaan' | 'pertanyaan' | 'progress' | 'suksesi';

/**
 * Kode aksi yang tergolong "perubahan AKSES" (grant halaman ber-lingkup + izin peran/HRD). Dipakai
 * halaman Manajemen Akses untuk menyaring `hrd_audit_log` → panel "Log Akses" TERPISAH dari Log
 * Aktivitas HRD umum (yang mencampur semua kategori). Menambah aksi akses baru? Daftarkan di sini.
 */
export const ACCESS_AUDIT_ACTIONS = [
  // Grant HALAMAN ber-lingkup (app/(app)/admin/akses/actions.ts)
  'access.set_page_grant', 'access.set_page_grant_role', 'access.remove_page_grant', 'access.mark_reviewed',
  // Izin PERAN / kapabilitas (app/(app)/admin/pegawai/actions.ts)
  'employee.grant_hrd', 'employee.revoke_hrd',
  'employee.grant_cross_reviewer', 'employee.revoke_cross_reviewer',
  'employee.grant_coordinator', 'employee.revoke_coordinator',
  'employee.set_coordinator_team', 'employee.set_hrd_sections',
] as const;

export type AuditEntry = {
  action: string;                 // kode mesin, mis. 'period.lock', 'weights.save'
  category: AuditCategory;
  summary: string;                // ringkasan untuk dibaca manusia (Bahasa Indonesia)
  targetType?: string;
  targetId?: string | null;
  targetLabel?: string | null;
  meta?: Record<string, unknown>;
};

export async function logHrdAction(entry: AuditEntry): Promise<void> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data: me } = await supabase.from('employees').select('name').eq('id', user.id).maybeSingle();
    await supabase.from('hrd_audit_log').insert({
      actor_id: user.id,
      actor_name: me?.name ?? null,
      action: entry.action,
      category: entry.category,
      summary: entry.summary,
      target_type: entry.targetType ?? null,
      target_id: entry.targetId ?? null,
      target_label: entry.targetLabel ?? null,
      meta: entry.meta ?? null,
    });
  } catch {
    // Audit gagal tak boleh memblokir aksi HRD — abaikan diam-diam.
  }
}

/**
 * Varian service-role untuk mencatat aksi pelaku yang BUKAN HRD (mis. ACC Direksi),
 * yang ditolak oleh RLS hrd_audit_insert (`with check is_hrd()`). Pelaku diberikan
 * eksplisit (tak diambil dari sesi). Tetap best-effort (tak memblokir aksi utama).
 */
export async function logAuditAsService(
  entry: AuditEntry,
  actor: { id: string; name: string | null },
): Promise<void> {
  try {
    const admin = createAdminClient();
    await admin.from('hrd_audit_log').insert({
      actor_id: actor.id,
      actor_name: actor.name,
      action: entry.action,
      category: entry.category,
      summary: entry.summary,
      target_type: entry.targetType ?? null,
      target_id: entry.targetId ?? null,
      target_label: entry.targetLabel ?? null,
      meta: entry.meta ?? null,
    });
  } catch {
    // Abaikan diam-diam.
  }
}
