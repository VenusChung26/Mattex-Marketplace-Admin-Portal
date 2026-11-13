import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useLanguage } from "../i18n";
import { useStore } from "../hooks/useStore";
import { acceptContactToken, sendContactOtp, verifyContactOtp } from "../lib/contactVerify";
import { closeContactVerifyModal, getContactVerifyRequest, noteContactVerified } from "../lib/store";

export default function ContactVerifyModal() {
  const { t, lang } = useLanguage();
  const { contactVerifyOpen } = useStore();
  const req = getContactVerifyRequest();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const [devCode, setDevCode] = useState("");
  const [trustNote, setTrustNote] = useState(false);
  const [linkDone, setLinkDone] = useState(false);

  useEffect(() => {
    if (!contactVerifyOpen || !req?.open) {
      setCode("");
      setBusy(false);
      setError("");
      setSent(false);
      setDevCode("");
      setTrustNote(false);
      setLinkDone(false);
      return undefined;
    }
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");
    const flag = params.get("verifyContact");
    if (flag === "1" && token) {
      setBusy(true);
      acceptContactToken(token).then((result) => {
        setBusy(false);
        setLinkDone(true);
        const url = new URL(window.location.href);
        url.searchParams.delete("token");
        url.searchParams.delete("verifyContact");
        window.history.replaceState({}, "", url.pathname + url.search + url.hash);
        if (result.ok && result.verified) {
          noteContactVerified(result.trustDays);
          setTrustNote(true);
          closeContactVerifyModal({ ok: true });
          return;
        }
        setError(result.error === "expired" ? t("contactVerifyExpired") : t("contactVerifyFailed"));
      });
    }
    return undefined;
  }, [contactVerifyOpen, req?.open, t]);

  if (!contactVerifyOpen || !req?.open || typeof document === "undefined") return null;

  async function sendCode() {
    setBusy(true);
    setError("");
    const result = await sendContactOtp({
      email: req.email,
      phone: req.phone,
      name: req.name,
      lang,
    });
    setBusy(false);
    if (result.verified) {
      noteContactVerified(result.trustDays);
      setTrustNote(true);
      closeContactVerifyModal({ ok: true });
      return;
    }
    if (!result.ok) {
      setError(
        result.error === "cooldown"
          ? t("contactVerifyCooldown")
          : result.error === "rate"
            ? t("contactVerifyRate")
            : t("contactVerifySendFailed")
      );
      return;
    }
    setSent(true);
    if (result.devCode) setDevCode(String(result.devCode));
  }

  async function confirmCode(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const result = await verifyContactOtp({ email: req.email, phone: req.phone, code });
    setBusy(false);
    if (!result.ok) {
      setError(
        result.error === "expired"
          ? t("contactVerifyExpired")
          : result.error === "code"
            ? t("contactVerifyBadCode")
            : t("contactVerifyFailed")
      );
      return;
    }
    noteContactVerified(result.trustDays);
    setTrustNote(true);
    closeContactVerifyModal({ ok: true });
  }

  const showManual = Boolean(req.email && req.phone) && !(req.link && !linkDone);

  return createPortal(
    <div className="fixed inset-0 z-[120] overflow-y-auto bg-ink/40 p-4" role="dialog" aria-modal="true">
      <div className="flex min-h-full items-center justify-center">
      <div className="w-full max-w-md border border-line bg-white p-5 shadow-xl">
        <h2 className="font-display text-xl font-semibold text-brand-800">{t("contactVerifyTitle")}</h2>
        <p className="mt-2 text-sm text-mute">{t("contactVerifyBody")}</p>
        {req.email ? (
          <p className="mt-3 text-sm text-ink">
            <span className="font-semibold">{t("email")}:</span> {req.email}
          </p>
        ) : null}
        {req.phone ? (
          <p className="text-sm text-ink">
            <span className="font-semibold">{t("phone")}:</span> {req.phone}
          </p>
        ) : null}
        {trustNote ? <p className="mt-3 text-sm text-brand-700">{t("contactVerifyTrustNote")}</p> : null}
        {showManual ? (
          <>
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" className="btn-primary" disabled={busy} onClick={sendCode}>
                {sent ? t("contactVerifyResend") : t("contactVerifySend")}
              </button>
              <button type="button" className="btn-secondary" disabled={busy} onClick={() => closeContactVerifyModal({ ok: false })}>
                {t("cancel")}
              </button>
            </div>
            {devCode ? <p className="mt-2 text-xs text-mute">Dev code: {devCode}</p> : null}
            {sent ? (
              <form className="mt-4 space-y-3" onSubmit={confirmCode}>
                <label className="block text-sm font-semibold text-ink">
                  {t("contactVerifyCode")}
                  <input
                    className="field-input mt-1 w-full tracking-[0.35em] text-lg font-semibold"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    value={code}
                    onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                  />
                </label>
                <button type="submit" className="btn-primary" disabled={busy || code.length !== 6}>
                  {t("contactVerifyConfirm")}
                </button>
              </form>
            ) : null}
          </>
        ) : (
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" className="btn-secondary" disabled={busy} onClick={() => closeContactVerifyModal({ ok: false })}>
              {t("cancel")}
            </button>
          </div>
        )}
        {error ? <p className="mt-3 text-sm text-[#8a2b2b]">{error}</p> : null}
        {busy && req.link && !linkDone ? <p className="mt-3 text-sm text-mute">{t("contactVerifyChecking")}</p> : null}
      </div>
      </div>
    </div>,
    document.body
  );
}
