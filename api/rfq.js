import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { lookupBuyerAccount, readSession } from "./auth.js";
import { handleCatalogGet } from "./catalog-snapshot.js";
import { handlePromoGet } from "./promo.js";
import { sendResendEmail } from "./send-email.js";
import { list } from "@vercel/blob";
import { createClient } from "@supabase/supabase-js";
import { createStore } from "../server/rfq-core.js";
import { fileAdapter } from "../server/rfq-file-adapter.js";
import { createSupabaseStore } from "../server/rfq-supabase.js";
import { CANCEL_REVERSE_BUYER, CANCEL_REVERSE_STAFF, applyDecision, planAssign, planCancelReverse, planDecision, planQuoteSubmit, planWhatsappFreeze, planWhatsappSent, publicQuoteView, ownedView, planBuyerContent, planPoFromQuote, pushRfqActivity, inboxStatus } from "../src/lib/rfqRules.js";
import { priceOrderLines } from "../server/pricing.js";
import { deliver, mailEventFor, mergeMailLog } from "../server/rfq-mail.js";
import { clientKey } from "../server/upload-limit.js";

/**
 * RFQ and PO endpoint. The server owns numbers, status, timestamps and visibility.
 * Storage: Supabase (rfq_records / po_records, service role only) when RFQ_STORE=supabase;
 * a local JSON file otherwise. On Vercel without RFQ_STORE=supabase this answers 501 instead of
 * writing anywhere by accident.
 */

const MAX_LINES = 100;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const text = (value, max) => String(value ?? "").trim().slice(0, max);
const ATTACHMENT_KINDS = new Set(["namecard", "bq", "drawing", "spec", "image", "other"]);

function guestFiles(list) {
  return (Array.isArray(list) ? list : [])
    .map((file) => ({
      kind: ATTACHMENT_KINDS.has(file?.kind) ? file.kind : "other",
      name: text(file?.name, 180),
    }))
    .filter((file) => file.name)
    .slice(0, 12);
}

/** RFQ and PO, guest or member, must carry the delivery section. N/A is a valid delivery date. The submit stores names; the file address is added after upload. */
function guestOrderMissing(body, snapshot = {}) {
  const buyer = body?.buyer || {};
  const delivery = body?.delivery || {};
  const company = text(buyer.company || snapshot.buyerCompany || snapshot.companyName, 160);
  const address = text(delivery.address || snapshot.address, 400);
  const name = text(buyer.name || snapshot.buyerName, 120);
  const phone = text(buyer.phone || snapshot.buyerPhone, 40);
  const project = text(body?.project || snapshot.project, 200);
  const date = text(delivery.date || snapshot.deliveryDate, 20);
  const files = guestFiles(body?.attachments?.length ? body.attachments : snapshot.guestAttachments);
  if (!company) return "company";
  if (!address) return "address";
  if (!name) return "contact";
  if (!phone) return "phone";
  if (!project) return "project";
  if (!date) return "delivery_date";
  return "";
}

function onVercel() {
  return Boolean(process.env.VERCEL || process.env.VERCEL_ENV);
}

/** RFQ_SUPABASE_URL / RFQ_SUPABASE_SERVICE_ROLE_KEY point the RFQ store at its own project (a test one) without touching the catalog's settings. */
function supabaseConfig() {
  const url = process.env.RFQ_SUPABASE_URL || process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "";
  const key = process.env.RFQ_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  return url && key ? { url, key } : null;
}

/** Supabase is used only when RFQ_STORE=supabase is set (and the service role is configured). Local default stays the file. */
function useSupabase() {
  return process.env.RFQ_STORE === "supabase" && Boolean(supabaseConfig());
}

/** False when there is nowhere safe to write: Vercel without RFQ_STORE=supabase. */
function storeReady() {
  return !onVercel() || useSupabase();
}

let store = null;
function rfqStore() {
  if (store) return store;
  if (useSupabase()) {
    const { url, key } = supabaseConfig();
    store = createSupabaseStore(createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }));
  } else {
    store = createStore(fileAdapter());
  }
  return store;
}

export function actorOf(request) {
  const staff = readSession(request, "staff");
  if (staff) return { kind: "staff", email: String(staff.email || "").toLowerCase() };
  const buyer = readSession(request, "buyer");
  if (buyer) return { kind: "buyer", email: String(buyer.email || "").toLowerCase() };
  return { kind: "guest", email: "" };
}

/**
 * Who is placing an order. Only a buyer session or a guest can place one: a staff cookie must never
 * turn an order into a staff-owned order (staff and buyer cookies can share a browser).
 */
export function placerOf(request) {
  const buyer = readSession(request, "buyer");
  if (buyer) return { kind: "buyer", email: String(buyer.email || "").toLowerCase() };
  return { kind: "guest", email: "" };
}

function cleanLines(lines) {
  if (!Array.isArray(lines) || !lines.length || lines.length > MAX_LINES) return null;
  const out = [];
  for (const line of lines) {
    const qty = Number(line?.qty);
    const name = text(line?.name, 240);
    if (!name || !Number.isFinite(qty) || qty <= 0 || qty > 1_000_000) return null;
    out.push({
      productId: text(line.productId, 80),
      sku: text(line.sku, 80),
      name,
      spec: text(line.spec, 400),
      qty,
      unit: text(line.unit, 40),
      note: text(line.note, 600),
      attachments: Array.isArray(line.attachments) ? line.attachments.map((url) => text(url, 600)).filter(Boolean).slice(0, 10) : [],
    });
  }
  return out;
}

/** submit: the caller says what they want. Who they are, the number, the status and the time come from the server. */
async function submit(body, actor) {
  const kind = body?.kind === "po" ? "po" : "rfq";
  const lines = cleanLines(body?.lines);
  if (!lines) return { status: 400, body: { ok: false, error: "lines" } };

  let buyerEmail = actor.email;
  if (actor.kind === "guest") {
    buyerEmail = text(body?.buyer?.email, 160).toLowerCase();
    if (!EMAIL.test(buyerEmail)) return { status: 400, body: { ok: false, error: "email" } };
  }
  const result = await rfqStore().create(
    kind,
    {
      buyerKind: actor.kind === "guest" ? "guest" : "member",
      buyerEmail,
      buyerName: text(body?.buyer?.name, 120),
      buyerPhone: text(body?.buyer?.phone, 40),
      companyName: text(body?.buyer?.company, 160),
      project: text(body?.project, 200),
      channel: text(body?.channel, 20) || "rfq",
      askKind: body?.askKind === "buy" ? "buy" : "quote",
      lines,
      reviewStatus: "received",
    },
    actor,
  );
  if (result.error) return { status: 400, body: { ok: false, error: result.error } };
  return { status: 200, body: { ok: true, record: result.record } };
}

const MAX_SNAPSHOT_BYTES = 400_000;

/**
 * register (bridge): the marketplace still builds its full RFQ view in the browser, but the number,
 * time and owner are issued here, and the server keeps its own copy. Later steps move each action
 * (accept, quote, cancel, assign, versions, PO) onto the server one by one.
 * A guest must send company, delivery address, contact, email, phone, project, delivery date (or N/A), and attachment names.
 */
async function register(body, actor, request) {
  const kind = body?.kind === "po" ? "po" : "rfq";
  const lines = cleanLines(body?.lines);
  if (!lines) return { status: 400, body: { ok: false, error: "lines" } };

  const snapshot = body?.snapshot && typeof body.snapshot === "object" && !Array.isArray(body.snapshot) ? { ...body.snapshot } : {};
  delete snapshot.id;
  delete snapshot.revision;
  if (JSON.stringify(snapshot).length > MAX_SNAPSHOT_BYTES) return { status: 413, body: { ok: false, error: "too_large" } };

  let buyerEmail = actor.email;
  if (actor.kind === "guest") {
    const given = text(body?.buyer?.email, 160).toLowerCase();
    if (!EMAIL.test(given)) return { status: 400, body: { ok: false, error: "email" } };
    buyerEmail = given;
  } else {
    const given = text(body?.buyer?.email, 160).toLowerCase();
    if (EMAIL.test(given)) buyerEmail = given;
  }
  const missing = guestOrderMissing(body, snapshot);
  if (missing) return { status: 400, body: { ok: false, error: missing } };
  const result = await rfqStore().create(
    kind,
    {
      buyerKind: actor.kind === "guest" ? "guest" : "member",
      buyerEmail,
      buyerName: text(body?.buyer?.name, 120),
      buyerPhone: text(body?.buyer?.phone, 40),
      companyName: text(body?.buyer?.company, 160),
      project: text(body?.project, 200),
      channel: text(body?.channel, 20) || "rfq",
      askKind: body?.askKind === "buy" ? "buy" : "quote",
      lines,
      reviewStatus: "received",
      payload: snapshot,
    },
    actor,
  );
  if (result.error) return { status: 400, body: { ok: false, error: result.error } };
  const withMail = await mailAndRecord(kind, result.record, request);
  const { id, createdAt, revision } = withMail;
  return { status: 200, body: { ok: true, id, createdAt, revision, mailed: true } };
}

const GUEST_PO_PER_DAY = 10;
const DAY_MS = 24 * 60 * 60 * 1000;

async function pricingData() {
  const [promo, catalog] = await Promise.all([handlePromoGet().then((r) => r.body).catch(() => null), handleCatalogGet().catch(() => null)]);
  let products = catalog?.products;
  if (!Array.isArray(products) || !products.length) {
    try {
      products = JSON.parse(await readFile(path.join(process.cwd(), "public", "catalog.json"), "utf8")).products || [];
    } catch {
      products = [];
    }
  }
  return { products, promo };
}

/**
 * po_create: priced goods "Buy now". The browser sends product ids and quantities; the server prices
 * them, numbers the PO (PO-YY######) and records who placed it. No RFQ is involved.
 * Guests need a valid email and are limited per day.
 */
async function createPo(body, actor, request) {
  let buyerEmail = actor.email;
  const visitor = clientKey(request);
  if (actor.kind === "guest") {
    buyerEmail = text(body?.buyer?.email, 160).toLowerCase();
    if (!EMAIL.test(buyerEmail)) return { status: 400, body: { ok: false, error: "email" } };
  } else {
    const given = text(body?.buyer?.email, 160).toLowerCase();
    if (EMAIL.test(given)) buyerEmail = given;
  }
  const missing = guestOrderMissing(body);
  if (missing) return { status: 400, body: { ok: false, error: missing } };
  if (actor.kind === "guest") {
    const since = Date.now() - DAY_MS;
    const today = await rfqStore().countPosByVisitor(visitor, since);
    if (today >= GUEST_PO_PER_DAY) return { status: 429, body: { ok: false, error: "limit" } };
  }
  const priced = priceOrderLines(
    (Array.isArray(body?.lines) ? body.lines : []).map((line) => ({ productId: line?.productId, qty: line?.qty })),
    await pricingData(),
  );
  if (!priced.ok) return { status: 400, body: { ok: false, error: priced.error, productId: priced.productId || "" } };

  const delivery = {
    address: text(body?.delivery?.address, 400),
    date: text(body?.delivery?.date, 20),
    note: text(body?.delivery?.note, 600),
  };
  const result = await rfqStore().create(
    "po",
    {
      buyerKind: actor.kind === "guest" ? "guest" : "member",
      buyerEmail,
      buyerName: text(body?.buyer?.name, 120),
      buyerPhone: text(body?.buyer?.phone, 40),
      companyName: text(body?.buyer?.company, 160),
      project: text(body?.project, 200),
      guestAttachments: guestFiles(body?.attachments),
      delivery,
      note: text(body?.note, 600),
      lines: priced.lines,
      total: priced.total,
      currency: "HKD",
      status: "created",
      visitor: actor.kind === "guest" ? visitor : "",
    },
    actor,
  );
  if (result.error) return { status: 400, body: { ok: false, error: result.error } };
  const withMail = await mailAndRecord("po", result.record, request);
  return { status: 200, body: { ok: true, po: view(withMail, actor) } };
}

const SYSTEM = { kind: "staff", email: "system" };

function originOf(request) {
  try {
    const url = new URL(request.url);
    return /^(localhost|127\.0\.0\.1)$/.test(url.hostname) ? undefined : url.origin;
  } catch {
    return undefined;
  }
}

/** Send the mails for a new record and keep the outcome on it. Never throws; a failure never undoes the order. */
async function mailAndRecord(kind, record, request, only, event) {
  try {
    const fresh = await deliver(kind, record, sendResendEmail, { origin: originOf(request), only, event });
    const result = await rfqStore().update(
      kind,
      record.id,
      record.revision,
      (current) => ({ mail: mergeMailLog(current.mail, fresh) }),
      SYSTEM,
    );
    return result.record || record;
  } catch {
    return record;
  }
}

/** mail_resend: staff retry the mails that failed. Mails that were sent are not sent again. */
async function resendMail(body, actor, request) {
  if (actor.kind !== "staff") return { status: 403, body: { ok: false, error: "staff" } };
  const id = text(body?.id, 40);
  const kind = id.startsWith("PO-") ? "po" : "rfq";
  const current = await rfqStore().get(kind, id, actor);
  if (!current) return { status: 404, body: { ok: false, error: "not_found" } };
  const failed = (current.mail || []).filter((entry) => entry.status === "failed");
  if (!failed.length) return { status: 200, body: { ok: true, record: view(current, actor) } };
  let next = current;
  for (const event of [...new Set(failed.map((entry) => entry.event || ""))]) {
    next = await mailAndRecord(kind, { ...(next.payload || {}), ...next }, request, failed.filter((entry) => (entry.event || "") === event), event || undefined);
  }
  return { status: 200, body: { ok: true, record: view(next, actor) } };
}

/**
 * Send the lifecycle mail for an RFQ event (accepted, no offer, cancel / reverse...) and keep the outcome on the record.
 * Returns { event, ok } for the browser to show, or null when the event needs no mail. Never throws.
 */
async function mailEvent(record, activity, request) {
  const event = mailEventFor(activity);
  if (!event) return null;
  const next = await mailAndRecord("rfq", record, request, undefined, event);
  const entries = (next.mail || []).filter((entry) => entry.event === event);
  return { event, ok: entries.length > 0 && entries.every((entry) => entry.status === "sent") };
}

/** What the caller sees. The visitor key is internal; the mail log and frozen quote copies are for staff only. */
function view(record, actor) {
  const { visitor, mail, quoteSnapshots, draft, ...rest } = record;
  return actor?.kind === "staff" ? { ...rest, draft, mail: mail || [], quoteSnapshots: quoteSnapshots || {} } : rest;
}

/** po_confirm: Sales mark "PO received". Staff only, once; repeating it changes nothing. */
async function confirmPo(body, actor) {
  if (actor.kind !== "staff") return { status: 403, body: { ok: false, error: "staff" } };
  const id = text(body?.id, 40);
  const current = await rfqStore().get("po", id, actor);
  if (!current) return { status: 404, body: { ok: false, error: "not_found" } };
  if (current.status === "confirmed") return { status: 200, body: { ok: true, po: view(current, actor) } };
  const result = await rfqStore().update(
    "po",
    id,
    current.revision,
    () => ({ status: "confirmed", confirmedAt: new Date().toISOString(), confirmedBy: actor.email }),
    actor,
  );
  if (result.error === "conflict") return confirmPo(body, actor);
  if (result.error) return { status: 400, body: { ok: false, error: result.error } };
  return { status: 200, body: { ok: true, po: view(result.record, actor) } };
}

const DECISION_FIELDS = [
  "reviewStatus", "reviewingBy", "reason", "acceptedAt", "acceptedBy", "noOfferAt", "returnedAt",
  "cancelStatus", "cancelKind", "cancelRequestedAt", "cancelledAt", "cancelledBy", "cancelDeclinedAt",
  "reverseStatus", "reverseRequestedAt", "reverseDeclinedAt",
];

/** Which rule set a `decision` belongs to. */
function planFor(decision) {
  if (CANCEL_REVERSE_BUYER.includes(decision)) return { who: "buyer", plan: (rfq, o) => planCancelReverse(rfq, decision, o) };
  if (CANCEL_REVERSE_STAFF.includes(decision)) return { who: "staff", plan: (rfq, o) => planCancelReverse(rfq, decision, o) };
  return { who: "staff", plan: (rfq, o) => planDecision(rfq, { decision, reason: o.reason, by: o.by, at: o.at }) };
}

/**
 * rfq_decide: one RFQ status change. Sales: accept / no offer / answer a cancel or reverse request.
 * The owning buyer: `buyer_cancel`, `buyer_reverse`. The server checks the rules against its own
 * record, stamps the time and the person, and returns the patch so the browser copy can follow.
 * An RFQ the server does not hold (created before this change) is 404 so the client uses its old path.
 */
async function decideRfqAction(body, request, tries = 3) {
  const decision = text(body?.decision, 30);
  const { who, plan: planner } = planFor(decision);
  const actor = who === "buyer" ? placerOf(request) : actorOf(request);
  if (who === "buyer" ? actor.kind !== "buyer" : actor.kind !== "staff") {
    return { status: 403, body: { ok: false, error: who === "buyer" ? "auth" : "staff" } };
  }
  const id = text(body?.id, 40);
  const current = await rfqStore().get("rfq", id, actor);
  if (!current) return { status: 404, body: { ok: false, error: "not_found" } };

  const merged = { ...(current.payload || {}), ...current };
  const plan = planner(merged, { reason: text(body?.reason, 600), by: who === "staff" ? actor.email : "", at: new Date().toISOString() });
  if (!plan.ok) return { status: plan.error === "locked" ? 409 : 400, body: { ok: false, error: plan.error } };
  if (plan.noop) {
    const fields = {};
    for (const key of DECISION_FIELDS) if (merged[key] !== undefined) fields[key] = merged[key];
    return { status: 200, body: { ok: true, noop: true, patch: { fields } } };
  }

  const result = await rfqStore().update(
    "rfq",
    id,
    current.revision,
    (record) => {
      const next = applyDecision({ ...(record.payload || {}), ...record }, plan.patch);
      const changes = { ...plan.patch.fields, activity: next.activity };
      if (plan.patch.markLinesNoOffer) changes.lines = next.lines;
      return changes;
    },
    actor,
  );
  if (result.error === "conflict" && tries > 1) return decideRfqAction(body, request, tries - 1);
  if (result.error) return { status: 409, body: { ok: false, error: result.error } };
  const mail = await mailEvent(result.record, plan.patch.activity, request);
  return { status: 200, body: { ok: true, patch: plan.patch, notify: plan.notify || "", mail } };
}

/**
 * rfq_assign: Sales give a guest RFQ to a registered member. Staff only; only a guest RFQ can move.
 * When accounts are reachable the server checks the member is registered, enabled and not rejected and
 * uses the account's own name and phone. Without account access (local dev) the staff-chosen member is used.
 */
async function assignRfqAction(body, actor, tries = 3) {
  if (actor.kind !== "staff") return { status: 403, body: { ok: false, error: "staff" } };
  const id = text(body?.id, 40);
  const current = await rfqStore().get("rfq", id, actor);
  if (!current) return { status: 404, body: { ok: false, error: "not_found" } };

  const email = text(body?.buyer?.email, 160).toLowerCase();
  if (!EMAIL.test(email)) return { status: 400, body: { ok: false, error: "missing_buyer" } };
  let buyer = { email, name: text(body?.buyer?.name, 120), phone: text(body?.buyer?.phone, 40) };
  const found = await lookupBuyerAccount(email);
  if (found.checked) {
    if (!found.ok) return { status: 400, body: { ok: false, error: "missing_buyer" } };
    buyer = found.account;
  }

  const merged = { ...(current.payload || {}), ...current };
  const plan = planAssign(merged, { buyer, by: actor.email, at: new Date().toISOString() });
  if (!plan.ok) return { status: plan.error === "locked" ? 409 : 400, body: { ok: false, error: plan.error } };

  const result = await rfqStore().update(
    "rfq",
    id,
    current.revision,
    (record) => {
      const next = applyDecision({ ...(record.payload || {}), ...record }, plan.patch);
      return { ...plan.patch.fields, activity: next.activity };
    },
    actor,
  );
  if (result.error === "conflict" && tries > 1) return assignRfqAction(body, actor, tries - 1);
  if (result.error) return { status: 409, body: { ok: false, error: result.error } };
  return { status: 200, body: { ok: true, patch: plan.patch } };
}

/**
 * po_assign: Sales give a guest purchase order to a registered member. Staff only.
 * A guest order keeps its number and status. Only `buyerKind: "guest"` can move, and only once.
 */
async function assignPoAction(body, actor, tries = 3) {
  if (actor.kind !== "staff") return { status: 403, body: { ok: false, error: "staff" } };
  const id = text(body?.id, 40);
  const current = await rfqStore().get("po", id, actor);
  if (!current) return { status: 404, body: { ok: false, error: "not_found" } };

  const email = text(body?.buyer?.email, 160).toLowerCase();
  if (!EMAIL.test(email)) return { status: 400, body: { ok: false, error: "missing_buyer" } };
  let buyer = { email, name: text(body?.buyer?.name, 120), phone: text(body?.buyer?.phone, 40) };
  const found = await lookupBuyerAccount(email);
  if (found.checked) {
    if (!found.ok) return { status: 400, body: { ok: false, error: "missing_buyer" } };
    buyer = found.account;
  }

  const plan = planAssign(current, { buyer, by: actor.email, at: new Date().toISOString() });
  if (!plan.ok) return { status: plan.error === "locked" ? 409 : 400, body: { ok: false, error: plan.error } };

  const result = await rfqStore().update(
    "po",
    id,
    current.revision,
    (record) => {
      const next = applyDecision(record, plan.patch);
      return { ...plan.patch.fields, activity: next.activity };
    },
    actor,
  );
  if (result.error === "conflict" && tries > 1) return assignPoAction(body, actor, tries - 1);
  if (result.error) return { status: 409, body: { ok: false, error: result.error } };
  return { status: 200, body: { ok: true, po: view(result.record, actor) } };
}

function money(value) {
  if (value === "" || value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 && n <= 1_000_000_000 ? n : null;
}

/** The quote worksheet from Sales. It must be the same lines, in the same order, as the RFQ the server holds. */
function cleanWorksheet(raw, known) {
  if (!Array.isArray(raw) || !Array.isArray(known) || raw.length !== known.length) return null;
  const out = [];
  for (let i = 0; i < raw.length; i += 1) {
    const line = raw[i] || {};
    const productId = text(line.productId, 80);
    if (productId !== String(known[i]?.productId || "")) return null;
    const qty = Number(line.qty);
    if (!Number.isFinite(qty) || qty <= 0 || qty > 1_000_000) return null;
    out.push({
      productId,
      name: text(line.name, 240),
      productNo: text(line.productNo, 80),
      unit: text(line.unit, 40),
      qty,
      quotedUnitPrice: money(line.quotedUnitPrice),
      noOffer: Boolean(line.noOffer),
      custom: Boolean(line.custom),
      remark: text(line.remark, 600),
      image: text(line.image, 600),
    });
  }
  return out;
}

/**
 * rfq_quote: Sales submit the quote worksheet to a member. Staff only. The server checks the rules,
 * numbers the version (v1, v2... of the same RFQ), stamps time and staff, and returns the patch.
 * `knownVersion` is the highest version the browser copy holds, so a version the server has not seen
 * (a WhatsApp send that is still browser-side) is never reused. A server copy that no longer matches
 * the worksheet (the buyer revised in the browser) is 409 `stale` so the client uses its local rules.
 */
async function quoteRfqAction(body, actor, tries = 3) {
  if (actor.kind !== "staff") return { status: 403, body: { ok: false, error: "staff" } };
  const id = text(body?.id, 40);
  const current = await rfqStore().get("rfq", id, actor);
  if (!current) return { status: 404, body: { ok: false, error: "not_found" } };

  const worksheet = cleanWorksheet(body?.lines, current.lines);
  if (!worksheet) return { status: 409, body: { ok: false, error: "stale" } };

  const merged = { ...(current.payload || {}), ...current };
  const plan = planQuoteSubmit(merged, {
    draftLines: worksheet,
    note: text(body?.note, 2000),
    by: actor.email,
    at: new Date().toISOString(),
    token: randomBytes(16).toString("base64url"),
    knownVersion: Number(body?.knownVersion) || 0,
  });
  if (!plan.ok) return { status: 400, body: { ok: false, error: plan.error } };

  const result = await rfqStore().update(
    "rfq",
    id,
    current.revision,
    (record) => {
      const next = applyDecision({ ...(record.payload || {}), ...record }, plan.patch);
      const { lines, ...fields } = plan.patch.fields;
      return {
        ...fields,
        quoteVersions: next.quoteVersions,
        quoteEffectiveVersion: next.quoteEffectiveVersion,
        quotedSubtotal: next.quotedSubtotal,
        activity: next.activity,
      };
    },
    actor,
  );
  if (result.error === "conflict" && tries > 1) return quoteRfqAction(body, actor, tries - 1);
  if (result.error) return { status: 409, body: { ok: false, error: result.error } };
  return { status: 200, body: { ok: true, patch: plan.patch } };
}

/**
 * rfq_wa_freeze: freeze the quote for a WhatsApp message. Staff only. The server makes the public token and
 * keeps the frozen copy; the link /zh/quote/:token reads it from here. No version is created yet, and the
 * RFQ never becomes `quoted` this way.
 */
async function freezeWhatsappAction(body, actor, tries = 3) {
  if (actor.kind !== "staff") return { status: 403, body: { ok: false, error: "staff" } };
  const id = text(body?.id, 40);
  const current = await rfqStore().get("rfq", id, actor);
  if (!current) return { status: 404, body: { ok: false, error: "not_found" } };
  const worksheet = cleanWorksheet(body?.lines, current.lines);
  if (!worksheet) return { status: 409, body: { ok: false, error: "stale" } };

  const merged = { ...(current.payload || {}), ...current };
  const plan = planWhatsappFreeze(merged, {
    draftLines: worksheet,
    phone: text(body?.phone, 40),
    token: randomBytes(16).toString("base64url"),
    by: actor.email,
    at: new Date().toISOString(),
  });
  if (!plan.ok) return { status: 400, body: { ok: false, error: plan.error } };

  const token = plan.snapshot.token;
  const result = await rfqStore().update(
    "rfq",
    id,
    current.revision,
    (record) => ({ ...plan.patch.fields, quoteSnapshots: { ...(record.quoteSnapshots || {}), [token]: plan.snapshot } }),
    actor,
  );
  if (result.error === "conflict" && tries > 1) return freezeWhatsappAction(body, actor, tries - 1);
  if (result.error) return { status: 409, body: { ok: false, error: result.error } };
  return { status: 200, body: { ok: true, patch: plan.patch, token } };
}

/**
 * rfq_wa_sent: "Quote sent on WhatsApp". Staff only. Adds a WhatsApp version to the same RFQ's timeline
 * and sets `quoteDelivery: "whatsapp"`. It never sets `reviewStatus: quoted`.
 */
async function whatsappSentAction(body, actor, tries = 3) {
  if (actor.kind !== "staff") return { status: 403, body: { ok: false, error: "staff" } };
  const id = text(body?.id, 40);
  const current = await rfqStore().get("rfq", id, actor);
  if (!current) return { status: 404, body: { ok: false, error: "not_found" } };
  const merged = { ...(current.payload || {}), ...current };
  const snapshot = (current.quoteSnapshots || {})[String(current.quotePublicToken || "")];
  const plan = planWhatsappSent(merged, { snapshot, by: actor.email, at: new Date().toISOString(), knownVersion: Number(body?.knownVersion) || 0 });
  if (!plan.ok) return { status: plan.error === "not_frozen" ? 404 : 400, body: { ok: false, error: plan.error } };

  const result = await rfqStore().update(
    "rfq",
    id,
    current.revision,
    (record) => {
      const next = applyDecision({ ...(record.payload || {}), ...record }, plan.patch);
      return {
        ...plan.patch.fields,
        quoteVersions: next.quoteVersions,
        quoteEffectiveVersion: next.quoteEffectiveVersion,
        quotedSubtotal: next.quotedSubtotal,
        activity: next.activity,
      };
    },
    actor,
  );
  if (result.error === "conflict" && tries > 1) return whatsappSentAction(body, actor, tries - 1);
  if (result.error) return { status: 409, body: { ok: false, error: result.error } };
  return { status: 200, body: { ok: true, patch: plan.patch } };
}

/** The frozen quote behind a public link. Anyone with the token sees the quote lines only. */
async function publicQuote(token) {
  const key = text(token, 80);
  if (!key) return { status: 404, body: { ok: false, error: "not_found" } };
  const record = await rfqStore().findRfqBySnapshot(key);
  const snapshot = record ? record.quoteSnapshots[key] : null;
  if (!snapshot) return { status: 404, body: { ok: false, error: "not_found" } };
  return { status: 200, body: { ok: true, quote: publicQuoteView(snapshot) } };
}

const guestBlobCache = new Map();

function guestFileIndex(pathname) {
  const match = /\/guest-(\d+)-/.exec(String(pathname || ""));
  return match ? Number(match[1]) : 0;
}

function guestFilesOf(record) {
  const payload = record?.payload && typeof record.payload === "object" ? record.payload : null;
  if (Array.isArray(payload?.guestAttachments) && payload.guestAttachments.length) return payload.guestAttachments;
  return Array.isArray(record?.guestAttachments) ? record.guestAttachments : [];
}

/** Files already stored for this order. Sales can open them; the lookup stays on the server. */
async function hydrateGuestFiles(record) {
  const source = guestFilesOf(record);
  if (!record?.id || !source.some((file) => file?.name && !file.url)) return record;
  let blobs = guestBlobCache.get(record.id);
  if (!blobs) {
    try {
      const result = await list({ prefix: `rfq/${record.id}/guest-`, limit: 20 });
      blobs = result?.blobs || [];
      guestBlobCache.set(record.id, blobs);
    } catch {
      return record;
    }
  }
  if (!blobs.length) return record;
  const byIndex = new Map();
  for (const blob of [...blobs].sort((a, b) => String(a.uploadedAt || "").localeCompare(String(b.uploadedAt || "")))) {
    const index = guestFileIndex(blob.pathname);
    if (index > 0 && blob.url) byIndex.set(index, blob.url);
  }
  const next = source.map((file, index) => (file?.url || !byIndex.get(index + 1) ? file : { ...file, url: byIndex.get(index + 1) }));
  if (!next.some((file, index) => file?.url && file.url !== source[index]?.url)) return record;
  const payload = record.payload && typeof record.payload === "object" ? { ...record.payload, guestAttachments: next } : record.payload;
  return { ...record, guestAttachments: next, payload };
}

/**
 * rfq_sync: what the server owns on the RFQs this person may see (staff: all; a member: their own).
 * `known` lists the ids the browser already holds; for the others the original request is sent too so the
 * browser can show an RFQ that was made on another device.
 */
async function syncRfqs(body, request) {
  /* The Portal asks as staff, the marketplace as a member. A staff cookie on the same browser never widens a member's view. */
  const actor = body?.as === "staff" ? actorOf(request) : placerOf(request);
  if (body?.as === "staff" ? actor.kind !== "staff" : actor.kind !== "buyer") return { status: 200, body: { ok: true, rfqs: [] } };
  const known = new Set((Array.isArray(body?.known) ? body.known : []).map((id) => text(id, 40)));
  const records = await inboxRecords(actor);
  if (actor.kind === "staff") {
    for (let i = 0; i < records.length; i += 1) records[i] = await hydrateGuestFiles(records[i]);
  }
  return {
    status: 200,
    body: {
      ok: true,
      rfqs: records.map((record) => {
        const owned = ownedView(record, { staff: actor.kind === "staff" });
        const full = {
          owned,
          payload: record.payload || {},
          lines: record.lines || [],
          project: record.project || "",
          channel: record.channel || "",
          askKind: record.askKind || "quote",
          companyName: record.companyName || "",
        };
        /* Sales always gets the request itself, so a fresh Portal tab can draw the row. */
        if (actor.kind === "staff" || !known.has(record.id)) return full;
        return { owned };
      }),
    },
  };
}

/**
 * rfq_draft: Sales' unsent quote prices (and no-offer marks) for the lines of one RFQ. Staff only.
 * The draft lives here, so it follows Sales across devices and never goes to the member before it is sent.
 */
async function draftAction(body, actor, tries = 3) {
  if (actor.kind !== "staff") return { status: 403, body: { ok: false, error: "staff" } };
  const id = text(body?.id, 40);
  const current = await rfqStore().get("rfq", id, actor);
  if (!current) return { status: 404, body: { ok: false, error: "not_found" } };
  if (inboxStatus({ ...(current.payload || {}), ...current }) === "cancelled") return { status: 409, body: { ok: false, error: "locked" } };
  const known = new Set((current.lines || []).map((line) => String(line.productId || "")));
  const raw = Array.isArray(body?.prices) ? body.prices : null;
  if (!raw || raw.length > MAX_LINES) return { status: 400, body: { ok: false, error: "prices" } };
  const prices = [];
  for (const row of raw) {
    const productId = text(row?.productId, 80);
    if (!known.has(productId)) return { status: 409, body: { ok: false, error: "stale" } };
    const salesQty = Number(row?.salesQty);
    prices.push({
      productId,
      quotedUnitPrice: row?.noOffer ? null : money(row?.quotedUnitPrice),
      noOffer: Boolean(row?.noOffer),
      salesQty: Number.isFinite(salesQty) && salesQty > 0 && salesQty <= 1_000_000 ? salesQty : null,
      salesRemark: typeof row?.salesRemark === "string" ? text(row.salesRemark, 600) : null,
    });
  }
  const result = await rfqStore().update(
    "rfq",
    id,
    current.revision,
    () => ({ draft: { prices, updatedAt: new Date().toISOString(), by: actor.email } }),
    actor,
  );
  if (result.error === "conflict" && tries > 1) return draftAction(body, actor, tries - 1);
  if (result.error) return { status: 409, body: { ok: false, error: result.error } };
  return { status: 200, body: { ok: true, draft: result.record.draft } };
}

/** rfq_phone: Sales save the contact number they follow up on for this RFQ's buyer. Staff only. */
async function phoneAction(body, actor, tries = 3) {
  if (actor.kind !== "staff") return { status: 403, body: { ok: false, error: "staff" } };
  const id = text(body?.id, 40);
  const current = await rfqStore().get("rfq", id, actor);
  if (!current) return { status: 404, body: { ok: false, error: "not_found" } };
  const phone = text(body?.phone, 40);
  const hasOther = Object.prototype.hasOwnProperty.call(body || {}, "otherPhone");
  const otherPhone = hasOther ? text(body.otherPhone, 40) : "";
  const hasApps = Object.prototype.hasOwnProperty.call(body || {}, "whatsappOn") || Object.prototype.hasOwnProperty.call(body || {}, "wechatOn");
  const slot = (value) => (value === "1" || value === "2" ? value : "");
  let whatsappOn = slot(body?.whatsappOn);
  let wechatOn = slot(body?.wechatOn);
  const result = await rfqStore().update("rfq", id, current.revision, (record) => {
    const payload = record.payload && typeof record.payload === "object" ? { ...record.payload } : null;
    const patch = { buyerPhone: phone };
    if (payload) payload.buyerPhone = phone;
    if (hasOther) {
      patch.buyerOtherPhone = otherPhone;
      if (payload) payload.buyerOtherPhone = otherPhone;
    }
    if (hasApps) {
      const otherNow = hasOther ? otherPhone : String(payload?.buyerOtherPhone || record.buyerOtherPhone || "").trim();
      if (!phone) {
        if (whatsappOn === "1") whatsappOn = "";
        if (wechatOn === "1") wechatOn = "";
      }
      if (!otherNow) {
        if (whatsappOn === "2") whatsappOn = "";
        if (wechatOn === "2") wechatOn = "";
      }
      patch.buyerWhatsappOn = whatsappOn;
      patch.buyerWechatOn = wechatOn;
      patch.buyerPhoneWhatsapp = Boolean(whatsappOn);
      if (payload) {
        payload.buyerWhatsappOn = whatsappOn;
        payload.buyerWechatOn = wechatOn;
        payload.buyerPhoneWhatsapp = Boolean(whatsappOn);
      }
    }
    if (payload) patch.payload = payload;
    return patch;
  }, actor);
  if (result.error === "conflict" && tries > 1) return phoneAction(body, actor, tries - 1);
  if (result.error) return { status: 409, body: { ok: false, error: result.error } };
  return { status: 200, body: { ok: true, phone } };
}

/**
 * po_from_quote: the member who owns a quoted RFQ makes a purchase order from its effective version.
 * The server prices it from that frozen version, numbers the PO (PO-YY######), mails it, and links it on the RFQ.
 * Asking again returns the same PO.
 */
async function poFromQuoteAction(body, request, tries = 3) {
  const actor = placerOf(request);
  if (actor.kind !== "buyer") return { status: 403, body: { ok: false, error: "auth" } };
  const id = text(body?.id, 40);
  const current = await rfqStore().get("rfq", id, actor);
  if (!current) return { status: 404, body: { ok: false, error: "not_found" } };

  const merged = { ...(current.payload || {}), ...current };
  const plan = planPoFromQuote(merged);
  if (!plan.ok) return { status: 409, body: { ok: false, error: plan.error } };
  if (plan.existing) return { status: 200, body: { ok: true, noop: true, patch: { fields: { buyerPo: merged.buyerPo } } } };

  const created = await rfqStore().create(
    "po",
    {
      buyerKind: "member",
      buyerEmail: actor.email,
      buyerName: merged.buyerName || "",
      buyerPhone: merged.buyerPhone || "",
      companyName: merged.companyName || "",
      delivery: { address: text(merged.address, 400), date: text(merged.deliveryDate, 20), note: "" },
      note: "",
      lines: plan.lines,
      total: plan.total,
      currency: "HKD",
      status: "created",
      rfqId: id,
      quoteVersion: plan.quoteVersion,
    },
    actor,
  );
  if (created.error) return { status: 400, body: { ok: false, error: created.error } };
  const withMail = await mailAndRecord("po", created.record, request);

  const at = withMail.createdAt;
  const buyerPo = {
    id: withMail.id,
    createdAt: at,
    confirmedAt: at,
    lines: plan.lines.map((line) => ({ productId: line.productId, name: line.name, qty: line.qty, supplierName: "Mattex", lineTotal: line.lineTotal })),
    total: plan.total,
    label: `v${plan.quoteVersion}`,
    status: "created",
    quoteVersion: plan.quoteVersion,
  };
  const linked = await rfqStore().update(
    "rfq",
    id,
    current.revision,
    (record) => {
      if (record.buyerPo?.id) return { error: "exists" };
      const next = pushRfqActivity({ ...(record.payload || {}), ...record }, "po_created", { at, detail: withMail.id });
      return { buyerPo, activity: next.activity };
    },
    actor,
  );
  if (linked.error === "conflict" && tries > 1) {
    const latest = await rfqStore().get("rfq", id, actor);
    if (latest?.buyerPo?.id) return { status: 200, body: { ok: true, noop: true, patch: { fields: { buyerPo: latest.buyerPo } } } };
    return linkPo(id, actor, buyerPo, at, withMail.id, tries - 1);
  }
  if (linked.error === "exists") return { status: 200, body: { ok: true, noop: true, patch: { fields: { buyerPo: (await rfqStore().get("rfq", id, actor))?.buyerPo } } } };
  if (linked.error) return { status: 409, body: { ok: false, error: linked.error } };
  return { status: 200, body: { ok: true, patch: { fields: { buyerPo }, activity: { kind: "po_created", at, detail: withMail.id } } } };
}

/** Link an already-numbered PO onto its RFQ (retry after a revision conflict). */
async function linkPo(id, actor, buyerPo, at, poId, tries) {
  const current = await rfqStore().get("rfq", id, actor);
  if (!current) return { status: 404, body: { ok: false, error: "not_found" } };
  const result = await rfqStore().update(
    "rfq",
    id,
    current.revision,
    (record) => {
      if (record.buyerPo?.id) return { error: "exists" };
      const next = pushRfqActivity({ ...(record.payload || {}), ...record }, "po_created", { at, detail: poId });
      return { buyerPo, activity: next.activity };
    },
    actor,
  );
  if (result.error === "conflict" && tries > 1) return linkPo(id, actor, buyerPo, at, poId, tries - 1);
  if (result.error && result.error !== "exists") return { status: 409, body: { ok: false, error: result.error } };
  return { status: 200, body: { ok: true, patch: { fields: { buyerPo }, activity: { kind: "po_created", at, detail: poId } } } };
}

const CONTENT_TEXT = ["note", "address", "responseDate", "quotationDeadline", "deliveryDate", "project", "deliveryMode"];

/**
 * rfq_buyer_content: the member who owns an RFQ edits it or resubmits it after Sales sent it back or
 * opened it for revision. The words are the buyer's own (like a submit); the server decides whether the
 * edit is allowed, and on resubmit moves the status, stamps the time and logs it.
 */
async function buyerContentAction(body, request, tries = 3) {
  const actor = placerOf(request);
  if (actor.kind !== "buyer") return { status: 403, body: { ok: false, error: "auth" } };
  const id = text(body?.id, 40);
  const current = await rfqStore().get("rfq", id, actor);
  if (!current) return { status: 404, body: { ok: false, error: "not_found" } };

  const merged = { ...(current.payload || {}), ...current };
  const plan = planBuyerContent(merged, { resubmit: Boolean(body?.resubmit), at: new Date().toISOString() });
  if (!plan.ok) return { status: 409, body: { ok: false, error: plan.error } };

  const content = body?.content && typeof body.content === "object" ? body.content : {};
  const lines = content.lines === undefined ? current.lines : cleanLines(content.lines);
  if (!lines) return { status: 400, body: { ok: false, error: "lines" } };
  const payloadChange = {};
  for (const key of CONTENT_TEXT) if (content[key] !== undefined) payloadChange[key] = text(content[key], 2000);
  if (Array.isArray(content.lines)) payloadChange.lines = content.lines;
  for (const key of ["projects", "requestVersions", "deliveryLots"]) if (Array.isArray(content[key])) payloadChange[key] = content[key];
  if (Number.isFinite(Number(content.requestEffectiveVersion))) payloadChange.requestEffectiveVersion = Number(content.requestEffectiveVersion);
  if (JSON.stringify(payloadChange).length > MAX_SNAPSHOT_BYTES) return { status: 413, body: { ok: false, error: "too_large" } };

  const result = await rfqStore().update(
    "rfq",
    id,
    current.revision,
    (record) => {
      const next = applyDecision({ ...(record.payload || {}), ...record }, plan.patch);
      return { ...plan.patch.fields, lines, payload: { ...(record.payload || {}), ...payloadChange }, activity: next.activity };
    },
    actor,
  );
  if (result.error === "conflict" && tries > 1) return buyerContentAction(body, request, tries - 1);
  if (result.error) return { status: 409, body: { ok: false, error: result.error } };
  const mail = body?.resubmit ? await mailEvent(result.record, plan.patch.activity, request) : null;
  return { status: 200, body: { ok: true, patch: plan.patch, mail } };
}

function publicGuestFileUrl(id, value) {
  try {
    const url = new URL(String(value || ""));
    if (url.protocol !== "https:" || !url.hostname.endsWith(".public.blob.vercel-storage.com")) return "";
    const path = decodeURIComponent(url.pathname);
    if (!path.includes(`/rfq/${id}/guest-`)) return "";
    return url.toString();
  } catch {
    return "";
  }
}

function mergeGuestFileUrls(files, byName) {
  return (Array.isArray(files) ? files : []).map((file) => {
    const url = byName.get(String(file?.name || ""));
    if (!url || file?.url) return file;
    return { ...file, url };
  });
}

/**
 * rfq_files: after the order files are stored, keep their addresses on the order so Sales can preview them.
 * A guest can only fill a guest order, and only with a file stored under that order's own path.
 */
async function guestFileAction(body, request, tries = 3) {
  const actor = actorOf(request);
  const id = text(body?.id, 40);
  if (!/^(RFQ|PO)-\d{8}$/.test(id)) return { status: 400, body: { ok: false, error: "id" } };
  const kind = id.startsWith("PO-") ? "po" : "rfq";
  const reader = actor.kind === "guest" ? SYSTEM : actor;
  const current = await rfqStore().get(kind, id, reader);
  if (!current) return { status: 404, body: { ok: false, error: "not_found" } };
  if (actor.kind === "buyer" && String(current.buyerEmail || "").toLowerCase() !== actor.email) {
    return { status: 404, body: { ok: false, error: "not_found" } };
  }
  if (actor.kind === "guest" && current.buyerKind && current.buyerKind !== "guest") {
    return { status: 403, body: { ok: false, error: "auth" } };
  }
  const byName = new Map();
  for (const file of Array.isArray(body?.files) ? body.files : []) {
    const name = text(file?.name, 180);
    const url = publicGuestFileUrl(id, file?.url);
    if (name && url) byName.set(name, url);
  }
  if (!byName.size) return { status: 400, body: { ok: false, error: "files" } };
  const writer = actor.kind === "guest" ? SYSTEM : actor;
  const result = await rfqStore().update(
    kind,
    id,
    current.revision,
    (record) => {
      const payload = record.payload && typeof record.payload === "object" ? { ...record.payload } : null;
      const source = Array.isArray(payload?.guestAttachments) && payload.guestAttachments.length ? payload.guestAttachments : record.guestAttachments;
      const next = mergeGuestFileUrls(source, byName);
      const added = next.some((file, index) => file?.url && file.url !== (Array.isArray(source) ? source[index]?.url : ""));
      if (!added) return { error: "files" };
      const patch = { guestAttachments: next };
      if (payload) patch.payload = { ...payload, guestAttachments: next };
      return patch;
    },
    writer,
  );
  if (result.error === "conflict" && tries > 1) return guestFileAction(body, request, tries - 1);
  if (result.error) return { status: result.error === "files" ? 400 : 409, body: { ok: false, error: result.error } };
  return { status: 200, body: { ok: true } };
}

async function routePost(body, request) {
  if (!storeReady()) return { status: 501, body: { ok: false, error: "use-supabase" } };
  const actor = actorOf(request);
  if (body?.action === "po_create") return createPo(body, placerOf(request), request);
  if (body?.action === "po_confirm") return confirmPo(body, actor);
  if (body?.action === "po_assign") return assignPoAction(body, actor);
  if (body?.action === "rfq_decide") return decideRfqAction(body, request);
  if (body?.action === "po_from_quote") return poFromQuoteAction(body, request);
  if (body?.action === "rfq_phone") return phoneAction(body, actor);
  if (body?.action === "rfq_files") return guestFileAction(body, request);
  if (body?.action === "rfq_draft") return draftAction(body, actor);
  if (body?.action === "rfq_buyer_content") return buyerContentAction(body, request);
  if (body?.action === "rfq_sync") return syncRfqs(body, request);
  if (body?.action === "rfq_wa_freeze") return freezeWhatsappAction(body, actor);
  if (body?.action === "rfq_wa_sent") return whatsappSentAction(body, actor);
  if (body?.action === "rfq_quote") return quoteRfqAction(body, actor);
  if (body?.action === "rfq_assign") return assignRfqAction(body, actor);
  if (body?.action === "mail_resend") return resendMail(body, actor, request);
  if (body?.action === "register") return register(body, placerOf(request), request);
  if (body?.action === "submit") return submit(body, actor);
  return { status: 400, body: { ok: false, error: "action" } };
}

function legacyRecord(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload) || !payload.id) return null;
  const lines = Array.isArray(payload.lines) ? payload.lines : [];
  return {
    ...payload,
    id: String(payload.id),
    revision: Number(payload.revision) || 1,
    lines,
    payload: { ...payload, lines },
    buyerEmail: payload.buyerEmail || "",
    buyerName: payload.buyerName || "",
    reviewStatus: payload.reviewStatus || payload.status || "received",
    createdAt: payload.createdAt || payload.submittedAt || "",
  };
}

/** New rfq_records plus the older public.rfqs rows, without showing the same id twice. */
export function mergeInboxRecords(current, legacyPayloads) {
  const seen = new Set((current || []).map((record) => record?.id).filter(Boolean));
  const extra = [];
  for (const payload of legacyPayloads || []) {
    const record = legacyRecord(payload);
    if (!record || seen.has(record.id)) continue;
    seen.add(record.id);
    extra.push(record);
  }
  return [...(current || []), ...extra];
}

async function inboxRecords(actor) {
  const current = await rfqStore().list("rfq", actor);
  if (actor.kind !== "staff" || typeof rfqStore().listLegacy !== "function") return current;
  try {
    return mergeInboxRecords(current, await rfqStore().listLegacy());
  } catch (error) {
    console.error("[rfq] legacy list:", error?.message || error);
    return current;
  }
}

async function routeGet(request) {
  if (!storeReady()) return { status: 501, body: { ok: false, error: "use-supabase" } };
  const actor = actorOf(request);
  const url = new URL(request.url);
  if (url.searchParams.has("quote")) return publicQuote(url.searchParams.get("quote"));
  const id = url.searchParams.get("id");
  const kind = url.searchParams.get("kind") === "po" ? "po" : "rfq";
  if (id) {
    const record = await rfqStore().get(id.startsWith("PO-") ? "po" : "rfq", id, actor);
    return record ? { status: 200, body: { ok: true, record: view(record, actor) } } : { status: 404, body: { ok: false, error: "not_found" } };
  }
  const records = kind === "rfq" ? await inboxRecords(actor) : await rfqStore().list(kind, actor);
  return { status: 200, body: { ok: true, records: records.map((record) => view(record, actor)) } };
}

/** A storage failure answers 500 with no detail; it must never crash the process or leak the reason. */
function storageFailure(error) {
  console.error("[rfq] storage error:", error?.message || error);
  return { status: 500, body: { ok: false, error: "storage" } };
}

export async function handleRfqGet(request) {
  try {
    return await routeGet(request);
  } catch (error) {
    return storageFailure(error);
  }
}

export async function handleRfqPost(body, request) {
  try {
    return await routePost(body, request);
  } catch (error) {
    return storageFailure(error);
  }
}

function json(result) {
  return Response.json(result.body, { status: result.status || 200, headers: { "cache-control": "no-store" } });
}

export async function GET(request) {
  return json(await handleRfqGet(request));
}

export async function POST(request) {
  let body = {};
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "invalid json" }, { status: 400 });
  }
  return json(await handleRfqPost(body, request));
}
