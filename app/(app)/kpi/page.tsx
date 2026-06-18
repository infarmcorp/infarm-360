import Link from 'next/link';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { KpiForm } from './kpi-form';
import { RekapView } from './rekap-view';
import { RiwayatView } from './riwayat-view';

/**
 * Kinerja Tim / Monitoring KPI (SPV/HRD/Direksi). Tab via ?tab=input|riwayat|rekap.
 *  - Input KPI: aktivitas SUPERVISI → hanya SPV atau HRD dalam mode SPV.
 *  - Riwayat & Audit: SPV (tim) / HRD (semua, monitoring).
 *  - Rekapitulasi Kuartal: + Direksi (read-only).
 * RLS membatasi data ke lingkup peran.
 */
export default async function KpiPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; period?: string }>;
}) {
  const { tab: tabParam, period } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: me } = await supabase.from('employees').select('role').eq('id', user.id).maybeSingle();
  const role = me?.role ?? 'employee';
  const jar = await cookies();
  const hrdMode = jar.get('hrd_mode')?.value === 'spv' ? 'spv' : 'admin';

  // Input KPI hanya untuk SPV / HRD mode-SPV; HRD mode-admin = monitoring (riwayat + rekap).
  const canInput = role === 'spv' || (role === 'hrd' && hrdMode === 'spv');
  const canAudit = role === 'spv' || role === 'hrd';
  const canView = canAudit || role === 'direksi';
  if (!canView) {
    return <Shell><p className="text-sm text-gray-600">Halaman ini untuk SPV / HRD / Direksi.</p></Shell>;
  }

  // Mode INPUT (SPV / HRD-SPV): berfitur tab. Mode MONITORING (HRD admin / Direksi):
  // satu halaman — Rekapitulasi + Riwayat & Audit ditumpuk (ala legacy), tanpa tab.
  if (!canInput) {
    // Direksi (tanpa audit) → hanya rekap. HRD admin → split view rekap | riwayat.
    if (!canAudit) {
      return (
        <Shell>
          <h1 className="text-xl font-bold text-gray-800">Rekapitulasi Kuartal</h1>
          <p className="mt-1 text-sm text-gray-500">Ringkasan capaian KPI, 360°, &amp; Skor Akhir per kuartal.</p>
          <div className="mt-4"><RekapView role={role} userId={user.id} periodParam={period} /></div>
        </Shell>
      );
    }
    return (
      <main className="w-full p-4 sm:p-5 lg:p-6">
        <div className="mb-4">
          <h1 className="text-xl font-bold text-gray-800">Monitoring &amp; Audit KPI</h1>
          <p className="mt-1 text-sm text-gray-500">Rekapitulasi kuartal &amp; jejak audit perubahan KPI seluruh pegawai — tampilan berdampingan.</p>
        </div>
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 items-start">
          <Panel title="Rekapitulasi Kuartal">
            <RekapView role={role} userId={user.id} periodParam={period} />
          </Panel>
          <Panel title="Riwayat & Audit Perubahan KPI">
            <RiwayatView role={role} userId={user.id} />
          </Panel>
        </div>
      </main>
    );
  }

  // Mode input (tab).
  const allowed = new Set<string>(['input', 'riwayat', 'rekap']);
  const requested = tabParam && allowed.has(tabParam) ? tabParam : null;
  const tab = requested ?? 'input';

  return (
    <Shell>
      <h1 className="text-xl font-bold text-gray-800">Kinerja Tim</h1>
      <p className="mt-1 text-sm text-gray-500">Input KPI bulanan, riwayat audit, &amp; rekapitulasi per kuartal anggota tim.</p>

      {/* Tab nav */}
      <div className="flex gap-1 mt-4 mb-5 bg-gray-100 p-1 rounded-xl w-fit">
        <Tab href="/kpi?tab=input" active={tab === 'input'}>Input KPI</Tab>
        <Tab href="/kpi?tab=riwayat" active={tab === 'riwayat'}>Riwayat &amp; Audit</Tab>
        <Tab href="/kpi?tab=rekap" active={tab === 'rekap'}>Rekapitulasi Kuartal</Tab>
      </div>

      {tab === 'input' ? (
        <InputTab supabase={supabase} userId={user.id} role={role} />
      ) : tab === 'riwayat' ? (
        <RiwayatView role={role} userId={user.id} hrdMode={hrdMode} />
      ) : (
        <RekapView role={role} userId={user.id} periodParam={period} hrdMode={hrdMode} />
      )}
    </Shell>
  );
}

/** Kartu panel split-view dengan header lengket & scroll vertikal independen. */
function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-gray-200 rounded-2xl shadow-sm flex flex-col max-h-[78vh]">
      <h2 className="text-sm font-extrabold text-slate-800 uppercase tracking-tight px-5 py-3 border-b border-gray-100 sticky top-0 bg-white rounded-t-2xl z-10">{title}</h2>
      <div className="p-5 overflow-y-auto">{children}</div>
    </div>
  );
}

/**
 * Tab Input KPI: SPV → anggota tim (RLS is_my_member). HRD (mode SPV) → hanya pegawai
 * di DIVISINYA SENDIRI (mis. Irma/HRD hanya divisi HRD). RLS is_hrd tetap mengizinkan
 * tulis KPI siapa pun, tetapi UI sengaja membatasi ke divisi HRD sesuai kebijakan.
 */
async function InputTab({
  supabase, userId, role,
}: {
  supabase: Awaited<ReturnType<typeof createClient>>; userId: string; role: string;
}) {
  // Dua rantai independen — lingkup pegawai vs periode/bulan aktif → jalankan paralel.
  const scopeEmps = async (): Promise<{ id: string; emp_code: string; name: string; dept: string }[]> => {
    if (role === 'hrd') {
      const { data: me } = await supabase.from('employees').select('dept').eq('id', userId).maybeSingle();
      const { data } = await supabase
        .from('employees').select('id, emp_code, name, dept')
        .eq('dept', me?.dept ?? '__none__').neq('role', 'direksi');
      return data ?? [];
    }
    const { data: teamRows } = await supabase.from('spv_team_members').select('employee_id').eq('spv_id', userId);
    const memberIds = (teamRows ?? []).map((r) => r.employee_id);
    // SPV juga mencatat capaian KPI dirinya sendiri → selalu sertakan userId.
    const ids = [...new Set([userId, ...memberIds])];
    const { data } = await supabase.from('employees').select('id, emp_code, name, dept').in('id', ids);
    return data ?? [];
  };
  const scopeMonths = async (): Promise<string[]> => {
    const { data: activePeriods } = await supabase.from('periods').select('id').eq('status', 'active');
    const periodIds = (activePeriods ?? []).map((p) => p.id);
    if (!periodIds.length) return [];
    const { data: monthRows } = await supabase.from('period_months').select('ym').in('period_id', periodIds).order('ym');
    return (monthRows ?? []).map((m) => m.ym);
  };
  const [emps, monthOptions] = await Promise.all([scopeEmps(), scopeMonths()]);
  const members = emps.map((e) => ({ id: e.id, code: e.emp_code, name: e.name, dept: e.dept }));

  if (members.length === 0) return <p className="text-sm text-gray-500">Belum ada anggota tim yang ditugaskan kepada Anda.</p>;
  if (monthOptions.length === 0) return <p className="text-sm text-gray-500">Tidak ada periode aktif. Hubungi HRD untuk mengaktifkan siklus.</p>;

  return <KpiForm members={members} months={monthOptions} />;
}

function Tab({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={`px-4 py-1.5 text-xs font-extrabold rounded-lg transition-all ${
        active ? 'bg-white text-emerald-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'
      }`}
    >
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
