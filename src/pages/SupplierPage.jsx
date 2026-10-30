import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import ProductCard, { ProductListRow } from "../components/ProductCard";
import CatalogViewToggle from "../components/CatalogViewToggle";
import { ProductSearchBox } from "../components/SearchSuggestions";
import SupplierLogo from "../components/SupplierLogo";
import SiteFooter from "../components/SiteFooter";
import SiteHeader from "../components/SiteHeader";
import CartToast from "../components/CartToast";
import Seo, { breadcrumbJsonLd, orgJsonLd } from "../components/Seo";
import { useLanguage } from "../i18n";
import { catalogGroupIndex, collapseCatalog, useCatalogGroups } from "../lib/catalogGroups";
import { useStore } from "../hooks/useStore";
import { jumpToId } from "../lib/jumpTo";
import { categoriesInCatalog } from "../lib/searchOptions";
import { allProductsTo, siteOrigin, withLocale } from "../lib/locale";
import { seoCopy } from "../lib/seoCopy";
import { SHOW_RFQ } from "../lib/flags";
import {
  addFromStorefront,
  productShowsPrice,
  getProductsBySupplier,
  getSupplier,
  getTopProductsForSupplier,
  isHitProduct,
  searchSupplierProducts,
} from "../lib/store";

const CATALOG_VIEW_KEY = "subbie_catalog_view";

function readCatalogView() {
  try {
    return sessionStorage.getItem(CATALOG_VIEW_KEY) === "list" ? "list" : "card";
  } catch {
    return "card";
  }
}

export default function SupplierPage() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { catalogEpoch, catalogLoading } = useStore();
  const supplier = useMemo(() => getSupplier(slug), [slug, catalogEpoch]);
  const { t, lang } = useLanguage();
  const groupEpoch = useCatalogGroups();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [priceFilter, setPriceFilter] = useState("all");
  const [greenOnly, setGreenOnly] = useState(false);
  const [catalogView, setCatalogView] = useState(readCatalogView);
  const [toast, setToast] = useState(null);
  const [catalogShown, setCatalogShown] = useState(24);
  const catNavRef = useRef(null);
  const [navHeight, setNavHeight] = useState(64);
  const [catBarHeight, setCatBarHeight] = useState(0);
  const [wide, setWide] = useState(() => typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches);

  useEffect(() => {
    setSearchQuery("");
    setSelectedCategory("");
    setPriceFilter("all");
    setGreenOnly(false);
    setCatalogShown(24);
  }, [slug]);

  useEffect(() => {
    setCatalogShown(24);
  }, [searchQuery, selectedCategory, priceFilter, greenOnly]);

  const top = useMemo(
    () => collapseCatalog(supplier ? getTopProductsForSupplier(supplier.slug) : [], catalogGroupIndex()),
    [supplier, groupEpoch, catalogEpoch]
  );
  const catalog = useMemo(
    () => (supplier ? getProductsBySupplier(supplier.slug) : []),
    [supplier, catalogEpoch]
  );
  const categoryCounts = useMemo(() => {
    const map = new Map();
    catalog.forEach((p) => {
      if (!p.category) return;
      map.set(p.category, (map.get(p.category) || 0) + 1);
    });
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [catalog]);
  const browseCategories = useMemo(() => categoriesInCatalog(catalog), [catalog]);
  const searched = useMemo(
    () => (supplier ? searchSupplierProducts(supplier.slug, searchQuery) : []),
    [supplier, searchQuery]
  );
  const products = useMemo(() => {
    let list = selectedCategory
      ? searched.filter((p) => p.category === selectedCategory)
      : searched;
    if (greenOnly) list = list.filter((p) => p.green);
    if (priceFilter === "priced") list = list.filter((p) => productShowsPrice(p));
    if (priceFilter === "unpriced") list = list.filter((p) => !productShowsPrice(p));
    if (priceFilter === "hot") list = list.filter((p) => isHitProduct(p));
    return collapseCatalog(list, catalogGroupIndex());
  }, [searched, selectedCategory, greenOnly, priceFilter, groupEpoch]);
  const hasSupplierFilters =
    Boolean(searchQuery.trim()) || Boolean(selectedCategory) || priceFilter !== "all" || greenOnly;

  useEffect(() => {
    const read = () => {
      const nav = document.getElementById("siteNav");
      if (nav) setNavHeight(Math.round(nav.getBoundingClientRect().height));
      if (catNavRef.current) setCatBarHeight(Math.round(catNavRef.current.getBoundingClientRect().height));
      setWide(window.matchMedia("(min-width: 1024px)").matches);
    };
    read();
    window.addEventListener("resize", read);
    return () => window.removeEventListener("resize", read);
  }, [supplier?.slug, categoryCounts.length]);

  function openProduct(product) {
    if (!product?.id) return;
    navigate(withLocale(lang, `/details/${product.id}`));
  }

  function scrollToSupplierResults() {
    jumpToId("supplier-results", { animate: true });
  }

  function pickCategory(name) {
    setSelectedCategory(name);
    scrollToSupplierResults();
  }

  function clearSupplierFilters() {
    setSearchQuery("");
    setSelectedCategory("");
    setPriceFilter("all");
    setGreenOnly(false);
    scrollToSupplierResults();
  }

  function setCatalogViewMode(next) {
    const view = next === "list" ? "list" : "card";
    setCatalogView(view);
    try {
      sessionStorage.setItem(CATALOG_VIEW_KEY, view);
    } catch {
      /* ignore */
    }
  }

  const handleAdd = useCallback((productId, intent = "quote", qty) => {
    const result = addFromStorefront(productId, intent, qty, lang);
    if (!result?.ok || intent === "quote-now" || intent === "buy-now") return;
    setToast({
      message: t(intent === "buy" ? "addedBuyToRfq" : "addedQuoteToRfq"),
      href: withLocale(lang, "/rfq"),
    });
  }, [lang, t]);

  if (!supplier) {
    if (catalogLoading) {
      return (
        <div className="bg-paper min-h-screen">
          <SiteHeader />
          <main className="max-w-7xl mx-auto px-4 py-10">
            <p className="text-sm text-mute">{t("loadingCatalog")}</p>
          </main>
        </div>
      );
    }
    return (
      <div className="bg-paper min-h-screen">
        <SiteHeader />
        <main className="max-w-7xl mx-auto px-4 py-10">
          <div className="bg-white border border-line rounded-xl p-8 text-center">
            <h1 className="reveal text-xl font-bold text-brand-800">{t("supplierNotFound")}</h1>
            <p className="mt-2 text-sm text-mute">{t("supplierNotFoundHint")}</p>
            <Link to={allProductsTo(lang)} className="btn-primary mt-5 inline-flex">
              {t("browseCatalog")}
            </Link>
          </div>
        </main>
      </div>
    );
  }

  const cats = `${supplier.categories.slice(0, 3).join(", ")}${
    supplier.categories.length > 3 ? t("andMore") : ""
  }`;

  return (
    <div className="bg-paper min-h-screen">
      <Seo
        lang={lang}
        path={withLocale(lang, `/supplier/${supplier.slug}`)}
        title={seoCopy(lang).supplierTitle(supplier.name)}
        description={seoCopy(lang).supplierDesc(supplier.name)}
        image="/og-default.webp"
        jsonLd={[
          orgJsonLd(siteOrigin()),
          breadcrumbJsonLd(siteOrigin(), [
            { name: "Mattex Marketplace", path: withLocale(lang, "/") },
            { name: supplier.name, path: withLocale(lang, `/supplier/${supplier.slug}`) },
          ]),
        ]}
      />
      <SiteHeader
        searchValue={searchQuery}
        onSearchChange={setSearchQuery}
        onSearchSubmit={(event, value) => {
          event?.preventDefault();
          setSearchQuery(value ?? "");
          jumpToId("supplier-products");
        }}
        onSearchCategory={pickCategory}
        browseCategories={browseCategories}
        suggestProducts={catalog}
      />

      <section className="relative overflow-hidden bg-charcoal text-white min-h-[42vh] flex items-end">
        <div
          className="absolute inset-0 opacity-40 bg-cover bg-center scale-105"
          style={{ backgroundImage: `url(${supplier.image})` }}
          aria-hidden
        />
        <div className="absolute inset-0 bg-gradient-to-r from-charcoal via-charcoal/88 to-charcoal/45" aria-hidden />
        <div className="relative max-w-7xl mx-auto px-4 py-14 sm:py-20 w-full">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-200">
            {t("supplierLabel")}
          </p>
          <div className="mt-4 flex items-center gap-4">
            <SupplierLogo name={supplier.name} className="h-16 w-16 sm:h-20 sm:w-20 rounded-lg ring-1 ring-white/20" />
            <h1 className="reveal font-display text-4xl sm:text-5xl font-semibold leading-tight max-w-3xl">
              {supplier.name}
            </h1>
          </div>
          <p className="mt-4 text-sm sm:text-base text-white/70 max-w-xl leading-relaxed">
            {supplier.count === 1
              ? t("supplierHeroMetaOne", { cats })
              : t("supplierHeroMeta", { count: supplier.count, cats })}
          </p>
        </div>
      </section>

      <main>
        <section className="max-w-7xl mx-auto px-4 -mt-8 relative z-10">
          <SupplierMetrics metrics={supplier.metrics} t={t} />
        </section>

        {top.length ? (
        <section className="max-w-7xl mx-auto px-4 pt-10 sm:pt-12">
          <div className="mb-6">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-mute mb-2">
              {t("featured")}
            </p>
            <h2 className="font-display text-2xl sm:text-3xl font-semibold text-brand-800">
              {t("topProducts")}
            </h2>
          </div>
          <div className="grid min-w-0 grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {top.map((entry) => (
              <ProductCard
                key={entry.product.id}
                product={entry.product}
                compact
                rank={entry.product.featuredRank}
                grouped={entry.grouped}
                title={entry.groupName}
                onAdd={handleAdd}
              />
            ))}
          </div>
        </section>
        ) : null}

        <section id="supplier-products" className="max-w-7xl mx-auto px-4 py-12 sm:py-14">
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-6">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-mute mb-2">
                {t("catalog")}
              </p>
              <h2 className="font-display text-2xl sm:text-3xl font-semibold text-brand-800">
                {t("productsFromSupplier", { name: supplier.name })}
              </h2>
              <p className="text-sm text-mute mt-2">{t("supplierSearchHint")}</p>
            </div>
          </div>

          <div className="lg:grid lg:grid-cols-[15.5rem_minmax(0,1fr)] lg:gap-8 lg:items-stretch">
            <SupplierCategoryMenu
              navRef={catNavRef}
              t={t}
              total={catalog.length}
              counts={categoryCounts}
              selected={selectedCategory}
              onSelect={(name) => {
                setSelectedCategory(name);
                scrollToSupplierResults();
              }}
              offsetTop={navHeight}
            />

            <div className="min-w-0 mt-4 lg:mt-0">
              <div
                id="supplier-toolbar"
                className="sticky z-20 -mx-1 bg-paper px-1 pb-4"
                style={{ top: Math.max((wide ? navHeight : navHeight + catBarHeight) - 1, 0) }}
              >
                <div className="border border-line bg-white p-3 sm:p-3.5">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <label className="relative block min-w-[min(100%,16rem)] flex-1 border border-line bg-white">
                    <span className="sr-only">{t("catalog")}</span>
                    <ProductSearchBox
                      id="supplier-search"
                      value={searchQuery}
                      onValue={setSearchQuery}
                      onTerm={(term) => {
                        setSearchQuery(term);
                        jumpToId("supplier-products");
                      }}
                      onProduct={openProduct}
                      onCategory={pickCategory}
                      products={catalog}
                      browseCategories={browseCategories}
                      placeholder={t("searchPlaceholder")}
                      ariaLabel={t("catalog")}
                      className="min-w-0"
                      inputClassName="field-input w-full !rounded-none !border-0 !shadow-none"
                    />
                  </label>
                  <CatalogViewToggle
                    value={catalogView}
                    onChange={setCatalogViewMode}
                    tone="light"
                    compact
                  />
                </div>
                <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                  {[
                    ["all", t("allProducts")],
                    ["priced", t("priceFilterPriced")],
                    ["unpriced", t("priceFilterUnpriced")],
                  ].map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => {
                        setPriceFilter(id);
                        scrollToSupplierResults();
                      }}
                      className={`px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide border ${
                        priceFilter === id
                          ? "bg-brand-50 text-brand-800 border-brand-600/35"
                          : "bg-white border-line text-mute hover:border-brand-600/50 hover:text-brand-800"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                  <span className="mx-1 hidden h-4 w-px bg-line sm:inline-block" aria-hidden />
                  <button
                    type="button"
                    onClick={() => {
                      setGreenOnly((prev) => !prev);
                      scrollToSupplierResults();
                    }}
                    aria-pressed={greenOnly}
                    className={`px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide border ${
                      greenOnly
                        ? "bg-brand-50 text-brand-800 border-brand-600/35"
                        : "bg-white border-line text-mute hover:border-brand-600/50 hover:text-brand-800"
                    }`}
                  >
                    {t("filterGreen")}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPriceFilter((prev) => (prev === "hot" ? "all" : "hot"));
                      scrollToSupplierResults();
                    }}
                    aria-pressed={priceFilter === "hot"}
                    className={`px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide border ${
                      priceFilter === "hot"
                        ? "bg-brand-50 text-brand-800 border-brand-600/35"
                        : "bg-white border-line text-mute hover:border-brand-600/50 hover:text-brand-800"
                    }`}
                  >
                    {t("priceFilterHot")}
                  </button>
                </div>
                </div>
              </div>

              <div id="supplier-results" className="mb-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <h3 className="font-display text-2xl font-semibold text-brand-800">
                  {products.length === 1 ? t("productLabelOne") : t("productsLabel", { n: products.length })}
                </h3>
                {hasSupplierFilters ? (
                  <button
                    type="button"
                    onClick={clearSupplierFilters}
                    className="text-sm font-semibold text-brand-600 hover:text-brand-700"
                  >
                    {t("clearAll")}
                  </button>
                ) : null}
              </div>

              {products.length === 0 ? (
                <div className="border border-dashed border-line bg-white/60 rounded-xl px-6 py-10 text-center">
                  <p className="text-base font-semibold text-brand-800">{t("noSupplierMatches")}</p>
                  <p className="mt-2 text-sm text-mute">{t("noSupplierMatchesHint")}</p>
                  <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
                    <button
                      type="button"
                      onClick={clearSupplierFilters}
                      className="btn-soft !px-5"
                    >
                      {t("clearFilters")}
                    </button>
                    <Link to={allProductsTo(lang)} className="btn-primary !px-5">
                      {t("browseCatalog")}
                    </Link>
                  </div>
                </div>
              ) : (
                <>
                  <div className={catalogView === "list" ? "min-w-0 space-y-4" : "grid min-w-0 grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3"}>
                    {products.slice(0, catalogShown).map((entry) =>
                      catalogView === "list" ? (
                        <ProductListRow
                          key={entry.product.id}
                          product={entry.product}
                          grouped={entry.grouped}
                          title={entry.groupName}
                          onAdd={handleAdd}
                        />
                      ) : (
                        <ProductCard
                          key={entry.product.id}
                          product={entry.product}
                          grouped={entry.grouped}
                          title={entry.groupName}
                          onAdd={handleAdd}
                        />
                      )
                    )}
                  </div>
                  {catalogShown < products.length ? (
                    <div className="mt-6 flex justify-center">
                      <button
                        type="button"
                        onClick={() => setCatalogShown((n) => n + 24)}
                        className="btn-soft !px-5 !py-2.5"
                      >
                        {t("showMore")} ({products.length - catalogShown})
                      </button>
                    </div>
                  ) : null}
                </>
              )}
            </div>
          </div>
        </section>

        <SiteFooter />
      </main>

      <CartToast toast={toast} onDone={() => setToast(null)} />
    </div>
  );
}

function SupplierCategoryMenu({ navRef, t, total, counts, selected, onSelect, offsetTop = 64 }) {
  const items = [{ name: "", label: t("allProducts"), count: total }, ...counts.map(([name, count]) => ({
    name,
    label: name,
    count,
  }))];
  const maxHeight = `calc(100dvh - ${offsetTop}px - 12px)`;

  return (
    <nav
      ref={navRef}
      aria-label={t("categories")}
      className="sticky z-20 flex w-full min-w-0 flex-col bg-paper lg:max-h-[var(--cat-nav-max)] lg:overflow-hidden"
      style={{ top: Math.max(offsetTop - 1, 0), "--cat-nav-max": maxHeight }}
    >
      <p className="mb-2 flex shrink-0 items-baseline gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-mute">
        <span>{t("categories")}</span>
        <span className="tabular-nums">{counts.length}</span>
      </p>
      <ul className="flex max-w-full min-w-0 gap-2 overflow-x-auto overscroll-x-contain border border-line bg-white lg:block lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
        {items.map((item) => {
          const active = selected === item.name;
          return (
            <li key={item.name || "all"} className={`shrink-0 border-line lg:shrink lg:border-b last:lg:border-b-0 ${active ? "bg-brand-50" : "hover:bg-paper"}`}>
              <button
                type="button"
                onClick={() => onSelect(item.name)}
                aria-current={active ? "page" : undefined}
                className={`w-full px-3 py-2.5 text-left ${active ? "text-brand-800" : "text-ink"}`}
              >
                <span className={`block text-sm leading-snug ${active ? "font-semibold" : "font-medium"}`}>{item.label}</span>
                <span className="mt-0.5 block text-[11px] font-medium text-mute tabular-nums">{item.count}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function StarIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <path
        fill="currentColor"
        d="M12 2.6 14.7 8.4l6.4.7-4.8 4.3 1.3 6.3L12 16.7 6.4 19.7l1.3-6.3L2.9 9.1l6.4-.7L12 2.6Z"
      />
    </svg>
  );
}

function Stars({ value, size = "h-5 w-5" }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-hidden>
      {[1, 2, 3, 4, 5].map((i) => {
        const fill = Math.min(1, Math.max(0, value - (i - 1)));
        return (
          <span key={i} className={`relative ${size}`}>
            <StarIcon className="absolute inset-0 text-[#E2E8E4]" />
            <span className="absolute inset-0 overflow-hidden" style={{ width: `${fill * 100}%` }}>
              <StarIcon className={`${size} text-[#4F8F6C]`} />
            </span>
          </span>
        );
      })}
    </span>
  );
}

function RateRing({ value }) {
  const uid = useId().replace(/:/g, "");
  const r = 36;
  const c = 2 * Math.PI * r;
  const clamped = Math.min(100, Math.max(0, value));
  const offset = c * (1 - clamped / 100);
  return (
    <div className="relative h-[6.25rem] w-[6.25rem]">
      <svg viewBox="0 0 88 88" className="h-full w-full -rotate-90" aria-hidden>
        <defs>
          <linearGradient id={`ring-${uid}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#6BAF86" />
            <stop offset="100%" stopColor="#245A41" />
          </linearGradient>
        </defs>
        <circle cx="44" cy="44" r={r} fill="#F3F8F5" />
        <circle cx="44" cy="44" r={r} fill="none" stroke="#E4EBE6" strokeWidth="6" />
        <circle
          cx="44"
          cy="44"
          r={r}
          fill="none"
          stroke={`url(#ring-${uid})`}
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          className="metric-ring"
          style={{ "--ring-circ": c }}
        />
      </svg>
      <p className="absolute inset-0 flex items-center justify-center font-display text-xl font-semibold text-ink">
        {value}%
      </p>
    </div>
  );
}

function formatCount(n) {
  const value = Number(n) || 0;
  if (value >= 1000) {
    const k = value / 1000;
    return `${k >= 10 ? k.toFixed(0) : k.toFixed(1).replace(/\.0$/, "")}k`;
  }
  return String(value);
}

function SearchGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16.2 16.2 21 21" strokeLinecap="round" />
    </svg>
  );
}

function FoundGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <circle cx="9" cy="8" r="3" />
      <path d="M4.5 19c.5-3 2.4-4.6 4.5-4.6S13 16 13.5 19" strokeLinecap="round" />
      <circle cx="16.5" cy="9" r="2.4" />
      <path d="M15.2 19c.4-2.3 1.8-3.5 3.3-3.5 1.2 0 2.2.7 2.7 2" strokeLinecap="round" />
    </svg>
  );
}

function RfqGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path d="M7 3.5h7.2L19 8.2V20a1.5 1.5 0 0 1-1.5 1.5H7A1.5 1.5 0 0 1 5.5 20V5A1.5 1.5 0 0 1 7 3.5Z" />
      <path d="M14 3.6V8h4.4" />
      <path d="M8.5 12.5h7M8.5 16h5" strokeLinecap="round" />
    </svg>
  );
}

function CountStat({ value, label, icon, share }) {
  return (
    <div className="px-4 py-6 flex flex-col items-center text-center">
      <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-brand-50 text-brand-700">
        {icon}
      </span>
      <p className="mt-3 font-display text-4xl sm:text-5xl font-semibold tracking-tight leading-none tabular-nums text-ink">
        {formatCount(value)}
      </p>
      <p className="mt-3 text-[10px] font-medium uppercase tracking-[0.16em] text-mute">{label}</p>
      <div className="mt-3 h-1 w-16 overflow-hidden rounded-full bg-[#E8EEEA]">
        <div
          className="h-full rounded-full bg-[#4F8F6C]"
          style={{ width: `${Math.max(12, Math.round((share || 0) * 100))}%` }}
        />
      </div>
    </div>
  );
}

function SectionLabel({ children }) {
  return (
    <div className="flex items-center justify-center gap-3">
      <span className="h-px w-10 bg-line/90" />
      <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-mute">{children}</p>
      <span className="h-px w-10 bg-line/90" />
    </div>
  );
}

function SupplierMetrics({ metrics, t }) {
  if (metrics?.empty) {
    return (
      <article className="relative overflow-hidden rounded-2xl bg-white/90 backdrop-blur-md border border-white/80 shadow-[0_18px_48px_rgba(16,21,19,0.18)]">
        <div className="relative px-6 py-10 text-center">
          <SectionLabel>{t("supplierScorecard")}</SectionLabel>
          <p className="mt-5 font-display text-3xl font-semibold text-ink">—</p>
          <p className="mt-2 text-sm text-mute">{t("noPerformanceData")}</p>
        </div>
      </article>
    );
  }
  const demandMax = Math.max(metrics.searchCount, metrics.foundCount, metrics.rfqCount, 1);
  return (
    <article className="relative overflow-hidden rounded-2xl bg-white/90 backdrop-blur-md border border-white/80 shadow-[0_18px_48px_rgba(16,21,19,0.18)]">
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(720px_220px_at_50%_0%,rgba(36,90,65,0.08),transparent_58%)]"
        aria-hidden
      />
      <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-brand-400/80 to-transparent" />
      <div className="relative">
        <div className="pt-5 pb-1">
          <SectionLabel>{t("supplierScorecard")}</SectionLabel>
        </div>
        <div className="grid sm:grid-cols-3 px-2 pb-1">
          <div className="px-4 py-6 flex flex-col items-center text-center">
            <p className="flex items-baseline gap-1.5 font-display text-5xl font-semibold tracking-tight leading-none text-ink">
              {metrics.rating.toFixed(1)}
              <span className="font-sans text-sm font-medium tracking-normal text-mute">/5</span>
            </p>
            <div className="mt-3">
              <Stars value={metrics.rating} />
            </div>
            <p className="mt-3 text-[10px] font-medium uppercase tracking-[0.16em] text-mute">
              {t("supplierRating")}
            </p>
          </div>
          <div className="px-4 py-6 flex flex-col items-center text-center sm:border-x sm:border-line/80">
            <RateRing value={metrics.completionRate} />
            <p className="mt-3 text-[10px] font-medium uppercase tracking-[0.16em] text-mute">
              {t("orderCompletionRate")}
            </p>
          </div>
          <div className="px-4 py-6 flex flex-col items-center text-center">
            <RateRing value={metrics.onTimeRate} />
            <p className="mt-3 text-[10px] font-medium uppercase tracking-[0.16em] text-mute">
              {t("onTimeCompletionRate")}
            </p>
          </div>
        </div>
        <div className="mx-4 border-t border-line/80">
          <div className="pt-4">
            <SectionLabel>{t("metricDemandHint")}</SectionLabel>
          </div>
          <div className={`grid ${SHOW_RFQ ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
            <CountStat
              value={metrics.searchCount}
              label={t("metricSearches")}
              icon={<SearchGlyph />}
              share={metrics.searchCount / demandMax}
            />
            <div className={SHOW_RFQ ? "sm:border-x sm:border-line/80" : "sm:border-l sm:border-line/80"}>
              <CountStat
                value={metrics.foundCount}
                label={t("metricFound")}
                icon={<FoundGlyph />}
                share={metrics.foundCount / demandMax}
              />
            </div>
            {SHOW_RFQ ? (
            <CountStat
              value={metrics.rfqCount}
              label={t("metricRfqsReceived")}
              icon={<RfqGlyph />}
              share={metrics.rfqCount / demandMax}
            />
            ) : null}
          </div>
        </div>
      </div>
    </article>
  );
}
