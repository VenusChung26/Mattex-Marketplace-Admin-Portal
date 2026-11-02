import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useNavigate } from "react-router-dom";
import { useStore } from "../hooks/useStore";
import { useLanguage } from "../i18n";
import { withLocale } from "../lib/locale";
import { closeAuthModal, consumePendingAfterAuth, consumePendingInviteContinue, cancelPendingWhatsappInvite, currentMemberOrderSeed, loginUser, setAuthInviteHidden } from "../lib/store";
import { useRevealFormIssue } from "../lib/formFocus";
import { PasswordInput } from "./AccountForm";
import GuestSubmitFields from "./GuestSubmitFields";
import { emptyGuestOrder, guestOrderError, guestOrderPayload } from "../lib/guestOrder";

function readLoginFields(form, email, password) {
  const emailValue = form?.querySelector('input[type="email"]')?.value;
  const passwordValue = form?.querySelector('input[name="password"]')?.value;
  return {
    email: String(emailValue ?? email ?? ""),
    password: String(passwordValue ?? password ?? ""),
  };
}

export default function AuthModal({ open, onClose }) {
  const { t, lang } = useLanguage();
  const { authModalMode, user } = useStore();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [guestInfo, setGuestInfo] = useState(() => emptyGuestOrder());
  const [guestField, setGuestField] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [dontShow, setDontShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const closeReady = useRef(false);
  const { formRef, revealIssue } = useRevealFormIssue();
  const cartInvite = authModalMode === "cart-invite";
  const invite = authModalMode !== "required";
  const whatsappContact = invite && !cartInvite;
  const memberOrder = Boolean(user?.email) && whatsappContact;

  useEffect(() => {
    if (!open) return undefined;
    closeReady.current = false;
    const readyTimer = window.setTimeout(() => {
      closeReady.current = true;
    }, 280);
    setError("");
    setDontShow(false);
    setEmail("");
    setGuestInfo(user?.email && invite && !cartInvite ? currentMemberOrderSeed() : emptyGuestOrder());
    setGuestField("");
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

  function guestErrorText(code) {
    if (code === "company") return t("guestCompanyRequired");
    if (code === "address") return t("guestAddressRequired");
    if (code === "contact") return t("guestContactRequired");
    if (code === "email") return t("guestEmailInvalid");
    if (code === "phone" || code === "phone2") return t("guestPhoneRequired");
    if (code === "project") return t("guestProjectRequired");
    if (code === "delivery_date") return t("deliveryDateRequired");
    if (code === "attachment") return t("guestAttachmentRequired");
    return t("submitFailed");
  }

  function onGuestSubmit(e) {
    e.preventDefault();
    const missing = guestOrderError(guestInfo);
    if (missing) {
      setGuestField(missing);
      setError(guestErrorText(missing));
      revealIssue();
      return;
    }
    setGuestField("");
    finish();
    consumePendingInviteContinue(guestOrderPayload(guestInfo));
  }

  async function onSubmit(e) {
    e.preventDefault();
    if (busy) return;
    const fields = readLoginFields(e.currentTarget, email, password);
    if (fields.email !== email) setEmail(fields.email);
    if (fields.password !== password) setPassword(fields.password);
    setBusy(true);
    let result;
    try {
      result = await loginUser({ email: fields.email, password: fields.password });
    } catch {
      result = { ok: false, error: "network" };
    } finally {
      setBusy(false);
    }
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

  const title = memberOrder
    ? t("guestOrderSection")
    : cartInvite
      ? t("cartAuthInviteTitle")
      : invite
        ? t("authInviteTitle")
        : t("authRequiredTitle");
  const body = memberOrder
    ? t("guestOrderHint")
    : cartInvite
      ? t("cartAuthInviteBody")
      : invite
        ? t("authInviteBody")
        : t("authRequiredBody");
  const eyebrow = memberOrder ? t("authInviteEyebrow") : invite ? t("authInviteEyebrow") : t("almostThere");

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[80] overflow-y-auto" role="presentation">
      <div className="absolute inset-0 bg-charcoal/50 backdrop-blur-[2px]" onClick={onBackdrop} />
      <div className="relative flex min-h-full items-center justify-center p-4">
        <div
          className={`modal-panel relative bg-white border border-line w-full ${whatsappContact ? "max-w-3xl" : "max-w-md"} max-h-[calc(100dvh-2rem)] overflow-y-auto p-7 shadow-[0_24px_60px_rgba(16,21,19,0.25)]`}
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
              <GuestSubmitFields
                value={guestInfo}
                errorField={guestField}
                includeRemark
                onChange={(next) => {
                  setGuestInfo(next);
                  setGuestField("");
                  setError("");
                }}
              />
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
                {busy ? `${t("login")}…` : t("login")}
              </button>
            </form>
          )}

          {memberOrder ? null : whatsappContact ? (
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
