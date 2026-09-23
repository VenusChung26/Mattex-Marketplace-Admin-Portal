import { useLanguage } from "../i18n";

function GridIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden="true">
      <path d="M4 4h7v7H4V4zm9 0h7v7h-7V4zM4 13h7v7H4v-7zm9 0h7v7h-7v-7z" />
    </svg>
  );
}

function ListIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden="true">
      <path d="M4 6h2v2H4V6zm5 0h11v2H9V6zM4 11h2v2H4v-2zm5 0h11v2H9v-2zM4 16h2v2H4v-2zm5 0h11v2H9v-2z" />
    </svg>
  );
}

export default function CatalogViewToggle({
  value,
  onChange,
  tone = "dark",
  compact = false,
}) {
  const { t } = useLanguage();
  const dark = tone === "dark";
  const pad = compact ? "px-3 py-2" : "px-3 py-3";

  function buttonClass(active) {
    if (dark) {
      return `inline-flex items-center justify-center ${pad} ${active ? "bg-white text-charcoal" : "text-white/80 hover:bg-white/10"}`;
    }
    return `inline-flex items-center justify-center ${pad} ${active ? "bg-brand-600 text-white" : "text-brand-800 hover:bg-brand-50"}`;
  }

  return (
    <div
      className={`shrink-0 inline-flex border ${dark ? "border-white/30" : "border-line bg-white"}`}
      role="group"
      aria-label={t("catalogView")}
    >
      <button
        type="button"
        onClick={() => onChange("card")}
        className={buttonClass(value === "card")}
        aria-pressed={value === "card"}
        aria-label={t("viewCard")}
        title={t("viewCard")}
      >
        <GridIcon />
        <span className="sr-only">{t("viewCard")}</span>
      </button>
      <button
        type="button"
        onClick={() => onChange("list")}
        className={buttonClass(value === "list")}
        aria-pressed={value === "list"}
        aria-label={t("viewList")}
        title={t("viewList")}
      >
        <ListIcon />
        <span className="sr-only">{t("viewList")}</span>
      </button>
    </div>
  );
}
