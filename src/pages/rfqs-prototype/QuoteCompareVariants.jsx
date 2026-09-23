/**
 * PROTOTYPE — Multi-supplier quote compare + accept on /rfqs?variant=
 * Question: How should a buyer compare 3–4 supplier quotes and accept one?
 * A Mix-and-match grid · B Line×supplier matrix · C Ranked shortlist
 */
import { useState } from "react";
import { formatPrice } from "../../lib/store";
import VariantA, { buildAcceptanceFromPicks } from "./QuoteCompareVariantA";

export { buildAcceptanceFromPicks };

export const QUOTE_PROTOTYPE_VARIANTS = [
  { key: "A", name: "Mix & match", Component: VariantA },
  { key: "B", name: "Compare matrix", Component: VariantB },
  { key: "C", name: "Ranked shortlist", Component: VariantC },
];

function normalizeAcceptance(quotes, payload) {
  if (!payload) return null;
  if (typeof payload === "object" && payload.mode) return payload;
  const quoteId = typeof payload === "string" ? payload : payload?.quoteId;
  const quote = quotes.find((q) => q.id === quoteId);
  if (!quote) return null;
  const picks = Object.fromEntries(quote.lines.map((l) => [l.productId, quote.id]));
  // Build via full quote lines — rfq not needed if we synthesize
  return {
    mode: "full",
    quoteId: quote.id,
    picks,
    lines: quote.lines.map((l) => ({
      productId: l.productId,
      requestName: l.requestName || l.name,
      quoteId: quote.id,
      supplierName: quote.supplierName,
      offer: l,
      lineTotal: l.lineTotal,
    })),
    total: quote.total,
    supplierNames: [quote.supplierName],
    label: quote.supplierName,
  };
}

function AcceptedBanner({ acceptance, onReset }) {
  if (!acceptance) return null;
  const mixed = acceptance.mode === "mixed";
  return (
    <div className="mb-5 border border-brand-600 bg-brand-50 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-brand-600">Accepted</p>
        <p className="text-sm font-semibold text-brand-800">
          {acceptance.label} · {formatPrice(acceptance.total)}
        </p>
        <p className="text-xs text-mute mt-0.5">
          {mixed
            ? `${acceptance.lines?.length || 0} lines from ${acceptance.supplierNames?.length || 0} suppliers`
            : "Full quote from one supplier"}
          {" · "}
          Next: payment (incl. COD) &amp; delivery docs.
        </p>
      </div>
      <button type="button" className="btn-soft !px-3 !py-2 text-sm" onClick={onReset}>
        Undo accept
      </button>
    </div>
  );
}

function ProtoState({ rfq, quotes, acceptance }) {
  return (
    <pre className="mt-6 text-[11px] leading-relaxed bg-charcoal text-white/85 p-3 overflow-x-auto">
      {JSON.stringify(
        {
          prototype: "quote-compare",
          rfqId: rfq?.id,
          status: acceptance ? "accepted" : "quoted",
          acceptance: acceptance
            ? { mode: acceptance.mode, label: acceptance.label, total: acceptance.total }
            : null,
        },
        null,
        2
      )}
    </pre>
  );
}

/** B — matrix: rows = lines, columns = suppliers; one Accept for selected column. */
export function VariantB({ rfq, quotes, acceptance, onAccept, onReset }) {
  const locked = Boolean(acceptance);
  const lineKeys = rfq.lines.map((l) => l.productId);
  const [pickedId, setPickedId] = useState(acceptance?.quoteId || quotes[0]?.id);
  const selectedId = acceptance?.quoteId || pickedId;
  const selected = quotes.find((q) => q.id === selectedId);

  return (
    <div>
      <AcceptedBanner acceptance={acceptance} onReset={onReset} />
      <div className="mb-3">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-mute">Compare by line</p>
        <h3 className="mt-1 text-lg font-bold text-brand-800">Supplier price matrix</h3>
        <p className="mt-1 text-xs text-mute">This variant accepts a full supplier quote only.</p>
      </div>

      <div className="overflow-x-auto border border-line rounded-xl">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="bg-brand-50/80 text-left">
              <th className="px-3 py-2.5 font-semibold text-mute text-xs uppercase tracking-wide sticky left-0 bg-brand-50/80">
                Line
              </th>
              {quotes.map((q) => (
                <th key={q.id} className="px-3 py-2.5 font-semibold text-brand-800 min-w-[8.5rem]">
                  <label className="flex items-start gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name={`quote-pick-${rfq.id}`}
                      checked={selectedId === q.id}
                      disabled={locked}
                      onChange={() => setPickedId(q.id)}
                      className="mt-1 accent-[#245A41]"
                    />
                    <span>
                      <span className="block text-sm leading-snug">{q.supplierName}</span>
                      <span className="block text-xs font-normal text-mute mt-0.5">
                        {q.leadDays}d · {formatPrice(q.total)}
                      </span>
                    </span>
                  </label>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {lineKeys.map((pid) => {
              const label = rfq.lines.find((l) => l.productId === pid);
              return (
                <tr key={pid}>
                  <td className="px-3 py-2.5 sticky left-0 bg-white text-ink font-medium max-w-[10rem]">
                    <span className="block truncate">{label?.name}</span>
                    <span className="text-xs text-mute">×{label?.qty}</span>
                  </td>
                  {quotes.map((q) => {
                    const cell = q.lines.find((l) => l.productId === pid);
                    const isCol = q.id === selectedId;
                    return (
                      <td
                        key={q.id}
                        className={`px-3 py-2.5 tabular-nums ${
                          isCol ? "bg-brand-50/50 font-semibold text-brand-800" : "text-mute"
                        }`}
                      >
                        {cell
                          ? cell.unitPrice == null
                            ? formatPrice(cell.lineTotal)
                            : formatPrice(cell.unitPrice)
                          : "—"}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
            <tr className="bg-paper/80 font-semibold">
              <td className="px-3 py-2.5 sticky left-0 bg-paper/80">Total</td>
              {quotes.map((q) => (
                <td
                  key={q.id}
                  className={`px-3 py-2.5 ${q.id === selectedId ? "text-brand-700" : "text-ink"}`}
                >
                  {formatPrice(q.total)}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-mute">
          Selected: <span className="font-semibold text-ink">{selected?.supplierName || "—"}</span>
        </p>
        {!locked ? (
          <button
            type="button"
            className="btn-primary !px-5 !py-2.5"
            disabled={!selected}
            onClick={() => selected && onAccept(normalizeAcceptance(quotes, selected.id))}
          >
            Accept {selected?.supplierName || "quote"}
          </button>
        ) : null}
      </div>
      <ProtoState rfq={rfq} quotes={quotes} acceptance={acceptance} />
    </div>
  );
}

/** C — ranked list (lowest first); expand one; Accept for focused quote. */
export function VariantC({ rfq, quotes, acceptance, onAccept, onReset }) {
  const locked = Boolean(acceptance);
  const ranked = [...quotes].sort((a, b) => a.total - b.total);
  const [openId, setOpenId] = useState(ranked[0]?.id);

  return (
    <div>
      <AcceptedBanner acceptance={acceptance} onReset={onReset} />
      <div className="mb-3">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-mute">Shortlist</p>
        <h3 className="mt-1 text-lg font-bold text-brand-800">Ranked by total</h3>
        <p className="mt-1 text-sm text-mute">Expand a supplier, then accept the full quote.</p>
      </div>

      <ol className="space-y-2">
        {ranked.map((q, i) => {
          const open = q.id === openId;
          const isAccepted = acceptance?.quoteId === q.id && acceptance?.mode === "full";
          return (
            <li
              key={q.id}
              className={`border rounded-xl overflow-hidden ${
                isAccepted ? "border-brand-600" : "border-line"
              }`}
            >
              <button
                type="button"
                className="w-full text-left px-4 py-3 flex items-center gap-3 bg-white hover:bg-paper/80"
                onClick={() => setOpenId(q.id)}
              >
                <span className="inline-flex h-7 w-7 items-center justify-center bg-brand-600 text-white text-xs font-bold shrink-0">
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold text-brand-800 truncate">{q.supplierName}</span>
                  <span className="block text-xs text-mute mt-0.5">
                    Lead {q.leadDays}d · {q.note}
                  </span>
                </span>
                <span className="text-base font-bold text-brand-700 shrink-0">
                  {formatPrice(q.total)}
                </span>
              </button>
              {open ? (
                <div className="px-4 pb-4 border-t border-line bg-paper/40">
                  <ul className="mt-3 divide-y divide-line text-sm">
                    {q.lines.map((l) => (
                      <li key={l.productId} className="flex justify-between gap-3 py-2">
                        <span>
                          {l.name} ×{l.qty}
                          {l.isSet ? (
                            <span className="ml-2 text-[10px] font-bold uppercase text-brand-700">Set</span>
                          ) : null}
                        </span>
                        <span className="text-mute tabular-nums">{formatPrice(l.lineTotal)}</span>
                      </li>
                    ))}
                  </ul>
                  {!locked ? (
                    <button
                      type="button"
                      className="btn-primary mt-3 !px-5 !py-2.5"
                      onClick={() => onAccept(normalizeAcceptance(quotes, q.id))}
                    >
                      Accept this quote
                    </button>
                  ) : isAccepted ? (
                    <p className="mt-3 text-sm font-semibold text-brand-700">This quote is accepted.</p>
                  ) : null}
                </div>
              ) : null}
            </li>
          );
        })}
      </ol>
      <ProtoState rfq={rfq} quotes={quotes} acceptance={acceptance} />
    </div>
  );
}
