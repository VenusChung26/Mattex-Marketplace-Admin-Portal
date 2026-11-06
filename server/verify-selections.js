import { handleCatalogGet } from "../api/catalog-snapshot.js";
import { toPublicCatalog } from "./public-catalog.js";
import { resolveSelection, selectionKey, selectionDescription } from "../src/lib/productSelection.js";

export async function verifySelections(lines, products) {
  if (!Array.isArray(lines) || !lines.length || lines.length > 100) return { ok: false, error: "lines" };
  if (lines.some((line) => !line.custom || !String(line.productId || "").startsWith("custom_"))) {
    if (!products) {
      try {
        const catalog = await handleCatalogGet({ fresh: true, strict: true });
        if (!catalog?.products?.length) return { ok: false, error: "catalog_unavailable" };
        products = toPublicCatalog(catalog).products;
      } catch {
        return { ok: false, error: "catalog_unavailable" };
      }
    }
  }
  const byId = new Map((products || []).map((p) => [String(p.id), p]));
  const seen = new Set();
  const seenRefs = new Set();
  const checked = [];
  for (const line of lines) {
    const result = resolveSelection(byId.get(String(line.productId)), line);
    if (!result.ok) return { ...result, productId: line.productId, lineId: line.lineId || selectionKey(line) };
    const key = selectionKey(line);
    if (seen.has(key) || seenRefs.has(result.line.lineId || key)) return { ok: false, error: "duplicate_selection", lineId: key };
    seen.add(key);
    seenRefs.add(result.line.lineId || key);
    const product = result.product;
    checked.push(product ? {
      ...result.line, name: product.name, productNo: product.productNo || product.id,
      sku: product.productNo || product.id, spec: selectionDescription(product, line),
      description: selectionDescription(product, line), unit: product.unit || "", moq: product.moq || 1,
      category: product.category || "", image: product.image || "",
    } : result.line);
  }
  return { ok: true, lines: checked, products: products || [] };
}

export function selectionFailure(result) {
  return { status: result.error === "catalog_unavailable" ? 503 : 409, body: {
    ok: false, error: result.error, productId: result.productId || "", lineId: result.lineId || "",
    invalidGroups: result.invalidGroups || [], minimum: result.minimum,
  } };
}
