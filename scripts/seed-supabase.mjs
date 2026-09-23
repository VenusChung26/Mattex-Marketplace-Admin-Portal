import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

function loadEnvFile(filePath) {
  try {
    const text = readFileSync(filePath, "utf8");
    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq < 1) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = value;
    }
  } catch {
    /* missing file is fine */
  }
}

loadEnvFile(".env.local");
loadEnvFile(".env");

const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const key =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "";

if (!url || !key) {
  console.error(
    "Missing Supabase env. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (and SUPABASE_SERVICE_ROLE_KEY for seed) to .env.local"
  );
  process.exit(1);
}

if (typeof globalThis.localStorage === "undefined") {
  const mem = new Map();
  globalThis.localStorage = {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => mem.set(k, String(v)),
    removeItem: (k) => mem.delete(k),
  };
}

if (!globalThis.window || typeof globalThis.window.addEventListener !== "function") {
  globalThis.window = {
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() {
      return true;
    },
    location: { origin: "http://localhost", href: "http://localhost/" },
  };
}
if (typeof globalThis.fetch !== "function") {
  globalThis.fetch = async () => ({
    ok: false,
    json: async () => ({}),
  });
}

const { PRODUCTS, getSuppliers, buildSupplierMetrics, supplierSlug } = await import(
  "../src/lib/store.js"
);

if (!PRODUCTS.length) {
  console.log("Catalog lives in Supabase. Skip seeding products from GitHub.");
  process.exit(0);
}

const sb = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function chunk(list, size) {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

const productRows = PRODUCTS.map((p) => ({
  id: p.id,
  payload: p,
  updated_at: new Date().toISOString(),
}));

const slugs = [...new Set(getSuppliers().map((s) => s.slug))];
if (!slugs.length) slugs.push(supplierSlug("Mattex"));

const metricRows = slugs.map((slug) => {
  const m = buildSupplierMetrics(slug);
  return {
    slug,
    rating: m.rating,
    completion_rate: m.completionRate,
    on_time_rate: m.onTimeRate,
    search_count: m.searchCount,
    found_count: m.foundCount,
    rfq_count: m.rfqCount,
    empty: false,
    updated_at: new Date().toISOString(),
  };
});

async function upsertAll(table, rows) {
  for (const part of chunk(rows, 80)) {
    const { error } = await sb.from(table).upsert(part);
    if (error) throw error;
  }
}

try {
  await upsertAll("products", productRows);
  await upsertAll("supplier_metrics", metricRows);

  const { data: patchRow } = await sb.from("app_kv").select("key,value").eq("key", "subbie_product_patches").maybeSingle();
  const patches = patchRow?.value && typeof patchRow.value === "object" ? { ...patchRow.value } : {};
  const seededIds = new Set(PRODUCTS.map((p) => String(p.id)));
  for (const id of seededIds) delete patches[id];
  if (Array.isArray(patches.__created)) {
    patches.__created = patches.__created.filter((row) => !seededIds.has(String(row?.id)));
  }
  const { error: patchErr } = await sb.from("app_kv").upsert({
    key: "subbie_product_patches",
    value: patches,
    updated_at: new Date().toISOString(),
  });
  if (patchErr) throw patchErr;

  const { data: catRow } = await sb.from("app_kv").select("key,value").eq("key", "subbie_custom_categories").maybeSingle();
  const cats = Array.isArray(catRow?.value) ? catRow.value.filter((c) => String(c?.id) !== "234") : [];
  const { error: catErr } = await sb.from("app_kv").upsert({
    key: "subbie_custom_categories",
    value: cats,
    updated_at: new Date().toISOString(),
  });
  if (catErr) throw catErr;

  console.log(`Seeded ${productRows.length} products and ${metricRows.length} supplier metrics.`);
  console.log("Cleared catalog product patches and removed custom category 234.");
} catch (error) {
  const detail = error?.cause?.code || error?.cause?.message || error?.message || error;
  console.error(detail);
  console.error("If the table is missing, run supabase/schema.sql in the Supabase SQL Editor, then retry.");
  process.exit(1);
}
