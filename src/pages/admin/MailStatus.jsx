import { useCallback, useEffect, useState } from "react";
import { getRfqRecord, resendRecordMail } from "../../lib/remote";
import { adminText } from "../../lib/adminCopy";
import { useLanguage } from "../../i18n";

/**
 * Shows only the emails that failed for one PO or RFQ and lets staff resend them.
 * Display only: the server keeps the mail log and decides what is resent.
 * Pass `mail` when the record is already loaded (PO list); omit it to load an RFQ by id.
 */
export default function MailStatus({ id, mail, onRecord, note, className = "" }) {
  const { lang } = useLanguage();
  const pt = (value) => adminText(lang, value);
  const [loaded, setLoaded] = useState(null);
  const [busy, setBusy] = useState(false);
  const entries = mail || loaded || [];

  const load = useCallback(async () => {
    const result = await getRfqRecord(id);
    if (result.ok) setLoaded(result.record.mail || []);
  }, [id]);

  useEffect(() => {
    if (mail || !id) return undefined;
    setLoaded(null);
    load();
    return undefined;
  }, [id, mail, load]);

  const failed = entries.filter((entry) => entry.status === "failed");
  if (!failed.length) return null;

  async function resend() {
    setBusy(true);
    const result = await resendRecordMail(id);
    setBusy(false);
    if (!result.ok) {
      note?.({ ok: false, error: pt("Could not resend emails. Try again.") });
      return;
    }
    setLoaded(result.record.mail || []);
    onRecord?.(result.record);
    const stillFailed = (result.record.mail || []).some((entry) => entry.status === "failed");
    note?.(stillFailed ? { ok: false, error: pt("Some emails still failed. Try again later.") } : { ok: true }, pt("Emails sent"));
  }

  return (
    <div className={`flex flex-wrap items-center justify-between gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 ${className}`}>
      <span>
        {pt("Email not sent")}: {failed.map((entry) => `${entry.role === "buyer" ? pt("buyer") : pt("Sales")} (${entry.error || "error"})`).join(", ")}
      </span>
      <button
        type="button"
        disabled={busy}
        className="rounded-lg border border-red-300 bg-white px-3 py-1 text-xs font-semibold text-red-800 disabled:opacity-60"
        onClick={resend}
      >
        {busy ? pt("Sending…") : pt("Resend")}
      </button>
    </div>
  );
}
