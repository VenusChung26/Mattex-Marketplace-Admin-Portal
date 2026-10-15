import test from "node:test";
import assert from "node:assert/strict";
import { deliver, mailsFor, mergeMailLog } from "./rfq-mail.js";

const po = {
  id: "PO-26000001",
  buyerEmail: "Buyer@Client.com",
  buyerName: "Ann",
  lines: [{ sku: "MKT-A", name: "A", qty: 2, unit: "pc", unitPrice: 5, lineTotal: 10 }],
  total: 10,
};
const rfq = { id: "RFQ-26000001", buyerEmail: "buyer@client.com", buyerName: "Ann", project: "P", lines: [{}] };
const prod = { VERCEL_ENV: "production" };

test("production: buyer receipt plus Sales and the resend@ copy", () => {
  const mails = mailsFor("po", po, { env: prod });
  assert.deepEqual(mails.map((m) => [m.role, m.to]), [
    ["buyer", "buyer@client.com"],
    ["sales", "sales@mattex.com.hk"],
    ["sales", "resend@mattex.com.hk"],
  ]);
  assert.match(mails[0].subject, /PO-26000001/);
  assert.match(mails[0].innerHtml, /HKD 10\.00/);
});

test("outside production Sales gets one mail, not two", () => {
  assert.equal(mailsFor("rfq", rfq, { env: {} }).filter((m) => m.role === "sales").length, 1);
});

test("a guest without a usable email gets no buyer mail but Sales still hears", () => {
  const mails = mailsFor("rfq", { ...rfq, buyerEmail: "" }, { env: {} });
  assert.deepEqual(mails.map((m) => m.role), ["sales"]);
});

test("a failing send is logged, never thrown, and can be resent alone", async () => {
  let calls = 0;
  const flaky = async ({ to }) => (to === "buyer@client.com" && calls++ === 0 ? { ok: false, error: "boom" } : { ok: true });
  const first = await deliver("po", po, flaky, { env: prod });
  assert.deepEqual(first.map((e) => e.status), ["failed", "sent", "sent"]);
  assert.equal(first[0].error, "boom");

  const failed = first.filter((e) => e.status === "failed");
  const again = await deliver("po", po, flaky, { env: prod, only: failed });
  assert.equal(again.length, 1);
  assert.equal(again[0].status, "sent");
  assert.deepEqual(mergeMailLog(first, again).map((e) => e.status), ["sent", "sent", "sent"]);
});

test("a thrown sender is caught", async () => {
  const log = await deliver("rfq", rfq, async () => {
    throw new Error("down");
  }, { env: {} });
  assert.ok(log.every((e) => e.status === "failed" && e.error === "down"));
});

import { lifecycleMailsFor, mailEventFor, mergeMailLog as mergeLog } from "./rfq-mail.js";

test("lifecycle mail: which activity sends what, and to whom", () => {
  assert.equal(mailEventFor({ kind: "accepted" }), "accepted");
  assert.equal(mailEventFor({ kind: "cancel_accepted", detail: "buyer" }), "");
  assert.equal(mailEventFor({ kind: "cancel_accepted", by: "sales@x" }), "cancel_accepted");
  assert.equal(mailEventFor({ kind: "reversed" }), "");
  assert.equal(mailEventFor({ kind: "quoted" }), "");

  const rec = { id: "RFQ-26000009", buyerEmail: "Buyer@Example.com", buyerName: "B", project: "p", reason: "too far" };
  const buyer = lifecycleMailsFor("no_offer", rec, { env: { VERCEL_ENV: "production" } });
  assert.equal(buyer.length, 1);
  assert.equal(buyer[0].to, "buyer@example.com");
  assert.match(buyer[0].subject, /No offer on RFQ RFQ-26000009/);
  const sales = lifecycleMailsFor("cancel_requested", rec, { env: { VERCEL_ENV: "production" } });
  assert.deepEqual(sales.map((m) => m.to), ["sales@mattex.com.hk", "resend@mattex.com.hk"]);
  assert.deepEqual(lifecycleMailsFor("accepted", { id: "X", buyerEmail: "" }), []);
});

test("mail log keeps one entry per event, so a later event never hides an earlier one", () => {
  const log = mergeLog([{ event: "accepted", role: "buyer", to: "a@b.co", status: "sent" }], [{ event: "no_offer", role: "buyer", to: "a@b.co", status: "failed" }]);
  assert.equal(log.length, 2);
  const again = mergeLog(log, [{ event: "no_offer", role: "buyer", to: "a@b.co", status: "sent" }]);
  assert.equal(again.length, 2);
  assert.equal(again.find((e) => e.event === "no_offer").status, "sent");
});
