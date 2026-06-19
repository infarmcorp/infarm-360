import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { MappingForm } from './mapping-form';
import { ReviewButton } from './review-button';
import { MappingImport } from './mapping-import';
import { MappingTable } from './mapping-table';
import { CopyMapping } from './copy-mapping';
import { EmptyState } from '@/components/empty-state';

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
  const { data: me } = await supabase.from('employees').select('role').eq('id', user.id).maybeSingle();
  if (me?.role !== 'hrd') {
    return <Shell><p className="text-sm text-gray-600">Halaman ini hanya untuk HRD Admin.</p></Shell>;
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
      <h1 className="text-xl font-bold text-gray-800">Pemetaan Penilai 360°</h1>
      <p className="text-sm text-gray-500">Periode aktif: {ap.label}</p>

      <div className="flex gap-1 mt-4 mb-5 bg-gray-100 p-1 rounded-xl w-fit">
        <Tab href="/admin/pemetaan?tab=pemetaan" active={tab === 'pemetaan'}>Pemetaan</Tab>
        <Tab href="/admin/pemetaan?tab=koreksi" active={tab === 'koreksi'}>
          Koreksi Relasi{pendingCount ? <span className="ml-1.5 text-[10px] bg-indigo-600 text-white px-1.5 py-0.5 rounded-full">{pendingCount}</span> : null}
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
  const { data: emps } = await supabase.from('employees').select('id, emp_code, name, dept').order('emp_code');
  const employees = emps ?? [];
  const empById = new Map(employees.map((e) => [e.id, e]));
  // Periode lain (untuk fitur "Salin Pemetaan"), terbaru dulu.
  const { data: otherPeriods } = await supabase
    .from('periods').select('id, label').neq('id', periodId).order('start_date', { ascending: false });
  const { data: maps } = await supabase
    .from('mappings').select('id, assessor_id, target_id, relation, mandatory').eq('period_id', periodId).eq('is_active', true);
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
      <MappingTable rows={rows} />
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

  if (list.length === 0) return <p className="text-sm text-gray-500">Tidak ada permohonan koreksi relasi.</p>;

  return (
    <div className="space-y-3">
      {list.map((r) => (
        <div key={r.id} className="border border-gray-200 rounded-xl p-3 flex flex-col sm:flex-row justify-between gap-3">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 flex-wrap text-xs">
              <span className="font-extrabold text-gray-800">{nameById.get(r.assessor_id) ?? '—'}</span>
              <span className="text-gray-500">→</span>
              <span className="font-extrabold text-gray-800">{nameById.get(r.target_id) ?? '—'}</span>
            </div>
            <div className="flex items-center gap-2 text-[11px]">
              <span className="bg-rose-50 text-rose-700 font-bold px-1.5 py-0.5 rounded line-through">{r.old_relation ?? '—'}</span>
              <span className="text-gray-500">menjadi</span>
              <span className="bg-emerald-50 text-emerald-700 font-bold px-1.5 py-0.5 rounded">{r.new_relation ?? '—'}</span>
            </div>
            <p className="text-[11px] text-gray-500 italic bg-gray-50 p-2 rounded-lg border border-gray-150">“{r.reason}”</p>
          </div>
          <div className="shrink-0 self-end sm:self-center">
            {r.status === 'pending'
              ? <ReviewButton requestId={r.id} />
              : <span className={`text-[10px] font-black uppercase px-2 py-1 rounded border ${r.status === 'approved' ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-gray-100 text-gray-500 border-gray-200'}`}>
                  {r.status === 'approved' ? '✓ Diterima' : '✗ Ditolak'}
                </span>}
          </div>
        </div>
      ))}
    </div>
  );
}

function Tab({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link href={href} className={`px-4 py-1.5 text-xs font-extrabold rounded-lg transition-all ${active ? 'bg-white text-emerald-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
      {children}
    </Link>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="w-full p-4 sm:p-5 lg:p-6">
      <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">{children}</div>
    </main>
  );
}
