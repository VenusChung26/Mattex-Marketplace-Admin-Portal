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

  async function update(kind, id, expectedRevision, change, actor) {
    if (!PREFIXES[kind]) return { error: "kind" };
    const current = await fetchRow(kind, id);
    if (!current || !canSee(current, actor)) return { error: "not_found" };
    if (Number(expectedRevision) !== current.revision) return { error: "conflict", current };
    const result = await change(current);
    if (result?.error) return { error: result.error, current };
    const next = { ...current, ...result, id };
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
    return record && canSee(record, actor) ? record : null;
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

  return { create, update, get, list, countPosByVisitor, findRfqBySnapshot };
}
