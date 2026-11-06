import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { API_ENDPOINTS, API_REWRITES, handleApiRequest, resolveApiRoute } from "./api-routes.js";

const browserRoutes = [
  ["/api/auth", "POST"],
  ["/api/data", "POST"],
  ["/api/catalog", "GET"],
  ["/api/catalog-version", "GET"],
  ["/api/catalog/commit", "POST"],
  ["/api/catalog-groups", "GET", "POST"],
  ["/api/catalog-snapshot", "GET", "POST"],
  ["/api/promo", "GET", "POST"],
  ["/api/rfq", "GET", "POST"],
  ["/api/send-email", "POST"],
  ["/api/spec-match", "GET", "POST"],
  ["/api/product-image", "POST"],
  ["/api/blob-upload", "POST"],
  ["/api/tms-status", "GET"],
  ["/api/tms-login", "POST"],
  ["/api/tms-submit", "POST"],
  ["/api/shared-store", "GET", "POST"],
];

for (const configFile of ["vercel.json", "vercel.admin.json"]) {
  test(`${configFile} deploys a handler for every browser API route`, async () => {
    const config = JSON.parse(await readFile(new URL(`../${configFile}`, import.meta.url), "utf8"));
    assert.deepEqual(config.rewrites.filter((rule) => rule.source.startsWith("/api/")), API_REWRITES);
    assert.deepEqual(config.rewrites.slice(0, API_REWRITES.length), API_REWRITES);
    const missing = [];
    for (const [path, ...methods] of browserRoutes) {
      const alias = config.rewrites.find((rule) => rule.source === path);
      const target = new URL(alias?.destination || path, "https://subbie.test");
      try {
        const module = await import(new URL(`..${target.pathname}.js`, import.meta.url));
        for (const method of methods) {
          if (typeof module[method] !== "function") missing.push(`${method} ${path}`);
        }
      } catch (error) {
        if (error.code !== "ERR_MODULE_NOT_FOUND") throw error;
        missing.push(path);
      }
    }
    assert.deepEqual(missing, [], "Browser API routes must resolve to deployed functions");
  });
}

test("browser API paths and deployed entrypoints are all registered in the shared router", async () => {
  const remote = await readFile(new URL("../src/lib/remote.js", import.meta.url), "utf8");
  for (const [, path] of remote.matchAll(/["'`](\/api\/[^"'`?]+)["'`?]/g)) {
    assert.ok(resolveApiRoute(`https://subbie.test${path}`), path);
  }
  const entries = (await readdir(new URL("../api/", import.meta.url)))
    .filter((name) => name.endsWith(".js"))
    .map((name) => `/api/${name.slice(0, -3)}`);
  assert.deepEqual(entries.sort(), Object.keys(API_ENDPOINTS).sort());
  for (const load of Object.values(API_ENDPOINTS)) {
    const module = await load();
    assert.ok(typeof module.GET === "function" || typeof module.POST === "function");
  }
});

test("aliases retain caller query parameters and enforce their destination selector", () => {
  const { url } = resolveApiRoute("https://subbie.test/api/catalog-groups?part=status&id=abc&tag=a&tag=b");
  assert.equal(url.pathname, "/api/catalog-snapshot");
  assert.equal(url.searchParams.get("part"), "groups");
  assert.equal(url.searchParams.get("id"), "abc");
  assert.deepEqual(url.searchParams.getAll("tag"), ["a", "b"]);
  assert.equal(resolveApiRoute("https://subbie.test/api/buyer-spec"), null);
});

test("TMS aliases reach the deployed handlers and keep their authentication and method checks", async () => {
  const status = await handleApiRequest(new Request("https://subbie.test/api/tms-status"));
  assert.equal(status.status, 200);
  assert.equal(typeof (await status.json()).configured, "boolean");
  assert.equal(status.headers.get("cache-control"), "no-store");
  for (const path of ["/api/tms-login", "/api/tms-submit"]) {
    const result = await handleApiRequest(new Request(`https://subbie.test${path}`, { method: "POST", body: "{}" }));
    assert.equal(result.status, 401, path);
    assert.deepEqual(await result.json(), { ok: false, error: "auth" });
  }
  const wrongMethod = await handleApiRequest(new Request("https://subbie.test/api/tms-status", { method: "POST", body: "{}" }));
  assert.equal(wrongMethod.status, 405);
  assert.equal(wrongMethod.headers.get("allow"), "GET");
});

test("shared-store is routed in production but refuses local file persistence", async (t) => {
  const previous = process.env.VERCEL;
  t.after(() => {
    if (previous === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = previous;
  });
  process.env.VERCEL = "1";
  for (const method of ["GET", "POST"]) {
    const result = await handleApiRequest(new Request("https://subbie.test/api/shared-store", {
      method,
      ...(method === "POST" ? { body: "{}" } : {}),
    }));
    assert.equal(result.status, 501);
    assert.deepEqual(await result.json(), { error: "use-supabase" });
  }
});
