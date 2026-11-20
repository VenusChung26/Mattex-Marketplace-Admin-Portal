import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const buyersFile = join(root, "data/local-buyer-auth.json");
const email = "email-only-verify@example.test";
const other = "email-only-other@example.test";
const previousFetch = globalThis.fetch;
globalThis.fetch = async () => Response.json({ id: "test-mail" });
for (const key of ["SUPABASE_URL", "VITE_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "VERCEL", "VERCEL_ENV", "RESEND_API_KEY"]) delete process.env[key];
process.env.SESSION_SECRET = "contact-verify-test-secret-32-characters";
const { handleContactVerify } = await import("../api/contact-verify.js");
const { handleAuth } = await import("../api/auth.js");

function buyerCookie(address) {
  const payload = Buffer.from(JSON.stringify({ kind: "buyer", email: address, exp: Date.now() + 60_000 })).toString("base64url");
  const signature = createHmac("sha256", process.env.SESSION_SECRET).update(payload).digest("base64url");
  return `mm_buyer=${payload}.${signature}`;
}

function withCookie(cookie) {
  return new Request("http://localhost/api/contact-verify", { headers: cookie ? { cookie } : {} });
}

function cookiePair(setCookie) {
  return String(setCookie || "").split(";")[0];
}

async function verifyGuest(address) {
  const sent = await handleContactVerify({ action: "send-otp", email: address, phone: "90000001", name: "Buyer", lang: "zh" }, withCookie(""));
  assert.equal(sent.body.devCode?.length, 6);
  const verified = await handleContactVerify(
    { action: "verify-otp", email: address, phone: "90000099", code: sent.body.devCode },
    withCookie("")
  );
  assert.equal(verified.body.verified, true);
  return cookiePair(verified.cookie);
}

test.after(async () => {
  globalThis.fetch = previousFetch;
  const raw = JSON.parse(await readFile(buyersFile, "utf8").catch(() => "{}"));
  delete raw[email];
  delete raw[other];
  await writeFile(buyersFile, JSON.stringify(raw));
});

test("電郵驗證唔再綁電話", async () => {
  const cookie = await verifyGuest(email);
  const same = await handleContactVerify({ action: "status", email, phone: "11112222" }, withCookie(cookie));
  assert.equal(same.body.verified, true);
  const otherEmail = await handleContactVerify({ action: "status", email: other }, withCookie(cookie));
  assert.equal(otherEmail.body.verified, false);
  const stranger = await handleContactVerify({ action: "status", email }, withCookie(""));
  assert.equal(stranger.body.verified, false);

  const raw = JSON.parse(await readFile(buyersFile, "utf8").catch(() => "{}"));
  raw[email] = {
    salt: "abc",
    hash: "def",
    account: { email, kind: "buyer", enabled: true, extra: {} },
  };
  await writeFile(buyersFile, JSON.stringify(raw));
  const session = buyerCookie(email);
  const sent = await handleContactVerify({ action: "send-otp", email, name: "Buyer" }, withCookie(session));
  const verified = await handleContactVerify({ action: "verify-otp", email, code: sent.body.devCode }, withCookie(session));
  assert.equal(verified.body.verified, true);
  const later = await handleContactVerify({ action: "status", email }, withCookie(session));
  assert.equal(later.body.verified, true);

  const altSent = await handleContactVerify({ action: "send-otp", email: other, name: "Buyer" }, withCookie(session));
  const alt = await handleContactVerify({ action: "verify-otp", email: other, code: altSent.body.devCode }, withCookie(session));
  assert.equal(alt.body.verified, true);
  const saved = JSON.parse(await readFile(buyersFile, "utf8"));
  assert.equal(saved[email].account.extra.contactVerifiedEmail, email);
  assert.equal(saved[other], undefined);
  const accountOnly = await handleContactVerify({ action: "status", email: other }, withCookie(session));
  assert.equal(accountOnly.body.verified, false);

  const guestCookie = await verifyGuest(other);
  const signup = await handleAuth(
    { action: "signup", email: other, password: "Secret123", profile: { name: "Buyer" } },
    withCookie(guestCookie)
  );
  assert.equal(signup.body.ok, true, JSON.stringify(signup.body));
  const afterSignup = JSON.parse(await readFile(buyersFile, "utf8"));
  assert.equal(afterSignup[other].account.extra.contactVerifiedEmail, other);
  const memberLater = await handleContactVerify({ action: "status", email: other }, withCookie(buyerCookie(other)));
  assert.equal(memberLater.body.verified, true);
});
