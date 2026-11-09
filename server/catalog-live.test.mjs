import test from "node:test";
import assert from "node:assert/strict";
// Load the store before installing browser globals so its browser startup stays inactive.
import "../src/lib/store.js";

let moduleId = 0;
const flush = () => new Promise(setImmediate);

async function setup(t, pathname = "/zh/catalog/timber") {
  const previous = { window: globalThis.window, document: globalThis.document };
  const document = new EventTarget();
  document.visibilityState = "visible";
  globalThis.document = document;
  globalThis.window = { location: { pathname } };
  let stop;
  t.after(() => {
    stop?.();
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete globalThis[key];
      else globalThis[key] = value;
    }
  });
  t.mock.timers.enable({ apis: ["setTimeout", "setInterval"] });
  const requests = [];
  t.mock.method(globalThis, "fetch", async (url) => {
    requests.push(url);
    return Response.json({ etag: "same-catalog" });
  });
  const { startLiveCatalogRefresh } = await import(`../src/lib/catalogLive.js?test=${++moduleId}`);
  stop = startLiveCatalogRefresh(pathname);
  const visibility = async (value) => {
    document.visibilityState = value;
    document.dispatchEvent(new Event("visibilitychange"));
    await flush();
  };
  return { requests, stop, visibility, startLiveCatalogRefresh };
}

test("catalog browsing checks once per minute after its initial check", async (t) => {
  const { requests } = await setup(t);
  t.mock.timers.tick(4000);
  await flush();
  assert.deepEqual(requests, ["/api/catalog-version"]);
  t.mock.timers.tick(59999);
  await flush();
  assert.equal(requests.length, 1);
  t.mock.timers.tick(1);
  await flush();
  assert.equal(requests.length, 2);
});

for (const pathname of ["/zh/rfq", "/en/rfq/", "/zh/login", "/zh/rfqs", "/zh/spec-match"]) {
  test(`${pathname} never polls the catalog, including on tab return`, async (t) => {
    const { requests, visibility } = await setup(t, pathname);
    t.mock.timers.tick(120000);
    await flush();
    await visibility("hidden");
    await visibility("visible");
    assert.deepEqual(requests, []);
  });
}

test("hidden tabs pause and check once immediately on return", async (t) => {
  const { requests, visibility } = await setup(t, "/en/details/timber");
  await visibility("hidden");
  t.mock.timers.tick(120000);
  await flush();
  assert.equal(requests.length, 0);
  await visibility("visible");
  assert.equal(requests.length, 1);
  t.mock.timers.tick(60000);
  await flush();
  assert.equal(requests.length, 2);
});

test("leaving a product page cancels its timer and visibility listener", async (t) => {
  const { requests, stop, visibility, startLiveCatalogRefresh } = await setup(t, "/zh");
  assert.equal(typeof stop, "function");
  stop();
  const stopRfq = startLiveCatalogRefresh("/zh/rfq");
  t.after(() => stopRfq?.());
  await visibility("hidden");
  await visibility("visible");
  t.mock.timers.tick(120000);
  await flush();
  assert.equal(requests.length, 0);
});

test("a version response after leaving cannot trigger a full catalog fetch", async (t) => {
  const { requests, stop } = await setup(t);
  t.mock.timers.tick(4000);
  await flush();
  let resolve;
  t.mock.method(globalThis, "fetch", (url) => {
    requests.push(url);
    return new Promise((done) => { resolve = done; });
  });
  t.mock.timers.tick(60000);
  await flush();
  assert.equal(typeof resolve, "function");
  stop();
  resolve(Response.json({ etag: "updated-catalog" }));
  await flush();
  assert.deepEqual(requests, ["/api/catalog-version", "/api/catalog-version"]);
});
