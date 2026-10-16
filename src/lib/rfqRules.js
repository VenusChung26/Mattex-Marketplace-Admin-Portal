/**
 * RFQ status rules shared by the browser (bridge) and the server.
 * Pure: no storage, no clock unless `at` is passed, no network. The server is the one that
 * supplies `at` and `by` for real; the browser only displays what the server decided.
 */

/** Inbox status of an RFQ, whatever shape of status fields it carries. */
export function inboxStatus(rfq) {
  if (rfq?.cancelStatus === "accepted" || rfq?.reviewStatus === "cancelled") return "cancelled";
  if (rfq?.reviewStatus === "rejected") return "no_offer";
  if (rfq?.reviewStatus === "revising") return "revising";
  if (rfq?.reviewStatus) return rfq.reviewStatus;
  if (["accepted", "returned", "rejected", "reviewing", "received", "no_offer", "revising"].includes(rfq?.status)) {
    return rfq.status === "rejected" ? "no_offer" : rfq.status;
  }
  return "received";
}

export function activityDedupeKey(entry) {
  return `${entry?.kind || ""}|${entry?.detail || ""}|${String(entry?.at || "").slice(0, 16)}`;
}

/** Append one activity entry unless the last entry is the same event. */
export function pushRfqActivity(rfq, kind, extra = {}) {
  if (!rfq || !kind) return rfq;
  const at = extra.at || new Date().toISOString();
  const entry = {
    id: extra.id || `act-${kind}-${at}`,
    kind,
    at,
    by: extra.by || "",
    detail: extra.detail || "",
    channel: extra.channel || rfq.channel || "",
  };
  const prev = Array.isArray(rfq.activity) ? rfq.activity : [];
  const last = prev[prev.length - 1];
  if (last && activityDedupeKey(last) === activityDedupeKey(entry)) return rfq;
  return { ...rfq, activity: [...prev, entry] };
}

/**
 * Sales decision on a received RFQ: accept, no offer, or return.
 * Returns { ok:false, error } for a bad request, { ok:true, noop:true } when the rules say nothing
 * changes (already decided, cancelled, revising, or a cancel / reverse request is pending), or
 * { ok:true, patch } where the patch is applied with `applyDecision`.
 */
export function planDecision(rfq, { decision, reason, by, at } = {}) {
  const next = decision === "rejected" ? "no_offer" : decision;
  if (!["accepted", "no_offer", "returned"].includes(next)) return { ok: false, error: "decision" };
  if (next === "returned" && !String(reason || "").trim()) return { ok: false, error: "reason" };

  const status = inboxStatus(rfq);
  if (status === "cancelled" || status === "revising") return { ok: true, noop: true };
  if (rfq?.cancelStatus === "requested" && next === "accepted") return { ok: true, noop: true };
  if (rfq?.reverseStatus === "requested" && next === "accepted") return { ok: true, noop: true };

  const when = at || new Date().toISOString();
  const who = String(by || "");
  if (next === "no_offer") {
    if (status === "no_offer") return { ok: true, noop: true };
    const why = String(reason || "No offer").trim();
    return {
      ok: true,
      patch: {
        fields: { reviewStatus: "no_offer", reviewingBy: "", reason: why, noOfferAt: when },
        markLinesNoOffer: true,
        activity: { kind: "no_offer", at: when, detail: why, by: who },
      },
    };
  }
  if (status === "accepted" || status === "quoted" || status === "no_offer") return { ok: true, noop: true };
  if (next === "accepted") {
    return {
      ok: true,
      patch: {
        fields: { reviewStatus: "accepted", reviewingBy: "", reason: "", acceptedAt: when, acceptedBy: who },
        activity: { kind: "accepted", at: when, by: who },
      },
    };
  }
  const why = String(reason || "").trim();
  return {
    ok: true,
    patch: {
      fields: { reviewStatus: "returned", reviewingBy: "", reason: why, returnedAt: when },
      activity: { kind: "returned", at: when, detail: why, by: who },
    },
  };
}

/** Apply a patch from `planDecision` to an RFQ. Used by the server and by the browser copy. */
export function applyDecision(rfq, patch) {
  if (!patch) return rfq;
  let next = { ...rfq, ...patch.fields };
  if (patch.markLinesNoOffer) {
    next.lines = (rfq.lines || []).map((line) => ({ ...line, noOffer: true, quotedUnitPrice: null }));
  }
  if (patch.version) next = applyDeliveredQuoteVersion(next, patch.version);
  if (patch.activity) next = pushRfqActivity(next, patch.activity.kind, patch.activity);
  return next;
}

export function rfqHasPurchaseOrder(rfq) {
  return Boolean(rfq?.buyerPo?.id || rfq?.buyerPo?.status === "created" || rfq?.buyerPo?.confirmedAt);
}

export function canBuyerRequestCancel(rfq) {
  if (!rfq) return false;
  const status = inboxStatus(rfq);
  if (status === "no_offer" || status === "cancelled") return false;
  if (rfq.cancelStatus === "requested" || rfq.cancelStatus === "accepted") return false;
  if (rfq.reverseStatus === "requested") return false;
  if (rfqHasPurchaseOrder(rfq)) return false;
  return true;
}

export function canBuyerReverse(rfq) {
  if (!rfq) return false;
  const status = inboxStatus(rfq);
  if (status === "no_offer" || status === "cancelled" || status === "revising") return false;
  if (rfq.cancelStatus === "requested" || rfq.reverseStatus === "requested") return false;
  if (rfqHasPurchaseOrder(rfq)) return false;
  return true;
}

/** Once Sales accepted or quoted (or a TMS iRFQ exists) the buyer needs Sales to agree before reversing. */
export function rfqNeedsSalesReverse(rfq) {
  const status = inboxStatus(rfq);
  if (status === "revising") return false;
  return status === "accepted" || status === "quoted" || Boolean(rfq?.tmsDocumentNo || rfq?.tmsId);
}

function revisingPatch(rfq, kind, at, by) {
  return {
    fields: {
      reviewStatus: "revising",
      reverseStatus: "",
      reverseRequestedAt: "",
      cancelStatus: rfq.cancelStatus === "requested" ? "" : rfq.cancelStatus,
    },
    enterRevising: true,
    activity: { kind, at, by: by || "" },
  };
}

export const CANCEL_REVERSE_STAFF = ["cancel_accept", "cancel_decline", "reverse_accept", "reverse_decline"];
export const CANCEL_REVERSE_BUYER = ["buyer_cancel", "buyer_reverse"];

/**
 * Cancel / reverse flow. Buyer: `buyer_cancel`, `buyer_reverse`. Sales: `cancel_accept`,
 * `cancel_decline`, `reverse_accept`, `reverse_decline`.
 * Returns { ok:false, error } (`locked` = not allowed now), { ok:true, noop:true }, or { ok:true, patch, notify }.
 * `notify` says what the browser still has to send (Sales alert / buyer or Sales email).
 */
export function planCancelReverse(rfq, kind, { by, at } = {}) {
  const when = at || new Date().toISOString();
  const who = String(by || "");

  if (kind === "buyer_reverse") {
    if (rfq.reverseStatus === "requested") return { ok: true, noop: true };
    if (!canBuyerReverse(rfq)) return { ok: false, error: "locked" };
    if (!rfqNeedsSalesReverse(rfq)) return { ok: true, patch: revisingPatch(rfq, "reversed", when, ""), notify: "none" };
    return {
      ok: true,
      patch: { fields: { reverseStatus: "requested", reverseRequestedAt: when }, activity: { kind: "reverse_requested", at: when } },
      notify: "reverse_requested",
    };
  }
  if (kind === "buyer_cancel") {
    if (rfq.cancelStatus === "requested") return { ok: true, noop: true };
    if (!canBuyerRequestCancel(rfq)) return { ok: false, error: "locked" };
    if (inboxStatus(rfq) === "revising" || !rfqNeedsSalesReverse(rfq)) {
      return {
        ok: true,
        patch: {
          fields: { cancelStatus: "accepted", cancelKind: "cancel", reviewStatus: "cancelled", reverseStatus: "", cancelledAt: when },
          activity: { kind: "cancel_accepted", at: when, detail: "buyer" },
        },
        notify: "cancelled",
      };
    }
    return {
      ok: true,
      patch: {
        fields: { cancelStatus: "requested", cancelKind: "cancel", cancelRequestedAt: when },
        activity: { kind: "cancel_requested", at: when },
      },
      notify: "cancel_requested",
    };
  }
  if (kind === "reverse_accept" || kind === "reverse_decline") {
    if (rfq.reverseStatus !== "requested") return { ok: true, noop: true };
    if (kind === "reverse_accept") return { ok: true, patch: revisingPatch(rfq, "reverse_accepted", when, who) };
    return {
      ok: true,
      patch: { fields: { reverseStatus: "declined", reverseDeclinedAt: when }, activity: { kind: "reverse_declined", at: when, by: who } },
    };
  }
  if (kind === "cancel_accept" || kind === "cancel_decline") {
    if (rfq.cancelStatus !== "requested") return { ok: true, noop: true };
    if (kind === "cancel_accept") {
      return {
        ok: true,
        patch: {
          fields: { cancelStatus: "accepted", reviewStatus: "cancelled", cancelledAt: when, cancelledBy: who },
          activity: { kind: "cancel_accepted", at: when, by: who },
        },
      };
    }
    return {
      ok: true,
      patch: { fields: { cancelStatus: "declined", cancelDeclinedAt: when }, activity: { kind: "cancel_declined", at: when, by: who } },
    };
  }
  return { ok: false, error: "decision" };
}

const GUEST_ADDRESSES = new Set(["", "__guest__", "guest@subbie.store"]);

/**
 * `guest` when Sales has not given this record to a member account.
 * A guest who typed a real email is still a guest (`buyerKind: "guest"`). Older records with no kind
 * fall back to the email shape.
 */
export function rfqBuyerKind(rfq) {
  if (rfq?.buyerKind === "guest") return "guest";
  if (rfq?.buyerKind === "member") return "member";
  const email = String(rfq?.buyerEmail || "").trim().toLowerCase();
  if (GUEST_ADDRESSES.has(email) || email.startsWith("guest@")) return "guest";
  return "member";
}

/**
 * A guest record can be given to a member. `buyerKind: "guest"` counts even when the guest typed a
 * real email (a purchase order always has one). A record already marked `member` cannot move again.
 * Older RFQs with no kind still use the email shape.
 */
function assignableGuest(record) {
  if (record?.buyerKind === "guest") return true;
  if (record?.buyerKind === "member") return false;
  return rfqBuyerKind(record) === "guest";
}

/**
 * Sales give a guest RFQ or purchase order to a registered member. Only a guest record can be assigned.
 * `buyer` is the member record the caller already checked ({ email, name, phone }).
 */
export function planAssign(rfq, { buyer, by, at } = {}) {
  const email = String(buyer?.email || "").trim().toLowerCase();
  if (!email || !email.includes("@")) return { ok: false, error: "missing_buyer" };
  if (!assignableGuest(rfq)) return { ok: false, error: "locked" };
  const when = at || new Date().toISOString();
  return {
    ok: true,
    patch: {
      fields: {
        buyerEmail: String(buyer.email).trim(),
        buyerName: buyer.name || rfq.buyerName || "",
        buyerKind: "member",
        buyerPhone: rfq.buyerPhone || buyer.phone || "",
        assignedFromGuest: true,
        assignedAt: when,
      },
      activity: { kind: "assigned", at: when, detail: String(buyer.email).trim(), by: String(by || "") },
    },
  };
}

/** An image URL that is safe to keep in a frozen quote (no inline data). */
export function snapshotLineImage(line) {
  const image = String(line?.image || "").trim();
  return image.startsWith("data:") ? "" : image;
}

/**
 * What Sales quote for a line. `qty` and `remark` are the member's own words; Sales' changes live in
 * `salesQty` and `salesRemark`, so a member's request is never overwritten and a draft never leaks.
 */
export function salesLine(line) {
  if (!line) return line;
  const qty = Number(line.salesQty) > 0 ? Number(line.salesQty) : line.qty;
  const remark = typeof line.salesRemark === "string" ? line.salesRemark : line.remark;
  return { ...line, qty, remark };
}

/** Freeze quote lines: price and quantity as they were when delivered. */
export function freezeQuoteLines(lines) {
  return (lines || []).map((raw) => {
    const line = salesLine(raw);
    const qty = Number(line.qty) || 0;
    const unitPrice = line.noOffer ? null : Number(line.quotedUnitPrice) > 0 ? Number(line.quotedUnitPrice) : null;
    return {
      productId: line.productId,
      name: line.name || "",
      productNo: line.productNo || "",
      qty,
      unit: line.unit || "",
      quotedUnitPrice: unitPrice,
      noOffer: Boolean(line.noOffer),
      custom: Boolean(line.custom),
      remark: String(line.remark || ""),
      image: snapshotLineImage(line),
      lineTotal: unitPrice != null ? unitPrice * qty : 0,
    };
  });
}

export function quoteVersionList(rfq) {
  return Array.isArray(rfq?.quoteVersions) ? rfq.quoteVersions : [];
}

/** Next version number. `known` is the highest number the caller already holds (bridge only). */
export function nextQuoteVersionNo(rfq, known = 0) {
  const highest = quoteVersionList(rfq).reduce((max, row) => Math.max(max, Number(row?.version) || 0), 0);
  return Math.max(highest, Number(known) || 0) + 1;
}

export function buildDeliveredQuoteVersion(rfq, { channel, token, lines, note, createdAt, knownVersion } = {}) {
  const frozenLines = freezeQuoteLines(lines || rfq?.lines);
  const quotedSubtotal = frozenLines
    .filter((line) => !line.noOffer && line.quotedUnitPrice != null)
    .reduce((sum, line) => sum + line.lineTotal, 0);
  return {
    version: nextQuoteVersionNo(rfq, knownVersion),
    createdAt: createdAt || new Date().toISOString(),
    channel: channel === "whatsapp" ? "whatsapp" : "marketplace",
    token: token || "",
    lines: frozenLines,
    quotedSubtotal,
    deadline: rfq?.responseDate || "",
    quoteNote: String(note || rfq?.quoteNote || "").trim(),
  };
}

export function applyDeliveredQuoteVersion(rfq, version, extra = {}) {
  return {
    ...rfq,
    quoteVersions: [...quoteVersionList(rfq), version],
    quoteEffectiveVersion: version.version,
    quotedSubtotal: version.quotedSubtotal,
    ...extra,
  };
}

/**
 * Sales submit the quote worksheet to a member (Submit To Buyer / Update quote to buyer).
 * A guest RFQ is refused with `guest`: guests get the quote on WhatsApp. `draftLines` is the worksheet
 * Sales are looking at: [{ productId, name, productNo, unit, qty, quotedUnitPrice, noOffer, custom, remark, image }].
 * Success freezes a NEW version (v1 -> v2 of the same RFQ, never a new RFQ id).
 */
export function planQuoteSubmit(rfq, { draftLines, note, by, at, token, knownVersion } = {}) {
  if (rfqBuyerKind(rfq) !== "member") return { ok: false, error: "guest" };
  const status = inboxStatus(rfq);
  if (status === "no_offer" || status === "rejected") return { ok: false, error: "rejected" };
  if (status === "cancelled" || rfq.cancelStatus === "requested") return { ok: false, error: "cancel" };
  if (status !== "accepted" && status !== "quoted") return { ok: false, error: "not_accepted" };

  const lines = (Array.isArray(draftLines) ? draftLines : []).map((line) => {
    if (line.noOffer) return { ...line, quotedUnitPrice: null, noOffer: true };
    const n = line.quotedUnitPrice === "" || line.quotedUnitPrice == null ? NaN : Number(line.quotedUnitPrice);
    return { ...line, quotedUnitPrice: Number.isFinite(n) && n > 0 ? n : null };
  });
  const offered = lines.filter((line) => !line.noOffer);
  if (!offered.length || offered.some((line) => line.quotedUnitPrice == null)) return { ok: false, error: "prices" };

  const when = at || new Date().toISOString();
  const quoteNote = String(note || "").trim();
  const version = buildDeliveredQuoteVersion(
    { ...rfq, quoteNote },
    { channel: "marketplace", token, lines, note: quoteNote, createdAt: when, knownVersion },
  );
  return {
    ok: true,
    patch: {
      fields: { reviewStatus: "quoted", quotedAt: when, quoteNote, lines },
      version,
      activity: { kind: "quoted", at: when, detail: `v${version.version}`, by: String(by || "") },
    },
  };
}

function hasPhone(phone) {
  return String(phone || "").replace(/\D/g, "").length >= 6;
}

/** What a guest sees on the public quote link: the quote only, never the buyer's contact details. */
export function publicQuoteView(snapshot) {
  if (!snapshot) return null;
  return {
    token: snapshot.token,
    rfqId: snapshot.rfqId,
    askKind: snapshot.askKind === "buy" ? "buy" : "quote",
    responseDate: snapshot.responseDate || "",
    quoteNote: snapshot.quoteNote || "",
    quotedSubtotal: Number(snapshot.quotedSubtotal) || 0,
    createdAt: snapshot.createdAt || "",
    lines: (snapshot.lines || []).map((line) => ({
      productId: line.productId,
      name: line.name || "",
      productNo: line.productNo || "",
      qty: Number(line.qty) || 0,
      unit: line.unit || "",
      quotedUnitPrice: line.quotedUnitPrice ?? null,
      noOffer: Boolean(line.noOffer),
      remark: line.remark || "",
      image: snapshotLineImage(line),
      lineTotal: Number(line.lineTotal) || 0,
    })),
  };
}

/**
 * Freeze the quote for the WhatsApp message: a public token and a frozen copy of the worksheet.
 * Needs an accepted (or already WhatsApp-quoted) RFQ, a price on every offered line, and a phone number.
 * Does not create a version and never sets `reviewStatus: quoted`: that happens only at "Quote sent on WhatsApp".
 */
export function planWhatsappFreeze(rfq, { draftLines, phone, token, by, at } = {}) {
  const status = inboxStatus(rfq);
  if (status !== "accepted" && status !== "quoted" && String(rfq?.quoteDelivery || "") !== "whatsapp") {
    return { ok: false, error: "status" };
  }
  const lines = (Array.isArray(draftLines) ? draftLines : []).map((line) => (line.noOffer ? { ...line, quotedUnitPrice: null } : line));
  const offered = lines.filter((line) => !line.noOffer);
  if (!offered.length || offered.some((line) => !(Number(line.quotedUnitPrice) > 0))) return { ok: false, error: "prices" };
  const contact = String(phone || rfq?.buyerPhone || "").trim();
  if (!hasPhone(contact)) return { ok: false, error: "phone" };

  const when = at || new Date().toISOString();
  const frozen = freezeQuoteLines(lines);
  const snapshot = {
    token,
    rfqId: rfq.id,
    askKind: rfq.askKind === "buy" ? "buy" : "quote",
    responseDate: rfq.responseDate || "",
    quoteNote: String(rfq.quoteNote || "").trim(),
    lines: frozen,
    quotedSubtotal: frozen.filter((l) => !l.noOffer && l.quotedUnitPrice != null).reduce((sum, l) => sum + l.lineTotal, 0),
    createdAt: when,
  };
  return {
    ok: true,
    patch: {
      fields: {
        buyerPhone: contact,
        quotePublicToken: token,
        quotePublicTokens: [...new Set([...(rfq.quotePublicTokens || []), token])],
      },
    },
    snapshot,
    by: String(by || ""),
  };
}

/**
 * Sales click "Quote sent on WhatsApp". Freezes a new version (channel `whatsapp`) from the last frozen
 * link. Sets `quoteDelivery: "whatsapp"` only: never `reviewStatus: quoted`, and never through the member submit.
 * Pressing it twice for the same link adds an activity line, not a second version.
 */
export function planWhatsappSent(rfq, { snapshot, by, at, knownVersion } = {}) {
  const token = String(rfq?.quotePublicToken || "").trim();
  if (!token || !snapshot || snapshot.token !== token) return { ok: false, error: "not_frozen" };
  const sentAt = at || new Date().toISOString();
  const fields = { quoteDelivery: "whatsapp", quoteDeliveredAt: sentAt };
  const already = quoteVersionList(rfq).some((row) => row.token && row.token === token);
  if (already) {
    return { ok: true, patch: { fields, activity: { kind: "whatsapp_quote", at: sentAt, by: String(by || "") } } };
  }
  const version = buildDeliveredQuoteVersion(rfq, {
    channel: "whatsapp",
    token,
    lines: snapshot.lines,
    note: snapshot.quoteNote,
    createdAt: sentAt,
    knownVersion,
  });
  return {
    ok: true,
    patch: { fields, version, activity: { kind: "whatsapp_quote", at: sentAt, detail: `v${version.version}`, by: String(by || "") } },
  };
}

/**
 * Fields the server owns on an RFQ. The browser copy never decides these: after each sync the server's
 * value replaces the local one. Everything else (worksheet lines, request versions, PO, TMS) is still
 * browser-held until it moves too.
 */
export const SERVER_OWNED_FIELDS = [
  "reviewStatus", "reason", "resubmittedAt", "acceptedAt", "acceptedBy", "noOfferAt", "returnedAt",
  "cancelStatus", "cancelKind", "cancelRequestedAt", "cancelledAt", "cancelledBy", "cancelDeclinedAt",
  "reverseStatus", "reverseRequestedAt", "reverseDeclinedAt",
  "buyerEmail", "buyerName", "buyerKind", "buyerPhone", "assignedFromGuest", "assignedAt",
  "quoteVersions", "quoteEffectiveVersion", "quotedSubtotal", "quotedAt", "quoteNote",
  "quoteDelivery", "quoteDeliveredAt", "quotePublicToken", "quotePublicTokens", "buyerPo",
];

/** The server-owned part of a stored record, as sent to the browser. */
export function ownedView(record, { staff = false } = {}) {
  const out = { id: record.id, createdAt: record.createdAt, activity: Array.isArray(record.activity) ? record.activity : undefined };
  /* The quote draft (prices Sales have not sent yet) is for staff only. A member never receives it. */
  if (staff && record.draft && typeof record.draft === "object") out.draft = record.draft;
  for (const key of SERVER_OWNED_FIELDS) {
    if (record[key] !== undefined) out[key] = record[key];
  }
  if (out.activity === undefined) delete out.activity;
  return out;
}

/**
 * Put the server-owned fields onto the browser copy. Activity lines are merged (the browser may still
 * hold lines the server has not seen). A server status of `received` never undoes a local `reviewing`.
 */
export function mergeOwned(local, owned) {
  const next = { ...local };
  for (const key of SERVER_OWNED_FIELDS) {
    if (owned[key] === undefined) continue;
    if (key === "reviewStatus" && owned[key] === "received" && local?.reviewStatus === "reviewing") continue;
    next[key] = owned[key];
  }
  if (Array.isArray(owned.draft?.prices) && Array.isArray(next.lines)) {
    const byId = new Map(owned.draft.prices.map((row) => [String(row.productId), row]));
    next.lines = next.lines.map((line) => {
      const row = byId.get(String(line.productId));
      if (!row) return line;
      const merged = { ...line, quotedUnitPrice: row.quotedUnitPrice, noOffer: Boolean(row.noOffer) };
      if (Number(row.salesQty) > 0) merged.salesQty = Number(row.salesQty);
      else delete merged.salesQty;
      if (typeof row.salesRemark === "string") merged.salesRemark = row.salesRemark;
      else delete merged.salesRemark;
      return merged;
    });
  }
  if (Array.isArray(owned.activity)) {
    const seen = new Set();
    const merged = [];
    for (const row of [...(local?.activity || []), ...owned.activity]) {
      const key = activityDedupeKey(row);
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(row);
    }
    next.activity = merged.sort((a, b) => (Date.parse(a.at) || 0) - (Date.parse(b.at) || 0));
  }
  return next;
}

/**
 * A member edits or resubmits an RFQ that Sales sent back (`returned`) or opened for revision (`revising`).
 * Edits are only allowed in those two states. Resubmitting puts the RFQ back to `received`.
 */
export function planBuyerContent(rfq, { resubmit, at } = {}) {
  const status = inboxStatus(rfq);
  if (status !== "returned" && status !== "revising") return { ok: false, error: "locked" };
  if (!resubmit) return { ok: true, patch: { fields: {} } };
  const when = at || new Date().toISOString();
  const fields = { reviewStatus: "received", reviewingBy: "", resubmittedAt: when };
  if (status === "revising") fields.reverseStatus = "";
  return { ok: true, patch: { fields, activity: { kind: "resubmitted", at: when } } };
}

/** The draft prices of a worksheet: what the server keeps for Sales until they send. */
export function draftPricesOf(lines) {
  return (lines || []).map((line) => ({
    productId: String(line.productId ?? ""),
    quotedUnitPrice: line.noOffer || !(Number(line.quotedUnitPrice) >= 0) || line.quotedUnitPrice === null || line.quotedUnitPrice === "" ? null : Number(line.quotedUnitPrice),
    noOffer: Boolean(line.noOffer),
    salesQty: Number(line.salesQty) > 0 ? Number(line.salesQty) : null,
    salesRemark: typeof line.salesRemark === "string" ? line.salesRemark : null,
  }));
}

/** What a member (or a shared copy) may see of an RFQ's line prices: only what was delivered, never the draft. */
export function deliveredLinePrices(rfq) {
  const versions = Array.isArray(rfq?.quoteVersions) ? rfq.quoteVersions : [];
  const stored = Number(rfq?.quoteEffectiveVersion);
  const effective = versions.find((row) => Number(row.version) === stored) || versions[versions.length - 1] || null;
  const byId = new Map((effective?.lines || []).map((line) => [String(line.productId ?? ""), line]));
  return (rfq?.lines || []).map((raw) => {
    const { salesQty, salesRemark, ...line } = raw;
    const frozen = byId.get(String(line.productId ?? ""));
    return { ...line, quotedUnitPrice: frozen ? frozen.quotedUnitPrice ?? null : null, noOffer: frozen ? Boolean(frozen.noOffer) : Boolean(line.noOffer && !versions.length && rfq?.reviewStatus === "no_offer") };
  });
}

/**
 * A member makes a purchase order from a quote. Only against the effective (last delivered) version,
 * only for its priced lines, and only once. Returns the PO lines and total from that version; the
 * server numbers the order.
 */
export function planPoFromQuote(rfq) {
  if (rfq?.buyerPo?.id) return { ok: true, existing: true };
  const status = inboxStatus(rfq);
  if (status === "cancelled" || status === "no_offer") return { ok: false, error: "locked" };
  if (rfq?.cancelStatus === "requested" || rfq?.reverseStatus === "requested") return { ok: false, error: "locked" };
  if (status !== "quoted") return { ok: false, error: "no_quote" };
  const versions = Array.isArray(rfq?.quoteVersions) ? rfq.quoteVersions : [];
  const stored = Number(rfq?.quoteEffectiveVersion);
  const effective = versions.find((row) => Number(row.version) === stored) || versions[versions.length - 1] || null;
  const priced = (effective?.lines || []).filter((line) => !line.noOffer && Number(line.quotedUnitPrice) > 0);
  if (!effective || !priced.length) return { ok: false, error: "no_quote" };
  const lines = priced.map((line) => {
    const qty = Number(line.qty) || 0;
    const unitPrice = Number(line.quotedUnitPrice);
    return {
      productId: String(line.productId ?? ""),
      sku: String(line.productNo || line.productId || ""),
      name: String(line.name || line.productNo || line.productId || ""),
      unit: String(line.unit || ""),
      qty,
      unitPrice,
      lineTotal: Math.round(unitPrice * qty * 100) / 100,
    };
  });
  const total = Math.round(lines.reduce((sum, line) => sum + line.lineTotal, 0) * 100) / 100;
  return { ok: true, lines, total, quoteVersion: Number(effective.version) || 1 };
}
