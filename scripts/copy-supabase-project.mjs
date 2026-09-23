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

const sourceUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "";
const sourceKey =
  process.env.VITE_SUPABASE_ANON_KEY ||
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  "";
const destUrl =
  process.env.DEST_SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  "";
const destKey =
  process.env.DEST_SUPABASE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "";

if (!sourceUrl || !sourceKey || !destUrl || !destKey) {
  console.error("Missing source or dest Supabase URL/key in env.");
  process.exit(1);
}

if (new URL(sourceUrl).host === new URL(destUrl).host) {
  console.error("Source and dest are the same project. Refusing to copy.");
  process.exit(1);
}

const source = createClient(sourceUrl, sourceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const dest = createClient(destUrl, destKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function fetchAll(sb, table, columns = "*") {
  const page = 1000;
  const rows = [];
  for (let from = 0; ; from += page) {
    const { data, error } = await sb
      .from(table)
      .select(columns)
      .range(from, from + page - 1);
    if (error) throw error;
    const part = data || [];
    rows.push(...part);
    if (part.length < page) break;
  }
  return rows;
}

async function upsertAll(sb, table, rows, size = 50) {
  for (let i = 0; i < rows.length; i += size) {
    const part = rows.slice(i, i + size);
    const { error } = await sb.from(table).upsert(part);
    if (error) throw new Error(`${table} upsert ${i}: ${error.message}`);
    process.stdout.write(`  ${table} ${Math.min(i + part.length, rows.length)}/${rows.length}\n`);
  }
}

console.log(`Copy ${new URL(sourceUrl).host} → ${new URL(destUrl).host}`);

const kv = await fetchAll(source, "app_kv");
console.log(`app_kv rows: ${kv.length}`);
for (const row of kv) {
  const bytes = Buffer.byteLength(JSON.stringify(row.value ?? null), "utf8");
  process.stdout.write(`  upsert ${row.key} (${bytes} bytes)\n`);
  const { error } = await dest.from("app_kv").upsert({
    key: row.key,
    value: row.value,
    updated_at: row.updated_at || new Date().toISOString(),
  });
  if (error) throw new Error(`app_kv ${row.key}: ${error.message}`);
}

const products = await fetchAll(source, "products");
console.log(`products rows: ${products.length}`);
await upsertAll(dest, "products", products, 40);

const metrics = await fetchAll(source, "supplier_metrics");
console.log(`supplier_metrics rows: ${metrics.length}`);
await upsertAll(dest, "supplier_metrics", metrics, 40);

const destKv = await fetchAll(dest, "app_kv", "key");
const destProducts = await fetchAll(dest, "products", "id");
const destMetrics = await fetchAll(dest, "supplier_metrics", "slug");

const missingKv = kv.map((r) => r.key).filter((k) => !destKv.some((d) => d.key === k));
console.log(
  JSON.stringify(
    {
      dest: {
        app_kv: destKv.length,
        products: destProducts.length,
        supplier_metrics: destMetrics.length,
      },
      missingKv,
    },
    null,
    2
  )
);

if (destProducts.length !== products.length || destKv.length < kv.length) {
  process.exit(1);
}
