import { getCatalog, getCatalogVersion } from "./remote";
import { seedCatalogSnapshot } from "./store";

let started = false;
let primed = false;
let lastEtag = "";
let running = false;

async function pullCatalog() {
  if (running) return;
  running = true;
  try {
    const version = await getCatalogVersion();
    const etag = String(version?.data?.etag || "");
    if (!etag || etag === "seed") return;
    if (!primed) {
      primed = true;
      lastEtag = etag;
      return;
    }
    if (etag === lastEtag) return;
    const res = await getCatalog("");
    if (!res?.ok || !Array.isArray(res.data?.products) || !res.data.products.length) return;
    await seedCatalogSnapshot(res.data);
    lastEtag = String(res.data.etag || etag);
  } catch {
    /* keep the catalog already on screen */
  } finally {
    running = false;
  }
}

/** Shop tabs pick up a portal save without a manual reload. */
export function startLiveCatalogRefresh() {
  if (started || typeof window === "undefined") return;
  if (import.meta.env?.VITE_SURFACE === "admin") return;
  started = true;
  setTimeout(pullCatalog, 4000);
  setInterval(pullCatalog, 8000);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") pullCatalog();
  });
}
