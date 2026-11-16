'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { logHrdAction } from '@/lib/audit/log';
import {
  violationPageAllowed, loadViolationTarget, saveViolationFollowUp,
  VIOLATION_STATUSES, VIOLATION_STATUS_LABEL, VIOLATION_RESPONSE_MAX,
} from '@/lib/outside-notes';

/**
 * Tindak lanjut Laporan Pelanggaran (migrasi 0062, pemilik 2026-11-16): HRD mengubah status (Diterima → Sedang
 * ditindaklanjuti → Selesai) dan menulis tanggapan satu arah yang dibaca pelapor di "Laporan Saya".
 *
 * Penulis = HRD Mode Admin berbagian Tinjauan & Finalisasi (gerbang halaman tanpa Direksi — Direksi hanya baca).
 * Laporan tentang diri sendiri ditolak (benturan kepentingan; HRD lain yang menindaklanjuti). Log Aktivitas mencatat
 * pelaku HRD + status saja — tanpa isi tanggapan, tanpa nama pegawai terlapor, dan tentu tanpa pelapor.
 */
type Result = { ok: true } | { ok: false; error: string };

const Input = z.object({
  id: z.string().uuid('Laporan tidak valid'),
  status: z.enum(VIOLATION_STATUSES, { message: 'Status tidak valid' }),
  response: z.string().trim().max(VIOLATION_RESPONSE_MAX, `Tanggapan maksimal ${VIOLATION_RESPONSE_MAX} karakter`),
});

export async function setViolationFollowUp(rawId: string, rawStatus: string, rawResponse: string): Promise<Result> {
  const parsed = Input.safeParse({ id: rawId, status: rawStatus, response: rawResponse ?? '' });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const { id, status, response } = parsed.data;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Sesi berakhir. Silakan masuk kembali.' };
  const { data: me } = await supabase.from('employees').select('role, is_hrd_admin, hrd_sections').eq('id', user.id).maybeSingle();
  const hrdMode = (await cookies()).get('hrd_mode')?.value === 'admin' ? 'admin' : 'spv';
  if (!me || me.role === 'direksi' || !violationPageAllowed(me, hrdMode)) {
    return { ok: false, error: 'Hanya HRD di Mode Admin yang dapat menindaklanjuti laporan' };
  }

  const admin = createAdminClient();
  const target = await loadViolationTarget(admin as unknown as Parameters<typeof loadViolationTarget>[0], id);
  if (!target) return { ok: false, error: 'Laporan tidak ditemukan' };
  if (target === user.id) return { ok: false, error: 'Laporan tentang diri Anda ditindaklanjuti HRD lain' };

  const res = await saveViolationFollowUp(admin as unknown as Parameters<typeof saveViolationFollowUp>[0], id, status, response || null);
  if (!res.ok) {
    return { ok: false, error: res.missing ? 'Fitur tindak lanjut belum aktif. Hubungi admin aplikasi.' : 'Gagal menyimpan tindak lanjut, coba lagi' };
  }
  await logHrdAction({
    action: 'violation.followUp', category: 'laporan',
    summary: `Memperbarui tindak lanjut sebuah laporan pelanggaran (status: ${VIOLATION_STATUS_LABEL[status]})`,
    targetType: 'violation_report', targetId: id, targetLabel: null, meta: { status },
  });
  revalidatePath('/admin/pelanggaran');
  return { ok: true };
}
