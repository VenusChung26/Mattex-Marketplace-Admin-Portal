import "./instrument";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import * as Sentry from "@sentry/react";
import "@fontsource/ibm-plex-sans/400.css";
import "@fontsource/ibm-plex-sans/500.css";
import "@fontsource/ibm-plex-sans/600.css";
import "@fontsource/ibm-plex-sans/700.css";
import "@fontsource/ibm-plex-serif/500.css";
import "@fontsource/ibm-plex-serif/600.css";
import "./index.css";
import App from "./App.jsx";
import { hydrateStore, startSharedStoreSync } from "./lib/store";

if (import.meta.env.VITE_SURFACE === "admin") {
  document.documentElement.dataset.surface = "admin";
}

createRoot(document.getElementById("root"), {
  onUncaughtError: Sentry.reactErrorHandler((error, errorInfo) => {
    console.warn("Uncaught error", error, errorInfo.componentStack);
  }),
  onCaughtError: Sentry.reactErrorHandler(),
  onRecoverableError: Sentry.reactErrorHandler(),
}).render(
  <StrictMode>
    <App />
  </StrictMode>
);

const catalogBoot = hydrateStore();
if (import.meta.env.VITE_SURFACE === "admin") startSharedStoreSync();
catalogBoot.finally(() => {
  if (import.meta.env.VITE_SURFACE !== "admin") startSharedStoreSync();
});
