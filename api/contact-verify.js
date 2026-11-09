import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { readSession, secureSessionCookie } from "./auth.js";
import { sendResendEmail } from "./send-email.js";
import { renderMattexEmail, wrapEmailSend } from "../src/lib/mailTemplate.js";

const TRUST_COOKIE = "mm_contact_v";
const TRUST_DAYS = 14;
const OTP_TTL_MS = 10 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;
const MAX_SENDS_PER_HOUR = 5;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const OTP_FILE = join(dirname(fileURLToPath(import.meta.url)), "../data/contact-otp.json");
const OTP_KV_PREFIX = "contact_otp:";
const SALES_EMAIL = "sales@mattex.com.hk";

function secret() {
  const value = process.env.SESSION_SECRET || "";
  if (value.length >= 32) return value;
  if (process.env.VERCEL || process.env.VERCEL_ENV) throw new Error("auth_not_configured");
  return "local-dev-only-session-secret-mattex-32";
}

function sign(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", secret()).update(body).digest("base64url");
  return `${body}.${sig}`;
}

function unsign(value) {
  const [body, sig] = String(value || "").split(".");
  if (!body || !sig) return null;
  const expected = createHmac("sha256", secret()).update(body).digest();
  const given = Buffer.from(sig, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    return payload.exp > Date.now() ? payload : null;
  } catch {
    return null;
  }
}

function readCookie(request, name) {
  const header = request?.headers?.get?.("cookie") || "";
  const hit = header.split(/;\s*/).find((part) => part.startsWith(`${name}=`));
  return hit ? decodeURIComponent(hit.slice(name.length + 1)) : "";
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function normalizePhone(phone) {
  return String(phone || "").replace(/\s+/g, " ").trim();
}

export function contactFingerprint(email, phone) {
  return createHash("sha256").update(`${normalizeEmail(email)}|${normalizePhone(phone)}`).digest("hex");
}

function siteOrigin(request) {
  if (process.env.VERCEL_ENV === "production" && process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  try {
    return new URL(request.url).origin;
  } catch {
    return "http://localhost:5182";
  }
}

function trustCookie(email, phone) {
  const value = sign({
    kind: "contact_ok",
    email: normalizeEmail(email),
    phone: normalizePhone(phone),
    fp: contactFingerprint(email, phone),
    exp: Date.now() + TRUST_DAYS * 24 * 60 * 60 * 1000,
  });
  return `${TRUST_COOKIE}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${TRUST_DAYS * 24 * 60 * 60}`;
}

function readOtpFile() {
  try {
    return JSON.parse(readFileSync(OTP_FILE, "utf8")) || {};
  } catch {
    return {};
  }
}

function writeOtpFile(map) {
  mkdirSync(dirname(OTP_FILE), { recursive: true });
  writeFileSync(OTP_FILE, JSON.stringify(map));
}

async function readOtpRow(fp) {
  const client = db();
  if (client) {
    const { data } = await client.from("app_kv").select("value").eq("key", `${OTP_KV_PREFIX}${fp}`).maybeSingle();
    if (data?.value && typeof data.value === "object") return data.value;
    return null;
  }
  return readOtpFile()[fp] || null;
}

async function writeOtpRow(fp, row) {
  const client = db();
  if (client) {
    if (!row) {
      await client.from("app_kv").delete().eq("key", `${OTP_KV_PREFIX}${fp}`);
      return;
    }
    await client.from("app_kv").upsert({
      key: `${OTP_KV_PREFIX}${fp}`,
      value: row,
      updated_at: new Date().toISOString(),
    });
    return;
  }
  const map = readOtpFile();
  if (!row) delete map[fp];
  else map[fp] = row;
  writeOtpFile(map);
}

function hashCode(code) {
  return createHash("sha256").update(String(code)).digest("hex");
}

function db() {
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function markBuyerVerified(email, phone) {
  const client = db();
  if (!client) return;
  const address = normalizeEmail(email);
  const { data } = await client.from("user_accounts").select("extra").eq("email", address).eq("kind", "buyer").maybeSingle();
  const extra = data?.extra && typeof data.extra === "object" ? data.extra : {};
  await client
    .from("user_accounts")
    .update({
      extra: {
        ...extra,
        contactVerifiedAt: new Date().toISOString(),
        contactVerifiedEmail: address,
        contactVerifiedPhone: normalizePhone(phone),
        contactVerifiedFp: contactFingerprint(email, phone),
      },
    })
    .eq("email", address)
    .eq("kind", "buyer");
}

function otpEmailHtml({ logoUrl, name, code, verifyHref, shopHref, toEmail }) {
  return renderMattexEmail({
    logoUrl,
    salesEmail: SALES_EMAIL,
    toEmail,
    title: "Verify your email for Mattex Marketplace",
    greeting: `Hi ${name || "there"},`,
    paragraphs: [
      "Use this code to verify your contact details before requesting a quote or placing an order.",
      `Your verification code is: ${code}`,
      "The code expires in 10 minutes.",
    ],
    buttonLabel: "Verify email",
    buttonHref: verifyHref,
    footnote: "If the button does not work, open Marketplace and enter the code manually.",
    footerLinks: [
      { label: "Back to Marketplace", href: shopHref },
      { label: "Contact", href: `mailto:${SALES_EMAIL}` },
    ],
  });
}

function guestTrusted(request, email, phone) {
  const payload = unsign(readCookie(request, TRUST_COOKIE));
  if (!payload || payload.kind !== "contact_ok") return false;
  return payload.fp === contactFingerprint(email, phone);
}

async function memberVerified(request, email, phone) {
  const session = readSession(request, "buyer");
  if (!session) return false;
  if (normalizeEmail(session.email) !== normalizeEmail(email)) return false;
  const client = db();
  if (!client) {
    // Local / no DB: trust cookie still counts for the logged-in buyer fingerprint.
    return guestTrusted(request, email, phone);
  }
  const { data } = await client.from("user_accounts").select("extra,phone").eq("email", session.email).eq("kind", "buyer").maybeSingle();
  const extra = data?.extra && typeof data.extra === "object" ? data.extra : {};
  if (extra.contactVerifiedFp && extra.contactVerifiedFp === contactFingerprint(email, phone || data?.phone || "")) return true;
  return guestTrusted(request, email, phone || data?.phone || "");
}

export async function isContactVerified(request, { email, phone } = {}) {
  const address = normalizeEmail(email);
  const tel = normalizePhone(phone);
  if (!address || !tel || !EMAIL_RE.test(address)) return false;
  if (await memberVerified(request, address, tel)) return true;
  return guestTrusted(request, address, tel);
}

async function sendOtp(body, request) {
  const email = normalizeEmail(body?.email);
  const phone = normalizePhone(body?.phone);
  const name = String(body?.name || "").trim() || "there";
  const lang = body?.lang === "en" ? "en" : "zh";
  if (!EMAIL_RE.test(email) || !phone) return { status: 400, body: { ok: false, error: "invalid" } };
  if (await isContactVerified(request, { email, phone })) {
    return { body: { ok: true, verified: true } };
  }

  const fp = contactFingerprint(email, phone);
  const existing = (await readOtpRow(fp)) || { sends: [] };
  const hourAgo = Date.now() - 60 * 60 * 1000;
  const sends = (existing.sends || []).filter((t) => t > hourAgo);
  if (sends.length >= MAX_SENDS_PER_HOUR) return { body: { ok: false, error: "rate" } };
  if (existing.sentAt && Date.now() - existing.sentAt < RESEND_COOLDOWN_MS) return { body: { ok: false, error: "cooldown" } };

  const code = String(Math.floor(100000 + Math.random() * 900000));
  const linkToken = sign({
    kind: "contact_link",
    email,
    phone,
    fp,
    exp: Date.now() + OTP_TTL_MS,
  });
  await writeOtpRow(fp, {
    codeHash: hashCode(code),
    exp: Date.now() + OTP_TTL_MS,
    sentAt: Date.now(),
    sends: [...sends, Date.now()],
    attempts: 0,
  });

  const origin = siteOrigin(request);
  const shopHref = `${origin}/${lang}`;
  const verifyHref = `${origin}/${lang}?verifyContact=1&token=${encodeURIComponent(linkToken)}`;
  const html = wrapEmailSend({
    subject: "Verify your email — Mattex Marketplace",
    innerHtml: otpEmailHtml({
      logoUrl: `${origin}/assets/mattex-logo.webp`,
      name,
      code,
      verifyHref,
      shopHref,
      toEmail: email,
    }),
    fontBase: origin,
  });
  const mailed = await sendResendEmail({ to: email, subject: "Verify your email — Mattex Marketplace", html });
  if (!mailed.ok && process.env.VERCEL_ENV) return { status: 502, body: { ok: false, error: mailed.error || "mail" } };
  return {
    body: {
      ok: true,
      sent: true,
      // Local/dev only: surface code when Resend is missing so QA can proceed.
      ...(mailed.ok || process.env.VERCEL_ENV ? {} : { devCode: code }),
    },
  };
}

async function completeVerify(email, phone, request) {
  await markBuyerVerified(email, phone);
  const cookie = secureSessionCookie(trustCookie(email, phone), request);
  return { cookie, body: { ok: true, verified: true, trustDays: TRUST_DAYS } };
}

async function verifyOtp(body, request) {
  const email = normalizeEmail(body?.email);
  const phone = normalizePhone(body?.phone);
  const code = String(body?.code || "").trim();
  if (!EMAIL_RE.test(email) || !phone || !/^\d{6}$/.test(code)) return { status: 400, body: { ok: false, error: "invalid" } };
  if (await isContactVerified(request, { email, phone })) return { body: { ok: true, verified: true, trustDays: TRUST_DAYS } };

  const fp = contactFingerprint(email, phone);
  const row = await readOtpRow(fp);
  if (!row || row.exp < Date.now()) return { body: { ok: false, error: "expired" } };
  row.attempts = Number(row.attempts || 0) + 1;
  if (row.attempts > 8) {
    await writeOtpRow(fp, null);
    return { body: { ok: false, error: "locked" } };
  }
  const expected = Buffer.from(String(row.codeHash || ""), "hex");
  const given = Buffer.from(hashCode(code), "hex");
  const match = expected.length === given.length && timingSafeEqual(expected, given);
  if (!match) {
    await writeOtpRow(fp, row);
    return { body: { ok: false, error: "code" } };
  }
  await writeOtpRow(fp, null);
  return completeVerify(email, phone, request);
}

async function acceptToken(body, request) {
  const payload = unsign(body?.token);
  if (!payload || payload.kind !== "contact_link") return { body: { ok: false, error: "token" } };
  if (payload.exp <= Date.now()) return { body: { ok: false, error: "expired" } };
  const email = normalizeEmail(payload.email);
  const phone = normalizePhone(payload.phone);
  if (!email || !phone || payload.fp !== contactFingerprint(email, phone)) return { body: { ok: false, error: "token" } };
  await writeOtpRow(payload.fp, null);
  return completeVerify(email, phone, request);
}

async function status(body, request) {
  const session = readSession(request, "buyer");
  const email = normalizeEmail(body?.email || session?.email || "");
  const phone = normalizePhone(body?.phone || "");
  if (!email) return { body: { ok: true, verified: false } };
  const verified = phone ? await isContactVerified(request, { email, phone }) : guestTrusted(request, email, phone) || Boolean(session && (await memberVerified(request, email, phone)));
  return { body: { ok: true, verified: Boolean(verified), trustDays: TRUST_DAYS } };
}

const actions = {
  "send-otp": sendOtp,
  "verify-otp": verifyOtp,
  "accept-token": acceptToken,
  status,
};

export async function handleContactVerify(body, request) {
  const action = actions[body?.action];
  if (!action) return { status: 400, body: { ok: false, error: "invalid" } };
  try {
    return await action(body, request);
  } catch (error) {
    console.error("contact-verify", body?.action, error?.message || error);
    return { status: 500, body: { ok: false, error: error?.message === "auth_not_configured" ? "not_configured" : "server" } };
  }
}

export async function POST(request) {
  let body = {};
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "invalid" }, { status: 400 });
  }
  const result = await handleContactVerify(body, request);
  const headers = { "cache-control": "no-store" };
  if (result.cookie) headers["set-cookie"] = result.cookie;
  return Response.json(result.body, { status: result.status || 200, headers });
}
