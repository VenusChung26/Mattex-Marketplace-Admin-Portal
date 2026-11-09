async function sendJson(path, body) {
  const res = await fetch(path, {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);
  return { res, data };
}

async function post(action, body = {}) {
  try {
    const { res, data } = await sendJson("/api/contact-verify", { action, ...body });
    return { ok: Boolean(res?.ok && data?.ok), status: res?.status || 0, ...(data && typeof data === "object" ? data : {}) };
  } catch {
    return { ok: false, error: "network" };
  }
}

export async function sendContactOtp({ email, phone, name, lang }) {
  return post("send-otp", { email, phone, name, lang });
}

export async function verifyContactOtp({ email, phone, code }) {
  return post("verify-otp", { email, phone, code });
}

export async function acceptContactToken(token) {
  return post("accept-token", { token });
}

export async function contactVerifyStatus({ email, phone } = {}) {
  return post("status", { email, phone });
}
