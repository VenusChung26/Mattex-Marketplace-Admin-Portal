import { readFile } from "node:fs/promises";
import path from "node:path";
import { toPublicCatalog } from "../../server/public-catalog.js";
import { seedCatalogSnapshot } from "./store.js";

let seededEtag = "";
let pending = null;

/** Live snapshot wins. The baked file is only there when the shared catalog cannot be read. */
export function catalogToSeed(live, file) {
  if (Array.isArray(live?.products) && live.products.length) return live;
  if (Array.isArray(file?.products) && file.products.length) return file;
  return null;
}

/** Load the catalog the shop is serving now, and reload when that catalog changes. */
export function ensureSsrCatalog() {
  if (pending) return pending;
  pending = refresh().finally(() => {
    pending = null;
  });
  return pending;
}

async function refresh() {
  const live = await loadLive();
  if (live) return true;
  if (seededEtag) return true;
  const file = await loadFile();
  if (!file) return false;
  await seedPublic(file, "file");
  return true;
}

async function loadLive() {
  try {
    const { handleCatalogGet, handleCatalogVersion } = await import("../../api/catalog-snapshot.js");
    const version = await handleCatalogVersion();
    const versionEtag = String(version?.etag || "");
    if (versionEtag && versionEtag !== "seed" && versionEtag === seededEtag) return true;
    const live = await handleCatalogGet();
    const chosen = catalogToSeed(live, null);
    if (!chosen) return false;
    await seedPublic(chosen, String(chosen.etag || versionEtag || "live"));
    return true;
  } catch (error) {
    console.warn("ssr live catalog", error?.message || error);
    return false;
  }
}

async function loadFile() {
  const candidates = [
    path.join(process.cwd(), "public", "catalog.json"),
    path.join(process.cwd(), "dist", "catalog.json"),
  ];
  for (const file of candidates) {
    try {
      const data = JSON.parse(await readFile(file, "utf8"));
      if (Array.isArray(data?.products) && data.products.length) return data;
    } catch {
      /* try the next copy */
    }
  }
  return null;
}

async function seedPublic(snapshot, etag) {
  await seedCatalogSnapshot(toPublicCatalog(snapshot));
  seededEtag = etag || "seeded";
}
