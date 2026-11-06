import { readFile, readdir, writeFile } from "node:fs/promises";
import { API_ENDPOINTS, API_REWRITES } from "../server/api-routes.js";

const endpoints = (await readdir(new URL("../api/", import.meta.url)))
  .filter((name) => name.endsWith(".js"))
  .map((name) => `/api/${name.slice(0, -3)}`);
if (JSON.stringify(endpoints.sort()) !== JSON.stringify(Object.keys(API_ENDPOINTS).sort())) {
  throw new Error("API entrypoints differ from server/api-routes.js. Register new endpoints there and keep helpers in server/.");
}
for (const alias of API_REWRITES) {
  if (!API_ENDPOINTS[new URL(alias.destination, "https://subbie.test").pathname]) {
    throw new Error(`Unknown API rewrite destination: ${alias.destination}`);
  }
}

const check = process.argv.includes("--check");
let stale = false;
for (const name of ["vercel.json", "vercel.admin.json"]) {
  const file = new URL(`../${name}`, import.meta.url);
  const config = JSON.parse(await readFile(file, "utf8"));
  const rewrites = [...API_REWRITES, ...(config.rewrites || []).filter((rule) => !rule.source.startsWith("/api/"))];
  if (JSON.stringify(config.rewrites) === JSON.stringify(rewrites)) continue;
  if (check) {
    console.error(`${name}: API routes are out of sync. Run npm run api:routes:sync before deploying.`);
    stale = true;
  } else {
    config.rewrites = rewrites;
    await writeFile(file, `${JSON.stringify(config, null, 2)}\n`);
    console.log(`${name}: API routes synchronized.`);
  }
}
if (stale) process.exitCode = 1;
