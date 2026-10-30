import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLanguage } from "../i18n";

export function todayIso() {
  const d = new Date();
  return isoFromParts(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

function isoFromParts(y, m, d) {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function parseDateInput(raw) {
  const text = String(raw || "").trim();
  if (!text) return "";
  let y;
  let m;
  let d;
  const iso = text.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  const dmy = text.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (iso) {
    y = Number(iso[1]);
    m = Number(iso[2]);
    d = Number(iso[3]);
  } else if (dmy) {
    d = Number(dmy[1]);
    m = Number(dmy[2]);
    y = Number(dmy[3]);
  } else {
    return "";
  }
  if (!y || m < 1 || m > 12 || d < 1 || d > 31) return "";
  const dt = new Date(y, m - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return "";
  return isoFromParts(y, m, d);
}

function formatDisplay(iso) {
  const parsed = parseDateInput(iso);
  if (!parsed) return "";
  const [y, m, d] = parsed.split("-");
  return `${d}/${m}/${y}`;
}

function shiftMonth(year, month, delta) {
  const d = new Date(year, month + delta, 1);
  return { year: d.getFullYear(), month: d.getMonth() };
}

function partsFromValue(value) {
  const shown = formatDisplay(value);
  if (!shown) return { day: "", month: "", year: "" };
  const [day, month, year] = shown.split("/");
  return { day, month, year };
}

const SEGMENTS = ["day", "month", "year"];

/**
 * Date field that opens a calendar when the field itself is selected.
 * Value stays YYYY-MM-DD. The field shows dd/mm/yyyy.
 */
export default function DateField({
  value = "",
  onChange,
  onBlur,
  min = "",
  invalid = false,
  compact = false,
  className = "",
  "aria-label": ariaLabel,
}) {
  const { lang } = useLanguage();
  const zh = lang === "zh";
  const boxRef = useRef(null);
  const dayRef = useRef(null);
  const monthRef = useRef(null);
  const yearRef = useRef(null);
  const segRef = { day: dayRef, month: monthRef, year: yearRef };
  const popRef = useRef(null);
  const scrolled = useRef(false);
  const initial = partsFromValue(value);
  const [open, setOpen] = useState(false);
  const [day, setDay] = useState(initial.day);
  const [month, setMonth] = useState(initial.month);
  const [year, setYear] = useState(initial.year);
  const [pos, setPos] = useState(null);
  const selected = parseDateInput(value) || "";
  const seed = selected || min || todayIso();
  const seedDate = new Date(`${seed}T00:00:00`);
  const [viewYear, setViewYear] = useState(seedDate.getFullYear());
  const [viewMonth, setViewMonth] = useState(seedDate.getMonth());

  useEffect(() => {
    if (boxRef.current?.contains(document.activeElement)) return;
    const next = partsFromValue(value);
    setDay(next.day);
    setMonth(next.month);
    setYear(next.year);
  }, [value]);

  useEffect(() => {
    if (!open) {
      scrolled.current = false;
      return undefined;
    }
    const iso = selected || min || todayIso();
    const d = new Date(`${iso}T00:00:00`);
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth());
    function onDoc(event) {
      const target = event.target;
      if (boxRef.current?.contains(target) || popRef.current?.contains(target)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open, selected, min]);

  useLayoutEffect(() => {
    if (!open) return undefined;
    function place() {
      const el = boxRef.current;
      if (!el) return;
      const margin = 8;
      const width = 300;
      const height = popRef.current?.offsetHeight || 328;
      let rect = el.getBoundingClientRect();
      const roomBelow = window.innerHeight - rect.bottom - margin;
      if (!scrolled.current && roomBelow < height + 6) {
        const scroller = el.closest(".overflow-y-auto");
        if (scroller) {
          scroller.scrollTop += height + 6 - roomBelow;
          scrolled.current = true;
          rect = el.getBoundingClientRect();
        }
      }
      const below = rect.bottom + 6;
      const above = rect.top - height - 6;
      const top = Math.round(below + height <= window.innerHeight - margin ? below : Math.max(margin, above));
      let left = Math.round(rect.left);
      if (left + width > window.innerWidth - margin) left = window.innerWidth - width - margin;
      if (left < margin) left = margin;
      setPos((prev) => (prev && prev.top === top && prev.left === left ? prev : { top, left }));
    }
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, viewYear, viewMonth, pos]);

  function applyIso(iso) {
    const next = partsFromValue(iso);
    setDay(next.day);
    setMonth(next.month);
    setYear(next.year);
  }

  function commit(nextIso, close = true) {
    const iso = parseDateInput(nextIso);
    if (!iso || (min && iso < min)) return;
    applyIso(iso);
    onChange?.(iso);
    if (close) setOpen(false);
    onBlur?.(iso);
  }

  function selectSeg(which) {
    const el = segRef[which]?.current;
    if (!el) return;
    el.focus();
    el.select();
  }

  function readParts() {
    return {
      day: dayRef.current?.value || "",
      month: monthRef.current?.value || "",
      year: yearRef.current?.value || "",
    };
  }

  function publish(parts) {
    if (parts.day.length < 2 || parts.month.length < 2 || parts.year.length !== 4) return;
    const iso = parseDateInput(`${parts.day}/${parts.month}/${parts.year}`);
    if (!iso || (min && iso < min)) return;
    onChange?.(iso);
  }

  function onSegChange(which, raw) {
    const limit = which === "year" ? 4 : 2;
    let digits = String(raw || "").replace(/\D/g, "").slice(0, limit);
    if (which === "day" && digits.length === 1 && Number(digits) > 3) digits = `0${digits}`;
    if (which === "month" && digits.length === 1 && Number(digits) > 1) digits = `0${digits}`;
    if (which === "day" && digits.length === 2 && (Number(digits) < 1 || Number(digits) > 31)) digits = digits.slice(0, 1);
    if (which === "month" && digits.length === 2 && (Number(digits) < 1 || Number(digits) > 12)) digits = digits.slice(0, 1);
    if (which === "day") setDay(digits);
    if (which === "month") setMonth(digits);
    if (which === "year") setYear(digits);
    const parts = { day, month, year, [which]: digits };
    const finished = (which !== "year" && digits.length === 2) || (which === "year" && digits.length === 4);
    if (finished) {
      const idx = SEGMENTS.indexOf(which);
      if (idx < SEGMENTS.length - 1) requestAnimationFrame(() => selectSeg(SEGMENTS[idx + 1]));
    }
    publish(parts);
  }

  function onSegKeyDown(which, event) {
    if (event.key === "Escape") setOpen(false);
    if (event.key === "Enter") {
      event.preventDefault();
      const parts = readParts();
      const iso = parseDateInput(`${parts.day}/${parts.month}/${parts.year}`);
      if (iso && (!min || iso >= min)) commit(iso);
      return;
    }
    if (event.key === "/" || event.key === "-" || event.key === ".") {
      event.preventDefault();
      const idx = SEGMENTS.indexOf(which);
      if (idx < SEGMENTS.length - 1) selectSeg(SEGMENTS[idx + 1]);
      return;
    }
    const el = event.currentTarget;
    const atStart = el.selectionStart === 0 && el.selectionEnd === 0;
    const atEnd = el.selectionStart === el.value.length && el.selectionEnd === el.value.length;
    if (event.key === "Backspace" && (el.value === "" || (el.selectionStart === 0 && el.selectionEnd === 0))) {
      const idx = SEGMENTS.indexOf(which);
      if (idx > 0) {
        event.preventDefault();
        selectSeg(SEGMENTS[idx - 1]);
      }
      return;
    }
    if (event.key === "ArrowLeft" && atStart) {
      const idx = SEGMENTS.indexOf(which);
      if (idx > 0) {
        event.preventDefault();
        selectSeg(SEGMENTS[idx - 1]);
      }
    }
    if (event.key === "ArrowRight" && atEnd) {
      const idx = SEGMENTS.indexOf(which);
      if (idx < SEGMENTS.length - 1) {
        event.preventDefault();
        selectSeg(SEGMENTS[idx + 1]);
      }
    }
  }

  function onSegPaste(event) {
    const iso = parseDateInput(event.clipboardData?.getData("text") || "");
    if (!iso || (min && iso < min)) return;
    event.preventDefault();
    commit(iso, false);
  }

  function onSegBlur() {
    requestAnimationFrame(() => {
      const active = document.activeElement;
      if (boxRef.current?.contains(active) || popRef.current?.contains(active)) return;
      const parts = readParts();
      const iso = parseDateInput(`${parts.day}/${parts.month}/${parts.year}`);
      if (iso && (!min || iso >= min)) {
        applyIso(iso);
        onChange?.(iso);
        onBlur?.(iso);
        return;
      }
      applyIso(value);
    });
  }

  function renderSeg(which, segValue, placeholder) {
    return (
      <input
        ref={segRef[which]}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        placeholder={placeholder}
        value={segValue}
        aria-label={ariaLabel ? `${ariaLabel} ${placeholder}` : placeholder}
        maxLength={which === "year" ? 4 : 2}
        className={which === "year" ? "date-seg date-seg-year" : "date-seg"}
        onMouseDown={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setOpen(true);
          selectSeg(which);
        }}
        onFocus={(event) => {
          setOpen(true);
          event.target.select();
        }}
        onClick={() => setOpen(true)}
        onChange={(event) => onSegChange(which, event.target.value)}
        onKeyDown={(event) => onSegKeyDown(which, event)}
        onPaste={onSegPaste}
        onBlur={onSegBlur}
      />
    );
  }

  function move(delta) {
    const next = shiftMonth(viewYear, viewMonth, delta);
    setViewYear(next.year);
    setViewMonth(next.month);
  }

  const weekdays = zh ? ["日", "一", "二", "三", "四", "五", "六"] : ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
  const monthLabel = new Date(viewYear, viewMonth, 1).toLocaleDateString(zh ? "zh-HK" : "en-GB", {
    month: "long",
    year: "numeric",
  });
  const first = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < first; i += 1) cells.push(null);
  for (let day = 1; day <= daysInMonth; day += 1) cells.push(day);
  while (cells.length % 7) cells.push(null);

  const inputClass = compact
    ? "w-full rounded-lg border border-line bg-white px-2 py-1.5 pr-8 text-sm outline-none focus:border-brand-700"
    : "field-input pr-10";

  const calendar =
    open && pos
      ? createPortal(
          <div
            ref={popRef}
            className="date-cal"
            role="dialog"
            aria-label={zh ? "日曆" : "Calendar"}
            style={{ position: "fixed", top: pos.top, left: pos.left, zIndex: 120 }}
          >
            <div className="date-cal-head">
              <button type="button" className="date-cal-nav" aria-label={zh ? "上一年" : "Previous year"} onMouseDown={(e) => e.preventDefault()} onClick={() => move(-12)}>
                «
              </button>
              <button type="button" className="date-cal-nav" aria-label={zh ? "上個月" : "Previous month"} onMouseDown={(e) => e.preventDefault()} onClick={() => move(-1)}>
                ‹
              </button>
              <p className="date-cal-title">{monthLabel}</p>
              <button type="button" className="date-cal-nav" aria-label={zh ? "下個月" : "Next month"} onMouseDown={(e) => e.preventDefault()} onClick={() => move(1)}>
                ›
              </button>
              <button type="button" className="date-cal-nav" aria-label={zh ? "下一年" : "Next year"} onMouseDown={(e) => e.preventDefault()} onClick={() => move(12)}>
                »
              </button>
            </div>
            <div className="date-cal-week">
              {weekdays.map((name) => (
                <span key={name}>{name}</span>
              ))}
            </div>
            <div className="date-cal-grid">
              {cells.map((day, index) => {
                if (!day) return <span key={`empty-${index}`} />;
                const iso = isoFromParts(viewYear, viewMonth + 1, day);
                const disabled = Boolean(min && iso < min);
                const isSelected = iso === selected;
                const isToday = iso === todayIso();
                const isSun = index % 7 === 0;
                return (
                  <button
                    key={iso}
                    type="button"
                    disabled={disabled}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => commit(iso)}
                    className={`date-cal-day${isSun ? " is-sun" : ""}${isToday ? " is-today" : ""}${isSelected ? " is-selected" : ""}`}
                  >
                    {day}
                  </button>
                );
              })}
            </div>
            <div className="date-cal-foot">
              <span className="text-[11px] text-mute">{zh ? "可輸入 dd/mm/yyyy" : "Type dd/mm/yyyy"}</span>
              <button
                type="button"
                className="date-cal-today"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => commit(todayIso())}
              >
                {zh ? "今天" : "Today"}
              </button>
            </div>
          </div>,
          document.body
        )
      : null;

  return (
    <div className={`relative ${className}`}>
      <div
        ref={boxRef}
        className={`date-field-shell ${inputClass} flex items-center${compact ? "" : " date-field-input"}${invalid && compact ? " border-red-500 bg-red-50" : ""}`}
        aria-invalid={invalid ? true : undefined}
        aria-expanded={open}
        onMouseDown={(event) => {
          event.stopPropagation();
          if (event.target !== event.currentTarget) return;
          event.preventDefault();
          setOpen(true);
          selectSeg("day");
        }}
        onClick={(event) => event.stopPropagation()}
      >
        {renderSeg("day", day, "dd")}
        <span
          className="date-seg-slash"
          aria-hidden
          onMouseDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
            setOpen(true);
            selectSeg("month");
          }}
        >
          /
        </span>
        {renderSeg("month", month, "mm")}
        <span
          className="date-seg-slash"
          aria-hidden
          onMouseDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
            setOpen(true);
            selectSeg("year");
          }}
        >
          /
        </span>
        {renderSeg("year", year, "yyyy")}
      </div>
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-brand-800" aria-hidden>
        <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none">
          <rect x="3" y="4.5" width="14" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.6" />
          <path d="M3 8h14M7 3v3M13 3v3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      </span>
      {calendar}
    </div>
  );
}
