import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { createApiMiddleware } from "./local-api.js";
import { resolveApiRoute } from "./api-routes.js";

async function serve(t, options) {
  const middleware = createApiMiddleware(options);
  const server = createServer((req, res) => {
    middleware(req, res, (error) => {
      res.statusCode = error ? 500 : 204;
      res.end();
    });
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise((resolve) => {
    server.close(resolve);
    server.closeAllConnections();
  }));
  return `http://127.0.0.1:${server.address().port}`;
}

test("the HTTP adapter preserves method, query, raw bytes, request headers and multiple cookies", async (t) => {
  const origin = await serve(t, {
    handleRequest: async (request) => {
      const response = Response.json({
        method: request.method,
        query: new URL(request.url).searchParams.get("id"),
        body: [...new Uint8Array(await request.arrayBuffer())],
        headers: Object.fromEntries(["cookie", "origin", "x-forwarded-for", "x-forwarded-proto", "x-mm-catalog", "content-type"]
          .map((key) => [key, request.headers.get(key)])),
      }, { status: 201, headers: { "cache-control": "no-store" } });
      response.headers.append("set-cookie", "one=1; HttpOnly; Path=/");
      response.headers.append("set-cookie", "two=2; HttpOnly; Path=/");
      return response;
    },
  });
  const headers = {
    cookie: "mm_staff=test; mm_buyer=buyer",
    origin: "https://portal.subbie.test",
    "x-forwarded-for": "192.0.2.1, 192.0.2.2",
    "x-forwarded-proto": "https",
    "x-mm-catalog": "portal",
    "content-type": "application/octet-stream",
  };
  const response = await fetch(`${origin}/api/test?id=%E4%B8%AD%E6%96%87`, { method: "POST", headers, body: new Uint8Array([0, 255, 65]) });
  assert.equal(response.status, 201);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(response.headers.getSetCookie(), ["one=1; HttpOnly; Path=/", "two=2; HttpOnly; Path=/"]);
  assert.deepEqual(await response.json(), { method: "POST", query: "中文", body: [0, 255, 65], headers });
});

test("conditional requests keep ETag, 304 status and an empty body", async (t) => {
  const origin = await serve(t, {
    handleRequest: async (request) => {
      assert.equal(request.headers.get("if-none-match"), '"catalog-v2"');
      return new Response(null, { status: 304, headers: { etag: '"catalog-v2"', "cache-control": "private, no-cache" } });
    },
  });
  const response = await fetch(`${origin}/api/catalog`, { headers: { "if-none-match": '"catalog-v2"' } });
  assert.equal(response.status, 304);
  assert.equal(response.headers.get("etag"), '"catalog-v2"');
  assert.equal(response.headers.get("cache-control"), "private, no-cache");
  assert.equal(await response.text(), "");
});

test("local JSON parsing errors match the actual deployment entrypoints", async (t) => {
  const origin = await serve(t);
  for (const path of ["auth", "data", "catalog/commit", "catalog-groups", "product-image", "spec-match", "promo", "tms-login", "tms-submit", "blob-upload", "rfq", "send-email"]) {
    const url = `${origin}/api/${path}`;
    const init = { method: "POST", headers: { "content-type": "application/json" }, body: "{invalid" };
    const local = await fetch(url, init);
    const route = resolveApiRoute(url);
    const module = await route.load();
    const deployed = await module.POST(new Request(route.url, init));
    assert.equal(local.status, 400, path);
    assert.equal(local.status, deployed.status, path);
    assert.equal(local.headers.get("cache-control"), deployed.headers.get("cache-control"), path);
    assert.equal(await local.text(), await deployed.text(), path);
  }
});

test("auth responses retain cookies, forwarded HTTPS and cache controls", async (t) => {
  const origin = await serve(t);
  for (const protocol of ["http", "https"]) {
    const response = await fetch(`${origin}/api/auth`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-proto": protocol },
      body: JSON.stringify({ action: "logout", kind: "buyer" }),
    });
    assert.equal(response.status, 200);
    const cookie = response.headers.get("set-cookie");
    assert.match(cookie, /mm_buyer=/);
    assert.match(cookie, /HttpOnly/);
    assert.equal(cookie.includes("Secure"), protocol === "https");
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.deepEqual(await response.json(), { ok: true });
  }
});

test("unknown APIs and unsupported methods do not fall through to the SPA", async (t) => {
  const origin = await serve(t);
  const missing = await fetch(`${origin}/api/not-a-route`);
  assert.equal(missing.status, 404);
  assert.deepEqual(await missing.json(), { ok: false, error: "not_found" });
  const unsupported = await fetch(`${origin}/api/auth`);
  assert.equal(unsupported.status, 405);
  assert.equal(unsupported.headers.get("allow"), "POST");
  assert.equal((await fetch(`${origin}/zh`)).status, 204);
});
