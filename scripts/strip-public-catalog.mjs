// Rewrites public/catalog.json without internal fields and without import notes in `remark`.
// `public/` is served to everyone, so it must stay public-safe. Full data stays in Supabase for staff.
// Usage: node scripts/strip-public-catalog.mjs [--check]
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { INTERNAL_PRODUCT_FIELDS, toPublicCatalog } from "../server/public-catalog.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const file = path.join(root, "public", "catalog.json");
const source = JSON.parse(readFileSync(file, "utf8"));
const stripped = toPublicCatalog(source);

const count = (catalog, test) => (catalog.products || []).filter(test).length;
const hasInternal = (product) => INTERNAL_PRODUCT_FIELDS.some((key) => key in product) || Boolean(product.remark);

console.log(`products: ${(source.products || []).length}`);
console.log(`with internal fields or remark before: ${count(source, hasInternal)}`);
console.log(`with internal fields or remark after: ${count(stripped, hasInternal)}`);

if (process.argv.includes("--check")) {
  process.exit(count(source, hasInternal) ? 1 : 0);
}
writeFileSync(file, `${JSON.stringify(stripped)}\n`);
console.log("wrote public/catalog.json");
