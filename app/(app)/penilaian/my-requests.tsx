import { ArrowRight, ListChecks } from 'lucide-react';
import type { RequestKind, CorrectionStatus, RelationKind } from '@/lib/database.types';
import { CARD, CardTitle } from '@/components/infarm-ui';
import { StatusChip } from '@/components/status-chip';

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
    <section className={`${CARD} mb-5`}>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <CardTitle icon={ListChecks}>Permohonan Saya</CardTitle>
        {pendingN > 0 && (
          <StatusChip tone="warn"><span className="data-value mr-1">{pendingN}</span> menunggu</StatusChip>
        )}
      </div>

      <ul className="space-y-2.5">
        {requests.map((r) => (
          <li key={r.id} className="rounded-xl border border-line p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[13px] font-semibold text-ink">{titleOf(r)}</p>
                {r.kind === 'relation' && (
                  <p className="flex items-center gap-1 text-xs text-ink-soft mt-0.5">
                    {REL_LABEL[r.oldRelation ?? ''] ?? '—'} <ArrowRight className="w-3.5 h-3.5 shrink-0" /> {REL_LABEL[r.newRelation ?? ''] ?? '—'}
                  </p>
                )}
                <p className="text-xs text-ink-soft italic mt-1">Alasan Anda: “{r.reason}”</p>
                {/* Alasan penolakan HRD — inti dari "keputusan dua arah". */}
                {r.status === 'rejected' && r.rejectReason && (
                  <p className="text-xs text-danger-ink mt-2 bg-danger-tint rounded-control px-3 py-2 leading-relaxed">
                    <strong>Alasan HRD menolak:</strong> {r.rejectReason}
                  </p>
                )}
                {r.kind === 'add' && r.status === 'approved' && (
                  <p className="text-xs text-brand-ink mt-2 bg-brand-tint rounded-control px-3 py-2 leading-relaxed">
                    Disetujui — buka tab <strong>Penilaian</strong>, cari {r.targetName}, lalu mulai menilai
                    (sifat <strong>Opsional</strong>).
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

const REQ_STATUS: Record<CorrectionStatus, { label: string; tone: 'warn' | 'brand' | 'danger' }> = {
  pending: { label: 'Menunggu', tone: 'warn' },
  approved: { label: 'Disetujui', tone: 'brand' },
  rejected: { label: 'Ditolak', tone: 'danger' },
};

function StatusChipReq({ status }: { status: CorrectionStatus }) {
  const s = REQ_STATUS[status];
  return <StatusChip tone={s.tone} className="shrink-0 whitespace-nowrap">{s.label}</StatusChip>;
}
