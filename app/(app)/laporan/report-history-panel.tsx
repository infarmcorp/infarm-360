import type { HistoryEvent } from '@/lib/report-history';

/**
 * Panel "Riwayat Laporan" (detail laporan, HRD Mode Admin): garis waktu perubahan ACC, status, dan
 * Skor Akhir dari riwayat database (migrasi 0052). Tertutup bawaan; tak ikut tercetak. Dipakai untuk
 * menjawab "sudah ACC tanggal berapa / sejak kapan ACC hilang" tanpa SQL.
 */
const fmtWib = (iso: string) =>
  new Date(iso).toLocaleString('id-ID', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit',
    timeZone: 'Asia/Jakarta',
  });

const TONE: Record<string, string> = { brand: 'text-brand-ink', danger: 'text-danger-ink', neutral: 'text-ink-soft' };

export function ReportHistoryPanel({ history }: { history: { ok: true; events: HistoryEvent[] } | { ok: false } }) {
  return (
    <details className="no-print mb-3 rounded-panel border border-line bg-surface px-3 py-2 text-[12.5px]">
      <summary className="cursor-pointer select-none font-semibold text-ink">
        Riwayat Laporan
        {history.ok && <span className="ml-1 font-normal text-ink-faint">(<span className="data-value">{history.events.length}</span> catatan)</span>}
        <span className="ml-2 font-normal text-ink-faint">— kapan ACC diberikan/dibatalkan, perubahan status &amp; Skor Akhir</span>
      </summary>
      {!history.ok ? (
        <p className="mt-2 text-warn-ink">Riwayat belum aktif — perubahan database 0052 belum dijalankan.</p>
      ) : history.events.length === 0 ? (
        <p className="mt-2 text-ink-faint">Belum ada perubahan tercatat sejak riwayat diaktifkan.</p>
      ) : (
        <ol className="mt-2 space-y-2 border-l border-line pl-3">
          {history.events.map((e, i) => (
            <li key={i} className="relative">
              <span className="absolute -left-[17px] top-1.5 h-2 w-2 rounded-full bg-line-strong" aria-hidden />
              <p className="text-[11.5px] text-ink-faint">
                <span className="data-value">{fmtWib(e.at)}</span> WIB
                {' · '}{e.actor ?? <span className="italic">pelaku tak tercatat</span>}
                {e.actorFromLog && <span className="italic"> (dari log aktivitas)</span>}
              </p>
              {e.items.map((it, j) => <p key={j} className={`font-semibold ${TONE[it.tone]}`}>{it.text}</p>)}
            </li>
          ))}
        </ol>
      )}
      <p className="mt-2 text-[11px] text-ink-faint">
        Dicatat otomatis oleh database untuk setiap perubahan, apa pun jalurnya. Klik yang gagal terkirim ke server tidak
        akan muncul di sini — artinya perubahan itu memang tidak pernah tersimpan.
      </p>
    </details>
  );
}
