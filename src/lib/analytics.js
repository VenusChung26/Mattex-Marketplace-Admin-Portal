/** GA4 web stream name in Google Analytics: Marketplace Web */

export const GA_STREAM_NAME = "Marketplace Web";
export const GA_MEASUREMENT_ID = "G-F89GE7J3CR";

export function gaMeasurementId() {
  const fromEnv = String(import.meta.env.VITE_GA_MEASUREMENT_ID || "").trim();
  const id = fromEnv || GA_MEASUREMENT_ID;
  return /^G-[A-Z0-9]+$/i.test(id) ? id.toUpperCase() : "";
}

function isAdminSurface() {
  return import.meta.env.VITE_SURFACE === "admin";
}

function isLocalHost() {
  if (typeof window === "undefined") return true;
  const host = String(window.location.hostname || "");
  return host === "localhost" || host === "127.0.0.1";
}

export function shouldInstallGa() {
  if (isAdminSurface()) return false;
  if (!gaMeasurementId()) return false;
  return typeof window !== "undefined";
}

/** Hits are skipped on localhost so local browsing does not pollute Marketplace Web. */
export function shouldTrackGa() {
  return shouldInstallGa() && !isLocalHost();
}

export function installGtag() {
  const id = gaMeasurementId();
  if (!shouldInstallGa() || !id || typeof document === "undefined") return;
  if (document.getElementById("ga-gtag-js") || document.querySelector('script[src*="googletagmanager.com/gtag/js"]')) {
    window.dataLayer = window.dataLayer || [];
    if (typeof window.gtag !== "function") {
      window.gtag = function gtag() {
        window.dataLayer.push(arguments);
      };
    }
    return;
  }

  window.dataLayer = window.dataLayer || [];
  if (typeof window.gtag !== "function") {
    window.gtag = function gtag() {
      window.dataLayer.push(arguments);
    };
  }

  const loader = document.createElement("script");
  loader.id = "ga-gtag-js";
  loader.async = true;
  loader.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`;
  document.head.appendChild(loader);

  const inline = document.createElement("script");
  inline.id = "ga-gtag-inline";
  inline.textContent = [
    "window.dataLayer = window.dataLayer || [];",
    "function gtag(){dataLayer.push(arguments);}",
    "gtag('js', new Date());",
    shouldTrackGa() ? `gtag('config', '${id}', { send_page_view: false });` : "",
  ]
    .filter(Boolean)
    .join("\n");
  document.head.appendChild(inline);
}

export function trackPageview(location) {
  const id = gaMeasurementId();
  if (!shouldTrackGa() || !id || typeof window === "undefined" || typeof window.gtag !== "function") return;
  const path = `${location?.pathname || window.location.pathname}${location?.search || window.location.search || ""}`;
  window.gtag("event", "page_view", {
    send_to: id,
    page_title: document.title,
    page_location: window.location.href,
    page_path: path,
  });
}
