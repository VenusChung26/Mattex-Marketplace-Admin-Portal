import { formatQuoteVersionStamp, rfqActivityLabel, rfqActivityLog } from "../lib/store";

export default function RfqActivityLog({ rfq, lang = "en", audience = "buyer", title = "Activity" }) {
  const log = rfqActivityLog(rfq, { audience });
  if (!log.length) return null;
  return (
    <section className="rounded-xl border border-line bg-white p-4">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-mute">{title}</h2>
      <ol className="mt-3 max-h-72 space-y-2.5 overflow-auto">
        {log.map((event, index) => (
          <li key={event.id || `${event.kind}-${event.at}-${index}`} className="flex gap-3">
            <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand-600" aria-hidden />
            <div className="min-w-0">
              <p className="text-sm text-ink">{rfqActivityLabel(event, lang)}</p>
              <time className="mt-0.5 block text-[11px] tabular-nums text-mute" dateTime={event.at}>
                {formatQuoteVersionStamp(event.at)}
              </time>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
