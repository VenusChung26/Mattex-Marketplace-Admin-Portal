import { useEffect, useRef, useState } from "react";
import { useLanguage } from "../i18n";

export default function CategoryMultiSelect({
  categories,
  selected,
  onChange,
  compact = false,
  className = "",
}) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const selectedNames = Array.isArray(selected) ? selected : [];

  useEffect(() => {
    if (!open) return undefined;
    function onPointer(e) {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    }
    function onKey(e) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function toggle(name) {
    if (selectedNames.includes(name)) onChange(selectedNames.filter((item) => item !== name));
    else onChange([...selectedNames, name]);
  }

  const label =
    selectedNames.length === 0
      ? t("allCategories")
      : t("categoriesSelected", { n: selectedNames.length });

  return (
    <div ref={rootRef} className={`relative shrink-0 ${className}`}>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={t("category")}
        onClick={() => setOpen((v) => !v)}
        className={`field-input !rounded-none !border-0 !w-auto min-w-[12rem] max-w-[18rem] !bg-white !text-ink text-left flex items-center justify-between gap-2 ${
          compact ? "!py-2.5" : ""
        }`}
      >
        <span className="truncate">{label}</span>
        <span className="text-mute shrink-0 text-xs">{open ? "▴" : "▾"}</span>
      </button>
      {open ? (
        <div
          role="listbox"
          aria-multiselectable="true"
          className="absolute z-40 mt-1 w-72 max-w-[calc(100vw-2rem)] bg-white text-ink border border-line shadow-lg"
        >
          <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-line">
            <p className="text-xs font-semibold uppercase tracking-wide text-mute">{t("category")}</p>
            <button
              type="button"
              disabled={!selectedNames.length}
              onClick={() => onChange([])}
              className="text-xs font-semibold text-brand-700 hover:text-brand-800 disabled:opacity-35"
            >
              {t("deleteAllCategories")}
            </button>
          </div>
          <div className="max-h-72 overflow-y-auto py-1">
            {categories.map((c) => {
              const checked = selectedNames.includes(c.name);
              return (
                <label
                  key={c.id}
                  className="flex items-start gap-2 px-3 py-2 hover:bg-paper cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggle(c.name)}
                    className="mt-0.5"
                  />
                  <span className="text-sm leading-snug">{c.name}</span>
                </label>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function SelectedCategoryChips({ selected, onChange, tone = "dark" }) {
  const { t } = useLanguage();
  const selectedNames = Array.isArray(selected) ? selected : [];
  if (!selectedNames.length) return null;
  const dark = tone === "dark";

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {selectedNames.map((name) => (
        <button
          key={name}
          type="button"
          title={name}
          onClick={() => onChange(selectedNames.filter((item) => item !== name))}
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-semibold rounded-full border ${
            dark ? "border-white/40 bg-white/10 text-white" : "border-line bg-white text-ink"
          }`}
        >
          <span className="max-w-[14rem] truncate">{String(name).split(",")[0].trim()}</span>
          <span aria-hidden>×</span>
        </button>
      ))}
      <button
        type="button"
        onClick={() => onChange([])}
        className={`px-2.5 py-1 text-[11px] font-semibold ${
          dark ? "text-white/80 hover:text-white" : "text-brand-700 hover:text-brand-800"
        }`}
      >
        {t("deleteAllCategories")}
      </button>
    </div>
  );
}
