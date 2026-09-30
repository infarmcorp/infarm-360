'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { canSection } from '@/lib/auth/roles';
import { logHrdAction } from '@/lib/audit/log';
import { refreshLatePenalties } from '@/lib/late-server';

/**
 * Kelola Siklus Periode (HRD) — gerbang seluruh proses.
 *  - createPeriod: buat kuartal + bulan-bulannya (status awal 'ended' = belum aktif).
 *  - activatePeriod: jadikan SATU periode aktif (lainnya di-end → invarian 1 aktif).
 *  - endPeriod: "Kunci & Akhiri" → status 'ended' (RLS menolak tulis penilaian non-aktif).
 *  - toggleHas360: aktif/nonaktif komponen 360 (mengubah rumus Skor Akhir).
 * RLS periods_write/period_months_write = HRD; tak perlu service_role.
 */
async function requireHrd(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<{ ok: true; userId: string } | { ok: false; error: string }> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Sesi berakhir, silakan login ulang' };
  const { data: me } = await supabase.from('employees').select('role, is_hrd_admin, hrd_sections').eq('id', user.id).maybeSingle();
  if (!canSection(me, 'periode')) return { ok: false, error: 'Hanya HRD yang dapat mengelola periode' };
  return { ok: true, userId: user.id };
}

function monthsBetween(start: string, end: string): string[] {
  const [sy, sm] = start.split('-').map(Number);
  const [ey, em] = end.split('-').map(Number);
  const out: string[] = [];
  let y = sy, m = sm;
  while ((y < ey || (y === ey && m <= em)) && out.length < 24) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m++; if (m > 12) { m = 1; y++; }
  }
  return out;
}

type Result = { ok: true } | { ok: false; error: string };

const CreateInput = z.object({
  label: z.string().trim().min(2, 'Label terlalu pendek').max(40),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Tanggal mulai tidak valid'),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Tanggal selesai tidak valid'),
  has360: z.boolean(),
  kpiStandard: z.number().int().min(0).max(100).default(80),
});

export async function createPeriod(raw: unknown): Promise<Result> {
  const parsed = CreateInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Input tidak valid' };
  const { label, startDate, endDate, has360, kpiStandard } = parsed.data;
  if (endDate < startDate) return { ok: false, error: 'Tanggal selesai sebelum tanggal mulai' };

  const supabase = await createClient();
  const auth = await requireHrd(supabase);
  if (!auth.ok) return { ok: false, error: auth.error };

  const code = label.replace(/\s+/g, '-');
  const months = monthsBetween(startDate.slice(0, 7), endDate.slice(0, 7));
  if (months.length === 0) return { ok: false, error: 'Rentang bulan kosong' };

  const { data: period, error } = await supabase.from('periods')
    .insert({ code, label, start_date: startDate, end_date: endDate, status: 'ended', has_360: has360, kpi_standard: kpiStandard })
    .select('id').single();
  if (error) {
    return { ok: false, error: error.code === '23505' ? `Kode "${code}" sudah ada` : 'Gagal membuat periode: ' + error.message };
  }
  const { error: mErr } = await supabase.from('period_months')
    .insert(months.map((ym) => ({ period_id: period.id, ym })));
  if (mErr) return { ok: false, error: 'Periode dibuat tapi gagal isi bulan: ' + mErr.message };

  await logHrdAction({
    action: 'period.create', category: 'periode',
    summary: `Membuat periode "${label}" (${startDate} s.d. ${endDate}, 360° ${has360 ? 'aktif' : 'nonaktif'})`,
    targetType: 'period', targetId: period.id, targetLabel: label,
  });
  revalidatePath('/admin/periode');
  return { ok: true };
}

export async function activatePeriod(periodId: string): Promise<Result> {
  const supabase = await createClient();
  const auth = await requireHrd(supabase);
  if (!auth.ok) return { ok: false, error: auth.error };
  // CATATAN (keputusan pengguna 2026-09-29): periode yang sudah dikunci BOLEH dibuka kembali, termasuk
  // yang sudah punya laporan final. Laporan final tetap aman — Skor Akhir tersimpan tak berubah otomatis;
  // selisih akibat edit sesudah dibuka ditandai "berubah → N" di Review Hasil Akhir (hasScoreDrift).
  // Akhiri semua periode lain → jaga hanya satu aktif.
  const { error: e1 } = await supabase.from('periods').update({ status: 'ended' }).neq('id', periodId);
  if (e1) return { ok: false, error: 'Gagal: ' + e1.message };
  const { error: e2 } = await supabase.from('periods').update({ status: 'active' }).eq('id', periodId);
  if (e2) return { ok: false, error: 'Gagal: ' + e2.message };

  const { data: pr } = await supabase.from('periods').select('label').eq('id', periodId).maybeSingle();
  await logHrdAction({
    action: 'period.activate', category: 'periode',
    summary: `Mengaktifkan periode "${pr?.label ?? periodId}" (periode lain diakhiri)`,
    targetType: 'period', targetId: periodId, targetLabel: pr?.label ?? null,
  });
  revalidatePath('/admin/periode');
  return { ok: true };
}

export async function endPeriod(periodId: string): Promise<Result> {
  const supabase = await createClient();
  const auth = await requireHrd(supabase);
  if (!auth.ok) return { ok: false, error: auth.error };
  const { error } = await supabase.from('periods').update({ status: 'ended' }).eq('id', periodId);
  if (error) return { ok: false, error: 'Gagal mengunci: ' + error.message };

  const { data: pr } = await supabase.from('periods').select('label').eq('id', periodId).maybeSingle();
  await logHrdAction({
    action: 'period.lock', category: 'periode',
    summary: `Mengunci & mengakhiri periode "${pr?.label ?? periodId}"`,
    targetType: 'period', targetId: periodId, targetLabel: pr?.label ?? null,
  });
  revalidatePath('/admin/periode');
  return { ok: true };
}

/**
 * Kesiapan periode AKTIF — palang pengaman sebelum HRD mengaktifkan periode lain
 * (yang akan MENGUNCI periode aktif sekarang). Mengembalikan jumlah pekerjaan tertunda:
 * 360° belum lengkap, draf belum dikirim, laporan belum difinalisasi.
 */
export async function activePeriodReadiness(): Promise<
  { ok: true; active: { id: string; label: string; pending360: number; drafts: number; unfinalized: number } | null }
  | { ok: false; error: string }
> {
  const supabase = await createClient();
  const auth = await requireHrd(supabase);
  if (!auth.ok) return { ok: false, error: auth.error };

  const { data: ap } = await supabase
    .from('periods').select('id, label, has_360').eq('status', 'active').limit(1).maybeSingle();
  if (!ap) return { ok: true, active: null };

  const [maps, subs, drafts, emps, finals] = await Promise.all([
    // Selaras dgn sidebar Tugas (lib/todos/compute.ts hrdAdminTodos): HANYA pemetaan AKTIF dihitung
    // sebagai penilaian tertunda — pemetaan non-aktif (mis. dari pegawai dinonaktifkan) bukan
    // pekerjaan tersisa, agar warning dialog & notifikasi sidebar SINKRON.
    supabase.from('mappings').select('*', { count: 'exact', head: true }).eq('period_id', ap.id).eq('is_active', true),
    supabase.from('assessments').select('*', { count: 'exact', head: true }).eq('period_id', ap.id).eq('status', 'submitted'),
    supabase.from('assessments').select('*', { count: 'exact', head: true }).eq('period_id', ap.id).eq('status', 'draft'),
    // Selaras dgn sidebar Tugas (lib/todos/compute.ts): pegawai eksternal TAK dibuatkan
    // laporan final → dikecualikan agar hitungan "belum difinalisasi" konsisten (bukan overcount).
    supabase.from('employees').select('*', { count: 'exact', head: true }).eq('is_active', true).neq('role', 'direksi').eq('is_external', false),
    supabase.from('final_reports').select('*', { count: 'exact', head: true }).eq('period_id', ap.id).eq('status', 'finalized'),
  ]);
  const pending360 = ap.has_360 ? Math.max(0, (maps.count ?? 0) - (subs.count ?? 0)) : 0;
  const unfinalized = Math.max(0, (emps.count ?? 0) - (finals.count ?? 0));
  return { ok: true, active: { id: ap.id, label: ap.label, pending360, drafts: drafts.count ?? 0, unfinalized } };
}

/**
 * Set Target/Standar KPI periode (metrik dashboard "% di atas standar"). HRD-only.
 * Murni pelaporan — tidak memengaruhi rumus skor (lihat migrasi 0010).
 */
export async function setKpiStandard(periodId: string, value: number): Promise<Result> {
  if (!Number.isInteger(value) || value < 0 || value > 100) {
    return { ok: false, error: 'Standar KPI harus bilangan bulat 0–100' };
  }
  const supabase = await createClient();
  const auth = await requireHrd(supabase);
  if (!auth.ok) return { ok: false, error: auth.error };
  const { error } = await supabase.from('periods').update({ kpi_standard: value }).eq('id', periodId);
  if (error) return { ok: false, error: 'Gagal: ' + error.message };

  const { data: pr } = await supabase.from('periods').select('label').eq('id', periodId).maybeSingle();
  await logHrdAction({
    action: 'period.setKpiStandard', category: 'periode',
    summary: `Mengatur Standar KPI periode "${pr?.label ?? periodId}" → ≥${value}`,
    targetType: 'period', targetId: periodId, targetLabel: pr?.label ?? null, meta: { kpi_standard: value },
  });
  revalidatePath('/admin/periode');
  revalidatePath('/admin/dashboard');
  return { ok: true };
}

/**
 * Atur DEADLINE penilaian 360° (migrasi 0036). Input `YYYY-MM-DDTHH:mm` dibaca sebagai WIB
 * (UTC+7); string kosong = hapus deadline. Form TIDAK ditutup otomatis — deadline hanya dasar
 * status On Time / Late & potongan −3 pada Skor 360° penilai yang terlambat (lib/late.ts).
 * Mengubah deadline menerapkan ulang potongan ke seluruh Skor 360° yang sudah dihitung.
 */
const DeadlineInput = z.union([z.literal(''), z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, 'Format deadline tidak valid')]);

export async function setAssessmentDeadline(periodId: string, value: string): Promise<Result> {
  if (!z.string().uuid().safeParse(periodId).success) return { ok: false, error: 'Input tidak valid' };
  const parsed = DeadlineInput.safeParse(value);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Input tidak valid' };
  const deadline = parsed.data ? new Date(`${parsed.data}:00+07:00`) : null;
  if (deadline && Number.isNaN(deadline.getTime())) return { ok: false, error: 'Tanggal deadline tidak valid' };

  const supabase = await createClient();
  const auth = await requireHrd(supabase);
  if (!auth.ok) return { ok: false, error: auth.error };
  const { error } = await supabase.from('periods')
    .update({ assessment_deadline: deadline ? deadline.toISOString() : null }).eq('id', periodId);
  if (error) return { ok: false, error: 'Gagal: ' + error.message };

  let changed = 0;
  try { changed = await refreshLatePenalties(periodId); } catch (e) {
    return { ok: false, error: 'Deadline tersimpan, tapi gagal menerapkan potongan: ' + (e instanceof Error ? e.message : String(e)) + '. Jalankan Hitung Ulang Skor 360°.' };
  }

  const { data: pr } = await supabase.from('periods').select('label').eq('id', periodId).maybeSingle();
  await logHrdAction({
    action: 'period.setDeadline', category: 'periode',
    summary: deadline
      ? `Mengatur deadline penilaian 360° periode "${pr?.label ?? periodId}" → ${parsed.data.replace('T', ' ')} WIB`
      : `Menghapus deadline penilaian 360° periode "${pr?.label ?? periodId}"`,
    targetType: 'period', targetId: periodId, targetLabel: pr?.label ?? null,
    meta: { assessment_deadline: deadline ? deadline.toISOString() : null, rescored: changed },
  });
  revalidatePath('/admin/periode');
  revalidatePath('/admin/kepatuhan');
  revalidatePath('/penilaian');
  revalidatePath('/admin/dashboard');
  revalidatePath('/admin/laporan');
  return { ok: true };
}

/** Jumlah penilaian 360° TERKIRIM di periode — dipakai memutuskan konfirmasi "matikan 360°". */
export async function count360Submitted(periodId: string): Promise<{ ok: true; count: number } | { ok: false; error: string }> {
  const supabase = await createClient();
  const auth = await requireHrd(supabase);
  if (!auth.ok) return { ok: false, error: auth.error };
  const { count } = await supabase.from('assessments')
    .select('*', { count: 'exact', head: true }).eq('period_id', periodId).eq('status', 'submitted');
  return { ok: true, count: count ?? 0 };
}

export async function toggleHas360(periodId: string, value: boolean): Promise<Result> {
  const supabase = await createClient();
  const auth = await requireHrd(supabase);
  if (!auth.ok) return { ok: false, error: auth.error };

  // Validasi PRA-PELUNCURAN saat MENGAKTIFKAN 360°: harus sudah ada pertanyaan (indikator
  // aktif) & pemetaan — cegah form 360° kosong/rusak saat tampil ke pegawai.
  if (value) {
    const { data: aspects } = await supabase.from('culture_aspects').select('id').eq('period_id', periodId);
    const aspectIds = (aspects ?? []).map((a) => a.id);
    const { count: indCount } = aspectIds.length
      ? await supabase.from('indicators').select('*', { count: 'exact', head: true }).in('aspect_id', aspectIds).eq('is_active', true)
      : { count: 0 };
    const { count: mapCount } = await supabase.from('mappings')
      .select('*', { count: 'exact', head: true }).eq('period_id', periodId).eq('is_active', true);
    const missing: string[] = [];
    if (!indCount) missing.push('pertanyaan (indikator aktif)');
    if (!mapCount) missing.push('pemetaan penilai→target');
    if (missing.length) {
      return { ok: false, error: `Tidak bisa mengaktifkan 360°: belum ada ${missing.join(' & ')}. Lengkapi dulu di Kelola Pertanyaan / Pemetaan.` };
    }
  }

  const { error } = await supabase.from('periods').update({ has_360: value }).eq('id', periodId);
  if (error) return { ok: false, error: 'Gagal: ' + error.message };

  const { data: pr } = await supabase.from('periods').select('label').eq('id', periodId).maybeSingle();
  await logHrdAction({
    action: 'period.toggle360', category: 'periode',
    summary: `${value ? 'Mengaktifkan' : 'Menonaktifkan'} komponen 360° pada periode "${pr?.label ?? periodId}"`,
    targetType: 'period', targetId: periodId, targetLabel: pr?.label ?? null, meta: { has_360: value },
  });
  revalidatePath('/admin/periode');
  revalidatePath('/admin/dashboard');
  return { ok: true };
}

/**
 * Buka/Tutup FORM penilaian 360° (form_open) — TERPISAH dari has_360. Menutup form hanya
 * menghentikan pengisian pegawai (tahap review/finalisasi); 360° TETAP dihitung ke skor &
 * tombol Hitung Ulang tetap tersedia. has_360 tak tersentuh.
 */
export async function toggleFormOpen(periodId: string, value: boolean): Promise<Result> {
  const supabase = await createClient();
  const auth = await requireHrd(supabase);
  if (!auth.ok) return { ok: false, error: auth.error };

  // BR-06 (Q3 2026): sebelum form DIBUKA (bukan ditutup), pastikan instrumen 360° siap —
  // tepat 10 indikator aktif & tiap indikator punya panduan perilaku (BARS) lengkap level
  // 1–5. Mencegah form terbuka dengan instrumen yang belum final dari Kelola Pertanyaan.
  if (value) {
    const { data: pr360 } = await supabase.from('periods').select('has_360').eq('id', periodId).maybeSingle();
    if (pr360?.has_360) {
      const { data: aspects } = await supabase.from('culture_aspects').select('id').eq('period_id', periodId);
      const aspectIds = (aspects ?? []).map((a) => a.id);
      const { data: inds } = aspectIds.length
        ? await supabase.from('indicators').select('id, text, rating_guide').in('aspect_id', aspectIds).eq('is_active', true)
        : { data: [] as { id: string; text: string; rating_guide: Record<string, string> | null }[] };
      const list = inds ?? [];
      if (list.length !== 10) {
        return { ok: false, error: `Jumlah indikator aktif harus tepat 10 (saat ini ${list.length}). Sesuaikan di Kelola Pertanyaan sebelum membuka form (BR-06).` };
      }
      const incomplete = list.filter((i) => {
        const g = i.rating_guide;
        return !g || !['1', '2', '3', '4', '5'].every((k) => (g[k] ?? '').trim().length > 0);
      });
      if (incomplete.length > 0) {
        return { ok: false, error: `${incomplete.length} indikator belum punya panduan perilaku (BARS) lengkap untuk level 1–5: ${incomplete.slice(0, 3).map((i) => i.text).join(', ')}${incomplete.length > 3 ? ', …' : ''}. Lengkapi di Kelola Pertanyaan sebelum membuka form.` };
      }
    }
  }

  const { error } = await supabase.from('periods').update({ form_open: value }).eq('id', periodId);
  if (error) return { ok: false, error: 'Gagal: ' + error.message };
  const { data: pr } = await supabase.from('periods').select('label').eq('id', periodId).maybeSingle();
  await logHrdAction({
    action: 'period.toggleForm', category: 'periode',
    summary: `${value ? 'Membuka' : 'Menutup'} form penilaian 360° pada periode "${pr?.label ?? periodId}"`,
    targetType: 'period', targetId: periodId, targetLabel: pr?.label ?? null, meta: { form_open: value },
  });
  revalidatePath('/admin/periode');
  revalidatePath('/penilaian');
  return { ok: true };
}

/**
 * Bulan yang UNIK milik sebuah periode (tak dipakai periode lain). KPI dikunci per
 * (employee, ym) — TIDAK cascade dari periods & bisa dipakai bersama bila dua periode
 * berbagi bulan. Maka KPI hanya boleh dihapus untuk bulan yang khusus periode ini.
 */
async function uniqueMonthsOf(
  admin: ReturnType<typeof createAdminClient>, periodId: string,
): Promise<string[]> {
  const { data: pm } = await admin.from('period_months').select('ym').eq('period_id', periodId);
  const myYms = (pm ?? []).map((r) => r.ym);
  if (!myYms.length) return [];
  const { data: other } = await admin.from('period_months').select('ym').neq('period_id', periodId).in('ym', myYms);
  const shared = new Set((other ?? []).map((r) => r.ym));
  return myYms.filter((y) => !shared.has(y));
}

/**
 * Rekap isi sebuah periode untuk dialog konfirmasi Hapus (meyakinkan HRD soal dampak).
 * `kpi` = jumlah baris KPI di bulan yang UNIK milik periode ini (yang akan ikut terhapus);
 * bulan yang dipakai bersama periode lain TIDAK dihitung & tidak akan dihapus.
 */
export async function periodDataCounts(periodId: string): Promise<
  | { ok: true; label: string; status: string; counts: { assessments: number; mappings: number; finalReports: number; kpi: number } }
  | { ok: false; error: string }
> {
  const supabase = await createClient();
  const auth = await requireHrd(supabase);
  if (!auth.ok) return { ok: false, error: auth.error };

  const admin = createAdminClient();
  const { data: p } = await admin.from('periods').select('label, status').eq('id', periodId).maybeSingle();
  if (!p) return { ok: false, error: 'Periode tidak ditemukan' };

  const cnt = async (q: PromiseLike<{ count: number | null }>) => (await q).count ?? 0;
  const assessments = await cnt(admin.from('assessments').select('*', { count: 'exact', head: true }).eq('period_id', periodId));
  const mappings = await cnt(admin.from('mappings').select('*', { count: 'exact', head: true }).eq('period_id', periodId));
  const finalReports = await cnt(admin.from('final_reports').select('*', { count: 'exact', head: true }).eq('period_id', periodId));
  const uniqueYms = await uniqueMonthsOf(admin, periodId);
  const kpi = uniqueYms.length
    ? await cnt(admin.from('kpi_scores').select('*', { count: 'exact', head: true }).in('ym', uniqueYms))
    : 0;

  return { ok: true, label: p.label, status: p.status, counts: { assessments, mappings, finalReports, kpi } };
}

/**
 * HAPUS PERIODE beserta seluruh datanya. Pengaman: hanya HRD, periode AKTIF ditolak
 * (harus "Kunci & Akhiri" dulu), wajib konfirmasi ketik `HAPUS`. Penghapusan baris
 * periods cascade ke months/aspek/indikator/pertanyaan/bobot/pemetaan/koreksi/penilaian
 * (+anak)/result_360/punishment/laporan final/suksesi. KPI (per ym, tak cascade) dihapus
 * manual HANYA untuk bulan unik periode ini agar tak mengganggu periode lain.
 */
export async function deletePeriod(periodId: string, confirmText: string): Promise<Result> {
  const supabase = await createClient();
  const auth = await requireHrd(supabase);
  if (!auth.ok) return { ok: false, error: auth.error };
  if (confirmText.trim().toUpperCase() !== 'HAPUS') return { ok: false, error: 'Ketik HAPUS untuk konfirmasi.' };

  const admin = createAdminClient();
  const { data: p } = await admin.from('periods').select('label, status').eq('id', periodId).maybeSingle();
  if (!p) return { ok: false, error: 'Periode tidak ditemukan' };
  if (p.status === 'active') return { ok: false, error: 'Periode aktif tidak bisa dihapus. "Kunci & Akhiri" dulu.' };

  // KPI tak cascade dari periods → hapus manual, hanya bulan UNIK periode ini. Error DIPERIKSA (dulu
  // diabaikan → periode bisa terhapus sementara KPI-nya tertinggal) & jumlah baris yang ikut terhapus
  // (termasuk jejak audit KPI) DICATAT di Log Aktivitas agar penghapusan tetap bisa ditelusuri.
  const uniqueYms = await uniqueMonthsOf(admin, periodId);
  let kpiDeleted = 0, kpiAuditDeleted = 0;
  if (uniqueYms.length) {
    const { data: a, error: aErr } = await admin.from('kpi_audit').delete().in('ym', uniqueYms).select('id');
    if (aErr) return { ok: false, error: 'Gagal menghapus jejak audit KPI periode: ' + aErr.message };
    const { data: k, error: kErr } = await admin.from('kpi_scores').delete().in('ym', uniqueYms).select('employee_id');
    if (kErr) return { ok: false, error: 'Gagal menghapus KPI periode: ' + kErr.message };
    kpiAuditDeleted = a?.length ?? 0;
    kpiDeleted = k?.length ?? 0;
  }

  const { error } = await admin.from('periods').delete().eq('id', periodId);
  if (error) return { ok: false, error: 'Gagal menghapus periode: ' + error.message };

  await logHrdAction({
    action: 'period.delete', category: 'periode',
    summary: `Menghapus periode "${p.label}" beserta seluruh datanya (${kpiDeleted} nilai KPI, ${kpiAuditDeleted} jejak audit KPI, bulan ${uniqueYms.join(', ') || '—'})`,
    targetType: 'period', targetId: periodId, targetLabel: p.label,
    meta: { kpi_deleted: kpiDeleted, kpi_audit_deleted: kpiAuditDeleted, months: uniqueYms },
  });
  revalidatePath('/admin/periode');
  revalidatePath('/admin/dashboard');
  return { ok: true };
}

/**
 * Umumkan / tarik kembali PEMETAAN 360° ke pegawai (mapping_published, migrasi 0035).
 *
 * Fase baru di antara "periode aktif" dan "form dibuka": pegawai dapat MELIHAT daftar
 * siapa yang harus dinilainya, lalu mengajukan penghapusan pemetaan yang tak sesuai atau
 * mengajukan penilaian atas rekan lain — sebelum pengisian dimulai. Sengaja TERPISAH dari
 * `form_open`, karena form juga ditutup di AKHIR siklus (pembekuan untuk finalisasi) dan
 * pada fase itu pemetaan justru tak boleh diubah.
 */
export async function toggleMappingPublished(periodId: string, value: boolean): Promise<Result> {
  const supabase = await createClient();
  const auth = await requireHrd(supabase);
  if (!auth.ok) return { ok: false, error: auth.error };
  const { error } = await supabase.from('periods').update({ mapping_published: value }).eq('id', periodId);
  if (error) return { ok: false, error: 'Gagal: ' + error.message };
  const { data: pr } = await supabase.from('periods').select('label').eq('id', periodId).maybeSingle();
  await logHrdAction({
    action: 'period.toggleMappingPublished', category: 'periode',
    summary: `${value ? 'Mengumumkan' : 'Menarik'} pemetaan 360° ${value ? 'ke' : 'dari'} pegawai pada periode "${pr?.label ?? periodId}"`,
    targetType: 'period', targetId: periodId, targetLabel: pr?.label ?? null, meta: { mapping_published: value },
  });
  revalidatePath('/admin/periode');
  revalidatePath('/admin/pemetaan');
  revalidatePath('/penilaian');
  return { ok: true };
}
