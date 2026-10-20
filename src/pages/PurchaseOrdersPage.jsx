import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import SiteHeader from "../components/SiteHeader";
import Seo from "../components/Seo";
import { useStore } from "../hooks/useStore";
import { usePurchaseOrders } from "../hooks/usePurchaseOrders";
import { useLanguage } from "../i18n";
import { withLocale } from "../lib/locale";
import { displayUnit } from "../lib/productFields";

const COPY = {
  zh: {
    title: "我的採購單",
    seoDesc: "查看你透過「立即購買」落的採購單。",
    loginTitle: "請先登入",
    loginHint: "登入後可以查看你的採購單。",
    login: "登入",
    created: "已送出，等待確認",
    confirmed: "Sales 已確認收到",
    all: "全部",
    waiting: "待確認",
    done: "已確認",
    search: "搜尋 PO 編號或產品…",
    switch: "切換採購單",
    total: "合計",
    placed: "落單時間",
    receivedAt: "確認時間",
    qty: "數量",
    unitPrice: "單價",
    lineTotal: "小計",
    product: "產品",
    fromRfq: "對應的 RFQ",
    retry: "未能更新採購單，稍後會自動重試。",
    loading: "載入中…",
    none: "沒有符合的採購單。",
    emptyTitle: "還沒有採購單",
    emptyHint: "在有標價的產品按「立即購買」，採購單會出現在這裡。",
    browse: "逛產品",
    pick: "請在左邊選一張採購單。",
    back: "← 我的 RFQ",
  },
  en: {
    title: "My purchase orders",
    seoDesc: "View the purchase orders you placed with Buy now.",
    loginTitle: "Please sign in",
    loginHint: "Sign in to see your purchase orders.",
    login: "Log in",
    created: "Placed, waiting for confirmation",
    confirmed: "Confirmed received by Sales",
    all: "All",
    waiting: "To confirm",
    done: "Confirmed",
    search: "Search PO no. or product…",
    switch: "Switch purchase order",
    total: "Total",
    placed: "Placed",
    receivedAt: "Confirmed",
    qty: "Qty",
    unitPrice: "Unit price",
    lineTotal: "Subtotal",
    product: "Product",
    fromRfq: "Source RFQ",
    retry: "Could not refresh purchase orders. Retrying shortly.",
    loading: "Loading…",
    none: "No purchase orders match.",
    emptyTitle: "No purchase orders yet",
    emptyHint: "Press Buy now on a priced product and your purchase order will show up here.",
    browse: "Browse products",
    pick: "Pick a purchase order on the left.",
    back: "← My RFQs",
  },
};

function money(value) {
  return `HKD ${Number(value || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function stamp(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function lineSummary(po) {
  const lines = po?.lines || [];
  const first = lines[0]?.name;
  if (!first) return "";
  return lines.length > 1 ? `${first} +${lines.length - 1}` : first;
}

function StatusChip({ po, copy }) {
  const done = po.status === "confirmed";
  return (
    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${done ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>
      {done ? copy.confirmed : copy.created}
    </span>
  );
}

/** Buyer's purchase orders from the server. Display only: status and numbers are decided there. */
export default function PurchaseOrdersPage() {
  const { lang } = useLanguage();
  const copy = COPY[lang === "zh" ? "zh" : "en"];
  const { user } = useStore();
  const signedIn = Boolean(user?.email);
  const { records, state } = usePurchaseOrders(signedIn);
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [pickedId, setPickedId] = useState("");
  const [listOpen, setListOpen] = useState(false);
  const listRef = useRef(null);

  useEffect(() => {
    if (!listOpen) return undefined;
    function onPointer(event) {
      if (listRef.current && !listRef.current.contains(event.target)) setListOpen(false);
    }
    function onKey(event) {
      if (event.key === "Escape") setListOpen(false);
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [listOpen]);

  const counts = useMemo(
    () => ({
      all: records.length,
      waiting: records.filter((po) => po.status !== "confirmed").length,
      done: records.filter((po) => po.status === "confirmed").length,
    }),
    [records]
  );

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return records.filter((po) => {
      if (filter === "waiting" && po.status === "confirmed") return false;
      if (filter === "done" && po.status !== "confirmed") return false;
      if (!q) return true;
      return [po.id, ...(po.lines || []).flatMap((l) => [l.sku, l.name])].join(" ").toLowerCase().includes(q);
    });
  }, [records, filter, query]);

  const selected = records.find((po) => po.id === pickedId) || shown[0] || null;

  return (
    <div className="bg-paper min-h-screen">
      <Seo lang={lang} path={withLocale(lang, "/pos")} title={`${copy.title} | Mattex Marketplace`} description={copy.seoDesc} noindex />
      <SiteHeader fluid />
      <main className="w-full max-w-none mx-auto px-4 sm:px-6 lg:px-8 py-5 sm:py-6">
        <div className="mb-3">
          <h1 className="text-2xl font-bold text-brand-800">{copy.title}</h1>
        </div>
        <p className="mb-3 text-sm">
          <Link to={withLocale(lang, "/rfqs")} className="font-semibold text-brand-700 hover:underline">
            {copy.back}
          </Link>
        </p>

        {!signedIn ? (
          <div className="bg-white border border-line rounded-xl p-6">
            <h2 className="text-lg font-bold text-brand-800">{copy.loginTitle}</h2>
            <p className="mt-2 text-sm text-mute">{copy.loginHint}</p>
            <Link to={withLocale(lang, "/login")} className="btn-primary mt-5 inline-flex">
              {copy.login}
            </Link>
          </div>
        ) : !records.length && state !== "loading" && state !== "error" ? (
          <section className="bg-white border border-line rounded-xl px-6 py-16 sm:py-20 text-center">
            <h2 className="text-lg font-semibold text-brand-800">{copy.emptyTitle}</h2>
            <p className="mt-2 text-sm text-mute">{copy.emptyHint}</p>
            <Link to={withLocale(lang, "/")} className="btn-primary mt-5 inline-flex">
              {copy.browse}
            </Link>
          </section>
        ) : (
          <div className="lg:grid lg:grid-cols-[20rem_minmax(0,1fr)] lg:items-start lg:gap-5">
            <div ref={listRef} className="relative mb-3 lg:sticky lg:top-28 lg:mb-0 lg:max-h-[calc(100vh-8rem)] lg:overflow-auto">
              {selected ? (
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-3 rounded-none border border-line bg-white px-3 py-2.5 text-left lg:hidden"
                  aria-expanded={listOpen}
                  onClick={() => setListOpen((open) => !open)}
                >
                  <span className="min-w-0">
                    <span className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-brand-800">{selected.id}</span>
                      <span className="text-[10px] font-bold uppercase tracking-wide text-brand-600">
                        {selected.status === "confirmed" ? copy.done : copy.waiting}
                      </span>
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-mute">{lineSummary(selected)}</span>
                  </span>
                  <span className="shrink-0 text-sm font-semibold tabular-nums text-ink">{money(selected.total)}</span>
                  <span className="shrink-0 text-[10px] text-mute" aria-hidden="true">{listOpen ? "▴" : "▾"}</span>
                </button>
              ) : null}
              <div className={`${listOpen || !selected ? "mt-2 block" : "hidden"} lg:mt-0 lg:block`}>
                <div className="rounded-xl border border-line bg-white px-3 py-2.5">
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-mute">
                    {copy.switch} · {records.length}
                  </p>
                  <input
                    type="search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={copy.search}
                    aria-label={copy.search}
                    className="mt-2 w-full border border-line bg-paper/60 px-3 py-1.5 text-sm text-ink"
                  />
                  <div className="mt-2 flex flex-wrap gap-1.5" role="tablist" aria-label={copy.title}>
                    {[
                      ["all", copy.all],
                      ["waiting", copy.waiting],
                      ["done", copy.done],
                    ].map(([id, label]) => (
                      <button
                        key={id}
                        type="button"
                        role="tab"
                        aria-selected={filter === id}
                        onClick={() => setFilter(id)}
                        className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${
                          filter === id ? "border-brand-600 bg-brand-50 text-brand-800" : "border-line bg-white text-mute hover:border-brand-300"
                        }`}
                      >
                        {label} {counts[id]}
                      </button>
                    ))}
                  </div>
                  {state === "error" ? <p className="mt-2 text-xs text-mute">{copy.retry}</p> : null}
                  {state === "loading" ? <p className="mt-3 text-sm text-mute">{copy.loading}</p> : null}
                  <div role="listbox" className="mt-2 max-h-64 divide-y divide-line overflow-auto border-t border-line lg:max-h-[calc(100vh-18rem)]">
                    {shown.map((po) => {
                      const active = selected?.id === po.id;
                      return (
                        <button
                          key={po.id}
                          type="button"
                          role="option"
                          aria-selected={active}
                          onClick={() => {
                            setPickedId(po.id);
                            setListOpen(false);
                          }}
                          className={`flex w-full items-start justify-between gap-3 px-2 py-2 text-left ${active ? "bg-brand-50" : "hover:bg-paper"}`}
                        >
                          <span className="min-w-0">
                            <span className="flex items-center gap-2">
                              <span className="text-sm font-semibold text-brand-800">{po.id}</span>
                              <span className="text-[10px] font-bold uppercase tracking-wide text-brand-600">
                                {po.status === "confirmed" ? copy.done : copy.waiting}
                              </span>
                            </span>
                            <span className="mt-0.5 block truncate text-xs text-mute">{lineSummary(po)}</span>
                            <span className="mt-0.5 block truncate text-[11px] text-mute">{stamp(po.createdAt)}</span>
                          </span>
                          <span className="shrink-0 text-sm font-semibold tabular-nums text-ink">{money(po.total)}</span>
                        </button>
                      );
                    })}
                    {state !== "loading" && !shown.length ? <p className="px-2 py-4 text-sm text-mute">{copy.none}</p> : null}
                  </div>
                </div>
              </div>
            </div>

            <section className="rounded-xl border border-line bg-white p-4 sm:p-5">
              {selected ? (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="text-lg font-bold text-brand-800">{selected.id}</h2>
                    <StatusChip po={selected} copy={copy} />
                  </div>
                  <p className="mt-1 text-xs text-mute">
                    {copy.placed} {stamp(selected.createdAt)}
                    {selected.status === "confirmed" && selected.confirmedAt ? ` · ${copy.receivedAt} ${stamp(selected.confirmedAt)}` : ""}
                  </p>
                  {selected.rfqId ? (
                    <p className="mt-1 text-xs">
                      {copy.fromRfq}:{" "}
                      <Link to={`${withLocale(lang, "/rfqs")}?rfq=${encodeURIComponent(selected.rfqId)}`} className="font-semibold text-brand-700 hover:underline">
                        {selected.rfqId}
                      </Link>
                    </p>
                  ) : null}
                  <div className="mt-4 overflow-x-auto">
                    <table className="w-full min-w-[28rem] text-left text-sm">
                      <thead className="text-[11px] uppercase tracking-wide text-mute">
                        <tr>
                          <th className="py-2 pr-3">{copy.product}</th>
                          <th className="py-2 pr-3 text-right">{copy.qty}</th>
                          <th className="py-2 pr-3 text-right">{copy.unitPrice}</th>
                          <th className="py-2 text-right">{copy.lineTotal}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(selected.lines || []).map((line) => (
                          <tr key={`${selected.id}-${line.productId}`} className="border-t border-line align-top">
                            <td className="py-2 pr-3">
                              <span className="font-medium text-ink">{line.name}</span>
                              <span className="block text-xs text-mute">{line.sku}</span>
                            </td>
                            <td className="py-2 pr-3 text-right tabular-nums">{line.qty} {displayUnit(line.unit, lang)}</td>
                            <td className="py-2 pr-3 text-right tabular-nums">{money(line.unitPrice)}</td>
                            <td className="py-2 text-right font-semibold tabular-nums">{money(line.lineTotal)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="mt-3 border-t border-line pt-3 text-right text-base font-bold text-ink">
                    {copy.total} {money(selected.total)}
                  </p>
                </>
              ) : (
                <p className="text-sm text-mute">{copy.pick}</p>
              )}
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
