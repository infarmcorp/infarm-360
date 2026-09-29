'use server';

import { revalidatePath } from 'next/cache';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { isDireksiReviewSubject } from '@/lib/report';
import { logAuditAsService } from '@/lib/audit/log';

/**
 * ACC Laporan Kinerja Tim. Tiga jalur berdasarkan peran/lingkup pelaku:
 *  - SPV        → laporan anggota TIM-nya (RLS fr_spv_acc = is_my_member), KECUALI pegawai yang
 *    punya koordinator (itu di-ACC koordinatornya) — ditolak di server.
 *  - Koordinator (grant is_coordinator) → laporan pegawai di coordinator_team_members-nya. RLS
 *    tak melayaninya (koordinator = pegawai biasa) → tulis lewat service_role dengan penegakan
 *    server: target wajib di timnya & laporan sudah dirilis. Kolom yang ditulis sama (spv_acc).
 *  - Direksi    → laporan SUBJEK SPV (eskalasi Pegawai→SPV, SPV→Direksi). RLS fr_spv_acc
 *    hanya melayani SPV atas timnya, jadi Direksi menulis lewat service_role dengan
 *    penegakan di server: target wajib SPV & laporan sudah dirilis. Kolom yang ditulis
 *    sama (spv_acc) — untuk subjek SPV maknanya "ACC Direksi".
 * Baris laporan harus sudah dibuat HRD (draf/final).
 */
export type AccResult = { ok: true; acc: boolean } | { ok: false; error: string };

/** Catat ACC/batal ACC ke Log Aktivitas (audit 2026-09-29 — sebelumnya tak tercatat siapa/kapan).
 *  Via service_role karena pelaku bukan HRD (RLS hrd_audit_insert). Best-effort. */
async function logAcc(actor: { id: string; name: string | null }, via: string, employeeId: string, acc: boolean): Promise<void> {
  try {
    const { data: t } = await createAdminClient().from('employees').select('name').eq('id', employeeId).maybeSingle();
    await logAuditAsService({
      action: acc ? 'report.acc' : 'report.acc_revoke', category: 'laporan',
      summary: `${acc ? 'Memberi ACC' : 'Membatalkan ACC'} Laporan Kinerja ${t?.name ?? employeeId} (${via})`,
      targetType: 'employee', targetId: employeeId, targetLabel: t?.name ?? null, meta: { acc, via },
    }, actor);
  } catch {
    // Pencatatan gagal tak boleh menggagalkan ACC (selaras logHrdAction).
  }
}

export async function setSpvAcc(employeeId: string, acc: boolean): Promise<AccResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Sesi berakhir, silakan login ulang' };
  const { data: me } = await supabase.from('employees').select('role, is_coordinator, name').eq('id', user.id).maybeSingle();
  const actor = { id: user.id, name: me?.name ?? null };

  const { data: ap } = await supabase
    .from('periods').select('id').eq('status', 'active').limit(1).maybeSingle();
  if (!ap) return { ok: false, error: 'Tidak ada periode aktif' };

  // Jalur Koordinator: ACC pegawai di coordinator_team_members-nya lewat service_role (RLS tak
  // melayaninya). Tegakkan target ada di timnya & sudah dirilis. Cek sebelum jalur SPV (koordinator
  // berposisi employee; SPV/HRD tak diberi grant ini lewat UI, tapi jaga-jaga kecualikan keduanya).
  if (me?.is_coordinator && me.role !== 'spv' && me.role !== 'hrd' && me.role !== 'direksi') {
    const admin = createAdminClient();
    const { data: link } = await admin.from('coordinator_team_members')
      .select('employee_id').eq('coordinator_id', user.id).eq('employee_id', employeeId).maybeSingle();
    if (!link) return { ok: false, error: 'Pegawai ini tidak berada di bawah koordinasi Anda' };
    const { data: rep } = await admin.from('final_reports').select('status')
      .eq('employee_id', employeeId).eq('period_id', ap.id).maybeSingle();
    if (!rep) return { ok: false, error: 'Laporan belum tersedia (menunggu HRD membuat draf)' };
    if (rep.status !== 'in_review' && rep.status !== 'finalized') {
      return { ok: false, error: 'Laporan belum dirilis HRD untuk ditinjau — ACC belum bisa diberikan' };
    }
    const { error } = await admin.from('final_reports').update({ spv_acc: acc })
      .eq('employee_id', employeeId).eq('period_id', ap.id);
    if (error) return { ok: false, error: 'Gagal menyimpan ACC: ' + error.message };
    await logAcc(actor, 'Koordinator', employeeId, acc);
    revalidatePath('/laporan-tim');
    revalidatePath('/admin/laporan');
    return { ok: true, acc };
  }

  // Jalur Direksi: ACC subjek SPV lewat service_role (RLS tak melayaninya). Tegakkan
  // target=SPV & sudah dirilis di server — batas kewenangan nyata, bukan sekadar UI.
  if (me?.role === 'direksi') {
    const admin = createAdminClient();
    if (!(await isDireksiReviewSubject(employeeId))) {
      return { ok: false, error: 'Direksi hanya dapat meng-ACC laporan SPV / pemimpin tim' };
    }
    const { data: rep } = await admin.from('final_reports').select('status')
      .eq('employee_id', employeeId).eq('period_id', ap.id).maybeSingle();
    if (!rep) return { ok: false, error: 'Laporan belum tersedia (menunggu HRD membuat draf)' };
    if (rep.status !== 'in_review' && rep.status !== 'finalized') {
      return { ok: false, error: 'Laporan belum dirilis HRD untuk ditinjau — ACC belum bisa diberikan' };
    }
    const { error } = await admin.from('final_reports').update({ spv_acc: acc })
      .eq('employee_id', employeeId).eq('period_id', ap.id);
    if (error) return { ok: false, error: 'Gagal menyimpan ACC: ' + error.message };
    await logAcc(actor, 'Direksi', employeeId, acc);
    revalidatePath('/laporan-tim');
    revalidatePath('/admin/laporan');
    return { ok: true, acc };
  }

  // Pegawai yang punya KOORDINATOR di-ACC oleh koordinatornya, bukan SPV — tolak di server
  // (bukan sekadar menyembunyikan tombol). Lookup mapping via service_role (SPV tak baca RLS-nya).
  const { data: coordLink } = await createAdminClient()
    .from('coordinator_team_members').select('employee_id').eq('employee_id', employeeId).maybeSingle();
  if (coordLink) return { ok: false, error: 'Laporan ini di-ACC oleh koordinatornya, bukan SPV' };

  // ACC baru boleh setelah HRD "Rilis ke SPV" (status in_review/finalized). Saat masih
  // draf, SPV belum boleh meng-ACC — tegakkan di server (bukan hanya menyembunyikan tombol).
  const { data: rep } = await supabase
    .from('final_reports').select('status')
    .eq('employee_id', employeeId).eq('period_id', ap.id).maybeSingle();
  if (!rep) return { ok: false, error: 'Laporan belum tersedia (menunggu HRD membuat draf) atau di luar tim Anda' };
  if (rep.status !== 'in_review' && rep.status !== 'finalized') {
    return { ok: false, error: 'Laporan belum dirilis HRD untuk ditinjau — ACC belum bisa diberikan' };
  }

  // Update spv_acc; RLS membatasi ke anggota tim. 0 baris → belum ada draf HRD / bukan tim.
  const { data, error } = await supabase
    .from('final_reports')
    .update({ spv_acc: acc })
    .eq('employee_id', employeeId).eq('period_id', ap.id)
    .select('employee_id');
  if (error) return { ok: false, error: 'Gagal menyimpan ACC: ' + error.message };
  if (!data || data.length === 0) {
    return { ok: false, error: 'Laporan belum tersedia (menunggu HRD membuat draf) atau di luar tim Anda' };
  }
  await logAcc(actor, 'SPV', employeeId, acc);

  revalidatePath('/laporan-tim');
  revalidatePath('/admin/laporan');
  return { ok: true, acc };
}
