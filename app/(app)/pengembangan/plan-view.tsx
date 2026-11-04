import { CheckCircle2, MessageSquare, PenLine, Sprout, Target } from 'lucide-react';
import { CARD, CardTitle } from '@/components/infarm-ui';
import { StatusChip } from '@/components/status-chip';
import { formatDateTimeWib, formatDateWib } from '@/lib/datetime';
import { PLAN_ITEM_FIELDS, PLAN_STATUS_TONE, planStatusLabel, type PlanItem } from '@/lib/dev-plan';
import type { DevPlanStatus } from '@/lib/database.types';
import type { PlanRow } from '@/lib/dev-plan-server';

/**
 * Tampilan baca Rencana Pengembangan (PDF bagian 5, 7, 8) — dipakai pemilik (setelah dikirim), atasan, HRD,
 * Direksi. Isi bernama (bukan anonim): rencana memang milik pegawai & dibahas bersama atasan.
 * Tampilan: Design System Infarm (kartu CARD + CardTitle berikon).
 */
export function PlanHeader({ title, sourceLabel, status, ownerRole, due, closed, supervisorLabel }: {
  title: string; sourceLabel: string; status: DevPlanStatus | null; ownerRole: string | null;
  due: string | null; closed: boolean; supervisorLabel?: string | null;
}) {
  return (
    <div className={`${CARD} flex flex-wrap items-start justify-between gap-3`}>
      <div className="min-w-0">
        <CardTitle icon={Sprout}>{title}</CardTitle>
        <p className="text-[13px] text-ink-soft mt-1.5">
          Dari laporan {sourceLabel}
          {supervisorLabel ? <> · Atasan: <strong className="text-ink">{supervisorLabel}</strong></> : null}
        </p>
        <p className="text-xs text-ink-soft mt-1">
          {due ? <>Batas rencana disepakati: <span className="font-mono">{formatDateWib(due)}</span></> : 'Batas rencana disepakati belum ditetapkan HRD'}
          {closed && <> · <strong className="text-ink">rencana periode ini sudah ditutup HRD</strong></>}
        </p>
      </div>
      <StatusChip tone={PLAN_STATUS_TONE[status ?? 'none']}>{planStatusLabel(status, ownerRole)}</StatusChip>
    </div>
  );
}

export function PlanItemsView({ items }: { items: PlanItem[] }) {
  if (!items.length) return <div className={CARD}><p className="text-[13px] text-ink-soft">Belum ada prioritas.</p></div>;
  return (
    <div className="space-y-4">
      {items.map((it, i) => (
        <section key={i} className={CARD}>
          <CardTitle icon={Target} className="mb-2">Prioritas {i + 1}</CardTitle>
          <dl className="divide-y divide-line-soft">
            {PLAN_ITEM_FIELDS.map((f) => (
              <div key={f.key} className="grid sm:grid-cols-[200px_1fr] gap-1 sm:gap-3 py-2.5">
                <dt className="text-xs font-semibold text-ink-soft">{f.label}</dt>
                <dd className="text-[13px] text-ink whitespace-pre-line">{it[f.key] || <span className="text-ink-faint">—</span>}</dd>
              </div>
            ))}
          </dl>
        </section>
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
    <section className={CARD}>
      <CardTitle icon={MessageSquare} className="mb-2">Komentar Atasan Langsung</CardTitle>
      <dl className="divide-y divide-line-soft">
        {filled.map((f) => (
          <div key={f.key} className="py-2.5">
            <dt className="text-xs font-semibold text-ink-soft">{f.label}</dt>
            <dd className="text-[13px] text-ink whitespace-pre-line mt-0.5">{plan[f.key]}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export function RevisionNotice({ plan }: { plan: PlanRow }) {
  if (plan.status !== 'revision' || !plan.revision_reason) return null;
  return (
    <div className="rounded-xl bg-danger-tint px-3.5 py-2.5">
      <p className="text-[13px] font-bold text-danger-ink">Atasan meminta perbaikan</p>
      <p className="text-[13px] text-danger-ink mt-0.5 whitespace-pre-line">{plan.revision_reason}</p>
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
    <div className="grid gap-4 sm:grid-cols-3">
      {cells.map((c) => (
        <div key={c.title} className={CARD}>
          <CardTitle icon={PenLine}>{c.title}</CardTitle>
          {c.at ? (
            <>
              <p className="flex items-center gap-1.5 text-[13px] text-brand-ink font-semibold mt-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden /> <span className="min-w-0">Disetujui · {c.name ?? '—'}</span>
              </p>
              <p className="text-xs text-ink-soft font-mono mt-0.5">{formatDateTimeWib(c.at)}</p>
            </>
          ) : (
            <p className="text-[13px] text-ink-soft mt-2">Belum</p>
          )}
        </div>
      ))}
    </div>
  );
}
