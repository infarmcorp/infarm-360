import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { Clock, FilePlus2, MailX } from 'lucide-react';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { fetchAllPaged } from '@/lib/supabase/paginate';
import { canSection, grantedAccess, employeeInScopes, type PageScope } from '@/lib/auth/roles';
import { KepatuhanTable } from './kepatuhan-table';
import { CARD, Note, PageTitle, StatCard } from '@/components/infarm-ui';
import { INFARM_PAGE } from '@/app/infarm-fonts';
import { loadLateSummaries, loadPendingLatePenalties, refreshLatePenalties } from '@/lib/late-server';
import { ApplyLateButton } from './apply-late-button';
import { formatWib, LATE_PENALTY_360 } from '@/lib/late';

/**
 * Flag Kepatuhan Penilaian (HRD).
 * - Belum Kirim: penilaian WAJIB (mapping mandatory) yang belum terkirim.
 * - Kirim Terlambat (migrasi 0036): penilaian wajib yang KIRIM PERTAMA-nya sesudah deadline →
 *   potongan flat −3 pada Skor 360° penilai (otomatis; HRD bisa mengecualikan, alasan wajib).
 * Satu-satunya sanksi = potongan Skor 360° tsb. Punishment manual (pengurang Skor Akhir) DIHAPUS 2026-10-01.
 */
export default async function KepatuhanPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: me } = await supabase.from('employees').select('role, is_hrd_admin, hrd_sections, dept').eq('id', user.id).maybeSingle();
  // Akses SADAR-MODE: PENUH (+ubah potongan) hanya HRD di Mode Admin; selain itu → jalur GRANT 'kepatuhan'
  // LIHAT-SAJA berlingkup (baca via service_role; tombol ubah potongan disembunyikan → tetap HRD-only).
  const jar = await cookies();
  const hrdMode = jar.get('hrd_mode')?.value === 'admin' ? 'admin' : 'spv';
  const isHrdFull = canSection(me, 'kepatuhan') && hrdMode === 'admin';
  let grantScopes: PageScope[] | null = null;
  if (!isHrdFull) {
    const { data: g } = await supabase.from('page_grants').select('section, scope, scopes').eq('employee_id', user.id);
    grantScopes = grantedAccess(g, 'kepatuhan')?.scopes ?? null;
  }
  if (!isHrdFull && !grantScopes) {
    return <Shell><p className="text-[13px] text-ink-soft">Halaman ini untuk HRD Admin atau pemegang akses Flag Kepatuhan.</p></Shell>;
  }
  const viaGrant = !isHrdFull;
  const ownDept = (me?.dept ?? '').trim();
  const db = viaGrant ? createAdminClient() : supabase;
  const teamIds = viaGrant && grantScopes!.includes('coordinator_team')
    ? new Set(((await db.from('coordinator_team_members').select('employee_id').eq('coordinator_id', user.id)).data ?? []).map((r) => r.employee_id))
    : undefined;

  const { data: ap } = await db
    .from('periods').select('id, label').eq('status', 'active').limit(1).maybeSingle();
  if (!ap) return <Shell><p className="text-[13px] text-ink-soft">Tidak ada periode aktif.</p></Shell>;

  const { data: emps } = await db.from('employees').select('id, name, dept').neq('role', 'direksi').eq('is_external', false).eq('is_active', true);
  // Pemegang grant: batasi ke lingkupnya (employeeInScopes; 'coordinator_team' via teamIds).
  const employees = (emps ?? []).filter((e) => !viaGrant || employeeInScopes(grantScopes!, ownDept, user.id, { id: e.id, dept: e.dept }, teamIds));
  const nameById = new Map(employees.map((e) => [e.id, e.name]));

  // Mapping wajib per penilai. SELURUH pegawai → bisa >1000; ambil penuh (hitung telat/self
  // harus lengkap agar potongan keterlambatan tak keliru).
  const maps = await fetchAllPaged<{ assessor_id: string; target_id: string; mandatory: boolean }>((from, to) =>
    db.from('mappings').select('assessor_id, target_id, mandatory').eq('period_id', ap.id).eq('is_active', true).order('assessor_id').order('target_id').range(from, to));
  // Assessment terkirim → set "assessor:target". 'invalidated' (dibatalkan HRD, 0046) = kewajiban gugur.
  const asmts = await fetchAllPaged<{ assessor_id: string; target_id: string }>((from, to) =>
    db.from('assessments').select('assessor_id, target_id').eq('period_id', ap.id).in('status', ['submitted', 'invalidated']).order('assessor_id').order('target_id').range(from, to));
  const submitted = new Set(asmts.map((a) => `${a.assessor_id}:${a.target_id}`));
  // Siapa-menilai-siapa HANYA untuk HRD (keputusan 2026-09-29): pemegang grant non-HRD hanya melihat
  // JUMLAH, bukan nama target — nama dikosongkan di SERVER agar tak ikut terkirim ke browser.
  const targetName = (id: string) => (viaGrant ? '' : nameById.get(id) ?? '—');

  // Keterlambatan kirim (service_role; halaman ini sudah terotorisasi di atas).
  // Potongan diterapkan OTOMATIS saat HRD membuka halaman ini (pengganti cron nonaktif, 2026-09-29).
  // Gagal → tak memblokir; sisa tertunda tampil di banner + tombol cadangan di bawah.
  if (!viaGrant) { try { await refreshLatePenalties(ap.id); } catch { /* tampil sebagai tertunda */ } }
  const { deadline, byAssessor: lateBy } = await loadLateSummaries(ap.id);
  // Potongan yang BELUM masuk Skor 360° tersimpan (cron nonaktif) — dalam lingkup halaman ini.
  const inScope = new Set(employees.map((e) => e.id));
  const pendingLate = (await loadPendingLatePenalties(ap.id, lateBy)).filter((p) => inScope.has(p.employeeId));

  const rows = employees.map((e) => {
    const lateTargets = maps
      .filter((m) => m.assessor_id === e.id && m.mandatory
        && !submitted.has(`${e.id}:${m.target_id}`))
      .map((m) => targetName(m.target_id));
    return {
      id: e.id, name: e.name, dept: e.dept,
      lateCount: lateTargets.length, lateTargets,
      // Tampilan "Kirim Terlambat" HANYA yang benar-benar sudah kirim (telat) — yang belum
      // kirim sama sekali sudah tampil di kartu "Belum Kirim" di atas. Potongan (latePenalty)
      // tetap MENCAKUP KEDUANYA (2026-09-28) — cuma daftar nama di sini yang dipisah agar tak
      // ganda/membingungkan.
      lateSubmitted: (lateBy.get(e.id)?.late ?? [])
        .filter((l) => l.firstSubmittedAt)
        .map((l) => (viaGrant ? '' : `${targetName(l.targetId)} · ${formatWib(l.firstSubmittedAt)}`)),
      latePenalty: lateBy.get(e.id)?.penalty ?? 0,
      lateAuto: lateBy.get(e.id)?.auto ?? 0,
      lateOverride: lateBy.get(e.id)?.override ?? null,
      lateWaiveReason: lateBy.get(e.id)?.waiveReason ?? null,
      lateWajib: (lateBy.get(e.id)?.late ?? []).filter((l) => l.kind === 'wajib').length,
      lateAjuan: (lateBy.get(e.id)?.late ?? []).filter((l) => l.kind === 'ajuan').length,
      ajuanPending: (lateBy.get(e.id)?.late ?? [])
        .filter((l) => l.kind === 'ajuan' && !l.firstSubmittedAt)
        .map((l) => targetName(l.targetId)),
    };
  }).sort((a, b) => b.lateCount - a.lateCount || a.name.localeCompare(b.name));

  const totalLate = rows.filter((r) => r.lateCount > 0).length;
  const totalLateSubmit = rows.filter((r) => r.lateSubmitted.length > 0).length;
  const totalAjuan = rows.filter((r) => r.lateAjuan > 0).length;

  return (
    <Shell>
      <PageTitle title="Flag Kepatuhan Penilaian">
        Periode aktif <span className="font-mono font-semibold text-ink">{ap.label}</span>
        {' · '}Deadline 360° {deadline
          ? <span className="font-mono font-semibold text-ink">{formatWib(deadline)}</span>
          : <span className="text-ink-soft">belum diatur (atur di Kelola Periode)</span>}
      </PageTitle>

      <div className="space-y-4">
        {pendingLate.length > 0 && (
          <Note tone="warn">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <p>
                <strong>{pendingLate.length} pegawai</strong> punya potongan keterlambatan yang <strong>belum masuk Skor 360°</strong> tersimpan
                (mis. penilai yang belum mengirim sampai deadline lewat). Terapkan sebelum memfinalisasi laporan.
              </p>
              {!viaGrant && <ApplyLateButton pending={pendingLate.length} />}
            </div>
          </Note>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StatCard item={{ icon: MailX, tone: 'danger', value: String(totalLate), label: 'Belum kirim (penilaian wajib)' }} />
          <StatCard item={{ icon: Clock, tone: 'danger', value: String(totalLateSubmit), label: 'Kirim terlambat' }} />
          <div className="min-w-0 grid"
            title="Penilaian Opsional yang diajukan pegawai sendiri & disetujui HRD, tapi belum selesai saat deadline — ikut kena potongan.">
            <StatCard item={{ icon: FilePlus2, tone: 'warn', value: String(totalAjuan), label: 'Kena potongan krn ajuan' }} />
          </div>
        </div>

        <div className={CARD}>
          <KepatuhanTable rows={rows} readOnly={viaGrant} />
        </div>
        <Note>
          Default menampilkan pegawai yang <strong className="font-semibold text-ink">perlu perhatian</strong> (penilaian wajib/ajuan belum
          selesai, terlambat, atau sudah punya penetapan potongan HRD). &quot;Belum Kirim&quot; = penilaian bersifat Wajib (mapping)
          yang belum dikirim{viaGrant ? '' : ' (arahkan kursor untuk daftar nama)'}. &quot;Kirim Terlambat&quot; = penilaian Wajib yang pertama kali
          dikirim sesudah deadline{viaGrant ? '' : ' (arahkan kursor untuk nama & waktu kirim)'}.
          <strong className="font-semibold text-ink"> Potongan Skor 360° <span className="font-mono">{LATE_PENALTY_360}</span> poin (otomatis, sekali per periode)</strong> berlaku
          untuk KEDUA kondisi — sudah kirim tapi telat, MAUPUN belum kirim sama sekali sampai deadline lewat (kolom &quot;Belum Kirim&quot;
          yang masih &gt;0 saat deadline terlampaui ikut kena potongan yang sama; gugur bila penilai tak punya Skor 360° sendiri).
          Penilaian yang telat tetap dihitung penuh untuk pegawai yang dinilai — potongan hanya menyentuh Skor 360° milik si penilai.
          {' '}<strong className="font-semibold text-ink">Ajuan</strong> (penilaian Opsional yang diajukan pegawai sendiri &amp; disetujui HRD) ikut dihitung
          mulai periode Q3 2026 dan ditandai terpisah. Opsional biasa, Ad-Hoc Mandiri lama, Paksa Selesai HRD, dan pemetaan yang dibuat sesudah deadline tidak dihitung.
          Nilai potongan bisa <strong className="font-semibold text-ink">diubah HRD</strong> per pegawai (tombol Ubah, alasan wajib; 0 = dikecualikan).
          Potongan ini satu-satunya sanksi kepatuhan — Skor Akhir tidak dipotong lagi secara terpisah.
        </Note>
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <main className={`${INFARM_PAGE} w-full min-h-full px-5 py-7 lg:px-7`}>{children}</main>;
}
