import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { canSection } from '@/lib/auth/roles';
import { ProgressClient, type AssessorRow, type TargetRow } from './progress-client';

/**
 * Progress 360 Feedback (HRD): kelengkapan pengisian 360 per PENILAI di periode aktif.
 * total = jumlah mapping (assessor), done = assessment 'submitted'. Mendukung Paksa
 * Selesai per tugas & Kirim Pengingat (email menyusul Resend). RLS: HRD only.
 */
export default async function ProgressPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: me } = await supabase.from('employees').select('role, is_hrd_admin, hrd_sections').eq('id', user.id).maybeSingle();
  if (!canSection(me, 'progress')) {
    return <Shell><p className="text-sm text-gray-600">Halaman ini hanya untuk HRD Admin.</p></Shell>;
  }

  const { data: ap } = await supabase.from('periods').select('id, label').eq('status', 'active').limit(1).maybeSingle();
  if (!ap) return <Shell><p className="text-sm text-gray-500">Tidak ada periode aktif.</p></Shell>;

  // Independen (hanya butuh ap.id / tak butuh apa pun) → paralel.
  const [empsRes, mapsRes, asmtsRes] = await Promise.all([
    supabase.from('employees').select('id, name, dept'),
    supabase.from('mappings').select('assessor_id, target_id, relation, mandatory').eq('period_id', ap.id).eq('is_active', true),
    supabase.from('assessments').select('assessor_id, target_id, status').eq('period_id', ap.id),
  ]);
  const empById = new Map((empsRes.data ?? []).map((e) => [e.id, e]));
  const maps = mapsRes.data;
  const submitted = new Set((asmtsRes.data ?? []).filter((a) => a.status === 'submitted').map((a) => `${a.assessor_id}|${a.target_id}`));

  // Kelompokkan tugas per penilai (bawa relasi & sifat wajib/opsional).
  const byAssessor = new Map<string, { targetId: string; relation: string; mandatory: boolean }[]>();
  (maps ?? []).forEach((m) => {
    const a = byAssessor.get(m.assessor_id) ?? [];
    a.push({ targetId: m.target_id, relation: m.relation as string, mandatory: m.mandatory });
    byAssessor.set(m.assessor_id, a);
  });

  const rows: AssessorRow[] = [...byAssessor.entries()].map(([assessorId, tasks]) => {
    const e = empById.get(assessorId);
    const pending = tasks
      .filter((t) => !submitted.has(`${assessorId}|${t.targetId}`))
      .map((t) => ({ targetId: t.targetId, targetName: empById.get(t.targetId)?.name ?? '—', relation: t.relation, mandatory: t.mandatory }));
    // Kelengkapan diukur dari penilaian WAJIB saja (opsional tak menentukan "lengkap").
    const mandatoryTasks = tasks.filter((t) => t.mandatory);
    const mandatoryDone = mandatoryTasks.filter((t) => submitted.has(`${assessorId}|${t.targetId}`)).length;
    return {
      id: assessorId,
      name: e?.name ?? '—',
      dept: e?.dept ?? '—',
      total: tasks.length,
      done: tasks.length - pending.length,
      mandatoryTotal: mandatoryTasks.length,
      mandatoryDone,
      pending,
    };
  }).sort((a, b) => {
    // Urutkan dari yang kelengkapan WAJIB-nya paling rendah (tak ada wajib → dianggap penuh).
    const ra = a.mandatoryTotal ? a.mandatoryDone / a.mandatoryTotal : 1;
    const rb = b.mandatoryTotal ? b.mandatoryDone / b.mandatoryTotal : 1;
    return ra - rb || a.name.localeCompare(b.name);
  });

  // Info per yang DINILAI (target): total penilai yang ditugaskan & berapa yang sudah menilai dia.
  const byTarget = new Map<string, string[]>();
  (maps ?? []).forEach((m) => {
    const a = byTarget.get(m.target_id) ?? [];
    a.push(m.assessor_id);
    byTarget.set(m.target_id, a);
  });

  const targetRows: TargetRow[] = [...byTarget.entries()].map(([targetId, assessorIds]) => {
    const e = empById.get(targetId);
    const done = assessorIds.filter((aid) => submitted.has(`${aid}|${targetId}`)).length;
    return { id: targetId, name: e?.name ?? '—', dept: e?.dept ?? '—', total: assessorIds.length, done };
  }).sort((a, b) => (a.done / Math.max(a.total, 1)) - (b.done / Math.max(b.total, 1)) || a.name.localeCompare(b.name));

  return (
    <Shell>
      <div className="mb-4">
        <h1 className="text-xl font-bold text-gray-800">Progress 360 Feedback</h1>
        <p className="text-sm text-gray-500">Periode aktif: {ap.label} · kelengkapan pengisian 360°.</p>
      </div>
      <ProgressClient rows={rows} targetRows={targetRows} />
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="w-full p-4 sm:p-5 lg:p-6">
      <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">{children}</div>
    </main>
  );
}
