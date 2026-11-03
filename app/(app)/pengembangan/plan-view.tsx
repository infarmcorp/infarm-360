import { StatusChip } from '@/components/status-chip';
import { formatDateTimeWib, formatDateWib } from '@/lib/datetime';
import { PLAN_ITEM_FIELDS, PLAN_STATUS_TONE, planStatusLabel, type PlanItem } from '@/lib/dev-plan';
import type { DevPlanStatus } from '@/lib/database.types';
import type { PlanRow } from '@/lib/dev-plan-server';

/**
 * Tampilan baca Rencana Pengembangan (PDF bagian 5, 7, 8) — dipakai pemilik (setelah dikirim), atasan, HRD,
 * Direksi. Isi bernama (bukan anonim): rencana memang milik pegawai & dibahas bersama atasan.
 */
export function PlanHeader({ title, sourceLabel, status, ownerRole, due, closed, supervisorLabel }: {
  title: string; sourceLabel: string; status: DevPlanStatus | null; ownerRole: string | null;
  due: string | null; closed: boolean; supervisorLabel?: string | null;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-[17px] font-bold text-ink">{title}</h2>
        <p className="text-[12.5px] text-ink-soft mt-0.5">
          Dari laporan {sourceLabel}
          {supervisorLabel ? <> · Atasan: <strong>{supervisorLabel}</strong></> : null}
        </p>
        <p className="text-[12px] text-ink-faint mt-0.5">
          {due ? <>Batas rencana disepakati: <span className="data-value">{formatDateWib(due)}</span></> : 'Batas rencana disepakati belum ditetapkan HRD'}
          {closed && <> · <strong className="text-ink-soft">rencana periode ini sudah ditutup HRD</strong></>}
        </p>
      </div>
      <StatusChip tone={PLAN_STATUS_TONE[status ?? 'none']}>{planStatusLabel(status, ownerRole)}</StatusChip>
    </div>
  );
}

export function PlanItemsView({ items }: { items: PlanItem[] }) {
  if (!items.length) return <p className="text-sm text-ink-soft">Belum ada prioritas.</p>;
  return (
    <div className="space-y-3">
      {items.map((it, i) => (
        <div key={i} className="rounded-panel border border-line overflow-hidden">
          <div className="px-3 py-2 bg-neutral-tint border-b border-line-soft text-xs font-extrabold text-ink uppercase tracking-wide">
            Prioritas {i + 1}
          </div>
          <dl className="divide-y divide-line-soft">
            {PLAN_ITEM_FIELDS.map((f) => (
              <div key={f.key} className="grid sm:grid-cols-[200px_1fr] gap-1 sm:gap-3 px-3 py-2">
                <dt className="text-[12px] font-semibold text-ink-soft">{f.label}</dt>
                <dd className="text-[13px] text-ink whitespace-pre-line">{it[f.key] || <span className="text-ink-faint">—</span>}</dd>
              </div>
            ))}
          </dl>
        </div>
      ))}
    </div>
  );
}

// Label baca-saja komentar atasan (petunjuk isian ada di supervisor-form.tsx).
const COMMENT_FIELDS: { key: 'sup_confirmation' | 'sup_context' | 'sup_support' | 'sup_hope'; label: string }[] = [
  { key: 'sup_confirmation', label: 'Konfirmasi Kinerja' },
  { key: 'sup_context', label: 'Konteks Tambahan' },
  { key: 'sup_support', label: 'Dukungan yang Diberikan' },
  { key: 'sup_hope', label: 'Harapan ke Depan' },
];

export function PlanCommentsView({ plan }: { plan: PlanRow }) {
  const filled = COMMENT_FIELDS.filter((f) => (plan[f.key] ?? '').trim());
  if (!filled.length) return null;
  return (
    <div className="rounded-panel border border-line">
      <div className="px-3 py-2 border-b border-line-soft text-xs font-extrabold text-ink uppercase tracking-wide">Komentar Atasan Langsung</div>
      <dl className="divide-y divide-line-soft">
        {filled.map((f) => (
          <div key={f.key} className="px-3 py-2">
            <dt className="text-[12px] font-semibold text-ink-soft">{f.label}</dt>
            <dd className="text-[13px] text-ink whitespace-pre-line mt-0.5">{plan[f.key]}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export function RevisionNotice({ plan }: { plan: PlanRow }) {
  if (plan.status !== 'revision' || !plan.revision_reason) return null;
  return (
    <div className="rounded-panel border border-danger-ink/25 bg-danger-tint p-3">
      <p className="text-[12.5px] font-bold text-danger-ink">Atasan meminta perbaikan</p>
      <p className="text-[12.5px] text-danger-ink/90 mt-0.5 whitespace-pre-line">{plan.revision_reason}</p>
    </div>
  );
}

/** Persetujuan (PDF bagian 8): pegawai → atasan → HRD. Nama & waktu dicatat aplikasi saat tombol ditekan. */
export function PlanSignatures({ plan, ownerName }: { plan: PlanRow; ownerName: string }) {
  const cells = [
    { title: 'Pegawai yang Bersangkutan', name: plan.employee_signed_at ? ownerName : null, at: plan.employee_signed_at },
    { title: 'Atasan Langsung', name: plan.supervisor_name, at: plan.supervisor_signed_at },
    { title: 'HRD', name: plan.hrd_name, at: plan.hrd_signed_at },
  ];
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {cells.map((c) => (
        <div key={c.title} className="rounded-panel border border-line p-3">
          <p className="text-[12px] font-bold text-ink">{c.title}</p>
          {c.at ? (
            <>
              <p className="text-[13px] text-brand-ink font-semibold mt-1.5">✓ Disetujui · {c.name ?? '—'}</p>
              <p className="text-[11.5px] text-ink-faint data-value mt-0.5">{formatDateTimeWib(c.at)}</p>
            </>
          ) : (
            <p className="text-[12.5px] text-ink-faint mt-1.5">Belum</p>
          )}
        </div>
      ))}
    </div>
  );
}
