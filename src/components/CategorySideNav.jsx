import { Fragment, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import CopyLinkButton from "./CopyLinkButton";
import TileBrowse from "./TileBrowse";
import { useLanguage } from "../i18n";
import { allProductsTo, withLocale } from "../lib/locale";
import { getCategoryDefs } from "../lib/store";
import MobileCategoryTabs from "./MobileCategories";

function OpenIcon({ className = "h-3.5 w-3.5" }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden>
      <path d="M7 17 17 7" />
      <path d="M10 7h7v7" />
    </svg>
  );
}

const iconBtnClass =
  "inline-flex h-7 w-7 shrink-0 items-center justify-center self-center text-mute hover:text-brand-700 hover:bg-white/70";

function Chevron({ open }) {
  return (
    <svg viewBox="0 0 24 24" className={`h-3.5 w-3.5 transition ${open ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden>
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function useDesktopList() {
  const [desktop, setDesktop] = useState(() => typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches);
  useEffect(() => {
    const media = window.matchMedia("(min-width: 1024px)");
    const apply = () => setDesktop(media.matches);
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, []);
  return desktop;
}

export default function CategorySideNav({
  activeSlug = "",
  offsetTop = 88,
  filterMode = false,
  onSelectAll,
  onSelectCategory,
  contained = false,
  tilePanel = null,
  tileExpanded = false,
  onToggleTile,
}) {
  const { t, lang } = useLanguage();
  const desktopList = useDesktopList();
  const categories = getCategoryDefs();
  const [openIds, setOpenIds] = useState(() => new Set());
  const listRef = useRef(null);
  const skipAutoOpen = useRef(new Set());
  useEffect(() => {
    if (!activeSlug) return;
    const parent = getCategoryDefs().find((category) => category.id === activeSlug || (category.children || []).some((child) => child.id === activeSlug));
    if (!parent?.children?.length) return;
    const key = `${activeSlug}:${parent.id}`;
    if (skipAutoOpen.current.has(key)) return;
    setOpenIds((prev) => (prev.has(parent.id) ? prev : new Set(prev).add(parent.id)));
  }, [activeSlug]);
  useEffect(() => {
    const list = listRef.current;
    if (!list || !activeSlug) return;
    const row = list.querySelector(`[data-category="${CSS.escape(activeSlug)}"]`);
    if (!row) return;
    const listRect = list.getBoundingClientRect();
    const rowRect = row.getBoundingClientRect();
    if (rowRect.top < listRect.top) list.scrollTop -= listRect.top - rowRect.top;
    else if (rowRect.bottom > listRect.bottom) list.scrollTop += rowRect.bottom - listRect.bottom;
  }, [activeSlug, openIds]);
  const allActive = !activeSlug;

  function toggleParent(categoryId) {
    const parentKey = activeSlug ? `${activeSlug}:${categoryId}` : "";
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(categoryId)) {
        next.delete(categoryId);
        if (parentKey) skipAutoOpen.current.add(parentKey);
      } else {
        next.add(categoryId);
        if (parentKey) skipAutoOpen.current.delete(parentKey);
      }
      return next;
    });
  }

  function onParentName(category) {
    if (activeSlug === category.id) {
      toggleParent(category.id);
      return;
    }
    const key = activeSlug ? `${activeSlug}:${category.id}` : "";
    if (key) skipAutoOpen.current.delete(key);
    setOpenIds((prev) => (prev.has(category.id) ? prev : new Set(prev).add(category.id)));
    if (filterMode && onSelectCategory) onSelectCategory(category);
  }
  const maxHeight = `calc(100dvh - ${offsetTop}px - 12px)`;
  const allProductsPath = withLocale(lang, "/");
  const allProductsHref = allProductsTo(lang);

  const allProductsClass = `flex min-w-0 flex-1 items-center px-3 py-2.5 text-sm font-medium ${
    allActive ? "text-brand-800" : "text-ink"
  }`;

  return (
    <>
    <MobileCategoryTabs
      categories={categories}
      activeSlug={activeSlug}
      filterMode={filterMode}
      onSelectAll={onSelectAll}
      onSelectCategory={onSelectCategory}
    />
    {tilePanel && !desktopList ? (
      <div className="mt-2 lg:hidden">
        <button
          type="button"
          className="flex w-full items-center justify-between border border-line bg-white px-3 py-2 text-sm font-medium text-ink"
          aria-expanded={tileExpanded}
          onClick={onToggleTile}
        >
          <span>{lang === "en" ? "Tile types" : "細分類"}</span>
          <Chevron open={tileExpanded} />
        </button>
        {tileExpanded ? (
          <TileBrowse nested lang={lang} state={tilePanel.state} entries={tilePanel.entries} onChange={tilePanel.onChange} />
        ) : null}
      </div>
    ) : null}
    <nav
      data-tour="categories"
      aria-label={t("categories")}
      className={contained
        ? "hidden min-h-0 w-full min-w-0 max-w-full flex-col overflow-hidden lg:flex lg:h-[var(--cat-nav-max)] lg:max-h-[var(--cat-nav-max)]"
        : "hidden w-full min-w-0 max-w-full flex-col overflow-hidden lg:sticky lg:flex lg:max-h-[var(--cat-nav-max)]"}
      style={contained ? { "--cat-nav-max": maxHeight } : { top: offsetTop, "--cat-nav-max": maxHeight }}
    >
      <p className="mb-2 flex shrink-0 items-baseline gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-mute">
        <span>{t("categories")}</span>
        <span className="tabular-nums">{categories.length}</span>
      </p>
      <ul ref={listRef} className="min-h-0 w-full min-w-0 flex-1 overflow-y-auto overscroll-contain border border-line bg-white divide-y divide-line">
        <li className={`flex items-stretch ${allActive ? "bg-brand-50" : "hover:bg-paper"}`}>
          {allActive ? (
            <span aria-current="page" className={allProductsClass}>
              <span className="min-w-0 leading-snug">{t("allProductsTitle")}</span>
            </span>
          ) : filterMode && onSelectAll ? (
            <button type="button" onClick={onSelectAll} className={`${allProductsClass} text-left`}>
              <span className="min-w-0 leading-snug">{t("allProductsTitle")}</span>
            </button>
          ) : (
            <Link to={allProductsHref} className={allProductsClass}>
              <span className="min-w-0 leading-snug">{t("allProductsTitle")}</span>
            </Link>
          )}
          <Link
            to={allProductsHref}
            title={t("openAllProductsPage")}
            aria-label={t("openAllProductsPage")}
            className={iconBtnClass}
          >
            <OpenIcon />
          </Link>
          <CopyLinkButton path={allProductsPath} hash="products" variant="icon" className="self-center mr-1" />
        </li>
        {categories.map((category) => {
          const path = withLocale(lang, `/catalog/${category.id}`);
          const active = activeSlug === category.id;
          const nameClass = `min-w-0 flex-1 px-3 py-2.5 text-sm leading-snug text-left ${
            active ? "font-semibold text-brand-800" : "text-ink"
          }`;
          const tileRow = category.id === "tiles" && tilePanel;
          const children = category.children || [];
          const open = openIds.has(category.id);
          return (
            <Fragment key={category.id}>
            <li data-category={category.id} className={tileRow ? (active ? "bg-brand-50" : "") : `flex items-stretch ${active ? "bg-brand-50" : "hover:bg-paper"}`}>
              <div className={tileRow ? `flex items-stretch ${active ? "" : "hover:bg-paper"}` : "contents"}>
              {children.length ? (
                <button
                  type="button"
                  className={iconBtnClass}
                  aria-expanded={open}
                  aria-label={lang === "en" ? (open ? "Collapse sub-categories" : "Expand sub-categories") : (open ? "收合子分類" : "展開子分類")}
                  onClick={() => toggleParent(category.id)}
                >
                  <Chevron open={open} />
                </button>
              ) : <span className="w-7 shrink-0" aria-hidden />}
              {children.length ? (
                <button type="button" onClick={() => onParentName(category)} className={nameClass} aria-current={active ? "page" : undefined}>
                  <span className="block break-words">{category.name}</span>
                  <span className="block text-[11px] font-medium text-mute mt-0.5">{category.count}</span>
                </button>
              ) : filterMode && onSelectCategory ? (
                <button type="button" onClick={() => onSelectCategory(category)} className={nameClass} aria-current={active ? "page" : undefined}>
                  <span className="block break-words">{category.name}</span>
                  <span className="block text-[11px] font-medium text-mute mt-0.5">{category.count}</span>
                </button>
              ) : active ? (
                <span aria-current="page" className={nameClass}>
                  <span className="block break-words">{category.name}</span>
                  <span className="block text-[11px] font-medium text-mute mt-0.5">{category.count}</span>
                </span>
              ) : (
                <Link to={path} className={nameClass}>
                    <span className="block break-words">{category.name}</span>
                    <span className="block text-[11px] font-medium text-mute mt-0.5">{category.count}</span>
                  </Link>
              )}
              {tileRow && desktopList ? (
                <button
                  type="button"
                  className={iconBtnClass}
                  aria-expanded={tileExpanded}
                  aria-label={lang === "en" ? (tileExpanded ? "Collapse tile types" : "Expand tile types") : (tileExpanded ? "收合細分類" : "展開細分類")}
                  onClick={onToggleTile}
                >
                  <Chevron open={tileExpanded} />
                </button>
              ) : null}
              <Link
                to={path}
                title={t("openCategoryPage")}
                aria-label={t("openCategoryPage")}
                className={iconBtnClass}
              >
                <OpenIcon />
              </Link>
              <CopyLinkButton path={path} variant="icon" className="self-center mr-1" />
              </div>
            </li>
            {open ? children.map((child) => {
              const childPath = withLocale(lang, `/catalog/${child.id}`);
              const childActive = activeSlug === child.id;
              const childClass = `min-w-0 flex-1 py-2 pr-3 pl-2 text-[13px] leading-snug text-left ${childActive ? "font-semibold text-brand-800" : "text-ink"}`;
              return (
                <li key={child.id} data-category={child.id} className={`flex items-stretch ${childActive ? "bg-brand-50" : "hover:bg-paper"}`}>
                  <span className="w-7 shrink-0" aria-hidden />
                  {filterMode && onSelectCategory ? (
                    childActive ? (
                      <span aria-current="page" className={childClass}><span className="block break-words">{child.name}</span></span>
                    ) : (
                      <button type="button" onClick={() => onSelectCategory(child)} className={childClass}><span className="block break-words">{child.name}</span></button>
                    )
                  ) : childActive ? (
                    <span aria-current="page" className={childClass}><span className="block break-words">{child.name}</span></span>
                  ) : (
                    <Link to={childPath} className={childClass}><span className="block break-words">{child.name}</span></Link>
                  )}
                  <Link
                    to={childPath}
                    title={t("openCategoryPage")}
                    aria-label={t("openCategoryPage")}
                    className={iconBtnClass}
                  >
                    <OpenIcon />
                  </Link>
                  <CopyLinkButton path={childPath} variant="icon" className="self-center mr-1" />
                </li>
              );
            }) : null}
            {tileRow && desktopList && tileExpanded ? (
              <li className="border-t border-line bg-paper">
                <TileBrowse nested lang={lang} state={tilePanel.state} entries={tilePanel.entries} onChange={tilePanel.onChange} />
              </li>
            ) : null}
            </Fragment>
          );
        })}
      </ul>
    </nav>
    </>
  );
}
