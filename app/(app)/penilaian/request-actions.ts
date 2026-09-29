'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';

/**
 * PERMOHONAN PEMETAAN oleh pegawai (migrasi 0035) — dua jenis baru di samping
 * "koreksi relasi" yang sudah ada (lihat correction-actions.ts):
 *
 *   remove → "pemetaan ini tidak sesuai, mohon dihapus"
 *   add    → "saya perlu menilai rekan X sebagai <hubungan kerja>"
 *
 * Keduanya HANYA membuat baris permohonan; TIDAK mengubah pemetaan. HRD yang
 * memutuskan (lihat admin/pemetaan/actions.ts → reviewCorrection). Ini sengaja:
 * relasi menentukan BOBOT skor 360°, jadi penambahan/penghapusan penilai tak boleh
 * sepihak — HRD tetap gerbangnya (selaras keputusan terkunci soal Ad-Hoc & koreksi).
 *
 * Alasan WAJIB (min. 5 karakter) di kedua jenis — permohonan tanpa alasan tak bisa
 * ditimbang HRD, dan alasan itulah yang ditampilkan di kotak masuk Pemetaan.
 */
type Result = { ok: true } | { ok: false; error: string };

const Reason = z.string().trim().min(5, 'Alasan minimal 5 karakter').max(500);
const TargetId = z.string().uuid('Rekan tidak valid');
// 'Self' dikecualikan: menilai diri sendiri diatur HRD lewat pemetaan, bukan diajukan.
const REL = z.enum(['Atasan', 'Peer', 'Cross', 'Bawahan']);

/**
 * Gerbang fase: permohonan boleh dikirim saat pemetaan SUDAH diumumkan (fase tinjau)
 * ATAU form penilaian sedang terbuka. Menutup form di akhir siklus (pembekuan untuk
 * finalisasi) otomatis menutup jalur ini juga — pemetaan tak boleh berubah saat hasil
 * sedang dikunci.
 */
async function activePeriodForRequest(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: ap } = await supabase
    .from('periods').select('id, has_360, form_open, mapping_published')
    .eq('status', 'active').limit(1).maybeSingle();
  if (!ap) return { ok: false as const, error: 'Tidak ada periode aktif' };
  if (!ap.has_360) return { ok: false as const, error: 'Penilaian 360° untuk periode ini belum dibuka oleh HRD' };
  if (!ap.mapping_published && !ap.form_open) {
    return { ok: false as const, error: 'Pemetaan belum diumumkan HRD — permohonan belum bisa dikirim' };
  }
  return { ok: true as const, period: ap };
}

/** Satu permohonan PENDING per pasangan penilai→target, apa pun jenisnya. */
async function hasPending(
  supabase: Awaited<ReturnType<typeof createClient>>, userId: string, targetId: string, periodId: string,
) {
  const { data } = await supabase.from('relation_correction_requests').select('id')
    .eq('assessor_id', userId).eq('target_id', targetId).eq('period_id', periodId)
    .eq('status', 'pending').maybeSingle();
  return !!data;
}

/**
 * Ajukan penghapusan sebuah pemetaan milik sendiri (mis. tak pernah bekerja sama).
 * DIAKTIFKAN KEMBALI 2026-09-29 (Exposure Check sedang dinonaktifkan sementara — lihat
 * [targetId]/page.tsx — jadi ini kembali jadi satu-satunya jalur rater melapor tak perlu
 * menilai seseorang). Hanya MENGIRIM permohonan; pemetaan baru hilang setelah HRD
 * menyetujui (reviewCorrection di admin/pemetaan/actions.ts) — HRD tetap gerbangnya.
 */
export async function requestMappingRemoval(
  mappingId: string, targetId: string, rawReason: string,
): Promise<Result> {
  const reason = Reason.safeParse(rawReason);
  if (!reason.success) return { ok: false, error: reason.error.issues[0].message };
  const tid = TargetId.safeParse(targetId);
  if (!tid.success) return { ok: false, error: tid.error.issues[0].message };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Sesi berakhir, silakan login ulang' };

  const gate = await activePeriodForRequest(supabase);
  if (!gate.ok) return gate;

  // Pemetaan wajib milik pengaju (otorisasi tambahan di atas RLS).
  const { data: map } = await supabase.from('mappings')
    .select('id, relation').eq('id', mappingId)
    .eq('assessor_id', user.id).eq('target_id', tid.data).eq('is_active', true).maybeSingle();
  if (!map) return { ok: false, error: 'Pemetaan tidak ditemukan / bukan milik Anda' };

  if (await hasPending(supabase, user.id, tid.data, gate.period.id)) {
    return { ok: false, error: 'Sudah ada permohonan yang menunggu untuk rekan ini' };
  }

  const { error } = await supabase.from('relation_correction_requests').insert({
    kind: 'remove', mapping_id: map.id, period_id: gate.period.id,
    assessor_id: user.id, target_id: tid.data,
    old_relation: map.relation, new_relation: null,
    reason: reason.data, status: 'pending',
  });
  if (error) return { ok: false, error: 'Gagal mengirim: ' + error.message };

  revalidatePath('/penilaian');
  revalidatePath('/admin/pemetaan');
  return { ok: true };
}

/**
 * Ajukan penilaian atas rekan yang belum ada di daftar, LENGKAP dengan hubungan kerja
 * yang diusulkan. Berbeda dari Ad-Hoc (yang instan & dikunci 'Cross'): di sini relasi
 * bebas diusulkan, tapi baru berlaku setelah HRD menyetujui.
 */
export async function requestNewAssessment(
  rawTargetId: string, rawRelation: string, rawReason: string,
): Promise<Result> {
  const tid = TargetId.safeParse(rawTargetId);
  if (!tid.success) return { ok: false, error: tid.error.issues[0].message };
  const rel = REL.safeParse(rawRelation);
  if (!rel.success) return { ok: false, error: 'Hubungan kerja tidak valid' };
  const reason = Reason.safeParse(rawReason);
  if (!reason.success) return { ok: false, error: reason.error.issues[0].message };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Sesi berakhir, silakan login ulang' };
  if (tid.data === user.id) return { ok: false, error: 'Tidak dapat mengajukan penilaian untuk diri sendiri' };

  const gate = await activePeriodForRequest(supabase);
  if (!gate.ok) return gate;

  // Target wajib pegawai sah & boleh dinilai (aturan sama dengan Ad-Hoc).
  const { data: target } = await supabase.from('employees')
    .select('id, role, is_external, is_active').eq('id', tid.data).maybeSingle();
  if (!target) return { ok: false, error: 'Pegawai tidak ditemukan' };
  if (!target.is_active) return { ok: false, error: 'Pegawai ini sudah nonaktif' };
  if (target.role === 'direksi') return { ok: false, error: 'Direksi tidak dinilai lewat jalur ini' };
  if (target.is_external) return { ok: false, error: 'Pegawai eksternal hanya dapat menjadi penilai, tidak dapat dinilai' };

  // Sudah ada di daftar → tak perlu diajukan (pakai Koreksi Relasi bila relasinya keliru).
  const { data: existing } = await supabase.from('mappings').select('id')
    .eq('period_id', gate.period.id).eq('assessor_id', user.id).eq('target_id', tid.data)
    .eq('is_active', true).maybeSingle();
  if (existing) return { ok: false, error: 'Rekan ini sudah ada di daftar penilaian Anda' };

  if (await hasPending(supabase, user.id, tid.data, gate.period.id)) {
    return { ok: false, error: 'Sudah ada permohonan yang menunggu untuk rekan ini' };
  }

  const { error } = await supabase.from('relation_correction_requests').insert({
    kind: 'add', mapping_id: null, period_id: gate.period.id,
    assessor_id: user.id, target_id: tid.data,
    old_relation: null, new_relation: rel.data,
    reason: reason.data, status: 'pending',
  });
  if (error) return { ok: false, error: 'Gagal mengirim: ' + error.message };

  revalidatePath('/penilaian');
  revalidatePath('/admin/pemetaan');
  return { ok: true };
}
