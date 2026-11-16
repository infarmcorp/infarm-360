'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarDays, MessageSquareReply, Search } from 'lucide-react';
import { CARD, FIELD, FIELD_LABEL } from '@/components/infarm-ui';
import { Button } from '@/components/button';
import { StatusChip } from '@/components/status-chip';
import { formatDateWib, formatDateTimeWib } from '@/lib/datetime';
import { callAction } from '@/lib/call-action';
import {
  VIOLATION_STATUSES, VIOLATION_STATUS_LABEL, VIOLATION_STATUS_TONE, VIOLATION_RESPONSE_MAX, type ViolationStatus,
} from '@/lib/outside-notes';
import { setViolationFollowUp } from './actions';

export type BoardReport = {
  key: string; id: string; date: string | null; category: string; isOther: boolean; body: string; note: string | null;
  /** Tindak lanjut HRD (0062) — dibaca pelapor di Laporan Saya. */
  status: ViolationStatus; response: string | null; respondedAt: string | null;
};
export type BoardPerson = { id: string; name: string; dept: string; isActive: boolean; reports: BoardReport[] };

/**
 * Papan Laporan Pelanggaran: kiri = pegawai yang dilaporkan (terbanyak dulu), kanan = laporan pegawai terpilih,
 * satu kartu per laporan. Data sudah anonim dari server (tanpa pelapor/waktu kirim) dan sudah diurutkan
 * (tanggal kejadian terbaru → abjad isi). Filter divisi/kategori/nama hanya menyaring tampilan.
 * Tindak lanjut (status + tanggapan untuk pelapor): HRD bisa mengubah (`canEdit`), kecuali laporan tentang dirinya
 * sendiri (`selfId`, juga ditolak server); Direksi hanya membaca.
 */
export function ViolationBoard({ people, categories, canEdit, selfId }: {
  people: BoardPerson[]; categories: string[]; canEdit: boolean; selfId: string;
}) {
  const [dept, setDept] = useState('');
  const [cat, setCat] = useState('');
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<string | null>(null);

  const depts = useMemo(() => [...new Set(people.map((p) => p.dept))].sort((a, b) => a.localeCompare(b, 'id')), [people]);
  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return people
      .filter((p) => (!dept || p.dept === dept) && (!needle || p.name.toLowerCase().includes(needle)))
      .map((p) => ({ ...p, reports: cat ? p.reports.filter((r) => r.category === cat) : p.reports }))
      .filter((p) => p.reports.length > 0)
      .sort((a, b) => b.reports.length - a.reports.length || a.name.localeCompare(b.name, 'id'));
  }, [people, dept, cat, q]);
  // Pilihan yang tersaring keluar → tampilkan pegawai teratas (diturunkan saat render, tanpa effect).
  const sel = visible.find((p) => p.id === picked) ?? visible[0] ?? null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <label className="inline-flex items-center gap-2 text-[13px] text-ink-soft">Divisi:
          <select value={dept} onChange={(e) => setDept(e.target.value)} className={`${FIELD} bg-surface`}>
            <option value="">Semua divisi</option>
            {depts.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </label>
        <label className="inline-flex items-center gap-2 text-[13px] text-ink-soft">Kategori:
          <select value={cat} onChange={(e) => setCat(e.target.value)} className={`${FIELD} bg-surface`}>
            <option value="">Semua kategori</option>
            {categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <div className="relative flex-1 min-w-[200px] max-w-xs ml-auto">
          <Search className="w-4 h-4 text-ink-faint absolute left-3 top-1/2 -translate-y-1/2" aria-hidden />
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari nama pegawai"
            className={`${FIELD} bg-surface w-full pl-9`} />
        </div>
      </div>

      {visible.length === 0 ? (
        <div className={CARD}><p className="text-[13px] text-ink-soft">Tidak ada laporan untuk filter ini.</p></div>
      ) : (
        <div className="flex flex-wrap gap-4 items-start">
          <div className="flex-[1_1_280px] max-w-sm min-w-0 bg-surface border border-line rounded-card shadow-card overflow-hidden">
            <div className="px-4 py-2.5 border-b border-line-soft flex items-center justify-between gap-2 text-xs font-bold text-ink-soft whitespace-nowrap">
              <span>Nama Pegawai</span>
              <span className="w-28 shrink-0 text-center">Jumlah Laporan</span>
            </div>
            <div className="max-h-[560px] overflow-y-auto">
              {visible.map((p) => {
                const active = sel?.id === p.id;
                return (
                  <button key={p.id} type="button" onClick={() => setPicked(p.id)}
                    className={`block w-full text-left px-4 py-3 border-b border-line-soft last:border-b-0 transition-colors ${active ? 'bg-brand-tint shadow-[inset_3px_0_0_var(--color-brand)]' : 'bg-surface hover:bg-infarm-surface'}`}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-[13px] font-bold text-ink truncate">
                          {p.name}
                          {!p.isActive && <span className="ml-1.5 align-middle text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-neutral-tint text-ink-soft">nonaktif</span>}
                        </p>
                        <p className="text-xs text-ink-soft truncate">{p.dept}</p>
                      </div>
                      <span className="w-28 shrink-0 flex justify-center">
                        <span className="min-w-7 h-6 px-2 rounded-full bg-danger-tint text-danger-ink font-mono text-xs font-semibold inline-flex items-center justify-center">{p.reports.length}</span>
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1 mt-2">
                      {[...new Set(p.reports.map((r) => r.category))].map((c) => (
                        <span key={c} className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-neutral-tint text-ink-soft">{c}</span>
                      ))}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {sel && (
            <div className="flex-[999_1_480px] min-w-0 space-y-3">
              <div className={`${CARD} flex flex-wrap items-center justify-between gap-2`}>
                <div>
                  <h2 className="text-base font-bold text-ink">{sel.name}</h2>
                  <p className="text-xs text-ink-soft mt-0.5">
                    {sel.dept} · <span className="font-mono">{sel.reports.length}</span> laporan, kejadian terbaru di atas
                  </p>
                </div>
              </div>
              {sel.reports.map((r, i) => (
                <article key={r.key} className={`${CARD} space-y-2.5`}>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-bold uppercase tracking-[0.06em] text-ink-soft">Laporan {i + 1}</span>
                    <StatusChip tone={VIOLATION_STATUS_TONE[r.status]}>{VIOLATION_STATUS_LABEL[r.status]}</StatusChip>
                    <span className="inline-flex items-center gap-1 text-xs text-ink bg-infarm-surface border border-brand-tint rounded-full px-2.5 py-0.5">
                      <CalendarDays className="w-3 h-3 text-brand-ink" aria-hidden />
                      Tanggal kejadian <span className="font-mono">{r.date ? formatDateWib(r.date) : '—'}</span>
                    </span>
                    <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${r.isOther ? 'bg-infarm-cream text-infarm-soil' : 'bg-brand-tint text-brand-ink'}`}>{r.category}</span>
                  </div>
                  <p className="text-[13px] leading-relaxed text-ink whitespace-pre-line">{r.body}</p>
                  {r.note && (
                    <div className="bg-neutral-tint rounded-xl px-3 py-2.5">
                      <p className="text-xs font-bold text-ink-soft mb-0.5">Catatan pelapor</p>
                      <p className="text-[13px] leading-relaxed text-ink whitespace-pre-line">{r.note}</p>
                    </div>
                  )}
                  {/* key ikut status/tanggapan tersimpan → isian editor kembali ke data terbaru setelah disimpan. */}
                  <FollowUp key={`${r.key}:${r.status}:${r.respondedAt ?? ''}`} report={r}
                    editable={canEdit && !!r.id && sel.id !== selfId} self={canEdit && sel.id === selfId} />
                </article>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Tindak lanjut satu laporan. `editable` → pilih status + tulis tanggapan untuk pelapor + Simpan; selain itu hanya baca
 * (Direksi, atau HRD atas laporan tentang dirinya sendiri — `self` menampilkan alasannya).
 */
function FollowUp({ report, editable, self }: { report: BoardReport; editable: boolean; self: boolean }) {
  const router = useRouter();
  const [status, setStatus] = useState<ViolationStatus>(report.status);
  const [response, setResponse] = useState(report.response ?? '');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, start] = useTransition();
  const dirty = status !== report.status || response.trim() !== (report.response ?? '');
  // Simpan pertama boleh tanpa perubahan (mengonfirmasi "Diterima", tanggapan opsional). Sesudahnya hanya bila ada
  // perubahan — tombol mati diberi keterangan agar tak terkesan tanggapan wajib.
  const canSave = dirty || !report.respondedAt;

  function save() {
    setMsg(null);
    start(async () => {
      const res = await callAction(() => setViolationFollowUp(report.id, status, response));
      if (res.ok) { setMsg({ ok: true, text: 'Tersimpan' }); router.refresh(); }
      else setMsg({ ok: false, text: res.error });
    });
  }

  const stamp = report.respondedAt ? <span className="font-mono">{formatDateTimeWib(report.respondedAt)}</span> : null;

  if (!editable) {
    return (
      <div className="border-t border-line-soft pt-2.5">
        <p className="flex items-center gap-1.5 text-xs font-bold text-ink-soft mb-1">
          <MessageSquareReply className="w-3.5 h-3.5" aria-hidden /> Tanggapan untuk pelapor
          {stamp && <span className="font-normal">· {stamp}</span>}
        </p>
        <p className="text-[13px] leading-relaxed text-ink whitespace-pre-line">{report.response ?? <span className="text-ink-soft">Belum ada tanggapan.</span>}</p>
        {self && <p className="text-xs text-ink-soft mt-1">Laporan tentang diri Anda ditindaklanjuti HRD lain.</p>}
      </div>
    );
  }

  return (
    <div className="border-t border-line-soft pt-2.5 space-y-2">
      <p className="flex items-center gap-1.5 text-xs font-bold text-ink-soft">
        <MessageSquareReply className="w-3.5 h-3.5" aria-hidden /> Tindak lanjut
        {stamp && <span className="font-normal">· terakhir diubah {stamp}</span>}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <label className="inline-flex items-center gap-2 text-[13px] text-ink-soft">Status:
          <select value={status} onChange={(e) => setStatus(e.target.value as ViolationStatus)} disabled={busy}
            className={`${FIELD} bg-surface`}>
            {VIOLATION_STATUSES.map((s) => <option key={s} value={s}>{VIOLATION_STATUS_LABEL[s]}</option>)}
          </select>
        </label>
      </div>
      <div>
        <label className={FIELD_LABEL}>Tanggapan untuk pelapor <span className="font-medium">(opsional, dibaca pelapor)</span></label>
        <textarea value={response} onChange={(e) => setResponse(e.target.value)} disabled={busy} rows={2}
          maxLength={VIOLATION_RESPONSE_MAX} placeholder="Misalnya: Laporan sudah ditindaklanjuti sesuai peraturan perusahaan."
          className={`${FIELD} w-full h-auto py-2 leading-relaxed`} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary" size="sm" disabled={busy || !canSave} onClick={save}>{busy ? 'Menyimpan…' : 'Simpan Tindak Lanjut'}</Button>
        {msg
          ? <span className={`text-xs font-semibold ${msg.ok ? 'text-brand-ink' : 'text-danger-ink'}`}>{msg.text}</span>
          : !canSave && <span className="text-xs text-ink-soft">Sudah tersimpan — ubah status atau tanggapan untuk menyimpan lagi.</span>}
      </div>
    </div>
  );
}
