'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarCheck, Pencil, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/button';
import { DatePicker } from '@/components/date-picker';
import { StatusChip } from '@/components/status-chip';
import { CARD, CardTitle, FIELD, FIELD_LABEL } from '@/components/infarm-ui';
import { callAction } from '@/lib/call-action';
import { formatDateWib } from '@/lib/datetime';
import { ITEM_PROGRESS_LABEL, OVERALL_LABEL, SESSION_KIND_LABEL, type SessionKind } from '@/lib/dev-plan';
import type { DevItemProgress } from '@/lib/database.types';
import { deleteSession, saveSession, saveSessionResponse } from './actions';

export type SessionVM = {
  id: string; kind: SessionKind; session_date: string; author_name: string | null; summary: string;
  overall_status: 'on_track' | 'behind' | null; item_progress: DevItemProgress[];
  employee_note: string | null; canEdit: boolean;
};
type ItemVM = { id: string; area: string };

const inputCls = `${FIELD} w-full`;
const areaCls = `${FIELD} w-full py-2 resize-y`;

/**
 * Catatan Sesi (migrasi 0056): sesi 1-on-1 (atasan) & tinjauan bulanan HRD, terbaru dulu, plus tanggapan pegawai.
 * Hanya MENCATAT — tidak ada hitungan/penanda terlambat (keputusan pemilik 2026-11-03). Hak tiap tombol dihitung
 * di server (canEdit, canAdd*, isOwner) dan ditegakkan ulang oleh Server Action.
 */
export function SessionsSection({ planId, sessions, items, canAddOneOnOne, canAddHrd, isOwner, locked }: {
  planId: string; sessions: SessionVM[]; items: ItemVM[]; canAddOneOnOne: boolean; canAddHrd: boolean; isOwner: boolean; locked: boolean;
}) {
  const [form, setForm] = useState<{ kind: SessionKind; session?: SessionVM } | null>(null);
  const areaOf = new Map(items.map((i, n) => [i.id, `Prioritas ${n + 1}: ${i.area}`]));

  return (
    <section className={CARD}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <CardTitle icon={CalendarCheck}>Catatan Sesi &amp; Tinjauan</CardTitle>
        {!locked && !form && (
          <div className="flex gap-2">
            {canAddOneOnOne && <Button size="sm" className="min-h-9" onClick={() => setForm({ kind: 'one_on_one' })}><Plus className="w-3.5 h-3.5" /> Catat Sesi 1-on-1</Button>}
            {canAddHrd && <Button size="sm" variant="ghost" className="min-h-9" onClick={() => setForm({ kind: 'hrd_monthly' })}><Plus className="w-3.5 h-3.5" /> Catat Tinjauan HRD</Button>}
          </div>
        )}
      </div>
      <div className="mt-3 space-y-3">
        {form && (
          <SessionForm planId={planId} kind={form.kind} session={form.session} items={items} onDone={() => setForm(null)} />
        )}
        {sessions.length === 0 && !form && <p className="text-[13px] text-ink-soft">Belum ada catatan sesi.</p>}
        {sessions.length > 0 && <div className="divide-y divide-line-soft">{sessions.map((s) => (
          <div key={s.id} className="py-3 first:pt-0 last:pb-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[13px] font-bold text-ink">{SESSION_KIND_LABEL[s.kind]}</span>
              <span className="text-xs text-ink-soft font-mono">{formatDateWib(s.session_date)}</span>
              <span className="text-xs text-ink-soft">· {s.author_name ?? '—'}</span>
              {s.overall_status && <StatusChip tone={s.overall_status === 'on_track' ? 'brand' : 'warn'}>{OVERALL_LABEL[s.overall_status]}</StatusChip>}
              {s.canEdit && !locked && !form && (
                <span className="ml-auto flex gap-3">
                  <button type="button" onClick={() => setForm({ kind: s.kind, session: s })} className="inline-flex items-center gap-1 text-xs font-semibold text-brand-ink hover:underline"><Pencil className="w-3.5 h-3.5" /> Ubah</button>
                  <DeleteButton id={s.id} />
                </span>
              )}
            </div>
            <p className="text-[13px] text-ink whitespace-pre-line mt-1.5">{s.summary}</p>
            {s.item_progress.length > 0 && (
              <ul className="mt-2 space-y-1">
                {s.item_progress.map((p) => (
                  <li key={p.item_id} className="text-[13px] text-ink-soft">
                    <strong className="text-ink">{areaOf.get(p.item_id) ?? 'Prioritas'}</strong> — {ITEM_PROGRESS_LABEL[p.status]}{p.note ? `: ${p.note}` : ''}
                  </li>
                ))}
              </ul>
            )}
            {s.kind === 'one_on_one' && (
              <Response sessionId={s.id} note={s.employee_note} editable={isOwner && !locked} />
            )}
          </div>
        ))}</div>}
      </div>
    </section>
  );
}

function SessionForm({ planId, kind, session, items, onDone }: {
  planId: string; kind: SessionKind; session?: SessionVM; items: ItemVM[]; onDone: () => void;
}) {
  const router = useRouter();
  const [date, setDate] = useState(session?.session_date ?? '');
  const [summary, setSummary] = useState(session?.summary ?? '');
  const [overall, setOverall] = useState<'on_track' | 'behind'>(session?.overall_status ?? 'on_track');
  const [progress, setProgress] = useState<DevItemProgress[]>(
    items.map((it) => session?.item_progress.find((p) => p.item_id === it.id) ?? { item_id: it.id, status: 'on_track', note: '' }));
  const [err, setErr] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const oneOnOne = kind === 'one_on_one';

  function save() {
    setErr(null);
    start(async () => {
      const r = await callAction(() => saveSession(planId, session?.id ?? null, {
        kind, date, summary, overall: oneOnOne ? overall : null, progress: oneOnOne ? progress : [],
      }));
      if (!r.ok) { setErr(r.error); return; }
      onDone();
      router.refresh();
    });
  }

  return (
    <div className="rounded-xl border border-line bg-infarm-surface p-4 space-y-3">
      <p className="text-[13px] font-bold text-ink">{session ? 'Ubah' : 'Catat'} {SESSION_KIND_LABEL[kind]}</p>
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <p className={FIELD_LABEL}>Tanggal sesi</p>
          <DatePicker value={date} onChange={setDate} ariaLabel="Tanggal sesi" className="w-44" />
        </div>
        {oneOnOne && (
          <label>
            <span className={FIELD_LABEL}>Status umum</span>
            <select value={overall} onChange={(e) => setOverall(e.target.value as 'on_track' | 'behind')} disabled={busy} className={inputCls}>
              <option value="on_track">{OVERALL_LABEL.on_track}</option>
              <option value="behind">{OVERALL_LABEL.behind}</option>
            </select>
          </label>
        )}
      </div>
      <label className="block">
        <span className={FIELD_LABEL}>Catatan {oneOnOne ? 'sesi' : 'tinjauan'}</span>
        <textarea value={summary} onChange={(e) => setSummary(e.target.value)} disabled={busy} rows={3} className={areaCls}
          placeholder={oneOnOne ? 'Apa yang dibahas, kemajuan, kendala, dan kesepakatan langkah berikutnya.' : 'Hasil tinjauan HRD dan dukungan yang diberikan.'} />
      </label>
      {oneOnOne && items.length > 0 && (
        <div className="space-y-1.5">
          <p className={FIELD_LABEL}>Kemajuan per prioritas</p>
          {items.map((it, i) => (
            <div key={it.id} className="grid sm:grid-cols-[1fr_140px_1fr] gap-2 items-center">
              <span className="text-[13px] text-ink truncate" title={it.area}>Prioritas {i + 1}: {it.area}</span>
              <select value={progress[i].status} disabled={busy}
                onChange={(e) => setProgress((xs) => xs.map((x, j) => (j === i ? { ...x, status: e.target.value as DevItemProgress['status'] } : x)))}
                className={inputCls}>
                {(['on_track', 'behind', 'done'] as const).map((k) => <option key={k} value={k}>{ITEM_PROGRESS_LABEL[k]}</option>)}
              </select>
              <input value={progress[i].note} disabled={busy} placeholder="Catatan singkat (opsional)"
                onChange={(e) => setProgress((xs) => xs.map((x, j) => (j === i ? { ...x, note: e.target.value } : x)))}
                className={inputCls} />
            </div>
          ))}
        </div>
      )}
      {err && <p className="text-xs text-danger-ink font-semibold">{err}</p>}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" className="min-h-9" disabled={busy} onClick={onDone}>Batal</Button>
        <Button size="sm" className="min-h-9" disabled={busy} onClick={save}>Simpan Catatan</Button>
      </div>
    </div>
  );
}

function DeleteButton({ id }: { id: string }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  return (
    <>
      <button type="button" disabled={busy} className="inline-flex items-center gap-1 text-xs font-semibold text-danger-ink hover:underline disabled:opacity-60"
        onClick={() => start(async () => {
          const r = await callAction(() => deleteSession(id));
          if (!r.ok) { setErr(r.error); return; }
          router.refresh();
        })}>
        <Trash2 className="w-3.5 h-3.5" /> Hapus
      </button>
      {err && <span className="text-xs text-danger-ink">{err}</span>}
    </>
  );
}

function Response({ sessionId, note, editable }: { sessionId: string; note: string | null; editable: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(note ?? '');
  const [err, setErr] = useState<string | null>(null);
  const [busy, start] = useTransition();

  if (!editing) {
    return (
      <div className="mt-2.5 rounded-xl bg-infarm-surface px-3.5 py-2.5">
        <p className="text-xs font-semibold text-ink-soft">Tanggapan Pegawai</p>
        {note ? <p className="text-[13px] text-ink whitespace-pre-line mt-0.5">{note}</p> : <p className="text-[13px] text-ink-soft mt-0.5">Belum ada tanggapan.</p>}
        {editable && (
          <button type="button" onClick={() => setEditing(true)} className="mt-1 text-xs font-semibold text-brand-ink hover:underline">
            {note ? 'Ubah tanggapan' : 'Tulis tanggapan'}
          </button>
        )}
      </div>
    );
  }
  return (
    <div className="mt-2.5 rounded-xl bg-infarm-surface px-3.5 py-2.5 space-y-2">
      <textarea value={text} onChange={(e) => setText(e.target.value)} disabled={busy} rows={2} className={areaCls}
        placeholder="Tanggapan Anda atas sesi ini." />
      {err && <p className="text-xs text-danger-ink font-semibold">{err}</p>}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" className="min-h-9" disabled={busy} onClick={() => { setEditing(false); setText(note ?? ''); }}>Batal</Button>
        <Button size="sm" className="min-h-9" disabled={busy} onClick={() => start(async () => {
          const r = await callAction(() => saveSessionResponse(sessionId, text));
          if (!r.ok) { setErr(r.error); return; }
          setEditing(false);
          router.refresh();
        })}>Simpan Tanggapan</Button>
      </div>
    </div>
  );
}
