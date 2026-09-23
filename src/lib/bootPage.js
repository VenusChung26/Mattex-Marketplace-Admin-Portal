export function getBootPage() {
  if (typeof window === "undefined") return null;
  const page = window.__MATTEX_PAGE__;
  if (!page || typeof page !== "object") return null;
  return page;
}

export function bootProduct(id) {
  const page = getBootPage();
  if (page?.kind !== "details") return null;
  if (String(page.product?.id || "") !== String(id || "")) return null;
  return page.product;
}
