import { randomBytes } from "node:crypto";
import { handleUpload } from "@vercel/blob/client";
import { readSession, readTicket, signTicket } from "./auth.js";
import { takeUploadTicket } from "../server/upload-limit.js";

/** SSR polyfill sets globalThis.window in the Vite process; @vercel/blob then refuses to mint a client token. */
async function withoutBrowserGlobals(fn) {
  const hadWindow = Object.prototype.hasOwnProperty.call(globalThis, "window");
  const hadDocument = Object.prototype.hasOwnProperty.call(globalThis, "document");
  const windowRef = globalThis.window;
  const documentRef = globalThis.document;
  if (hadWindow) {
    try {
      delete globalThis.window;
    } catch {
      globalThis.window = undefined;
    }
  }
  if (hadDocument) {
    try {
      delete globalThis.document;
    } catch {
      globalThis.document = undefined;
    }
  }
  try {
    return await fn();
  } finally {
    if (hadWindow) globalThis.window = windowRef;
    if (hadDocument) globalThis.document = documentRef;
  }
}

const GUEST_TICKETS_PER_HOUR = 40;
const MEMBER_TICKETS_PER_HOUR = 400;

function fail(message, status) {
  const error = new Error(message);
  error.status = status;
  return error;
}

/** A browser on another site must not mint upload tokens through a visitor's session. */
function assertSameSite(request) {
  const origin = request.headers.get("origin");
  if (!origin) return;
  let originHost = "";
  try {
    originHost = new URL(origin).host;
  } catch {
    throw fail("forbidden", 403);
  }
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host") || "";
  if (host && originHost !== host) throw fail("forbidden", 403);
}

/**
 * Guests may upload (they can submit RFQs), but only with a short-lived signed ticket, a per-client
 * hourly cap, and file type and size limits. No login is required.
 */
async function issueTicket(request) {
  assertSameSite(request);
  const member = readSession(request, "buyer") || readSession(request, "staff");
  const taken = await takeUploadTicket(request, member ? MEMBER_TICKETS_PER_HOUR : GUEST_TICKETS_PER_HOUR);
  if (!taken.ok) throw fail("too many uploads, try again later", 429);
  return { ticket: signTicket({ id: randomBytes(9).toString("base64url"), who: member ? "member" : "guest" }) };
}

export async function handleRfqBlobUpload(body, request) {
  if (body?.type === "ticket") return issueTicket(request);
  return withoutBrowserGlobals(() =>
    handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        assertSameSite(request);
        const path = String(pathname || "");
        if (path.startsWith("products/")) {
          if (!readSession(request, "staff")) throw fail("auth", 401);
          return {
            allowedContentTypes: ["image/webp", "image/jpeg"],
            addRandomSuffix: true,
            maximumSizeInBytes: 1024 * 1024,
            cacheControlMaxAge: 31536000,
          };
        }
        if (!path.startsWith("rfq/")) {
          throw new Error("Invalid upload path");
        }
        const ticket = readTicket(String(clientPayload || ""));
        if (!ticket) throw fail("upload ticket required", 401);
        return {
          tokenPayload: JSON.stringify({ ticket: ticket.id }),
          allowedContentTypes: [
            "application/pdf",
            "application/msword",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "application/vnd.ms-excel",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "image/jpeg",
            "image/png",
            "image/webp",
            "image/gif",
            "image/heic",
            "image/heif",
          ],
          addRandomSuffix: true,
          maximumSizeInBytes: 20 * 1024 * 1024,
        };
      },
    })
  );
}

export async function POST(request) {
  const body = await request.json();
  try {
    const json = await handleRfqBlobUpload(body, request);
    return Response.json(json);
  } catch (error) {
    console.error("blob-upload", error);
    return Response.json({ error: error?.message || "upload failed" }, { status: Number(error?.status) || 400 });
  }
}
