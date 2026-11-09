'use client';

import { useMemo, useState, useTransition } from 'react';
import { forceComplete, sendReminder, massReminder, sendOnboarding, massOnboarding } from './actions';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { usePager, Pager, MultiCheckFilter } from '@/components/table-controls';
import { PROGRESS_STATUS_LABEL, type ProgressStatus } from '@/lib/late';
import {
  AlarmClock, AlertCircle, Ban, Bell, CheckCircle2, ChevronDown, ChevronUp, Circle, Clock, FilePlus2, Mail, PenLine, Percent, Users,
  type LucideIcon,
} from 'lucide-react';
import { CARD, CardTitle, Note, StatCard, FIELD, type StatTone } from '@/components/infarm-ui';

export type Pending = { targetId: string; targetName: string; relation: string; mandatory: boolean; ajuan: boolean; progress: ProgressStatus; reason?: string | null };
export type AssessorRow = {
  id: string; name: string; dept: string;
  total: number; done: number;              // semua tugas (wajib + opsional) — info sekunder
  mandatoryTotal: number; mandatoryDone: number; // kelengkapan ditentukan dari WAJIB saja
  /** BR-07: jumlah tugas WAJIB per status (Belum Mulai / Sedang Diisi / Tepat Waktu / Terlambat). */
  statusCounts: Record<ProgressStatus, number>;
  /** Penilaian AJUAN (Opsional hasil permohonan pegawai yang disetujui HRD) — dipantau terpisah. */
  ajuanTotal: number;
  ajuanCounts: Record<ProgressStatus, number>;
  pending: Pending[];
};
/** Info read-only "per yang dinilai": berapa penilai ditugaskan & berapa sudah menilai dia. */
export type TargetRow = { id: string; name: string; dept: string; total: number; done: number };

export function ProgressClient({ rows, targetRows, readOnly = false }: { rows: AssessorRow[]; targetRows: TargetRow[]; readOnly?: boolean }) {
  const [q, setQ] = useState('');
  const [deptSel, setDeptSel] = useState<Set<string>>(new Set());     // kosong = semua divisi
  // Default: hanya penilai BELUM lengkap (perlu tindakan) → halaman fokus. Ubah/hapus filter Status
  // untuk melihat yang sudah lengkap. (kosong = semua status)
  const [statusSel, setStatusSel] = useState<Set<string>>(new Set(['belum']));
  // BR-07: tampilkan penilai yang punya ≥1 tugas WAJIB berstatus terpilih (kosong = semua).
  const [progSel, setProgSel] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<string | null>(null);
  const [toast, setToast] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirm, setConfirm] = useState<{ title: string; body: React.ReactNode; onYes: () => void; confirmLabel?: string; icon?: string; tone?: 'primary' | 'danger' } | null>(null);
  const [pending, start] = useTransition();

  const depts = useMemo(() => [...new Set(rows.map((r) => r.dept))].sort(), [rows]);
  // Peta "dinilai oleh": berapa penilai sudah menilai pegawai ini (legacy: kolom "Menilai Si Penilai").
  const dinilaiBy = useMemo(
    () => new Map(targetRows.map((t) => [t.id, { done: t.done, total: t.total }])),
    [targetRows],
  );

  // Kelengkapan = semua penilaian WAJIB selesai (opsional tak menentukan). Tanpa wajib → lengkap.
  const isComplete = (r: AssessorRow) => r.mandatoryDone >= r.mandatoryTotal;

  const stats = useMemo(() => {
    const total = rows.length;
    const done = rows.filter(isComplete).length;
    const tasks = rows.reduce((s, r) => s + r.mandatoryTotal, 0);
    const doneTasks = rows.reduce((s, r) => s + r.mandatoryDone, 0);
    const byStatus: Record<ProgressStatus, number> = { not_started: 0, in_progress: 0, on_time: 0, late: 0, invalidated: 0 };
    rows.forEach((r) => CHIP_ORDER.forEach((k) => { byStatus[k] += r.statusCounts[k]; }));
    const ajuan: Record<ProgressStatus, number> = { not_started: 0, in_progress: 0, on_time: 0, late: 0, invalidated: 0 };
    rows.forEach((r) => CHIP_ORDER.forEach((k) => { ajuan[k] += r.ajuanCounts[k]; }));
    const ajuanTotal = rows.reduce((s, r) => s + r.ajuanTotal, 0);
    const ajuanAssessors = rows.filter((r) => r.ajuanTotal > 0).length;
    return { total, done, pending: total - done, pct: tasks ? Math.round((doneTasks / tasks) * 100) : 0, byStatus, ajuan, ajuanTotal, ajuanAssessors };
  }, [rows]);

  const shown = rows.filter((r) => {
    const complete = isComplete(r);
    const statusKey = complete ? 'lengkap' : 'belum';
    if (q.trim() && !r.name.toLowerCase().includes(q.toLowerCase())) return false;
    if (deptSel.size > 0 && !deptSel.has(r.dept)) return false;
    if (statusSel.size > 0 && !statusSel.has(statusKey)) return false;
    if (progSel.size > 0 && !(STATUS_ORDER.some((k) => progSel.has(k) && r.statusCounts[k] > 0) || (progSel.has('ajuan') && r.ajuanTotal > 0))) return false;
    return true;
  });
  // Paginasi 5-baris (komponen bersama) → daftar penilai bisa 100+; batasi DOM per halaman.
  const { page, setPage, pageCount, shown: paged, total, rangeFrom, rangeTo } = usePager(shown);

  function act(fn: () => Promise<{ ok: boolean; msg?: string; error?: string }>) {
    setToast(null);
    start(async () => {
      const res = await fn();
      setToast(res.ok ? { ok: true, text: res.msg ?? 'Berhasil.' } : { ok: false, text: res.error ?? 'Gagal.' });
    });
  }

  return (
    <div className="space-y-4">
      {/* Stats: kiri = WAJIB (kelengkapan + 4 status BR-07); kanan = panel AJUAN terpisah (tetap Opsional). */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(240px,1fr)]">
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            <StatCard item={{ icon: Users, tone: 'neutral', value: String(stats.total), label: 'Total Penilai' }} />
            <StatCard item={{ icon: CheckCircle2, tone: 'brand', value: String(stats.done), label: 'Lengkap (wajib)' }} />
            <StatCard item={{ icon: Clock, tone: 'warn', value: String(stats.pending), label: 'Belum (wajib)' }} />
            <StatCard item={{ icon: Percent, tone: 'brand', value: `${stats.pct}%`, label: 'Progres Wajib' }} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            {STATUS_ORDER.map((k) => (
              <StatCard key={k} item={{ icon: STATUS_ICON[k], tone: STATUS_TONE[k], value: String(stats.byStatus[k]), label: PROGRESS_STATUS_LABEL[k] }} />
            ))}
          </div>
        </div>
        <aside aria-label="Penilaian Ajuan" className={`${CARD} flex flex-col gap-2`}>
          <CardTitle icon={FilePlus2}>Penilaian Ajuan</CardTitle>
          <div className="text-ink">
            <span className="font-mono text-lg font-bold">{stats.ajuan.on_time + stats.ajuan.late} / {stats.ajuanTotal}</span>
            <span className="text-xs font-semibold text-ink-soft ml-1">selesai</span>
          </div>
          {STATUS_ORDER.map((k) => (
            <div key={k} className="flex justify-between text-[13px] text-ink-soft">
              <span>{PROGRESS_STATUS_LABEL[k]}</span>
              <span className={`font-mono font-semibold ${stats.ajuan[k] > 0 ? STATUS_TEXT[k] : ''}`}>{stats.ajuan[k]}</span>
            </div>
          ))}
          <p className="text-xs text-ink-soft mt-auto pt-2 border-t border-line-soft">
            Opsional, diajukan pegawai &amp; disetujui HRD{stats.ajuanAssessors > 0 ? <> · <span className="font-mono">{stats.ajuanAssessors}</span> penilai</> : ''}. Tidak masuk Progres Wajib.
          </p>
        </aside>
      </div>
      {stats.byStatus.invalidated > 0 && (
        <Note>
          <span className="font-mono font-semibold text-ink">{stats.byStatus.invalidated}</span> penilaian wajib
          dibatalkan validitasnya oleh HRD — dikeluarkan dari kewajiban &amp; perhitungan skor.
        </Note>
      )}

      <div className={`${CARD} space-y-3`}>
        {/* Controls */}
        <div className="flex flex-wrap gap-2 items-center">
          <input value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} placeholder="Cari nama penilai…"
            className={`${FIELD} flex-1 min-w-[160px]`} />
          <MultiCheckFilter label="Divisi"
            options={depts.map((d) => ({ value: d, label: d }))}
            selected={deptSel} onChange={(s) => { setDeptSel(s); setPage(0); }} />
          <MultiCheckFilter label="Status"
            options={[{ value: 'lengkap', label: 'Lengkap' }, { value: 'belum', label: 'Belum Lengkap' }]}
            selected={statusSel} onChange={(s) => { setStatusSel(s); setPage(0); }} />
          <MultiCheckFilter label="Status Penilaian"
            options={[...STATUS_ORDER.map((k) => ({ value: k, label: PROGRESS_STATUS_LABEL[k] })), { value: 'ajuan', label: 'Punya Ajuan' }]}
            selected={progSel} onChange={(s) => { setProgSel(s); setPage(0); }} />
          {!readOnly && (
            <>
              <button type="button" onClick={() => act(massReminder)} disabled={pending}
                className="inline-flex items-center gap-1.5 text-[13px] font-bold min-h-9 px-4 rounded-xl bg-brand hover:bg-brand-ink text-white disabled:opacity-60">
                <Bell className="w-4 h-4" /> Kirim Pengingat Massal
              </button>
              <button type="button" disabled={pending}
                onClick={() => setConfirm({
                  title: 'Kirim Undangan Massal?',
                  onYes: () => act(massOnboarding),
                  body: (
                    <>
                      <p>Kirim <strong>Undangan &amp; Info Akun</strong> ke semua pegawai.</p>
                      <p>Sandi mereka akan <strong>DISETEL ULANG</strong> (acak unik) lalu dikirim via email.</p>
                      <p className="font-semibold text-danger-ink">Lakukan sekali di awal periode, sebelum mereka mengganti sandi sendiri.</p>
                    </>
                  ),
                })}
                className={BTN_GHOST}>
                <Mail className="w-4 h-4" /> Kirim Undangan Massal
              </button>
            </>
          )}
        </div>
        {toast && (
          <p className={`flex items-center gap-1.5 text-[13px] font-semibold ${toast.ok ? 'text-brand-ink' : 'text-danger-ink'}`}>
            {toast.ok ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
            {toast.text}
          </p>
        )}

        {/* Catatan tampilan bawaan: fokus ke yang perlu tindakan. */}
        {statusSel.size === 1 && statusSel.has('belum') && (
          <p className="text-xs text-ink-soft">
            Menampilkan penilai yang <strong className="font-semibold text-ink">belum lengkap</strong> (perlu tindakan). Ubah filter <strong className="font-semibold text-ink">Status</strong> untuk melihat semua.
          </p>
        )}

        {/* Rows (per penilai) — baris bisa dibuka-tutup → dikecualikan dari StableHeight (CLAUDE.md §8). */}
        <div className="divide-y divide-line-soft border-y border-line-soft">
          {shown.length === 0 && (
            <div className="py-6 text-center">
              <p className="inline-flex items-center gap-1.5 text-[13px] text-ink-soft">
                {stats.pending === 0 && <CheckCircle2 className="w-4 h-4 text-brand shrink-0" />}
                {stats.pending === 0 ? 'Semua penilai sudah lengkap (wajib).' : 'Tidak ada penilai sesuai filter.'}
              </p>
              <span className="block text-xs mt-1 text-ink-soft">Ubah filter <strong className="font-semibold text-ink">Status</strong> (mis. tambahkan “Lengkap”) untuk melihat penilai lain.</span>
            </div>
          )}
          {paged.map((r) => {
            const complete = isComplete(r);
            const pct = r.mandatoryTotal ? Math.round((r.mandatoryDone / r.mandatoryTotal) * 100) : 100;
            const optionalPending = r.pending.filter((p) => !p.mandatory && !p.ajuan).length;
            const by = dinilaiBy.get(r.id);
            const byPct = by && by.total ? Math.round((by.done / by.total) * 100) : 0;
            return (
              <div key={r.id} className="py-3.5">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-3">
                  <div className="min-w-0 text-[13px]">
                    <span className="font-bold text-ink">{r.name}</span>
                    <span className="text-xs text-ink-soft"> · {r.dept}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
                    <span className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full ${complete ? 'bg-brand-tint text-brand-ink' : 'bg-warn-tint text-warn-ink'}`}>
                      <span className="font-mono">{r.mandatoryDone}/{r.mandatoryTotal}</span> wajib · {complete ? 'Lengkap' : 'Belum'}
                    </span>
                    {!readOnly && (
                      <button type="button" disabled={pending}
                        onClick={() => setConfirm({
                          title: `Kirim Undangan ke ${r.name}?`,
                          onYes: () => act(() => sendOnboarding(r.id)),
                          body: (
                            <p>Sandi <strong>{r.name}</strong> akan <strong>disetel ulang</strong> (acak) lalu dikirim via email berisi info akun &amp; panduan.</p>
                          ),
                        })}
                        title="Kirim undangan + info akun (peran, email, sandi baru, panduan)"
                        className={BTN_GHOST}>
                        Undangan
                      </button>
                    )}
                    {!readOnly && !complete && (
                      <button type="button" onClick={() => act(() => sendReminder(r.id))} disabled={pending}
                        className="inline-flex items-center gap-1.5 text-[13px] font-semibold min-h-9 px-3.5 rounded-xl border border-line bg-surface text-brand-ink hover:border-brand disabled:opacity-60">
                        Kirim Pengingat
                      </button>
                    )}
                    {/* Rincian (nama target = siapa-menilai-siapa) hanya untuk HRD, bukan pemegang grant. */}
                    {!readOnly && r.pending.length > 0 && (
                      <button type="button" onClick={() => setExpanded(expanded === r.id ? null : r.id)}
                        className="inline-flex items-center gap-1 text-[13px] font-semibold min-h-9 px-2 text-ink-soft hover:text-ink">
                        {expanded === r.id ? 'Tutup' : `Rincian (${r.pending.length})`}
                        {expanded === r.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </button>
                    )}
                  </div>
                </div>
                {/* Dua progres berdampingan (paritas legacy): "Menilai" vs "Dinilai oleh". */}
                <div className="grid sm:grid-cols-2 gap-x-6 gap-y-2 mt-2">
                  <div>
                    <div className="flex justify-between items-center text-xs font-semibold text-ink-soft mb-1">
                      <span>Menilai (wajib)</span>
                      <span className="font-mono">{r.mandatoryDone}/{r.mandatoryTotal} · {pct}%</span>
                    </div>
                    <div className="h-2 bg-neutral-tint rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${complete ? 'bg-brand' : 'bg-warn-ink'}`} style={{ width: `${pct}%` }} />
                    </div>
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {CHIP_ORDER.filter((k) => r.statusCounts[k] > 0).map((k) => (
                        <span key={k} className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${STATUS_CHIP[k]}`}>
                          {PROGRESS_STATUS_LABEL[k]} <span className="font-mono">{r.statusCounts[k]}</span>
                        </span>
                      ))}
                      {STATUS_ORDER.filter((k) => r.ajuanCounts[k] > 0).map((k) => (
                        <span key={`aj-${k}`} title="Penilaian Ajuan (opsional, diajukan pegawai & disetujui HRD)"
                          className="text-[11px] font-semibold px-2 py-0.5 rounded-full border border-dashed border-line-strong text-ink-soft">
                          Ajuan · {PROGRESS_STATUS_LABEL[k]} <span className="font-mono">{r.ajuanCounts[k]}</span>
                        </span>
                      ))}
                    </div>
                    {optionalPending > 0 && (
                      <p className="text-xs text-ink-soft mt-1">+<span className="font-mono">{optionalPending}</span> opsional belum (tak memengaruhi status)</p>
                    )}
                  </div>
                  <div>
                    <div className="flex justify-between items-center text-xs font-semibold text-ink-soft mb-1">
                      <span>Dinilai oleh</span>
                      <span className="font-mono">{by ? `${by.done}/${by.total} orang · ${byPct}%` : '—'}</span>
                    </div>
                    <div className="h-2 bg-neutral-tint rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${by && by.total > 0 && by.done === by.total ? 'bg-brand' : 'bg-warn-ink'}`} style={{ width: `${byPct}%` }} />
                    </div>
                  </div>
                </div>
                {expanded === r.id && r.pending.length > 0 && (
                  <div className="mt-3 space-y-1.5 border-t border-line-soft pt-2.5">
                    <p className="text-xs uppercase tracking-[0.08em] text-ink-soft font-bold">Belum dinilai:</p>
                    {r.pending.map((p) => (
                      <div key={p.targetId} className="flex items-center justify-between gap-2 text-[13px]">
                        <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                          <span className="text-ink font-semibold">{p.targetName}</span>
                          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-neutral-tint text-ink-soft">{p.relation}</span>
                          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${STATUS_CHIP[p.progress]}`}>{PROGRESS_STATUS_LABEL[p.progress]}</span>
                          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${p.mandatory ? 'bg-warn-tint text-warn-ink' : p.ajuan ? 'border border-dashed border-line-strong text-ink-soft' : 'bg-neutral-tint text-ink-soft'}`}>
                            {p.mandatory ? 'Wajib' : p.ajuan ? 'Ajuan' : 'Opsional'}
                          </span>
                        </div>
                        {!readOnly && (
                          <button type="button" onClick={() => act(() => forceComplete(r.id, p.targetId))} disabled={pending}
                            className={`${BTN_GHOST} shrink-0`}>
                            Paksa Selesai
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <Pager page={page} pageCount={pageCount} setPage={setPage} total={total} rangeFrom={rangeFrom} rangeTo={rangeTo} unit="penilai" />
      </div>
      <Note>
        <strong className="font-semibold text-ink">Status &quot;Lengkap&quot;</strong> dihitung dari penilaian <strong className="font-semibold text-ink">WAJIB</strong> saja — penilaian
        opsional tak memengaruhi status/kartu (tetap ditampilkan di Rincian untuk dipantau). Penilaian
        <strong className="font-semibold text-ink"> Ajuan</strong> (opsional yang diajukan pegawai &amp; disetujui HRD) dipantau di panel
        <strong> Penilaian Ajuan</strong> &amp; chip bergaris putus-putus. Tiap baris:
        <strong> Menilai (wajib)</strong> (tugas wajib penilai) &amp; <strong>Dinilai oleh</strong> (berapa
        penilai sudah menilai pegawai ini). <strong>Status penilaian</strong> (tugas wajib): Belum Mulai · Sedang Diisi
        (draf) · Selesai – Tepat Waktu · Selesai – Terlambat — ditentukan dari waktu kirim <em>pertama</em> dibanding
        deadline periode, tak berubah bila penilaian diedit; Paksa Selesai dihitung tepat waktu. “Paksa Selesai” menandai penilaian terkirim; “Kirim Pengingat”
        mengirim email berisi daftar yang belum dinilai; “Undangan” / “Kirim Undangan Massal” mengirim
        info akun (peran, email, sandi baru, panduan) sekali di awal periode — sandi disetel ulang.
      </Note>

      <ConfirmDialog
        open={!!confirm}
        icon={confirm?.icon ?? '📨'}
        title={confirm?.title ?? ''}
        tone={confirm?.tone ?? 'primary'}
        confirmLabel={confirm?.confirmLabel ?? 'Kirim'}
        busy={pending}
        onConfirm={() => { confirm?.onYes(); setConfirm(null); }}
        onCancel={() => setConfirm(null)}
      >
        {confirm?.body}
      </ConfirmDialog>
    </div>
  );
}

const STATUS_ORDER: ProgressStatus[] = ['not_started', 'in_progress', 'on_time', 'late'];
/** Chip per penilai: 4 status BR-07 + "Dibatalkan" (0046) bila ada. */
const CHIP_ORDER: ProgressStatus[] = [...STATUS_ORDER, 'invalidated'];
const STATUS_TEXT: Record<ProgressStatus, string> = {
  not_started: 'text-ink-soft', in_progress: 'text-warn-ink', on_time: 'text-brand-ink', late: 'text-danger-ink', invalidated: 'text-ink-soft',
};
const STATUS_CHIP: Record<ProgressStatus, string> = {
  not_started: 'bg-neutral-tint text-ink-soft', in_progress: 'bg-warn-tint text-warn-ink',
  on_time: 'bg-brand-tint text-brand-ink', late: 'bg-danger-tint text-danger-ink', invalidated: 'bg-neutral-tint text-ink-soft',
};

/** Ikon + nada kartu ringkasan per status (Belum Mulai & dibatalkan = netral). */
const STATUS_ICON: Record<ProgressStatus, LucideIcon> = {
  not_started: Circle, in_progress: PenLine, on_time: CheckCircle2, late: AlarmClock, invalidated: Ban,
};
const STATUS_TONE: Record<ProgressStatus, StatTone> = {
  not_started: 'neutral', in_progress: 'warn', on_time: 'brand', late: 'danger', invalidated: 'neutral',
};
/** Tombol sekunder (garis) setinggi kontrol standar 36px. */
const BTN_GHOST = 'inline-flex items-center gap-1.5 text-[13px] font-semibold min-h-9 px-3.5 rounded-xl border border-line bg-surface text-ink-soft hover:text-ink hover:border-line-strong disabled:opacity-60';
