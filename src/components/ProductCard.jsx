import { memo, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { displayLeadTime, getProduct, isBuyerVisible, isHitProduct, productSkuId, stockStatusKey, supplierDisplayName, supplierPath, addCustomLine, requireBuyerAuth, catalogPathForCategory, canDirectBuy } from "../lib/store";
import { displayUnit, lowerDeliveryQty, orderMinimum, productImageUrl } from "../lib/productFields";
import { groupOf, useCatalogGroups } from "../lib/catalogGroups";
import { groupSizeChoices, localizeSpecText, optionLabels, sharedOptionPrefix, shopTitle, stripOptionPrefix } from "../lib/catalogGroup";
import { usePromo } from "../lib/promo";
import { useCartLine } from "../hooks/useStore";
import { useLanguage } from "../i18n";
import { withLocale } from "../lib/locale";
import ProductPrice from "./ProductPrice";
import ProductRating from "./ProductRating";
import CustomProductModal from "./CustomProductModal";

export function FallbackImage({ src, fallback = "", alt = "", ...rest }) {
  const [current, setCurrent] = useState(src);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setCurrent(src);
    setFailed(false);
  }, [src]);
  if (failed || !String(current || "").trim()) return null;
  return (
    <img
      {...rest}
      src={current}
      alt={alt}
      onError={() => {
        if (fallback && current !== fallback) {
          setCurrent(fallback);
          return;
        }
        setFailed(true);
      }}
    />
  );
}

function LeavesIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-3.5 w-3.5 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z" />
      <path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12" />
    </svg>
  );
}

function TickIcon({ className = "h-3.5 w-3.5" }) {
  return (
    <svg viewBox="0 0 16 16" className={`${className} shrink-0`} fill="none" aria-hidden>
      <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5" />
      <path d="M4.8 8.2 7 10.3 11.3 5.8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function shopLeadTime(product, lang) {
  return displayLeadTime(product, lang) || "—";
}

const ACTION_BTN =
  "w-full min-h-[2.5rem] !px-2 !py-2 !text-xs leading-tight text-center whitespace-normal";

const TAG_PILL =
  "inline-flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 tracking-[0.08em]";

function EmptyImage({ compact }) {
  const { t } = useLanguage();
  return (
    <span className={`flex h-full w-full flex-col items-center justify-center gap-1.5 bg-[#f3f5f4] text-mute ${compact ? "min-h-[4.5rem]" : "min-h-[12rem]"}`}>
      <svg viewBox="0 0 24 24" className={compact ? "h-5 w-5" : "h-8 w-8"} fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="m8 13 2.2-2.2a1 1 0 0 1 1.4 0L15 14" strokeLinecap="round" />
        <path d="m14 13 1.2-1.2a1 1 0 0 1 1.4 0L19 14" strokeLinecap="round" />
        <circle cx="9" cy="9" r="1" fill="currentColor" stroke="none" />
      </svg>
      <span className={compact ? "text-[9px] font-medium" : "text-xs font-medium"}>{t("noProductImage")}</span>
    </span>
  );
}

export function ProductImage({ src, alt, fallback = "", className = "", imgClassName = "", compact = false }) {
  const { t } = useLanguage();
  const [current, setCurrent] = useState(src);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setCurrent(src);
    setFailed(false);
  }, [src]);
  const show = Boolean(String(current || "").trim()) && !failed;
  return (
    <span className={`relative block overflow-hidden bg-[#f3f5f4] ${className}`}>
      {show ? (
        <img
          src={current}
          alt={alt}
          className={imgClassName}
          loading="lazy"
          decoding="async"
          fetchPriority="low"
          onError={() => {
            if (fallback && current !== fallback) {
              setCurrent(fallback);
              return;
            }
            setFailed(true);
          }}
        />
      ) : (
        <EmptyImage compact={compact} />
      )}
      {show ? (
        <span
          className={`absolute bottom-0 inset-x-0 pointer-events-none bg-charcoal/75 text-white text-center ${
            compact ? "text-[8px] leading-tight px-1 py-0.5" : "text-[10px] px-1.5 py-1"
          }`}
        >
          {t("imageForReference")}
        </span>
      ) : null}
    </span>
  );
}

export function ProductCardSkeleton({ compact = false, count = 6 }) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="product-tile catalog-skeleton overflow-hidden" aria-hidden>
          <div className={`bg-[#e6ebe8] ${compact ? "aspect-[5/4]" : "aspect-[4/3]"}`} />
          <div className={`space-y-2 ${compact ? "p-3" : "p-4"}`}>
            <div className="h-2.5 w-1/3 rounded bg-[#e6ebe8]" />
            <div className="h-4 w-4/5 rounded bg-[#e6ebe8]" />
            <div className="h-3 w-1/2 rounded bg-[#e6ebe8]" />
            <div className="mt-3 h-8 w-full rounded bg-[#e6ebe8]" />
          </div>
        </div>
      ))}
    </>
  );
}

function TagLink({ to, title, className, children }) {
  return (
    <Link to={to} title={title} className={className} onClick={(event) => event.stopPropagation()}>
      {children}
    </Link>
  );
}

export function ProductTagPills({ product, className = "" }) {
  const { t, lang } = useLanguage();
  const hit = isHitProduct(product);
  if (!product?.green && !hit && !product?.tailorMade) return null;
  const home = withLocale(lang, "/");
  return (
    <span className={`inline-flex flex-wrap items-center gap-1 ${className}`}>
      {hit ? (
        <TagLink to={`${home}#top`} title={t("topLabelHint")} className={`${TAG_PILL} bg-charcoal text-white`}>{t("hitBadge")}</TagLink>
      ) : null}
      {product.green ? (
        <TagLink to={`${home}#green`} title={t("greenLabelHint")} className={`${TAG_PILL} bg-[#1f8a45] text-white`}>
          <LeavesIcon />
          {t("greenBadge")}
        </TagLink>
      ) : null}
      {product.tailorMade ? (
        <TagLink to={`${home}#custom`} title={t("tailorLabelHint")} className={`${TAG_PILL} bg-brand-700 text-white`}>
          <TickIcon className="h-3 w-3" />
          {t("tailorMadeBadge")}
        </TagLink>
      ) : null}
    </span>
  );
}

const META_CHIP = "inline-flex items-center whitespace-nowrap bg-paper text-[10px] px-1.5 py-0.5";

export function ProductMetaChips({ product, className = "", showTags = false }) {
  const { t, lang } = useLanguage();
  const stockKey = stockStatusKey(product.stockStatus);
  const inStock = product.stockStatus === "in_stock";
  return (
    <div className={`flex flex-wrap items-center gap-1 ${className}`}>
      <span
        className={`${META_CHIP} font-semibold ${
          inStock ? "bg-brand-50 text-brand-800" : "text-ink"
        }`}
      >
        {t(stockKey)}
      </span>
      <span className={`${META_CHIP} font-medium text-mute`}>
        {t("moq")} {product.moq} {displayUnit(product.unit, lang)}
      </span>
      <span className={`${META_CHIP} font-medium text-mute`}>
        {shopLeadTime(product, lang)}
      </span>
      {showTags ? <ProductTagPills product={product} /> : null}
    </div>
  );
}

export function ProductBadges({ product, rank = null }) {
  const { t, lang } = useLanguage();
  const hit = isHitProduct(product);
  const showRank = rank != null;
  if (!product?.green && !hit && !showRank && !product?.tailorMade) return null;
  const home = withLocale(lang, "/");
  return (
    <div className="absolute top-2.5 right-2.5 z-10 flex flex-wrap items-start justify-end gap-1">
      {showRank ? (
        <span className="bg-charcoal/90 text-white text-[11px] font-bold px-2 py-1">#{rank}</span>
      ) : hit ? (
        <TagLink to={`${home}#top`} title={t("topLabelHint")} className="bg-charcoal/90 text-white text-[10px] font-bold px-2 py-1 tracking-[0.08em]">
          {t("hitBadge")}
        </TagLink>
      ) : null}
      {product.green ? (
        <TagLink to={`${home}#green`} title={t("greenLabelHint")} className="inline-flex items-center gap-1 bg-[#1f8a45] text-white text-[10px] font-bold px-2 py-1 tracking-[0.08em]">
          <LeavesIcon />
          {t("greenBadge")}
        </TagLink>
      ) : null}
      {product.tailorMade ? (
        <TagLink to={`${home}#custom`} title={t("tailorLabelHint")} className="inline-flex items-center gap-1 bg-brand-700 text-white text-[10px] font-bold px-2 py-1 tracking-[0.08em]">
          <TickIcon className="h-3 w-3" />
          {t("tailorMadeBadge")}
        </TagLink>
      ) : null}
    </div>
  );
}

function clampQty(value, min) {
  const n = Math.floor(Number(value));
  return Math.max(min, Number.isFinite(n) ? n : min);
}

function deliveryUnit(qty, unit, shownUnit, lang) {
  if (lang !== "en" || Number(qty) === 1) return shownUnit;
  return { bag: "bags", sheet: "sheets", pail: "pails", pc: "pcs" }[String(unit || "").toLowerCase()] || shownUnit;
}

export function QtyStepper({ value, min = 1, unit = "", onChange, size = "card", t, deliveryQty = null }) {
  const { lang } = useLanguage();
  const shownUnit = displayUnit(unit, lang);
  const compact = size === "card" || size === "row" || size === "bar";
  const stretch = size !== "bar";
  const [draft, setDraft] = useState(String(value));
  const [underMin, setUnderMin] = useState(() => Number(value) < min);
  const atMin = value <= min;
  const btn = compact
    ? "h-8 w-8 shrink-0 text-base leading-none text-brand-800 hover:bg-brand-50 disabled:text-mute disabled:hover:bg-transparent disabled:opacity-40"
    : "h-10 w-10 shrink-0 text-lg leading-none text-brand-800 hover:bg-brand-50 disabled:text-mute disabled:hover:bg-transparent disabled:opacity-40";
  const valueBox = compact ? "h-8 min-w-[2.5rem] text-sm" : "h-10 min-w-[2.75rem] text-base";

  useEffect(() => {
    setDraft(String(value));
    setUnderMin(Number(value) < min);
  }, [value, min]);

  function parseDraft(raw) {
    const n = Math.floor(Number(String(raw).replace(/[^\d]/g, "")));
    return Number.isFinite(n) ? n : NaN;
  }

  function commit(raw) {
    const n = parseDraft(raw);
    if (String(raw).trim() === "" || !Number.isFinite(n)) {
      setUnderMin(true);
      onChange(min);
      setDraft(String(min));
      return;
    }
    if (n < min) {
      setUnderMin(true);
      onChange(n);
      setDraft(String(n));
      return;
    }
    setUnderMin(false);
    onChange(n);
    setDraft(String(n));
  }

  function handleInput(raw) {
    const cleaned = String(raw).replace(/[^\d]/g, "");
    setDraft(cleaned);
    if (cleaned === "") {
      setUnderMin(true);
      onChange(0);
      return;
    }
    const n = parseDraft(cleaned);
    if (!Number.isFinite(n)) return;
    setUnderMin(n < min);
    onChange(n);
  }

  const control = (
    <div
      className={`flex items-stretch overflow-hidden border bg-white ${
        stretch ? "w-full" : "w-fit max-w-full"
      } ${underMin ? "border-amber-400" : "border-line"}`}
    >
      <span
        className={`flex shrink-0 items-center border-r px-2.5 font-medium text-mute ${
          underMin ? "border-amber-200" : "border-line"
        } ${compact ? "text-[11px]" : "text-xs"}`}
      >
        {t("qty")}
      </span>
      <button
        type="button"
        className={btn}
        aria-label="−"
        disabled={atMin}
        onClick={() => {
          setUnderMin(false);
          onChange(clampQty(value - 1, min));
        }}
      >
        −
      </button>
      <input
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        autoComplete="off"
        spellCheck={false}
        aria-label={t("qty")}
        value={draft}
        onChange={(e) => handleInput(e.target.value)}
        onBlur={() => commit(draft)}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
        className={`${valueBox} bg-transparent px-1 text-center font-semibold tabular-nums text-ink outline-none ${
          stretch ? "min-w-0 flex-1" : "w-12 shrink-0"
        }`}
      />
      <button
        type="button"
        className={btn}
        aria-label="+"
        onClick={() => {
          setUnderMin(false);
          onChange(clampQty(value + 1, min));
        }}
      >
        +
      </button>
      {unit ? (
        <span
          className={`flex shrink-0 items-center border-l px-2.5 text-mute ${
            underMin ? "border-amber-200" : "border-line"
          } ${compact ? "text-sm font-semibold text-ink" : "text-base font-semibold text-ink"}`}
        >
          {shownUnit}
        </span>
      ) : null}
    </div>
  );

  return (
    <div className={stretch ? "w-full min-w-0" : "w-fit max-w-full"}>
      {control}
      {underMin ? (
        <p className={`mt-1 text-amber-800 ${compact ? "text-[10px] leading-snug" : "text-[11px]"}`} role="alert">
          {t("qtyUnderMin", { n: `${min} ${shownUnit}`.trim() })}
        </p>
      ) : size === "detail" ? (
        <p className="mt-1 text-[11px] text-mute">{t("qtyMinMoq", { n: `${min} ${shownUnit}`.trim() })}</p>
      ) : null}
      {deliveryQty ? (
        <p className={`text-mute ${compact ? "mt-1 text-[10px] leading-snug" : "mt-1 text-[11px]"}`}>
          {t("lowerDelivery", { n: `${deliveryQty} ${deliveryUnit(deliveryQty, unit, shownUnit, lang)}`.trim() })}
        </p>
      ) : null}
    </div>
  );
}

function tailorInitialFromProduct(product, qty) {
  const bits = [
    product.sizeDesc || product.description || "",
    productSkuId(product) ? `Base SKU: ${productSkuId(product)}` : "",
    product.certifications || product.standard
      ? `Cert: ${product.certifications || product.standard}`
      : "",
  ].filter(Boolean);
  return {
    name: product.name || "",
    description: bits.join("\n"),
    qty: Math.max(1, Number(qty) || Number(orderMinimum(product)) || 1),
    image: productImageUrl(product),
    category: product.category || "",
    attachments: [],
    dimensions: Boolean(product.tailorSize),
  };
}

export function ProductActions({ product, onAdd, size = "card", qty: qtyProp, onQtyChange, hideQty = false, autoOpenTailor = false, tailorNonce = 0, tailorDimensions = false, disabled = false }) {
  const { t } = useLanguage();
  usePromo();
  const line = useCartLine(product.id);
  const minQty = Math.max(1, Number(product.moq) || 1);
  const [innerQty, setInnerQty] = useState(minQty);
  const controlled = qtyProp != null && typeof onQtyChange === "function";
  const qty = controlled ? qtyProp : innerQty;
  const priced = canDirectBuy(product);
  const count = line.qty || 0;
  const [tailorOpen, setTailorOpen] = useState(false);
  const [tailorNote, setTailorNote] = useState("");
  const [tailorInitial, setTailorInitial] = useState(null);

  useEffect(() => {
    if (!controlled) setInnerQty(minQty);
  }, [product.id, minQty, controlled]);

  useEffect(() => {
    if (!autoOpenTailor || !product?.tailorMade) return;
    setTailorInitial(tailorInitialFromProduct(product, qty));
    setTailorOpen(true);
  }, [autoOpenTailor, product?.id, product?.tailorMade]);

  useEffect(() => {
    if (!tailorNonce) return;
    const wide = window.matchMedia("(min-width: 1024px)").matches;
    if ((size === "bar" && wide) || (size === "detail" && !wide)) return;
    const base = tailorInitialFromProduct(product, qty);
    setTailorInitial(tailorDimensions ? { ...base, dimensions: true } : base);
    setTailorOpen(true);
  }, [tailorNonce, tailorDimensions]);

  function setQty(next) {
    const n = Math.floor(Number(next));
    const resolved = Number.isFinite(n) ? Math.max(0, n) : minQty;
    if (controlled) onQtyChange(resolved);
    else setInnerQty(resolved);
  }

  function fire(intent) {
    if (disabled || qty < minQty) return;
    const guestCartOk = intent === "quote-now" || intent === "buy-now" || intent === "quote" || intent === "buy";
    if (!guestCartOk && !requireBuyerAuth({ productId: product.id, intent, qty })) return;
    onAdd?.(product.id, intent, qty);
  }

  function openTailor() {
    setTailorInitial(tailorInitialFromProduct(product, qty));
    setTailorOpen(true);
  }

  function submitTailor(payload) {
    const result = addCustomLine({
      ...payload,
      tailorMade: true,
      baseProductId: product.id,
      baseProductNo: product.productNo || "",
    });
    if (!result.ok) return;
    setTailorNote(t("addedTailorToRfq"));
    window.setTimeout(() => setTailorNote(""), 2800);
  }

  const cartIntent = priced ? "buy" : "quote";
  const inBuy = line.intent === "buy";
  const inQuote = line.intent === "quote";
  const addLabel = (priced ? inBuy : inQuote) && count > 0
    ? t("addedCount", { n: count })
    : t("addToCart");
  const compactBtn = size !== "detail";
  const primaryClass = compactBtn ? `btn-primary ${ACTION_BTN}` : "btn-primary !px-5 !py-3 !text-sm w-full";
  const softClass = compactBtn
    ? `btn-soft !border-brand-600/50 !text-brand-700 ${ACTION_BTN}`
    : "btn-soft !border-brand-600/50 !text-brand-700 !px-5 !py-3 !text-sm w-full";
  const addClass = `${softClass} ${count > 0 ? "btn-added" : ""}`;

  const stepper = hideQty ? null : (
    <QtyStepper value={qty} min={minQty} unit={product.unit} onChange={setQty} size={size === "bar" ? "sticky" : size} t={t} deliveryQty={lowerDeliveryQty(product)} />
  );

  const primaryBtn = (
    <button
      type="button"
      className={`${primaryClass} disabled:opacity-40`}
      disabled={disabled}
      onClick={() => fire(priced ? "buy-now" : "quote-now")}
    >
      {priced ? t("buyNowAction") : t("requestNow")}
    </button>
  );
  const addBtn = (
    <button type="button" className={`${addClass} disabled:opacity-40`} disabled={disabled} onClick={() => fire(cartIntent)}>
      {addLabel}
    </button>
  );

  const textLinkClass = `font-semibold leading-snug text-brand-700 hover:text-brand-800 hover:underline disabled:opacity-40 ${
    compactBtn ? "text-[11px]" : "text-xs"
  }`;
  function column(control, hint, extra) {
    return (
      <div className="min-w-0 space-y-1 text-center">
        <div className="group/act">
          {hint ? <p className="buy-now-hint">{hint}</p> : null}
          {control}
        </div>
        {extra}
      </div>
    );
  }
  function textAction(label, hint, intent) {
    return (
      <div className="group/act">
        <p className="buy-now-hint">{hint}</p>
        <button type="button" className={textLinkClass} disabled={disabled} onClick={() => fire(intent)}>
          {label}
        </button>
      </div>
    );
  }

  const actionColumns = (
    <div className="grid grid-cols-2 items-start gap-2">
      {column(
        primaryBtn,
        priced ? t("buyNowLine") : t("quoteNowLine"),
        priced ? textAction(t("orRequestNow"), t("quoteNowWhatsappHint"), "quote-now") : null,
      )}
      {column(
        addBtn,
        t("cartLine"),
        priced ? textAction(t("addToQuoteRequest"), t("cartQuoteHint"), "quote") : null,
      )}
    </div>
  );

  const showTailorCta = Boolean(product.tailorMade);
  const tailorBtn = showTailorCta ? (
    <button
      type="button"
      className={
        size === "detail"
          ? "btn-primary mt-3 w-full !py-2.5 !text-sm"
          : `${softClass} ${compactBtn ? "col-span-2" : "w-full"}`
      }
      onClick={openTailor}
    >
      <span className="inline-flex items-center justify-center gap-1.5">
        <TickIcon className="h-3.5 w-3.5" />
        {t("tailorMadeCta")}
      </span>
    </button>
  ) : null;

  const tailorPanel =
    size === "detail" && showTailorCta ? (
      <div className="rounded-xl border border-brand-200 bg-brand-50 px-4 py-3">
        <p className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.08em] text-brand-800">
          <TickIcon className="h-3.5 w-3.5" />
          {t("tailorMadeBadge")}
        </p>
        <p className="mt-1 text-sm text-mute">{t("tailorMadeHint", { name: product.name })}</p>
        {tailorBtn}
      </div>
    ) : null;

  const buttons = (
    <div data-tour={size === "detail" ? undefined : "buy"} className={size === "detail" ? "space-y-2" : "space-y-1.5"}>
      {actionColumns}
      {size !== "detail" && size !== "bar" ? tailorBtn : null}
      {size === "bar" && tailorBtn ? <div className="grid grid-cols-1">{tailorBtn}</div> : null}
      {tailorNote ? <p className="text-[11px] font-medium text-brand-700">{tailorNote}</p> : null}
    </div>
  );

  const modal = (
    <CustomProductModal
      open={tailorOpen}
      baseProduct={product}
      initial={tailorInitial || tailorInitialFromProduct(product, qty)}
      onClose={() => setTailorOpen(false)}
      onSubmit={submitTailor}
    />
  );

  if (size === "bar") {
    return (
      <div className="space-y-2">
        {stepper}
        {actionColumns}
        {tailorBtn}
        {tailorNote ? <p className="text-[11px] font-medium text-brand-700">{tailorNote}</p> : null}
        {modal}
      </div>
    );
  }

  return (
    <div className={size === "detail" ? "space-y-3" : "space-y-2"}>
      {tailorPanel}
      {stepper}
      {buttons}
      {modal}
    </div>
  );
}

function useSelectedVariant(product, grouped) {
  useCatalogGroups();
  const group = grouped ? groupOf(product?.id) : null;
  const members = (group?.members || [])
    .map((member) => ({ ...member, product: getProduct(member.productId) }))
    .filter((member) => member.product && isBuyerVisible(member.product));
  const [selectedId, setSelectedId] = useState(product?.id || "");

  useEffect(() => {
    setSelectedId(product?.id || "");
  }, [product?.id]);

  const selected = members.find((member) => member.productId === selectedId)?.product || product;
  return { selected: selected || product, members, selectedId, setSelectedId };
}

function specGroupTitle(group, lang) {
  return lang === "zh" ? group.label : group.labelEn || group.label;
}

function isGenericCategoryTitle(label) {
  return /^(?:分類|Category)\s*\d+$/i.test(String(label || "").trim());
}

export function specSectionTitle(index, total, lang, optionLabel) {
  if (total >= 2) return lang === "zh" ? `分類 ${index + 1}` : `Category ${index + 1}`;
  return optionLabel;
}

const SPEC_ID_NAMES = {
  colour: ["顏色", "Colour"],
  "paving-colour": ["顏色", "Colour"],
  "mesh-size": ["尺寸", "Size"],
  "marble-size": ["尺寸", "Size"],
  "tile-size": ["尺寸", "Size"],
  "mosaic-size": ["尺寸", "Size"],
  "gypsum-size": ["尺寸", "Size"],
  "floor-size": ["尺寸", "Size"],
  "clad-size": ["尺寸", "Size"],
  "cover-size": ["尺寸", "Size"],
  "slab-size": ["尺寸", "Size"],
  "kerb-length": ["長度", "Length"],
  "cable-length": ["長度", "Length"],
  diameter: ["直徑", "Diameter"],
  "block-thickness": ["厚度", "Thickness"],
  "tile-series": ["系列", "Series"],
  "cover-series": ["系列", "Series"],
  "cover-kind": ["類型", "Type"],
  "marble-kind": ["系列", "Series"],
  "paint-name": ["系列", "Series"],
  "window-model": ["型號", "Model"],
  "cabin-model": ["型號", "Model"],
  "shoe-model": ["型號", "Model"],
  "tile-rating": ["防滑等級", "Slip rating"],
  "slip-rating": ["防滑等級", "Slip rating"],
  rating: ["防火等級", "Fire rating"],
  "cement-rating": ["防火等級", "Fire rating"],
  "gypsum-frr": ["耐火時效", "Fire rating"],
  "block-grade": ["等級", "Grade"],
  cabin: ["人數", "Occupancy"],
  "kerb-kind": ["種類", "Kind"],
  "aggregate-unit": ["單位", "Unit"],
  "aggregate-type": ["規格", "Spec"],
  "block-spec": ["規格", "Spec"],
  "pipe-kind": ["喉管", "Pipe"],
  "vinyl-type": ["類型", "Type"],
  "floor-type": ["類型", "Type"],
  "clad-type": ["類型", "Type"],
  "paint-kind": ["類型", "Type"],
  "dowel-kind": ["類型", "Type"],
  "floor-kind": ["類型", "Type"],
  "clad-kind": ["類型", "Type"],
  "cable-kind": ["類型", "Type"],
  "shoe-kind": ["類型", "Type"],
  "shoe-custom": ["自訂", "Custom"],
  "aggregate-kind": ["類型", "Type"],
  material: ["材料", "Material"],
};

function plainOptionLabels(options) {
  return (options || []).map(specOptionLabel).map((label) => String(label || "").trim()).filter((label) => label && !isCustomizeChoice(label));
}

function isSizeLabel(label) {
  return /\d/.test(label) && /(?:mm|cm|\bm\b|x|\*)/i.test(label);
}

function inferSpecName(group, lang) {
  const fixed = SPEC_ID_NAMES[group?.id];
  if (fixed) return lang === "zh" ? fixed[0] : fixed[1];
  const labels = plainOptionLabels(group?.options);
  if (!labels.length) return "";
  if (labels.every(isSizeLabel)) return lang === "zh" ? "尺寸" : "Size";
  if (labels.every((label) => /^R\d{1,2}$/i.test(label))) return lang === "zh" ? "防滑等級" : "Slip rating";
  if (labels.some((label) => /^(interior|exterior|floor)$/i.test(label))) return lang === "zh" ? "用途" : "Use";
  return "";
}

function groupHeading(group, index, total, lang, optionLabel) {
  const raw = specGroupTitle(group, lang);
  if (raw && !isGenericCategoryTitle(raw)) return localizeSpecText(raw, lang);
  return inferSpecName(group, lang) || specSectionTitle(index, total, lang, optionLabel);
}

export function sectionNameFromLabels(labels, { index = 0, total = 1, lang, optionLabel, allowSize = true } = {}) {
  const plain = (labels || []).map((label) => String(label || "").trim()).filter((label) => label && !isCustomizeChoice(label));
  if (allowSize && plain.length && plain.every(isSizeLabel)) return lang === "zh" ? "尺寸" : "Size";
  if (plain.length && plain.every((label) => /^[A-Z]{1,4}\d{2,4}$/i.test(label))) return lang === "zh" ? "型號" : "Model";
  if (plain.some((label) => /MKT-/i.test(label))) return lang === "zh" ? "型號" : "Model";
  if (plain.length && plain.every((label) => /^R\d{1,2}$/i.test(label))) return lang === "zh" ? "防滑等級" : "Slip rating";
  if (total >= 2 && plain.length && plain.every((label) => !/\d/.test(label) && label.length <= 24)) {
    return lang === "zh" ? "類型" : "Type";
  }
  return specSectionTitle(index, total, lang, optionLabel);
}

function preparedSpecGroups(groups) {
  return dropDrawingGroup(dropXpsGrade(mergeSlabCustomize(mergeVinylType(groups)))).filter(
    (group) => group?.field === "length" || (group?.options || []).length > 0
  );
}

function countVisibleSpecGroups(groups) {
  const shown = preparedSpecGroups(groups);
  const picked = Object.fromEntries(shown.map((group) => [group.id, group.field ? "" : specOptionKey(group.options?.[0])]));
  return shown.filter((group) => {
    if (group.field === "length") return true;
    const options = group.id === "kerb-length" ? sortLengthOptions(groupOptions(group, picked)) : groupOptions(group, picked);
    return options.length > 0;
  }).length;
}

function sectionPlan(product, members) {
  const specCount = countVisibleSpecGroups(product?.specGroups);
  const variantOn = members.length >= 2;
  const sizeOn = groupSizeChoices(members).length >= 2;
  const extra = (variantOn ? 1 : 0) + (sizeOn ? 1 : 0);
  return { specCount, extra, sectionTotal: specCount + extra };
}

const SPEC_OPTION_ZH = {
  "Customize Size": "自訂尺寸",
  Customize: "自訂",
  Orange: "橙色",
  Green: "綠色",
  Grey: "灰色",
  Red: "紅色",
  "Dark Grey": "深灰色",
  "Natural Concrete": "天然混凝土",
  "Normal Kerb": "普通路緣",
  "Edge Kerb (Terminate Kerb)": "邊路緣（收口路緣）",
  "Carbon Steel": "碳鋼",
  "Stainless Steel": "不銹鋼",
  "Mild Steel": "軟鋼",
  "Galvanized Steel": "鍍鋅鋼",
  "Customize Drawing Upload": "上載圖則",
  Single: "單人",
  Double: "雙人",
  Multiperson: "多人",
  Paint: "油漆",
  "Dowel Bar": "傳力桿",
  Interior: "室內",
  Exterior: "室外",
  Floor: "地台",
  "Multi-effect Functional Coating": "多效功能塗料",
  "Nano Waterproof": "納米防水",
  "Raised Access Floors": "架空地板",
  "All Steel OA Floor": "全鋼 OA 地板",
  "OA Microporous All Steel Overhead Floor": "OA 微孔全鋼架空地板",
  "OA Slots All Steel Network Floor": "OA 槽孔全鋼網絡地板",
  "Anti-Static Steel Floor": "防靜電鋼地板",
  "Aluminum Cladding": "鋁板飾面",
  "Aluminum mesh plate": "鋁網板",
  "Galvanized sheet": "鍍鋅板",
  "Shoe Washing Machines": "洗鞋機",
  Cable: "電線電纜",
  "Armoured power cables with LSHF sheathing": "低煙無鹵鎧裝電力電纜",
  "Armoured fire resistant power cables": "鎧裝耐火電力電纜",
  "Single core non-sheathed cables with LSHF crosslinked insulation": "低煙無鹵交聯單芯無護套電纜",
  "Single core fire resistant cables": "單芯耐火電纜",
  "0.6/1kV single core cable": "0.6/1kV 單芯電纜",
  Customization: "自訂顏色",
  "Standard Type for Disability": "無障礙標準型",
  "V3 single person cabin": "V3 單人艙",
  "V6 Double person cabin": "V6 雙人艙",
  "V8 Multiple person cabin": "V8 多人艙",
  "H3 single person cabin": "H3 單人艙",
  "H6 Double person cabin": "H6 雙人艙",
  "H8 Multiple person cabin": "H8 多人艙",
  "H10 Multiple person cabin": "H10 多人艙",
  "U3 single person cabin": "U3 單人艙",
  "U6 Double person cabin": "U6 雙人艙",
  "Archi+ Pietra Intonaco": "Archi+ 石紋灰泥",
  "Crystal Diamond Sand Paint": "水晶鑽石砂漆",
  "Nalan Starry Glitter Paint": "納蘭星空閃光漆",
  "Eggshell Wall Paint 3.0": "蛋殼牆漆 3.0",
  "Velvet Wall Paint": "絲絨牆漆",
  "Liquid Polish Paint": "液態拋光漆",
  "Elegance Spar Paint": "雅緻晶石漆",
  "Skin Texture Paint": "膚感肌理漆",
  "Microcement Paint": "微水泥漆",
  "Interior Latex Paint": "室內乳膠漆",
  "Waterborne Metallic Paint": "水性金屬漆",
  "Antileakage Waterproof Coating": "防滲防水塗料",
  "Matte Multicolored Art Paint": "啞光多彩藝術漆",
  "Venetian Plaster": "威尼斯灰泥",
  "Granite Stone Coating-A": "花崗岩石漆 A",
  "Liquid Stone Coating": "液態石塗料",
  "Granite Stone Coating-B": "花崗岩石漆 B",
  "Texture Series": "質感系列",
  "Exterior Latex Paint": "室外乳膠漆",
  "Natural Stone Paint": "天然石漆",
  "Mineral Sand Paint": "礦物砂漆",
  Microcement: "微水泥",
  "Epoxy Floor Paint": "環氧地台漆",
  "Waterproof Coating Series": "防水塗料系列",
  "Deodorant And Formaldehyde Removal Series": "除味除甲醛系列",
  "Waterproof And Heat Insulation Integration Coating": "防水隔熱一體塗料",
  "Resistant Emulsion Universal Paint": "耐候乳液通用漆",
  "Nano Waterproof Series": "納米防水系列",
  "Nano Rooftop Waterproof Coating": "納米天台防水塗料",
  "Calcium Sulphate OA Floor": "硫酸鈣 OA 地板",
  "Anti-Static Calcium Sulphate Floor": "防靜電硫酸鈣地板",
  "Anti-Static Ceramic Finish Floor": "防靜電瓷面地板",
  "GRC Inorganic Floor": "GRC 無機地板",
  "Glass Raised Floor": "玻璃架空地板",
  "Anti-Static Aluminum Floor": "防靜電鋁地板",
  "All Steel Anti Static Ventilation Floor": "全鋼防靜電通風地板",
  "Fluorocarbon aluminum single plate": "氟碳鋁單板",
  "Wood-grain aluminum single panel": "木紋鋁單板",
  "Alumina single plate": "氧化鋁單板",
  "Irregular-shaped aluminum single plate": "異形鋁單板",
  "Hollow carved board": "鏤空雕刻板",
  "Perforated aluminum plate": "衝孔鋁板",
  "Aluminum-magnesium-zinc coated sheet": "鋁鎂鋅板",
  "Sound-proof aluminum plate": "隔音鋁板",
  "Insulated aluminum plate": "保溫鋁板",
  "Honeycomb panel series": "蜂窩板系列",
  "Corrugated board series": "瓦楞板系列",
  "A1 Non-combustible": "A1 不燃",
  "1 hr FRR": "1 小時耐火",
  "2 hr FRR": "2 小時耐火",
  "4 hr FRR": "4 小時耐火",
  Aggregates: "石料",
  "Coarse Aggregate 5 mm": "粗骨料 5 mm",
  "Coarse Aggregate 10 mm": "粗骨料 10 mm",
  "Coarse Aggregate 20 mm": "粗骨料 20 mm",
  "Coarse Aggregate 40 mm": "粗骨料 40 mm",
  "Sub-base Type 1 — 5 mm": "底基層 Type 1 — 5 mm",
  "Sub-base Type 1 — 10 mm": "底基層 Type 1 — 10 mm",
  "Sub-base Type 1 — 20 mm": "底基層 Type 1 — 20 mm",
  "Sub-base Type 1 — 40 mm": "底基層 Type 1 — 40 mm",
  "Granular Fill — Type A": "粒料回填 Type A",
  "Granular Fill — Type B": "粒料回填 Type B",
  "Rockfill Grade 75": "填石 Grade 75",
  "Rockfill Grade 200": "填石 Grade 200",
  "Rockfill Grade 400": "填石 Grade 400",
  "Rockfill Grade 700": "填石 Grade 700",
  Ton: "噸",
  Lot: "批",
  "Sample (Proctor)": "樣本（普氏）",
  "CI Pipe": "鑄鐵喉",
  "Copper Pipe": "銅喉",
  "DI Pipe": "球墨鑄鐵喉",
  "Galvanized Steel Pipe": "鍍鋅鋼喉",
  "HDPE Pipe": "高密度聚乙烯喉",
  "Mild Steel Pipe": "軟鋼喉",
  Pipe: "喉管",
  Joint: "接頭",
  Elbow: "彎頭",
  Flange: "法蘭",
  Tee: "三通",
  Valve: "閥門",
  Fittings: "配件",
  "Cast Iron Pipe": "鑄鐵喉管",
  "Cast Iron Joint": "鑄鐵接頭",
  "Cast Iron Elbow": "鑄鐵彎頭",
  "Cast Iron Flange": "鑄鐵法蘭",
  "Copper Alloy Elbow": "銅合金彎頭",
  "Copper Alloy Tee": "銅合金三通",
  "Copper Alloy Joint": "銅合金接頭",
  "Copper Alloy Valve": "銅合金閥門",
  "Ductile Iron Pipe": "球墨鑄鐵喉管",
  "Ductile Iron Elbow": "球墨鑄鐵彎頭",
  "Ductile Iron Tee": "球墨鑄鐵三通",
  "Ductile Iron Joint": "球墨鑄鐵接頭",
  "Ductile Iron Flange": "球墨鑄鐵法蘭",
  "Galvanized Steel Fittings": "鍍鋅鋼配件",
  "JC62 · Frame 29mm / Sash 72.6mm": "JC62 · 框 29mm／扇 72.6mm",
  "JC67 · Frame 29mm / Sash 72.6mm": "JC67 · 框 29mm／扇 72.6mm",
  "JC72 · Frame 29mm / Sash 72.6mm": "JC72 · 框 29mm／扇 72.6mm",
  "JC77 · Frame 29mm / Sash 77.6mm": "JC77 · 框 29mm／扇 77.6mm",
  "JC82 · Frame 29mm / Sash 70.6mm": "JC82 · 框 29mm／扇 70.6mm",
  "JC92 · Frame 34mm / Sash 72.6mm": "JC92 · 框 34mm／扇 72.6mm",
  "JC102 · Frame 39mm / Sash 82.6mm": "JC102 · 框 39mm／扇 82.6mm",
  "PU85 · Frame 32mm / Sash 70mm": "PU85 · 框 32mm／扇 70mm",
  "JC82X · Frame 60mm / Sash 22.5mm": "JC82X · 框 60mm／扇 22.5mm",
  "JC90X · Frame 60mm / Sash 22.5mm": "JC90X · 框 60mm／扇 22.5mm",
  "The Divine Light Series": "神光系列",
  "Kun Lun Marble Design Series": "崑崙大理石系列",
  "Marble Design Series": "大理石紋系列",
  "Textrue · Sintered Stone": "質感燒結石",
  "Artisitc background": "藝術背景",
  "Truncated Domes": "圓點",
  "Directional Bars": "導向條",
  "Luxury Vinyl Tiles (LVT)": "豪華乙烯基地磚",
  "Vinyl Roll": "卷材",
  "Homogenous Vinyl": "同質膠地板",
  "Heterogeneous Vinyl": "異質膠地板",
  "<5 cm": "小於 5 cm",
};

function specOptionLabel(option) {
  if (option && typeof option === "object") return String(option.label || "");
  return String(option || "");
}

function specOptionKey(option) {
  if (option && typeof option === "object") return String(option.key || option.label || "");
  return String(option || "");
}

function specOptionImage(option) {
  if (option && typeof option === "object") return String(option.image || "");
  return "";
}

function specOptionText(option, lang) {
  const label = specOptionLabel(option);
  if (isCustomizeChoice(label)) return lang === "zh" ? "自訂規格" : "Custom spec";
  if (lang === "zh" && SPEC_OPTION_ZH[label]) return SPEC_OPTION_ZH[label];
  return label;
}

function customizeHint(lang) {
  return lang === "zh" ? "如有需要，可上載圖則" : "Upload a drawing if needed";
}

function CustomizeChipLabel({ lang }) {
  return lang === "zh" ? "自訂規格 · 圖則" : "Custom spec · Drawing";
}

function mergeVinylType(groups) {
  const list = Array.isArray(groups) ? groups : [];
  const homo = list.find((group) => group?.id === "vinyl-homo");
  const hetero = list.find((group) => group?.id === "vinyl-hetero");
  if (!homo || !hetero) return list;
  const merged = {
    id: "vinyl-type",
    label: "分類 1",
    labelEn: "Category 1",
    options: [...(homo.options || []), ...(hetero.options || [])],
  };
  const next = [];
  let placed = false;
  for (const group of list) {
    if (group?.id === "vinyl-homo" || group?.id === "vinyl-hetero") {
      if (!placed) {
        next.push(merged);
        placed = true;
      }
      continue;
    }
    next.push(group);
  }
  return next;
}

function dropDrawingGroup(groups) {
  const list = Array.isArray(groups) ? groups : [];
  return list.filter((group) => {
    const options = group?.options || [];
    if (!options.length) return true;
    return !options.every((option) => /drawing upload/i.test(specOptionLabel(option)));
  });
}

function dropXpsGrade(groups) {
  const list = Array.isArray(groups) ? groups : [];
  if (!list.some((group) => group?.id === "xps-grade")) return list;
  return list.filter((group) => group?.id !== "xps-grade");
}

function mergeSlabCustomize(groups) {
  const list = Array.isArray(groups) ? groups : [];
  const size = list.find((group) => group?.id === "slab-size");
  const custom = list.find((group) => group?.id === "slabs-custom");
  if (!size || !custom) return list;
  const options = [...(size.options || [])];
  if (!options.some((option) => isCustomizeChoice(specOptionLabel(option)))) options.push("Customize");
  return list
    .filter((group) => group?.id !== "slabs-custom")
    .map((group) => (group?.id === "slab-size" ? { ...group, options } : group));
}

function sortLengthOptions(options) {
  const rank = (option) => {
    const match = specOptionLabel(option).trim().match(/^(\d+(?:\.\d+)?)\s*m$/i);
    return match ? Number(match[1]) : null;
  };
  const sized = [];
  const custom = [];
  const rest = [];
  for (const option of options || []) {
    if (isCustomizeChoice(specOptionLabel(option))) custom.push(option);
    else if (rank(option) != null) sized.push(option);
    else rest.push(option);
  }
  sized.sort((a, b) => rank(a) - rank(b));
  return [...sized, ...rest, ...custom];
}

function groupOptions(group, picked) {
  const options = group?.options || [];
  if (!group?.dependsOn) return options;
  const parent = picked?.[group.dependsOn];
  return options.filter((option) => !option?.parent || option.parent === parent);
}

export function SpecGroupPicker({ groups, className = "", onCustomize, onImage, onPick, compact = false, moreHref = "", extraSections = 0, onVisibleCount }) {
  const { lang, t } = useLanguage();
  const shown = dropDrawingGroup(dropXpsGrade(mergeSlabCustomize(mergeVinylType(groups))));
  const [picked, setPicked] = useState(() =>
    Object.fromEntries((shown || []).map((group) => [group.id, group.field ? "" : specOptionKey(group.options?.[0])]))
  );
  useEffect(() => {
    setPicked((current) => {
      const next = { ...current };
      let changed = false;
      for (const group of shown || []) {
        if (group.field === "length") continue;
        const keys = groupOptions(group, next).map(specOptionKey).filter(Boolean);
        const selected = keys.includes(next[group.id]) ? next[group.id] : keys[0] || "";
        if (selected !== next[group.id]) {
          next[group.id] = selected;
          changed = true;
        }
      }
      return changed ? next : current;
    });
  }, [shown, picked]);
  useEffect(() => {
    onPick?.(picked);
  }, [onPick, picked]);
  useEffect(() => {
    for (const group of shown || []) {
      const option = groupOptions(group, picked).find((item) => specOptionKey(item) === picked[group.id]);
      const image = specOptionImage(option);
      if (image) {
        onImage?.(image);
        return;
      }
    }
  }, [shown, onImage, picked]);
  const visible = (shown || []).filter((group) => {
    if (group.field === "length") return true;
    const options = group.id === "kerb-length" ? sortLengthOptions(groupOptions(group, picked)) : groupOptions(group, picked);
    return options.length > 0;
  });
  if (!visible.length) return null;
  const total = visible.length + extraSections;
  const chipClass = (on) =>
    `w-fit max-w-full rounded-none border text-left ${
      compact ? "px-2.5 py-1 text-xs" : "px-3 py-1.5 text-sm"
    } ${
      on
        ? "border-brand-700 bg-brand-50 font-semibold text-brand-800"
        : "border-line bg-white text-ink hover:border-brand-400"
    }`;
  return (
    <div data-tour="specs" className={`space-y-4 ${className}`}>
      {visible.map((group, index) => {
        const options = group.field === "length" ? [] : group.id === "kerb-length" ? sortLengthOptions(groupOptions(group, picked)) : groupOptions(group, picked);
        const named = groupHeading(group, index, total, lang, t("variantOption"));
        return (
        <div key={group.id}>
          <p className={`font-semibold text-ink ${compact ? "text-xs" : "text-sm"}`}>{named}</p>
          {group.field === "length" ? (
            <label className="mt-2 flex items-center gap-2">
              <input
                type="number"
                min="0"
                inputMode="decimal"
                value={picked[group.id] || ""}
                onChange={(event) => setPicked((current) => ({ ...current, [group.id]: event.target.value }))}
                className={`field-input ${compact ? "w-20 px-2 py-1 text-xs" : "w-24"}`}
                aria-label={named}
              />
              <span className={`text-ink ${compact ? "text-xs" : "text-sm"}`}>{group.unit || "m"}</span>
            </label>
          ) : (
          <div className={`mt-2 items-start ${compact ? "flex flex-col gap-1.5" : "flex flex-wrap gap-2"}`}>
            {(() => {
              const pickedKey = String(picked[group.id] || "");
              const selectedOption = options.find((option) => specOptionKey(option) === pickedKey) || options[0];
              const overflow = compact && options.length > 3;
              const visible = overflow
                ? [selectedOption, options.find((option) => option !== selectedOption)].filter(Boolean)
                : options;
              return (
                <>
                  {visible.map((option) => {
                    const label = specOptionLabel(option);
                    const key = specOptionKey(option);
                    const customize = isCustomizeChoice(label);
                    return (
                      <button
                        key={key}
                        type="button"
                        aria-pressed={pickedKey === key}
                        title={customize ? customizeHint(lang) : undefined}
                        onClick={() => {
                          setPicked((current) => ({ ...current, [group.id]: key }));
                          if (!customize) return;
                          onCustomize?.(group.id === "slab-size" ? { dimensions: true } : undefined);
                        }}
                        className={chipClass(pickedKey === key)}
                      >
                        {customize ? (
                          <CustomizeChipLabel lang={lang} compact={compact} on={pickedKey === key} />
                        ) : (
                          specOptionText(option, lang)
                        )}
                      </button>
                    );
                  })}
                  {overflow && moreHref ? (
                    <Link to={moreHref} className={chipClass(false)}>
                      {t("moreOptions", { n: options.length - visible.length })}
                    </Link>
                  ) : null}
                </>
              );
            })()}
          </div>
          )}
        </div>
        );
      })}
    </div>
  );
}

function isCustomizeChoice(label) {
  return /^(customize|customization|customize size|customize drawing upload)$/i.test(String(label || "").trim());
}

export function SizeChoicePicker({ choices, className = "", onCustomize, compact = false, title = "" }) {
  const { lang } = useLanguage();
  const key = (choices || []).join("\n");
  const [picked, setPicked] = useState(() => (choices || [])[0] || "");
  useEffect(() => {
    const list = key ? key.split("\n") : [];
    setPicked((current) => (list.includes(current) ? current : list[0] || ""));
  }, [key]);
  const list = key ? key.split("\n") : [];
  if (list.length < 2) return null;
  const chipClass = (on) =>
    `w-fit max-w-full rounded-none border text-left ${
      compact ? "px-2.5 py-1 text-xs" : "px-3 py-1.5 text-sm"
    } ${
      on
        ? "border-brand-700 bg-brand-50 font-semibold text-brand-800"
        : "border-line bg-white text-ink hover:border-brand-400"
    }`;
  return (
    <div className={className}>
      <p className={`font-semibold text-ink ${compact ? "text-xs" : "text-sm"}`}>{title}</p>
      <div className={`mt-2 items-start ${compact ? "flex flex-col gap-1.5" : "flex flex-wrap gap-2"}`}>
        {list.map((choice) => {
          const on = picked === choice;
          return (
            <button
              key={choice}
              type="button"
              aria-pressed={on}
              title={isCustomizeChoice(choice) ? customizeHint(lang) : undefined}
              onClick={() => {
                setPicked(choice);
                if (isCustomizeChoice(choice)) onCustomize?.();
              }}
              className={chipClass(on)}
            >
              {isCustomizeChoice(choice) ? (
                <CustomizeChipLabel lang={lang} compact={compact} on={on} />
              ) : (
                specOptionText(choice, lang)
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ModelAndSizeSpecs({ members, selectedId, onSelect, moreHref, moreLabel, onCustomize, compact = false, sectionOffset = 0, sectionTotal = 0 }) {
  const { lang, t } = useLanguage();
  const sizes = groupSizeChoices(members);
  const showVariants = members.length >= 2;
  const showSizes = sizes.length >= 2;
  if (!showVariants && !showSizes) return null;
  const prefix = showVariants ? sharedOptionPrefix(optionLabels(members)) : "";
  const own = (showVariants ? 1 : 0) + (showSizes ? 1 : 0);
  const total = sectionTotal || sectionOffset + own;
  const variantLabels = showVariants ? optionLabels(members).map((label) => stripOptionPrefix(label, prefix)) : [];
  const variantHeading = (prefix ? localizeSpecText(prefix, lang) : "") || sectionNameFromLabels(variantLabels, {
    index: sectionOffset,
    total,
    lang,
    optionLabel: t("variantOption"),
    allowSize: !showSizes,
  });
  const sizeHeading = lang === "zh" ? "尺寸" : "Size";
  return (
    <>
      {showVariants ? (
        <>
          <p className={`mt-3 font-semibold text-ink ${compact ? "text-xs" : "text-sm"}`}>{variantHeading}</p>
          <VariantChips
            members={members}
            selectedId={selectedId}
            onSelect={onSelect}
            moreHref={moreHref}
            moreLabel={moreLabel}
            prefix={prefix}
          />
        </>
      ) : null}
      {showSizes ? (
        <SizeChoicePicker choices={sizes} compact={compact} className="mt-3" onCustomize={onCustomize} title={sizeHeading} />
      ) : null}
    </>
  );
}

function VariantChips({ members, selectedId, onSelect, moreHref, moreLabel, prefix = "" }) {
  const { lang } = useLanguage();
  if (members.length < 2) return null;
  const overflow = members.length > 3;
  const selected = members.find((member) => member.productId === selectedId) || members[0];
  const rest = overflow ? members.filter((member) => member.productId !== selected.productId) : [];
  const visible = overflow ? [selected, rest[0]].filter(Boolean) : members;
  const labels = optionLabels(members);
  const labelOf = new Map(members.map((member, index) => [member.productId, localizeSpecText(stripOptionPrefix(labels[index], prefix), lang)]));
  const chipClass = (on) =>
    `w-fit max-w-full rounded-none border px-2.5 py-1 text-left text-xs ${
      on ? "border-brand-700 bg-brand-50 font-semibold text-brand-800" : "border-line bg-white text-ink hover:border-brand-400"
    }`;
  return (
    <div data-tour="specs" className="mt-2 flex flex-col items-start gap-1.5">
      {visible.map((member) => {
        const on = member.productId === selectedId;
        return (
          <button key={member.productId} type="button" aria-pressed={on} onClick={() => onSelect(member.productId)} className={chipClass(on)}>
            {labelOf.get(member.productId)}
          </button>
        );
      })}
      {overflow ? (
        <Link to={moreHref} className={chipClass(false)}>
          {moreLabel}
        </Link>
      ) : null}
    </div>
  );
}

export const ProductListRow = memo(function ProductListRow({ product, onAdd, grouped = false }) {
  const { t, lang } = useLanguage();
  const { selected, members, selectedId, setSelectedId } = useSelectedVariant(product, grouped);
  const [tailorNonce, setTailorNonce] = useState(0);
  const [tailorDimensions, setTailorDimensions] = useState(false);
  function openTailor(mode) {
    setTailorDimensions(Boolean(mode?.dimensions));
    setTailorNonce((n) => n + 1);
  }
  const [specImage, setSpecImage] = useState("");
  const label = shopTitle(selected, lang);
  const sections = sectionPlan(selected, members);

  return (
    <article className="catalog-row relative flex min-w-0 max-w-full flex-col gap-4 border border-line bg-white p-4 sm:flex-row sm:items-start sm:gap-6">
      <div className="flex min-w-0 gap-4 sm:contents">
        <Link
          to={withLocale(lang, `/details/${selected.id}`)}
          className="relative block h-24 w-24 shrink-0 overflow-hidden bg-brand-50 sm:h-32 sm:w-32"
        >
          <ProductImage
            src={specImage || selected.image}
            fallback={selected.imageFallback}
            alt={label}
            compact
            className="h-full w-full"
            imgClassName="h-full w-full object-cover"
          />
        </Link>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-brand-600">
            <Link
              to={withLocale(lang, catalogPathForCategory(selected.category))}
              className="hover:text-brand-800 hover:underline"
            >
              {selected.category}
            </Link>
          </p>
          <h3 className="mt-1 break-words text-sm font-semibold leading-snug text-ink sm:text-base">
            <Link to={withLocale(lang, `/details/${selected.id}`)} className="hover:text-brand-600">
              {label}
            </Link>
          </h3>
          <p className="mt-1 truncate text-xs text-mute">
            {t("productNo")} {productSkuId(selected) || selected.id}
            {selected.supplier ? ` · ${t("by")} ${supplierDisplayName(selected.supplier)}` : ""}
          </p>
          <div className="mt-1 sm:hidden">
            <ProductPrice product={selected} className="!mt-0" />
          </div>
          {selected.specGroups?.length ? (
            <SpecGroupPicker groups={selected.specGroups} className="mt-3" compact moreHref={withLocale(lang, `/details/${selected.id}`)} onImage={setSpecImage} onCustomize={openTailor} extraSections={sections.extra} />
          ) : null}
          <ModelAndSizeSpecs
            members={members}
            selectedId={selectedId}
            onSelect={setSelectedId}
            moreHref={withLocale(lang, `/details/${selected.id}`)}
            moreLabel={t("moreOptions", { n: Math.max(members.length - 2, 0) })}
            onCustomize={openTailor}
            compact
            sectionOffset={sections.specCount}
            sectionTotal={sections.sectionTotal}
          />
          <ProductMetaChips product={selected} showTags className="mt-2" />
        </div>
      </div>
      <div className="hidden shrink-0 self-start sm:block sm:w-32">
        <ProductPrice product={selected} className="!mt-0" />
      </div>
      <div className="min-w-0 self-start sm:w-60 sm:shrink-0">
        <ProductActions product={selected} onAdd={onAdd} size="row" tailorNonce={tailorNonce}
            tailorDimensions={tailorDimensions} />
      </div>
    </article>
  );
});

function ProductCard({ product, onAdd, rank = null, compact = false, grouped = false, showOfferEnded = false }) {
  const { t, lang } = useLanguage();
  const { selected, members, selectedId, setSelectedId } = useSelectedVariant(product, grouped);
  const [tailorNonce, setTailorNonce] = useState(0);
  const [tailorDimensions, setTailorDimensions] = useState(false);
  function openTailor(mode) {
    setTailorDimensions(Boolean(mode?.dimensions));
    setTailorNonce((n) => n + 1);
  }
  const [specImage, setSpecImage] = useState("");
  const supplierName = supplierDisplayName(selected.supplier);
  const label = shopTitle(selected, lang);
  const sections = sectionPlan(selected, members);

  return (
    <article className="product-tile relative flex h-full min-w-0 max-w-full flex-col overflow-visible">
      <ProductBadges product={selected} rank={selected.id === product.id ? rank : null} />
      <Link
        to={withLocale(lang, `/details/${selected.id}`)}
        className="block h-28 overflow-hidden bg-brand-50 min-[752px]:h-40 lg:aspect-[3/2] lg:h-auto"
      >
        <ProductImage
          src={specImage || selected.image}
          fallback={selected.imageFallback}
          alt={label}
          className="h-full w-full"
          imgClassName="w-full h-full object-cover transition-transform duration-500 ease-out hover:scale-[1.04]"
        />
      </Link>
      <div className={`flex flex-1 flex-col ${compact ? "p-2.5 min-[752px]:p-3" : "p-3 min-[752px]:p-3.5"}`}>
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-brand-600">
          <Link
            to={withLocale(lang, catalogPathForCategory(selected.category))}
            className="hover:text-brand-800 hover:underline"
          >
            {selected.category}
          </Link>
        </p>
        <h3 className={`mt-1 font-semibold text-ink leading-snug line-clamp-3 ${compact ? "text-sm" : "text-base"}`}>
          <Link to={withLocale(lang, `/details/${selected.id}`)} className="hover:text-brand-600 transition-colors">
            {label}
          </Link>
        </h3>
        <p className="mt-1 text-xs text-mute truncate">
          {t("by")}{" "}
          {selected.supplier ? (
            <Link to={withLocale(lang, supplierPath(selected.supplier))} className="hover:text-brand-600 hover:underline">
              {supplierName}
            </Link>
          ) : (
            t("subbiePartner")
          )}
        </p>
        <ProductRating product={selected} className="mt-1" />
        {selected.specGroups?.length ? (
          <SpecGroupPicker groups={selected.specGroups} className="mt-3" compact moreHref={withLocale(lang, `/details/${selected.id}`)} onImage={setSpecImage} onCustomize={openTailor} extraSections={sections.extra} />
        ) : null}
        <ModelAndSizeSpecs
          members={members}
          selectedId={selectedId}
          onSelect={setSelectedId}
          moreHref={withLocale(lang, `/details/${selected.id}`)}
          moreLabel={t("moreOptions", { n: Math.max(members.length - 2, 0) })}
          onCustomize={openTailor}
          compact
          sectionOffset={sections.specCount}
          sectionTotal={sections.sectionTotal}
        />
        <ProductMetaChips product={selected} className="mt-2.5" />
        <div className="mt-auto pt-3 min-[752px]:pt-4">
          <ProductPrice product={selected} className="!mt-0" showOfferEnded={showOfferEnded} />
          <div className="mt-2.5 min-[752px]:mt-3">
            <ProductActions product={selected} onAdd={onAdd} size="card" tailorNonce={tailorNonce}
            tailorDimensions={tailorDimensions} />
          </div>
        </div>
      </div>
    </article>
  );
}

export default memo(ProductCard);
