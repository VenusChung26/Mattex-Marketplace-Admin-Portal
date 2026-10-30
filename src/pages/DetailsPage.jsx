import { useState, useEffect, useRef } from "react";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import CopyLinkButton from "../components/CopyLinkButton";
import SiteHeader from "../components/SiteHeader";
import SiteFooter from "../components/SiteFooter";
import Seo, { breadcrumbJsonLd, orgJsonLd, productJsonLd } from "../components/Seo";
import ProductPrice from "../components/ProductPrice";
import ProductRating from "../components/ProductRating";
import { FallbackImage, ProductActions, ProductBadges, ProductImage, QtyStepper, SizeChoicePicker, SpecGroupPicker, sectionNameFromLabels } from "../components/ProductCard";
import CartToast from "../components/CartToast";
import { productImageList } from "../lib/compressImage";
import { buyerPurposes, displayUnit, isColorLabel, isLeadSpec, looksLikeSize, lowerDeliveryQty, pickedSpecFields, productImageUrl, specParts } from "../lib/productFields";
import { useStore } from "../hooks/useStore";
import { useLanguage } from "../i18n";
import { bootProduct } from "../lib/bootPage";
import { staffCertText, staffPrimaryText, staffRemarkText, staffSizeText } from "../lib/editedProductText";
import { groupOf, useCatalogGroups } from "../lib/catalogGroups";
import { groupSizeChoices, localizeSpecText, optionLabels, sharedOptionPrefix, shopTitle, stripOptionPrefix } from "../lib/catalogGroup";
import { allProductsTo, siteOrigin, withLocale } from "../lib/locale";
import { seoCopy } from "../lib/seoCopy";
import { usePromo } from "../lib/promo";
import {
  addFromStorefront,
  blockProductOrders,
  canDirectBuy,
  fetchProductLive,
  isProductOrderBlocked,
  catalogPathForCategory,
  displayLeadTime,
  getEffectivePrice,
  getProduct,
  isBuyerVisible,
  productSkuId,
  productDescriptionText,
  specificationRows,
  stockStatusKey,
  supplierDisplayName,
  supplierPath,
} from "../lib/store";

function BackToCatalog({ product }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { t, lang } = useLanguage();
  return (
    <button
      type="button"
      className="btn-soft !px-5 !py-3"
      onClick={() => {
        if (location.key !== "default") {
          navigate(-1);
          return;
        }
        navigate(withLocale(lang, catalogPathForCategory(product.category)));
      }}
    >
      {t("backToCatalog")}
    </button>
  );
}

const STOCK_TONE = {
  in_stock: "bg-brand-50 text-brand-800",
  limited: "bg-[#fbf3e4] text-[#8a5a12]",
  made_to_order: "bg-paper text-ink",
  out_of_stock: "bg-[#f8e8e8] text-[#8a2b2b]",
};

function DetailLine({ label, children, className = "" }) {
  return (
    <div className={`col-span-2 grid-cols-subgrid items-start border-t border-line py-2.5 ${className || "grid"}`}>
      <dt className="text-left text-sm text-mute">{label}</dt>
      <dd className="min-w-0 text-left text-sm font-medium leading-relaxed text-ink">{children}</dd>
    </div>
  );
}

export default function DetailsPage() {
  const { id } = useParams();
  const [params, setSearchParams] = useSearchParams();
  useStore();
  useCatalogGroups();
  const product = getProduct(id) || bootProduct(id);
  const group = groupOf(product?.id);
  const variantOptions = (group?.members || [])
    .map((member) => ({ ...member, product: getProduct(member.productId) }))
    .filter((member) => member.product && isBuyerVisible(member.product));
  const sizeChoices = groupSizeChoices(variantOptions);
  const offline = Boolean(product && isProductOrderBlocked(product.id));
  const orderLock = useRef(false);
  const { t, lang } = useLanguage();
  usePromo();
  const [qty, setQty] = useState(1);
  const [pickedSpecs, setPickedSpecs] = useState(null);
  const pickedFields = pickedSpecFields(product?.specGroups, pickedSpecs || {}, product?.specChoices);
  const orderMoq = Math.max(1, Number(pickedFields.moq != null && pickedFields.moq !== "" ? pickedFields.moq : product?.moq) || 1);
  useEffect(() => {
    setQty((current) => (current < orderMoq ? orderMoq : current));
  }, [orderMoq, product?.id]);
  const [tailorNonce, setTailorNonce] = useState(0);
  const [tailorDimensions, setTailorDimensions] = useState(false);
  function openTailor(mode) {
    setTailorDimensions(Boolean(mode?.dimensions));
    setTailorNonce((n) => n + 1);
  }
  const [toast, setToast] = useState(null);
  const autoOpenTailor = params.get("tailor") === "1";
  const gallery = productImageList(product);
  const [activeImage, setActiveImage] = useState(gallery[0] || product?.image || "");

  useEffect(() => {
    setPickedSpecs(null);
    setQty(product?.moq || 1);
    const next = productImageList(product);
    setActiveImage(next[0] || product?.image || "");
  }, [product?.id, product?.moq, product?.image, product?.images]);

  useEffect(() => {
    if (params.get("tailor") !== "1") return;
    const next = new URLSearchParams(params);
    next.delete("tailor");
    setSearchParams(next, { replace: true });
  }, [params, setSearchParams]);

  if (!product || !isBuyerVisible(product)) {
    return (
      <div className="bg-paper min-h-screen">
        <SiteHeader />
        <main className="max-w-7xl mx-auto px-4 py-10">
          <div className="bg-white border border-line rounded-xl p-8 text-center">
            <h1 className="reveal text-xl font-bold text-brand-800">{t("productNotFound")}</h1>
            <p className="mt-2 text-sm text-mute">{t("productNotFoundHint")}</p>
            <Link to={allProductsTo(lang)} className="btn-primary mt-5 inline-flex">
              {t("browseCatalog")}
            </Link>
          </div>
        </main>
      </div>
    );
  }

  const discontinued = Boolean(product.discontinued);
  const priced = !discontinued && canDirectBuy(product);
  const priceStatus = getEffectivePrice(product).status;
  const priceHint =
    priceStatus === "quoted"
      ? `${t("quotedBuyHint")} ${t("requestQuoteHint")}`
      : priceStatus === "expired-requote"
        ? t("quotedPriceExpiredRequote")
        : priced
          ? t("requestQuoteHint")
          : t("requestQuoteOnlyHint");
  const viewProduct = {
    ...product,
    specs: pickedFields.specs || product.specs,
    moq: pickedFields.moq != null && pickedFields.moq !== "" ? pickedFields.moq : product.moq,
    unit: pickedFields.unit || product.unit,
    salesUnit: pickedFields.unit || product.salesUnit,
    leadTime: pickedFields.leadTime || product.leadTime,
    leadTimeLabel: pickedFields.leadTimeLabel || (pickedFields.leadTime ? "" : product.leadTimeLabel),
  };
  const minQty = orderMoq;
  const leadTime = displayLeadTime(viewProduct, lang) || "—";
  const unitLabel = displayUnit(viewProduct.unit || viewProduct.salesUnit, lang);
  const pickedDetail = pickedFields.detail;
  const pickedSize = pickedDetail && looksLikeSize(pickedDetail) ? pickedDetail : "";
  const description = pickedFields.summary || (pickedDetail && !pickedSize ? pickedDetail : "") || productDescriptionText(product);
  const facts = [
    { label: t("productNo"), value: pickedFields.sku || productSkuId(viewProduct) || product.id.toUpperCase() },
    {
      label: t("stockStatus"),
      value: discontinued ? t("discontinued") : t(stockStatusKey(product.stockStatus)),
      pill: true,
      tone: discontinued ? "bg-[#f8e8e8] text-[#8a2b2b]" : STOCK_TONE[product.stockStatus] || STOCK_TONE.in_stock,
    },
    { label: t("moq"), value: `${viewProduct.moq} ${unitLabel}`.trim() },
    unitLabel ? { label: t("salesUnit"), value: unitLabel } : null,
    { label: t("leadTime"), value: leadTime },
    { label: t("standard"), value: staffCertText(product) || product.standard },
  ].filter(Boolean);
  const sizeText = staffSizeText(product);
  const shownSizeText = pickedFields.summary && pickedDetail
    ? pickedDetail
    : pickedSize
      ? pickedSize
      : sizeText && !isColorLabel(sizeText)
        ? sizeText
        : "";
  const primaryText = staffPrimaryText(product);
  const remarkText = staffRemarkText(product);
  const specRows = specificationRows(viewProduct)
    .filter((row) => row.kind === "cert" || !isLeadSpec(row.text))
    .map((row) => {
      if (row.kind === "cert") return { key: "cert", label: t("cert"), value: row.lines };
      const parts = specParts(row.text, lang);
      return { key: row.text, label: parts.label, value: parts.value };
    })
    .filter((row) => {
      const sizeLabel = lang === "zh" ? "尺寸" : "Size";
      return !(row.label === sizeLabel && isColorLabel(row.value));
    });
  if (pickedDetail) {
    const sizeLabel = lang === "zh" ? "尺寸" : "Size";
    const index = specRows.findIndex((row) => row.label === sizeLabel);
    const next = { key: `detail:${pickedDetail}`, label: sizeLabel, value: pickedDetail };
    if (index >= 0) specRows[index] = next;
    else specRows.unshift(next);
  }

  const purposes = buyerPurposes(product, lang);

  async function goToRfq(intent, nextQty = qty) {
    if (orderLock.current || offline) return;
    orderLock.current = true;
    try {
      const live = await fetchProductLive(product.id);
      if (!live) {
        blockProductOrders(product.id);
        return;
      }
      const sendQty = Math.max(minQty, Math.floor(Number(nextQty)) || minQty);
      const result = addFromStorefront(product.id, intent, sendQty, lang);
      if (result?.ok && intent !== "quote-now" && intent !== "buy-now") {
        setToast({
          message: t(intent === "buy" ? "addedBuyToRfq" : "addedQuoteToRfq"),
          href: withLocale(lang, "/rfq"),
        });
      }
    } finally {
      orderLock.current = false;
    }
  }

  const origin = siteOrigin();
  const copy = seoCopy(lang);
  const path = withLocale(lang, `/details/${product.id}`);

  return (
    <div className="bg-paper min-h-screen pb-44 lg:pb-0">
      <Seo
        lang={lang}
        path={path}
        title={copy.productTitle(shopTitle(product))}
        description={copy.productDesc(product)}
        image={productImageUrl(product) || "/og-default.webp"}
        ogType="product"
        jsonLd={[
          orgJsonLd(origin),
          productJsonLd(origin, product, lang),
          breadcrumbJsonLd(origin, [
            { name: "Mattex Marketplace", path: withLocale(lang, "/") },
            { name: t("catalog"), path: withLocale(lang, "/") },
            { name: shopTitle(product), path },
          ]),
        ]}
      />
      <SiteHeader />

      <main className="max-w-7xl mx-auto px-4 py-8 sm:py-10">
        <nav className="mb-5 text-sm text-mute">
          <Link to={allProductsTo(lang)} className="hover:text-brand-600">
            {t("catalog")}
          </Link>
          <span className="mx-2 text-line">/</span>
          <Link to={`${withLocale(lang, catalogPathForCategory(product.category))}#catalog-top`} className="relative z-10 hover:text-brand-600">
            {product.category}
          </Link>
        </nav>

        <div className="grid lg:grid-cols-2 gap-8 lg:gap-12">
          <div className="relative self-start w-full overflow-hidden rounded-xl border border-line bg-brand-50 lg:sticky lg:top-28">
            <ProductBadges product={product} />
            <ProductImage
              src={activeImage || productImageUrl(product)}
              fallback={activeImage === product.image ? product.imageFallback : ""}
              alt={shopTitle(product)}
              className="block w-full"
              imgClassName="block w-full h-auto"
            />
            {gallery.length > 1 ? (
              <div className="flex gap-2 overflow-x-auto bg-white border-t border-line px-3 py-2">
                {gallery.map((src) => (
                  <button
                    key={src}
                    type="button"
                    className={`h-14 w-14 shrink-0 overflow-hidden border ${
                      src === activeImage ? "border-brand-600" : "border-line"
                    }`}
                    onClick={() => setActiveImage(src)}
                  >
                    <FallbackImage
                      src={src}
                      fallback={src === product.image ? product.imageFallback : ""}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  </button>
                ))}
              </div>
            ) : null}
            <p className="px-3 py-2 text-[11px] leading-snug text-mute bg-white border-t border-line">
              {t("specSubjectToQuote")}
            </p>
          </div>

          <div className="reveal">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-600">
                <Link to={`${withLocale(lang, catalogPathForCategory(product.category))}#catalog-top`} className="relative z-10 hover:underline">
                  {product.category}
                </Link>
              </p>
              <CopyLinkButton path={path} />
            </div>
            <h1 className="mt-2 font-display text-3xl sm:text-4xl font-semibold text-brand-800 leading-tight">
              {shopTitle(product, lang)}
            </h1>
            {product.green ? (
              <p className="mt-4 border border-[#cfe6d6] bg-[#f4faf6] px-3 py-3 text-sm leading-relaxed text-ink">
                <span className="font-semibold text-[#1f8a45]">{t("greenBadge")}</span>
                {" · "}
                {t("greenDetailNote")}
                <Link to={withLocale(lang, "/green")} className="mt-1 block font-semibold text-brand-700 hover:underline">
                  {t("shopAllGreen")}
                </Link>
              </p>
            ) : null}
            {product.specGroups?.length ? (
              <SpecGroupPicker groups={product.specGroups} className="mt-4" onImage={setActiveImage} onPick={setPickedSpecs} onCustomize={openTailor} />
            ) : variantOptions.length > 1 ? (
              <div className="mt-4 space-y-4">
                <div>
                  {(() => {
                    const rawLabels = optionLabels(variantOptions);
                    const prefix = sharedOptionPrefix(rawLabels);
                    const stripped = rawLabels.map((label) => stripOptionPrefix(label, prefix));
                    const labels = stripped.map((label) => localizeSpecText(label, lang));
                    const showSizes = sizeChoices.length >= 2;
                    const total = 1 + (showSizes ? 1 : 0);
                    const heading = (prefix ? localizeSpecText(prefix, lang) : "") || sectionNameFromLabels(stripped, {
                      index: 0,
                      total,
                      lang,
                      optionLabel: t("variantOption"),
                      allowSize: !showSizes,
                    });
                    return (
                      <>
                        <p className="text-sm font-semibold text-ink">{heading}</p>
                        <div className="mt-2 flex flex-wrap items-start gap-2">
                          {labels.map((label, index) => {
                            const member = variantOptions[index];
                            const selected = member.productId === product.id;
                            return (
                              <Link
                                key={member.productId}
                                to={withLocale(lang, `/details/${member.productId}`)}
                                aria-current={selected ? "true" : undefined}
                                className={`w-fit max-w-full rounded-none border px-3 py-1.5 text-left text-sm ${
                                  selected
                                    ? "border-brand-700 bg-brand-50 font-semibold text-brand-800"
                                    : "border-line bg-white text-ink hover:border-brand-400"
                                }`}
                              >
                                {label}
                              </Link>
                            );
                          })}
                        </div>
                      </>
                    );
                  })()}
                </div>
                {sizeChoices.length >= 2 ? (
                  <SizeChoicePicker choices={sizeChoices} onCustomize={openTailor} title={lang === "zh" ? "尺寸" : "Size"} />
                ) : null}
              </div>
            ) : null}
            {discontinued ? null : (
              <div className="mt-4 hidden lg:block">
                <QtyStepper
                  value={qty}
                  min={minQty}
                  unit={product.unit || product.salesUnit}
                  onChange={setQty}
                  size="detail"
                  t={t}
                  deliveryQty={lowerDeliveryQty(product)}
                />
              </div>
            )}
            <p className="mt-3 text-sm text-mute">
              {t("supplierLabel")}:{" "}
              {product.supplier ? (
                <Link
                  to={withLocale(lang, supplierPath(product.supplier))}
                  className="text-brand-600 hover:underline font-medium"
                >
                  {supplierDisplayName(product.supplier)}
                </Link>
              ) : (
                t("subbiePartner")
              )}
            </p>
            <ProductRating product={product} size="lg" className="mt-2" />
            <ProductPrice product={product} size="detail" />
            <div className="mt-4 hidden lg:block">
              {discontinued ? (
                <span className="inline-flex items-center bg-[#f8e8e8] text-[#8a2b2b] text-xs font-bold uppercase tracking-wide px-3 py-2">
                  {t("discontinued")}
                </span>
              ) : (
                <ProductActions
                  product={product}
                  qty={qty}
                  onQtyChange={setQty}
                  hideQty
                  disabled={offline}
                  onAdd={(_, intent, nextQty) => goToRfq(intent, nextQty)}
                  size="detail"
                  autoOpenTailor={autoOpenTailor}
                  tailorNonce={tailorNonce}
                  tailorDimensions={tailorDimensions}
                />
              )}
            </div>
            <p className="mt-3 text-xs text-mute leading-relaxed max-w-prose">
              {discontinued ? t("discontinuedHint") : priceHint}
            </p>
            {description ? (
              <>
                <h2 className="mt-8 text-sm font-semibold text-ink">{t("description")}</h2>
                <p className="mt-3 text-sm text-mute leading-relaxed">{description}</p>
              </>
            ) : null}
            {shownSizeText ? (
              <>
                <h2 className="mt-8 text-sm font-semibold text-ink">{lang === "zh" ? "尺寸／說明" : "Size / description"}</h2>
                <p className="mt-3 text-sm text-mute leading-relaxed whitespace-pre-line">{shownSizeText}</p>
              </>
            ) : null}
            {primaryText ? (
              <>
                <h2 className="mt-8 text-sm font-semibold text-ink">{lang === "zh" ? "主要規格" : "Primary spec"}</h2>
                <p className="mt-3 text-sm text-mute leading-relaxed whitespace-pre-line">{primaryText}</p>
              </>
            ) : null}

            <div className="mt-6 border-y border-line">
              <div className="grid grid-cols-[max-content_minmax(0,1fr)] gap-x-6">
                {specRows.length ? (
                  <h2 className="col-span-2 py-2.5 text-sm font-semibold text-ink">{t("specifications")}</h2>
                ) : null}
                {specRows.map((row) => (
                  <DetailLine key={row.key} label={row.label}>
                    {Array.isArray(row.value)
                      ? row.value.map((line) => (
                          <span key={line} className="block">
                            {line}
                          </span>
                        ))
                      : row.value}
                  </DetailLine>
                ))}
                <h2 className={`col-span-2 py-2.5 text-sm font-semibold text-ink ${specRows.length ? "border-t border-line" : ""}`}>
                  {t("orderDetails")}
                </h2>
                {facts.map((row) => (
                  <DetailLine key={row.label} label={row.label}>
                    {row.pill ? (
                      <span className={`inline-flex px-2 py-0.5 text-xs font-semibold ${row.tone}`}>{row.value}</span>
                    ) : (
                      row.value
                    )}
                  </DetailLine>
                ))}
              </div>
            </div>

            <div className="mt-4 hidden lg:block">
              <BackToCatalog product={product} />
            </div>

            {purposes.length ? (
              <>
                <h2 className="mt-8 text-sm font-semibold text-ink">{t("productPurposes")}</h2>
                <p className="mt-1 text-xs text-mute leading-relaxed">{t("productPurposesHint")}</p>
                <ul className="mt-3 flex flex-wrap gap-1.5">
                  {purposes.map((term) => (
                    <li key={term}>
                      <Link
                        to={withLocale(lang, {
                          pathname: "/",
                          search: `?q=${encodeURIComponent(term)}`,
                          hash: "#products",
                        })}
                        className="inline-flex border border-line bg-paper px-2 py-1 text-xs text-ink hover:border-brand-600 hover:text-brand-700"
                      >
                        {term}
                      </Link>
                    </li>
                  ))}
                </ul>
              </>
            ) : null}

            {remarkText ? (
              <>
                <h2 className="mt-8 text-sm font-semibold text-ink">{t("productRemark")}</h2>
                <p className="mt-3 text-sm text-mute leading-relaxed max-w-prose whitespace-pre-line">{remarkText}</p>
              </>
            ) : null}
          </div>
        </div>
      </main>

      <div className="hidden lg:block">
        <SiteFooter />
      </div>

      <div className="lg:hidden fixed bottom-0 inset-x-0 z-40 border-t border-line bg-white/95 backdrop-blur p-3">
        {discontinued ? (
          <p className="max-w-7xl mx-auto text-center text-xs font-semibold text-[#8a2b2b]">{t("discontinuedUnavailable")}</p>
        ) : (
          <div className="max-w-7xl mx-auto">
            <ProductActions
              product={product}
              qty={qty}
              onQtyChange={setQty}
              disabled={offline}
              onAdd={(_, intent, nextQty) => goToRfq(intent, nextQty)}
              size="bar"
              tailorNonce={tailorNonce}
              tailorDimensions={tailorDimensions}
            />
          </div>
        )}
      </div>
      <CartToast toast={toast} onDone={() => setToast(null)} />
    </div>
  );
}
