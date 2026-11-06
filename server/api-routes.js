// Canonical Vercel Functions and their public aliases. Keep API paths here.
export const API_ENDPOINTS = {
  "/api/auth": () => import("../api/auth.js"),
  "/api/blob-upload": () => import("../api/blob-upload.js"),
  "/api/catalog-snapshot": () => import("../api/catalog-snapshot.js"),
  "/api/data": () => import("../api/data.js"),
  "/api/product-image": () => import("../api/product-image.js"),
  "/api/promo": () => import("../api/promo.js"),
  "/api/rfq": () => import("../api/rfq.js"),
  "/api/send-email": () => import("../api/send-email.js"),
  "/api/shared-store": () => import("../api/shared-store.js"),
  "/api/spec-match": () => import("../api/spec-match.js"),
  "/api/ssr": () => import("../api/ssr.js"),
  "/api/tms-submit": () => import("../api/tms-submit.js"),
};

// Materialized in both vercel*.json files by scripts/sync-api-routes.mjs.
export const API_REWRITES = [
  { source: "/api/catalog-version", destination: "/api/catalog-snapshot?part=version" },
  { source: "/api/catalog/commit", destination: "/api/catalog-snapshot?part=commit" },
  { source: "/api/catalog", destination: "/api/catalog-snapshot?part=get" },
  { source: "/api/catalog-groups", destination: "/api/catalog-snapshot?part=groups" },
  { source: "/api/tms-status", destination: "/api/tms-submit?part=status" },
  { source: "/api/tms-login", destination: "/api/tms-submit?part=login" },
];

export function resolveApiRoute(input) {
  const url = new URL(input);
  const alias = API_REWRITES.find((rule) => rule.source === url.pathname);
  if (alias) {
    const destination = new URL(alias.destination, url);
    url.pathname = destination.pathname;
    for (const [key, value] of destination.searchParams) url.searchParams.set(key, value);
  }
  const load = API_ENDPOINTS[url.pathname];
  return load ? { url, load } : null;
}

export async function handleApiRequest(request) {
  const route = resolveApiRoute(request.url);
  if (!route) return Response.json({ ok: false, error: "not_found" }, { status: 404 });
  const endpoint = await route.load();
  const handler = endpoint[request.method] || (request.method === "HEAD" ? endpoint.GET : null);
  if (typeof handler !== "function") {
    const allow = ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"].filter((method) =>
      typeof endpoint[method] === "function" || (method === "HEAD" && typeof endpoint.GET === "function")
    );
    return Response.json({ ok: false, error: "method_not_allowed" }, { status: 405, headers: { allow: allow.join(", ") } });
  }
  // Rewrites retain the original method, headers and unparsed body.
  return handler(route.url.href === request.url ? request : new Request(route.url, request));
}
