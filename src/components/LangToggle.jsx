import { useLanguage } from "../i18n";

/** Compact Eng / 中 toggle for headers */
export default function LangToggle({ light = false }) {
  const { lang, setLang, t } = useLanguage();
  const base = light
    ? "border-white/25 text-white/70 hover:text-white hover:bg-white/10"
    : "border-line text-mute hover:text-brand-600 hover:border-brand-600";
  const active = light
    ? "bg-white text-charcoal border-white"
    : "bg-brand-600 text-white border-brand-600";

  return (
    <div className="inline-flex items-center border overflow-hidden text-xs font-semibold" role="group" aria-label="Language">
      <button
        type="button"
        className={`px-2.5 py-1.5 transition-colors ${lang === "en" ? active : base}`}
        onClick={() => setLang("en")}
        aria-pressed={lang === "en"}
      >
        {t("langEn")}
      </button>
      <button
        type="button"
        className={`px-2.5 py-1.5 transition-colors border-l ${lang === "zh" ? active : base} ${light ? "border-l-white/25" : "border-l-line"}`}
        onClick={() => setLang("zh")}
        aria-pressed={lang === "zh"}
      >
        {t("langZh")}
      </button>
    </div>
  );
}
