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
import { CopyMapping } from './copy-mapping';
import { EmptyState } from '@/components/empty-state';
import { Panel } from '@/components/panel';

/**
 * Pemetaan (Mapping) — HRD atur siapa menilai siapa di periode aktif. Dua tab:
 * "Pemetaan" (relasi) & "Koreksi Relasi" (tinjau permohonan koreksi dari penilai —
 * halaman-dalam-halaman ala legacy). Tab via ?tab=pemetaan|koreksi.
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

      <div className="flex border-b border-line gap-1.5 mb-5 overflow-x-auto">
        <Tab href="/admin/pemetaan?tab=pemetaan" active={tab === 'pemetaan'} icon={Network}>Pemetaan</Tab>
        <Tab href="/admin/pemetaan?tab=koreksi" active={tab === 'koreksi'} icon={Wrench}>
          Koreksi Relasi{pendingCount ? <span className="ml-1.5 text-[10px] data-value bg-brand text-white px-1.5 py-0.5 rounded-full">{pendingCount}</span> : null}
        </Tab>
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
  const maps = await fetchAllPaged<{ id: string; assessor_id: string; target_id: string; relation: string; mandatory: boolean }>((from, to) =>
    supabase.from('mappings').select('id, assessor_id, target_id, relation, mandatory').eq('period_id', periodId).eq('is_active', true)
      .order('assessor_id').order('target_id').range(from, to));
  const rows = (maps ?? [])
    .map((m) => ({
      id: m.id, assessorId: m.assessor_id, assessor: empById.get(m.assessor_id)?.name ?? '—',
      targetId: m.target_id, target: empById.get(m.target_id)?.name ?? '—',
      relation: m.relation as string, mandatory: m.mandatory,
    }))
    .sort((a, b) => a.assessor.localeCompare(b.assessor) || a.target.localeCompare(b.target));

  return (
    <>
      <div className="mb-3"><MappingForm employees={employees} /></div>
      <div className="mb-5 flex flex-wrap items-start gap-2">
        <MappingImport employees={employees.map((e) => ({ id: e.id, code: e.emp_code, name: e.name }))} />
        <CopyMapping periods={otherPeriods ?? []} />
      </div>
      <Panel><MappingTable rows={rows} /></Panel>
    </>
  );
}

/** Tab Koreksi: permohonan koreksi relasi dari penilai → Setujui/Tolak. */
async function KoreksiTab({ supabase, periodId }: { supabase: Awaited<ReturnType<typeof createClient>>; periodId: string }) {
  const { data: reqs } = await supabase
    .from('relation_correction_requests')
    .select('id, assessor_id, target_id, old_relation, new_relation, reason, status')
    .eq('period_id', periodId).order('created_at', { ascending: false });
  const list = reqs ?? [];
  const ids = [...new Set(list.flatMap((r) => [r.assessor_id, r.target_id]))];
  const { data: emps } = ids.length ? await supabase.from('employees').select('id, name').in('id', ids) : { data: [] };
  const nameById = new Map((emps ?? []).map((e) => [e.id, e.name]));

  if (list.length === 0) return <p className="text-sm text-ink-soft">Tidak ada permohonan koreksi relasi.</p>;

  return (
    <div className="space-y-3">
      {list.map((r) => (
        <Panel key={r.id} padded={false} className="p-4 flex flex-col sm:flex-row justify-between gap-3">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 flex-wrap text-[13px]">
              <span className="font-bold text-ink">{nameById.get(r.assessor_id) ?? '—'}</span>
              <span className="text-ink-faint">→</span>
              <span className="font-bold text-ink">{nameById.get(r.target_id) ?? '—'}</span>
            </div>
            <div className="flex items-center gap-2 text-[11px]">
              <span className="bg-danger-tint text-danger-ink font-semibold px-1.5 py-0.5 rounded-full line-through">{r.old_relation ?? '—'}</span>
              <span className="text-ink-faint">menjadi</span>
              <span className="bg-brand-tint text-brand-ink font-semibold px-1.5 py-0.5 rounded-full">{r.new_relation ?? '—'}</span>
            </div>
            <p className="text-[11.5px] text-ink-soft italic bg-neutral-tint p-2 rounded-control">“{r.reason}”</p>
          </div>
          <div className="shrink-0 self-end sm:self-center">
            {r.status === 'pending'
              ? <ReviewButton requestId={r.id} />
              : <span className={`text-[10px] font-semibold uppercase px-2 py-1 rounded-full ${r.status === 'approved' ? 'bg-brand-tint text-brand-ink' : 'bg-neutral-tint text-ink-faint'}`}>
                  {r.status === 'approved' ? '✓ Diterima' : '✗ Ditolak'}
                </span>}
          </div>
        </Panel>
      ))}
    </div>
  );
}

/** Sub-tab bergaris bawah — model seragam dengan Dashboard Organisasi & halaman KPI. */
function Tab({ href, active, icon: Icon, children }: {
  href: string; active: boolean; icon?: React.ElementType; children: React.ReactNode;
}) {
  return (
    <Link href={href} className={`flex items-center gap-2 py-2 px-4 text-xs font-bold border-b-2 transition-colors shrink-0 ${
      active ? 'border-brand text-brand-ink' : 'border-transparent text-ink-soft hover:text-ink'}`}>
      {Icon && <Icon className={`w-4 h-4 ${active ? 'text-brand' : 'text-ink-faint'}`} />}
      <span className="inline-flex items-center">{children}</span>
    </Link>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <main className="w-full min-h-full bg-bg px-5 py-7 lg:px-6">{children}</main>;
}
