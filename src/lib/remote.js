function localPath(path) {
  const value = String(path || "");
  if (!value.startsWith("/") || value.startsWith("//")) {
    throw new Error("remote path must stay on this prototype");
  }
  return value;
}

async function send(path, { method = "GET", body, headers, cache, timeoutMs } = {}) {
  const init = { method, credentials: "same-origin" };
  if (cache) init.cache = cache;
  let timer;
  if (timeoutMs) {
    const controller = new AbortController();
    init.signal = controller.signal;
    timer = setTimeout(() => controller.abort(), timeoutMs);
  }
  const nextHeaders = { ...(headers || {}) };
  const isFormData = typeof FormData !== "undefined" && body instanceof FormData;
  if (body !== undefined) {
    if (isFormData) {
      init.body = body;
    } else {
      nextHeaders["content-type"] = nextHeaders["content-type"] || "application/json";
      init.body = typeof body === "string" ? body : JSON.stringify(body);
    }
  }
  if (Object.keys(nextHeaders).length) init.headers = nextHeaders;
  try {
    return await fetch(localPath(path), init);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function sendJson(path, options) {
  const res = await send(path, options);
  const data = await res.json().catch(() => null);
  return { res, data };
}

export async function getCatalog(ifNoneMatch) {
  const headers = {};
  if (ifNoneMatch) headers["If-None-Match"] = ifNoneMatch;
  const res = await send("/api/catalog", { headers, cache: "no-store" });
  if (res.status === 304) return { status: 304, ok: true, data: null };
  const data = await res.json().catch(() => null);
  return { status: res.status, ok: res.ok, data };
}

export async function commitCatalog(body) {
  return sendJson("/api/catalog/commit", { method: "POST", body });
}

export async function getCatalogVersion() {
  return sendJson("/api/catalog-version", { cache: "no-store" });
}

export async function getCatalogLive(id) {
  const { res, data } = await sendJson(`/api/catalog-snapshot?part=status&id=${encodeURIComponent(id)}`, { cache: "no-store" });
  if (!res.ok) return true;
  return data?.live !== false;
}

export async function getHostCatalog() {
  const { res, data } = await sendJson("/catalog.json", { cache: "no-store" });
  if (!res.ok) return null;
  return data;
}

export async function getPromo() {
  const { res, data } = await sendJson("/api/promo", { cache: "no-store" });
  return res.ok ? data : null;
}

export async function savePromo(body) {
  return sendJson("/api/promo", { method: "POST", body });
}

/**
 * Ask the server to issue the RFQ number and time.
 * Returns { ok:true, id, createdAt } | { ok:false, legacy:true } (server has no RFQ store here) | { ok:false, error }.
 */
export async function registerRfq(body) {
  try {
    const { res, data } = await sendJson("/api/rfq", { method: "POST", body: { action: "register", ...body } });
    if (res.status === 501) return { ok: false, legacy: true };
    if (!res.ok || !data?.ok) return { ok: false, error: data?.error || `http_${res.status}` };
    return { ok: true, id: data.id, createdAt: data.createdAt, revision: data.revision, mailed: Boolean(data.mailed) };
  } catch {
    return { ok: false, error: "network" };
  }
}

/**
 * Place a purchase order for priced goods. The server prices the lines and numbers the PO.
 * Returns { ok:true, po } | { ok:false, legacy:true } | { ok:false, error, productId }.
 */
export async function createPurchaseOrderRemote(body) {
  try {
    const { res, data } = await sendJson("/api/rfq", { method: "POST", body: { action: "po_create", ...body } });
    if (res.status === 501) return { ok: false, legacy: true };
    if (!res.ok || !data?.ok) return { ok: false, error: data?.error || `http_${res.status}`, productId: data?.productId || "" };
    return { ok: true, po: data.po };
  } catch {
    return { ok: false, error: "network" };
  }
}

/** Purchase orders the caller may see (staff: all, member: their own). */
export async function listPurchaseOrders() {
  try {
    const { res, data } = await sendJson("/api/rfq?kind=po", { cache: "no-store" });
    if (res.status === 501) return { ok: true, records: [], legacy: true };
    if (!res.ok || !data?.ok) return { ok: false, error: data?.error || `http_${res.status}` };
    return { ok: true, records: data.records || [] };
  } catch {
    return { ok: false, error: "network" };
  }
}

/**
 * Accept / no offer / cancel / reverse on an RFQ (staff, or the owning buyer for `buyer_cancel` and `buyer_reverse`). The server checks the rules and stamps time and staff.
 * Returns { ok, patch } to apply to the local copy, or { legacy:true } when the server cannot take it
 * (Vercel, or an RFQ the server does not hold), so the caller can use the old local rules.
 */
export async function decideRfqOnServer(id, { decision, reason } = {}) {
  try {
    const { res, data } = await sendJson("/api/rfq", { method: "POST", body: { action: "rfq_decide", id, decision, reason } });
    if (res.status === 501 || res.status === 404) return { ok: false, legacy: true };
    if (!res.ok || !data?.ok) return { ok: false, error: data?.error || `http_${res.status}` };
    return { ok: true, noop: Boolean(data.noop), patch: data.patch || null, notify: data.notify || "", mail: data.mail || null };
  } catch {
    return { ok: false, error: "network" };
  }
}

/**
 * Staff only: give a guest RFQ to a registered member. The server decides and stamps time and staff.
 * Returns { ok, patch }, or { legacy:true } when the server does not hold this RFQ.
 */
export async function assignRfqOnServer(id, buyer) {
  try {
    const { res, data } = await sendJson("/api/rfq", { method: "POST", body: { action: "rfq_assign", id, buyer } });
    if (res.status === 501 || res.status === 404) return { ok: false, legacy: true };
    if (!res.ok || !data?.ok) return { ok: false, error: data?.error || `http_${res.status}` };
    return { ok: true, patch: data.patch };
  } catch {
    return { ok: false, error: "network" };
  }
}

/**
 * Staff only: submit the quote worksheet to a member. The server checks the rules and freezes the version.
 * Returns { ok, patch }, or { legacy:true } when the server cannot take it (Vercel, an RFQ it does not hold,
 * or a copy that no longer matches the worksheet), so the caller can use the old local rules.
 */
export async function submitQuoteOnServer(id, { lines, note, knownVersion } = {}) {
  try {
    const { res, data } = await sendJson("/api/rfq", { method: "POST", body: { action: "rfq_quote", id, lines, note, knownVersion } });
    if (res.status === 501 || res.status === 404) return { ok: false, legacy: true };
    if (!res.ok || !data?.ok) return { ok: false, error: data?.error || `http_${res.status}` };
    return { ok: true, patch: data.patch };
  } catch {
    return { ok: false, error: "network" };
  }
}

/**
 * Staff only: freeze the quote for a WhatsApp message (public token and frozen copy live on the server).
 * Returns { ok, patch, token }, or { legacy:true } when the server cannot take it.
 */
export async function freezeWhatsappQuoteOnServer(id, { lines, phone } = {}) {
  try {
    const { res, data } = await sendJson("/api/rfq", { method: "POST", body: { action: "rfq_wa_freeze", id, lines, phone } });
    if (res.status === 501 || res.status === 404) return { ok: false, legacy: true };
    if (!res.ok || !data?.ok) return { ok: false, error: data?.error || `http_${res.status}` };
    return { ok: true, patch: data.patch, token: data.token };
  } catch {
    return { ok: false, error: "network" };
  }
}

/** Staff only: "Quote sent on WhatsApp". Returns { ok, patch }, or { legacy:true } when the server has no frozen link for it. */
export async function markWhatsappSentOnServer(id, { knownVersion } = {}) {
  try {
    const { res, data } = await sendJson("/api/rfq", { method: "POST", body: { action: "rfq_wa_sent", id, knownVersion } });
    if (res.status === 501 || res.status === 404) return { ok: false, legacy: true };
    if (!res.ok || !data?.ok) return { ok: false, error: data?.error || `http_${res.status}` };
    return { ok: true, patch: data.patch };
  } catch {
    return { ok: false, error: "network" };
  }
}

/** The frozen quote behind a public link. { legacy:true } when the server does not hold it. */
export async function getPublicQuote(token) {
  try {
    const { res, data } = await sendJson(`/api/rfq?quote=${encodeURIComponent(token)}`, { cache: "no-store" });
    if (!res.ok || !data?.ok) return { ok: false, legacy: true };
    return { ok: true, quote: data.quote };
  } catch {
    return { ok: false, legacy: true };
  }
}

/** One RFQ or PO as the server holds it (staff also get the mail log). */
export async function getRfqRecord(id) {
  try {
    const { res, data } = await sendJson(`/api/rfq?id=${encodeURIComponent(id)}`, { cache: "no-store" });
    if (!res.ok || !data?.ok) return { ok: false, error: data?.error || `http_${res.status}` };
    return { ok: true, record: data.record };
  } catch {
    return { ok: false, error: "network" };
  }
}

/** Staff only: retry the mails that failed for a PO or RFQ. */
export async function resendRecordMail(id) {
  try {
    const { res, data } = await sendJson("/api/rfq", { method: "POST", body: { action: "mail_resend", id } });
    if (!res.ok || !data?.ok) return { ok: false, error: data?.error || `http_${res.status}` };
    return { ok: true, record: data.record };
  } catch {
    return { ok: false, error: "network" };
  }
}

/**
 * Staff only: give a guest purchase order to a registered member.
 * Returns { ok, po }. The server keeps the number and status, and refuses a second assign.
 */
export async function assignPurchaseOrder(id, buyer) {
  try {
    const { res, data } = await sendJson("/api/rfq", { method: "POST", body: { action: "po_assign", id, buyer } });
    if (!res.ok || !data?.ok) return { ok: false, error: data?.error || `http_${res.status}` };
    return { ok: true, po: data.po };
  } catch {
    return { ok: false, error: "network" };
  }
}

/** Staff only: mark a PO as received. */
export async function confirmPurchaseOrder(id) {
  try {
    const { res, data } = await sendJson("/api/rfq", { method: "POST", body: { action: "po_confirm", id } });
    if (!res.ok || !data?.ok) return { ok: false, error: data?.error || `http_${res.status}` };
    return { ok: true, po: data.po };
  } catch {
    return { ok: false, error: "network" };
  }
}

export async function getSpecMatchStatus() {
  return sendJson("/api/spec-match");
}

export async function postSpecMatch(body) {
  return sendJson("/api/spec-match", { method: "POST", body });
}

export async function postAuth(body) {
  try {
    const { data } = await sendJson("/api/auth", { method: "POST", body, timeoutMs: 20000 });
    return data && typeof data === "object" ? data : { ok: false, error: "server" };
  } catch {
    return { ok: false, error: "network" };
  }
}

export async function postEmail(body) {
  return sendJson("/api/send-email", { method: "POST", body });
}

export async function getSharedStore() {
  return sendJson("/api/shared-store");
}

export async function postSharedStore(body) {
  return sendJson("/api/shared-store", { method: "POST", body });
}

export async function postData(op, payload = {}) {
  try {
    const { res, data } = await sendJson("/api/data", { method: "POST", body: { op, ...payload } });
    return { ok: Boolean(data?.ok), status: res.status, data };
  } catch {
    return { ok: false, status: 0, data: null };
  }
}

export async function getCatalogGroups() {
  const { res, data } = await sendJson("/api/catalog-groups", { cache: "no-store" });
  return res.ok ? data : null;
}

export async function saveCatalogGroups(groups) {
  return sendJson("/api/catalog-groups", { method: "POST", body: { groups } });
}

export async function uploadProductImage(dataUrl, productKey) {
  const { res, data } = await sendJson("/api/product-image", { method: "POST", body: { dataUrl, productKey } });
  if (!res.ok || !data?.image) {
    throw new Error(data?.error || "image");
  }
  return { image: data.image, imageFallback: data.imageFallback || "" };
}

export async function getTmsStatus() {
  const { data } = await sendJson("/api/tms-status");
  return Boolean(data?.configured);
}

export async function postTmsLogin(body) {
  return sendJson("/api/tms-login", { method: "POST", body });
}

export async function postTmsSubmit(body) {
  return sendJson("/api/tms-submit", { method: "POST", body });
}

export const BLOB_UPLOAD_PATH = "/api/blob-upload";

/** Short-lived ticket the server requires before it mints a private RFQ upload token. */
export async function getUploadTicket() {
  const { res, data } = await sendJson(BLOB_UPLOAD_PATH, { method: "POST", body: { type: "ticket" } });
  if (!res.ok || !data?.ticket) throw new Error(data?.error || "upload ticket");
  return data.ticket;
}

/** The server-owned part of each RFQ this person may see. `as` is "staff" in the Portal, "buyer" in the marketplace. */
export async function syncRfqsFromServer({ as, known }) {
  try {
    const { res, data } = await sendJson("/api/rfq", { method: "POST", body: { action: "rfq_sync", as, known } });
    if (res.status === 501 || res.status === 404) return { ok: false, legacy: true };
    if (!res.ok || !data?.ok) return { ok: false, error: data?.error || `http_${res.status}` };
    return { ok: true, rfqs: Array.isArray(data.rfqs) ? data.rfqs : [] };
  } catch {
    return { ok: false, error: "network" };
  }
}

/** A member edits or resubmits an RFQ Sales sent back. The server allows it or not, and moves the status on resubmit. */
export async function pushBuyerContent(id, content, { resubmit = false } = {}) {
  try {
    const { res, data } = await sendJson("/api/rfq", { method: "POST", body: { action: "rfq_buyer_content", id, content, resubmit } });
    if (res.status === 501 || res.status === 404) return { ok: false, legacy: true };
    if (!res.ok || !data?.ok) return { ok: false, error: data?.error || `http_${res.status}` };
    return { ok: true, patch: data.patch || null };
  } catch {
    return { ok: false, error: "network" };
  }
}

/** Staff only: keep Sales' unsent quote prices on the server. */
export async function saveQuoteDraft(id, prices) {
  try {
    const { res, data } = await sendJson("/api/rfq", { method: "POST", body: { action: "rfq_draft", id, prices } });
    if (res.status === 501 || res.status === 404) return { ok: false, legacy: true };
    if (!res.ok || !data?.ok) return { ok: false, error: data?.error || `http_${res.status}` };
    return { ok: true, draft: data.draft };
  } catch {
    return { ok: false, error: "network" };
  }
}

/** Staff only: keep the buyer contact number Sales follow up on. */
export async function saveBuyerPhone(id, phone) {
  try {
    const { res, data } = await sendJson("/api/rfq", { method: "POST", body: { action: "rfq_phone", id, phone } });
    if (res.status === 501 || res.status === 404) return { ok: false, legacy: true };
    if (!res.ok || !data?.ok) return { ok: false, error: data?.error || `http_${res.status}` };
    return { ok: true };
  } catch {
    return { ok: false, error: "network" };
  }
}

/** A member makes a purchase order from the effective version of their quoted RFQ. The server numbers it. */
export async function createPoFromQuote(id) {
  try {
    const { res, data } = await sendJson("/api/rfq", { method: "POST", body: { action: "po_from_quote", id } });
    if (res.status === 501 || res.status === 404) return { ok: false, legacy: true };
    if (!res.ok || !data?.ok) return { ok: false, error: data?.error || `http_${res.status}` };
    return { ok: true, noop: Boolean(data.noop), patch: data.patch || null };
  } catch {
    return { ok: false, error: "network" };
  }
}
