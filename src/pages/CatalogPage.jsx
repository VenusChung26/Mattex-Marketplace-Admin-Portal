import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, Navigate, useNavigate, useParams, useSearchParams } from "react-router-dom";
import CategorySideNav from "../components/CategorySideNav";
import ListFilters from "../components/ListFilters";
import CopyLinkButton from "../components/CopyLinkButton";
import ProductCard, { ProductCardSkeleton, ProductListRow } from "../components/ProductCard";
import CatalogViewToggle from "../components/CatalogViewToggle";
import SearchFieldsSelect from "../components/SearchFieldsSelect";
import Seo, { breadcrumbJsonLd, orgJsonLd } from "../components/Seo";
import SiteFooter from "../components/SiteFooter";
import SiteHeader from "../components/SiteHeader";
import CartToast from "../components/CartToast";
import { useStore } from "../hooks/useStore";
import { useLanguage } from "../i18n";
import { catalogGroupIndex, collapseCatalog, useCatalogGroups } from "../lib/catalogGroups";
import { jumpToId } from "../lib/jumpTo";
import { allProductsTo, freshCatalogLocation, productDetailsLocation, siteOrigin, withLocale } from "../lib/locale";
import { categoryOgPath } from "../lib/ogImage";
import { seoCopy } from "../lib/seoCopy";
import {
  getCategoryByName,
  getCategoryBySlug,
  getCategoryDefs,
  CATEGORY_LIST_PAUSED,
  retiredCategoryQuery,
  productShowsPrice,
  getProductsByCategory,
  isHitProduct,
  searchProducts,
  addFromStorefront,
} from "../lib/store";
import { ProductSearchBox } from "../components/SearchSuggestions";
import {
  applyListFilter,
  clearTileSearchParams,
  isVinylFloor,
  readTileQuery,
  tileProductNote,
  tileSearchParams,
  VINYL_CATEGORY_ID,
  vinylFacetsActive,
} from "../lib/tileBrowse.js";

const CATALOG_BATCH = 24;
const CATALOG_VIEW_KEY = "subbie_catalog_view";

function readCatalogView() {
  try {
    return sessionStorage.getItem(CATALOG_VIEW_KEY) === "list" ? "list" : "card";
  } catch {
    return "card";
  }
}

export default function CatalogPage() {
  const { t, lang } = useLanguage();
  const { catalogEpoch, catalogLoading } = useStore();
  const groupEpoch = useCatalogGroups();
  const { slug } = useParams();
  const [params, setParams] = useSearchParams();
  const [searchQuery, setSearchQuery] = useState(() => params.get("q") || "");
  const [searchFields, setSearchFields] = useState([]);
  const [priceFilter, setPriceFilter] = useState("all");
  const [greenOnly, setGreenOnly] = useState(false);
  const [catalogView, setCatalogView] = useState(readCatalogView);
  const [toast, setToast] = useState(null);
  const [catalogShown, setCatalogShown] = useState(CATALOG_BATCH);
  const origin = siteOrigin();
  const copy = seoCopy(lang);
  const category = slug ? getCategoryBySlug(slug) : null;
  const catQuery = params.get("cat") || "";
  const catFromQuery = !slug && catQuery ? getCategoryByName(catQuery) : null;

  useEffect(() => {
    try {
      sessionStorage.setItem(CATALOG_VIEW_KEY, catalogView);
    } catch {
      /* ignore */
    }
  }, [catalogView]);

  const navigate = useNavigate();
  const suggestionsPool = useMemo(() => getProductsByCategory(), [catalogEpoch]);
  const browseCategories = useMemo(
    () => getCategoryDefs().map((item) => [item.name, item.count]),
    [catalogEpoch]
  );

  const products = useMemo(() => {
    if (!category) return [];
    const vinylOn = category.id === VINYL_CATEGORY_ID;
    let list = vinylOn
      ? getProductsByCategory().filter(isVinylFloor)
      : searchProducts(searchQuery, category.name, { fields: searchFields });
    if (vinylOn && String(searchQuery || "").trim()) {
      const matched = new Set(searchProducts(searchQuery, [], { fields: searchFields }).map((product) => product.id));
      list = list.filter((product) => matched.has(product.id));
    }
    if (greenOnly) list = list.filter((p) => p.green);
    if (priceFilter === "priced") list = list.filter((p) => productShowsPrice(p));
    if (priceFilter === "unpriced") list = list.filter((p) => !productShowsPrice(p));
    if (priceFilter === "hot") list = list.filter((p) => isHitProduct(p));
    return list;
  }, [searchQuery, category, searchFields, priceFilter, greenOnly, catalogEpoch, groupEpoch]);

  const tileState = readTileQuery(params, { optional: true });
  const vinylCategory = category?.id === VINYL_CATEGORY_ID;
  const listActive = vinylCategory && vinylFacetsActive(tileState);
  const shownEntries = useMemo(() => {
    if (listActive) return applyListFilter(products, { ...tileState, kind: "vinyl" }) || [];
    return collapseCatalog(products, catalogGroupIndex()).map((entry) => ({
      ...entry,
      key: entry.product.id,
      hideSpecGroups: [],
    }));
  }, [listActive, products, tileState, groupEpoch]);

  useEffect(() => {
    setCatalogShown(CATALOG_BATCH);
  }, [searchQuery, category?.id, searchFields, priceFilter, greenOnly, tileState]);

  const handleAdd = useCallback((productId, intent = "quote", qty, options) => {
    const note = listActive ? tileProductNote(options?.tileNote, lang, tileState) : "";
    const result = addFromStorefront(productId, intent, qty, lang, {
      ...(options || {}),
      ...(note ? { remark: note } : {}),
    });
    if (!result?.ok || intent === "quote-now" || intent === "buy-now") return;
    setToast({
      message: t(intent === "buy" ? "addedBuyToRfq" : "addedQuoteToRfq"),
      href: withLocale(lang, "/rfq"),
    });
  }, [lang, t, listActive, tileState]);

  if (slug === "oxygen-chamber" && !CATEGORY_LIST_PAUSED) {
    return <Navigate to={withLocale(lang, "/catalog/shop-equipment")} replace />;
  }
  if (!slug && catFromQuery && !CATEGORY_LIST_PAUSED) {
    return <Navigate to={withLocale(lang, `/catalog/${catFromQuery.id}`)} replace />;
  }
  if (!slug || !category) {
    const retired = retiredCategoryQuery(slug);
    if (catalogLoading && !retired) return null;
    const dest = allProductsTo(lang);
    return (
      <Navigate
        to={retired ? { ...dest, search: `?q=${encodeURIComponent(retired)}` } : dest}
        replace
      />
    );
  }

  const path = withLocale(lang, `/catalog/${category.id}`);
  const sharePath = `${path}${listActive ? `?${tileSearchParams(tileState, params).toString()}` : ""}`;
  const crumbs = [
    { name: "Mattex Marketplace", path: withLocale(lang, "/") },
    { name: category.name, path },
  ];
  const hasFilters =
    Boolean(searchQuery.trim()) || priceFilter !== "all" || greenOnly || searchFields.length > 0 || listActive;

  function writeSearch(value) {
    navigate(freshCatalogLocation(lang, value));
  }

  function clearFilters() {
    setSearchFields([]);
    setPriceFilter("all");
    setGreenOnly(false);
    setParams(clearTileSearchParams(params), { replace: true, preventScrollReset: true, state: { keepScroll: true } });
    if (searchQuery.trim()) writeSearch("");
  }

  function setCatalogViewMode(next) {
    setCatalogView(next === "list" ? "list" : "card");
  }

  function openProduct(product) {
    if (!product?.id) return;
    navigate(withLocale(lang, `/details/${product.id}`));
  }

  function openCategory(name) {
    const next = getCategoryByName(name);
    if (!next) return;
    setSearchQuery("");
    if (next.id === category.id) return;
    navigate(withLocale(lang, `/catalog/${next.id}`), { preventScrollReset: true, state: { keepScroll: true } });
  }

  if (!category) {
    return (
      <div className="bg-paper min-h-screen">
        <SiteHeader />
        <main className="mx-auto max-w-7xl px-4 py-16 text-sm text-mute">載入目錄</main>
      </div>
    );
  }

  return (
    <div className="bg-paper min-h-screen">
      <Seo
        lang={lang}
        path={path}
        title={copy.categoryTitle(category.name)}
        description={copy.categoryDesc(category.name)}
        image={categoryOgPath(category.id)}
        jsonLd={[orgJsonLd(origin), breadcrumbJsonLd(origin, crumbs)]}
      />
      <SiteHeader
        searchValue={searchQuery}
        onSearchChange={writeSearch}
        onSearchSubmit={(event, value) => {
          event?.preventDefault();
          writeSearch(value ?? "");
          jumpToId("catalog-results");
        }}
        onSearchCategory={openCategory}
        browseCategories={browseCategories}
        suggestProducts={suggestionsPool}
      />
      <main className="mx-auto min-w-0 max-w-7xl px-4 py-10 sm:py-12">
        <div className="flex min-w-0 flex-col gap-8 lg:flex-row">
          <aside className="w-full min-w-0 max-w-full lg:w-56 lg:shrink-0 xl:w-60">
            <CategorySideNav
              activeSlug={category.id}
              offsetTop={88}
              filterMode
              onSelectCategory={(next) => {
                if (!next?.id || next.id === category.id) return;
                navigate(withLocale(lang, `/catalog/${next.id}`), { preventScrollReset: true, state: { keepScroll: true } });
              }}
            />
          </aside>
          <div className="min-w-0 flex-1">
            <p id="catalog-top" className="text-xs font-semibold uppercase tracking-[0.14em] text-mute mb-2">
              <Link to={allProductsTo(lang)} className="hover:text-brand-600">
                {t("allProductsTitle")}
              </Link>
              {category.parentId ? (
                <>
                  <span className="mx-2 text-line">/</span>
                  <Link to={withLocale(lang, `/catalog/${category.parentId}`)} className="hover:text-brand-600">
                    {category.parentName}
                  </Link>
                </>
              ) : null}
              <span className="mx-2 text-line">/</span>
              <span>{category.name}</span>
            </p>
            <div className="mb-4 flex items-center gap-3">
              <h1 className="min-w-0 font-display text-2xl sm:text-3xl font-semibold text-brand-800">{category.name}</h1>
              <CopyLinkButton path={sharePath} />
            </div>

            <div className="bg-white border border-line rounded-xl p-3 sm:p-3.5 mb-6">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <div className="relative flex min-w-[min(100%,18rem)] flex-1 border border-line bg-white">
                  <ProductSearchBox
                    id="catalog-search"
                    value={searchQuery}
                    onValue={writeSearch}
                    onTerm={(term) => {
                      writeSearch(term);
                      jumpToId("catalog-results");
                    }}
                    onProduct={openProduct}
                    onCategory={openCategory}
                    includeShopTree
                    products={suggestionsPool}
                    browseCategories={browseCategories}
                    placeholder={t("searchPlaceholder")}
                    ariaLabel={t("catalog")}
                    className="min-w-0 flex-1"
                    inputClassName="field-input w-full flex-1 !rounded-none !border-0 !shadow-none"
                  />
                </div>
                <SearchFieldsSelect
                  selected={searchFields}
                  onChange={setSearchFields}
                  compact
                  className="w-max max-w-full shrink-0"
                />
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
                    onClick={() => setPriceFilter(id)}
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
                  onClick={() => setGreenOnly((prev) => !prev)}
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
                  onClick={() => setPriceFilter((prev) => (prev === "hot" ? "all" : "hot"))}
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

            {vinylCategory ? (
              <ListFilters
                lang={lang}
                products={products}
                state={tileState}
                onChange={(next) => setParams(tileSearchParams(next, params), { replace: true, preventScrollReset: true, state: { keepScroll: true } })}
              />
            ) : null}

            <div id="catalog-results" className="mb-4 flex items-end justify-between gap-3">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <h2 className="font-display text-2xl font-semibold text-brand-800">
                  {catalogLoading && !shownEntries.length
                    ? t("loadingCatalog")
                    : shownEntries.length === 1
                      ? t("productLabelOne")
                      : t("productsLabel", { n: shownEntries.length })}
                </h2>
                {hasFilters ? (
                  <button
                    type="button"
                    onClick={clearFilters}
                    className="text-sm font-semibold text-brand-600 hover:text-brand-700"
                  >
                    {t("clearAll")}
                  </button>
                ) : null}
              </div>
            </div>
            {catalogLoading && !shownEntries.length ? (
              <div
                className={catalogView === "list" ? "min-w-0 space-y-4" : "grid min-w-0 grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3"}
                aria-busy="true"
                aria-live="polite"
              >
                <ProductCardSkeleton count={6} />
              </div>
            ) : shownEntries.length ? (
              <>
                <div className={catalogView === "list" ? "min-w-0 space-y-4" : "grid min-w-0 grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3"}>
                  {shownEntries.slice(0, catalogShown).map((entry) =>
                    catalogView === "list" ? (
                      <ProductListRow
                        key={entry.key}
                        product={entry.product}
                        grouped={entry.grouped}
                        title={entry.groupName}
                        hideSpecGroups={entry.hideSpecGroups}
                        tileCustom={listActive ? { size: tileState.sizeCustom, slip: tileState.slipCustom } : null}
                        onAdd={handleAdd}
                      />
                    ) : (
                      <ProductCard
                        key={entry.key}
                        product={entry.product}
                        grouped={entry.grouped}
                        title={entry.groupName}
                        hideSpecGroups={entry.hideSpecGroups}
                        tileCustom={listActive ? { size: tileState.sizeCustom, slip: tileState.slipCustom } : null}
                        onAdd={handleAdd}
                      />
                    )
                  )}
                </div>
                {catalogShown < shownEntries.length ? (
                  <div className="mt-6 flex justify-center">
                    <button type="button" onClick={() => setCatalogShown((n) => n + CATALOG_BATCH)} className="btn-soft !px-5 !py-2.5">
                      {t("showMore")} ({shownEntries.length - catalogShown})
                    </button>
                  </div>
                ) : null}
              </>
            ) : (
              <div className="bg-white border border-line rounded-xl p-8 text-center">
                <p className="text-lg font-semibold text-brand-800">{t("noProducts")}</p>
                <p className="mt-2 text-sm text-mute">{t("noProductsHint")}</p>
                <div className="mt-5 flex flex-wrap justify-center gap-2">
                  {hasFilters ? (
                    <button type="button" onClick={clearFilters} className="btn-soft">
                      {t("clearFilters")}
                    </button>
                  ) : null}
                  <Link to={allProductsTo(lang)} className="btn-primary">
                    {t("allProductsTitle")}
                  </Link>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
      <SiteFooter />
      <CartToast toast={toast} onDone={() => setToast(null)} />
    </div>
  );
}
