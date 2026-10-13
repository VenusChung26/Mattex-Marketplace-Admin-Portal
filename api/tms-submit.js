import { readSession } from "./auth.js";
import { submitInboundRfq, testTmsLogin, tmsServerConfigured } from "../server/tms-client.js";

function requireStaff(request) {
  if (readSession(request, "staff")) return;
  const error = new Error("auth");
  error.status = 401;
  throw error;
}

export async function handleTmsStatus() {
  return { ok: true, configured: tmsServerConfigured() };
}

export async function handleTmsLogin(_body, request) {
  requireStaff(request);
  return testTmsLogin();
}

export async function handleTmsSubmit(body, request) {
  requireStaff(request);
  const payload = { ...(body || {}) };
  delete payload.tmsPassword;
  delete payload.tmsEmail;
  return submitInboundRfq(payload);
}

export async function POST(request) {
  let body = {};
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "invalid json" }, { status: 400 });
  }
  try {
    const result = await handleTmsSubmit(body, request);
    return Response.json(result, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const status = Number(error?.status) || 400;
    return Response.json({ ok: false, error: error?.message || "TMS submit failed" }, { status, headers: { "cache-control": "no-store" } });
  }
}
