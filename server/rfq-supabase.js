import { canSee, PREFIXES } from "./rfq-core.js";

/**
 * RFQ and PO store on Supabase. Same methods as `createStore` in rfq-core.js, but one row per record
 * (public.rfq_records / public.po_records) instead of one blob, so serverless instances never overwrite
 * each other. Numbering and the revision check run inside Postgres (create_doc / update_doc), not here.
 * Server only: it needs the service role client, and the tables give browsers no access.
 */

const TABLE = { rfq: "rfq_records", po: "po_records" };
const PAGE = 1000;
const MAX_ROWS = 5000;
const TOKEN = /^[A-Za-z0-9_-]{8,80}$/;

function fail(error) {
  return new Error(`rfq_store_${error?.message || error?.code || "error"}`);
}

export function createSupabaseStore(client, { now = () => Date.now() } = {}) {
  async function fetchRow(kind, id) {
    const { data, error } = await client.from(TABLE[kind]).select("record").eq("id", String(id)).maybeSingle();
    if (error) throw fail(error);
    return data?.record || null;
  }

  async function create(kind, input, actor) {
    if (!PREFIXES[kind]) return { error: "kind" };
    const { data, error } = await client.rpc("create_doc", {
      p_kind: kind,
      p_at: new Date(now()).toISOString(),
      p_by: actor?.kind || "guest",
      p_input: input || {},
    });
    if (error) throw fail(error);
    return { ok: true, record: data };
  }

  function legacyRecord(payload) {
    if (!payload || typeof payload !== "object" || !payload.id) return null;
    const lines = Array.isArray(payload.lines) ? payload.lines : [];
    return {
      ...payload,
      id: String(payload.id),
      revision: Number(payload.revision) || 1,
      lines,
      payload: { ...payload, lines },
      reviewStatus: payload.reviewStatus || payload.status || "received",
      createdAt: payload.createdAt || payload.submittedAt || "",
    };
  }

  async function fetchLegacy(id) {
    const { data, error } = await client.from("rfqs").select("payload").eq("id", String(id)).maybeSingle();
    if (error) throw fail(error);
    return legacyRecord(data?.payload);
  }

  async function saveLegacy(record) {
    const payload = { ...(record.payload || {}) };
    for (const [key, value] of Object.entries(record)) {
      if (key !== "payload") payload[key] = value;
    }
    const { error } = await client.from("rfqs").update({
      payload,
      updated_at: new Date(now()).toISOString(),
    }).eq("id", record.id);
    if (error) throw fail(error);
    return legacyRecord(payload);
  }

  async function update(kind, id, expectedRevision, change, actor) {
    if (!PREFIXES[kind]) return { error: "kind" };
    let current = await fetchRow(kind, id);
    let legacy = false;
    if (!current && kind === "rfq" && actor?.kind === "staff") {
      current = await fetchLegacy(id);
      legacy = Boolean(current);
    }
    if (!current || !canSee(current, actor)) return { error: "not_found" };
    if (Number(expectedRevision) !== current.revision) return { error: "conflict", current };
    const result = await change(current);
    if (result?.error) return { error: result.error, current };
    const next = { ...current, ...result, id, revision: legacy ? current.revision + 1 : current.revision };
    if (legacy) return { ok: true, record: await saveLegacy(next) };
    const { data, error } = await client.rpc("update_doc", {
      p_kind: kind,
      p_id: id,
      p_expected: current.revision,
      p_at: new Date(now()).toISOString(),
      p_record: next,
    });
    if (error) throw fail(error);
    if (!data) return { error: "conflict", current: (await fetchRow(kind, id)) || current };
    return { ok: true, record: data };
  }

  async function get(kind, id, actor) {
    if (!PREFIXES[kind]) return null;
    const record = await fetchRow(kind, id);
    if (record && canSee(record, actor)) return record;
    if (kind === "rfq" && actor?.kind === "staff") {
      const legacy = await fetchLegacy(id);
      return legacy && canSee(legacy, actor) ? legacy : null;
    }
    return null;
  }

  async function list(kind, actor) {
    if (!PREFIXES[kind]) return [];
    const email = String(actor?.email || "").trim().toLowerCase();
    if (actor?.kind !== "staff" && !(actor?.kind === "buyer" && email)) return [];
    const rows = [];
    for (let from = 0; from < MAX_ROWS; from += PAGE) {
      let query = client.from(TABLE[kind]).select("record").order("created_at", { ascending: false }).order("id", { ascending: false });
      if (actor.kind !== "staff") query = query.eq("buyer_email", email);
      const { data, error } = await query.range(from, from + PAGE - 1);
      if (error) throw fail(error);
      rows.push(...(data || []).map((row) => row.record));
      if ((data || []).length < PAGE) break;
    }
    return rows.filter((record) => canSee(record, actor));
  }

  /** Sales inbox before rfq_records: one row per RFQ in public.rfqs. Staff only; the caller checks the actor. */
  async function listLegacy() {
    const rows = [];
    for (let from = 0; from < MAX_ROWS; from += PAGE) {
      const { data, error } = await client
        .from("rfqs")
        .select("payload")
        .order("updated_at", { ascending: false })
        .range(from, from + PAGE - 1);
      if (error) throw fail(error);
      rows.push(...(data || []).map((row) => row.payload));
      if ((data || []).length < PAGE) break;
    }
    return rows;
  }

  async function countPosByVisitor(visitor, sinceMs) {
    const { count, error } = await client
      .from(TABLE.po)
      .select("id", { count: "exact", head: true })
      .eq("visitor", String(visitor))
      .gte("created_at", new Date(sinceMs).toISOString());
    if (error) throw fail(error);
    return count || 0;
  }

  async function findRfqBySnapshot(token) {
    if (!TOKEN.test(String(token || ""))) return null;
    const { data, error } = await client.rpc("find_rfq_by_snapshot", { p_token: String(token) });
    if (error) throw fail(error);
    return data || null;
  }

  return { create, update, get, list, listLegacy, countPosByVisitor, findRfqBySnapshot };
}
