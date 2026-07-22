'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { canSection, grantedAccess, employeeInScopes } from '@/lib/auth/roles';
import { logHrdAction, logAuditAsService, type AuditEntry } from '@/lib/audit/log';
import { finalScoreOf } from '@/lib/scoring';

/**
 * Review Hasil Akhir: hitung Skor Akhir kalibrasi & tulis final_reports.
 *
 * DUA jalur penulis (Tahap 2 — Manajemen Akses):
 *   1. HRD PENUH (Mode Admin): tulis via klien user-scoped, RLS fr_hrd mengizinkan.
 *   2. PEMEGANG GRANT "Review Hasil Akhir" boleh-edit + target dalam lingkup: tulis via
 *      service_role (pemegang non-HRD ditolak RLS fr_hrd → INI gembok NYATA-nya). Lingkup &
 *      can_edit dicek di `resolveReportWriteActor` sebelum menulis.
 * SADAR-MODE: HRD di Mode-SPV TIDAK dianggap HRD penuh (paritas) — ia harus punya grant untuk menulis.
 * Finalisasi mengubah status → 'finalized' sehingga pegawai bisa melihat (fr_read).
 */

/**
 * Otorisasi + pilih klien untuk aksi TULIS satu laporan pegawai. Mengembalikan `db` yang tepat
 * (user-scoped untuk HRD penuh; service_role untuk pemegang grant berlingkup) atau error.
 */
type ReportWriteActor =
  | { ok: true; userId: string; userName: string | null; db: Awaited<ReturnType<typeof createClient>>; viaGrant: boolean }
  | { ok: false; error: string };

async function resolveReportWriteActor(
  supabase: Awaited<ReturnType<typeof createClient>>,
  employeeId: string,
): Promise<ReportWriteActor> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Sesi berakhir, silakan login ulang' };
  const { data: me } = await supabase
    .from('employees').select('role, is_hrd_admin, hrd_sections, dept, name').eq('id', user.id).maybeSingle();

  // SADAR-MODE: HRD "penuh" HANYA di Mode Admin (paritas dgn gate halaman Review Hasil Akhir).
  const jar = await cookies();
  const hrdMode = jar.get('hrd_mode')?.value === 'admin' ? 'admin' : 'spv';
  if (canSection(me, 'laporan') && hrdMode === 'admin') {
    return { ok: true, userId: user.id, userName: me?.name ?? null, db: supabase, viaGrant: false };
  }

  // Jalur GRANT: pemegang akses "Review Hasil Akhir" boleh-edit dgn target di dalam SALAH SATU lingkup.
  const { data: grantRows } = await supabase.from('page_grants').select('section, scope, scopes, can_edit').eq('employee_id', user.id);
  const access = grantedAccess(grantRows, 'review');
  if (!access) return { ok: false, error: 'Hanya HRD atau pemegang akses Review Hasil Akhir yang dapat mengubah laporan.' };
  if (!access.canEdit) return { ok: false, error: 'Akses Anda ke Review Hasil Akhir bersifat hanya-lihat.' };

  // dept target dibaca via service_role (pemegang grant bukan is_hrd() → RLS memblokir baca lintas-pegawai).
  const admin = createAdminClient();
  const { data: target } = await admin.from('employees').select('dept').eq('id', employeeId).maybeSingle();
  if (!target) return { ok: false, error: 'Pegawai tidak ditemukan.' };
  // Target harus masuk SALAH SATU lingkup grant (employeeInScopes; 'self' = hanya laporan diri sendiri).
  if (!employeeInScopes(access.scopes, me?.dept ?? '', user.id, { id: employeeId, dept: target.dept ?? null })) {
    return { ok: false, error: 'Pegawai ini di luar lingkup akses yang diberikan kepada Anda.' };
  }
  // Tulis via service_role: pemegang grant non-HRD ditolak RLS fr_hrd, jadi HANYA jalur ini (yang
  // sudah mengecek can_edit + lingkup) yang bisa menulis = gembok nyata untuk penulis non-HRD.
  return { ok: true, userId: user.id, userName: me?.name ?? null, db: admin as typeof supabase, viaGrant: true };
}

/** Catat aksi laporan: HRD penuh → logHrdAction (RLS is_hrd); pemegang grant → service_role. */
async function logReportAction(actor: { userId: string; userName: string | null; viaGrant: boolean }, entry: AuditEntry): Promise<void> {
  if (actor.viaGrant) await logAuditAsService(entry, { id: actor.userId, name: actor.userName });
  else await logHrdAction(entry);
}

async function computeFinal(
  supabase: Awaited<ReturnType<typeof createClient>>,
  periodId: string, has360: boolean, employeeId: string,
) {
  const { data: months } = await supabase.from('period_months').select('ym').eq('period_id', periodId);
  const yms = (months ?? []).map((m) => m.ym);
  const { data: kpi } = yms.length
    ? await supabase.from('kpi_scores').select('score').eq('employee_id', employeeId).in('ym', yms)
    : { data: [] };
  const kpiAvg = kpi && kpi.length ? kpi.reduce((a, b) => a + b.score, 0) / kpi.length : null;
  const { data: r } = await supabase.from('result_360').select('score')
    .eq('employee_id', employeeId).eq('period_id', periodId).maybeSingle();
  const s360 = r?.score ?? null;
  const { data: p } = await supabase.from('compliance_penalties').select('points')
    .eq('employee_id', employeeId).eq('period_id', periodId).maybeSingle();
  const penalty = p?.points ?? 0;
  // allow360Only: subjek ber-360°-tanpa-KPI (mis. Direksi) → Skor Akhir dihitung dari 360° saja.
  return { kpiAvg, s360, penalty, final: finalScoreOf(kpiAvg, s360, has360, penalty, true) };
}

export type FinalizeResult = { ok: true; finalScore: number; finalized: boolean } | { ok: false; error: string };

export async function saveOrFinalizeReport(employeeId: string, finalize: boolean): Promise<FinalizeResult> {
  const supabase = await createClient();
  const actor = await resolveReportWriteActor(supabase, employeeId);
  if (!actor.ok) return { ok: false, error: actor.error };
  const db = actor.db;

  const { data: ap } = await db
    .from('periods').select('id, has_360, status').eq('status', 'active').limit(1).maybeSingle();
  if (!ap) return { ok: false, error: 'Tidak ada periode aktif' };

  const { final } = await computeFinal(db, ap.id, ap.has_360, employeeId);
  if (final == null) {
    // Tolak hanya bila KPI DAN 360° dua-duanya kosong (tak ada dasar skor). Subjek ber-360°-
    // tanpa-KPI (mis. Direksi) TETAP boleh: Skor Akhir dari 360° (lihat computeFinal allow360Only).
    return { ok: false, error: 'Skor Akhir belum bisa dihitung (KPI & Skor 360° pegawai keduanya masih kosong)' };
  }

  const status = finalize ? 'finalized' : 'draft';
  const { data: existing } = await db
    .from('final_reports').select('id')
    .eq('employee_id', employeeId).eq('period_id', ap.id).maybeSingle();

  if (existing) {
    const { error } = await db.from('final_reports')
      .update({ final_score: final, status, finalized_by: finalize ? actor.userId : null })
      .eq('id', existing.id);
    if (error) return { ok: false, error: 'Gagal menyimpan: ' + error.message };
  } else {
    const { error } = await db.from('final_reports')
      .insert({ employee_id: employeeId, period_id: ap.id, final_score: final, status, finalized_by: finalize ? actor.userId : null });
    if (error) return { ok: false, error: 'Gagal menyimpan: ' + error.message };
  }

  const { data: emp } = await db.from('employees').select('name').eq('id', employeeId).maybeSingle();
  await logReportAction(actor, {
    action: finalize ? 'report.finalize' : 'report.save_draft', category: 'laporan',
    summary: finalize
      ? `Memfinalisasi Hasil Akhir ${emp?.name ?? employeeId} (Skor Akhir ${final}) — laporan dirilis ke pegawai`
      : `Menyimpan draft Hasil Akhir ${emp?.name ?? employeeId} (Skor Akhir ${final})`,
    targetType: 'employee', targetId: employeeId, targetLabel: emp?.name ?? null,
    meta: { final_score: final, period_id: ap.id, via_grant: actor.viaGrant },
  });
  revalidatePath('/admin/laporan');
  revalidatePath('/laporan');
  return { ok: true, finalScore: final, finalized: finalize };
}

/**
 * Rilis hasil ke SPV (HRD): status 'draft' → 'in_review'. Setelah ini SPV anggota
 * tim boleh melihat DETAIL AGREGAT (radar/aspek + ringkasan aspek HRD, tanpa raw).
 * Tidak mengubah skor; menghitung & menyimpan final_score bila baris belum ada.
 * NON-BLOK terhadap finalisasi — HRD tetap bisa finalisasi tanpa menunggu ACC SPV.
 */
export async function releaseToSpv(employeeId: string): Promise<FinalizeResult> {
  const supabase = await createClient();
  const actor = await resolveReportWriteActor(supabase, employeeId);
  if (!actor.ok) return { ok: false, error: actor.error };
  const db = actor.db;

  const { data: ap } = await db
    .from('periods').select('id, has_360, status').eq('status', 'active').limit(1).maybeSingle();
  if (!ap) return { ok: false, error: 'Tidak ada periode aktif' };

  const { final } = await computeFinal(db, ap.id, ap.has_360, employeeId);
  if (final == null) {
    // Tolak hanya bila KPI & 360° dua-duanya kosong (selaras saveOrFinalizeReport).
    return { ok: false, error: 'Skor Akhir belum bisa dihitung (KPI & Skor 360° pegawai keduanya masih kosong)' };
  }

  const { data: existing } = await db
    .from('final_reports').select('id, status')
    .eq('employee_id', employeeId).eq('period_id', ap.id).maybeSingle();

  if (existing?.status === 'finalized') {
    return { ok: false, error: 'Laporan sudah difinalisasi — tidak bisa dikembalikan ke tahap tinjauan SPV' };
  }

  if (existing) {
    const { error } = await db.from('final_reports')
      .update({ final_score: final, status: 'in_review', finalized_by: null })
      .eq('id', existing.id);
    if (error) return { ok: false, error: 'Gagal merilis: ' + error.message };
  } else {
    const { error } = await db.from('final_reports')
      .insert({ employee_id: employeeId, period_id: ap.id, final_score: final, status: 'in_review' });
    if (error) return { ok: false, error: 'Gagal merilis: ' + error.message };
  }

  const { data: emp } = await db.from('employees').select('name').eq('id', employeeId).maybeSingle();
  await logReportAction(actor, {
    action: 'report.release_spv', category: 'laporan',
    summary: `Merilis Hasil Akhir ${emp?.name ?? employeeId} ke SPV untuk ditinjau (Skor Akhir ${final})`,
    targetType: 'employee', targetId: employeeId, targetLabel: emp?.name ?? null,
    meta: { final_score: final, period_id: ap.id, via_grant: actor.viaGrant },
  });
  revalidatePath('/admin/laporan');
  revalidatePath('/laporan-tim');
  revalidatePath(`/laporan/${employeeId}`);
  return { ok: true, finalScore: final, finalized: false };
}

export type BulkFinalizeResult =
  | { ok: true; finalized: number; skipped: { name: string; reason: string }[] }
  | { ok: false; error: string };

/**
 * Finalisasi MASSAL laporan yang SUDAH di-ACC (SPV/Koordinator/Direksi) & masih `in_review`.
 * Konvensi kolom: ACC = `spv_acc=true`; hanya status `in_review` yang difinalisasi (draf belum
 * boleh di-ACC; `finalized` sudah selesai). Tiap laporan Skor Akhir-nya dihitung ulang (computeFinal,
 * memakai result_360 tersimpan — HRD diharapkan sudah "Hitung Ulang Skor 360°"). Yang skornya belum
 * bisa dihitung (KPI & 360° kosong) DILEWATI dengan alasan. HRD-only; tercatat di Log Aktivitas HRD.
 *
 * SADAR-MODE + HRD-penuh SAJA: finalisasi massal sengaja TIDAK dibuka untuk pemegang grant
 * (permukaan luas, lintas-lingkup) — pemegang grant boleh-edit memfinalisasi PER-ORANG lewat detail.
 */
export async function bulkFinalizeAccepted(): Promise<BulkFinalizeResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Sesi berakhir, silakan login ulang' };
  const { data: me } = await supabase.from('employees').select('role, is_hrd_admin, hrd_sections').eq('id', user.id).maybeSingle();
  const jar = await cookies();
  const hrdMode = jar.get('hrd_mode')?.value === 'admin' ? 'admin' : 'spv';
  if (!(canSection(me, 'laporan') && hrdMode === 'admin')) return { ok: false, error: 'Hanya HRD (Mode Admin) yang dapat memfinalisasi massal' };

  const { data: ap } = await supabase
    .from('periods').select('id, has_360, status').eq('status', 'active').limit(1).maybeSingle();
  if (!ap) return { ok: false, error: 'Tidak ada periode aktif' };

  const { data: candidates } = await supabase.from('final_reports')
    .select('id, employee_id').eq('period_id', ap.id).eq('spv_acc', true).eq('status', 'in_review');
  const list = candidates ?? [];
  if (!list.length) return { ok: true, finalized: 0, skipped: [] };

  const { data: emps } = await supabase.from('employees').select('id, name').in('id', list.map((r) => r.employee_id));
  const nameById = new Map((emps ?? []).map((e) => [e.id, e.name]));

  let finalized = 0;
  const skipped: { name: string; reason: string }[] = [];
  for (const r of list) {
    const label = nameById.get(r.employee_id) ?? r.employee_id;
    const { final } = await computeFinal(supabase, ap.id, ap.has_360, r.employee_id);
    if (final == null) { skipped.push({ name: label, reason: 'Skor Akhir belum bisa dihitung (KPI & 360° kosong)' }); continue; }
    const { error } = await supabase.from('final_reports')
      .update({ final_score: final, status: 'finalized', finalized_by: user.id }).eq('id', r.id);
    if (error) { skipped.push({ name: label, reason: error.message }); continue; }
    finalized++;
  }

  await logHrdAction({
    action: 'report.bulk_finalize', category: 'laporan',
    summary: `Finalisasi massal ${finalized} laporan ber-ACC${skipped.length ? ` (${skipped.length} dilewati)` : ''}`,
    meta: { finalized, skipped: skipped.length, period_id: ap.id },
  });
  revalidatePath('/admin/laporan');
  revalidatePath('/laporan');
  return { ok: true, finalized, skipped };
}

/**
 * Simpan ringkasan HRD per aspek (kalibrasi naratif) ke final_reports.content.aspectSummaries.
 * Tidak mengubah status/skor — hanya menulis narasi. Membuat baris draft bila belum ada.
 */
const SummariesInput = z.record(z.string(), z.string().trim().max(2000));
export async function saveAspectSummaries(employeeId: string, raw: unknown): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = SummariesInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: 'Ringkasan tidak valid' };
  // Buang entri kosong.
  const summaries: Record<string, string> = {};
  for (const [k, v] of Object.entries(parsed.data)) { if (v.trim()) summaries[k] = v.trim(); }

  const supabase = await createClient();
  const actor = await resolveReportWriteActor(supabase, employeeId);
  if (!actor.ok) return { ok: false, error: actor.error };
  const db = actor.db;

  const { data: ap } = await db.from('periods').select('id, has_360').eq('status', 'active').limit(1).maybeSingle();
  if (!ap) return { ok: false, error: 'Tidak ada periode aktif' };

  const { data: existing } = await db.from('final_reports')
    .select('id, content, status').eq('employee_id', employeeId).eq('period_id', ap.id).maybeSingle();

  // Laporan FINAL terkunci: ringkasan tak bisa diubah sampai dikembalikan ke draf
  // (selaras penguncian editor di UI — sumber kebenaran yang dilihat pegawai tak berubah diam-diam).
  if (existing?.status === 'finalized') {
    return { ok: false, error: 'Laporan sudah final — kembalikan ke draf dulu untuk mengedit ringkasan.' };
  }

  if (existing) {
    const content = { ...(existing.content as Record<string, unknown> ?? {}), aspectSummaries: summaries };
    // .select() agar tahu jumlah baris terupdate — RLS yang menolak diam-diam (0 baris,
    // tanpa error) tak lagi lolos sebagai "tersimpan".
    const { data: upd, error } = await db.from('final_reports')
      .update({ content }).eq('id', existing.id).select('id');
    if (error) return { ok: false, error: 'Gagal menyimpan: ' + error.message };
    if (!upd || upd.length === 0) return { ok: false, error: 'Gagal menyimpan ringkasan (akses ditolak / laporan tak ditemukan)' };
  } else {
    const { final } = await computeFinal(db, ap.id, ap.has_360, employeeId);
    const { error } = await db.from('final_reports').insert({
      employee_id: employeeId, period_id: ap.id, final_score: final, status: 'draft',
      content: { aspectSummaries: summaries },
    });
    if (error) return { ok: false, error: 'Gagal menyimpan: ' + error.message };
  }

  const { data: emp } = await db.from('employees').select('name').eq('id', employeeId).maybeSingle();
  await logReportAction(actor, {
    action: 'report.save_summary', category: 'laporan',
    summary: `Menyimpan ringkasan aspek 360° untuk ${emp?.name ?? employeeId}`,
    targetType: 'employee', targetId: employeeId, targetLabel: emp?.name ?? null,
    meta: { via_grant: actor.viaGrant },
  });
  revalidatePath(`/laporan/${employeeId}`);
  return { ok: true };
}

/**
 * Simpan ringkasan HRD per PERTANYAAN KUALITATIF (esai) → final_reports.content.qualSummaries.
 * Kembar dari saveAspectSummaries; hanya field content yang berbeda. Tidak mengubah status/skor;
 * membuat baris draft bila belum ada. Terkunci bila laporan sudah 'finalized'.
 */
export async function saveQualSummaries(employeeId: string, raw: unknown): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = SummariesInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: 'Ringkasan tidak valid' };
  const summaries: Record<string, string> = {};
  for (const [k, v] of Object.entries(parsed.data)) { if (v.trim()) summaries[k] = v.trim(); }

  const supabase = await createClient();
  const actor = await resolveReportWriteActor(supabase, employeeId);
  if (!actor.ok) return { ok: false, error: actor.error };
  const db = actor.db;

  const { data: ap } = await db.from('periods').select('id, has_360').eq('status', 'active').limit(1).maybeSingle();
  if (!ap) return { ok: false, error: 'Tidak ada periode aktif' };

  const { data: existing } = await db.from('final_reports')
    .select('id, content, status').eq('employee_id', employeeId).eq('period_id', ap.id).maybeSingle();

  if (existing?.status === 'finalized') {
    return { ok: false, error: 'Laporan sudah final — kembalikan ke draf dulu untuk mengedit ringkasan.' };
  }

  if (existing) {
    const content = { ...(existing.content as Record<string, unknown> ?? {}), qualSummaries: summaries };
    const { data: upd, error } = await db.from('final_reports')
      .update({ content }).eq('id', existing.id).select('id');
    if (error) return { ok: false, error: 'Gagal menyimpan: ' + error.message };
    if (!upd || upd.length === 0) return { ok: false, error: 'Gagal menyimpan ringkasan (akses ditolak / laporan tak ditemukan)' };
  } else {
    const { final } = await computeFinal(db, ap.id, ap.has_360, employeeId);
    const { error } = await db.from('final_reports').insert({
      employee_id: employeeId, period_id: ap.id, final_score: final, status: 'draft',
      content: { qualSummaries: summaries },
    });
    if (error) return { ok: false, error: 'Gagal menyimpan: ' + error.message };
  }

  const { data: emp } = await db.from('employees').select('name').eq('id', employeeId).maybeSingle();
  await logReportAction(actor, {
    action: 'report.save_qual_summary', category: 'laporan',
    summary: `Menyimpan ringkasan pertanyaan kualitatif 360° untuk ${emp?.name ?? employeeId}`,
    targetType: 'employee', targetId: employeeId, targetLabel: emp?.name ?? null,
    meta: { via_grant: actor.viaGrant },
  });
  revalidatePath(`/laporan/${employeeId}`);
  return { ok: true };
}
