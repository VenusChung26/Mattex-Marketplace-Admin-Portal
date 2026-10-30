import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { confirmPurchaseOrder } from "../../lib/remote";
import { buildQuotePdf, quotePdfFilename } from "../../lib/quotePdf";
import { formatBuyerPhoneDisplay, getProduct } from "../../lib/store";
import MailStatus from "./MailStatus";
import { AdminSearchBar, FilterTabs, STICKY_ACTION_TD, STICKY_ACTION_TH, ViewToggle } from "./AdminControls";
import { FilePreviewOverlay, GuestFilePreview } from "../../components/AttachmentLinks";
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

function phoneCallHref(phone) {
  const dial = String(phone || "").replace(/[^\d+]/g, "");
  return dial ? `tel:${dial}` : "";
}

function PoBuyerCard({ po, pt }) {
  const email = String(po.buyerEmail || "").trim();
  const phone = String(po.buyerPhone || "").trim();
  const phoneText = formatBuyerPhoneDisplay(phone) || phone;
  const callHref = phoneCallHref(phone);
  const mailHref = email ? `mailto:${email}?subject=${encodeURIComponent(po.id || "")}` : "";
  const files = (Array.isArray(po.guestAttachments) ? po.guestAttachments : []).filter((file) => file?.name);
  const rows = [
    [pt("Company"), po.companyName],
    [pt("Contact"), po.buyerName],
    [pt("Email"), mailHref ? <a href={mailHref} className="break-all text-brand-800 underline underline-offset-2" title={pt("Email")}>{email}</a> : ""],
    [pt("Phone"), callHref ? <a href={callHref} className="text-brand-800 underline underline-offset-2" title={pt("Call")}>{phoneText}</a> : phoneText],
    [pt("Address"), po.delivery?.address],
    [pt("Project"), po.project],
    [pt("Delivery date"), po.delivery?.date],
    [pt("Attachment"), files.length ? <GuestFilePreview files={files} /> : ""],
  ].filter(([, value]) => {
    if (value == null || value === false) return false;
    if (typeof value === "string" || typeof value === "number") return String(value).trim();
    return true;
  });
  return (
    <section className="rounded-xl border border-line bg-white p-4">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-mute">{pt("Buyer")}</h2>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${po.buyerKind === "member" ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-700"}`}>
          {po.buyerKind === "member" ? pt("Member") : pt("Guest")}
        </span>
        <span className="text-sm font-medium text-ink">{po.buyerName || email || phoneText || pt("No contact details")}</span>
      </div>
      {rows.length ? (
        <dl className="mt-3 space-y-1.5 border-t border-line pt-3 text-sm">
          {rows.map(([label, value]) => (
            <div key={label}>
              <dt className="text-[10px] font-semibold uppercase tracking-wide text-mute">{label}</dt>
              <dd className="break-words text-ink">{value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </section>
  );
}

function PoDetail({ po, note, busy, pdfBusy, onBack, onConfirm, onPreviewPdf, onRecord }) {
  const { lang } = useLanguage();
  const pt = (value) => adminText(lang, value);
  const confirmed = po.status === "confirmed";
  return (
    <div>
      <button type="button" className="text-sm font-semibold text-brand-800 hover:underline" onClick={onBack}>
        ← {pt("Purchase orders")}
      </button>
      <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl text-brand-900">{po.id}</h1>
          <p className="mt-1 text-sm text-mute">
            {pt("Placed")} {stamp(po.createdAt)}
            {po.project ? ` · ${po.project}` : ""}
          </p>
        </div>
        <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${confirmed ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>
          {confirmed ? pt("Received") : pt("To confirm")}
        </span>
      </div>
      <MailStatus id={po.id} mail={po.mail || []} onRecord={onRecord} note={note} className="mt-4" />
      <div className={`mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 ${confirmed ? "border-line bg-white" : "border-brand-200 bg-brand-50"}`}>
        <p className="text-sm font-medium text-ink">
          {confirmed
            ? `${pt("Received")} ${stamp(po.confirmedAt)}${po.confirmedBy ? ` · ${po.confirmedBy}` : ""}`
            : pt("Orders placed with Buy now. Confirm each one once Sales has received it.")}
        </p>
        {confirmed ? null : (
          <button
            type="button"
            disabled={busy}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            onClick={onConfirm}
          >
            {busy ? pt("Confirming…") : pt("Confirm PO received")}
          </button>
        )}
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_26rem]">
        <section className="rounded-xl border border-line bg-white p-4">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-mute">{pt("Buyer products")}</h2>
          <ul className="mt-3 space-y-2">
            {(po.lines || []).map((line, index) => {
              const product = getProduct(line.productId);
              const image = product?.image || "";
              return (
                <li key={`${po.id}-${line.productId || index}`} className="flex min-w-0 items-start gap-2.5 rounded-lg border border-line/80 bg-paper/40 p-2.5">
                  {image ? <img src={image} alt="" className="h-14 w-14 shrink-0 border border-line bg-white object-cover" /> : null}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-ink">{line.name || line.sku || pt("Product")}</p>
                    <p className="text-[11px] text-mute">{line.sku || line.productId || "—"}</p>
                    <p className="mt-1 text-[11px] text-ink">
                      <span className="font-semibold uppercase tracking-wide text-mute">{pt("Qty")}</span> {line.qty} {line.unit}
                      <span className="ml-2 text-mute">{money(line.unitPrice)} = <span className="font-semibold text-ink">{money(line.lineTotal)}</span></span>
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
          <p className="mt-3 text-sm font-semibold text-ink">{pt("Total")} {money(po.total)}</p>
        </section>
        <aside className="space-y-3">
          <PoBuyerCard po={po} pt={pt} />
          <section className="rounded-xl border border-line bg-white p-4">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-mute">{pt("Activity")}</h2>
            <ul className="mt-2 space-y-1 text-sm text-ink">
              <li>{pt("Placed")} {stamp(po.createdAt)}</li>
              {confirmed ? <li>{pt("Received")} {stamp(po.confirmedAt)}{po.confirmedBy ? ` · ${po.confirmedBy}` : ""}</li> : null}
            </ul>
          </section>
          <section className="rounded-xl border border-line bg-white p-4">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-mute">{pt("PDF")}</h2>
            <p className="mt-1 text-xs text-mute">{pt("Preview this purchase order, then download.")}</p>
            <div className="mt-3">
              <button
                type="button"
                className="min-w-0 break-all text-left text-sm font-semibold text-brand-800 underline underline-offset-2 disabled:opacity-60"
                disabled={pdfBusy}
                onClick={onPreviewPdf}
              >
                {pdfBusy ? pt("Preparing PDF…") : quotePdfFilename("buy", po.id)}
              </button>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}

function PoOrderFacts({ po, pt }) {
  const files = (Array.isArray(po.guestAttachments) ? po.guestAttachments : []).filter((file) => file?.name);
  const rows = [
    [pt("Company"), po.companyName],
    [pt("Address"), po.delivery?.address],
    [pt("Project"), po.project],
    [pt("Delivery date"), po.delivery?.date],
    [pt("Attachment"), files.length ? <GuestFilePreview files={files} /> : ""],
  ].filter(([, value]) => {
    if (value == null || value === false) return false;
    if (typeof value === "string" || typeof value === "number") return String(value).trim();
    return true;
  });
  if (!rows.length) return null;
  return (
    <dl className="mt-2 space-y-1 text-[11px]">
      {rows.map(([label, value]) => (
        <div key={label}>
          <dt className="font-semibold uppercase tracking-wide text-mute">{label}</dt>
          <dd className="text-ink">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * Purchase orders placed with "Buy now". Display only: the server owns status and numbers.
 * The list comes from the Portal (`po`), which keeps it fresh on every page for the sidebar badge.
 */
export default function PoPanel({ note, po: source, guestAssign, focusId = "" }) {
  const { lang } = useLanguage();
  const pt = (value) => adminText(lang, value);
  const [, setSearchParams] = useSearchParams();
  const { records, state, updatedAt, refresh, replace } = source;
  const [filter, setFilter] = useState(focusId ? "all" : "created");
  const [view, setView] = useState("list");
  const [query, setQuery] = useState("");
  const [busyId, setBusyId] = useState("");
  const [pdfId, setPdfId] = useState("");
  const [pdfPreview, setPdfPreview] = useState(null);

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

  useEffect(() => {
    if (focusId) setFilter("all");
  }, [focusId]);

  useEffect(() => {
    if (!pdfPreview?.url) return undefined;
    return () => URL.revokeObjectURL(pdfPreview.url);
  }, [pdfPreview]);

  useEffect(() => {
    if (!focusId) return undefined;
    const node = document.getElementById(`admin-po-${focusId}`);
    if (node) node.scrollIntoView({ block: "center" });
    return undefined;
  }, [focusId, view, shown]);

  async function downloadPdf(po) {
    if (pdfId) return;
    setPdfId(po.id);
    try {
      const pdf = await buildQuotePdf({
        kind: "buy",
        refNo: po.id,
        buyer: {
          email: po.buyerEmail,
          name: po.buyerName,
          phone: po.buyerPhone,
          company: po.companyName,
          address: po.delivery?.address,
          project: po.project,
          deliveryDate: po.delivery?.date,
          attachments: po.guestAttachments,
        },
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
      const file = pdf.file || new File([pdf.blob], pdf.filename, { type: "application/pdf" });
      setPdfPreview((current) => {
        if (current?.url) URL.revokeObjectURL(current.url);
        return { url: URL.createObjectURL(file), filename: file.name };
      });
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
        {busy ? pt("Preparing PDF…") : pt("Preview PDF")}
      </button>
    );
  }

  function openDetail(id) {
    const next = String(id || "").trim();
    if (!next) return;
    setSearchParams({ po: next });
  }

  function closeDetail() {
    setSearchParams({});
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

  const detail = focusId ? records.find((row) => row.id === focusId) : null;
  if (focusId && detail) {
    return (
      <div>
        <PoDetail
          po={detail}
          note={note}
          busy={busyId === detail.id}
          pdfBusy={pdfId === detail.id}
          onBack={closeDetail}
          onConfirm={() => confirm(detail)}
          onPreviewPdf={() => downloadPdf(detail)}
          onRecord={replace}
        />
        {pdfPreview ? (
          <FilePreviewOverlay
            src={pdfPreview.url}
            name={pdfPreview.filename}
            file={{ url: pdfPreview.url, name: pdfPreview.filename, type: "application/pdf" }}
            onClose={() => setPdfPreview(null)}
          />
        ) : null}
      </div>
    );
  }
  if (focusId && state === "loading") {
    return <p className="text-sm text-mute">{pt("Loading…")} {focusId}</p>;
  }
  if (focusId && state !== "loading") {
    return (
      <div>
        <button type="button" className="text-sm font-semibold text-brand-800 hover:underline" onClick={closeDetail}>
          ← {pt("Purchase orders")}
        </button>
        <p className="mt-4 text-sm text-mute">{pt("This purchase order is not in the list yet.")}</p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl text-brand-900">{pt("Purchase orders")}</h1>
          <p className="text-sm text-mute">{pt("Orders placed with Buy now. Confirm each one once Sales has received it.")}</p>
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

      <AdminSearchBar value={query} onChange={setQuery} label={pt("Search")} placeholder={pt("Search PO no., buyer, product…")} />
      <FilterTabs tabs={FILTERS} counts={counts} value={filter} onChange={setFilter} label={pt("Purchase order status")} />

      {state === "error" ? (
        <p className="mt-4 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {pt("Could not reach the server. Showing the last list and retrying.")}
        </p>
      ) : null}

      {state === "loading" ? <p className="mt-6 text-sm text-mute">{pt("Loading…")}</p> : null}
      {state !== "loading" && !shown.length ? <p className="mt-6 text-sm text-mute">{pt("No purchase orders here.")}</p> : null}

      {view === "list" && shown.length ? (
        <div className="overflow-auto rounded-xl border border-line bg-white max-h-[calc(100vh-16rem)]">
          <table className="min-w-[64rem] w-full text-left text-[12px]">
            <thead className="pointer-events-none sticky top-0 z-10 bg-brand-50 text-[10px] font-semibold uppercase tracking-wide text-mute">
              <tr>
                {[pt("PO"), pt("Buyer"), pt("Products"), pt("Total"), pt("Status"), pt("Activity"), pt("Action")].map((h) => (
                  <th key={h} className={`${h === pt("Action") ? STICKY_ACTION_TH : "px-3 py-2"} whitespace-nowrap`}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map((row) => {
                const confirmed = row.status === "confirmed";
                const noContact = row.buyerKind === "guest" && !row.buyerEmail && !row.buyerPhone;
                const focused = row.id === focusId;
                const phoneText = formatBuyerPhoneDisplay(row.buyerPhone) || row.buyerPhone;
                return (
                  <tr id={`admin-po-${row.id}`} key={row.id} className={`border-t border-line/80 align-top ${focused ? "bg-brand-50" : ""}`}>
                    <td className="whitespace-nowrap px-3 py-2 text-left font-semibold">
                      <button type="button" className="text-left hover:underline" onClick={() => openDetail(row.id)}>
                        {row.id}
                      </button>
                    </td>
                    <td className="min-w-[12rem] px-3 py-2">
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${row.buyerKind === "member" ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-700"}`}>
                            {row.buyerKind === "member" ? pt("Member") : pt("Guest")}
                          </span>
                          <span>
                            {row.buyerName ? <span className="font-medium">{row.buyerName}</span> : null}
                            {row.buyerName && row.buyerEmail ? <span className="text-mute"> · </span> : null}
                            {row.buyerEmail ? <span className={row.buyerName ? "text-mute" : "font-medium"}>{row.buyerEmail}</span> : null}
                            {noContact ? <span className="text-mute">{pt("No contact details")}</span> : null}
                          </span>
                        </div>
                        {phoneText ? <p className="whitespace-nowrap text-mute">{phoneText}</p> : null}
                      </div>
                    </td>
                    <td className="min-w-[16rem] px-3 py-2">
                      <ul className="space-y-2">
                        {(row.lines || []).map((line, index) => {
                          const product = getProduct(line.productId);
                          const image = product?.image || line.image || "";
                          return (
                            <li key={`${row.id}-${line.productId || index}`} className="overflow-hidden rounded-lg border border-line/80 bg-paper/40 p-2">
                              <div className="flex min-w-0 items-start gap-2.5">
                                {image ? (
                                  <img src={image} alt="" className="h-11 w-11 shrink-0 rounded-md border border-line bg-white object-cover" />
                                ) : (
                                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-dashed border-line bg-paper text-[9px] font-semibold uppercase tracking-wide text-mute">Gen</span>
                                )}
                                <div className="min-w-0 flex-1 overflow-hidden">
                                  <p className="text-sm font-medium text-ink">{line.name || line.sku || pt("Product")}</p>
                                  <p className="text-[11px] text-mute">{line.sku || line.productId || "—"}</p>
                                  <p className="mt-1 text-[11px] text-ink">
                                    <span className="font-semibold uppercase tracking-wide text-mute">{pt("Qty")}</span> {line.qty}{line.unit ? ` ${line.unit}` : ""}
                                  </p>
                                </div>
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 font-semibold text-ink">{money(row.total)}</td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                          confirmed ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
                        }`}
                      >
                        {confirmed ? pt("Received") : pt("To confirm")}
                      </span>
                    </td>
                    <td className="min-w-[9rem] px-3 py-2 text-mute">
                      <div className="whitespace-nowrap">
                        <div>{stamp(row.createdAt) || "—"}</div>
                        {confirmed ? (
                          <div className="mt-0.5 text-[10px] font-medium leading-snug text-ink">
                            {pt("Received")} · {stamp(row.confirmedAt)}
                          </div>
                        ) : null}
                      </div>
                      <MailStatus id={row.id} mail={row.mail || []} onRecord={replace} note={note} className="mt-2 !px-2 !py-1.5 !text-[11px]" />
                    </td>
                    <td className={`${STICKY_ACTION_TD} min-w-[11rem] ${focused ? "!bg-brand-50" : ""}`}>
                      <div className="flex flex-wrap justify-end gap-2">
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
          const focused = po.id === focusId;
          return (
            <li id={`admin-po-${po.id}`} key={po.id} className={`rounded-xl border bg-white p-4 ${focused ? "border-brand-600 ring-2 ring-brand-200" : "border-line"}`}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <button type="button" className="text-base font-bold text-ink hover:underline" onClick={() => openDetail(po.id)}>{po.id}</button>
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
              <PoOrderFacts po={po} pt={pt} />

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
      {pdfPreview ? (
        <FilePreviewOverlay
          src={pdfPreview.url}
          name={pdfPreview.filename}
          file={{ url: pdfPreview.url, name: pdfPreview.filename, type: "application/pdf" }}
          onClose={() => setPdfPreview(null)}
        />
      ) : null}
    </div>
  );
}
