/**
 * Mail safety. Only the production deployment may email real people.
 * Local development and preview/UAT send everything to one test inbox, with [DEV] / [UAT] in the
 * subject and a line saying who it was meant for. This is the single choke point: every sender
 * (RFQ, PO, account, password mail) goes through sendResendEmail, which calls routeMail.
 */

const DEFAULT_TEST_INBOX = "resend@mattex.com.hk";

export function mailEnvironment(env = process.env) {
  const vercel = String(env.VERCEL_ENV || "").toLowerCase();
  if (vercel === "production") return "production";
  if (vercel === "preview") return "UAT";
  return "DEV";
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function routeMail({ to, subject, html }, env = process.env) {
  const where = mailEnvironment(env);
  if (where === "production") return { to, subject, html, redirected: false, environment: where };
  const inbox = String(env.MAIL_TEST_INBOX || DEFAULT_TEST_INBOX).trim().toLowerCase();
  const banner = `<div style="margin:0;padding:10px 16px;background:#fff4d6;color:#5b4300;font:13px/1.4 Arial,sans-serif;">[${where}] test mail. Intended for: ${escapeHtml(to)}</div>`;
  const body = /<body[^>]*>/i.test(html) ? html.replace(/(<body[^>]*>)/i, `$1${banner}`) : `${banner}${html}`;
  return { to: inbox, subject: `[${where}] ${subject}`, html: body, redirected: true, environment: where, intendedTo: to };
}
