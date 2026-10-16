const DEV_MARKETPLACE = "http://localhost:5182";
const DEV_ADMIN = "http://localhost:5183";
const PROD_MARKETPLACE = "https://marketplace.mattex.com.hk";
const PROD_ADMIN = "https://subbie-admin.mattex.com.hk";

export function isAdminSurface() {
  return import.meta.env.VITE_SURFACE === "admin";
}

export function marketplaceOrigin() {
  if (import.meta.env.DEV) return DEV_MARKETPLACE;
  if (isAdminSurface()) return PROD_MARKETPLACE;
  if (typeof window !== "undefined" && window.location?.origin) return window.location.origin;
  return PROD_MARKETPLACE;
}

export function adminOrigin() {
  if (import.meta.env.DEV) return DEV_ADMIN;
  if (!isAdminSurface()) return PROD_ADMIN;
  if (typeof window !== "undefined" && window.location?.origin) return window.location.origin;
  return PROD_ADMIN;
}

export function marketplaceHomeHref(lang = "en") {
  const locale = lang === "zh" ? "zh" : "en";
  return `${marketplaceOrigin()}/${locale}`;
}

export function adminHomeHref() {
  return `${adminOrigin()}/`;
}
