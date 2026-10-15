function reducedMotion() {
  return typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function targetTop(el) {
  const nav = document.getElementById("siteNav");
  const bar = document.getElementById("catalog-toolbar");
  const navH = nav ? Math.round(nav.getBoundingClientRect().height) : 0;
  const elTop = el.getBoundingClientRect().top;
  const barH = bar && elTop > bar.getBoundingClientRect().top ? Math.round(bar.getBoundingClientRect().height) : 0;
  return Math.max(0, window.scrollY + elTop - navH - barH - 8);
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
function animateTo(id) {
  cancelRunning?.();
  const el = document.getElementById(id);
  if (!el) return;
  const from = window.scrollY;
  const distance = Math.abs(targetTop(el) - from);
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
    const to = targetTop(live);
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
  withInstantScroll(() => window.scrollTo(0, 0));
}

/** `animate: true` is for header links and in-page jumps; everything else keeps the instant jump. */
export function jumpToId(id, { animate = false } = {}) {
  if (animate && !reducedMotion()) {
    requestAnimationFrame(() => requestAnimationFrame(() => animateTo(id)));
    return;
  }
  const go = () => {
    const el = document.getElementById(id);
    if (!el) return;
    withInstantScroll(() => window.scrollTo(0, targetTop(el)));
  };
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      go();
      window.setTimeout(go, 60);
    });
  });
}
