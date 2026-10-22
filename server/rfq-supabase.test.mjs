import assert from "node:assert/strict";
import test from "node:test";
import { emptyState, formatDocNo, takeNumber } from "./rfq-core.js";
import { createSupabaseStore } from "./rfq-supabase.js";

const staff = { kind: "staff", email: "sales@mattex.com.hk" };
const alice = { kind: "buyer", email: "Alice@Example.com" };
const bob = { kind: "buyer", email: "bob@example.com" };
const guest = { kind: "guest", email: "" };

/** A tiny stand-in for the Supabase client that behaves like create_doc / update_doc in the migration. */
function fakeClient() {
  const tables = { rfq_records: new Map(), po_records: new Map(), rfqs: new Map() };
  const counters = new Map();
  const calls = [];
  const kindOf = { rfq: "rfq_records", po: "po_records" };
  const stamp = (iso) => new Date(iso).toISOString();

  function query(table) {
    const filters = [];
    let count = false;
    const chain = {
      select(_cols, opts) {
        count = Boolean(opts?.count);
        return chain;
      },
      eq(col, value) {
        filters.push((row) => (col === "id" ? row.id : row[col] ?? row.record[col]) === value);
        return chain;
      },
      gte(col, value) {
        filters.push((row) => Date.parse(row.record.createdAt) >= Date.parse(value));
        return chain;
      },
      order() {
        return chain;
      },
      range(from, to) {
        chain.window = [from, to];
        return chain;
      },
      async maybeSingle() {
        const hit = [...tables[table].values()].find((row) => filters.every((f) => f(row)));
        if (!hit) return { data: null, error: null };
        if (table === "rfqs") return { data: { payload: hit.payload || hit.record }, error: null };
        return { data: { record: hit.record }, error: null };
      },
      then(resolve) {
        const rows = [...tables[table].values()].filter((row) => filters.every((f) => f(row)));
        rows.sort((a, b) => String(b.record.createdAt).localeCompare(String(a.record.createdAt)) || b.id.localeCompare(a.id));
        const [from, to] = chain.window || [0, rows.length];
        const part = rows.slice(from, to + 1).map((row) => ({ record: row.record }));
        resolve(count ? { count: rows.length, error: null } : { data: part, error: null });
      },
    };
    return chain;
  }

  return {
    calls,
    tables,
    from: (table) => query(table),
    async rpc(name, args) {
      calls.push(name);
      if (name === "create_doc") {
        const prefix = args.p_kind === "rfq" ? "RFQ" : "PO";
        const yy = String(new Date(args.p_at).getUTCFullYear()).slice(-2);
        const key = `${prefix}-${yy}`;
        const n = (counters.get(key) || 0) + 1;
        counters.set(key, n);
        const id = formatDocNo(prefix, yy, n);
        const record = { ...args.p_input, id, revision: 1, createdAt: stamp(args.p_at), updatedAt: stamp(args.p_at), createdBy: args.p_by };
        tables[kindOf[args.p_kind]].set(id, { id, buyer_email: String(record.buyerEmail || "").trim().toLowerCase(), visitor: record.visitor || "", record });
        return { data: record, error: null };
      }
      if (name === "update_doc") {
        const table = tables[kindOf[args.p_kind]];
        const row = table.get(args.p_id);
        if (!row || row.record.revision !== args.p_expected) return { data: null, error: null };
        const record = { ...args.p_record, id: args.p_id, revision: args.p_expected + 1, updatedAt: stamp(args.p_at) };
        table.set(args.p_id, { ...row, record, visitor: record.visitor || "" });
        return { data: record, error: null };
      }
      if (name === "find_rfq_by_snapshot") {
        const hit = [...tables.rfq_records.values()].find((row) => row.record.quoteSnapshots?.[args.p_token]);
        return { data: hit?.record || null, error: null };
      }
      return { data: null, error: { message: "unknown_rpc" } };
    },
  };
}

const at = (iso) => () => new Date(iso).getTime();

test("create asks Postgres for the number; the caller cannot choose id, revision or time", async () => {
  const client = fakeClient();
  const store = createSupabaseStore(client, { now: at("2026-10-14T09:00:00Z") });
  const { record } = await store.create("rfq", { id: "RFQ-1", revision: 9, buyerEmail: "alice@example.com" }, alice);
  assert.equal(record.id, "RFQ-26000001");
  assert.equal(record.id, takeNumber(emptyState(), "RFQ", new Date("2026-10-14T09:00:00Z").getTime()));
  assert.equal(record.id, formatDocNo("RFQ", "26", 1));
  assert.equal(record.revision, 1);
  assert.equal(record.createdAt, "2026-10-14T09:00:00.000Z");
  assert.equal(record.createdBy, "buyer");
  const po = await store.create("po", { buyerEmail: "alice@example.com" }, alice);
  assert.equal(po.record.id, "PO-26000001");
  assert.deepEqual(await store.create("nope", {}, alice), { error: "kind" });
});

test("members see only their own records; guests and strangers see none", async () => {
  const store = createSupabaseStore(fakeClient(), { now: at("2026-10-14T09:00:00Z") });
  const mine = (await store.create("rfq", { buyerEmail: "alice@example.com" }, alice)).record;
  await store.create("rfq", { buyerEmail: "bob@example.com" }, bob);
  assert.equal((await store.list("rfq", staff)).length, 2);
  assert.deepEqual((await store.list("rfq", alice)).map((r) => r.id), [mine.id]);
  assert.equal((await store.list("rfq", guest)).length, 0);
  assert.equal(await store.get("rfq", mine.id, bob), null);
  assert.equal((await store.get("rfq", mine.id, alice)).id, mine.id);
  assert.equal((await store.get("rfq", mine.id, staff)).id, mine.id);
});

test("update bumps the revision and refuses a stale write", async () => {
  const store = createSupabaseStore(fakeClient(), { now: at("2026-10-14T09:00:00Z") });
  const { record } = await store.create("rfq", { buyerEmail: "alice@example.com", reviewStatus: "received" }, alice);
  const ok = await store.update("rfq", record.id, 1, () => ({ reviewStatus: "accepted" }), staff);
  assert.equal(ok.record.revision, 2);
  assert.equal(ok.record.reviewStatus, "accepted");
  const stale = await store.update("rfq", record.id, 1, () => ({ reviewStatus: "no_offer" }), staff);
  assert.equal(stale.error, "conflict");
  assert.equal(stale.current.reviewStatus, "accepted");
  const hidden = await store.update("rfq", record.id, 2, () => ({}), bob);
  assert.equal(hidden.error, "not_found");
  const refused = await store.update("rfq", record.id, 2, () => ({ error: "locked" }), staff);
  assert.equal(refused.error, "locked");
});

test("a write that loses the race at the database is reported as a conflict, not applied", async () => {
  const client = fakeClient();
  const store = createSupabaseStore(client, { now: at("2026-10-14T09:00:00Z") });
  const { record } = await store.create("rfq", { buyerEmail: "alice@example.com", reviewStatus: "received" }, alice);
  const result = await store.update(
    "rfq",
    record.id,
    1,
    async () => {
      // Someone else writes between our read and our write.
      await client.rpc("update_doc", { p_kind: "rfq", p_id: record.id, p_expected: 1, p_at: "2026-10-14T09:00:01Z", p_record: { ...record, reviewStatus: "accepted" } });
      return { reviewStatus: "no_offer" };
    },
    staff,
  );
  assert.equal(result.error, "conflict");
  assert.equal(result.current.reviewStatus, "accepted");
});

test("order limit by visitor and the public quote token lookup", async () => {
  const store = createSupabaseStore(fakeClient(), { now: at("2026-10-14T09:00:00Z") });
  await store.create("po", { visitor: "v1", buyerEmail: "g@example.com" }, guest);
  await store.create("po", { visitor: "v1", buyerEmail: "g@example.com" }, guest);
  await store.create("po", { visitor: "v2", buyerEmail: "h@example.com" }, guest);
  assert.equal(await store.countPosByVisitor("v1", new Date("2026-10-14T00:00:00Z").getTime()), 2);
  assert.equal(await store.countPosByVisitor("v1", new Date("2026-10-15T00:00:00Z").getTime()), 0);

  const { record } = await store.create("rfq", { buyerEmail: "alice@example.com", quoteSnapshots: { abcdefgh12345678: { lines: [] } } }, alice);
  assert.equal((await store.findRfqBySnapshot("abcdefgh12345678")).id, record.id);
  assert.equal(await store.findRfqBySnapshot("does-not-exist-1"), null);
  assert.equal(await store.findRfqBySnapshot("../etc/passwd"), null);
  assert.equal(await store.findRfqBySnapshot("x"), null);
});

test("a database error surfaces as an error instead of an empty answer", async () => {
  const client = fakeClient();
  client.rpc = async () => ({ data: null, error: { message: "boom" } });
  const store = createSupabaseStore(client);
  await assert.rejects(() => store.create("rfq", {}, alice), /rfq_store_boom/);
});
