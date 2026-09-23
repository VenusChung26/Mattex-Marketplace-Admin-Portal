import { createPortal } from "react-dom";
import CustomProductForm from "./CustomProductForm";
import { useLanguage } from "../i18n";

export default function CustomProductModal({ open, onClose, onSubmit, initial, baseProduct }) {
  const { t } = useLanguage();
  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4" role="presentation">
      <div className="absolute inset-0 bg-charcoal/50 backdrop-blur-[2px]" onClick={onClose} />
      <div
        className="modal-panel relative mx-auto w-[80vw] max-w-[80%] max-h-[min(92vh,56rem)] overflow-y-auto border border-line bg-white p-6 sm:p-8 shadow-[0_24px_60px_rgba(16,21,19,0.25)]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="custom-product-title"
      >
        <button
          type="button"
          className="absolute top-3.5 right-3.5 h-8 w-8 inline-flex items-center justify-center text-mute hover:text-ink hover:bg-paper transition-colors"
          onClick={onClose}
          aria-label={t("cancel")}
        >
          ×
        </button>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-600 mb-2">
          {baseProduct ? t("tailorMadeBadge") : t("customItem")}
        </p>
        <h3 id="custom-product-title" className="font-display text-2xl font-semibold text-brand-800 leading-tight pr-10">
          {baseProduct ? t("tailorMadeTitle") : t("addCustomProduct")}
        </h3>
        <p className="mt-2 text-sm text-mute leading-relaxed">
          {baseProduct ? t("tailorMadeHint", { name: baseProduct.name }) : t("customProductHint")}
        </p>
        <div className="mt-5">
          <CustomProductForm
            compact
            initial={initial}
            onSubmit={(payload) => {
              onSubmit(payload);
              onClose();
            }}
            onCancel={onClose}
          />
        </div>
      </div>
    </div>,
    document.body
  );
}
