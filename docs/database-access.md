# Database access

Accepted 2026-11-07: browser API calls use `src/lib/remote.js`; runtime Supabase clients are created only by `server/db.js`. Offline import and migration scripts listed below are deliberate exceptions.

Local and deployed API routing is described in [API routing](./api-routing.md).

## Browser boundary

Pages, components, and stores call named functions in `src/lib/remote.js` rather than calling `fetch("/api/...")` or Supabase directly. The wrapper owns same-origin requests, cookies, JSON bodies, and response parsing. Existing catalog caching and API-specific error handling stay with their callers.

`src/lib/filePreview.js` downloads document bytes rather than database records. `src/lib/rfqBlob.js` uses the Vercel Blob upload SDK with the authorization endpoint exported by `remote.js`. These file transfers are outside the database boundary.

## Server boundary

`server/db.js` is server-only. `getDb()` returns a shared Supabase client, or `null` when its URL or key is absent; `requireDb(errorMessage)` throws the caller's configuration error instead. Clients disable session persistence and token refresh. Sharing is per server process and per URL/key pair, so different projects or permission levels never reuse each other's credentials.

| Callers | Configuration and missing-config behavior |
| --- | --- |
| `api/auth.js`, `api/data.js` | Main project; keep `auth_not_configured` / `data_not_configured` errors. |
| `api/catalog-snapshot.js`, `api/promo.js`, `server/upload-limit.js` | Main project; retain existing file or memory fallbacks. |
| `api/rfq.js` | Uses `getDb(config)` only when `RFQ_STORE=supabase` and credentials exist. RFQ URL/key overrides remain supported; local file storage and Vercel readiness checks remain unchanged. |
| `server/uat-catalog.js` | Passes its existing UAT-only URL and trimmed service-role or publishable key to `getDb(config)`. Retains its host restriction and catalog cache. |

The main project resolves `VITE_SUPABASE_URL` before `SUPABASE_URL`, and requires `SUPABASE_SERVICE_ROLE_KEY`. It does not fall back to a browser key. RFQ resolves `RFQ_SUPABASE_URL` and `RFQ_SUPABASE_SERVICE_ROLE_KEY` before the respective main settings. UAT catalog keeps its own existing URL and key resolution.

The wrapper centralizes client creation, not authorization or business rules. API handlers still enforce access and call the database; store adapters such as `server/rfq-supabase.js` receive a client. TMS access continues through its HTTP API in `server/tms-client.js`.

## Offline script exceptions

These scripts may create Supabase clients directly. They run as explicit maintenance commands, outside browser and runtime API flows, and may need source/destination projects, bulk table operations, or storage access unavailable through application APIs. They retain their existing credential handling.

| Script | Purpose |
| --- | --- |
| `scripts/seed-supabase.mjs` | Seed application data. |
| `scripts/copy-supabase-project.mjs` | Copy records between projects. |
| `scripts/merge-supabase-from-venus.mjs` | Merge source-project data into the destination. |
| `scripts/import-prc-local-products.mjs` | Import product and category data. |
| `scripts/sync-catalog-tables.mjs` | Synchronize catalog tables and image storage. |
| `scripts/assign-docx-type-images.mjs` | Assign catalog/type images. |
| `scripts/convert-images-to-webp.mjs` | Convert stored images and rewrite references. |
| `scripts/migrate-images-to-blob.mjs` | Move media to Vercel Blob and rewrite stored references. |

SQL schema and migration files also run outside application APIs. New runtime code must use the shared wrapper; new maintenance exceptions should be recorded here.

## Verification

Run `node --test server/db.test.mjs server/auth-cookie.test.mjs server/rfq-supabase.test.mjs server/rfq-inbox.test.mjs server/live-catalog.test.mjs` to verify credential isolation and the affected auth, RFQ, and catalog behavior without contacting a live database.

Audit `src/` for raw API fetches and database SDK imports, and `api/` / `server/` for client creation outside `server/db.js`. A source audit verifies repository boundaries; it does not prove that production migrations or deployments are current.
