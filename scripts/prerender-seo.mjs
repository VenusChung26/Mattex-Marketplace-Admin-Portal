import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { hydrateStore } from "../src/lib/store.js";
import { absUrl, siteOrigin, stripLocale, withLocale } from "../src/lib/locale.js";
import { injectPublicDocument, listPublicPrerenderPaths } from "../src/lib/ssrHtml.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distDir = path.join(root, "dist");
const origin = siteOrigin();

function esc(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/"/g, "&quot;");
}

async function writePage(relPath, html) {
  const filePath = path.join(distDir, relPath, "index.html");
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, html);
}

async function main() {
  await hydrateStore();
  const template = await readFile(path.join(distDir, "index.html"), "utf8");
  const paths = listPublicPrerenderPaths();

  for (const pagePath of paths) {
    const rel = String(pagePath || "").replace(/^\//, "");
    await writePage(rel, injectPublicDocument(template, pagePath, origin));
  }

  const home = injectPublicDocument(template, "/en", origin);
  await writeFile(path.join(distDir, "index.html"), home);

  const english = paths.filter((pagePath) => pagePath.startsWith("/en"));
  const urlset = english
    .map((pagePath) => {
      const loc = absUrl(origin, pagePath);
      const zh = absUrl(origin, withLocale("zh", stripLocale(pagePath)));
      return `  <url>
    <loc>${esc(loc)}</loc>
    <xhtml:link rel="alternate" hreflang="en" href="${esc(loc)}" />
    <xhtml:link rel="alternate" hreflang="zh-Hant" href="${esc(zh)}" />
    <xhtml:link rel="alternate" hreflang="x-default" href="${esc(loc)}" />
  </url>`;
    })
    .join("\n");

  await writeFile(
    path.join(distDir, "sitemap.xml"),
    `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urlset}
</urlset>
`
  );

  const blocked = [
    "/login",
    "/signup",
    "/rfq",
    "/rfqs",
    "/whatsapp",
    "/whatsapp-chat",
    "/email-sent",
    "/en/login",
    "/zh/login",
    "/en/signup",
    "/zh/signup",
    "/en/rfq",
    "/zh/rfq",
    "/en/rfqs",
    "/zh/rfqs",
    "/en/whatsapp",
    "/zh/whatsapp",
    "/en/whatsapp-chat",
    "/zh/whatsapp-chat",
    "/en/email-sent",
    "/zh/email-sent",
  ];
  await writeFile(
    path.join(distDir, "robots.txt"),
    `User-agent: *
Allow: /
${blocked.map((item) => `Disallow: ${item}`).join("\n")}

Sitemap: ${absUrl(origin, "/sitemap.xml")}
`
  );

  console.log(`Prerendered ${paths.length} pages at ${origin}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
