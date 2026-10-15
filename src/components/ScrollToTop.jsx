import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { jumpToId, scrollToTopNow } from "../lib/jumpTo";
import { stripLocale } from "../lib/locale";

function isCategoryPage(pathname) {
  return /^\/catalog\/[^/]+$/.test(stripLocale(pathname));
}

export default function ScrollToTop() {
  const { pathname, search, hash, key } = useLocation();
  const lastPath = useRef(null);

  useEffect(() => {
    const previous = lastPath.current;
    lastPath.current = pathname;
    if (hash) {
      const id = hash.replace(/^#/, "");
      if (previous === pathname) {
        jumpToId(id, { animate: true });
        return undefined;
      }
      if (previous !== null) {
        // From another page: land at the top of the new page first, then glide to the section.
        scrollToTopNow();
        const glide = window.setTimeout(() => jumpToId(id, { animate: true }), 120);
        return () => window.clearTimeout(glide);
      }
      // First load of a deep link: jump straight there.
      jumpToId(id);
      const retry = window.setTimeout(() => jumpToId(id), 200);
      return () => window.clearTimeout(retry);
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

    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    return undefined;
  }, [pathname, search, hash, key]);

  return null;
}
