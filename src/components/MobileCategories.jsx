import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { useLanguage } from "../i18n";
import { allProductsTo, withLocale } from "../lib/locale";

const COPY = {
  zh: { all: "全部分類", search: "搜尋分類…", none: "沒有符合的分類", close: "關閉", items: "件" },
  en: { all: "All categories", search: "Search categories…", none: "No matching category", close: "Close", items: "items" },
};

/** Bottom sheet with every category and a search box. Phones only; the caller decides what a pick does. */
export function CategorySheet({ open, onClose, categories, activeSlug = "", onPick, renderLink }) {
  const { lang, t } = useLanguage();
  const copy = COPY[lang === "zh" ? "zh" : "en"];
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!open) return undefined;
    setQuery("");
    const onKey = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? categories.filter((c) => c.name.toLowerCase().includes(q)) : categories;
  }, [categories, query]);

  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-[80] lg:hidden" role="dialog" aria-modal="true" aria-label={copy.all}>
      <button type="button" aria-label={copy.close} className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="absolute inset-x-0 bottom-0 flex max-h-[80dvh] flex-col rounded-t-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between gap-3 px-4 pt-3">
          <p className="text-base font-bold text-brand-800">{copy.all}</p>
          <button type="button" onClick={onClose} className="px-2 py-1 text-sm text-mute" aria-label={copy.close}>
            ✕
          </button>
        </div>
        <div className="px-4 pb-2 pt-2">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={copy.search}
            aria-label={copy.search}
            className="w-full rounded-lg border border-line px-3 py-2 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/20"
          />
        </div>
        <ul className="min-h-0 flex-1 divide-y divide-line overflow-y-auto overscroll-contain border-t border-line">
          {shown.map((c) => {
            const active = activeSlug === c.id;
            const cls = `flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm ${active ? "bg-brand-50 font-semibold text-brand-800" : "text-ink"}`;
            const body = (
              <>
                <span className="min-w-0 break-words">{c.name}</span>
                <span className="shrink-0 text-xs text-mute">{c.count} {copy.items}</span>
              </>
            );
            return (
              <li key={c.id}>
                {renderLink ? (
                  renderLink(c, cls, body)
                ) : (
                  <button type="button" className={cls} onClick={() => onPick(c)} aria-current={active ? "page" : undefined}>
                    {body}
                  </button>
                )}
              </li>
            );
          })}
          {!shown.length ? <li className="px-4 py-6 text-sm text-mute">{copy.none}</li> : null}
        </ul>
        <span className="sr-only">{t("categories")}</span>
      </div>
    </div>,
    document.body
  );
}

/**
 * One scrolling row of category chips, in the shop category order. "All categories" stays pinned and opens the sheet.
 * In filter mode a tab filters the page in place; otherwise it opens that category page.
 */
export default function MobileCategoryTabs({ categories, activeSlug = "", filterMode = false, onSelectAll, onSelectCategory }) {
  const { lang, t } = useLanguage();
  const copy = COPY[lang === "zh" ? "zh" : "en"];
  const [sheet, setSheet] = useState(false);
  const allActive = !activeSlug;
  const ordered = categories;

  const chip = (active) =>
    `shrink-0 whitespace-nowrap rounded-none border px-3.5 py-1.5 text-left text-sm ${
      active ? "border-brand-600 bg-brand-600 font-semibold text-white" : "border-line bg-white text-ink"
    }`;

  function pickCategory(c) {
    setSheet(false);
    onSelectCategory?.(c);
  }

  return (
    <nav data-tour="categories" aria-label={t("categories")} className="min-w-0 max-w-full lg:hidden">
      <div className="flex min-w-0 items-center gap-2">
        <div className="flex min-w-0 flex-1 gap-2 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {filterMode && onSelectAll ? (
            <button type="button" className={chip(allActive)} aria-current={allActive ? "page" : undefined} onClick={onSelectAll}>
              {t("allProductsTitle")}
            </button>
          ) : (
            <Link to={allProductsTo(lang)} className={chip(allActive)} aria-current={allActive ? "page" : undefined}>
              {t("allProductsTitle")}
            </Link>
          )}
          {ordered.map((c) =>
            filterMode && onSelectCategory ? (
              <button key={c.id} type="button" className={chip(activeSlug === c.id)} aria-current={activeSlug === c.id ? "page" : undefined} onClick={() => onSelectCategory(c)}>
                {c.name}
              </button>
            ) : (
              <Link key={c.id} to={withLocale(lang, `/catalog/${c.id}`)} className={chip(activeSlug === c.id)} aria-current={activeSlug === c.id ? "page" : undefined}>
                {c.name}
              </Link>
            )
          )}
        </div>
        <button type="button" className={`${chip(false)} border-brand-600 font-semibold text-brand-700`} onClick={() => setSheet(true)} aria-haspopup="dialog">
          {copy.all} ▾
        </button>
      </div>
      <CategorySheet
        open={sheet}
        onClose={() => setSheet(false)}
        categories={categories}
        activeSlug={activeSlug}
        onPick={pickCategory}
        renderLink={
          filterMode && onSelectCategory
            ? undefined
            : (c, cls, body) => (
                <Link to={withLocale(lang, `/catalog/${c.id}`)} className={cls} onClick={() => setSheet(false)} aria-current={activeSlug === c.id ? "page" : undefined}>
                  {body}
                </Link>
              )
        }
      />
    </nav>
  );
}
