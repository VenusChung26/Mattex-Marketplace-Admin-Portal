// Server only. Browser API calls belong in src/lib/remote.js.
import { createClient } from "@supabase/supabase-js";

const clients = new Map();

export function getDb({
  url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "",
  key = process.env.SUPABASE_SERVICE_ROLE_KEY || "",
} = {}) {
  if (!url || !key) return null;
  // RFQ and UAT can use different projects or credentials from the main store.
  const cacheKey = JSON.stringify([url, key]);
  if (!clients.has(cacheKey)) {
    clients.set(cacheKey, createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }));
  }
  return clients.get(cacheKey);
}

export function requireDb(errorMessage = "db_not_configured") {
  const db = getDb();
  if (!db) throw new Error(errorMessage);
  return db;
}
