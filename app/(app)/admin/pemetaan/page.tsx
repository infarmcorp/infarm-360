import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Network, Wrench } from 'lucide-react';
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
import { Panel } from '@/components/panel';
import { TabBar, Tab } from '@/components/tab-nav';

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
    return <Shell><p className="text-sm text-ink-soft">Halaman ini hanya untuk HRD Admin.</p></Shell>;
  }

  const { data: ap } = await supabase
    .from('periods').select('id, label').eq('status', 'active').limit(1).maybeSingle();
  if (!ap) return (
    <Shell>
      <EmptyState
        icon="🗺️"
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
      <div className="flex items-start justify-between mb-5">
        <div>
          <h1 className="text-[22px] font-bold tracking-[-0.01em] text-ink">Pemetaan Penilai 360°</h1>
          <p className="text-[13.5px] text-ink-soft mt-1">Periode aktif <span className="data-value font-semibold text-ink">{ap.label}</span></p>
        </div>
        <Link href="/" className="text-[12.5px] text-ink-faint hover:text-ink-soft whitespace-nowrap mt-1">← Beranda</Link>
      </div>

      <div className="mb-5">
      <TabBar>
        <Tab href="/admin/pemetaan?tab=pemetaan" active={tab === 'pemetaan'} icon={Network}>Pemetaan</Tab>
        <Tab href="/admin/pemetaan?tab=koreksi" active={tab === 'koreksi'} icon={Wrench}>
          Permohonan{pendingCount ? <span className="ml-1.5 text-[10px] data-value bg-brand text-white px-1.5 py-0.5 rounded-full">{pendingCount}</span> : null}
        </Tab>
      </TabBar>
      </div>

      {tab === 'pemetaan'
        ? <PemetaanTab supabase={supabase} periodId={ap.id} />
        : <KoreksiTab supabase={supabase} periodId={ap.id} />}
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
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(300px,360px)_minmax(0,1fr)] gap-5 items-start">
        <div className="space-y-3">
          <MappingForm employees={employees} />
          <div className="grid gap-2">
            <MappingImport employees={employees.map((e) => ({ id: e.id, code: e.emp_code, name: e.name }))} />
            <CopyMapping periods={otherPeriods ?? []} />
          </div>
        </div>
        <Panel className="min-w-0"><MappingTable rows={rows} /></Panel>
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

  if (list.length === 0) return <p className="text-sm text-ink-soft">Tidak ada permohonan pemetaan.</p>;

  // Yang menunggu diputuskan naik ke atas — sisanya jadi arsip keputusan.
  const sorted = [...list].sort((a, b) => Number(b.status === 'pending') - Number(a.status === 'pending'));

  return (
    <div className="space-y-3">
      {sorted.map((r) => {
        const kind = (r.kind ?? 'relation') as 'relation' | 'remove' | 'add';
        return (
          <Panel key={r.id} padded={false} className="p-4 flex flex-col sm:flex-row justify-between gap-3">
            <div className="space-y-1.5 min-w-0">
              <div className="flex items-center gap-2 flex-wrap text-[13px]">
                <KindChip kind={kind} />
                <span className="font-bold text-ink">{nameById.get(r.assessor_id) ?? '—'}</span>
                <span className="text-ink-faint">→</span>
                <span className="font-bold text-ink">{nameById.get(r.target_id) ?? '—'}</span>
              </div>

              {/* Ringkas apa yang diminta, per jenis. */}
              {kind === 'relation' && (
                <div className="flex items-center gap-2 text-[11px]">
                  <span className="bg-danger-tint text-danger-ink font-semibold px-1.5 py-0.5 rounded-full line-through">{r.old_relation ?? '—'}</span>
                  <span className="text-ink-faint">menjadi</span>
                  <span className="bg-brand-tint text-brand-ink font-semibold px-1.5 py-0.5 rounded-full">{r.new_relation ?? '—'}</span>
                </div>
              )}
              {kind === 'remove' && (
                <p className="text-[11px] text-ink-soft">
                  Minta <strong>dikeluarkan</strong> dari daftar penilaiannya
                  {r.old_relation && <> (saat ini <span className="font-semibold">{r.old_relation}</span>)</>}.
                  Disetujui → pemetaan dinonaktifkan.
                </p>
              )}
              {kind === 'add' && (
                <p className="text-[11px] text-ink-soft">
                  Minta <strong>menilai rekan ini</strong> sebagai{' '}
                  <span className="bg-brand-tint text-brand-ink font-semibold px-1.5 py-0.5 rounded-full">{r.new_relation ?? '—'}</span>.
                  Disetujui → pemetaan baru dibuat (sifat Opsional).
                </p>
              )}

              <p className="text-[11.5px] text-ink-soft italic bg-neutral-tint p-2 rounded-control">“{r.reason}”</p>
              {r.status === 'rejected' && r.reject_reason && (
                <p className="text-[11.5px] text-danger-ink bg-danger-tint border border-danger-ink/20 p-2 rounded-control">
                  <strong>Alasan penolakan:</strong> {r.reject_reason}
                </p>
              )}
            </div>

            <div className="shrink-0 self-end sm:self-center">
              {r.status === 'pending'
                ? <ReviewButton requestId={r.id} />
                : <span className={`text-[10px] font-semibold uppercase px-2 py-1 rounded-full ${r.status === 'approved' ? 'bg-brand-tint text-brand-ink' : 'bg-neutral-tint text-ink-faint'}`}>
                    {r.status === 'approved' ? '✓ Diterima' : '✗ Ditolak'}
                  </span>}
            </div>
          </Panel>
        );
      })}
    </div>
  );
}

/** Penanda jenis permohonan — HRD perlu tahu sekilas apa yang diminta sebelum membaca isinya. */
function KindChip({ kind }: { kind: 'relation' | 'remove' | 'add' }) {
  const map = {
    relation: { label: 'Koreksi Relasi', cls: 'bg-neutral-tint text-ink-soft border-line' },
    remove: { label: 'Minta Hapus', cls: 'bg-danger-tint text-danger-ink border-danger-ink/25' },
    add: { label: 'Minta Tambah', cls: 'bg-brand-tint text-brand-ink border-brand-ink/25' },
  } as const;
  const m = map[kind];
  return <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-control border ${m.cls}`}>{m.label}</span>;
}

function Shell({ children }: { children: React.ReactNode }) {
  return <main className="w-full min-h-full bg-bg px-5 py-7 lg:px-6">{children}</main>;
}
