const DEV_MARKETPLACE = "http://localhost:5178";
const DEV_ADMIN = "http://localhost:5179";

export function isAdminSurface() {
  return import.meta.env.VITE_SURFACE === "admin";
}

export function marketplaceOrigin() {
  const fromEnv = import.meta.env.VITE_MARKETPLACE_ORIGIN;
  if (fromEnv) return String(fromEnv).replace(/\/$/, "");
  if (import.meta.env.DEV) return DEV_MARKETPLACE;
  if (typeof window !== "undefined" && window.location?.origin) return window.location.origin;
  return DEV_MARKETPLACE;
}

export function adminOrigin() {
  const fromEnv = import.meta.env.VITE_ADMIN_ORIGIN;
  if (fromEnv) return String(fromEnv).replace(/\/$/, "");
  if (import.meta.env.DEV) return DEV_ADMIN;
  if (typeof window !== "undefined" && window.location?.origin) return window.location.origin;
  return DEV_ADMIN;
}

export function marketplaceHomeHref(lang = "en") {
  const locale = lang === "zh" ? "zh" : "en";
  return `${marketplaceOrigin()}/${locale}`;
}

export function adminHomeHref() {
  return `${adminOrigin()}/`;
}
