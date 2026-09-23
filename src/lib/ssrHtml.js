import "./ssrNodePolyfill.js";
import { absAsset, absUrl, siteOrigin, stripLocale, withLocale } from "./locale.js";
import { OG_HEIGHT, OG_WIDTH, categoryOgPath, ogImagePath } from "./ogImage.js";
import { seoCopy } from "./seoCopy.js";
import { breadcrumbJsonLd, orgJsonLd, productJsonLd } from "./seoJsonLd.js";
import {
  catalogPathForCategory,
  getCategoryBySlug,
  getCategoryDefs,
  getProduct,
  getSupplier,
  getSuppliers,
  isBuyerVisible,
  isDiscontinued,
  searchProducts,
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
    image: "/og-default.jpg",
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
    image: slim.image || "/og-default.jpg",
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
  const img = absAsset(origin, ogImagePath(page.image || "/og-default.jpg"));
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
    `<meta property="og:image:type" content="image/jpeg" />`,
    `<meta property="og:image:width" content="${OG_WIDTH}" />`,
    `<meta property="og:image:height" content="${OG_HEIGHT}" />`,
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

function ssrBody(page) {
  return `<div data-ssr="mattex" class="mattex-boot">
      <div class="mattex-boot-orb" aria-hidden="true">
        <img class="mattex-boot-logo" src="/assets/mattex-logo.png" alt="" />
      </div>
      <h1>${esc(page.heading || page.title)}</h1>
      <p>${esc(page.body || page.description)}</p>
      <div class="mattex-boot-bar" aria-hidden="true"><span></span></div>
      <p class="mattex-boot-status">Loading catalog</p>
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
