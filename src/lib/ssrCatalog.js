import { readFile } from "node:fs/promises";
import path from "node:path";
import { seedCatalogSnapshot } from "./store.js";

let ready = null;

/** Load the public catalog once so prerendered HTML includes product names, specs and links. */
export function ensureSsrCatalog() {
  if (!ready) ready = load();
  return ready;
}

async function load() {
  const candidates = [
    path.join(process.cwd(), "public", "catalog.json"),
    path.join(process.cwd(), "dist", "catalog.json"),
  ];
  for (const file of candidates) {
    try {
      const data = JSON.parse(await readFile(file, "utf8"));
      if (await seedCatalogSnapshot(data)) return true;
    } catch {
      /* try the next copy */
    }
  }
  return false;
}
