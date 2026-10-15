import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const WINDOW_MS = 60 * 60 * 1000; // one counting window per hour
const memory = new Map();
let client = null;

function db() {
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!url || !key) return null;
  if (!client) client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return client;
}

export function clientKey(request) {
  const forwarded = String(request?.headers?.get?.("x-forwarded-for") || "").split(",")[0].trim();
  const ip = forwarded || String(request?.headers?.get?.("x-real-ip") || "") || "local";
  return createHash("sha256").update(ip).digest("hex").slice(0, 24);
}

/**
 * Counts one ticket for this client in the current hour. Returns { ok, count }.
 * Stored in app_kv when Supabase is configured (shared across serverless instances),
 * otherwise in memory. A storage error fails open so a database hiccup never blocks an RFQ.
 */
export async function takeUploadTicket(request, limit) {
  const bucket = Math.floor(Date.now() / WINDOW_MS);
  const who = clientKey(request);
  const key = `upload_rate:${who}:${bucket}`;
  const sb = db();
  if (!sb) {
    const count = (memory.get(key) || 0) + 1;
    memory.set(key, count);
    for (const old of memory.keys()) if (!old.endsWith(`:${bucket}`)) memory.delete(old);
    return { ok: count <= limit, count };
  }
  try {
    const { data } = await sb.from("app_kv").select("value").eq("key", key).maybeSingle();
    const count = (Number(data?.value?.n) || 0) + 1;
    if (count > limit) return { ok: false, count };
    const { error } = await sb.from("app_kv").upsert({ key, value: { n: count }, updated_at: new Date().toISOString() });
    if (error) return { ok: true, count };
    if (count === 1) await sb.from("app_kv").delete().eq("key", `upload_rate:${who}:${bucket - 1}`);
    return { ok: true, count };
  } catch {
    return { ok: true, count: 0 };
  }
}
