import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLanguage } from "../i18n";
import { useStore } from "../hooks/useStore";
import { acceptContactToken, sendContactOtp, verifyContactOtp } from "../lib/contactVerify";
import { closeContactVerifyModal, getContactVerifyRequest, noteContactVerified } from "../lib/store";

const OTP_LENGTH = 6;

function toDigitsArray(value) {
  return Array.from({ length: OTP_LENGTH }, (_, i) => {
    const ch = value[i];
    return ch && /\d/.test(ch) ? ch : "";
  });
}

function fromDigitsArray(digits) {
  return digits
    .map((d) => (d && /\d/.test(d) ? d : " "))
    .join("")
    .replace(/\s+$/, "");
}

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
  const inputRefs = useRef([]);

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

  useEffect(() => {
    if (sent) {
      inputRefs.current[0]?.focus();
    }
  }, [sent]);

  if (!contactVerifyOpen || !req?.open || typeof document === "undefined") return null;

  function focusBox(index) {
    const clamped = Math.max(0, Math.min(OTP_LENGTH - 1, index));
    inputRefs.current[clamped]?.focus();
  }

  function handleDigitChange(index, event) {
    const raw = event.target.value.replace(/\D/g, "");
    const next = toDigitsArray(code);
    if (!raw) {
      next[index] = "";
      setCode(fromDigitsArray(next));
      return;
    }
    const typed = (event.nativeEvent?.data || "").replace(/\D/g, "");
    if (raw.length === 1 || (typed.length === 1 && next[index] && raw.length === 2)) {
      next[index] = typed.length === 1 ? typed : raw;
      setCode(fromDigitsArray(next));
      if (index < OTP_LENGTH - 1) focusBox(index + 1);
      return;
    }
    const startIndex = raw.length >= OTP_LENGTH ? 0 : index;
    const slice = raw.slice(0, OTP_LENGTH - startIndex);
    for (let i = 0; i < slice.length; i += 1) {
      next[startIndex + i] = slice[i];
    }
    setCode(fromDigitsArray(next));
    focusBox(Math.min(startIndex + slice.length, OTP_LENGTH - 1));
  }

  function handleDigitKeyDown(index, event) {
    if (event.key === "Backspace") {
      event.preventDefault();
      const next = toDigitsArray(code);
      if (next[index]) {
        next[index] = "";
        setCode(fromDigitsArray(next));
      } else if (index > 0) {
        next[index - 1] = "";
        setCode(fromDigitsArray(next));
        focusBox(index - 1);
      }
      return;
    }
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      if (index > 0) focusBox(index - 1);
      return;
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      if (index < OTP_LENGTH - 1) focusBox(index + 1);
    }
  }

  function handleDigitPaste(index, event) {
    event.preventDefault();
    const text = event.clipboardData?.getData("text") || "";
    const pasted = text.replace(/\D/g, "").slice(0, OTP_LENGTH);
    if (!pasted) return;
    const next = toDigitsArray(code);
    const startIndex = pasted.length === OTP_LENGTH ? 0 : index;
    const slice = pasted.slice(0, OTP_LENGTH - startIndex);
    for (let i = 0; i < slice.length; i += 1) {
      next[startIndex + i] = slice[i];
    }
    setCode(fromDigitsArray(next));
    focusBox(Math.min(startIndex + slice.length, OTP_LENGTH - 1));
  }

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
    setTimeout(() => focusBox(0), 0);
  }

  async function confirmCode(event) {
    event.preventDefault();
    const cleanCode = code.replace(/\D/g, "");
    if (cleanCode.length !== OTP_LENGTH) return;
    setBusy(true);
    setError("");
    const result = await verifyContactOtp({ email: req.email, phone: req.phone, code: cleanCode });
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
                <div>
                  <span className="block text-sm font-semibold text-ink">{t("contactVerifyCode")}</span>
                  <div className="mt-2 flex items-center justify-between gap-2 sm:gap-2.5">
                    {Array.from({ length: OTP_LENGTH }, (_, index) => {
                      const digit = (code[index] || "").trim();
                      return (
                        <input
                          key={index}
                          ref={(el) => {
                            inputRefs.current[index] = el;
                          }}
                          className="field-input !w-11 sm:!w-12 !px-0 !py-2.5 text-center text-lg font-semibold tabular-nums"
                          inputMode="numeric"
                          autoComplete={index === 0 ? "one-time-code" : "off"}
                          aria-label={`${t("contactVerifyCode")} ${index + 1} / ${OTP_LENGTH}`}
                          value={digit}
                          onFocus={(event) => event.target.select()}
                          onChange={(event) => handleDigitChange(index, event)}
                          onKeyDown={(event) => handleDigitKeyDown(index, event)}
                          onPaste={(event) => handleDigitPaste(index, event)}
                        />
                      );
                    })}
                  </div>
                </div>
                <button type="submit" className="btn-primary" disabled={busy || code.replace(/\D/g, "").length !== OTP_LENGTH}>
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
