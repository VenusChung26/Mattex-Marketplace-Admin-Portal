import "./ssrNodePolyfill.js";
import { absAsset, absUrl, siteOrigin, stripLocale, withLocale } from "./locale.js";
import { OG_HEIGHT, OG_WIDTH, categoryOgPath, isSizedOgImage, ogImagePath } from "./ogImage.js";
import { buyerPurposes, displayUnit, isLeadSpec, localizeLeadTime, specParts, lowerDeliveryQty } from "./productFields.js";
import { seoCopy } from "./seoCopy.js";
import { breadcrumbJsonLd, orgJsonLd, productJsonLd } from "./seoJsonLd.js";
import {
  catalogPathForCategory,
  getCategoryBySlug,
  getCategoryDefs,
  getGreenProducts,
  getProduct,
  getProductsBySupplier,
  getSupplier,
  getSuppliers,
  getTopProducts,
  getTopProductsForSupplier,
  isBuyerVisible,
  isDiscontinued,
  searchProducts,
  productDescriptionText,
  specificationRows,
  supplierDisplayName,
  supplierPath,
} from "./store.js";

function esc(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/"/g, "&quot;");
}

function safeImage(src) {
  const value = String(src || "").trim();
  if (!value || value.startsWith("data:")) return "";
  return value;
}

function slimProduct(product) {
  if (!product) return null;
  return {
    id: product.id,
    name: product.name,
    productNo: product.productNo || "",
    sku: product.productNo || product.id,
    category: product.category || "",
    description: String(product.description || "").slice(0, 400),
    image: safeImage(product.image),
    tailorMade: Boolean(product.tailorMade),
    moq: product.moq || 1,
    unit: product.unit || "",
  };
}

export function parsePublicPath(pathname) {
  const raw = String(pathname || "").split("?")[0];
  const trimmed = raw.replace(/\/+$/, "") || "/";
  const parts = trimmed.split("/").filter(Boolean);
  const lang = parts[0] === "zh" || parts[0] === "en" ? parts[0] : null;
  if (!lang) return null;
  const rest = parts.slice(1);
  if (!rest.length) return { kind: "home", lang, path: withLocale(lang, "/") };
  if (rest[0] === "green" && rest.length === 1) {
    return { kind: "green", lang, path: withLocale(lang, "/green") };
  }
  if (rest[0] === "catalog" && rest[1] && rest.length === 2) {
    return { kind: "catalog", lang, slug: rest[1], path: withLocale(lang, `/catalog/${rest[1]}`) };
  }
  if (rest[0] === "details" && rest[1] && rest.length === 2) {
    return { kind: "details", lang, id: rest[1], path: withLocale(lang, `/details/${rest[1]}`) };
  }
  if (rest[0] === "supplier" && rest[1] && rest.length === 2) {
    return { kind: "supplier", lang, slug: rest[1], path: withLocale(lang, `/supplier/${rest[1]}`) };
  }
  return null;
}

function crumbs(origin, lang, items) {
  return breadcrumbJsonLd(
    origin,
    items.map((item) => ({ name: item.name, path: withLocale(lang, item.path) }))
  );
}

export function resolvePublicPage(pathname, origin = siteOrigin()) {
  const parsed = parsePublicPath(pathname);
  if (!parsed) return null;
  const copy = seoCopy(parsed.lang);
  const base = {
    kind: parsed.kind,
    lang: parsed.lang,
    path: parsed.path,
    ogType: "website",
    image: "/og-default.webp",
    product: null,
    category: null,
    supplier: null,
  };

  if (parsed.kind === "home") {
    return {
      ...base,
      title: copy.homeTitle,
      description: copy.homeDesc,
      jsonLd: [orgJsonLd(origin), crumbs(origin, parsed.lang, [{ name: "Mattex Marketplace", path: "/" }])],
      heading: copy.homeTitle,
      body: copy.homeDesc,
    };
  }

  if (parsed.kind === "green") {
    return {
      ...base,
      title: copy.greenTitle,
      description: copy.greenDesc,
      jsonLd: [
        orgJsonLd(origin),
        crumbs(origin, parsed.lang, [
          { name: "Mattex Marketplace", path: "/" },
          { name: "Green", path: "/green" },
        ]),
      ],
      heading: copy.greenTitle,
      body: copy.greenDesc,
    };
  }

  if (parsed.kind === "catalog") {
    const category = getCategoryBySlug(parsed.slug) || getCategoryDefs().find((item) => item.id === parsed.slug);
    const name = category?.name || parsed.slug;
    return {
      ...base,
      title: copy.categoryTitle(name),
      description: copy.categoryDesc(name),
      image: categoryOgPath(parsed.slug),
      category: { id: parsed.slug, name },
      jsonLd: [
        orgJsonLd(origin),
        crumbs(origin, parsed.lang, [
          { name: "Mattex Marketplace", path: "/" },
          { name, path: `/catalog/${parsed.slug}` },
        ]),
      ],
      heading: name,
      body: copy.categoryDesc(name),
    };
  }

  if (parsed.kind === "supplier") {
    const supplier = getSupplier(parsed.slug) || getSuppliers().find((item) => item.slug === parsed.slug);
    const name = supplier?.name || parsed.slug;
    return {
      ...base,
      title: copy.supplierTitle(name),
      description: copy.supplierDesc(name),
      supplier: { slug: parsed.slug, name },
      jsonLd: [
        orgJsonLd(origin),
        crumbs(origin, parsed.lang, [
          { name: "Mattex Marketplace", path: "/" },
          { name, path: `/supplier/${parsed.slug}` },
        ]),
      ],
      heading: name,
      body: copy.supplierDesc(name),
    };
  }

  const product = getProduct(parsed.id);
  if (!product || isDiscontinued(product) || !isBuyerVisible(product)) {
    return {
      ...base,
      title: copy.homeTitle,
      description: copy.homeDesc,
      heading: copy.homeTitle,
      body: copy.homeDesc,
      jsonLd: [orgJsonLd(origin)],
    };
  }
  const slim = slimProduct(product);
  return {
    ...base,
    ogType: "product",
    title: copy.productTitle(product.name),
    description: copy.productDesc(product),
    image: slim.image || "/og-default.webp",
    product: slim,
    jsonLd: [
      orgJsonLd(origin),
      productJsonLd(origin, product, parsed.lang),
      crumbs(origin, parsed.lang, [
        { name: "Mattex Marketplace", path: "/" },
        { name: product.category, path: catalogPathForCategory(product.category) },
        { name: product.name, path: `/details/${product.id}` },
      ]),
    ],
    heading: product.name,
    body: copy.productDesc(product),
  };
}

function headSnippet(page, origin) {
  const url = absUrl(origin, page.path);
  const enUrl = absUrl(origin, withLocale("en", stripLocale(page.path)));
  const zhUrl = absUrl(origin, withLocale("zh", stripLocale(page.path)));
  const ogPath = ogImagePath(page.image || "/og-default.webp");
  const img = absAsset(origin, ogPath);
  const sized = isSizedOgImage(ogPath);
  const robots = page.noindex ? "noindex, nofollow" : "index, follow";
  const payload = Array.isArray(page.jsonLd) ? page.jsonLd.filter(Boolean) : page.jsonLd ? [page.jsonLd] : [];
  const json = payload.length
    ? `<script type="application/ld+json">${JSON.stringify(payload.length === 1 ? payload[0] : payload).replace(/</g, "\\u003c")}</script>`
    : "";
  return [
    `<title>${esc(page.title)}</title>`,
    `<meta name="description" content="${esc(page.description)}" />`,
    `<meta name="robots" content="${robots}" />`,
    `<link rel="canonical" href="${esc(url)}" />`,
    `<link rel="alternate" hreflang="en" href="${esc(enUrl)}" />`,
    `<link rel="alternate" hreflang="zh-Hant" href="${esc(zhUrl)}" />`,
    `<link rel="alternate" hreflang="x-default" href="${esc(enUrl)}" />`,
    `<meta property="og:title" content="${esc(page.title)}" />`,
    `<meta property="og:description" content="${esc(page.description)}" />`,
    `<meta property="og:type" content="${esc(page.ogType || "website")}" />`,
    `<meta property="og:url" content="${esc(url)}" />`,
    `<meta property="og:image" content="${esc(img)}" />`,
    `<meta property="og:image:url" content="${esc(img)}" />`,
    img.startsWith("https://") ? `<meta property="og:image:secure_url" content="${esc(img)}" />` : "",
    `<meta property="og:image:type" content="image/webp" />`,
    sized ? `<meta property="og:image:width" content="${OG_WIDTH}" />` : "",
    sized ? `<meta property="og:image:height" content="${OG_HEIGHT}" />` : "",
    `<meta property="og:image:alt" content="${esc(page.title)}" />`,
    `<link rel="image_src" href="${esc(img)}" />`,
    `<meta property="og:site_name" content="Mattex Marketplace" />`,
    `<meta property="og:locale" content="${page.lang === "zh" ? "zh_HK" : "en_HK"}" />`,
    `<meta property="og:locale:alternate" content="${page.lang === "zh" ? "en_HK" : "zh_HK"}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${esc(page.title)}" />`,
    `<meta name="twitter:description" content="${esc(page.description)}" />`,
    `<meta name="twitter:image" content="${esc(img)}" />`,
    json,
  ]
    .filter(Boolean)
    .join("\n    ");
}

function bootPayload(page) {
  return {
    kind: page.kind,
    lang: page.lang,
    path: page.path,
    title: page.title,
    description: page.description,
    image: page.image,
    ogType: page.ogType,
    product: page.product,
    category: page.category,
    supplier: page.supplier,
  };
}

function paragraphs(value) {
  return String(value || "")
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => `<p>${esc(line)}</p>`)
    .join("\n");
}

const HOME_COPY = {
  en: {
    heroHeadline: "Engineering products, ask or buy",
    heroSupport: "No price: request a quotation on WhatsApp. Listed price: purchase from stock on WhatsApp. Several products: add to the cart first.",
    browseCatalog: "Browse catalog",
    materialCategories: "Material categories",
    greenHeadline: "Lower-impact picks for greener builds",
    greenSupport: "Ask for a quote, or buy from stock when a price is shown.",
    topProducts: "Hit products",
    supplierCompanies: "Supplier companies",
    supplierSupport: "Open a company page for hit products and a searchable catalog",
    howHeadline: "Asking and buying",
    step1Title: "Search",
    step1Body: "Search from the top bar, or browse the catalog.",
    step2Title: "Ask now",
    step2Body: "When a product has no price, ask for a quote on WhatsApp.",
    step3Title: "Buy now",
    step3Body: "When a product has a price, buy it from stock on WhatsApp.",
    step4Title: "Cart",
    step4Body: "Add several products and send them together later.",
    step5Title: "Not in the catalog",
    step5Body: "Add a tailor-made product, or upload a specification to match.",
    customPitchTitle: "Not in the catalog? Still quote it.",
    customPitchBody: "Name the material, attach drawings or a specification, and place it in the same cart as catalog products.",
    allProductsTitle: "All products",
    searchHint: "Search by spec, size, material, SKU, supplier, or description",
  },
  zh: {
    heroHeadline: "工程產品，問價或購買",
    heroSupport: "未標價以 WhatsApp 詢問報價。已標價以 WhatsApp 購買現貨。數項產品可先放入購物車。",
    browseCatalog: "瀏覽目錄",
    materialCategories: "物料分類",
    greenHeadline: "較低碳影響的建材選擇",
    greenSupport: "可問價，已標價亦可購買現貨。",
    topProducts: "熱門產品",
    supplierCompanies: "供應商公司",
    supplierSupport: "進入公司頁查看熱門產品與可搜尋目錄",
    howHeadline: "詢價與購買",
    step1Title: "搜尋產品",
    step1Body: "於頂欄搜尋，或瀏覽目錄。",
    step2Title: "立即問價",
    step2Body: "產品未標價時，以 WhatsApp 詢問該項報價。",
    step3Title: "立即購買",
    step3Body: "產品已標價時，以 WhatsApp 購買現貨。",
    step4Title: "加入購物車",
    step4Body: "數項產品稍後一併送出。",
    step5Title: "目錄未有",
    step5Body: "新增度身訂造產品，或上傳規格配對。",
    customPitchTitle: "目錄沒有，一樣可以問價",
    customPitchBody: "填寫物料名稱，附上圖則或規格，與目錄產品放入同一個購物車。",
    allProductsTitle: "全部產品",
    searchHint: "用規格、尺寸、物料、SKU、供應商或描述搜尋",
  },
};

function buyerSpecHtml(lang, product) {
  return specificationRows(product)
    .filter((row) => row.kind === "cert" || !isLeadSpec(row.text))
    .map((row) =>
      row.kind === "cert"
        ? `<li>${lang === "zh" ? "認證" : "Cert"} ${row.lines.map((line) => esc(line)).join(" ")}</li>`
        : (() => {
            const parts = specParts(row.text, lang);
            return parts.label ? `<li>${esc(parts.label)} ${esc(parts.value)}</li>` : `<li>${esc(parts.value)}</li>`;
          })()
    )
    .join("");
}

function buyerPurposeHtml(lang, product) {
  return buyerPurposes(product, lang)
    .map((term) => `<li>${esc(term)}</li>`)
    .join("");
}

function buyerRemarkText(lang) {
  return lang === "zh" ? "暫定編號，規格以報價確認為準。" : "Provisional number. Specifications are confirmed on the quote.";
}

function productBlock(lang, product) {
  const href = withLocale(lang, `/details/${product.id}`);
  const categoryHref = withLocale(lang, catalogPathForCategory(product.category));
  const supplierHref = product.supplier ? withLocale(lang, supplierPath(product.supplier)) : "";
  const specs = buyerSpecHtml(lang, product);
  const purposes = buyerPurposeHtml(lang, product);
  return `<article>
        <p><a href="${esc(categoryHref)}">${esc(product.category)}</a></p>
        <h3><a href="${esc(href)}">${esc(product.name)}</a></h3>
        <p>${esc(product.productNo || product.provisionalSku || "")}${
          product.supplier
            ? ` · <a href="${esc(supplierHref)}">${esc(supplierDisplayName(product.supplier))}</a>`
            : ""
        }</p>
        <p>${esc(
          [
            product.unit ? `Unit ${product.unit}` : "",
            product.moq != null ? `MOQ ${product.moq}` : "",
            localizeLeadTime(product.leadTimeLabel || "", lang),
            product.standard || "",
          ]
            .filter(Boolean)
            .join(" · ")
        )}</p>
        ${paragraphs(product.description)}
        ${paragraphs(product.sizeDesc)}
        ${paragraphs(product.primarySpec)}
        ${paragraphs(product.certifications)}
        ${specs ? `<ul>${specs}</ul>` : ""}
        ${purposes ? `<ul>${purposes}</ul>` : ""}
        ${String(product.remark || "").trim() ? paragraphs(buyerRemarkText(lang)) : ""}
      </article>`;
}

function categoryNav(lang, activeId) {
  return getCategoryDefs()
    .filter((category) => category.count > 0)
    .map((category) => {
      const href = withLocale(lang, `/catalog/${category.id}`);
      const current = category.id === activeId ? ` aria-current="page"` : "";
      return `<li><a href="${esc(href)}"${current}>${esc(category.name)}</a> — ${category.count}</li>`;
    })
    .join("\n");
}

function visibleProducts(categoryName) {
  return searchProducts("", categoryName || "").filter((product) => isBuyerVisible(product) && !isDiscontinued(product));
}

function pageContent(page) {
  const lang = page.lang === "zh" ? "zh" : "en";
  const copy = HOME_COPY[lang];
  if (page.kind === "details" && page.product) {
    const product = getProduct(page.product.id) || page.product;
    const image = safeImage(product.image);
    const images = (product.images || []).map((src) => safeImage(src)).filter(Boolean);
    const gallery = images.length ? images : image ? [image] : [];
    const specs = buyerSpecHtml(lang, product);
    const purposes = buyerPurposeHtml(lang, product);
    const deliveryQty = lowerDeliveryQty(product);
    const deliveryLine = deliveryQty
      ? `<p>${esc(
          lang === "zh"
            ? `一次購買 ${deliveryQty} ${displayUnit(product.unit, lang)}或以上，運費較低。`
            : `Delivery is lower on one order of ${deliveryQty} ${
                Number(deliveryQty) === 1
                  ? displayUnit(product.unit, lang)
                  : { bag: "bags", sheet: "sheets", pail: "pails", pc: "pcs" }[String(product.unit || "").toLowerCase()] ||
                    displayUnit(product.unit, lang)
              } or more.`,
        )}</p>`
      : "";
    const lead = localizeLeadTime(
      product.leadTimeLabel ||
        (product.leadTime
          ? product.leadTime.min === product.leadTime.max
            ? `${product.leadTime.min} days`
            : `${product.leadTime.min}–${product.leadTime.max} days`
          : ""),
      lang,
    );
    return `<article class="mattex-ssr">
      <nav>
        <a href="${esc(withLocale(lang, "/"))}">${lang === "zh" ? "產品目錄" : "Catalog"}</a>
        /
        <a href="${esc(withLocale(lang, catalogPathForCategory(product.category)))}">${esc(product.category)}</a>
      </nav>
      ${gallery.map((src) => `<img src="${esc(src)}" alt="${esc(product.name)}" />`).join("\n")}
      <p><a href="${esc(withLocale(lang, catalogPathForCategory(product.category)))}">${esc(product.category)}</a></p>
      <h1>${esc(product.name)}</h1>
      <p>${lang === "zh" ? "供應商" : "Supplier"}: ${
        product.supplier
          ? `<a href="${esc(withLocale(lang, supplierPath(product.supplier)))}">${esc(supplierDisplayName(product.supplier))}</a>`
          : "Mattex"
      }</p>
      ${(() => {
        const description = productDescriptionText(product);
        if (!description) return "";
        return `<h2>${lang === "zh" ? "描述" : "Description"}</h2>\n${paragraphs(description)}`;
      })()}
      ${specs ? `<h2>${lang === "zh" ? "規格" : "Specifications"}</h2><ul>${specs}</ul>` : ""}
      <h2>${lang === "zh" ? "訂購" : "Order"}</h2>
      <dl>
        <dt>${lang === "zh" ? "臨時 SKU ID" : "Provisional SKU ID"}</dt><dd>${esc(product.productNo || product.id)}</dd>
        <dt>${lang === "zh" ? "最低訂購量" : "Min. order qty"}</dt><dd>${esc(product.moq)} ${esc(displayUnit(product.unit, lang))}</dd>
        ${product.unit ? `<dt>${lang === "zh" ? "單位" : "Unit"}</dt><dd>${esc(displayUnit(product.unit, lang))}</dd>` : ""}
        <dt>${lang === "zh" ? "送貨" : "Delivery"}</dt><dd>${esc(lead)}${/天|日|day|week/i.test(lead) ? "" : lang === "zh" ? " 日" : " days"}</dd>
        <dt>${lang === "zh" ? "文件列明標準" : "Documented standard"}</dt><dd>${esc(product.standard)}</dd>
      </dl>
      ${deliveryLine}
      ${
        purposes
          ? `<h2>${lang === "zh" ? "用途" : "Purposes"}</h2><ul>${purposes}</ul>`
          : ""
      }
      ${String(product.remark || "").trim() ? `<h2>${lang === "zh" ? "備註" : "Remark"}</h2>${paragraphs(buyerRemarkText(lang))}` : ""}
    </article>`;
  }
  if (page.kind === "catalog" && page.category) {
    const products = visibleProducts(page.category.name);
    return `<article class="mattex-ssr">
      <nav>
        <a href="${esc(withLocale(lang, "/"))}">${esc(copy.allProductsTitle)}</a>
        / ${esc(page.category.name)}
      </nav>
      <aside>
        <h2>${esc(copy.materialCategories)}</h2>
        <ul>${categoryNav(lang, page.category.id)}</ul>
      </aside>
      <h1>${esc(page.category.name)}</h1>
      <p>${esc(page.body || page.description)}</p>
      <p>${esc(copy.searchHint)}</p>
      <p>${products.length} ${lang === "zh" ? "件產品" : "products"}</p>
      ${products.map((product) => productBlock(lang, product)).join("\n")}
    </article>`;
  }
  if (page.kind === "supplier" && page.supplier) {
    const supplier = getSupplier(page.supplier.slug) || page.supplier;
    const products = getProductsBySupplier(supplier.slug).filter((product) => isBuyerVisible(product) && !isDiscontinued(product));
    const top = getTopProductsForSupplier(supplier.slug, 5);
    const categories = supplier.categories || [];
    return `<article class="mattex-ssr">
      <p>${lang === "zh" ? "供應商" : "Supplier"}</p>
      <h1>${esc(supplier.name)}</h1>
      <p>${esc(copy.supplierSupport)}</p>
      <p>${products.length} ${lang === "zh" ? "件產品" : "products"}${categories.length ? ` · ${esc(categories.join(", "))}` : ""}</p>
      <section>
        <h2>${esc(copy.topProducts)}</h2>
        ${top.map((product) => productBlock(lang, product)).join("\n")}
      </section>
      <section>
        <h2>${lang === "zh" ? `${esc(supplier.name)} 的產品` : `Products from ${esc(supplier.name)}`}</h2>
        <ul>${categoryNav(lang)}</ul>
        ${products.map((product) => productBlock(lang, product)).join("\n")}
      </section>
    </article>`;
  }
  if (page.kind === "green") {
    const products = getGreenProducts().filter((product) => isBuyerVisible(product));
    return `<article class="mattex-ssr">
      <p>${lang === "zh" ? "綠色優選" : "Green preferred"}</p>
      <h1>${esc(copy.greenHeadline)}</h1>
      <p>${esc(copy.greenSupport)}</p>
      <h2>${lang === "zh" ? "綠色產品" : "Green products"}</h2>
      <p>${products.length} ${lang === "zh" ? "件產品" : "products"}</p>
      ${products.map((product) => productBlock(lang, product)).join("\n")}
    </article>`;
  }
  const categories = getCategoryDefs().filter((category) => category.count > 0);
  const products = visibleProducts();
  const featured = getTopProducts(12);
  const greens = getGreenProducts(8);
  const suppliers = getSuppliers();
  return `<article class="mattex-ssr">
      <h1>${esc(copy.heroHeadline)}</h1>
      <p>${esc(copy.heroSupport)}</p>
      <p><a href="${esc(withLocale(lang, "/catalog"))}">${esc(copy.browseCatalog)}</a></p>
      <section>
        <h2>${esc(copy.howHeadline)}</h2>
        <h3>${esc(copy.step1Title)}</h3>
        <p>${esc(copy.step1Body)}</p>
        <h3>${esc(copy.step2Title)}</h3>
        <p>${esc(copy.step2Body)}</p>
        <h3>${esc(copy.step3Title)}</h3>
        <p>${esc(copy.step3Body)}</p>
        <h3>${esc(copy.step4Title)}</h3>
        <p>${esc(copy.step4Body)}</p>
        <h3>${esc(copy.step5Title)}</h3>
        <p>${esc(copy.step5Body)}</p>
      </section>
      <section>
        <h2>${esc(copy.materialCategories)}</h2>
        <ul>
          ${categories
            .map(
              (category) =>
                `<li><a href="${esc(withLocale(lang, `/catalog/${category.id}`))}">${esc(category.name)}</a> — ${category.count}</li>`
            )
            .join("\n          ")}
        </ul>
      </section>
      <section>
        <h2>${esc(copy.greenHeadline)}</h2>
        <p>${esc(copy.greenSupport)}</p>
        ${greens.map((product) => productBlock(lang, product)).join("\n")}
      </section>
      <section>
        <h2>${esc(copy.topProducts)}</h2>
        ${featured.map((product) => productBlock(lang, product)).join("\n")}
      </section>
      <section>
        <h2>${esc(copy.supplierCompanies)}</h2>
        <p>${esc(copy.supplierSupport)}</p>
        <ul>
          ${suppliers
            .map(
              (supplier) =>
                `<li><a href="${esc(withLocale(lang, `/supplier/${supplier.slug}`))}">${esc(supplier.name)}</a> — ${supplier.count || 0}</li>`
            )
            .join("\n          ")}
        </ul>
      </section>
      <section>
        <h2>${esc(copy.customPitchTitle)}</h2>
        <p>${esc(copy.customPitchBody)}</p>
      </section>
      <section>
        <h2>${esc(copy.allProductsTitle)}</h2>
        <p>${esc(copy.searchHint)}</p>
        <p>${products.length} ${lang === "zh" ? "件產品" : "products"}</p>
        ${products.map((product) => productBlock(lang, product)).join("\n")}
      </section>
    </article>`;
}

function ssrBody(page) {
  return `<div data-ssr="mattex">
    ${pageContent(page)}
  </div>`;
}

export function injectPublicDocument(html, pathname, origin = siteOrigin()) {
  const page = resolvePublicPage(pathname, origin);
  if (!page) return html;
  const snippet = headSnippet(page, origin);
  const htmlLang = page.lang === "zh" ? "zh-Hant" : "en";
  let next = String(html || "").replace(/<html lang="[^"]*">/, `<html lang="${htmlLang}">`);
  if (next.includes("<!--seo-head-->")) {
    next = next.replace(/<title>[^<]*<\/title>\s*/, "");
    next = next.replace(/<!--seo-head-->[\s\S]*?<!--\/seo-head-->/, `<!--seo-head-->\n    ${snippet}\n    <!--/seo-head-->`);
  } else {
    next = next.replace(/<title>[^<]*<\/title>/, snippet);
  }
  const boot = `<script>window.__MATTEX_PAGE__=${JSON.stringify(bootPayload(page)).replace(/</g, "\\u003c")};</script>`;
  if (next.includes("window.__MATTEX_PAGE__")) {
    next = next.replace(/<script>window\.__MATTEX_PAGE__=[\s\S]*?<\/script>/, boot);
  } else {
    next = next.replace('<div id="root">', `${boot}\n    <div id="root">`);
  }
  const root = `<div id="root"><!--app-root-->${ssrBody(page)}<!--/app-root--></div>`;
  if (next.includes("<!--app-root-->")) {
    next = next.replace(/<div id="root"><!--app-root-->[\s\S]*?<!--\/app-root--><\/div>/, root);
  } else if (!next.includes('data-ssr="mattex"')) {
    next = next.replace(/<div id="root"><\/div>/, root);
    next = next.replace(/<div id="root">\s*<\/div>/, root);
  }
  return next;
}

export function listPublicPrerenderPaths() {
  const paths = [];
  const products = searchProducts("").filter((p) => !isDiscontinued(p) && isBuyerVisible(p));
  const suppliers = getSuppliers();
  for (const lang of ["en", "zh"]) {
    paths.push(withLocale(lang, "/"));
    paths.push(withLocale(lang, "/green"));
    for (const category of getCategoryDefs()) {
      paths.push(withLocale(lang, `/catalog/${category.id}`));
    }
    for (const supplier of suppliers) {
      paths.push(withLocale(lang, `/supplier/${supplier.slug}`));
    }
    for (const product of products) {
      paths.push(withLocale(lang, `/details/${product.id}`));
    }
  }
  return paths;
}
