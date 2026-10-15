import { useMemo, useState } from "react";
import { confirmPurchaseOrder } from "../../lib/remote";
import { buildQuotePdf, downloadBlob } from "../../lib/quotePdf";
import { getProduct } from "../../lib/store";
import MailStatus from "./MailStatus";
import { AdminSearchBar, FilterTabs, STICKY_ACTION_TD, STICKY_ACTION_TH, ViewToggle } from "./AdminControls";
import { adminText } from "../../lib/adminCopy";
import { useLanguage } from "../../i18n";

function money(value) {
  return `HKD ${Number(value || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function stamp(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

const FILTERS = [
  { id: "created", label: "To confirm" },
  { id: "confirmed", label: "Confirmed" },
  { id: "all", label: "All" },
];

/**
 * Purchase orders placed with "Buy now". Display only: the server owns status and numbers.
 * The list comes from the Portal (`po`), which keeps it fresh on every page for the sidebar badge.
 */
export default function PoPanel({ note, po: source }) {
  const { lang } = useLanguage();
  const pt = (value) => adminText(lang, value);
  const { records, state, updatedAt, refresh, replace } = source;
  const [filter, setFilter] = useState("created");
  const [view, setView] = useState("list");
  const [query, setQuery] = useState("");
  const [busyId, setBusyId] = useState("");
  const [pdfId, setPdfId] = useState("");

  const counts = useMemo(
    () => ({
      created: records.filter((po) => po.status !== "confirmed").length,
      confirmed: records.filter((po) => po.status === "confirmed").length,
      all: records.length,
    }),
    [records]
  );

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return records.filter((po) => {
      if (filter === "created" && po.status === "confirmed") return false;
      if (filter === "confirmed" && po.status !== "confirmed") return false;
      if (!q) return true;
      const hay = [po.id, po.buyerName, po.buyerEmail, po.buyerPhone, ...(po.lines || []).flatMap((l) => [l.sku, l.name])]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [records, filter, query]);

  async function downloadPdf(po) {
    if (pdfId) return;
    setPdfId(po.id);
    try {
      const pdf = await buildQuotePdf({
        kind: "buy",
        refNo: po.id,
        buyer: { email: po.buyerEmail, name: po.buyerName, phone: po.buyerPhone },
        items: (po.lines || []).map((line, index) => ({
          index: index + 1,
          name: line.name || line.sku || "-",
          sku: line.sku || line.productId || "-",
          qty: `${line.qty}${line.unit ? ` ${line.unit}` : ""}`,
          price: money(line.unitPrice),
          spec: "",
          attachments: "",
          image: getProduct(line.productId)?.image || "",
        })),
      });
      downloadBlob(pdf.blob, pdf.filename);
      if (pdf.url?.startsWith("blob:")) URL.revokeObjectURL(pdf.url);
    } catch {
      note?.({ ok: false, error: pt("Could not create the PDF. Try again.") });
    } finally {
      setPdfId("");
    }
  }

  function pdfButton(po) {
    const busy = pdfId === po.id;
    return (
      <button
        type="button"
        disabled={Boolean(pdfId)}
        className="rounded-lg border border-line bg-white px-3 py-1.5 text-xs font-semibold text-ink hover:bg-brand-50 disabled:opacity-60"
        onClick={() => downloadPdf(po)}
      >
        {busy ? pt("Preparing PDF…") : pt("Download PDF")}
      </button>
    );
  }

  async function confirm(po) {
    setBusyId(po.id);
    const result = await confirmPurchaseOrder(po.id);
    setBusyId("");
    if (result.ok) {
      replace(result.po);
      setFilter("confirmed");
      note?.({ ok: true }, `${po.id} ${pt("marked as received")}`);
    } else {
      note?.({ ok: false, error: pt("Could not confirm this PO. Try again.") });
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-ink">{pt("Purchase orders")}</h1>
          <p className="mt-1 text-sm text-mute">{pt("Orders placed with Buy now. Confirm each one once Sales has received it.")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-3 text-xs text-mute">
            {updatedAt ? <span>{pt("Updated")} {stamp(updatedAt)}</span> : null}
            <button type="button" className="rounded-lg border border-line bg-white px-3 py-1.5 text-sm text-ink hover:bg-brand-50" onClick={refresh}>
              {pt("Refresh")}
            </button>
          </div>
          <ViewToggle value={view} onChange={setView} label="Purchase order view" />
        </div>
      </div>

      <div className="mt-4">
        <AdminSearchBar value={query} onChange={setQuery} label={pt("Search")} placeholder={pt("Search PO no., buyer, product…")} />
        <FilterTabs tabs={FILTERS} counts={counts} value={filter} onChange={setFilter} label={pt("Purchase order status")} />
      </div>

      {state === "error" ? (
        <p className="mt-4 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {pt("Could not reach the server. Showing the last list and retrying.")}
        </p>
      ) : null}

      {state === "loading" ? <p className="mt-6 text-sm text-mute">{pt("Loading…")}</p> : null}
      {state !== "loading" && !shown.length ? <p className="mt-6 text-sm text-mute">{pt("No purchase orders here.")}</p> : null}

      {view === "list" && shown.length ? (
        <div className="overflow-auto rounded-xl border border-line bg-white max-h-[calc(100vh-20rem)]">
          <table className="w-full min-w-[52rem] text-left text-[12px]">
            <thead className="pointer-events-none sticky top-0 z-10 bg-brand-50 text-[10px] font-semibold uppercase tracking-wide text-mute">
              <tr>
                {[pt("PO"), pt("Buyer"), pt("Products"), pt("Total"), pt("Status"), pt("Activity"), pt("Action")].map((h, i) => (
                  <th key={h} className={i === 6 ? STICKY_ACTION_TH : "px-3 py-2"}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map((row) => {
                const confirmed = row.status === "confirmed";
                const noContact = row.buyerKind === "guest" && !row.buyerEmail && !row.buyerPhone;
                return (
                  <tr key={row.id} className="border-t border-line/80 align-top">
                    <td className="whitespace-nowrap px-3 py-2 font-semibold text-ink">{row.id}</td>
                    <td className="min-w-[10rem] px-3 py-2">
                      {noContact ? (
                        <span className="text-mute">{pt("No contact details")}</span>
                      ) : (
                        <>
                          <p className="font-medium text-ink">{row.buyerName || row.buyerEmail || row.buyerPhone}</p>
                          {[row.buyerName ? row.buyerEmail : "", row.buyerPhone].filter(Boolean).map((v) => (
                            <p key={v} className="break-all text-mute">{v}</p>
                          ))}
                        </>
                      )}
                      {row.buyerKind === "guest" ? (
                        <span className="mt-1 inline-block rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-700">{pt("Guest")}</span>
                      ) : null}
                    </td>
                    <td className="min-w-[14rem] px-3 py-2">
                      <ul className="space-y-1">
                        {(row.lines || []).map((line) => (
                          <li key={`${row.id}-${line.productId}`}>
                            <span className="font-medium text-ink">{line.name}</span>
                            <span className="ml-1 text-mute">{line.sku}</span>
                            <span className="ml-1 text-mute">× {line.qty} {line.unit}</span>
                          </li>
                        ))}
                      </ul>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 font-semibold text-ink">{money(row.total)}</td>
                    <td className="px-3 py-2">
                      <span
                        className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                          confirmed ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
                        }`}
                      >
                        {confirmed ? pt("Received") : pt("To confirm")}
                      </span>
                    </td>
                    <td className="min-w-[10rem] px-3 py-2 text-mute">
                      <p>{pt("Placed")} {stamp(row.createdAt)}</p>
                      {confirmed ? <p>{pt("Received")} {stamp(row.confirmedAt)} · {row.confirmedBy}</p> : null}
                      <MailStatus id={row.id} mail={row.mail || []} onRecord={replace} note={note} className="mt-2 !px-2 !py-1.5 !text-[11px]" />
                    </td>
                    <td className={`${STICKY_ACTION_TD} whitespace-nowrap`}>
                      <div className="flex flex-col items-stretch gap-1.5">
                        {confirmed ? null : (
                          <button
                            type="button"
                            disabled={busyId === row.id}
                            className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
                            onClick={() => confirm(row)}
                          >
                            {busyId === row.id ? pt("Confirming…") : pt("Confirm PO received")}
                          </button>
                        )}
                        {pdfButton(row)}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}

      {view === "card" ? (
      <ul className="mt-4 space-y-3">
        {shown.map((po) => {
          const confirmed = po.status === "confirmed";
          const noContact = po.buyerKind === "guest" && !po.buyerEmail && !po.buyerPhone;
          return (
            <li key={po.id} className="rounded-xl border border-line bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-base font-bold text-ink">{po.id}</span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                      confirmed ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
                    }`}
                  >
                    {confirmed ? pt("Received") : pt("To confirm")}
                  </span>
                  {po.buyerKind === "guest" ? (
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-700">{pt("Guest")}</span>
                  ) : null}
                </div>
                <span className="text-sm text-mute">{stamp(po.createdAt)}</span>
              </div>

              <p className="mt-2 text-sm text-ink">
                {noContact
                  ? pt("No contact details")
                  : [po.buyerName, po.buyerEmail, po.buyerPhone].filter(Boolean).join(" · ")}
              </p>

              <ul className="mt-3 divide-y divide-line text-sm">
                {(po.lines || []).map((line) => (
                  <li key={`${po.id}-${line.productId}`} className="flex flex-wrap items-baseline justify-between gap-2 py-1.5">
                    <span className="min-w-0">
                      <span className="font-medium text-ink">{line.name}</span>
                      <span className="ml-2 text-mute">{line.sku}</span>
                    </span>
                    <span className="text-mute">
                      {line.qty} {line.unit} × {money(line.unitPrice)} = <span className="font-semibold text-ink">{money(line.lineTotal)}</span>
                    </span>
                  </li>
                ))}
              </ul>

              <MailStatus id={po.id} mail={po.mail || []} onRecord={replace} note={note} className="mt-3" />

              <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm font-semibold text-ink">
                  {pt("Total")} {money(po.total)}
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  {pdfButton(po)}
                  {confirmed ? (
                    <p className="text-xs text-mute">
                      {pt("Received")} {stamp(po.confirmedAt)} · {po.confirmedBy}
                    </p>
                  ) : (
                    <button
                      type="button"
                      disabled={busyId === po.id}
                      className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                      onClick={() => confirm(po)}
                    >
                      {busyId === po.id ? pt("Confirming…") : pt("Confirm PO received")}
                    </button>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      ) : null}
    </div>
  );
}
