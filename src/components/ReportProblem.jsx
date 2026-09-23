import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { createProductReport, isLoggedIn, productSkuId } from "../lib/store";
import { useLanguage } from "../i18n";
import { withLocale } from "../lib/locale";

export default function ReportProblem({ product, compact = true }) {
  const { t, lang } = useLanguage();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState("圖片不對");
  const [text, setText] = useState("");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    if (!open) return undefined;
    function onKey(e) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  if (!product?.id || product.discontinued) return null;

  function submit(e) {
    e.preventDefault();
    const result = createProductReport({
      productId: product.id,
      type,
      text,
    });
    if (!result.ok) return;
    setMsg(t("reportThanks"));
    setText("");
    setType("圖片不對");
  }

  return (
    <>
      <button
        type="button"
        className={
          compact
            ? "text-[11px] font-medium text-mute hover:text-brand-700 hover:underline"
            : "text-xs font-medium text-mute hover:text-brand-700 hover:underline"
        }
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen(true);
          setMsg("");
        }}
      >
        {t("reportProduct")}
      </button>
      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="presentation">
          <div className="absolute inset-0 bg-charcoal/50 backdrop-blur-[2px]" onClick={() => setOpen(false)} />
          <div
            className="modal-panel relative bg-white border border-line max-w-md w-full p-6 shadow-[0_24px_60px_rgba(16,21,19,0.25)]"
            role="dialog"
            aria-modal="true"
            aria-labelledby={`report-title-${product.id}`}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="absolute top-3.5 right-3.5 h-8 w-8 inline-flex items-center justify-center text-mute hover:text-ink hover:bg-paper transition-colors"
              onClick={() => setOpen(false)}
              aria-label={t("cancel")}
            >
              ×
            </button>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-600 mb-2">{productSkuId(product) || product.id}</p>
            <h3 id={`report-title-${product.id}`} className="font-display text-2xl font-semibold text-brand-800 leading-tight pr-8">
              {t("reportProduct")}
            </h3>
            <p className="mt-1 text-sm text-mute line-clamp-2">{product.name}</p>
            {msg ? (
              <p className="mt-4 text-sm text-brand-700">{msg}</p>
            ) : !isLoggedIn() ? (
              <p className="mt-4 text-sm text-mute">
                {t("reportNeedLogin")}{" "}
                <Link to={withLocale(lang, "/login")} className="text-brand-600 font-medium hover:underline">
                  {t("login")}
                </Link>
              </p>
            ) : (
              <form className="mt-4 space-y-3" onSubmit={submit}>
                <label className="block text-xs text-mute">
                  {t("reportType")}
                  <select
                    value={type}
                    onChange={(e) => setType(e.target.value)}
                    className="mt-1 w-full border border-line px-3 py-2 text-sm text-ink"
                  >
                    <option value="圖片不對">{t("reportPhoto")}</option>
                    <option value="資料不對">{t("reportData")}</option>
                    <option value="其他">{t("reportOther")}</option>
                  </select>
                </label>
                <textarea
                  required
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  className="w-full border border-line px-3 py-2 text-sm min-h-[72px]"
                />
                <div className="flex gap-2">
                  <button type="submit" className="btn-primary !py-2 !px-4 !text-sm">
                    {t("reportSubmit")}
                  </button>
                  <button type="button" className="btn-soft !py-2 !px-4 !text-sm" onClick={() => setOpen(false)}>
                    {t("cancel")}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
