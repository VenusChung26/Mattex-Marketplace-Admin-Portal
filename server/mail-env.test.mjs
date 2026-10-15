import test from "node:test";
import assert from "node:assert/strict";
import { mailEnvironment, routeMail } from "./mail-env.js";

const mail = { to: "buyer@client.com", subject: "We received your RFQ", html: "<html><body><p>Hi</p></body></html>" };

test("only VERCEL_ENV=production counts as production", () => {
  assert.equal(mailEnvironment({ VERCEL_ENV: "production" }), "production");
  assert.equal(mailEnvironment({ VERCEL_ENV: "preview" }), "UAT");
  assert.equal(mailEnvironment({ VERCEL_ENV: "development" }), "DEV");
  assert.equal(mailEnvironment({}), "DEV");
  assert.equal(mailEnvironment({ NODE_ENV: "production" }), "DEV");
});

test("production mail is untouched", () => {
  const out = routeMail(mail, { VERCEL_ENV: "production" });
  assert.equal(out.to, "buyer@client.com");
  assert.equal(out.subject, mail.subject);
  assert.equal(out.redirected, false);
});

test("DEV and UAT go to the test inbox with a prefix and a note of the real recipient", () => {
  const dev = routeMail(mail, {});
  assert.equal(dev.to, "resend@mattex.com.hk");
  assert.equal(dev.subject, "[DEV] We received your RFQ");
  assert.match(dev.html, /Intended for: buyer@client\.com/);
  assert.equal(routeMail(mail, { VERCEL_ENV: "preview" }).subject, "[UAT] We received your RFQ");
  assert.equal(routeMail(mail, { MAIL_TEST_INBOX: "Qa@Mattex.com.hk" }).to, "qa@mattex.com.hk");
});

test("the intended recipient is escaped in the banner", () => {
  const out = routeMail({ ...mail, to: '"><script>x</script>@a.com' }, {});
  assert.doesNotMatch(out.html, /<script>/);
});
