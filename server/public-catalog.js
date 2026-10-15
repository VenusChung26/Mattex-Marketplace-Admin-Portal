/**
 * Public-safe catalog output.
 *
 * Staff (Portal) read the full product. Everyone else gets the product without internal fields,
 * and with import notes moved out of the buyer-facing `remark`.
 */

export const INTERNAL_PRODUCT_FIELDS = ["refPrice", "deliveryFee", "sourceUrl", "internalNote"];

const INTERNAL_NOTE_LINE =
  /(local website material|provisional sku|requires confirmation|split basis|copied from|confirm for|does not publish|prc row)/i;

export function splitRemark(remark) {
  const pub = [];
  const internal = [];
  for (const line of String(remark || "").split(/\r?\n/)) {
    (INTERNAL_NOTE_LINE.test(line) ? internal : pub).push(line);
  }
  return { remark: pub.join("\n").trim(), internalNote: internal.join("\n").trim() };
}

export function toPublicProduct(product) {
  if (!product || typeof product !== "object") return product;
  const next = { ...product };
  const { remark } = splitRemark(next.remark);
  if (remark) next.remark = remark;
  else delete next.remark;
  for (const key of INTERNAL_PRODUCT_FIELDS) delete next[key];
  return next;
}

export function toPublicCatalog(catalog) {
  if (!catalog || typeof catalog !== "object") return catalog;
  return {
    ...catalog,
    products: Array.isArray(catalog.products) ? catalog.products.map(toPublicProduct) : [],
  };
}
