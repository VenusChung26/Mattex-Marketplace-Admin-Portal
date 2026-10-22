import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const UAT_HOST = "eyvvazelsuinsaweswup.supabase.co";
const PAGE = 1000;

let client = null;
let cached = null;
let cachedAt = 0;

function projectUrl() {
  const url = String(process.env.SUPABASE_URL || "").trim().replace(/\/$/, "");
  if (!url || !url.includes(UAT_HOST)) return "";
  return url;
}

function projectKey() {
  return String(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || "").trim();
}

function db() {
  const url = projectUrl();
  const key = projectKey();
  if (!url || !key) return null;
  if (!client) client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return client;
}

function categoryName(row) {
  const zh = String(row?.secondary_name || "").trim();
  const en = String(row?.primary_name || "").trim();
  if (zh && en) return `${zh}, ${en}`;
  return zh || en;
}

function supplierName(row) {
  return String(row?.name_eng || row?.name_chi || "").trim();
}

function httpUrl(value) {
  const url = String(value || "").trim();
  return /^https:\/\//.test(url) ? url : "";
}

async function eachPage(sb, table, columns) {
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await sb.from(table).select(columns).range(from, from + PAGE - 1);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < PAGE) break;
  }
  return rows;
}

function toProduct(row, category, supplier, images) {
  const picture = images.find((item) => httpUrl(item.file_url) || httpUrl(item.thumbnail_file_path) || httpUrl(item.file_path));
  const image = httpUrl(picture?.file_url) || httpUrl(picture?.thumbnail_file_path) || httpUrl(picture?.file_path);
  const price = Number(row.unit_price);
  return {
    id: String(row.uuid || row.id),
    productNo: String(row.sku || ""),
    name: String(row.name || ""),
    category: categoryName(category),
    supplier: supplierName(supplier),
    unit: String(row.unit || ""),
    unit_price: Number.isFinite(price) && price > 0 ? price : null,
    currency: String(row.currency || "HKD"),
    moq: row.min_order_qty == null ? null : Number(row.min_order_qty),
    leadTime: String(row.lead_time || ""),
    leadTimeLabel: String(row.lead_time || ""),
    standard: String(row.standard || ""),
    description: String(row.description || ""),
    specifications: String(row.specifications || ""),
    certifications: String(row.certifications || ""),
    purposes: String(row.purposes || ""),
    hit: Boolean(row.is_hit),
    green: Boolean(row.is_green),
    tailorMade: Boolean(row.is_tailor_made),
    rating: row.ratings == null ? null : Number(row.ratings),
    image,
    imageUrl: image,
    published: true,
    deleted: false,
    held: false,
  };
}

export async function readUatCatalog() {
  const sb = db();
  if (!sb) return null;
  if (cached && Date.now() - cachedAt < 15000) return cached;
  try {
    const [products, categories, suppliers, files] = await Promise.all([
      eachPage(
        sb,
        "products",
        "id, uuid, sku, name, category_id, supplier_id, unit, unit_price, currency, ratings, is_hit, is_green, min_order_qty, lead_time, standard, status, is_tailor_made, description, specifications, certifications, purposes"
      ),
      eachPage(sb, "categories", "id, uuid, primary_name, secondary_name, parent_id, status"),
      eachPage(sb, "suppliers", "id, uuid, name_eng, name_chi, logo"),
      eachPage(sb, "files", "id, model_type, model_id, thumbnail_file_path, file_path, file_url, sort"),
    ]);
    const categoryById = new Map(categories.map((row) => [String(row.id), row]));
    const supplierById = new Map(suppliers.map((row) => [String(row.id), row]));
    const imagesByProduct = new Map();
    files
      .filter((row) => row.model_type === "products")
      .sort((a, b) => Number(a.sort || 0) - Number(b.sort || 0))
      .forEach((row) => {
        const key = String(row.model_id);
        const list = imagesByProduct.get(key) || [];
        list.push(row);
        imagesByProduct.set(key, list);
      });
    const mapped = products
      .filter((row) => Number(row.status) === 1)
      .map((row) =>
        toProduct(
          row,
          categoryById.get(String(row.category_id)),
          supplierById.get(String(row.supplier_id)),
          imagesByProduct.get(String(row.id)) || []
        )
      )
      .filter((row) => row.id && row.name);
    if (!mapped.length) return null;
    const names = [...new Set(mapped.map((row) => row.category).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    const body = JSON.stringify(mapped.map((row) => [row.id, row.unit_price, row.name]));
    const etag = createHash("sha256").update(body).digest("hex").slice(0, 16);
    cached = {
      etag,
      updatedAt: new Date().toISOString(),
      products: mapped,
      categories: names.map((name) => ({ name, image: "", imageFallback: "" })),
    };
    cachedAt = Date.now();
    return cached;
  } catch (error) {
    console.warn("uat catalog", error?.message || error);
    return null;
  }
}
