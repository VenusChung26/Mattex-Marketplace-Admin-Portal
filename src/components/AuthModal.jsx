import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useNavigate } from "react-router-dom";
import { useStore } from "../hooks/useStore";
import { useLanguage } from "../i18n";
import { withLocale } from "../lib/locale";
import { closeAuthModal, consumePendingAfterAuth, consumePendingInviteContinue, cancelPendingWhatsappInvite, loginUser, setAuthInviteHidden } from "../lib/store";
import { useRevealFormIssue } from "../lib/formFocus";
import { PasswordInput, RequiredMark } from "./AccountForm";
import { BuyerPhoneFields } from "./BuyerContactFields";
import { contactPayload } from "../lib/phone";

const EMPTY_PHONE = {
  phoneRegion: "852",
  phoneOtherCode: "",
  phoneNational: "",
  addPhone: false,
  phone2Region: "852",
  phone2OtherCode: "",
  phone2National: "",
  whatsappOn: "",
  wechatOn: "",
};

export default function AuthModal({ open, onClose }) {
  const { t, lang } = useLanguage();
  const { authModalMode } = useStore();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [phoneForm, setPhoneForm] = useState(EMPTY_PHONE);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [dontShow, setDontShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const closeReady = useRef(false);
  const { formRef, revealIssue } = useRevealFormIssue();
  const cartInvite = authModalMode === "cart-invite";
  const invite = authModalMode !== "required";
  const whatsappContact = invite && !cartInvite;

  useEffect(() => {
    if (!open) return undefined;
    closeReady.current = false;
    const readyTimer = window.setTimeout(() => {
      closeReady.current = true;
    }, 280);
    setError("");
    setDontShow(false);
    setEmail("");
    setName("");
    setPhoneForm(EMPTY_PHONE);
    setPassword("");
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(e) {
      if (e.key === "Escape" && closeReady.current) {
        if (whatsappContact) cancelWhatsapp();
        else if (invite) dismissInvite();
        else onClose?.();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(readyTimer);
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose, invite, cartInvite, whatsappContact]);

  function finish() {
    closeAuthModal();
    onClose?.();
  }

  function dismissInvite() {
    if (!cartInvite && invite && dontShow) setAuthInviteHidden(true);
    closeAuthModal();
    onClose?.();
    if (!cartInvite) consumePendingInviteContinue();
  }

  function cancelWhatsapp() {
    cancelPendingWhatsappInvite();
    closeAuthModal();
    onClose?.();
  }

  function onBackdrop() {
    if (!closeReady.current) return;
    if (whatsappContact) cancelWhatsapp();
    else if (invite) dismissInvite();
    else onClose?.();
  }

  function setPhone(key, value) {
    setPhoneForm((prev) => ({ ...prev, [key]: value }));
  }

  function onGuestSubmit(e) {
    e.preventDefault();
    const next = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(next)) {
      setError(t("guestEmailInvalid"));
      revealIssue();
      return;
    }
    const phones = contactPayload(phoneForm);
    finish();
    consumePendingInviteContinue({
      email: next,
      name: name.trim(),
      phone: phones.phone,
      otherPhone: phones.otherPhone,
      whatsappOn: phones.whatsappOn,
      wechatOn: phones.wechatOn,
    });
  }

  async function onSubmit(e) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    const result = await loginUser({ email, password });
    setBusy(false);
    if (!result.ok) {
      setError(
        result.error === "password"
          ? t("loginErrorPassword")
          : result.error === "staff"
            ? t("loginErrorStaff")
            : result.error === "disabled"
              ? t("loginErrorDisabled")
              : result.error === "pending"
                ? t("loginErrorPending")
                : result.error === "rejected"
                  ? t("loginErrorRejected")
                  : result.error === "missing"
                    ? t("loginErrorMissing")
                    : t("loginErrorGeneric")
      );
      revealIssue();
      return;
    }
    if (!cartInvite && invite && dontShow) setAuthInviteHidden(true);
    finish();
    const next = consumePendingAfterAuth();
    if (next) navigate(withLocale(lang, next));
  }

  const title = cartInvite
    ? t("cartAuthInviteTitle")
    : invite
      ? t("authInviteTitle")
      : t("authRequiredTitle");
  const body = cartInvite
    ? t("cartAuthInviteBody")
    : invite
      ? t("authInviteBody")
      : t("authRequiredBody");
  const eyebrow = invite ? t("authInviteEyebrow") : t("almostThere");

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[80] overflow-y-auto" role="presentation">
      <div className="absolute inset-0 bg-charcoal/50 backdrop-blur-[2px]" onClick={onBackdrop} />
      <div className="relative flex min-h-full items-center justify-center p-4">
        <div
          className="modal-panel relative bg-white border border-line w-full max-w-md max-h-[calc(100dvh-2rem)] overflow-y-auto p-7 shadow-[0_24px_60px_rgba(16,21,19,0.25)]"
          role="dialog"
          aria-modal="true"
          aria-labelledby="auth-modal-title"
        >
          <button
            type="button"
            className="absolute top-3.5 right-3.5 h-8 w-8 inline-flex items-center justify-center text-mute hover:text-ink hover:bg-paper transition-colors"
            onClick={() => {
              if (!closeReady.current) return;
              if (whatsappContact) cancelWhatsapp();
              else if (invite) dismissInvite();
              else onClose?.();
            }}
            aria-label="Close"
          >
            ×
          </button>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-600 mb-2">{eyebrow}</p>
          <h3 id="auth-modal-title" className="font-display text-2xl font-semibold text-brand-800 leading-tight pr-8">
            {title}
          </h3>
          <p className="mt-3 text-sm text-mute leading-relaxed">{body}</p>

          {whatsappContact ? (
            <form ref={formRef} className="mt-5 space-y-3.5" onSubmit={onGuestSubmit}>
              {error ? (
                <p role="alert" tabIndex={-1} data-form-alert className="text-sm font-medium text-red-700 outline-none">
                  {error}
                </p>
              ) : null}
              <label className="block">
                <span className="block text-sm font-medium mb-1">
                  {t("email")} <RequiredMark />
                </span>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setError("");
                  }}
                  placeholder={t("phEmail")}
                  className="field-input"
                  autoComplete="email"
                />
              </label>
              <label className="block">
                <span className="block text-sm font-medium mb-1">{t("fullName")}</span>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t("phFullName")}
                  className="field-input"
                  autoComplete="name"
                />
              </label>
              <BuyerPhoneFields t={t} value={phoneForm} onChange={setPhone} required={false} />
              <button type="submit" className="btn-primary w-full !py-2.5">
                {t("continueWhatsapp")}
              </button>
            </form>
          ) : (
            <form ref={formRef} className="mt-5 space-y-3.5" onSubmit={onSubmit}>
              {error ? (
                <p role="alert" tabIndex={-1} data-form-alert className="text-sm font-medium text-red-700 outline-none">
                  {error}
                </p>
              ) : null}
              <label className="block">
                <span className="block text-sm font-medium mb-1">{t("email")}</span>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setError("");
                  }}
                  placeholder={t("phEmail")}
                  className="field-input"
                  autoComplete="email"
                />
              </label>
              <label className="block">
                <span className="block text-sm font-medium mb-1">{t("password")}</span>
                <PasswordInput
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setError("");
                  }}
                  placeholder={t("phPassword")}
                  autoComplete="current-password"
                />
              </label>
              <button type="submit" disabled={busy} className="btn-primary w-full !py-2.5 disabled:opacity-60">
                {t("login")}
              </button>
            </form>
          )}

          {whatsappContact ? (
            <p className="mt-4 text-sm text-mute">
              {t("alreadyAccount")}{" "}
              <Link to={withLocale(lang, "/login")} className="font-semibold text-brand-600 hover:underline" onClick={() => finish()}>
                {t("login")}
              </Link>
            </p>
          ) : (
            <>
              <p className="mt-3 text-sm">
                <Link to={withLocale(lang, "/forgot-password")} className="font-semibold text-brand-600 hover:underline" onClick={() => finish()}>
                  {t("forgotPassword")}
                </Link>
              </p>
              <p className="mt-4 text-sm text-mute">
                {t("noAccount")}{" "}
                <Link
                  to={withLocale(lang, "/signup")}
                  className="font-semibold text-brand-600 hover:underline"
                  onClick={() => {
                    if (cartInvite && dontShow) setAuthInviteHidden(true);
                    finish();
                  }}
                >
                  {t("openMarketplaceAccount")}
                </Link>
              </p>
              {cartInvite ? (
                <div className="mt-5 pt-4 border-t border-line">
                  <button type="button" className="btn-soft w-full !py-2.5" onClick={dismissInvite}>
                    {t("cartAuthInviteContinue")}
                  </button>
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
