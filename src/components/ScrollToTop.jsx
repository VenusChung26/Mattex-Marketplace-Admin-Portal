import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { stripLocale } from "../lib/locale";

function isCategoryPage(pathname) {
  return /^\/catalog\/[^/]+$/.test(stripLocale(pathname));
}

export default function ScrollToTop() {
  const { pathname, search, hash } = useLocation();

  useEffect(() => {
    if (hash) {
      const id = hash.replace(/^#/, "");
      const scrollToHash = () => {
        const el = document.getElementById(id);
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "start" });
          return true;
        }
        return false;
      };
      if (scrollToHash()) return undefined;
      const t1 = window.setTimeout(scrollToHash, 50);
      const t2 = window.setTimeout(scrollToHash, 200);
      return () => {
        window.clearTimeout(t1);
        window.clearTimeout(t2);
      };
    }

    if (isCategoryPage(pathname)) {
      const heading = document.getElementById("catalog-top") || document.getElementById("catalog-results");
      if (heading) {
        const nav = document.getElementById("siteNav");
        const navH = nav ? Math.round(nav.getBoundingClientRect().height) : 88;
        const top = window.scrollY + heading.getBoundingClientRect().top - navH - 8;
        window.scrollTo({ top: Math.max(0, top), behavior: "auto" });
        return undefined;
      }
    }

    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    return undefined;
  }, [pathname, search, hash]);

  return null;
}
