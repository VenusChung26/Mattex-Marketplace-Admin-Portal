import { readFile } from "node:fs/promises";
import path from "node:path";
import { injectPublicDocument } from "../src/lib/ssrHtml.js";
import { ensureSsrCatalog } from "../src/lib/ssrCatalog.js";

async function readTemplate() {
  const candidates = [path.join(process.cwd(), "dist", "index.html"), path.join(process.cwd(), "index.html")];
  for (const file of candidates) {
    try {
      return await readFile(file, "utf8");
    } catch {
      /* try next */
    }
  }
  return "<!doctype html><html><head></head><body><div id=\"root\"></div></body></html>";
}

function requestPath(request) {
  const url = new URL(request.url);
  return url.searchParams.get("p") || url.pathname || "/";
}

export async function handleSsr(request) {
  try {
    await ensureSsrCatalog();
  } catch {
    /* a catalog seed problem still returns the page */
  }
  const template = await readTemplate();
  const html = injectPublicDocument(template, requestPath(request));
  return html;
}

export async function GET(request) {
  const html = await handleSsr(request);
  return new Response(html, {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=60" },
  });
}
