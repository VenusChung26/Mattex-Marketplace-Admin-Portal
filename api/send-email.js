const FROM = process.env.RESEND_FROM || "Mattex Marketplace <resend@mattex.com.hk>";

export async function handleSendEmail(body) {
  const key = String(process.env.RESEND_API_KEY || "").trim();
  if (!key) return { ok: false, error: "not_configured" };
  const to = String(body?.to || "")
    .trim()
    .toLowerCase();
  const subject = String(body?.subject || "").trim();
  const html = String(body?.html || "");
  if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to) || !subject || !html) {
    return { ok: false, error: "invalid" };
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: FROM,
      to: [to],
      subject,
      html,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, error: data?.message || data?.error || "resend" };
  return { ok: true, id: data.id };
}

export async function POST(request) {
  let body = {};
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "invalid" }, { status: 400 });
  }
  const json = await handleSendEmail(body);
  return Response.json(json, { status: json.ok ? 200 : 400 });
}
