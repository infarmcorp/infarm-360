import { redirect } from 'next/navigation';
import { Network, Wrench, Map as MapIcon, ArrowRight, Check, X } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { fetchAllPaged } from '@/lib/supabase/paginate';
import { canSection } from '@/lib/auth/roles';
import { MappingForm } from './mapping-form';
import { ReviewButton } from './review-button';
import { MappingImport } from './mapping-import';
import { MappingTable } from './mapping-table';
import type { PairStatus } from './actions';
import { CopyMapping } from './copy-mapping';
import { EmptyState } from '@/components/empty-state';
import { CARD, PageTitle } from '@/components/infarm-ui';
import { TabBar, Tab, TabPanel } from '@/components/tab-nav';
import { INFARM_PAGE } from '@/app/infarm-fonts';

/**
 * Pemetaan (Mapping) — HRD atur siapa menilai siapa di periode aktif. Dua tab:
 * "Pemetaan" (relasi) & "Permohonan" (tinjau permohonan pegawai: koreksi relasi, minta hapus,
 * minta tambah — halaman-dalam-halaman ala legacy). Tab via ?tab=pemetaan|koreksi.
 */
export default async function PemetaanPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab: tabParam } = await searchParams;
  const tab = tabParam === 'koreksi' ? 'koreksi' : 'pemetaan';

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: me } = await supabase.from('employees').select('role, is_hrd_admin, hrd_sections').eq('id', user.id).maybeSingle();
  if (!canSection(me, 'pemetaan')) {
    return <Shell><div className={CARD}><p className="text-[13px] text-ink-soft">Halaman ini hanya untuk HRD Admin.</p></div></Shell>;
  }

  const { data: ap } = await supabase
    .from('periods').select('id, label').eq('status', 'active').limit(1).maybeSingle();
  if (!ap) return (
    <Shell>
      <EmptyState
        icon={<MapIcon className="w-6 h-6" aria-hidden />}
        title="Belum ada periode aktif"
        description="Pemetaan penilai mengikat ke periode aktif. Aktifkan sebuah periode dulu, baru atur siapa menilai siapa."
        steps={[
          { text: <>Buka <strong>Kelola Siklus Periode</strong></> },
          { text: <>Buat / pilih periode lalu tekan <strong>Aktivasi</strong></> },
          { text: <>Kembali ke sini untuk menyusun pemetaan</> },
        ]}
        actions={[{ label: 'Ke Kelola Periode', href: '/admin/periode', primary: true }]}
      />
    </Shell>
  );

  // Hitung permohonan koreksi menunggu (untuk badge tab).
  const { count: pendingCount } = await supabase
    .from('relation_correction_requests')
    .select('id', { count: 'exact', head: true })
    .eq('period_id', ap.id).eq('status', 'pending');

  return (
    <Shell>
      <PageTitle title="Pemetaan Penilai 360°">
        Periode aktif <span className="font-mono font-semibold text-ink">{ap.label}</span>
      </PageTitle>

      <TabBar>
        <Tab href="/admin/pemetaan?tab=pemetaan" active={tab === 'pemetaan'} icon={Network}>Pemetaan</Tab>
        <Tab href="/admin/pemetaan?tab=koreksi" active={tab === 'koreksi'} icon={Wrench}>
          Permohonan
          {pendingCount ? <span className="text-[11px] font-mono font-bold px-1.5 py-0.5 rounded-full leading-none bg-brand text-white">{pendingCount}</span> : null}
        </Tab>
      </TabBar>
      <TabPanel>
        {tab === 'pemetaan'
          ? <PemetaanTab supabase={supabase} periodId={ap.id} />
          : <KoreksiTab supabase={supabase} periodId={ap.id} />}
      </TabPanel>
    </Shell>
  );
}

/** Tab Pemetaan: form + daftar relasi. */
async function PemetaanTab({ supabase, periodId }: { supabase: Awaited<ReturnType<typeof createClient>>; periodId: string }) {
  // Hanya pegawai AKTIF yang boleh masuk pemetaan baru (dropdown + roster pratinjau impor) →
  // pegawai nonaktif tak muncul & namanya di Excel akan ditandai "tidak dikenal/dilewati".
  const { data: emps } = await supabase.from('employees').select('id, emp_code, name, dept, is_external').eq('is_active', true).order('emp_code');
  const employees = emps ?? [];
  const empById = new Map(employees.map((e) => [e.id, e]));
  // Periode lain (untuk fitur "Salin Pemetaan"), terbaru dulu.
  const { data: otherPeriods } = await supabase
    .from('periods').select('id, label').neq('id', periodId).order('start_date', { ascending: false });
  // mappings = pegawai × penilai → bisa >1000 (mis. 100×8=800, tumbuh); ambil PENUH agar daftar
  // pemetaan tak terpotong diam-diam (cap PostgREST 1000).
  // is_adhoc DIKECUALIKAN (kebijakan 2026-08-21): Hak Penilaian Ad-Hoc Mandiri bersifat RAHASIA —
  // penilai memilih sendiri siapa yang ia nilai di luar penugasan, dan daftar itu tak boleh muncul
  // di Kelola Pemetaan (bahkan sebagai "Opsional"). Ad-Hoc tetap masuk perhitungan & tinjau laporan
  // per pegawai (lib/report.ts + computeResult360 sengaja TANPA filter ini).
  const maps = await fetchAllPaged<{ id: string; assessor_id: string; target_id: string; relation: string; mandatory: boolean }>((from, to) =>
    supabase.from('mappings').select('id, assessor_id, target_id, relation, mandatory').eq('period_id', periodId).eq('is_active', true)
      .eq('is_adhoc', false)
      .order('assessor_id').order('target_id').range(from, to));
  // Status penilaian tiap pasangan (Screen 07): Belum Mulai / Draft / Terkirim / Dibatalkan.
  const asmts = await fetchAllPaged<{ assessor_id: string; target_id: string; status: string }>((from, to) =>
    supabase.from('assessments').select('assessor_id, target_id, status').eq('period_id', periodId)
      .order('assessor_id').order('target_id').range(from, to));
  const statusBy = new Map(asmts.map((a) => [`${a.assessor_id}|${a.target_id}`, a.status as PairStatus]));
  const rows = (maps ?? [])
    .map((m) => ({
      id: m.id, assessorId: m.assessor_id, assessor: empById.get(m.assessor_id)?.name ?? '—',
      targetId: m.target_id, target: empById.get(m.target_id)?.name ?? '—',
      relation: m.relation as string, mandatory: m.mandatory,
      status: statusBy.get(`${m.assessor_id}|${m.target_id}`) ?? ('none' as PairStatus),
    }))
    .sort((a, b) => a.assessor.localeCompare(b.assessor) || a.target.localeCompare(b.target));

  return (
    <>
      {/* Split screen (layar lebar): kiri = tambah/impor/salin, kanan = daftar. Layar sempit → bertumpuk. */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(300px,360px)_minmax(0,1fr)] gap-4 items-start">
        <div className="space-y-3">
          <MappingForm employees={employees} />
          <div className="grid gap-2">
            <MappingImport employees={employees.map((e) => ({ id: e.id, code: e.emp_code, name: e.name }))} />
            <CopyMapping periods={otherPeriods ?? []} />
          </div>
        </div>
        <section className={`${CARD} min-w-0`}><MappingTable rows={rows} /></section>
      </div>
    </>
  );
}

/** Tab Permohonan: kotak masuk permohonan pemetaan dari pegawai → Setujui/Tolak (+alasan). */
async function KoreksiTab({ supabase, periodId }: { supabase: Awaited<ReturnType<typeof createClient>>; periodId: string }) {
  const { data: reqs } = await supabase
    .from('relation_correction_requests')
    .select('id, kind, assessor_id, target_id, old_relation, new_relation, reason, reject_reason, status')
    .eq('period_id', periodId).order('created_at', { ascending: false });
  const list = reqs ?? [];
  const ids = [...new Set(list.flatMap((r) => [r.assessor_id, r.target_id]))];
  const { data: emps } = ids.length ? await supabase.from('employees').select('id, name').in('id', ids) : { data: [] };
  const nameById = new Map((emps ?? []).map((e) => [e.id, e.name]));

  if (list.length === 0) return <div className={CARD}><p className="text-[13px] text-ink-soft">Tidak ada permohonan pemetaan.</p></div>;

  // Yang menunggu diputuskan naik ke atas — sisanya jadi arsip keputusan.
  const sorted = [...list].sort((a, b) => Number(b.status === 'pending') - Number(a.status === 'pending'));

  return (
    <div className="space-y-3">
      {sorted.map((r) => {
        const kind = (r.kind ?? 'relation') as 'relation' | 'remove' | 'add';
        return (
          <section key={r.id} className={`${CARD} flex flex-col sm:flex-row justify-between gap-3`}>
            <div className="space-y-1.5 min-w-0">
              <div className="flex items-center gap-2 flex-wrap text-[13px]">
                <KindChip kind={kind} />
                <span className="font-bold text-ink">{nameById.get(r.assessor_id) ?? '—'}</span>
                <ArrowRight className="w-3.5 h-3.5 text-ink-faint shrink-0" aria-hidden />
                <span className="font-bold text-ink">{nameById.get(r.target_id) ?? '—'}</span>
              </div>

              {/* Ringkas apa yang diminta, per jenis. */}
              {kind === 'relation' && (
                <div className="flex items-center gap-2 text-xs">
                  <span className="bg-danger-tint text-danger-ink font-semibold px-2 py-0.5 rounded-full line-through">{r.old_relation ?? '—'}</span>
                  <span className="text-ink-soft">menjadi</span>
                  <span className="bg-brand-tint text-brand-ink font-semibold px-2 py-0.5 rounded-full">{r.new_relation ?? '—'}</span>
                </div>
              )}
              {kind === 'remove' && (
                <p className="text-xs text-ink-soft">
                  Minta <strong>dikeluarkan</strong> dari daftar penilaiannya
                  {r.old_relation && <> (saat ini <span className="font-semibold">{r.old_relation}</span>)</>}.
                  Disetujui → pemetaan dinonaktifkan.
                </p>
              )}
              {kind === 'add' && (
                <p className="text-xs text-ink-soft">
                  Minta <strong>menilai rekan ini</strong> sebagai{' '}
                  <span className="bg-brand-tint text-brand-ink font-semibold px-2 py-0.5 rounded-full">{r.new_relation ?? '—'}</span>.
                  Disetujui → pemetaan baru dibuat (sifat Opsional).
                </p>
              )}

              <p className="text-xs text-ink-soft italic bg-infarm-surface border border-line-soft px-3 py-2 rounded-xl">“{r.reason}”</p>
              {r.status === 'rejected' && r.reject_reason && (
                <p className="text-xs text-danger-ink bg-danger-tint px-3 py-2 rounded-xl">
                  <strong>Alasan penolakan:</strong> {r.reject_reason}
                </p>
              )}
            </div>

            <div className="shrink-0 self-end sm:self-center">
              {r.status === 'pending'
                ? <ReviewButton requestId={r.id} />
                : <span className={`inline-flex items-center gap-1 text-[11px] font-semibold uppercase px-2.5 py-1 rounded-full ${r.status === 'approved' ? 'bg-brand-tint text-brand-ink' : 'bg-neutral-tint text-ink-soft'}`}>
                    {r.status === 'approved' ? <><Check className="w-3.5 h-3.5" aria-hidden /> Diterima</> : <><X className="w-3.5 h-3.5" aria-hidden /> Ditolak</>}
                  </span>}
            </div>
          </section>
        );
      })}
    </div>
  );
}

/** Penanda jenis permohonan — HRD perlu tahu sekilas apa yang diminta sebelum membaca isinya. */
function KindChip({ kind }: { kind: 'relation' | 'remove' | 'add' }) {
  const map = {
    relation: { label: 'Koreksi Relasi', cls: 'bg-infarm-cream text-infarm-soil' },
    remove: { label: 'Minta Hapus', cls: 'bg-danger-tint text-danger-ink' },
    add: { label: 'Minta Tambah', cls: 'bg-brand-tint text-brand-ink' },
  } as const;
  const m = map[kind];
  return <span className={`text-[11px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${m.cls}`}>{m.label}</span>;
}

function Shell({ children }: { children: React.ReactNode }) {
  return <main className={`${INFARM_PAGE} w-full min-h-full px-5 py-7 lg:px-7`}>{children}</main>;
}
