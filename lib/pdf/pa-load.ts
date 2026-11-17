/**
 * Muat bahan PDF Pegawai untuk satu pegawai + periode (dipakai halaman kontrol & route unduh).
 * Gerbang: (a) HRD (bagian Laporan) di Mode Admin — baca lewat client sesi (RLS HRD) seperti detail laporan; atau
 * (b) `allowSelf` (route unduh dari Laporan Hasil Saya): pegawai atas laporannya SENDIRI yang sudah FINAL —
 *     baca via service_role (pegawai tak boleh membaca raw 360° lewat RLS; raw tak ikut ke PDF).
 * Mengembalikan HANYA skor + ringkasan HRD (PaReportInput) — raw & L3 tak pernah keluar dari sini.
 */
import { cookies } from 'next/headers';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { canSection } from '@/lib/auth/roles';
import { loadReport } from '@/lib/report';
import { NOTE_CONCLUSION, nextPeriodLabel, resolvePaPdfSettings, sectionNumbers, type PaPdfSettings } from '@/lib/pa-pdf';
import type { PaReportInput } from './pa-report';

export type PaLoadResult =
  | { ok: false; status: 401 | 403 | 404; error: string }
  | {
      ok: true;
      input: PaReportInput;
      period: { id: string; label: string };
      settings: PaPdfSettings;
      isDefault: boolean;
      settingsReady: boolean;
    };

export async function loadPaPdf(employeeId: string, periodParam: string | undefined, opts: { allowSelf?: boolean } = {}): Promise<PaLoadResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, status: 401, error: 'Sesi berakhir. Silakan masuk kembali.' };
  const { data: me } = await supabase.from('employees').select('role, is_hrd_admin, hrd_sections').eq('id', user.id).maybeSingle();
  const mode = (await cookies()).get('hrd_mode')?.value;
  const isHrd = canSection(me, 'laporan') && mode === 'admin';
  const self = !!opts.allowSelf && user.id === employeeId;
  if (!isHrd && !self) {
    return { ok: false, status: 403, error: 'PDF Pegawai hanya tersedia untuk HRD di Mode Admin.' };
  }
  const db = isHrd ? supabase : (createAdminClient() as unknown as typeof supabase);

  // Periode (+ pengaturan 0063). Kolom belum ada → baca ulang tanpa kolom itu (pakai bawaan).
  type PeriodRow = { id: string; label: string; has_360: boolean; status: string; start_date: string; end_date: string; pa_pdf?: unknown };
  let periods: PeriodRow[];
  let settingsReady = true;
  const r = await db.from('periods').select('id, label, has_360, status, start_date, end_date, pa_pdf').order('start_date', { ascending: false });
  if (r.error) {
    settingsReady = false;
    const r2 = await db.from('periods').select('id, label, has_360, status, start_date, end_date').order('start_date', { ascending: false });
    periods = (r2.data ?? []) as PeriodRow[];
  } else {
    periods = (r.data ?? []) as PeriodRow[];
  }
  const ap = (periodParam ? periods.find((p) => p.id === periodParam) : undefined) ?? periods.find((p) => p.status === 'active') ?? null;
  if (!ap) return { ok: false, status: 404, error: 'Belum ada periode penilaian.' };

  // Pegawai sendiri: hanya laporan yang sudah FINAL (sama dengan Laporan Hasil Saya).
  if (!isHrd) {
    const { data: fr } = await db.from('final_reports').select('status').eq('employee_id', employeeId).eq('period_id', ap.id).maybeSingle();
    if (fr?.status !== 'finalized') return { ok: false, status: 403, error: 'Laporan periode ini belum difinalisasi HRD.' };
  }

  const rep = await loadReport(db, employeeId, ap);
  const { data: subj } = await db.from('employees').select('role').eq('id', employeeId).maybeSingle();
  if (!rep) return { ok: false, status: 404, error: 'Data tidak ditemukan atau di luar lingkup akses Anda.' };

  const sec = sectionNumbers(ap.has_360);
  const { settings, isDefault } = resolvePaPdfSettings(ap.pa_pdf ?? null, ap.end_date, nextPeriodLabel(ap.label), sec);
  return {
    ok: true,
    period: { id: ap.id, label: ap.label },
    settings, isDefault, settingsReady,
    input: {
      name: rep.emp.name, dept: rep.emp.dept ?? null, isDireksi: subj?.role === 'direksi',
      period: { label: ap.label, start_date: ap.start_date, end_date: ap.end_date },
      has360: rep.has360, status: rep.status,
      finalScore: rep.finalScore, kpiAvg: rep.kpiAvg, s360: rep.s360, latePenalty360: rep.latePenalty360,
      aspects: rep.aspects.map((a) => ({ name: a.name, score: a.score })),
      aspectSummaries: rep.aspectSummaries, qualSummaries: rep.qualSummaries,
      qualQuestions: rep.qualQuestions, pdfNotes: rep.pdfNotes,
    },
  };
}

/** Isian HRD yang masih kosong (bagian itu tercetak kosong di PDF). */
export function missingPaItems(d: PaReportInput): string[] {
  if (!d.has360) return [];
  const out: string[] = [];
  if (!d.pdfNotes[NOTE_CONCLUSION]?.trim()) out.push('Kesimpulan');
  const emptyAspects = d.aspects.filter((a) => !d.aspectSummaries[a.name]?.trim()).length;
  if (emptyAspects) out.push(`ringkasan ${emptyAspects} aspek`);
  const emptyQual = d.qualQuestions.filter((q) => !d.qualSummaries[q]?.trim()).length;
  if (emptyQual) out.push(`ringkasan ${emptyQual} pertanyaan esai`);
  return out;
}
