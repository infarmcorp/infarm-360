'use client';

import { useMemo, useState, useTransition } from 'react';
import { forceComplete, sendReminder, massReminder, sendOnboarding, massOnboarding, resetExposureStatus } from './actions';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { usePager, Pager, MultiCheckFilter } from '@/components/table-controls';

export type Pending = { targetId: string; targetName: string; relation: string; mandatory: boolean; reason?: string | null };
export type AssessorRow = {
  id: string; name: string; dept: string;
  total: number; done: number;              // semua tugas (wajib + opsional) — info sekunder
  mandatoryTotal: number; mandatoryDone: number; // kelengkapan ditentukan dari WAJIB saja
  pending: Pending[];
  /** BR-03: kewajiban ber-status Not Eligible pada Exposure Check — sudah gugur, perlu review HRD. */
  notEligible: Pending[];
};
/** Info read-only "per yang dinilai": berapa penilai ditugaskan & berapa sudah menilai dia. */
export type TargetRow = { id: string; name: string; dept: string; total: number; done: number };

export function ProgressClient({ rows, targetRows, readOnly = false }: { rows: AssessorRow[]; targetRows: TargetRow[]; readOnly?: boolean }) {
  const [q, setQ] = useState('');
  const [deptSel, setDeptSel] = useState<Set<string>>(new Set());     // kosong = semua divisi
  // Default: hanya penilai BELUM lengkap (perlu tindakan) → halaman fokus. Ubah/hapus filter Status
  // untuk melihat yang sudah lengkap. (kosong = semua status)
  const [statusSel, setStatusSel] = useState<Set<string>>(new Set(['belum']));
  // BR-03: filter cepat "hanya yang ada Not Eligible" — tanpa ini HRD harus buka Rincian
  // satu-satu untuk menemukan siapa yang perlu direview (tak praktis kalau penilai banyak).
  const [onlyNotEligible, setOnlyNotEligible] = useState(false);
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
    const notEligible = rows.reduce((s, r) => s + r.notEligible.length, 0);
    return { total, done, pending: total - done, pct: tasks ? Math.round((doneTasks / tasks) * 100) : 0, notEligible };
  }, [rows]);

  const shown = rows.filter((r) => {
    const complete = isComplete(r);
    const statusKey = complete ? 'lengkap' : 'belum';
    if (q.trim() && !r.name.toLowerCase().includes(q.toLowerCase())) return false;
    if (deptSel.size > 0 && !deptSel.has(r.dept)) return false;
    // Filter Status diabaikan saat mencari Not Eligible — penilai bisa "Lengkap" (wajib
    // lainnya sudah dikirim) tapi tetap punya kewajiban Not Eligible yang perlu direview.
    if (!onlyNotEligible && statusSel.size > 0 && !statusSel.has(statusKey)) return false;
    if (onlyNotEligible && r.notEligible.length === 0) return false;
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
      {/* Stats */}
      <div className={`grid grid-cols-2 gap-2 ${stats.notEligible > 0 || onlyNotEligible ? 'sm:grid-cols-5' : 'sm:grid-cols-4'}`}>
        <Stat label="Total Penilai" value={stats.total} c="text-ink" />
        <Stat label="Lengkap (wajib)" value={stats.done} c="text-brand-ink" />
        <Stat label="Belum (wajib)" value={stats.pending} c="text-warn-ink" />
        <Stat label="Progres Wajib" value={`${stats.pct}%`} c="text-brand-ink" />
        {/* Kartu Not Eligible hanya tampil bila ADA data (Exposure Check dinonaktifkan Q3 2026 →
            normalnya 0 & disembunyikan agar tak membingungkan). */}
        {(stats.notEligible > 0 || onlyNotEligible) && (
        <button type="button" onClick={() => { setOnlyNotEligible((v) => !v); setPage(0); }}
          className={`border rounded-panel p-3 text-center transition-colors ${
            onlyNotEligible ? 'border-danger-ink bg-danger-tint' : 'border-line bg-surface hover:bg-neutral-tint'
          }`}>
          <div className={`text-xl font-bold data-value ${stats.notEligible ? 'text-danger-ink' : 'text-ink-faint'}`}>{stats.notEligible}</div>
          <div className="text-[10px] font-semibold text-ink-faint uppercase tracking-[0.04em]">
            Not Eligible (review){onlyNotEligible ? ' · aktif' : ''}
          </div>
        </button>
        )}
      </div>
      {onlyNotEligible && (
        <p className="text-[11px] text-danger-ink italic">
          Menampilkan hanya penilai yang punya kewajiban <strong>Not Eligible</strong> (perlu direview). Klik kartu di atas lagi untuk kembali ke tampilan biasa.
        </p>
      )}

      {/* Controls */}
      <div className="flex flex-wrap gap-2 items-center">
        <input value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} placeholder="Cari nama penilai…"
          className="text-xs px-3 py-2 border border-line rounded-control bg-surface flex-1 min-w-[160px] focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand-tint" />
        <MultiCheckFilter label="Divisi"
          options={depts.map((d) => ({ value: d, label: d }))}
          selected={deptSel} onChange={(s) => { setDeptSel(s); setPage(0); }} />
        <MultiCheckFilter label="Status"
          options={[{ value: 'lengkap', label: 'Lengkap' }, { value: 'belum', label: 'Belum Lengkap' }]}
          selected={statusSel} onChange={(s) => { setStatusSel(s); setPage(0); }} />
        {!readOnly && (
          <>
            <button type="button" onClick={() => act(massReminder)} disabled={pending}
              className="text-xs font-semibold px-3.5 py-2 rounded-control bg-brand hover:bg-brand-ink text-white disabled:opacity-60">
              🔔 Kirim Pengingat Massal
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
              className="text-xs font-semibold px-3.5 py-2 rounded-control border border-line text-ink-soft hover:text-ink hover:border-line-strong disabled:opacity-60">
              📨 Kirim Undangan Massal
            </button>
          </>
        )}
      </div>
      {toast && <p className={`text-xs font-semibold ${toast.ok ? 'text-brand-ink' : 'text-danger-ink'}`}>{toast.text}</p>}

      {/* Catatan tampilan bawaan: fokus ke yang perlu tindakan. */}
      {statusSel.size === 1 && statusSel.has('belum') && (
        <p className="text-[11px] text-ink-faint italic">
          Menampilkan penilai yang <strong className="font-semibold text-ink-soft">belum lengkap</strong> (perlu tindakan). Ubah filter <strong className="font-semibold text-ink-soft">Status</strong> untuk melihat semua.
        </p>
      )}

      {/* Rows (per penilai) */}
      <div className="space-y-2">
        {shown.length === 0 && (
          <p className="text-sm text-ink-soft">
            {stats.pending === 0 ? '✅ Semua penilai sudah lengkap (wajib).' : 'Tidak ada penilai sesuai filter.'}
            <span className="block text-[11px] mt-0.5 text-ink-faint">Ubah filter <strong className="font-semibold text-ink-soft">Status</strong> (mis. tambahkan “Lengkap”) untuk melihat penilai lain.</span>
          </p>
        )}
        {paged.map((r) => {
          const complete = isComplete(r);
          const pct = r.mandatoryTotal ? Math.round((r.mandatoryDone / r.mandatoryTotal) * 100) : 100;
          const optionalPending = r.pending.filter((p) => !p.mandatory).length;
          const by = dinilaiBy.get(r.id);
          const byComplete = !!by && by.total > 0 && by.done === by.total;
          const byPct = by && by.total ? Math.round((by.done / by.total) * 100) : 0;
          return (
            <div key={r.id} className="border border-line rounded-panel bg-surface p-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-3">
                <div className="min-w-0">
                  <span className="font-bold text-ink text-sm">{r.name}</span>
                  <span className="text-[11px] text-ink-faint"> · {r.dept}</span>
                  {/* Terlihat langsung tanpa buka Rincian — HRD tak perlu menebak/cek satu-satu. */}
                  {r.notEligible.length > 0 && (
                    <span className="ml-1.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-danger-tint text-danger-ink border border-danger-ink/25">
                      ⚠ {r.notEligible.length} Not Eligible
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${complete ? 'bg-brand-tint text-brand-ink' : 'bg-warn-tint text-warn-ink'}`}>
                    <span className="data-value">{r.mandatoryDone}/{r.mandatoryTotal}</span> wajib · {complete ? 'Lengkap' : 'Belum'}
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
                      className="text-[11px] font-semibold px-2.5 py-1 rounded-control border border-line text-ink-soft hover:text-ink hover:border-line-strong disabled:opacity-60">
                      Undangan
                    </button>
                  )}
                  {!readOnly && !complete && (
                    <button type="button" onClick={() => act(() => sendReminder(r.id))} disabled={pending}
                      className="text-[11px] font-semibold px-2.5 py-1 rounded-control border border-line text-brand-ink hover:border-brand disabled:opacity-60">
                      Kirim Pengingat
                    </button>
                  )}
                  {/* Rincian (nama target = siapa-menilai-siapa) hanya untuk HRD, bukan pemegang grant. */}
                  {!readOnly && (r.pending.length > 0 || r.notEligible.length > 0) && (
                    <button type="button" onClick={() => setExpanded(expanded === r.id ? null : r.id)}
                      className="text-[11px] font-semibold text-ink-faint hover:text-ink-soft">
                      {expanded === r.id ? 'Tutup' : `Rincian (${r.pending.length}${r.notEligible.length ? ` + ${r.notEligible.length} Not Eligible` : ''})`}
                    </button>
                  )}
                </div>
              </div>
              {/* Dua progres berdampingan (paritas legacy): "Menilai" vs "Dinilai oleh". */}
              <div className="grid sm:grid-cols-2 gap-x-4 gap-y-2 mt-2">
                <div>
                  <div className="flex justify-between items-center text-[10px] font-semibold text-ink-faint mb-0.5">
                    <span>Menilai (wajib)</span>
                    <span className="data-value">{r.mandatoryDone}/{r.mandatoryTotal} · {pct}%</span>
                  </div>
                  <div className="h-2 bg-line-soft rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${complete ? 'bg-brand' : 'bg-warn-ink'}`} style={{ width: `${pct}%` }} />
                  </div>
                  {optionalPending > 0 && (
                    <p className="text-[10px] text-ink-faint mt-0.5">+{optionalPending} opsional belum (tak memengaruhi status)</p>
                  )}
                </div>
                <div>
                  <div className="flex justify-between items-center text-[10px] font-semibold text-ink-faint mb-0.5">
                    <span>Dinilai oleh</span>
                    <span className="data-value">{by ? `${by.done}/${by.total} orang · ${byPct}%` : '—'}</span>
                  </div>
                  <div className="h-2 bg-line-soft rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${byComplete ? 'bg-brand' : 'bg-warn-ink'}`} style={{ width: `${byPct}%` }} />
                  </div>
                </div>
              </div>
              {expanded === r.id && r.pending.length > 0 && (
                <div className="mt-3 space-y-1.5 border-t border-line-soft pt-2">
                  <p className="text-[10px] uppercase tracking-[0.05em] text-ink-faint font-semibold">Belum dinilai:</p>
                  {r.pending.map((p) => (
                    <div key={p.targetId} className="flex items-center justify-between gap-2 text-xs">
                      <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                        <span className="text-ink-soft font-semibold">{p.targetName}</span>
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-neutral-tint text-ink-soft">{p.relation}</span>
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${p.mandatory ? 'bg-danger-tint text-danger-ink' : 'bg-neutral-tint text-ink-faint'}`}>
                          {p.mandatory ? 'Wajib' : 'Opsional'}
                        </span>
                      </div>
                      {!readOnly && (
                        <button type="button" onClick={() => act(() => forceComplete(r.id, p.targetId))} disabled={pending}
                          className="text-[11px] font-semibold px-2.5 py-1 rounded-control border border-line text-ink-soft hover:text-ink hover:border-line-strong disabled:opacity-60 shrink-0">
                          Paksa Selesai
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {/* BR-03: flag Not Eligible untuk direview HRD — penilaian sudah gugur, bukan tunggakan. */}
              {expanded === r.id && r.notEligible.length > 0 && (
                <div className="mt-3 space-y-1.5 border-t border-line-soft pt-2">
                  <p className="text-[10px] uppercase tracking-[0.05em] text-danger-ink font-semibold">Not Eligible (perlu review HRD):</p>
                  {r.notEligible.map((p) => (
                    <div key={p.targetId} className="flex items-center justify-between gap-2 text-xs">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-ink-soft font-semibold">{p.targetName}</span>
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-neutral-tint text-ink-soft">{p.relation}</span>
                        </div>
                        {p.reason && <p className="text-[10.5px] text-ink-faint italic mt-0.5">Alasan: {p.reason}</p>}
                      </div>
                      {!readOnly && (
                        <button type="button" onClick={() => setConfirm({
                          title: `Kosongkan status Exposure Check ${r.name} → ${p.targetName}?`,
                          onYes: () => act(() => resetExposureStatus(r.id, p.targetId)),
                          body: <p>Penilai akan diminta mengisi ulang <strong>Exposure Check</strong> untuk pasangan ini dari awal.</p>,
                          confirmLabel: 'Ya, Kosongkan', icon: '🔁', tone: 'danger',
                        })} disabled={pending}
                          className="text-[11px] font-semibold px-2.5 py-1 rounded-control border border-line text-ink-soft hover:text-ink hover:border-line-strong disabled:opacity-60 shrink-0">
                          Reset (isi ulang)
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
      <p className="text-[11px] text-ink-faint leading-relaxed">
        <strong className="font-semibold text-ink-soft">Status "Lengkap"</strong> dihitung dari penilaian <strong className="font-semibold text-ink-soft">WAJIB</strong> saja — penilaian
        opsional tak memengaruhi status/kartu (tetap ditampilkan di Rincian untuk dipantau). Tiap baris:
        <strong> Menilai (wajib)</strong> (tugas wajib penilai) &amp; <strong>Dinilai oleh</strong> (berapa
        penilai sudah menilai pegawai ini). “Paksa Selesai” menandai penilaian terkirim; “Kirim Pengingat”
        mengirim email berisi daftar yang belum dinilai; “Undangan” / “Kirim Undangan Massal” mengirim
        info akun (peran, email, sandi baru, panduan) sekali di awal periode — sandi disetel ulang.
        <strong> Not Eligible</strong> = penilai menyatakan tak punya exposure kerja cukup (BR-03 Exposure
        Check) — kewajibannya gugur (tak dihitung tunggakan/skor/penalty); &quot;Reset&quot; membuka kembali
        Exposure Check bila penilaiannya perlu diulang.
      </p>

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

function Stat({ label, value, c }: { label: string; value: number | string; c: string }) {
  return (
    <div className="border border-line rounded-panel bg-surface p-3 text-center">
      <div className={`text-xl font-bold data-value ${c}`}>{value}</div>
      <div className="text-[10px] font-semibold text-ink-faint uppercase tracking-[0.05em]">{label}</div>
    </div>
  );
}
