function reducedMotion() {
  return typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function targetTop(el, gap = 8) {
  const elTop = el.getBoundingClientRect().top;
  const nav = document.getElementById("siteNav");
  let cover = nav ? Math.round(nav.getBoundingClientRect().height) : 0;
  ["catalog-toolbar", "supplier-toolbar"].forEach((id) => {
    const bar = document.getElementById(id);
    if (!bar || bar === el) return;
    const box = bar.getBoundingClientRect();
    if (elTop > box.top) cover = Math.max(cover, Math.round(box.bottom));
  });
  return Math.max(0, window.scrollY + elTop - cover - gap);
}

function withInstantScroll(fn) {
  const root = document.documentElement;
  const previous = root.style.scrollBehavior;
  root.style.scrollBehavior = "auto";
  fn();
  root.style.scrollBehavior = previous;
}

let cancelRunning = null;

/** Short ease-out scroll: about 0.4 s, never more than 0.6 s, no overshoot. Ends exactly on the target (below the sticky bars). */
function animateTo(id, gap = 8) {
  cancelRunning?.();
  const el = document.getElementById(id);
  if (!el) return;
  const from = window.scrollY;
  const distance = Math.abs(targetTop(el, gap) - from);
  if (distance < 4) return;
  const duration = Math.min(600, Math.max(300, 300 + distance * 0.1));
  const startedAt = performance.now();
  const root = document.documentElement;
  const previous = root.style.scrollBehavior;
  root.style.scrollBehavior = "auto";
  let frame = 0;
  function stop() {
    cancelAnimationFrame(frame);
    window.removeEventListener("wheel", stop);
    window.removeEventListener("touchstart", stop);
    window.removeEventListener("keydown", stop);
    root.style.scrollBehavior = previous;
    cancelRunning = null;
  }
  function step(now) {
    const live = document.getElementById(id);
    if (!live) return stop();
    const t = Math.min(1, (now - startedAt) / duration);
    const eased = 1 - Math.pow(1 - t, 3);
    const to = targetTop(live, gap);
    window.scrollTo(0, from + (to - from) * eased);
    if (t < 1) frame = requestAnimationFrame(step);
    else stop();
  }
  window.addEventListener("wheel", stop, { passive: true });
  window.addEventListener("touchstart", stop, { passive: true });
  window.addEventListener("keydown", stop);
  cancelRunning = stop;
  frame = requestAnimationFrame(step);
}

export function scrollToTopNow() {
  cancelRunning?.();
  const root = document.documentElement;
  const previous = root.style.scrollBehavior;
  root.style.scrollBehavior = "auto";
  window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  root.scrollTop = 0;
  document.body.scrollTop = 0;
  window.requestAnimationFrame(() => {
    if (root.style.scrollBehavior === "auto") root.style.scrollBehavior = previous;
  });
}

/** `animate: true` is for header links and in-page jumps; everything else keeps the instant jump. */
export function jumpToId(id, { animate = false, gap = 8 } = {}) {
  if (animate && !reducedMotion()) {
    requestAnimationFrame(() => requestAnimationFrame(() => animateTo(id, gap)));
    return;
  }
  const go = () => {
    const el = document.getElementById(id);
    if (!el) return;
    withInstantScroll(() => window.scrollTo(0, targetTop(el, gap)));
  };
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      go();
      window.setTimeout(go, 60);
    });
  });
}
