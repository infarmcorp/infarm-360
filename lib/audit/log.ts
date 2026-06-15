import { createClient } from '@/lib/supabase/server';

/**
 * Jejak audit aksi sensitif HRD → tabel hrd_audit_log (append-only).
 *
 * Dipanggil dari Server Action SETELAH aksi utama berhasil. Sengaja "best-effort":
 * kegagalan mencatat audit TIDAK boleh menggagalkan aksi HRD-nya (dibungkus try/catch).
 * Pelaku diambil dari sesi (auth.uid); RLS hrd_audit_insert memastikan hanya HRD menulis.
 */
export type AuditCategory =
  | 'periode' | 'bobot' | 'skor' | 'laporan' | 'kepatuhan'
  | 'pegawai' | 'pemetaan' | 'pertanyaan' | 'progress';

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
