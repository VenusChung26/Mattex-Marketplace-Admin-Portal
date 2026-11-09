import { getCatalog, getCatalogVersion } from "./remote.js";
import { catalogContentStamp } from "./catalogEtag.js";
import { seedCatalogSnapshot } from "./store.js";
import { stripLocale } from "./locale.js";

let primed = false;
let lastEtag = "";
let running = false;

async function pullCatalog(canRefresh) {
  if (running || !canRefresh()) return;
  running = true;
  try {
    const version = await getCatalogVersion();
    if (!canRefresh()) return;
    const etag = catalogContentStamp(version?.data?.etag || "");
    if (!etag || etag === "seed") return;
    if (!primed) {
      primed = true;
      lastEtag = etag;
      return;
    }
    if (etag === lastEtag) return;
    const res = await getCatalog("");
    if (!canRefresh()) return;
    if (!res?.ok || !Array.isArray(res.data?.products) || !res.data.products.length) return;
    await seedCatalogSnapshot(res.data);
    lastEtag = catalogContentStamp(res.data.etag || etag);
  } catch {
    /* keep the catalog already on screen */
  } finally {
    running = false;
  }
}

/** Only product browsing needs background catalog updates; forms keep their working copy. */
export function startLiveCatalogRefresh(pathname) {
  if (typeof window === "undefined") return;
  if (import.meta.env?.VITE_SURFACE === "admin") return;
  const path = stripLocale(pathname).replace(/\/+$/, "") || "/";
  if (path !== "/" && !/^\/(catalog(?:\/[^/]+)?|details\/[^/]+|supplier\/[^/]+|promo)$/.test(path)) return;

  let stopped = false;
  let timer;
  const canRefresh = () => !stopped && document.visibilityState === "visible";
  const schedule = (delay) => {
    clearTimeout(timer);
    if (canRefresh()) timer = setTimeout(tick, delay);
  };
  const tick = async () => {
    clearTimeout(timer);
    if (!canRefresh()) return;
    await pullCatalog(canRefresh);
    schedule(60000);
  };
  const onVisibility = () => {
    clearTimeout(timer);
    if (canRefresh()) void tick();
  };
  schedule(4000);
  document.addEventListener("visibilitychange", onVisibility);
  return () => {
    stopped = true;
    clearTimeout(timer);
    document.removeEventListener("visibilitychange", onVisibility);
  };
}
