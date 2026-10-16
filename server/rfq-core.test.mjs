import assert from "node:assert/strict";
import test from "node:test";
import { applyDecision, planAssign } from "../src/lib/rfqRules.js";
import { createStore, memoryAdapter, takeNumber, emptyState } from "./rfq-core.js";

const staff = { kind: "staff", email: "sales@mattex.com.hk" };
const alice = { kind: "buyer", email: "Alice@Example.com" };
const bob = { kind: "buyer", email: "bob@example.com" };
const guest = { kind: "guest", email: "" };

const at = (iso) => () => new Date(iso).getTime();

test("numbers are PREFIX-YY###### and the counter is per prefix and per year", () => {
  const state = emptyState();
  const t26 = new Date("2026-10-14T00:00:00Z").getTime();
  const t27 = new Date("2027-01-01T00:00:00Z").getTime();
  assert.equal(takeNumber(state, "RFQ", t26), "RFQ-26000001");
  assert.equal(takeNumber(state, "RFQ", t26), "RFQ-26000002");
  assert.equal(takeNumber(state, "PO", t26), "PO-26000001");
  assert.equal(takeNumber(state, "RFQ", t27), "RFQ-27000001");
});

test("the server sets id, revision and timestamps; the caller cannot", async () => {
  const store = createStore(memoryAdapter(), { now: at("2026-10-14T09:00:00Z") });
  const { record } = await store.create("rfq", { id: "RFQ-1", revision: 99, createdAt: "1999", buyerEmail: "alice@example.com" }, alice);
  assert.equal(record.id, "RFQ-26000001");
  assert.equal(record.revision, 1);
  assert.equal(record.createdAt, "2026-10-14T09:00:00.000Z");
});

test("two creates at the same moment never share a number", async () => {
  const store = createStore(memoryAdapter(), { now: at("2026-10-14T09:00:00Z") });
  const made = await Promise.all(Array.from({ length: 20 }, () => store.create("rfq", { buyerEmail: "a@b.c" }, guest)));
  const ids = new Set(made.map((result) => result.record.id));
  assert.equal(ids.size, 20);
});

test("old ids such as RFQ-1001 stay as they are and new ones continue from the yearly counter", async () => {
  const store = createStore(
    memoryAdapter({ rfqs: { "RFQ-1001": { id: "RFQ-1001", revision: 1, createdAt: "2026-01-01T00:00:00Z", buyerEmail: "alice@example.com" } }, pos: {}, counters: {} }),
    { now: at("2026-10-14T09:00:00Z") },
  );
  await store.create("rfq", { buyerEmail: "alice@example.com" }, alice);
  const ids = (await store.list("rfq", staff)).map((record) => record.id);
  assert.deepEqual(ids, ["RFQ-26000001", "RFQ-1001"]);
});

test("a stale revision is refused and returns the current record", async () => {
  const store = createStore(memoryAdapter(), { now: at("2026-10-14T09:00:00Z") });
  const { record } = await store.create("rfq", { buyerEmail: "alice@example.com", reviewStatus: "received" }, alice);
  const first = await store.update("rfq", record.id, 1, () => ({ reviewStatus: "accepted" }), staff);
  assert.equal(first.record.revision, 2);
  const stale = await store.update("rfq", record.id, 1, () => ({ reviewStatus: "cancelled" }), staff);
  assert.equal(stale.error, "conflict");
  assert.equal(stale.current.reviewStatus, "accepted");
});

test("a change function can refuse, and nothing is written", async () => {
  const store = createStore(memoryAdapter(), { now: at("2026-10-14T09:00:00Z") });
  const { record } = await store.create("rfq", { buyerEmail: "alice@example.com", buyerKind: "guest" }, guest);
  const refused = await store.update("rfq", record.id, 1, () => ({ error: "guest" }), staff);
  assert.equal(refused.error, "guest");
  assert.equal((await store.get("rfq", record.id, staff)).revision, 1);
});

test("staff see all, a member sees only their own (email case ignored), a guest sees none", async () => {
  const store = createStore(memoryAdapter(), { now: at("2026-10-14T09:00:00Z") });
  const a = (await store.create("rfq", { buyerEmail: "alice@example.com" }, alice)).record;
  await store.create("rfq", { buyerEmail: "bob@example.com" }, bob);
  assert.equal((await store.list("rfq", staff)).length, 2);
  assert.deepEqual((await store.list("rfq", alice)).map((record) => record.id), [a.id]);
  assert.equal((await store.list("rfq", guest)).length, 0);
  assert.equal(await store.get("rfq", a.id, bob), null);
});

test("a member cannot update someone else's RFQ", async () => {
  const store = createStore(memoryAdapter(), { now: at("2026-10-14T09:00:00Z") });
  const { record } = await store.create("rfq", { buyerEmail: "alice@example.com" }, alice);
  const result = await store.update("rfq", record.id, 1, () => ({ reviewStatus: "cancelled" }), bob);
  assert.equal(result.error, "not_found");
});

test("RFQ and PO keep separate lists", async () => {
  const store = createStore(memoryAdapter(), { now: at("2026-10-14T09:00:00Z") });
  await store.create("rfq", { buyerEmail: "alice@example.com" }, alice);
  const po = (await store.create("po", { buyerEmail: "alice@example.com" }, alice)).record;
  assert.equal(po.id, "PO-26000001");
  assert.equal((await store.list("rfq", staff)).length, 1);
  assert.equal((await store.list("po", staff)).length, 1);
});

test("assigning a guest purchase order moves it onto that member's list", async () => {
  const store = createStore(memoryAdapter(), { now: at("2026-10-15T09:00:00Z") });
  const { record } = await store.create(
    "po",
    { buyerKind: "guest", buyerEmail: "walkin@example.com", buyerName: "Walk-in", buyerPhone: "91234567", status: "created" },
    guest,
  );
  const plan = planAssign(record, { buyer: { email: "Alice@Example.com", name: "Alice", phone: "999" }, by: staff.email, at: "2026-10-15T09:05:00.000Z" });
  const saved = await store.update("po", record.id, record.revision, () => {
    const next = applyDecision(record, plan.patch);
    return { ...plan.patch.fields, activity: next.activity };
  }, staff);
  assert.equal(saved.record.buyerKind, "member");
  assert.equal(saved.record.buyerEmail, "Alice@Example.com");
  assert.equal(saved.record.buyerPhone, "91234567");
  assert.equal(saved.record.status, "created");
  assert.deepEqual((await store.list("po", alice)).map((row) => row.id), [record.id]);
  assert.equal((await store.list("po", { kind: "buyer", email: "walkin@example.com" })).length, 0);
  assert.equal(planAssign(saved.record, { buyer: { email: "bob@example.com", name: "Bob" } }).error, "locked");
});

test("countWhere counts without exposing records", async () => {
  const store = createStore(memoryAdapter(), { now: at("2026-10-14T09:00:00Z") });
  await store.create("po", { buyerEmail: "a@x.com", visitor: "k1" }, guest);
  await store.create("po", { buyerEmail: "b@x.com", visitor: "k2" }, guest);
  assert.equal(await store.countWhere("po", (r) => r.visitor === "k1"), 1);
});
