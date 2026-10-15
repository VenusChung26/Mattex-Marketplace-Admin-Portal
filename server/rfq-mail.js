import {
  MARKETPLACE_LOGO_URL,
  rfqAcceptedEmailHtml,
  rfqCancelAcceptedEmailHtml,
  rfqCancelDeclinedEmailHtml,
  rfqCancelRequestedEmailHtml,
  rfqNoOfferEmailHtml,
  rfqReverseAcceptedEmailHtml,
  rfqReverseDeclinedEmailHtml,
  rfqReverseRequestedEmailHtml,
  MARKETPLACE_PUBLIC_ORIGIN,
  poReceivedEmailHtml,
  rfqSubmittedEmailHtml,
  salesNewPoEmailHtml,
  salesNewRfqEmailHtml,
  wrapEmailSend,
} from "../src/lib/mailTemplate.js";
import { mailEnvironment } from "./mail-env.js";

/**
 * Mail for new RFQ and PO. Built and sent by the server when the record is created, so the browser
 * never chooses recipients or content. A failed mail never fails the order: the result is kept on the
 * record (`mail`) so Sales can see it in the portal and resend.
 */

const SALES = "sales@mattex.com.hk";
const SALES_COPY = "resend@mattex.com.hk";
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const SEND_TIMEOUT_MS = 8000;

export function salesRecipients(env = process.env) {
  // Production: Sales plus the resend@ copy. Elsewhere everything lands in one test inbox anyway.
  return mailEnvironment(env) === "production" ? [SALES, SALES_COPY] : [SALES];
}

function contactOf(record) {
  return [record.buyerName, record.buyerEmail, record.buyerPhone].filter(Boolean).join(" · ") || "No contact details";
}

/**
 * Which lifecycle mail an RFQ activity needs, or "" when none. A member cancelling by themselves
 * (nothing for Sales to decide) and a direct "revise" send no mail, as before.
 */
export function mailEventFor(activity) {
  const kind = String(activity?.kind || "");
  if (kind === "cancel_accepted") return activity?.detail === "buyer" ? "" : "cancel_accepted";
  return ["accepted", "no_offer", "cancel_requested", "cancel_declined", "reverse_requested", "reverse_accepted", "reverse_declined", "resubmitted"].includes(kind) ? kind : "";
}

const LIFECYCLE = {
  accepted: { to: "buyer", subject: (id) => `Your RFQ ${id} is in review`, html: rfqAcceptedEmailHtml },
  no_offer: { to: "buyer", subject: (id) => `No offer on RFQ ${id}`, html: rfqNoOfferEmailHtml },
  cancel_requested: { to: "sales", subject: (id) => `Cancel requested for RFQ ${id}`, html: rfqCancelRequestedEmailHtml },
  cancel_accepted: { to: "buyer", subject: (id) => `RFQ ${id} was cancelled`, html: rfqCancelAcceptedEmailHtml },
  cancel_declined: { to: "buyer", subject: (id) => `RFQ ${id} remains open`, html: rfqCancelDeclinedEmailHtml },
  reverse_requested: { to: "sales", subject: (id) => `Reverse requested for RFQ ${id}`, html: rfqReverseRequestedEmailHtml },
  reverse_accepted: { to: "buyer", subject: (id) => `You can revise RFQ ${id}`, html: rfqReverseAcceptedEmailHtml },
  reverse_declined: { to: "buyer", subject: (id) => `RFQ ${id} remains in review`, html: rfqReverseDeclinedEmailHtml },
  resubmitted: { to: "sales", subject: (id) => `RFQ ${id} resubmitted by buyer`, html: salesNewRfqEmailHtml },
};

/** The mail one RFQ event needs: [{ event, role, to, subject, innerHtml }] */
export function lifecycleMailsFor(event, record, { origin = MARKETPLACE_PUBLIC_ORIGIN, env = process.env } = {}) {
  const spec = LIFECYCLE[event];
  if (!spec) return [];
  const ctx = {
    logoUrl: MARKETPLACE_LOGO_URL,
    salesEmail: SALES,
    name: String(record.buyerName || "there").trim() || "there",
    rfqId: record.id,
    buyerName: String(record.buyerName || "Buyer").trim() || "Buyer",
    project: String(record.project || "").trim(),
    reason: String(record.reason || "").trim(),
    lineCount: (record.lines || []).length,
    rfqsHref: `${origin}/zh/rfqs`,
    shopHref: `${origin}/zh`,
  };
  const subject = spec.subject(record.id);
  if (spec.to === "sales") {
    return salesRecipients(env).map((to) => ({ event, role: "sales", to, subject, innerHtml: spec.html(ctx) }));
  }
  const buyerTo = EMAIL.test(String(record.buyerEmail || "")) ? String(record.buyerEmail).toLowerCase() : "";
  if (!buyerTo) return [];
  return [{ event, role: "buyer", to: buyerTo, subject, innerHtml: spec.html({ ...ctx, toEmail: buyerTo }) }];
}

/** The mails a new record needs: [{ role, to, subject, innerHtml }] */
export function mailsFor(kind, record, { origin = MARKETPLACE_PUBLIC_ORIGIN, env = process.env, event } = {}) {
  if (event) return lifecycleMailsFor(event, record, { origin, env });
  const base = {
    logoUrl: MARKETPLACE_LOGO_URL,
    salesEmail: SALES,
    rfqsHref: `${origin}/zh/rfqs`,
    shopHref: `${origin}/zh`,
  };
  const name = String(record.buyerName || "there").trim() || "there";
  const buyerTo = EMAIL.test(String(record.buyerEmail || "")) ? String(record.buyerEmail).toLowerCase() : "";
  const out = [];
  if (kind === "po") {
    if (buyerTo) {
      out.push({
        role: "buyer",
        to: buyerTo,
        subject: `We received your order ${record.id}`,
        innerHtml: poReceivedEmailHtml({ ...base, name, poId: record.id, lines: record.lines, total: record.total, toEmail: buyerTo }),
      });
    }
    for (const to of salesRecipients(env)) {
      out.push({
        role: "sales",
        to,
        subject: `New purchase order ${record.id} from Marketplace`,
        innerHtml: salesNewPoEmailHtml({
          ...base,
          poId: record.id,
          buyerName: record.buyerName || "Buyer",
          buyerContact: contactOf(record),
          lines: record.lines,
          total: record.total,
        }),
      });
    }
    return out;
  }
  if (buyerTo) {
    out.push({
      role: "buyer",
      to: buyerTo,
      subject: `We received your RFQ ${record.id}`,
      innerHtml: rfqSubmittedEmailHtml({
        ...base,
        name,
        rfqId: record.id,
        project: record.project || "",
        lineCount: (record.lines || []).length,
        toEmail: buyerTo,
      }),
    });
  }
  for (const to of salesRecipients(env)) {
    out.push({
      role: "sales",
      to,
      subject: `New RFQ ${record.id} from Marketplace`,
      innerHtml: salesNewRfqEmailHtml({
        ...base,
        rfqId: record.id,
        buyerName: record.buyerName || "Buyer",
        project: record.project || "",
        lineCount: (record.lines || []).length,
      }),
    });
  }
  return out;
}

function withTimeout(promise, ms) {
  return Promise.race([promise, new Promise((resolve) => setTimeout(() => resolve({ ok: false, error: "timeout" }), ms))]);
}

/**
 * Sends the mails and returns the log entries to keep on the record.
 * `send({ to, subject, html })` returns { ok, error? }.
 * `only` limits to entries that previously failed (resend).
 */
export async function deliver(kind, record, send, { origin, env = process.env, only, event } = {}) {
  const wanted = mailsFor(kind, record, { origin, env, event }).filter((mail) => !only || only.some((e) => e.role === mail.role && e.to === mail.to));
  const log = [];
  for (const mail of wanted) {
    const html = wrapEmailSend({ subject: mail.subject, innerHtml: mail.innerHtml, fontBase: origin || MARKETPLACE_PUBLIC_ORIGIN });
    let result;
    try {
      result = await withTimeout(send({ to: mail.to, subject: mail.subject, html }), SEND_TIMEOUT_MS);
    } catch (error) {
      result = { ok: false, error: String(error?.message || "send") };
    }
    log.push({
      ...(event ? { event } : {}),
      role: mail.role,
      to: mail.to,
      subject: mail.subject,
      status: result?.ok ? "sent" : "failed",
      error: result?.ok ? "" : String(result?.error || "send").slice(0, 200),
      at: new Date().toISOString(),
    });
  }
  return log;
}

/** Keep the newest entry per role+to. */
export function mergeMailLog(previous, fresh) {
  const key = (e) => `${e.event || ""}|${e.role}|${e.to}`;
  const map = new Map((previous || []).map((e) => [key(e), e]));
  for (const entry of fresh || []) map.set(key(entry), entry);
  return [...map.values()];
}
