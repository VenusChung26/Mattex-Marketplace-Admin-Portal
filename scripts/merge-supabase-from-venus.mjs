import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

function parseEnvFile(filePath) {
  const active = {};
  const commented = {};
  let text = "";
  try {
    text = readFileSync(filePath, "utf8");
  } catch {
    return { active, commented };
  }
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const isComment = trimmed.startsWith("#");
    const body = isComment ? trimmed.replace(/^#\s?/, "").trim() : trimmed;
    if (!body || body.startsWith("#") || !body.includes("=")) continue;
    const eq = body.indexOf("=");
    const key = body.slice(0, eq).trim();
    if (!/^[A-Z0-9_]+$/.test(key)) continue;
    let value = body.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (isComment) commented[key] = value;
    else active[key] = value;
  }
  return { active, commented };
}

const { active, commented } = parseEnvFile(".env.local");
const destUrl = active.VITE_SUPABASE_URL || active.NEXT_PUBLIC_SUPABASE_URL || "";
const destKey =
  active.VITE_SUPABASE_ANON_KEY ||
  active.VITE_SUPABASE_PUBLISHABLE_KEY ||
  active.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  "";
const sourceUrl = commented.VITE_SUPABASE_URL || process.env.MERGE_SOURCE_SUPABASE_URL || "";
const sourceKey =
  commented.VITE_SUPABASE_ANON_KEY ||
  commented.VITE_SUPABASE_PUBLISHABLE_KEY ||
  process.env.MERGE_SOURCE_SUPABASE_ANON_KEY ||
  "";

function hostOf(url) {
  try {
    return new URL(url).host;
  } catch {
    return "";
  }
}

const sourceHost = hostOf(sourceUrl);
const destHost = hostOf(destUrl);
if (sourceHost !== "kvwaefplbjaomfpdjxan.supabase.co") {
  console.error("Source must be kvwaefplbjaomfpdjxan.supabase.co");
  process.exit(1);
}
if (destHost !== "pgzdcrlrxukvblydknkn.supabase.co") {
  console.error("Dest must be pgzdcrlrxukvblydknkn.supabase.co");
  process.exit(1);
}
if (!sourceKey || !destKey) {
  console.error("Missing source or dest anon key");
  process.exit(1);
}

const source = createClient(sourceUrl, sourceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const dest = createClient(destUrl, destKey, { auth: { persistSession: false, autoRefreshToken: false } });

function rfqStamp(rfq) {
  let max = 0;
  for (const iso of [rfq?.submittedAt, rfq?.acceptedAt, rfq?.resubmittedAt, rfq?.quotedAt, rfq?.noOfferAt]) {
    const n = Date.parse(iso || "") || 0;
    if (n > max) max = n;
  }
  (Array.isArray(rfq?.activity) ? rfq.activity : []).forEach((row) => {
    const n = Date.parse(row?.at || "") || 0;
    if (n > max) max = n;
  });
  return max;
}

function pickRfq(a, b) {
  if (!a) return b;
  if (!b) return a;
  const newer = rfqStamp(b) >= rfqStamp(a) ? b : a;
  const richer = JSON.stringify(b).length >= JSON.stringify(a).length ? b : a;
  if (newer === richer) return newer;
  return {
    ...richer,
    ...newer,
    lines:
      JSON.stringify(newer.lines || []).length >= JSON.stringify(richer.lines || []).length
        ? newer.lines
        : richer.lines,
    requestVersions:
      (newer.requestVersions || []).length >= (richer.requestVersions || []).length
        ? newer.requestVersions
        : richer.requestVersions,
    activity:
      (newer.activity || []).length >= (richer.activity || []).length ? newer.activity : richer.activity,
  };
}

function mergeRfqMaps(local, remote) {
  const keys = new Set([
    ...Object.keys(remote && typeof remote === "object" ? remote : {}),
    ...Object.keys(local && typeof local === "object" ? local : {}),
  ]);
  const out = {};
  keys.forEach((key) => {
    const byId = new Map();
    [...(Array.isArray(remote?.[key]) ? remote[key] : []), ...(Array.isArray(local?.[key]) ? local[key] : [])].forEach(
      (rfq) => {
        if (!rfq?.id) return;
        byId.set(rfq.id, pickRfq(byId.get(rfq.id), rfq));
      }
    );
    out[key] = [...byId.values()].sort((a, b) => String(b?.submittedAt || "").localeCompare(String(a?.submittedAt || "")));
  });
  return out;
}

function mergeStaff(destList, sourceList) {
  const byEmail = new Map();
  const add = (row) => {
    const email = String(row?.email || "").trim().toLowerCase();
    if (!email) return;
    byEmail.set(email, { ...(byEmail.get(email) || {}), ...row, email });
  };
  (Array.isArray(sourceList) ? sourceList : []).forEach(add);
  (Array.isArray(destList) ? destList : []).forEach(add);
  return [...byEmail.values()];
}

function mergePatches(destMap, sourceMap) {
  const left = destMap && typeof destMap === "object" ? destMap : {};
  const right = sourceMap && typeof sourceMap === "object" ? sourceMap : {};
  const merged = { ...right, ...left };
  const removed = [
    ...new Set([
      ...(Array.isArray(right.__removed) ? right.__removed : []),
      ...(Array.isArray(left.__removed) ? left.__removed : []),
    ]),
  ];
  merged.__removed = removed;
  const createdById = new Map();
  [...(Array.isArray(right.__created) ? right.__created : []), ...(Array.isArray(left.__created) ? left.__created : [])].forEach(
    (row) => {
      if (row?.id && !removed.includes(String(row.id))) createdById.set(String(row.id), row);
    }
  );
  merged.__created = [...createdById.values()];
  removed.forEach((id) => {
    delete merged[id];
  });
  return merged;
}

function mergeAlerts(destList, sourceList) {
  const byId = new Map();
  [...(Array.isArray(sourceList) ? sourceList : []), ...(Array.isArray(destList) ? destList : [])].forEach((row) => {
    if (!row?.id) return;
    const prev = byId.get(row.id);
    if (!prev || JSON.stringify(row).length >= JSON.stringify(prev).length) byId.set(row.id, row);
  });
  return [...byId.values()].sort((a, b) => String(b?.at || "").localeCompare(String(a?.at || "")));
}

function countRfqs(map) {
  return Object.values(map && typeof map === "object" ? map : {}).reduce(
    (n, list) => n + (Array.isArray(list) ? list.length : 0),
    0
  );
}

async function loadKv(client) {
  const { data, error } = await client.from("app_kv").select("key,value");
  if (error) throw error;
  const kv = {};
  for (const row of data || []) kv[row.key] = row.value;
  return kv;
}

async function upsertKv(client, key, value) {
  const { error } = await client.from("app_kv").upsert({
    key,
    value,
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}

const SKIP_COPY = new Set(["hacker_news", "subbie_tmp_sku_seq_demo"]);

const srcKv = await loadKv(source);
const dstKv = await loadKv(dest);

const mergedRfqs = mergeRfqMaps(dstKv.subbie_rfqs_by_user || {}, srcKv.subbie_rfqs_by_user || {});
await upsertKv(dest, "subbie_rfqs_by_user", mergedRfqs);

const mergedAccounts = {
  ...(srcKv.subbie_accounts && typeof srcKv.subbie_accounts === "object" ? srcKv.subbie_accounts : {}),
  ...(dstKv.subbie_accounts && typeof dstKv.subbie_accounts === "object" ? dstKv.subbie_accounts : {}),
};
await upsertKv(dest, "subbie_accounts", mergedAccounts);

const deleted = [
  ...new Set([
    ...(Array.isArray(srcKv.subbie_deleted_buyers) ? srcKv.subbie_deleted_buyers : []),
    ...(Array.isArray(dstKv.subbie_deleted_buyers) ? dstKv.subbie_deleted_buyers : []),
  ]),
];
await upsertKv(dest, "subbie_deleted_buyers", deleted);

await upsertKv(dest, "subbie_staff", mergeStaff(dstKv.subbie_staff, srcKv.subbie_staff));
await upsertKv(dest, "subbie_admin_alerts", mergeAlerts(dstKv.subbie_admin_alerts, srcKv.subbie_admin_alerts));
await upsertKv(dest, "subbie_product_reports", mergeAlerts(dstKv.subbie_product_reports, srcKv.subbie_product_reports));
await upsertKv(
  dest,
  "subbie_guest_quote_snapshots",
  {
    ...(srcKv.subbie_guest_quote_snapshots && typeof srcKv.subbie_guest_quote_snapshots === "object"
      ? srcKv.subbie_guest_quote_snapshots
      : {}),
    ...(dstKv.subbie_guest_quote_snapshots && typeof dstKv.subbie_guest_quote_snapshots === "object"
      ? dstKv.subbie_guest_quote_snapshots
      : {}),
  }
);
await upsertKv(dest, "subbie_product_patches", mergePatches(dstKv.subbie_product_patches, srcKv.subbie_product_patches));
await upsertKv(
  dest,
  "subbie_rfq_seq",
  Math.max(Number(dstKv.subbie_rfq_seq) || 0, Number(srcKv.subbie_rfq_seq) || 0)
);
await upsertKv(
  dest,
  "subbie_tmp_sku_seq",
  Math.max(Number(dstKv.subbie_tmp_sku_seq) || 0, Number(srcKv.subbie_tmp_sku_seq) || 0)
);

const mail = [
  ...(Array.isArray(srcKv.subbie_buyer_mail_log) ? srcKv.subbie_buyer_mail_log : []),
  ...(Array.isArray(dstKv.subbie_buyer_mail_log) ? dstKv.subbie_buyer_mail_log : []),
];
const mailSeen = new Set();
const mailMerged = [];
mail.forEach((row) => {
  const id = JSON.stringify([row?.at, row?.to, row?.subject, row?.id]);
  if (mailSeen.has(id)) return;
  mailSeen.add(id);
  mailMerged.push(row);
});
await upsertKv(dest, "subbie_buyer_mail_log", mailMerged);

if (srcKv.subbie_drafts_by_user || dstKv.subbie_drafts_by_user) {
  await upsertKv(dest, "subbie_drafts_by_user", {
    ...(srcKv.subbie_drafts_by_user && typeof srcKv.subbie_drafts_by_user === "object" ? srcKv.subbie_drafts_by_user : {}),
    ...(dstKv.subbie_drafts_by_user && typeof dstKv.subbie_drafts_by_user === "object" ? dstKv.subbie_drafts_by_user : {}),
  });
}

for (const [key, value] of Object.entries(srcKv)) {
  if (SKIP_COPY.has(key) || dstKv[key] != null) continue;
  if (key.startsWith("subbie_")) await upsertKv(dest, key, value);
}

const { data: srcProducts, error: srcProdErr } = await source.from("products").select("id,payload");
if (srcProdErr) throw srcProdErr;
const { data: dstProducts, error: dstProdErr } = await dest.from("products").select("id");
if (dstProdErr) throw dstProdErr;
const destIds = new Set((dstProducts || []).map((row) => row.id));
const missing = (srcProducts || []).filter((row) => row?.id && !destIds.has(row.id));
if (missing.length) {
  const { error } = await dest.from("products").upsert(
    missing.map((row) => ({ id: row.id, payload: row.payload, updated_at: new Date().toISOString() }))
  );
  if (error) throw error;
}

console.log(`Merged ${sourceHost} -> ${destHost}`);
console.log(`RFQs source ${countRfqs(srcKv.subbie_rfqs_by_user)} dest-before ${countRfqs(dstKv.subbie_rfqs_by_user)} merged ${countRfqs(mergedRfqs)}`);
console.log(`Accounts source ${Object.keys(srcKv.subbie_accounts || {}).length} dest-before ${Object.keys(dstKv.subbie_accounts || {}).length} merged ${Object.keys(mergedAccounts).length}`);
console.log(`Missing products copied ${missing.length}`);
