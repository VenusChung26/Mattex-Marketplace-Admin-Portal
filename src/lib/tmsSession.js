import { getTmsStatus, postTmsLogin } from "./remote.js";

const KEY = "subbie-admin-tms";

function readRaw() {
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function readTmsSession() {
  const data = readRaw();
  if (!data?.email) return null;
  if (data.password) writeTmsSession({ email: data.email });
  return { email: String(data.email) };
}

export function writeTmsSession({ email }) {
  sessionStorage.setItem(KEY, JSON.stringify({ email: String(email || "").trim() }));
}

export function clearTmsSession() {
  sessionStorage.removeItem(KEY);
}

export async function fetchTmsStatus() {
  return getTmsStatus();
}

export async function connectTmsSession({ email, password }) {
  const res = await postTmsLogin({ tmsEmail: email, tmsPassword: password });
  const data = res.data || {};
  if (!res.res.ok || !data?.ok) {
    throw new Error(data?.error || "TMS login failed");
  }
  writeTmsSession({ email: data.email || email });
  return { email: data.email || email };
}
