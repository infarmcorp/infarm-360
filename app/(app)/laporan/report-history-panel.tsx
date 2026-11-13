import { History } from 'lucide-react';
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
    <details className="no-print mb-4 rounded-card border border-line bg-surface shadow-card px-4 py-3 text-[13px]">
      <summary className="cursor-pointer select-none font-bold text-ink">
        <History className="inline w-4 h-4 mr-1.5 -mt-0.5 text-brand align-middle" aria-hidden />
        Riwayat Laporan
        {history.ok && <span className="ml-1 font-normal text-ink-soft">(<span className="data-value">{history.events.length}</span> catatan)</span>}
        <span className="ml-2 text-xs font-normal text-ink-soft">— kapan persetujuan diberikan/dibatalkan, perubahan status &amp; Skor Akhir</span>
      </summary>
      {!history.ok ? (
        <p className="mt-2 text-warn-ink">Riwayat belum aktif. Hubungi admin aplikasi untuk mengaktifkannya.</p>
      ) : history.events.length === 0 ? (
        <p className="mt-2 text-ink-soft">Belum ada perubahan tercatat sejak riwayat diaktifkan.</p>
      ) : (
        <ol className="mt-2 space-y-2 border-l border-line pl-3">
          {history.events.map((e, i) => (
            <li key={i} className="relative">
              <span className="absolute -left-[17px] top-1.5 h-2 w-2 rounded-full bg-line-strong" aria-hidden />
              <p className="text-xs text-ink-soft">
                <span className="data-value">{fmtWib(e.at)}</span> WIB
                {' · '}{e.actor ?? <span className="italic">pelaku tak tercatat</span>}
                {e.actorFromLog && <span className="italic"> (dari log aktivitas)</span>}
              </p>
              {e.items.map((it, j) => <p key={j} className={`font-semibold ${TONE[it.tone]}`}>{it.text}</p>)}
            </li>
          ))}
        </ol>
      )}
      <p className="mt-2 text-xs text-ink-soft">
        Semua perubahan dicatat otomatis. Perubahan yang gagal terkirim ke server tidak muncul di sini karena tidak pernah tersimpan.
      </p>
    </details>
  );
}
