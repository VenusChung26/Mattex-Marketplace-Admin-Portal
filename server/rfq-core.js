/**
 * RFQ and PO core. Server only. The browser never decides numbers, status, or timestamps.
 *
 * State shape: { rfqs: { [id]: record }, pos: { [id]: record }, counters: { [`${prefix}-${yy}`]: number } }
 * Every record has `revision`. A write must present the revision it read; a stale write is refused
 * with { error: "conflict", current } so the caller can reload instead of overwriting.
 *
 * Storage is an adapter ({ load, save }) so Supabase can replace the local file later.
 */

export const PREFIXES = { rfq: "RFQ", po: "PO" };
const KIND_KEY = { RFQ: "rfqs", PO: "pos" };

export function emptyState() {
  return { rfqs: {}, pos: {}, counters: {} };
}

function yearDigits(now) {
  return String(new Date(now).getUTCFullYear()).slice(-2);
}

/** `PREFIX-YY######`, counter restarts each year, e.g. RFQ-26000001. Old ids such as RFQ-1001 are never rewritten. */
export function takeNumber(state, prefix, now = Date.now()) {
  const yy = yearDigits(now);
  const key = `${prefix}-${yy}`;
  const next = (Number(state.counters[key]) || 0) + 1;
  state.counters[key] = next;
  return `${prefix}-${yy}${String(next).padStart(6, "0")}`;
}

function isStaff(actor) {
  return actor?.kind === "staff";
}

function ownedBy(record, actor) {
  const email = String(actor?.email || "").trim().toLowerCase();
  return Boolean(email) && String(record?.buyerEmail || "").trim().toLowerCase() === email;
}

/** Staff see everything. A member sees only their own. A guest sees nothing from a list. */
export function canSee(record, actor) {
  if (isStaff(actor)) return true;
  if (actor?.kind === "buyer") return ownedBy(record, actor);
  return false;
}

export function createStore(adapter, { now = () => Date.now() } = {}) {
  let chain = Promise.resolve();

  /** One write at a time, so two requests can never take the same number. */
  function locked(fn) {
    const run = chain.then(fn);
    chain = run.then(() => {}).catch(() => {});
    return run;
  }

  async function create(kind, input, actor) {
    const prefix = PREFIXES[kind];
    if (!prefix) return { error: "kind" };
    return locked(async () => {
      const state = (await adapter.load()) || emptyState();
      state.counters ||= {};
      const at = now();
      const id = takeNumber(state, prefix, at);
      const record = {
        ...input,
        id,
        revision: 1,
        createdAt: new Date(at).toISOString(),
        updatedAt: new Date(at).toISOString(),
        createdBy: actor?.kind || "guest",
      };
      state[KIND_KEY[prefix]] ||= {};
      state[KIND_KEY[prefix]][id] = record;
      await adapter.save(state);
      return { ok: true, record };
    });
  }

  /**
   * Applies `change(record)` only if `expectedRevision` still matches.
   * `change` returns the fields to merge, or { error } to refuse.
   */
  async function update(kind, id, expectedRevision, change, actor) {
    const prefix = PREFIXES[kind];
    if (!prefix) return { error: "kind" };
    return locked(async () => {
      const state = (await adapter.load()) || emptyState();
      const bucket = state[KIND_KEY[prefix]] || {};
      const current = bucket[id];
      if (!current || !canSee(current, actor)) return { error: "not_found" };
      if (Number(expectedRevision) !== current.revision) return { error: "conflict", current };
      const result = await change(current);
      if (result?.error) return { error: result.error, current };
      const next = { ...current, ...result, id, revision: current.revision + 1, updatedAt: new Date(now()).toISOString() };
      bucket[id] = next;
      state[KIND_KEY[prefix]] = bucket;
      await adapter.save(state);
      return { ok: true, record: next };
    });
  }

  async function get(kind, id, actor) {
    const state = (await adapter.load()) || emptyState();
    const record = (state[KIND_KEY[PREFIXES[kind]]] || {})[id];
    return record && canSee(record, actor) ? record : null;
  }

  async function list(kind, actor) {
    const state = (await adapter.load()) || emptyState();
    const all = Object.values(state[KIND_KEY[PREFIXES[kind]]] || {});
    return all
      .filter((record) => canSee(record, actor))
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  }

  /** How many records of this kind match. For server-side limits; never exposes the records. */
  async function countWhere(kind, test) {
    const state = (await adapter.load()) || emptyState();
    return Object.values(state[KIND_KEY[PREFIXES[kind]]] || {}).filter(test).length;
  }

  /** The first record of this kind that matches. For public lookups by an unguessable token; the caller shapes what is shown. */
  async function findWhere(kind, test) {
    const state = (await adapter.load()) || emptyState();
    return Object.values(state[KIND_KEY[PREFIXES[kind]]] || {}).find(test) || null;
  }

  /** How many orders this visitor key placed since the given time (a server-side limit). */
  async function countPosByVisitor(visitor, sinceMs) {
    return countWhere("po", (r) => r.visitor === visitor && Date.parse(r.createdAt) >= sinceMs);
  }

  /** The RFQ behind a frozen public quote link. The caller shapes what is shown. */
  async function findRfqBySnapshot(token) {
    return findWhere("rfq", (row) => Boolean((row.quoteSnapshots || {})[token]));
  }

  return { create, update, get, list, countWhere, findWhere, countPosByVisitor, findRfqBySnapshot };
}

export function memoryAdapter(initial) {
  let state = initial ? structuredClone(initial) : emptyState();
  return {
    async load() {
      return structuredClone(state);
    },
    async save(next) {
      state = structuredClone(next);
    },
  };
}
