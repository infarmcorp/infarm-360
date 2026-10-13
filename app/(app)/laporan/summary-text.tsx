import { Fragment } from 'react';
import { parseSummary, type SummaryLine } from '@/lib/summary-format';

/** Render ringkasan berformat (tebal, poin, paragraf) — aturan penulisan di lib/summary-format.ts. */
export function SummaryText({ text, className = '' }: { text: string; className?: string }) {
  const blocks = parseSummary(text);
  return (
    <div className={`space-y-2 ${className}`}>
      {blocks.map((b, i) => b.kind === 'p'
        ? <p key={i}><Lines lines={b.lines} /></p>
        : (
          <ul key={i} className="list-disc pl-4 space-y-1 marker:text-ink-faint">
            {b.items.map((lines, j) => <li key={j} className="pl-0.5"><Lines lines={lines} /></li>)}
          </ul>
        ))}
    </div>
  );
}

function Lines({ lines }: { lines: SummaryLine[] }) {
  return lines.map((line, i) => (
    <Fragment key={i}>
      {i > 0 && <br />}
      {line.map((s, j) => s.bold
        ? <strong key={j} className="font-semibold text-ink">{s.text}</strong>
        : <Fragment key={j}>{s.text}</Fragment>)}
    </Fragment>
  ));
}
