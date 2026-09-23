import { useState } from "react";
import { useLanguage } from "../i18n";
import { absUrl, publicOrigin } from "../lib/locale";

function CopyIcon({ className = "h-3.5 w-3.5" }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden>
      <rect x="9" y="9" width="11" height="11" rx="1.5" />
      <path d="M5 15V5h10" />
    </svg>
  );
}

export default function CopyLinkButton({ path, hash = "", className = "", variant = "button" }) {
  const { t } = useLanguage();
  const [copied, setCopied] = useState(false);

  async function copy(event) {
    event?.preventDefault();
    event?.stopPropagation();
    const pathname = typeof path === "string" ? path : path?.pathname || "/";
    const nextHash = String(hash || (typeof path === "object" ? path.hash : "") || "").replace(/^#/, "");
    const url = `${absUrl(publicOrigin(), pathname)}${nextHash ? `#${nextHash}` : ""}`;
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2200);
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        return;
      }
    } catch {
      /* fallback below */
    }
    const input = document.createElement("input");
    input.value = url;
    document.body.appendChild(input);
    input.select();
    document.execCommand("copy");
    input.remove();
  }

  if (variant === "icon") {
    return (
      <button
        type="button"
        onClick={copy}
        title={copied ? t("linkCopied") : t("copyLink")}
        aria-label={copied ? t("linkCopied") : t("copyLink")}
        className={`inline-flex h-7 w-7 shrink-0 items-center justify-center text-mute hover:text-brand-700 hover:bg-brand-50 ${className}`.trim()}
      >
        {copied ? <span className="text-[11px] font-bold text-brand-700">✓</span> : <CopyIcon />}
      </button>
    );
  }

  const label = copied ? t("linkCopied") : t("copyLink");

  return (
    <button
      type="button"
      onClick={copy}
      title={label}
      aria-label={label}
      className={`inline-flex items-center gap-1.5 shrink-0 text-xs font-semibold tracking-wide text-mute hover:text-brand-700 transition-colors ${className}`.trim()}
    >
      {copied ? <span className="text-[11px] font-bold text-brand-700">✓</span> : <CopyIcon />}
      <span>{label}</span>
    </button>
  );
}
