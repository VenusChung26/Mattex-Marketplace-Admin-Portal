const KEY = "subbie-admin-tms";

export function readTmsSession() {
  try {
    const raw = sessionStorage.getItem(KEY);
    const data = raw ? JSON.parse(raw) : null;
    if (data?.email && data?.password) return { email: String(data.email), password: String(data.password) };
  } catch {
    /* ignore */
  }
  return null;
}

export function writeTmsSession({ email, password }) {
  sessionStorage.setItem(KEY, JSON.stringify({ email: String(email || "").trim(), password: String(password || "") }));
}

export function clearTmsSession() {
  sessionStorage.removeItem(KEY);
}

export async function fetchTmsStatus() {
  const res = await fetch("/api/tms-status");
  const data = await res.json().catch(() => ({}));
  return Boolean(data?.configured);
}

export async function connectTmsSession({ email, password }) {
  const res = await fetch("/api/tms-login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tmsEmail: email, tmsPassword: password }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.ok) {
    throw new Error(data?.error || "TMS login failed");
  }
  writeTmsSession({ email: data.email || email, password });
  return { email: data.email || email };
}
