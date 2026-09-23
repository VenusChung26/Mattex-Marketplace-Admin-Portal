import { submitInboundRfq, testTmsLogin, tmsServerConfigured } from "./tms-client.js";

export async function handleTmsStatus() {
  return { ok: true, configured: tmsServerConfigured() };
}

export async function handleTmsLogin(body) {
  return testTmsLogin(body || {});
}

export async function handleTmsSubmit(body) {
  return submitInboundRfq(body || {});
}
