import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const origin = process.env.SITEMAP_ORIGIN || "https://marketplace.mattex.com.hk";

if (typeof globalThis.localStorage === "undefined") {
  const mem = new Map();
  globalThis.localStorage = {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => mem.set(k, String(v)),
    removeItem: (k) => mem.delete(k),
  };
}
if (!globalThis.window || typeof globalThis.window.addEventListener !== "function") {
  globalThis.window = {
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() {
      return true;
    },
    location: { origin, href: `${origin}/` },
  };
}
if (typeof globalThis.fetch !== "function") {
  globalThis.fetch = async () => ({ ok: false, json: async () => ({}) });
}

const { withLocale } = await import("../src/lib/locale.js");
const { getCategoryDefs, getSuppliers, isDiscontinued, searchProducts } = await import("../src/lib/store.js");

function esc(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/"/g, "&quot;");
}

function abs(pagePath) {
  return `${origin}${pagePath.startsWith("/") ? pagePath : `/${pagePath}`}`;
}

function stripLocale(pagePath) {
  return String(pagePath || "/").replace(/^\/(en|zh)(?=\/|$)/, "") || "/";
}

const products = searchProducts("").filter((p) => !isDiscontinued(p));
const suppliers = getSuppliers();
const paths = [];
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

const urlset = paths
  .map((pagePath) => {
    const loc = abs(pagePath);
    const en = abs(withLocale("en", stripLocale(pagePath)));
    const zh = abs(withLocale("zh", stripLocale(pagePath)));
    return `  <url>
    <loc>${esc(loc)}</loc>
    <xhtml:link rel="alternate" hreflang="en" href="${esc(en)}" />
    <xhtml:link rel="alternate" hreflang="zh-Hant" href="${esc(zh)}" />
    <xhtml:link rel="alternate" hreflang="x-default" href="${esc(en)}" />
  </url>`;
  })
  .join("\n");

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urlset}
</urlset>
`;

const dest = path.join(root, "public/sitemap.xml");
writeFileSync(dest, xml);
console.log(`Wrote ${paths.length} URLs → ${dest}`);
