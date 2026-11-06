import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { handleApiRequest } from "./api-routes.js";

async function webRequest(req) {
  const headers = new Headers();
  for (let i = 0; i < req.rawHeaders.length; i += 2) headers.append(req.rawHeaders[i], req.rawHeaders[i + 1]);
  const protocol = req.socket.encrypted ? "https" : "http";
  const url = new URL(req.url || "/", `${protocol}://${req.headers.host || "localhost"}`);
  const init = { method: req.method, headers };
  if (req.method !== "GET" && req.method !== "HEAD") {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    init.body = Buffer.concat(chunks);
  }
  return new Request(url, init);
}

async function writeResponse(response, req, res) {
  res.statusCode = response.status;
  for (const [key, value] of response.headers) {
    if (key !== "set-cookie") res.setHeader(key, value);
  }
  const cookies = response.headers.getSetCookie();
  if (cookies.length) res.setHeader("Set-Cookie", cookies);
  if (!response.body || req.method === "HEAD") {
    await response.body?.cancel();
    res.end();
    return;
  }
  await pipeline(Readable.fromWeb(response.body), res);
}

export function createApiMiddleware({ handleRequest = handleApiRequest } = {}) {
  return async (req, res, next) => {
    if (!String(req.url || "").split("?")[0].startsWith("/api/")) return next();
    try {
      await writeResponse(await handleRequest(await webRequest(req)), req, res);
    } catch (error) {
      next(error);
    }
  };
}

export function localApiPlugin() {
  return {
    name: "subbie-local-api",
    configureServer(server) {
      server.middlewares.use(createApiMiddleware());
    },
  };
}
