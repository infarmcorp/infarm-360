import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { CorrectionButton } from './correction-button';
import { AdhocForm } from './adhoc-form';
import { AdhocDeleteButton } from './adhoc-delete-button';
import { EmptyState } from '@/components/empty-state';

const REL_LABEL: Record<string, string> = {
  Atasan: 'Atasan', Peer: 'Rekan (Peer)', Cross: 'Lintas Divisi', Self: 'Diri Sendiri', Bawahan: 'Bawahan',
};

/**
 * Daftar Penilaian Saya (read-only, versi termigrasi Supabase).
 * Membaca mapping kuartal aktif di mana user = penilai, + status assessment-nya.
 * Semua query tunduk RLS (map_read/asmt_read): user hanya melihat mapping/penilaian
 * miliknya. Query datar (tanpa embedded join) agar ter-tipe penuh.
 */
export default async function PenilaianPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: ap } = await supabase
    .from('periods').select('id, label').eq('status', 'active').limit(1).maybeSingle();
  if (!ap) {
    return (
      <Shell>
        <EmptyState
          icon="⏳"
          title="Belum ada periode penilaian yang dibuka"
          description="Saat ini tidak ada periode aktif, jadi belum ada penilaian yang bisa diisi. Periode dibuka oleh HRD."
          note="Anda akan melihat daftar tugas penilaian di sini begitu HRD mengaktifkan periode baru."
        />
      </Shell>
    );
  }

  const { data: maps } = await supabase
    .from('mappings')
    .select('id, target_id, relation, mandatory, is_adhoc')
    .eq('assessor_id', user.id)
    .eq('period_id', ap.id)
    .eq('is_active', true);
  const rows = maps ?? [];

  const targetIds = rows.map((r) => r.target_id);
  const { data: emps } = targetIds.length
    ? await supabase.from('employees').select('id, name, dept').in('id', targetIds)
    : { data: [] };
  const empById = new Map((emps ?? []).map((e) => [e.id, e]));

  const { data: asmts } = await supabase
    .from('assessments').select('target_id, status')
    .eq('assessor_id', user.id).eq('period_id', ap.id);
  const statusByTarget = new Map((asmts ?? []).map((a) => [a.target_id, a.status]));

  // Permohonan koreksi relasi yang masih menunggu (untuk menandai baris).
  const { data: corrs } = await supabase
    .from('relation_correction_requests').select('target_id')
    .eq('assessor_id', user.id).eq('period_id', ap.id).eq('status', 'pending');
  const pendingCorr = new Set((corrs ?? []).map((c) => c.target_id));

  // Kandidat Ad-Hoc: pegawai non-direksi, bukan diri, belum ada di daftar penilaian.
  const alreadyListed = new Set<string>([user.id, ...targetIds]);
  const { data: allEmps } = await supabase.from('employees').select('id, name, dept, role').neq('role', 'direksi');
  const candidates = (allEmps ?? [])
    .filter((e) => !alreadyListed.has(e.id))
    .map((e) => ({ id: e.id, name: e.name, dept: e.dept }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const items = rows
    .map((r) => ({
      id: r.id,
      targetId: r.target_id,
      name: empById.get(r.target_id)?.name ?? '(tidak diketahui)',
      dept: empById.get(r.target_id)?.dept ?? '—',
      mappingId: r.id,
      relation: r.relation as string,
      mandatory: r.mandatory,
      isAdhoc: r.is_adhoc,
      status: statusByTarget.get(r.target_id) ?? null,
      corrPending: pendingCorr.has(r.target_id),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  // Ringkasan penilaian WAJIB (sifat = Wajib) — berapa harus dinilai vs sudah dikirim.
  const mandatoryItems = items.filter((it) => it.mandatory);
  const mandTotal = mandatoryItems.length;
  const mandDone = mandatoryItems.filter((it) => it.status === 'submitted').length;

  return (
    <Shell periodLabel={ap.label}>
      <AdhocForm candidates={candidates} />
      {mandTotal > 0 && (
        <div className="mb-4 flex items-center justify-between gap-3 bg-emerald-50 border border-emerald-200 rounded-xl p-3">
          <div className="min-w-0">
            <p className="text-xs font-extrabold text-emerald-900">Penilaian Wajib Anda</p>
            <p className="text-[11px] text-emerald-700">
              {mandDone} dari {mandTotal} sudah dikirim
              {mandDone < mandTotal ? ` · sisa ${mandTotal - mandDone} untuk dikerjakan` : ' · selesai semua 🎉'}
            </p>
          </div>
          <div className="w-24 sm:w-32 h-2 bg-emerald-100 rounded-full overflow-hidden shrink-0">
            <div className="h-full bg-emerald-600 rounded-full transition-all"
              style={{ width: `${mandTotal ? Math.round((mandDone / mandTotal) * 100) : 0}%` }} />
          </div>
        </div>
      )}
      {items.length === 0 ? (
        <p className="text-sm text-gray-500">
          Belum ada penilaian rutin yang ditugaskan. Gunakan panel Ad-Hoc di atas untuk menilai rekan kerja.
        </p>
      ) : (
        <>
          <div className="mb-4 flex items-start gap-2 bg-sky-50 border border-sky-200 rounded-xl p-3 text-[12px] text-sky-900">
            <span aria-hidden>ℹ️</span>
            <p className="leading-relaxed">
              Periksa kolom <strong>Garis Hubungan</strong> tiap rekan. Bila relasi Anda dengan rekan itu
              keliru (mis. tertulis Rekan padahal Anda atasannya), klik <strong>“Minta Koreksi”</strong>
              agar HRD memperbaikinya — relasi menentukan <strong>bobot Skor 360°</strong>, sehingga
              memengaruhi hasil akhir pegawai.
            </p>
          </div>
          <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-[11px] uppercase tracking-wider text-gray-500 border-b border-gray-200">
                <th className="py-2 pr-3">Yang Dinilai</th>
                <th className="py-2 px-3">Garis Hubungan</th>
                <th className="py-2 px-3 text-center">Sifat</th>
                <th className="py-2 px-3 text-right">Status</th>
                <th className="py-2 pl-3 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {items.map((it) => (
                <tr key={it.id}>
                  <td className="py-3 pr-3">
                    <span className="font-bold text-gray-800 block">{it.name}</span>
                    <span className="text-[11px] text-gray-500">{it.dept}</span>
                  </td>
                  <td className="py-3 px-3 text-gray-600">{REL_LABEL[it.relation] ?? it.relation}</td>
                  <td className="py-3 px-3 text-center">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                      it.mandatory
                        ? 'bg-rose-50 text-rose-700 border-rose-200'
                        : 'bg-gray-50 text-gray-500 border-gray-200'
                    }`}>
                      {it.mandatory ? 'Wajib' : 'Opsional'}
                    </span>
                  </td>
                  <td className="py-3 px-3 text-right">
                    <StatusBadge status={it.status} />
                  </td>
                  <td className="py-3 pl-3 text-right">
                    <div className="flex items-center justify-end gap-3">
                      {it.isAdhoc && (
                        <AdhocDeleteButton targetId={it.targetId} targetName={it.name} submitted={it.status === 'submitted'} />
                      )}
                      {it.relation !== 'Self' && !it.isAdhoc && (
                        <CorrectionButton
                          mappingId={it.mappingId}
                          targetId={it.targetId}
                          targetName={it.name}
                          currentRelation={it.relation}
                          pending={it.corrPending}
                        />
                      )}
                      <Link
                        href={`/penilaian/${it.targetId}`}
                        className="text-xs font-bold text-emerald-700 hover:underline"
                      >
                        {it.status === 'submitted' ? 'Edit' : it.status === 'draft' ? 'Lanjutkan' : 'Mulai Nilai'}
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </>
      )}
    </Shell>
  );
}

function StatusBadge({ status }: { status: string | null }) {
  const map: Record<string, { label: string; cls: string }> = {
    submitted: { label: 'Terkirim', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    draft: { label: 'Draf', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  };
  const s = status ? map[status] : { label: 'Belum dinilai', cls: 'bg-gray-50 text-gray-500 border-gray-200' };
  return <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${s.cls}`}>{s.label}</span>;
}

function Shell({ children, periodLabel }: { children: React.ReactNode; periodLabel?: string }) {
  return (
    <main className="w-full p-4 sm:p-5 lg:p-6">
      <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl font-bold text-gray-800">Daftar Penilaian Saya</h1>
            {periodLabel && <p className="text-sm text-gray-500">Periode aktif: {periodLabel}</p>}
          </div>
          <Link href="/" className="text-xs text-gray-500 hover:underline">← Beranda</Link>
        </div>
        {children}
      </div>
    </main>
  );
}
