import test from "node:test";
import assert from "node:assert/strict";

let moduleId = 0;
async function setup(t, responses) {
  const previous = { window: globalThis.window, document: globalThis.document };
  globalThis.window = {};
  globalThis.document = {};
  t.after(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete globalThis[key];
      else globalThis[key] = value;
    }
  });
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const requests = [];
  t.mock.method(globalThis, "fetch", async (_url, init) => {
    requests.push(JSON.parse(init.body));
    const next = responses.shift();
    assert.ok(next, "unexpected extra request");
    if (next instanceof Error) throw next;
    return Response.json({ ok: next < 400, kv: {} }, { status: next });
  });
  const remote = await import(`../src/lib/supabasePersist.js?recovery-test=${++moduleId}`);
  return { remote, requests };
}

const flush = () => new Promise(setImmediate);

test("a temporary 503 is probed again and leaves local fallback after recovery", async (t) => {
  const { remote, requests } = await setup(t, [503, 200]);
  const states = [];
  const unsubscribe = remote.subscribeRemoteData(() => states.push(remote.getRemoteDataReady()));
  t.after(unsubscribe);
  assert.equal(await remote.probeRemoteData(), false);
  assert.equal(remote.shouldUseLocalSharedStore(), true);
  t.mock.timers.tick(5000);
  await flush();
  assert.equal(remote.shouldUseLocalSharedStore(), false);
  assert.deepEqual(states, [false, true], "the store and warning banner must be notified of recovery");
  assert.deepEqual(requests.map((request) => request.op), ["read", "read"]);
  t.mock.timers.tick(15000);
  await flush();
  assert.equal(requests.length, 2, "healthy connections must stop recovery polling");
});

test("network errors and repeated outages keep probing until the server recovers", async (t) => {
  const { remote, requests } = await setup(t, [new Error("offline"), 503, 200]);
  assert.equal(await remote.probeRemoteData(), false);
  t.mock.timers.tick(5000);
  await flush();
  assert.equal(remote.shouldUseLocalSharedStore(), true);
  t.mock.timers.tick(5000);
  await flush();
  assert.equal(remote.shouldUseLocalSharedStore(), false);
  assert.equal(requests.length, 3);
});

test("failed writes recover through a read probe without replaying the write", async (t) => {
  const { remote, requests } = await setup(t, [503, 200]);
  assert.equal(await remote.persistKvNow("subbie_custom_categories", ["draft"]), null);
  t.mock.timers.tick(5000);
  await flush();
  assert.deepEqual(requests.map((request) => request.op), ["write", "read"]);
  assert.equal(remote.shouldUseLocalSharedStore(), false);
});

test("a successful normal read clears the outage and cancels the pending probe", async (t) => {
  const { remote, requests } = await setup(t, [503, 200]);
  await remote.probeRemoteData();
  await remote.fetchRemoteKv(["subbie_rfq_seq"]);
  assert.equal(remote.getRemoteDataReady(), true);
  t.mock.timers.tick(15000);
  await flush();
  assert.equal(requests.length, 2);
});

test("concurrent recovery checks share one request", async (t) => {
  const { remote, requests } = await setup(t, [200]);
  assert.deepEqual(await Promise.all([remote.probeRemoteData(), remote.probeRemoteData()]), [true, true]);
  assert.equal(requests.length, 1);
});
