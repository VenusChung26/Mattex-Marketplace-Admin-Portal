import test from "node:test";
import assert from "node:assert/strict";
import { secureSessionCookie } from "../api/auth.js";

const cookie = "mm_buyer=abc; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=60";

test("localhost http drops the Secure flag so the browser keeps the session", () => {
  const request = new Request("http://localhost:5182/api/auth", { method: "POST" });
  const next = secureSessionCookie(cookie, request);
  assert.equal(next.includes("Secure"), false);
  assert.match(next, /HttpOnly/);
  assert.match(next, /SameSite=Lax/);
});

test("https keeps the Secure flag", () => {
  const request = new Request("https://marketplace.mattex.com.hk/api/auth", {
    method: "POST",
    headers: { "x-forwarded-proto": "https" },
  });
  assert.match(secureSessionCookie(cookie, request), /;\s*Secure/);
});
