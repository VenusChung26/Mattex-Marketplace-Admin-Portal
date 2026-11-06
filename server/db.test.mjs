import test from "node:test";
import assert from "node:assert/strict";
import { getDb, requireDb } from "./db.js";

test("missing server credentials keep optional stores offline and required stores explicit", (t) => {
  for (const name of ["VITE_SUPABASE_URL", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]) {
    const previous = process.env[name];
    t.after(() => {
      if (previous === undefined) delete process.env[name];
      else process.env[name] = previous;
    });
    delete process.env[name];
  }
  assert.equal(getDb(), null);
  assert.throws(() => requireDb("auth_not_configured"), { message: "auth_not_configured" });
  assert.throws(() => requireDb("data_not_configured"), { message: "data_not_configured" });
  process.env.SUPABASE_URL = "https://main.example.test";
  assert.equal(getDb(), null);
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-key";
  process.env.VITE_SUPABASE_URL = "https://vite.example.test";
  assert.equal(requireDb(), getDb({ url: process.env.VITE_SUPABASE_URL, key: "test-service-key" }));
  assert.equal(getDb({ url: "", key: "test-service-key" }), null);
  assert.equal(getDb({ url: process.env.SUPABASE_URL, key: "" }), null);
  delete process.env.VITE_SUPABASE_URL;
  assert.equal(requireDb(), getDb({ url: process.env.SUPABASE_URL, key: "test-service-key" }));
});

test("shared clients keep main, RFQ, and read-only catalog credentials isolated", async (t) => {
  const calls = [];
  t.mock.method(globalThis, "fetch", async (input, init) => {
    const headers = new Headers(init?.headers);
    calls.push({ url: String(input), apiKey: headers.get("apikey"), authorization: headers.get("authorization") });
    return new Response("[]", { headers: { "content-type": "application/json" } });
  });
  const main = getDb({ url: "https://main.example.test", key: "main-service-key" });
  const rfq = getDb({ url: "https://rfq.example.test", key: "rfq-service-key" });
  const catalog = getDb({ url: "https://main.example.test", key: "catalog-publishable-key" });
  assert.equal(main, getDb({ url: "https://main.example.test", key: "main-service-key" }));
  for (const client of [main, rfq, catalog]) {
    const { error } = await client.from("products").select("id");
    assert.equal(error, null);
    assert.equal(client.auth.persistSession, false);
    assert.equal(client.auth.autoRefreshToken, false);
  }
  assert.deepEqual(calls, [
    { url: "https://main.example.test/rest/v1/products?select=id", apiKey: "main-service-key", authorization: "Bearer main-service-key" },
    { url: "https://rfq.example.test/rest/v1/products?select=id", apiKey: "rfq-service-key", authorization: "Bearer rfq-service-key" },
    { url: "https://main.example.test/rest/v1/products?select=id", apiKey: "catalog-publishable-key", authorization: "Bearer catalog-publishable-key" },
  ]);
});
