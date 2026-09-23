import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";

/**
 * PROTOTYPE — floating variant bar. Hidden in production builds.
 */
export default function PrototypeSwitcher({ variants, current }) {
  const [params, setParams] = useSearchParams();
  const keys = variants.map((v) => v.key);
  const idx = Math.max(0, keys.indexOf(String(current || "A").toUpperCase()));

  function go(nextKey) {
    const next = new URLSearchParams(params);
    next.set("variant", nextKey);
    setParams(next, { replace: true });
  }

  function cycle(delta) {
    go(keys[(idx + delta + keys.length) % keys.length]);
  }

  useEffect(() => {
    function onKey(e) {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      const el = e.target;
      const tag = el?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el?.isContentEditable) return;
      e.preventDefault();
      const i = Math.max(0, keys.indexOf(String(current || "A").toUpperCase()));
      const next = keys[(i + (e.key === "ArrowRight" ? 1 : -1) + keys.length) % keys.length];
      const nextParams = new URLSearchParams(window.location.search);
      nextParams.set("variant", next);
      setParams(nextParams, { replace: true });
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [current, keys, setParams]);

  if (import.meta.env.PROD) return null;

  const meta = variants[idx] || variants[0];
  if (!meta) return null;

  return (
    <div className="fixed bottom-4 left-1/2 z-[100] flex -translate-x-1/2 items-center gap-1 rounded-full border border-white/15 bg-charcoal px-1.5 py-1.5 text-white shadow-[0_12px_40px_rgba(16,21,19,0.4)]">
      <button
        type="button"
        aria-label="Previous variant"
        onClick={() => cycle(-1)}
        className="flex h-8 w-8 items-center justify-center rounded-full text-sm hover:bg-white/10"
      >
        ←
      </button>
      <p className="min-w-[12.5rem] px-2 text-center text-xs font-semibold tracking-wide">
        {meta.key} — {meta.name}
      </p>
      <button
        type="button"
        aria-label="Next variant"
        onClick={() => cycle(1)}
        className="flex h-8 w-8 items-center justify-center rounded-full text-sm hover:bg-white/10"
      >
        →
      </button>
    </div>
  );
}
