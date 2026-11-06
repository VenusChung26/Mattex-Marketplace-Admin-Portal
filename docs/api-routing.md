# API 路由

本地 Vite 與 Vercel 共用 `server/api-routes.js`，並執行相同的 `api/*.js` 標準 `GET`／`POST` handler。

| 檔案 | 責任 |
| --- | --- |
| `server/api-routes.js` | 定義可用 API entrypoints、公開 aliases 與本地分派。 |
| `server/local-api.js` | 將 Node HTTP request／response 轉接至 Web `Request`／`Response`；Vite 只註冊這個 middleware。 |
| `api/*.js` | Vercel Functions；處理 JSON、身份、業務規則與回應。純 helper 放在 `server/`。 |
| `scripts/sync-api-routes.mjs` | 將 aliases 寫入兩份 Vercel 設定；保留網站 redirects、headers、SSR 與 SPA 路由。 |

## 公開 aliases

| 公開路徑 | Vercel／本地共同目標 |
| --- | --- |
| `/api/catalog` | `/api/catalog-snapshot?part=get` |
| `/api/catalog-version` | `/api/catalog-snapshot?part=version` |
| `/api/catalog/commit` | `/api/catalog-snapshot?part=commit` |
| `/api/catalog-groups` | `/api/catalog-snapshot?part=groups` |
| `/api/tms-status` | `/api/tms-submit?part=status`（GET） |
| `/api/tms-login` | `/api/tms-submit?part=login`（POST） |

`/api/shared-store` 有明確的 Vercel entrypoint，但仍只用作本地檔案儲存。在 Vercel 回傳 `501 use-supabase`，避免 serverless instance 寫入本地檔案；這是刻意保留的環境差異。

## 新增或修改路由

1. 在 `api/` 新增標準 HTTP handler，並在 `API_ENDPOINTS` 註冊；額外公開路徑寫入 `API_REWRITES`。
2. 執行 `npm run api:routes:sync`，連同更新後的 `vercel.json`、`vercel.admin.json` 一起提交。Vercel 在 build 前讀取路由設定，所以不可只在 build 時產生。
3. 執行 `npm run api:routes:check` 與 `node --test server/api-routes.test.mjs server/local-api.test.mjs`。

`npm run dev`、`dev:admin`、`build`、`build:admin` 的 pre-hook 會檢查 entrypoints 與設定是否一致；不一致時停止並提示修正，不會默默使用舊路由。

本地 adapter 保留 HTTP method、query、原始 body、cookies、origin、forwarded headers、所有 response headers、HTTP status 及多個 `Set-Cookie`。JSON 解析與錯誤處理由正式 handler 負責；商品目錄的 ETag／304 也直接傳遞。API 身份及權限檢查仍留在原本 handler。

## 驗證範圍

路由測試覆蓋兩份 Vercel 設定、前端使用的 API、TMS aliases、production shared-store 拒寫，以及本地 HTTP 與部署 handler 的 JSON 錯誤一致性。HTTP 測試只開獨立的臨時 port，不會啟動或停止開發伺服器，也不會操作 production DB。

參考：[Vercel Node.js 標準 HTTP exports](https://vercel.com/docs/functions/runtimes/node-js)、[Vercel rewrites](https://vercel.com/docs/project-configuration/vercel-json#rewrites)。
