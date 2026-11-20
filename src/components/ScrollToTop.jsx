import { useEffect, useLayoutEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { startLiveCatalogRefresh } from "../lib/catalogLive";
import { jumpToId, scrollToTopNow, sectionAlreadyInView } from "../lib/jumpTo";
import { stripLocale } from "../lib/locale";

if (typeof window !== "undefined" && "scrollRestoration" in window.history) {
  window.history.scrollRestoration = "manual";
}

function isCategoryPage(pathname) {
  return /^\/catalog\/[^/]+$/.test(stripLocale(pathname));
}

export default function ScrollToTop() {
  const { pathname, search, hash, key, state } = useLocation();
  const keepScroll = Boolean(state?.keepScroll);
  const lastPath = useRef(null);
  const seenRoute = useRef(null);
  useEffect(() => startLiveCatalogRefresh(pathname), [pathname]);
  if (seenRoute.current !== pathname) {
    seenRoute.current = pathname;
    if (!keepScroll && typeof window !== "undefined") scrollToTopNow();
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
    if (keepScroll) return undefined;
    const samePage = previous != null && previous === pathname;
    const gapFor = (id) => (id === "products" ? -1 : 8);
    if (hash) {
      const id = hash.replace(/^#/, "");
      const gap = gapFor(id);
      if (samePage) {
        if (!sectionAlreadyInView(id)) jumpToId(id, { animate: true, gap });
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

    if (samePage) return undefined;

    if (isCategoryPage(pathname)) {
      let tries = 0;
      let timer = 0;
      const tick = () => {
        const id = document.getElementById("catalog-top")
          ? "catalog-top"
          : document.getElementById("catalog-results")
            ? "catalog-results"
            : "";
        if (id) {
          jumpToId(id);
          return;
        }
        tries += 1;
        if (tries <= 20) timer = window.setTimeout(tick, 40);
      };
      tick();
      return () => window.clearTimeout(timer);
    }

    scrollToTopNow();
    return undefined;
  }, [pathname, search, hash, key, keepScroll]);

  return null;
}
