import { startTransition, useEffect, useId, useMemo, useRef, useState } from "react";
import { useLanguage } from "../../i18n";
import { adminText } from "../../lib/adminCopy";

const SUGGEST_LIMIT = 8;

function markMatch(text, needle) {
  const raw = String(text || "");
  const at = needle ? raw.toLowerCase().indexOf(needle) : -1;
  if (at < 0) return raw;
  return (
    <>
      {raw.slice(0, at)}
      <mark className="bg-transparent font-semibold text-brand-800">{raw.slice(at, at + needle.length)}</mark>
      {raw.slice(at + needle.length)}
    </>
  );
}

export function AdminSearchBar({ value, onChange, placeholder, label, options, onPick }) {
  const { lang } = useLanguage();
  const pt = (copy) => adminText(lang, copy);
  const fieldId = useId();
  const inputRef = useRef(null);
  const sent = useRef(value || "");
  const [text, setText] = useState(value || "");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  useEffect(() => {
    const next = value || "";
    if (next === sent.current) return;
    if (inputRef.current && document.activeElement === inputRef.current && next) return;
    sent.current = next;
    setText(next);
  }, [value]);
  const needle = text.trim().toLowerCase();
  const listed = useMemo(() => {
    if (!needle || !options?.length) return [];
    const hits = [];
    for (const option of options) {
      const hay = option.text || `${option.label || ""}\n${option.hint || ""}`.toLowerCase();
      if (!hay.includes(needle)) continue;
      hits.push(option);
      if (hits.length > SUGGEST_LIMIT) break;
    }
    return hits;
  }, [needle, options]);
  const matches = listed.slice(0, SUGGEST_LIMIT);
  const more = listed.length > SUGGEST_LIMIT;
  const show = open && Boolean(needle);

  function commit(next) {
    sent.current = next;
    setText(next);
    startTransition(() => onChange(next));
  }

  function pick(option) {
    const next = option.pick || option.label || "";
    commit(next);
    setOpen(false);
    onPick?.(option);
  }

  return (
    <div className="relative mb-4">
      <label className="sr-only" htmlFor={fieldId}>{label || placeholder}</label>
      <input
        id={fieldId}
        ref={inputRef}
        type="search"
        value={text}
        autoComplete="off"
        role="combobox"
        aria-expanded={show}
        aria-autocomplete="list"
        aria-controls={`${fieldId}-list`}
        onChange={(e) => {
          commit(e.target.value);
          setOpen(true);
          setActiveIndex(0);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          window.setTimeout(() => setOpen(false), 120);
        }}
        onKeyDown={(e) => {
          if (!show) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActiveIndex((index) => Math.min(index + 1, Math.max(matches.length - 1, 0)));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActiveIndex((index) => Math.max(index - 1, 0));
          } else if (e.key === "Enter" && matches[activeIndex]) {
            e.preventDefault();
            pick(matches[activeIndex]);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
        placeholder={placeholder}
        className="w-full rounded-xl border border-line bg-white px-3.5 py-2.5 text-sm text-ink placeholder:text-mute focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/20"
      />
      {show ? (
        <ul
          id={`${fieldId}-list`}
          role="listbox"
          className="absolute z-30 mt-1 max-h-72 w-full overflow-auto rounded-xl border border-line bg-white py-1 shadow-lg"
        >
          {matches.length ? matches.map((option, index) => (
            <li key={option.id}>
              <button
                type="button"
                role="option"
                aria-selected={index === activeIndex}
                className={`flex w-full items-start justify-between gap-3 px-3 py-2 text-left text-sm ${index === activeIndex ? "bg-brand-50" : "hover:bg-paper"}`}
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => pick(option)}
              >
                <span className="min-w-0">
                  <span className="block break-words leading-snug">{markMatch(option.label, needle)}</span>
                  {option.hint ? <span className="mt-0.5 block break-words text-[11px] text-mute">{markMatch(option.hint, needle)}</span> : null}
                </span>
              </button>
            </li>
          )) : (
            <li className="px-3 py-2 text-sm text-mute">{pt("No products match this search.")}</li>
          )}
          {more ? <li className="px-3 py-1.5 text-[11px] text-mute">{pt("Keep typing to narrow the list.")}</li> : null}
        </ul>
      ) : null}
    </div>
  );
}

export function FilterTabs({ tabs, counts, value, onChange, label }) {
  const { lang } = useLanguage();
  const pt = (value) => adminText(lang, value);
  return (
    <div className="mb-4 flex flex-wrap gap-1 rounded-xl border border-line bg-white p-1" role="tablist" aria-label={label}>
      {tabs.map((tab) => {
        const active = value === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(tab.id)}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              active ? "bg-brand-600 text-white" : "text-mute hover:bg-brand-50 hover:text-ink"
            }`}
          >
            {pt(tab.label)}
            <span className={`tabular-nums text-[11px] ${active ? "text-white/80" : "text-mute"}`}>{counts[tab.id] ?? 0}</span>
          </button>
        );
      })}
    </div>
  );
}


export const STICKY_ACTION_TH =
  "sticky right-0 top-0 z-20 bg-brand-50 px-3 py-2 shadow-[-8px_0_12px_-8px_rgba(16,21,19,0.2)]";
export const STICKY_ACTION_TD =
  "sticky right-0 z-[1] bg-white px-3 py-2 shadow-[-8px_0_12px_-8px_rgba(16,21,19,0.14)]";

export function ViewToggle({ value, onChange, label = "RFQ view" }) {
  const { lang } = useLanguage();
  const pt = (value) => adminText(lang, value);
  return (
    <div className="inline-flex rounded-lg border border-line bg-white p-1" role="group" aria-label={pt(label)}>
      {[
        { id: "card", label: "Cards" },
        { id: "list", label: "List" },
      ].map((item) => {
        const active = value === item.id;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onChange(item.id)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${
              active ? "bg-brand-600 text-white" : "text-mute hover:bg-brand-50 hover:text-ink"
            }`}
          >
            {pt(item.label)}
          </button>
        );
      })}
    </div>
  );
}

