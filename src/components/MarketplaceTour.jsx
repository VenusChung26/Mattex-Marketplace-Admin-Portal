import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useLanguage } from "../i18n";
import { scrollToTopNow } from "../lib/jumpTo";

const SEEN_KEY = "mm_tour_v1";
export const SPEC_SEEN_KEY = "mm_tour_spec_v1";

export const SPEC_TOUR = {
  zh: [
    { target: "spec-sample", title: "用範例試一次", body: "你可以上載自己的報價單、清單或圖片，同我哋的產品配對。未有檔案就先用範例，跟住會教你點樣對每一行。", choice: "sample", choiceLabel: "用範例試一次" },
    { target: "spec-rows", title: "配對表", body: "左邊是檔案抽出的貨，右邊是配對到的產品。逐行核對。" },
    { target: "spec-pick", title: "揀這一件", body: "點一行就打開。對的產品按「用這件」，狀態會變成「已用這件」。不對可以取消，或換另一件。" },
    { target: "spec-send", title: "一次過問", body: "揀好之後可以加入購物車，或直接一次過問價。" },
    { target: "spec-upload", title: "上載你的規格", body: "撳「更換檔案」，或拖放你的報價單、清單或圖片到這裡。系統會抽出每一行，再同我哋的產品配對。" },
  ],
  en: [
    { target: "spec-sample", title: "Try the sample", body: "Upload your own quote, list, or picture to match our products. If you do not have a file yet, open the sample. The next steps show how to use each row.", choice: "sample", choiceLabel: "Try the sample" },
    { target: "spec-rows", title: "Match table", body: "The left side is what the file extracted. The right side is the matched product. Check them row by row." },
    { target: "spec-pick", title: "Choose the item", body: "Click a line to open it. If the product is right, press Use this product. The status becomes Used. If it is wrong, clear it or pick another." },
    { target: "spec-send", title: "Ask together", body: "After choosing, add the lines to the cart, or ask for the prices together." },
    { target: "spec-upload", title: "Upload your file", body: "Press Change file, or drop your quote, list, or picture here. Each line is matched to our products." },
  ],
};

const STEPS = {
  zh: [
    { target: "search", title: "搜尋產品", body: "輸入產品名稱、尺寸或編號。點選建議，就會打開該產品。" },
    { target: "categories", title: "按分類看", body: "點一個分類，頁面就只顯示這一類產品。" },
    { target: "specs", title: "換尺寸", body: "同一款產品有多於一個尺寸時，會列出選項。點一個，就換成該尺寸。" },
    { target: "buy", title: "問價", body: "按「立即問價」就直接問這一件。按「加入購物車」可以收集多件，之後一次過問。未有價錢兩種都可以。" },
    { target: "cart", title: "一次過問", body: "購物車會收齊你揀的貨。入去就可以一次過問。" },
    { target: "spec-match", title: "規格配對", body: "有報價單、清單或圖片，按「上傳規格配對」。系統抽出檔案裡的產品，同目錄逐行配對，之後可以一次過問價。" },
  ],
  en: [
    { target: "search", title: "Search", body: "Type a product name, size, or number. Choose a suggestion to open that product." },
    { target: "categories", title: "Browse by category", body: "Choose a category. The page then shows only products in that category." },
    { target: "specs", title: "Change size", body: "When one product has more than one size, the choices are listed. Click one to switch to it." },
    { target: "buy", title: "Ask a price", body: "Press Request Now to ask about this item. Press Add to cart to collect several items, then ask together. Both work when there is no price yet." },
    { target: "cart", title: "Ask together", body: "The cart keeps what you picked. Open it to ask for those prices together." },
    { target: "spec-match", title: "Match a specification", body: "If you have a quote, list, or picture, press Upload spec to match. Products in the file are extracted and matched to the catalog, row by row. You can then ask for those prices together." },
  ],
};

function hasBox(el) {
  if (!el) return false;
  const rect = el.getBoundingClientRect();
  return rect.width > 8 && rect.height > 8;
}

function pickTarget(name) {
  if (name === "buy") {
    const specs = [...document.querySelectorAll('[data-tour="specs"]')].find(hasBox);
    const card = specs?.closest("article");
    const buy = card?.querySelector('[data-tour="buy"]');
    if (hasBox(buy)) return buy;
  }
  return [...document.querySelectorAll(`[data-tour="${name}"]`)].find(hasBox) || null;
}

function stickyCover(el) {
  if (el.closest("#siteNav")) return 0;
  let cover = 0;
  const nav = document.getElementById("siteNav");
  if (nav) cover = Math.max(cover, nav.getBoundingClientRect().bottom);
  const bar = document.getElementById("catalog-toolbar");
  if (bar) {
    const box = bar.getBoundingClientRect();
    if (box.bottom > cover && box.top < cover + 120) cover = box.bottom;
  }
  return cover;
}

function readRect(el) {
  const box = el.getBoundingClientRect();
  const pad = 6;
  const cover = stickyCover(el);
  const top = Math.max(box.top, cover) - (box.top >= cover ? pad : 0);
  const left = Math.max(8, box.left - pad);
  const right = Math.min(window.innerWidth - 8, box.right + pad);
  const bottom = Math.min(window.innerHeight - 8, box.bottom + pad);
  return {
    top: Math.max(cover, top),
    left,
    width: Math.max(24, right - left),
    height: Math.max(24, bottom - Math.max(cover, top)),
  };
}

function sameRect(a, b) {
  return a && b
    && Math.abs(a.top - b.top) < 1
    && Math.abs(a.left - b.left) < 1
    && Math.abs(a.width - b.width) < 1
    && Math.abs(a.height - b.height) < 1;
}

function bringIntoView(el) {
  const fixed = getComputedStyle(el).position === "fixed" || Boolean(el.closest(".fixed"));
  if (fixed) return;
  if (el.closest("#siteNav")) {
    if (window.scrollY > 8) scrollToTopNow();
    return;
  }
  const rect = el.getBoundingClientRect();
  const desired = stickyCover(el) + 16;
  const hidden = rect.top < desired - 4 || rect.bottom > window.innerHeight - 16 || rect.top > desired + 120;
  if (!hidden) return;
  const next = Math.max(0, window.scrollY + rect.top - desired);
  scrollToTopNow();
  window.scrollTo(0, next);
}

export function tourSeen(key = SEEN_KEY) {
  try {
    return localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

export function markTourSeen(key = SEEN_KEY) {
  try {
    localStorage.setItem(key, "1");
  } catch {
    /* ignore */
  }
}

export function TourReplayButton({ onClick, tone = "dark", label, className = "" }) {
  const { lang } = useLanguage();
  const text = label || (lang === "zh" ? "教學" : "Guide");
  const toneClass = tone === "light"
    ? "border-brand-700/30 bg-white text-brand-800 hover:border-brand-700 hover:bg-brand-50"
    : "border-white/45 bg-white/10 text-white hover:border-white hover:bg-white/20";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 border px-2.5 py-1.5 text-xs font-semibold ${toneClass} ${className}`}
    >
      <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 shrink-0" aria-hidden="true">
        <circle cx="8" cy="8" r="6.25" fill="none" stroke="currentColor" strokeWidth="1.4" />
        <path d="M6.15 6.15a1.85 1.85 0 1 1 2.55 1.72c-.5.18-.75.5-.75.98V9.3" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        <circle cx="8" cy="11.2" r="0.7" fill="currentColor" />
      </svg>
      {text}
    </button>
  );
}

export default function MarketplaceTour({ open, onClose, script, seenKey = SEEN_KEY, onChoice, choiceDisabled = false }) {
  const { lang } = useLanguage();
  const source = script || STEPS;
  const copy = lang === "zh" ? source.zh : source.en;
  const ui = lang === "zh"
    ? { skip: "跳過", back: "上一步", next: "下一步", done: "明白了", step: "步驟" }
    : { skip: "Skip", back: "Back", next: "Next", done: "Got it", step: "Step" };
  const [index, setIndex] = useState(0);
  const [steps, setSteps] = useState(copy);
  const [rect, setRect] = useState(null);

  useEffect(() => {
    if (!open) return undefined;
    const present = copy.filter((step) => document.querySelector(`[data-tour="${step.target}"]`));
    setSteps(present.length ? present : copy);
    setIndex(0);
  }, [open, lang]);

  useEffect(() => {
    if (!open) return undefined;
    const step = steps[index];
    if (!step) return undefined;
    setRect(null);
    let frame = 0;
    let follow = 0;
    let shifts = 0;
    let last = null;
    const started = performance.now();
    const place = () => {
      const next = pickTarget(step.target);
      if (!next) return null;
      const covered = next.getBoundingClientRect().top < stickyCover(next) - 4;
      if (shifts < 2 && (shifts === 0 || covered)) {
        bringIntoView(next);
        shifts += 1;
      }
      const box = readRect(next);
      if (!sameRect(last, box)) {
        last = box;
        setRect(box);
      }
      return next;
    };
    const tick = () => {
      const next = place();
      if (!next) {
        if (performance.now() - started < 700) {
          frame = requestAnimationFrame(tick);
          return;
        }
        setRect(null);
        setIndex((value) => (value < steps.length - 1 ? value + 1 : value));
        return;
      }
      if (performance.now() - started < 1200) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    const onMove = () => {
      window.clearTimeout(follow);
      follow = window.setTimeout(place, 40);
    };
    window.addEventListener("scroll", onMove, true);
    window.addEventListener("resize", onMove);
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(onMove);
    ["siteNav", "catalog-toolbar"].forEach((id) => {
      const node = document.getElementById(id);
      if (node) observer?.observe(node);
    });
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(follow);
      window.removeEventListener("scroll", onMove, true);
      window.removeEventListener("resize", onMove);
      observer?.disconnect();
    };
  }, [open, index, steps]);

  useEffect(() => {
    if (!open) return undefined;
    const banners = [...document.querySelectorAll("div")].filter((el) => getComputedStyle(el).zIndex === "60" && el.className.includes("sticky"));
    const previous = banners.map((el) => el.style.zIndex);
    banners.forEach((el) => {
      el.style.zIndex = "30";
    });
    return () => {
      banners.forEach((el, index) => {
        el.style.zIndex = previous[index];
      });
    };
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => {
      if (event.key === "Escape") {
        markTourSeen(seenKey);
        onClose();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose, seenKey]);

  if (!open || !rect || !steps[index]) return null;
  const step = steps[index];
  const last = index === steps.length - 1;
  const cardWidth = Math.min(340, window.innerWidth - 24);
  const beside = rect.left + rect.width + 16;
  let cardLeft = beside + cardWidth < window.innerWidth - 12 ? beside : rect.left;
  if (cardLeft + cardWidth > window.innerWidth - 12) cardLeft = window.innerWidth - 12 - cardWidth;
  if (cardLeft < 12) cardLeft = 12;
  const below = rect.top + rect.height + 12;
  const cardTop = beside + cardWidth < window.innerWidth - 12
    ? Math.max(12, Math.min(rect.top, window.innerHeight - 210))
    : below + 200 < window.innerHeight
      ? below
      : Math.max(12, rect.top - 196);

  function finish() {
    markTourSeen(seenKey);
    onClose();
  }

  const shade = "fixed z-[100] bg-[#101513]/75";

  return createPortal(
    <div role="dialog" aria-modal="true" aria-labelledby="marketplace-tour-title">
      <div className={shade} style={{ top: 0, left: 0, right: 0, height: rect.top }} />
      <div className={shade} style={{ top: rect.top, left: 0, width: rect.left, height: rect.height }} />
      <div className={shade} style={{ top: rect.top, left: rect.left + rect.width, right: 0, height: rect.height }} />
      <div className={shade} style={{ top: rect.top + rect.height, left: 0, right: 0, bottom: 0 }} />
      <div
        className="pointer-events-none fixed z-[101] border-2 border-white"
        style={{ top: rect.top, left: rect.left, width: rect.width, height: rect.height }}
      />
      <div
        className="fixed z-[102] border border-line bg-white p-4 text-ink shadow-[0_16px_40px_rgba(16,21,19,0.28)]"
        style={{ top: cardTop, left: cardLeft, width: cardWidth }}
      >
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-600">
          {ui.step} {index + 1} / {steps.length}
        </p>
        <h2 id="marketplace-tour-title" className="mt-1 text-base font-semibold text-brand-800">
          {step.title}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-mute">{step.body}</p>
        <div className="mt-4 flex items-center justify-between gap-3">
          <button type="button" className="text-sm font-semibold text-mute hover:text-ink" onClick={finish}>
            {ui.skip}
          </button>
          <div className="flex items-center gap-2">
            {index > 0 ? (
              <button type="button" className="btn-soft !px-3 !py-2 !text-sm" onClick={() => setIndex((value) => value - 1)}>
                {ui.back}
              </button>
            ) : null}
            {step.choice ? (
              <button type="button" className="btn-primary !px-3 !py-2 !text-sm" disabled={choiceDisabled} onClick={() => onChoice?.(step.choice)}>
                {step.choiceLabel || ui.next}
              </button>
            ) : (
              <button type="button" className="btn-primary !px-3 !py-2 !text-sm" onClick={last ? finish : () => setIndex((value) => value + 1)}>
                {last ? ui.done : ui.next}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
