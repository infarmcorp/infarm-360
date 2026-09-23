import type { RequestKind, CorrectionStatus, RelationKind } from '@/lib/database.types';

export type MyRequest = {
  id: string;
  kind: RequestKind;
  targetName: string;
  oldRelation: RelationKind | null;
  newRelation: RelationKind | null;
  reason: string;
  rejectReason: string | null;
  status: CorrectionStatus;
};

const REL_LABEL: Record<string, string> = {
  Atasan: 'Atasan', Peer: 'Rekan (Peer)', Cross: 'Lintas Divisi', Bawahan: 'Bawahan', Self: 'Diri Sendiri',
};

/** Judul per jenis permohonan — bahasa pengaju, bukan istilah tabel. */
function titleOf(r: MyRequest): string {
  if (r.kind === 'remove') return `Hapus penilaian atas ${r.targetName}`;
  if (r.kind === 'add') return `Menilai ${r.targetName} sebagai ${REL_LABEL[r.newRelation ?? ''] ?? r.newRelation}`;
  return `Koreksi hubungan kerja dengan ${r.targetName}`;
}

/**
 * "Permohonan Saya" — status pengajuan pegawai atas pemetaannya (hapus / tambah / koreksi relasi).
 * Menampilkan alasan yang DIA tulis dan, bila ditolak, ALASAN HRD — supaya keputusan terasa
 * dua arah, bukan penolakan diam-diam (permintaan pengguna 2026-08).
 */
export function MyRequests({ requests }: { requests: MyRequest[] }) {
  if (requests.length === 0) return null;
  const pendingN = requests.filter((r) => r.status === 'pending').length;

  return (
    <section className="mb-5 rounded-panel border border-line bg-surface p-4">
      <h3 className="text-xs font-bold text-ink uppercase tracking-wide mb-2.5">
        Permohonan Saya
        {pendingN > 0 && (
          <span className="ml-2 normal-case tracking-normal text-[10px] font-bold text-warn-ink bg-warn-tint border border-warn-ink/25 px-1.5 py-0.5 rounded-full">
            <span className="data-value">{pendingN}</span> menunggu
          </span>
        )}
      </h3>

      <ul className="space-y-2">
        {requests.map((r) => (
          <li key={r.id} className="rounded-control border border-line-soft p-2.5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[12.5px] font-semibold text-ink">{titleOf(r)}</p>
                {r.kind === 'relation' && (
                  <p className="text-[11px] text-ink-faint mt-0.5">
                    {REL_LABEL[r.oldRelation ?? ''] ?? '—'} → {REL_LABEL[r.newRelation ?? ''] ?? '—'}
                  </p>
                )}
                <p className="text-[11px] text-ink-soft italic mt-1">Alasan Anda: “{r.reason}”</p>
                {/* Alasan penolakan HRD — inti dari "keputusan dua arah". */}
                {r.status === 'rejected' && r.rejectReason && (
                  <p className="text-[11px] text-danger-ink mt-1 bg-danger-tint border border-danger-ink/20 rounded-control px-2 py-1.5">
                    <strong>Alasan HRD menolak:</strong> {r.rejectReason}
                  </p>
                )}
                {/* BR-04: setelah disetujui, rater tetap wajib Exposure Check (BR-03) sebelum menilai. */}
                {r.kind === 'add' && r.status === 'approved' && (
                  <p className="text-[11px] text-brand-ink mt-1 bg-brand-tint border border-brand-ink/20 rounded-control px-2 py-1.5">
                    Disetujui — buka tab <strong>Penilaian</strong>, cari {r.targetName}, lalu selesaikan{' '}
                    <strong>Exposure Check</strong> sebelum bisa menilai.
                  </p>
                )}
              </div>
              <StatusChipReq status={r.status} />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function StatusChipReq({ status }: { status: CorrectionStatus }) {
  const map: Record<CorrectionStatus, { label: string; cls: string }> = {
    pending: { label: 'Menunggu', cls: 'bg-warn-tint text-warn-ink border-warn-ink/25' },
    approved: { label: '✓ Disetujui', cls: 'bg-brand-tint text-brand-ink border-brand-ink/20' },
    rejected: { label: '✗ Ditolak', cls: 'bg-danger-tint text-danger-ink border-danger-ink/20' },
  };
  const s = map[status];
  return <span className={`shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-control border ${s.cls}`}>{s.label}</span>;
}
