import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLanguage } from "../i18n";
import { useStore } from "../hooks/useStore";
import { acceptContactToken, sendContactOtp, verifyContactOtp } from "../lib/contactVerify";
import { closeContactVerifyModal, getContactVerifyRequest, noteContactVerified } from "../lib/store";

const OTP_LENGTH = 6;
const RESEND_SECONDS = 60;

const COPY = {
  zh: {
    close: "關閉",
    edit: "修改",
    sending: "正在傳送驗證碼…",
    sentTo: "驗證碼已傳送至",
    resend: "重新傳送驗證碼",
    resendIn: (s) => `${s}秒後可重新傳送`,
    verifying: "正在驗證…",
  },
  en: {
    close: "Close",
    edit: "Edit",
    sending: "Sending code…",
    sentTo: "Code sent to",
    resend: "Resend code",
    resendIn: (s) => `Resend in ${s}s`,
    verifying: "Verifying…",
  },
};

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
  const copy = lang === "en" ? COPY.en : COPY.zh;
  const { contactVerifyOpen } = useStore();
  const req = getContactVerifyRequest();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const [devCode, setDevCode] = useState("");
  const [trustNote, setTrustNote] = useState(false);
  const [linkDone, setLinkDone] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const inputRefs = useRef([]);
  const autoSentRef = useRef(false);
  const submittingRef = useRef(false);

  const isOpen = Boolean(contactVerifyOpen && req?.open);
  const showManual = Boolean(isOpen && req.email && req.phone) && !(req.link && !linkDone);

  useEffect(() => {
    if (!isOpen) {
      setCode("");
      setBusy(false);
      setSending(false);
      setVerifying(false);
      setError("");
      setSent(false);
      setDevCode("");
      setTrustNote(false);
      setLinkDone(false);
      setCooldown(0);
      autoSentRef.current = false;
      submittingRef.current = false;
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
  }, [isOpen, t]);

  useEffect(() => {
    if (!showManual || autoSentRef.current) return;
    autoSentRef.current = true;
    sendCode();
  }, [showManual]);

  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const timer = window.setTimeout(() => setCooldown((s) => Math.max(0, s - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  useEffect(() => {
    if (!isOpen) return undefined;
    function onKey(event) {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      if (!busy) closeContactVerifyModal({ ok: false });
    }
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [isOpen, busy]);

  useEffect(() => {
    if (!showManual) return;
    const clean = code.replace(/\D/g, "");
    if (clean.length === OTP_LENGTH && !submittingRef.current) confirmCode(clean);
  }, [code, showManual]);

  if (!isOpen || typeof document === "undefined") return null;

  function focusBox(index) {
    const clamped = Math.max(0, Math.min(OTP_LENGTH - 1, index));
    inputRefs.current[clamped]?.focus();
  }

  function handleDigitChange(index, event) {
    const raw = event.target.value.replace(/\D/g, "");
    const next = toDigitsArray(code);
    if (error) setError("");
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
    if (error) setError("");
    const startIndex = pasted.length === OTP_LENGTH ? 0 : index;
    const slice = pasted.slice(0, OTP_LENGTH - startIndex);
    for (let i = 0; i < slice.length; i += 1) {
      next[startIndex + i] = slice[i];
    }
    setCode(fromDigitsArray(next));
    focusBox(Math.min(startIndex + slice.length, OTP_LENGTH - 1));
  }

  async function sendCode() {
    if (sending) return;
    setSending(true);
    setError("");
    const result = await sendContactOtp({
      email: req.email,
      phone: req.phone,
      name: req.name,
      lang,
    });
    setSending(false);
    if (result.verified) {
      noteContactVerified(result.trustDays);
      setTrustNote(true);
      closeContactVerifyModal({ ok: true });
      return;
    }
    if (!result.ok) {
      if (result.error === "cooldown") setCooldown(RESEND_SECONDS);
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
    setCooldown(RESEND_SECONDS);
    if (result.devCode) setDevCode(String(result.devCode));
    setTimeout(() => focusBox(0), 0);
  }

  async function confirmCode(cleanCode) {
    if (submittingRef.current || cleanCode.length !== OTP_LENGTH) return;
    submittingRef.current = true;
    setVerifying(true);
    setBusy(true);
    setError("");
    const result = await verifyContactOtp({ email: req.email, phone: req.phone, code: cleanCode });
    setBusy(false);
    setVerifying(false);
    if (!result.ok) {
      setError(
        result.error === "expired"
          ? t("contactVerifyExpired")
          : result.error === "code"
            ? t("contactVerifyBadCode")
            : t("contactVerifyFailed")
      );
      setCode("");
      submittingRef.current = false;
      setTimeout(() => focusBox(0), 0);
      return;
    }
    noteContactVerified(result.trustDays);
    setTrustNote(true);
    closeContactVerifyModal({ ok: true });
  }

  function onSubmit(event) {
    event.preventDefault();
    confirmCode(code.replace(/\D/g, ""));
  }

  const digitsReady = code.replace(/\D/g, "").length === OTP_LENGTH;

  return createPortal(
    <div className="fixed inset-0 z-[120] overflow-y-auto bg-ink/40 p-4" role="dialog" aria-modal="true" aria-labelledby="contact-verify-title">
      <div className="flex min-h-full items-center justify-center">
        <div className="relative w-full max-w-sm border border-line bg-white p-6 shadow-xl">
          <button
            type="button"
            className="absolute right-3 top-3 inline-flex h-8 w-8 items-center justify-center text-xl leading-none text-mute transition hover:bg-brand-50 hover:text-ink disabled:opacity-50"
            aria-label={copy.close}
            title={copy.close}
            disabled={busy}
            onClick={() => closeContactVerifyModal({ ok: false })}
          >
            ×
          </button>
          <h2 id="contact-verify-title" className="pr-8 font-display text-xl font-semibold text-brand-800">
            {t("contactVerifyTitle")}
          </h2>
          <p className="mt-2 text-sm text-mute">{t("contactVerifyBody")}</p>
          {req.email || req.phone ? (
            <div className="mt-4 flex items-start justify-between gap-3 border border-line bg-paper/60 px-3 py-2.5">
              <div className="min-w-0 text-sm">
                {sent || sending ? <p className="text-xs text-mute">{sent ? copy.sentTo : copy.sending}</p> : null}
                {req.email ? <p className="break-all font-semibold text-ink">{req.email}</p> : null}
                {req.phone ? <p className="text-mute">{req.phone}</p> : null}
              </div>
              <button
                type="button"
                className="shrink-0 text-sm font-semibold text-brand-700 underline-offset-2 hover:underline disabled:opacity-50"
                disabled={busy}
                onClick={() => closeContactVerifyModal({ ok: false })}
              >
                {copy.edit}
              </button>
            </div>
          ) : null}
          {trustNote ? <p className="mt-3 text-sm text-brand-700">{t("contactVerifyTrustNote")}</p> : null}
          {showManual ? (
            <form className="mt-5" onSubmit={onSubmit}>
              <span className="block text-center text-sm font-semibold text-ink">{t("contactVerifyCode")}</span>
              <div className="mt-3 flex items-center justify-center gap-2.5">
                {Array.from({ length: OTP_LENGTH }, (_, index) => {
                  const digit = (code[index] || "").trim();
                  return (
                    <input
                      key={index}
                      ref={(el) => {
                        inputRefs.current[index] = el;
                      }}
                      className={`h-12 w-10 border bg-white p-0 text-center text-xl font-semibold tabular-nums text-ink caret-brand-600 outline-none transition focus:border-brand-600 focus:ring-2 focus:ring-brand-600/30 sm:w-11 ${
                        digit ? "border-brand-600 bg-brand-50/60" : "border-line"
                      } ${error ? "border-[#dc2626]" : ""}`}
                      inputMode="numeric"
                      autoComplete={index === 0 ? "one-time-code" : "off"}
                      aria-label={`${t("contactVerifyCode")} ${index + 1} / ${OTP_LENGTH}`}
                      aria-invalid={error ? "true" : undefined}
                      readOnly={busy}
                      value={digit}
                      onFocus={(event) => event.target.select()}
                      onChange={(event) => handleDigitChange(index, event)}
                      onKeyDown={(event) => handleDigitKeyDown(index, event)}
                      onPaste={(event) => handleDigitPaste(index, event)}
                    />
                  );
                })}
              </div>
              {devCode ? <p className="mt-2 text-center text-xs text-mute">Dev code: {devCode}</p> : null}
              {error ? <p className="mt-3 text-center text-sm text-[#8a2b2b]">{error}</p> : null}
              <button type="submit" className="btn-primary mt-5 w-full disabled:cursor-not-allowed disabled:opacity-50" disabled={busy || !digitsReady}>
                {verifying ? copy.verifying : t("contactVerifyConfirm")}
              </button>
              <p className="mt-3 text-center text-sm">
                {cooldown > 0 ? (
                  <span className="tabular-nums text-mute">{copy.resendIn(cooldown)}</span>
                ) : (
                  <button
                    type="button"
                    className="font-semibold text-brand-700 underline-offset-2 hover:underline disabled:text-mute disabled:no-underline"
                    disabled={busy || sending}
                    onClick={sendCode}
                  >
                    {sending ? copy.sending : copy.resend}
                  </button>
                )}
              </p>
            </form>
          ) : null}
          {!showManual && error ? <p className="mt-3 text-sm text-[#8a2b2b]">{error}</p> : null}
          {busy && req.link && !linkDone ? <p className="mt-3 text-sm text-mute">{t("contactVerifyChecking")}</p> : null}
        </div>
      </div>
    </div>,
    document.body
  );
}
