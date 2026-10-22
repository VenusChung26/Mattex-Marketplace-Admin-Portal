import { useEffect, useLayoutEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { startLiveCatalogRefresh } from "../lib/catalogLive";
import { jumpToId, scrollToTopNow } from "../lib/jumpTo";
import { stripLocale } from "../lib/locale";

startLiveCatalogRefresh();

if (typeof window !== "undefined" && "scrollRestoration" in window.history) {
  window.history.scrollRestoration = "manual";
}

function isCategoryPage(pathname) {
  return /^\/catalog\/[^/]+$/.test(stripLocale(pathname));
}

export default function ScrollToTop() {
  const { pathname, search, hash, key } = useLocation();
  const lastPath = useRef(null);
  const seenRoute = useRef(null);
  const routeKey = `${pathname}${search}`;
  if (seenRoute.current !== routeKey) {
    seenRoute.current = routeKey;
    if (typeof window !== "undefined") scrollToTopNow();
  }

  useEffect(() => {
    function onClick(event) {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = event.target instanceof Element ? event.target.closest("a[href]") : null;
      const href = link?.getAttribute("href") || "";
      if (!/\/supplier\//.test(href)) return;
      scrollToTopNow();
    }
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  useLayoutEffect(() => {
    const previous = lastPath.current;
    lastPath.current = pathname;
    const gapFor = (id) => (id === "products" ? -1 : 8);
    if (hash) {
      const id = hash.replace(/^#/, "");
      const gap = gapFor(id);
      if (previous === pathname) {
        jumpToId(id, { animate: true, gap });
        return undefined;
      }
      scrollToTopNow();
      let tries = 0;
      let glide = 0;
      const tick = () => {
        if (document.getElementById(id) || tries > 20) {
          jumpToId(id, { animate: true, gap });
          return;
        }
        tries += 1;
        glide = window.setTimeout(tick, 40);
      };
      glide = window.setTimeout(tick, 40);
      return () => window.clearTimeout(glide);
    }

    if (isCategoryPage(pathname)) {
      const id = document.getElementById("catalog-top")
        ? "catalog-top"
        : document.getElementById("catalog-results")
          ? "catalog-results"
          : "";
      if (id) {
        jumpToId(id);
        return undefined;
      }
    }

    scrollToTopNow();
    return undefined;
  }, [pathname, search, hash, key]);

  return null;
}
