function text(value) {
  return String(value || "").trim();
}

/** Size / description from the portal form, when it is not already the description paragraph. */
export function staffSizeText(product) {
  const size = text(product?.sizeDesc);
  if (!size || size === text(product?.description)) return "";
  return size;
}

/** Primary spec from the portal form, when it is not already shown as the size or description. */
export function staffPrimaryText(product) {
  const primary = text(product?.primarySpec);
  if (!primary) return "";
  if (primary === text(product?.sizeDesc) || primary === text(product?.description)) return "";
  return primary;
}

/** Certifications saved on the product. The order line keeps using this when it is filled in. */
export function staffCertText(product) {
  return text(product?.certifications);
}

/** Buyer-facing remark saved on the product. */
export function staffRemarkText(product) {
  return text(product?.remark);
}
