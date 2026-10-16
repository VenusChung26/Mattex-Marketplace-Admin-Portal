import test from "node:test";
import assert from "node:assert/strict";
import { applyDecision, planDecision } from "../src/lib/rfqRules.js";

const base = { id: "RFQ-26000001", reviewStatus: "received", lines: [{ productId: "a", quotedUnitPrice: 5 }] };
const at = "2026-10-14T10:00:00.000Z";

test("accept stamps time and staff and logs one activity", () => {
  const plan = planDecision(base, { decision: "accepted", by: "s@x.com", at });
  const next = applyDecision(base, plan.patch);
  assert.equal(next.reviewStatus, "accepted");
  assert.equal(next.acceptedBy, "s@x.com");
  assert.equal(next.acceptedAt, at);
  assert.equal(next.activity.length, 1);
});

test("accepting twice changes nothing", () => {
  const once = applyDecision(base, planDecision(base, { decision: "accepted", by: "s", at }).patch);
  assert.equal(planDecision(once, { decision: "accepted", by: "s", at }).noop, true);
});

test("no offer clears prices and marks every line", () => {
  const next = applyDecision(base, planDecision(base, { decision: "rejected", reason: "out of stock", by: "s", at }).patch);
  assert.equal(next.reviewStatus, "no_offer");
  assert.deepEqual(next.lines[0], { productId: "a", quotedUnitPrice: null, noOffer: true });
  assert.equal(next.reason, "out of stock");
});

test("cancelled, revising and pending cancel / reverse block accepting", () => {
  for (const state of [{ reviewStatus: "cancelled" }, { reviewStatus: "revising" }, { cancelStatus: "requested" }, { reverseStatus: "requested" }]) {
    assert.equal(planDecision({ ...base, ...state }, { decision: "accepted", by: "s", at }).noop, true);
  }
});

test("bad decision and return without a reason are refused", () => {
  assert.equal(planDecision(base, { decision: "banana" }).ok, false);
  assert.equal(planDecision(base, { decision: "returned", reason: " " }).error, "reason");
});

import { planCancelReverse } from "../src/lib/rfqRules.js";

const accepted = { ...base, reviewStatus: "accepted" };

test("buyer cancel before Sales acts is instant; after accept it is a request", () => {
  const instant = planCancelReverse(base, "buyer_cancel", { at });
  assert.equal(instant.patch.fields.reviewStatus, "cancelled");
  assert.equal(instant.notify, "cancelled");
  const asked = planCancelReverse(accepted, "buyer_cancel", { at });
  assert.equal(asked.patch.fields.cancelStatus, "requested");
  assert.equal(asked.notify, "cancel_requested");
  assert.equal(planCancelReverse({ ...accepted, cancelStatus: "requested" }, "buyer_cancel").noop, true);
});

test("a PO, no offer, or a pending request locks buyer cancel and reverse", () => {
  for (const state of [{ buyerPo: { id: "PO-1" } }, { reviewStatus: "no_offer" }, { reverseStatus: "requested" }]) {
    assert.equal(planCancelReverse({ ...accepted, ...state }, "buyer_cancel").error, "locked");
  }
  assert.equal(planCancelReverse({ ...accepted, cancelStatus: "requested" }, "buyer_reverse").error, "locked");
});

test("buyer reverse needs Sales once accepted, otherwise goes straight to revising", () => {
  assert.equal(planCancelReverse(base, "buyer_reverse", { at }).patch.fields.reviewStatus, "revising");
  const asked = planCancelReverse(accepted, "buyer_reverse", { at });
  assert.equal(asked.patch.fields.reverseStatus, "requested");
});

test("Sales answers only a pending request, and stamps who", () => {
  assert.equal(planCancelReverse(accepted, "cancel_accept", { by: "s" }).noop, true);
  const pending = { ...accepted, cancelStatus: "requested" };
  const ok = applyDecision(pending, planCancelReverse(pending, "cancel_accept", { by: "s@x.com", at }).patch);
  assert.equal(ok.reviewStatus, "cancelled");
  assert.equal(ok.cancelledBy, "s@x.com");
  const kept = applyDecision(pending, planCancelReverse(pending, "cancel_decline", { by: "s", at }).patch);
  assert.equal(kept.cancelStatus, "declined");
  assert.equal(kept.reviewStatus, "accepted");
});

test("accepting a reverse clears the request and enters revising", () => {
  const pending = { ...accepted, reverseStatus: "requested", reverseRequestedAt: at };
  const plan = planCancelReverse(pending, "reverse_accept", { by: "s", at });
  assert.equal(plan.patch.enterRevising, true);
  const next = applyDecision(pending, plan.patch);
  assert.equal(next.reviewStatus, "revising");
  assert.equal(next.reverseStatus, "");
});

import { planAssign, rfqBuyerKind } from "../src/lib/rfqRules.js";

const guestRfq = { ...base, buyerEmail: "", buyerName: "Walk-in", buyerPhone: "91234567" };
const member = { email: "Buyer@Example.com", name: "Real Buyer", phone: "99999999" };

test("guest kinds are recognised", () => {
  for (const email of ["", "__guest__", "guest@subbie.store", "guest@anything.com"]) assert.equal(rfqBuyerKind({ buyerEmail: email }), "guest");
  assert.equal(rfqBuyerKind({ buyerEmail: "a@b.com" }), "member");
  assert.equal(rfqBuyerKind({ buyerKind: "guest", buyerEmail: "walkin@example.com" }), "guest");
  assert.equal(rfqBuyerKind({ buyerKind: "member", buyerEmail: "" }), "member");
});

test("assigning a guest RFQ makes it a member RFQ, keeps the guest phone, and logs who", () => {
  const plan = planAssign(guestRfq, { buyer: member, by: "s@x.com", at });
  const next = applyDecision(guestRfq, plan.patch);
  assert.equal(next.buyerKind, "member");
  assert.equal(next.buyerEmail, "Buyer@Example.com");
  assert.equal(next.buyerName, "Real Buyer");
  assert.equal(next.buyerPhone, "91234567");
  assert.equal(next.activity[0].kind, "assigned");
  assert.equal(next.activity[0].by, "s@x.com");
});

test("a member RFQ cannot be reassigned, and a bad email is refused", () => {
  assert.equal(planAssign({ ...base, buyerEmail: "a@b.com" }, { buyer: member }).error, "locked");
  assert.equal(planAssign(guestRfq, { buyer: { email: "nope" } }).error, "missing_buyer");
});

test("a guest purchase order with a real email can be assigned once, and keeps its status", () => {
  const po = { id: "PO-26000009", buyerKind: "guest", buyerEmail: "walkin@example.com", buyerName: "Walk-in", buyerPhone: "91234567", status: "created" };
  const plan = planAssign(po, { buyer: member, by: "s@x.com", at });
  const next = applyDecision(po, plan.patch);
  assert.equal(next.buyerKind, "member");
  assert.equal(next.buyerEmail, "Buyer@Example.com");
  assert.equal(next.buyerPhone, "91234567");
  assert.equal(next.status, "created");
  assert.equal(planAssign(next, { buyer: member, at }).error, "locked");
});

test("assigning still works after a WhatsApp quote", () => {
  const sent = { ...guestRfq, quoteDelivery: "whatsapp", reviewStatus: "accepted" };
  assert.equal(planAssign(sent, { buyer: member, at }).ok, true);
});

import { planQuoteSubmit } from "../src/lib/rfqRules.js";

const memberRfq = { id: "RFQ-26000009", buyerEmail: "a@b.com", reviewStatus: "accepted", responseDate: "2026-11-01" };
const sheet = [
  { productId: "a", name: "A", qty: 2, quotedUnitPrice: 10 },
  { productId: "b", name: "B", qty: 1, quotedUnitPrice: "", noOffer: true },
];

test("submitting a quote freezes v1 with price, totals, time and staff", () => {
  const plan = planQuoteSubmit(memberRfq, { draftLines: sheet, note: " hi ", by: "s@x.com", at, token: "tok" });
  assert.equal(plan.ok, true);
  const next = applyDecision(memberRfq, plan.patch);
  assert.equal(next.reviewStatus, "quoted");
  assert.equal(next.quoteVersions.length, 1);
  assert.equal(next.quoteVersions[0].version, 1);
  assert.equal(next.quoteVersions[0].quotedSubtotal, 20);
  assert.equal(next.quoteVersions[0].quoteNote, "hi");
  assert.equal(next.quoteEffectiveVersion, 1);
  assert.equal(next.activity.at(-1).detail, "v1");
});

test("a second submit is v2 of the same RFQ and the known version is never reused", () => {
  const once = applyDecision(memberRfq, planQuoteSubmit(memberRfq, { draftLines: sheet, at, token: "t1" }).patch);
  const twice = planQuoteSubmit(once, { draftLines: sheet, at, token: "t2" });
  assert.equal(twice.patch.version.version, 2);
  assert.equal(twice.patch.version.token, "t2");
  const withWhatsapp = planQuoteSubmit(memberRfq, { draftLines: sheet, at, token: "t3", knownVersion: 2 });
  assert.equal(withWhatsapp.patch.version.version, 3);
});

test("a guest RFQ never gets a marketplace quote", () => {
  assert.equal(planQuoteSubmit({ ...memberRfq, buyerEmail: "" }, { draftLines: sheet }).error, "guest");
});

test("quote needs an accepted RFQ, every offered line priced, and no cancel or no-offer", () => {
  assert.equal(planQuoteSubmit({ ...memberRfq, reviewStatus: "received" }, { draftLines: sheet }).error, "not_accepted");
  assert.equal(planQuoteSubmit({ ...memberRfq, reviewStatus: "no_offer" }, { draftLines: sheet }).error, "rejected");
  assert.equal(planQuoteSubmit({ ...memberRfq, cancelStatus: "requested" }, { draftLines: sheet }).error, "cancel");
  assert.equal(planQuoteSubmit(memberRfq, { draftLines: [{ productId: "a", qty: 1, quotedUnitPrice: null }] }).error, "prices");
  assert.equal(planQuoteSubmit(memberRfq, { draftLines: [{ productId: "a", qty: 1, noOffer: true }] }).error, "prices");
});

import { planWhatsappFreeze, planWhatsappSent, publicQuoteView } from "../src/lib/rfqRules.js";

const guestAccepted = { id: "RFQ-26000010", buyerEmail: "", buyerPhone: "91234567", reviewStatus: "accepted", responseDate: "2026-11-01" };

test("WhatsApp freeze needs accepted, prices and a phone; it makes no version and no quoted status", () => {
  const ok = planWhatsappFreeze(guestAccepted, { draftLines: sheet, token: "tok", at });
  assert.equal(ok.ok, true);
  assert.equal(ok.patch.version, undefined);
  assert.equal(ok.patch.fields.reviewStatus, undefined);
  assert.equal(ok.patch.fields.quotePublicToken, "tok");
  assert.equal(ok.snapshot.quotedSubtotal, 20);
  assert.equal(planWhatsappFreeze({ ...guestAccepted, reviewStatus: "received" }, { draftLines: sheet, token: "t" }).error, "status");
  assert.equal(planWhatsappFreeze(guestAccepted, { draftLines: [{ productId: "a", qty: 1, quotedUnitPrice: null }], token: "t" }).error, "prices");
  assert.equal(planWhatsappFreeze({ ...guestAccepted, buyerPhone: "" }, { draftLines: sheet, token: "t" }).error, "phone");
});

test("Quote sent on WhatsApp adds a whatsapp version, keeps the status, and twice is one version", () => {
  const frozen = planWhatsappFreeze(guestAccepted, { draftLines: sheet, token: "tok", at });
  const rfq = applyDecision({ ...guestAccepted, ...frozen.patch.fields }, { fields: {} });
  const sent = planWhatsappSent(rfq, { snapshot: frozen.snapshot, by: "s@x.com", at });
  const next = applyDecision(rfq, sent.patch);
  assert.equal(next.quoteVersions[0].channel, "whatsapp");
  assert.equal(next.quoteVersions[0].version, 1);
  assert.equal(next.quoteDelivery, "whatsapp");
  assert.equal(next.reviewStatus, "accepted");
  const again = planWhatsappSent(next, { snapshot: frozen.snapshot, by: "s@x.com", at });
  assert.equal(again.patch.version, undefined);
  assert.equal(applyDecision(next, again.patch).quoteVersions.length, 1);
});

test("WhatsApp, then assign, then submit to buyer is one timeline: v1 whatsapp, v2 member", () => {
  const frozen = planWhatsappFreeze(guestAccepted, { draftLines: sheet, token: "tok", at });
  let rfq = { ...guestAccepted, ...frozen.patch.fields };
  rfq = applyDecision(rfq, planWhatsappSent(rfq, { snapshot: frozen.snapshot, at }).patch);
  rfq = applyDecision(rfq, planAssign(rfq, { buyer: member, by: "s", at }).patch);
  const submit = planQuoteSubmit(rfq, { draftLines: sheet, at, token: "t2" });
  assert.equal(submit.patch.version.version, 2);
  rfq = applyDecision(rfq, submit.patch);
  assert.deepEqual(rfq.quoteVersions.map((v) => [v.version, v.channel]), [[1, "whatsapp"], [2, "marketplace"]]);
});

test("a send without a frozen link is refused, and the public view hides contact details", () => {
  assert.equal(planWhatsappSent({ ...guestAccepted }, { snapshot: null }).error, "not_frozen");
  const frozen = planWhatsappFreeze(guestAccepted, { draftLines: sheet, token: "tok", at });
  const view = publicQuoteView({ ...frozen.snapshot, buyerPhone: "91234567", buyerEmail: "x@y.com" });
  assert.equal(JSON.stringify(view).includes("91234567"), false);
  assert.equal(view.rfqId, "RFQ-26000010");
});

import { mergeOwned, ownedView, planBuyerContent } from "../src/lib/rfqRules.js";

test("ownedView sends only server-owned fields, never mail or private snapshots", () => {
  const view = ownedView({ id: "RFQ-26000009", createdAt: "t", reviewStatus: "accepted", mail: [{ to: "x" }], quoteSnapshots: { a: 1 }, visitor: "v", revision: 4, payload: { lines: [1] } });
  assert.equal(view.reviewStatus, "accepted");
  assert.equal(view.mail, undefined);
  assert.equal(view.quoteSnapshots, undefined);
  assert.equal(view.visitor, undefined);
  assert.equal(view.payload, undefined);
});

test("mergeOwned takes the server's status but keeps the browser's own fields", () => {
  const local = { id: "A", reviewStatus: "received", lines: [{ qty: 3 }], tmsId: "9", activity: [{ id: "x", kind: "submitted", at: "2026-01-01T00:00:00Z" }] };
  const next = mergeOwned(local, { id: "A", reviewStatus: "accepted", activity: [{ id: "y", kind: "accepted", at: "2026-01-02T00:00:00Z" }] });
  assert.equal(next.reviewStatus, "accepted");
  assert.deepEqual(next.lines, [{ qty: 3 }]);
  assert.equal(next.tmsId, "9");
  assert.deepEqual(next.activity.map((row) => row.kind), ["submitted", "accepted"]);
});

test("mergeOwned does not undo a local reviewing mark with the server's received", () => {
  assert.equal(mergeOwned({ reviewStatus: "reviewing" }, { reviewStatus: "received" }).reviewStatus, "reviewing");
});

test("planBuyerContent only allows a returned or revising RFQ, and resubmit moves it back to received", () => {
  assert.equal(planBuyerContent({ reviewStatus: "accepted" }, { resubmit: true }).error, "locked");
  const back = planBuyerContent({ reviewStatus: "returned" }, { resubmit: true, at: "t" });
  assert.equal(back.patch.fields.reviewStatus, "received");
  const rev = planBuyerContent({ reviewStatus: "revising", reverseStatus: "accepted" }, { resubmit: true, at: "t" });
  assert.equal(rev.ok, true);
  assert.equal(rev.patch.fields.reverseStatus, "");
});

import { deliveredLinePrices, draftPricesOf } from "../src/lib/rfqRules.js";

test("a staff view carries the draft, a member view never does", () => {
  const record = { id: "A", reviewStatus: "accepted", draft: { prices: [{ productId: "1", quotedUnitPrice: 5, noOffer: false }] } };
  assert.ok(ownedView(record, { staff: true }).draft);
  assert.equal(ownedView(record).draft, undefined);
});

test("mergeOwned puts the server draft on the worksheet lines", () => {
  const next = mergeOwned({ lines: [{ productId: "1", qty: 2, quotedUnitPrice: null }, { productId: "2", qty: 1 }] }, { draft: { prices: [{ productId: "1", quotedUnitPrice: 9, noOffer: false }] } });
  assert.equal(next.lines[0].quotedUnitPrice, 9);
  assert.equal(next.lines[0].qty, 2);
  assert.equal(next.lines[1].quotedUnitPrice, undefined);
});

test("a shared copy shows delivered prices only, never the draft", () => {
  const rfq = {
    reviewStatus: "quoted",
    lines: [{ productId: "1", quotedUnitPrice: 99 }, { productId: "2", quotedUnitPrice: 50 }],
    quoteVersions: [{ version: 1, lines: [{ productId: "1", quotedUnitPrice: 105 }] }],
    quoteEffectiveVersion: 1,
  };
  const shown = deliveredLinePrices(rfq);
  assert.equal(shown[0].quotedUnitPrice, 105);
  assert.equal(shown[1].quotedUnitPrice, null);
  assert.equal(deliveredLinePrices({ lines: [{ productId: "1", quotedUnitPrice: 7 }] })[0].quotedUnitPrice, null);
});

test("draftPricesOf normalizes blanks and no-offer", () => {
  const out = draftPricesOf([{ productId: 1, quotedUnitPrice: "" }, { productId: 2, quotedUnitPrice: 3, noOffer: true }, { productId: 3, quotedUnitPrice: 4 }]);
  assert.deepEqual(out.map((row) => row.quotedUnitPrice), [null, null, 4]);
  assert.equal(out[1].noOffer, true);
});

import { freezeQuoteLines, salesLine } from "../src/lib/rfqRules.js";

test("Sales' qty and remark are separate from the member's, and are what gets quoted", () => {
  const line = { productId: "1", qty: 10, remark: "buyer note", salesQty: 12, salesRemark: "confirm lead", quotedUnitPrice: 5 };
  assert.equal(salesLine(line).qty, 12);
  assert.equal(salesLine({ productId: "1", qty: 10, remark: "x" }).qty, 10);
  const [frozen] = freezeQuoteLines([line]);
  assert.equal(frozen.qty, 12);
  assert.equal(frozen.remark, "confirm lead");
  assert.equal(frozen.lineTotal, 60);
  assert.equal(line.qty, 10);
});

test("the draft carries Sales' qty and remark, and a shared copy drops them", () => {
  const prices = draftPricesOf([{ productId: "1", qty: 10, salesQty: 12, salesRemark: "r", quotedUnitPrice: 5 }]);
  assert.equal(prices[0].salesQty, 12);
  assert.equal(prices[0].salesRemark, "r");
  const merged = mergeOwned({ lines: [{ productId: "1", qty: 10 }] }, { draft: { prices } });
  assert.equal(merged.lines[0].salesQty, 12);
  assert.equal(merged.lines[0].qty, 10);
  const shared = deliveredLinePrices({ lines: merged.lines });
  assert.equal(shared[0].salesQty, undefined);
  assert.equal(shared[0].salesRemark, undefined);
  assert.equal(shared[0].qty, 10);
});

import { planPoFromQuote } from "../src/lib/rfqRules.js";

const quotedRfq = {
  reviewStatus: "quoted",
  quoteEffectiveVersion: 2,
  quoteVersions: [
    { version: 1, lines: [{ productId: "a", name: "A", qty: 1, quotedUnitPrice: 100 }] },
    { version: 2, lines: [{ productId: "a", name: "A", productNo: "MKT-A", qty: 3, quotedUnitPrice: 10.5 }, { productId: "b", name: "B", qty: 1, noOffer: true }] },
  ],
};

test("a PO from a quote uses only the effective version's priced lines", () => {
  const plan = planPoFromQuote(quotedRfq);
  assert.equal(plan.ok, true);
  assert.equal(plan.quoteVersion, 2);
  assert.equal(plan.lines.length, 1);
  assert.equal(plan.total, 31.5);
  assert.equal(plan.lines[0].sku, "MKT-A");
});

test("a PO from a quote needs a delivered quote, an open RFQ, and is made once", () => {
  assert.equal(planPoFromQuote({ reviewStatus: "accepted" }).error, "no_quote");
  assert.equal(planPoFromQuote({ ...quotedRfq, cancelStatus: "requested" }).error, "locked");
  assert.equal(planPoFromQuote({ ...quotedRfq, reviewStatus: "cancelled" }).error, "locked");
  assert.equal(planPoFromQuote({ ...quotedRfq, buyerPo: { id: "PO-26000001" } }).existing, true);
});
