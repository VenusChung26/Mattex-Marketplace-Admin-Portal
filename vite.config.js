import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { localApiPlugin } from "./server/local-api.js";

const GA_MEASUREMENT_ID = "G-F89GE7J3CR";

function marketplaceGaHtmlPlugin() {
  let surface = "marketplace";
  return {
    name: "marketplace-ga4-html",
    configResolved(config) {
      const raw = config.define?.["import.meta.env.VITE_SURFACE"];
      if (typeof raw === "string") {
        try {
          surface = JSON.parse(raw);
        } catch {
          surface = raw.replace(/^"|"$/g, "");
        }
      }
    },
    transformIndexHtml(html) {
      if (surface === "admin") return html;
      if (html.includes("googletagmanager.com/gtag/js")) return html;
      const snippet = `<!-- Google tag (gtag.js) -->
    <script async id="ga-gtag-js" src="https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}"></script>
    <script>
      window.dataLayer = window.dataLayer || [];
      function gtag(){dataLayer.push(arguments);}
      gtag('js', new Date());
      if (!/^(localhost|127\\.0\\.0\\.1)$/.test(location.hostname)) {
        gtag('config', '${GA_MEASUREMENT_ID}', { send_page_view: false });
      }
    </script>`;
      return html.replace("</head>", `    ${snippet}\n  </head>`);
    },
  };
}

function stripSupabaseFromClient() {
  return {
    name: "strip-supabase-from-client",
    configResolved(config) {
      for (const key of Object.keys(config.env)) {
        if (/SUPABASE|SERVICE_ROLE|ANON|SECRET|BLOB_|RESEND_|OPENAI|SESSION/i.test(key)) delete config.env[key];
      }
    },
  };
}

function publicSsrHtmlPlugin() {
  let surface = "marketplace";
  return {
    name: "mattex-public-ssr-html",
    configResolved(config) {
      const raw = config.define?.["import.meta.env.VITE_SURFACE"];
      if (typeof raw === "string") {
        try {
          surface = JSON.parse(raw);
        } catch {
          surface = raw.replace(/^"|"$/g, "");
        }
      }
    },
    transformIndexHtml: {
      order: "post",
      async handler(html, ctx) {
        if (surface === "admin") return html;
        if (!ctx.server) return html;
        const url = String(ctx.originalUrl || ctx.path || "/").split("?")[0];
        await import("./src/lib/ssrNodePolyfill.js");
        const { ensureSsrCatalog } = await import("./src/lib/ssrCatalog.js");
        const { injectPublicDocument } = await import("./src/lib/ssrHtml.js");
        await ensureSsrCatalog();
        return injectPublicDocument(html, url);
      },
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  if (env.BLOB_READ_WRITE_TOKEN) process.env.BLOB_READ_WRITE_TOKEN = env.BLOB_READ_WRITE_TOKEN;
  for (const [key, value] of Object.entries(env)) {
    if (key.startsWith("TMS_") || key.startsWith("RESEND_") || key.startsWith("RFQ_") || key === "SUPABASE_URL" || key === "SUPABASE_PUBLISHABLE_KEY" || key === "SUPABASE_SERVICE_ROLE_KEY" || key === "SESSION_SECRET" || key === "OPENAI_API_KEY" || key === "SPEC_MATCH_API_KEY" || key === "LOCAL_STAFF_EMAIL" || key === "LOCAL_STAFF_PASSWORD") {
      process.env[key] = value;
    }
  }
  const supabaseUrl =
    process.env.VITE_SUPABASE_URL ||
    env.VITE_SUPABASE_URL ||
    env.SUPABASE_URL ||
    env.NEXT_PUBLIC_SUPABASE_URL ||
    "";
  if (supabaseUrl) process.env.VITE_SUPABASE_URL = supabaseUrl;
  const gaMeasurementId =
    process.env.VITE_GA_MEASUREMENT_ID || env.VITE_GA_MEASUREMENT_ID || GA_MEASUREMENT_ID;
  const marketplaceOrigin =
    process.env.VITE_MARKETPLACE_ORIGIN ||
    env.VITE_MARKETPLACE_ORIGIN ||
    (mode === "production" ? "https://marketplace.mattex.com.hk" : "http://localhost:5182");
  const adminOrigin =
    process.env.VITE_ADMIN_ORIGIN ||
    env.VITE_ADMIN_ORIGIN ||
    (mode === "production" ? "https://subbie-admin.mattex.com.hk" : "http://localhost:5183");
  const sentryDsn = process.env.VITE_SENTRY_DSN || env.VITE_SENTRY_DSN || "";
  return {
    plugins: [stripSupabaseFromClient(), react(), localApiPlugin(), marketplaceGaHtmlPlugin(), publicSsrHtmlPlugin()],
    envPrefix: "MM_PUBLIC_",
    define: {
      "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(""),
      "import.meta.env.VITE_SUPABASE_ANON_KEY": JSON.stringify(""),
      "import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY": JSON.stringify(""),
      "import.meta.env.NEXT_PUBLIC_SUPABASE_ANON_KEY": JSON.stringify(""),
      "import.meta.env.NEXT_PUBLIC_SUPABASE_URL": JSON.stringify(""),
      "import.meta.env.VITE_SURFACE": JSON.stringify("marketplace"),
      "import.meta.env.VITE_MARKETPLACE_ORIGIN": JSON.stringify(marketplaceOrigin),
      "import.meta.env.VITE_ADMIN_ORIGIN": JSON.stringify(adminOrigin),
      "import.meta.env.VITE_GA_MEASUREMENT_ID": JSON.stringify(gaMeasurementId),
      "import.meta.env.VITE_SENTRY_DSN": JSON.stringify(sentryDsn),
    },
    server: {
      port: 5178,
      host: true,
      strictPort: true,
    },
  };
});
