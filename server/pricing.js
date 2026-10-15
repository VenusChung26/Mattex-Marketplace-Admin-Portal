import { findProductOffer } from "../src/lib/offer.js";
import { orderMinimum, sellingAmount } from "../src/lib/productFields.js";

/**
 * Server-side price for a purchase order. The browser says which product and how many; the price,
 * name, SKU and unit come from the catalog and the running offer, never from the request.
 *
 * Price rule (same as the storefront): a running banner offer wins, otherwise a positive `unit_price`.
 * Anything else is "price upon request" and cannot be ordered directly (it goes through RFQ).
 */

const MAX_QTY = 1_000_000;

function buyerVisible(product) {
  return Boolean(product) && product.published !== false && !product.deleted && !product.held;
}

export function unitPriceFor(product, promo, now = new Date()) {
  if (!product) return null;
  const offer = findProductOffer(product.id, promo, now);
  if (offer && offer.price > 0) return offer.price;
  const amount = sellingAmount(product);
  return amount != null && amount > 0 ? amount : null;
}

/**
 * wanted: [{ productId, qty }]
 * Returns { ok:true, lines, total } or { ok:false, error, productId }.
 * error: "empty" | "qty" | "unknown" | "unavailable" | "no_price" | "moq"
 */
export function priceOrderLines(wanted, { products, promo, now = new Date() } = {}) {
  if (!Array.isArray(wanted) || !wanted.length || wanted.length > 100) return { ok: false, error: "empty" };
  const byId = new Map((products || []).map((product) => [String(product.id), product]));
  const lines = [];
  const seen = new Set();
  for (const row of wanted) {
    const productId = String(row?.productId || "");
    const qty = Number(row?.qty);
    if (!Number.isFinite(qty) || qty <= 0 || qty > MAX_QTY || !Number.isInteger(qty)) return { ok: false, error: "qty", productId };
    const product = byId.get(productId);
    if (!product || seen.has(productId)) return { ok: false, error: "unknown", productId };
    seen.add(productId);
    if (!buyerVisible(product) || product.discontinued) return { ok: false, error: "unavailable", productId };
    const unitPrice = unitPriceFor(product, promo, now);
    if (unitPrice == null) return { ok: false, error: "no_price", productId };
    const moq = orderMinimum(product);
    if (moq != null && qty < moq) return { ok: false, error: "moq", productId };
    lines.push({
      productId,
      sku: String(product.productNo || product.sku || product.id),
      name: String(product.name || product.productNo || product.id),
      unit: String(product.unit || ""),
      qty,
      unitPrice,
      lineTotal: Math.round(unitPrice * qty * 100) / 100,
    });
  }
  const total = Math.round(lines.reduce((sum, line) => sum + line.lineTotal, 0) * 100) / 100;
  return { ok: true, lines, total };
}
