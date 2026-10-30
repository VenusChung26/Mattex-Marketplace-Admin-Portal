import { execFile } from "node:child_process";
import { createHmac, timingSafeEqual } from "node:crypto";
import { access, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { inflateSync } from "node:zlib";
import * as XLSX from "xlsx";
import { readSession } from "./auth.js";
import { parseBuyerDocument } from "./buyer-spec.js";
import { circledCropsFromImage, circledFromPdf } from "./circled.js";
import { isChatNoise, isProductDescription } from "../src/lib/buyerLine.js";

const execFileAsync = promisify(execFile);

const COOKIE = "mm_spec_uses";
const DAILY_LIMIT = 10;
const SPEC_FETCH_MAX = 20 * 1024 * 1024;
const SPEC_BLOB_HOST = /(^|\.)blob\.vercel-storage\.com$/i;
const SNAPSHOT_FILE = path.join(process.cwd(), "data", "catalog-snapshot.json");
const SEED_FILE = path.join(process.cwd(), "public", "catalog.json");
const TESS_DIR = path.join(process.cwd(), "server", "tessdata");

function secret() {
  const value = process.env.SESSION_SECRET || "";
  return value.length >= 32 ? value : "mm-spec-uses-dev";
}

function sign(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", secret()).update(body).digest("base64url");
  return `${body}.${sig}`;
}

function unsign(value) {
  const [body, sig] = String(value || "").split(".");
  if (!body || !sig) return null;
  const expected = createHmac("sha256", secret()).update(body).digest();
  const given = Buffer.from(sig, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    return JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

function readCookie(request, name) {
  const header = request?.headers?.get?.("cookie") || "";
  const hit = header.split(/;\s*/).find((part) => part.startsWith(`${name}=`));
  return hit ? decodeURIComponent(hit.slice(name.length + 1)) : "";
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function guestState(request) {
  const payload = unsign(readCookie(request, COOKIE));
  if (!payload || payload.day !== today()) return { day: today(), count: 0 };
  return { day: today(), count: Math.max(0, Number(payload.count) || 0) };
}

function guestCookie(count) {
  const value = sign({ day: today(), count });
  return `${COOKIE}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=172800`;
}

function matchKey() {
  return process.env.SPEC_MATCH_API_KEY || process.env.OPENAI_API_KEY || "";
}

async function catalogIndex() {
  let data = null;
  try {
    data = JSON.parse(await readFile(SNAPSHOT_FILE, "utf8"));
  } catch {
    data = null;
  }
  if (!Array.isArray(data?.products) || !data.products.length) {
    try {
      data = JSON.parse(await readFile(SEED_FILE, "utf8"));
    } catch {
      data = null;
    }
  }
  const products = Array.isArray(data?.products) ? data.products : [];
  return products
    .filter((product) => product?.id && product.deleted !== true && product.published !== false)
    .slice(0, 900)
    .map((product) => ({
      id: product.id,
      sku: String(product.productNo || product.provisionalSku || ""),
      name: String(product.name || ""),
      category: String(product.category || ""),
      moq: product.moq === "" || product.moq == null ? null : Number(product.moq) || null,
      unit: String(product.salesUnit || product.unit || ""),
      spec: String(product.primarySpec || product.sizeDesc || "").slice(0, 120),
    }));
}

function sheetText(base64) {
  try {
    const book = XLSX.read(Buffer.from(base64, "base64"), { type: "buffer" });
    return book.SheetNames.map((name) => XLSX.utils.sheet_to_csv(book.Sheets[name])).join("\n").slice(0, 20000);
  } catch {
    return "";
  }
}

function roughText(base64) {
  const raw = Buffer.from(base64, "base64").toString("utf8");
  const pieces = raw.match(/[ -~\u4e00-\u9fff]{4,}/g) || [];
  return pieces.filter((line) => !isPdfSyntax(line)).join("\n").slice(0, 20000);
}

function unescapePdf(value) {
  return String(value || "")
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, " ")
    .replace(/\\t/g, " ")
    .replace(/\\([()\\])/g, "$1")
    .replace(/\\(\d{1,3})/g, (_, oct) => String.fromCharCode(Number.parseInt(oct, 8)));
}

function isPdfSyntax(line) {
  const text = String(line || "").trim();
  if (!text || text.startsWith("/")) return true;
  if (/\b(FlateDecode|ASCII85Decode|DCTDecode|JPXDecode|CCITTFaxDecode|endobj|endstream|startxref)\b/.test(text)) return true;
  if (/^\/?(?:Length|Filter|Type|Subtype)\b/i.test(text)) return true;
  return false;
}

function humanLine(text) {
  const clean = String(text || "").trim();
  if (/[<>\\^`~$@]/.test(clean)) return false;
  const words = clean.match(/[a-z\u4e00-\u9fff]{2,}/gi) || [];
  const letters = words.join("").length;
  return words.length >= 2 && letters / Math.max(clean.length, 1) >= 0.45;
}

function stringsFromPdfContent(content) {
  const lines = [];
  const re = /\((?:\\.|[^\\)]){2,400}\)/g;
  let match = re.exec(content);
  while (match) {
    const after = content.slice(match.index + match[0].length, match.index + match[0].length + 80);
    const close = after.indexOf("]");
    const arrayGap = close >= 0 ? after.slice(0, close) : "";
    const shown = /^\s*(?:Tj|'|")/.test(after) || (close >= 0 && /^[\s\d.+\-()\\]*$/.test(arrayGap) && /^\s*TJ/.test(after.slice(close + 1)));
    if (!shown) {
      match = re.exec(content);
      continue;
    }
    const text = unescapePdf(match[0].slice(1, -1)).replace(/[^\t\n\r\x20-\x7e\u4e00-\u9fff]/g, " ").replace(/\s+/g, " ").trim();
    if (humanLine(text) && !isPdfSyntax(text)) lines.push(text);
    match = re.exec(content);
  }
  return lines;
}

function pdfPlainText(base64) {
  const buffer = Buffer.from(base64, "base64");
  const raw = buffer.toString("latin1");
  const pieces = [];
  const marker = /stream\r?\n/g;
  let found = marker.exec(raw);
  while (found) {
    const start = found.index + found[0].length;
    const end = raw.indexOf("endstream", start);
    if (end < 0) break;
    const dict = raw.slice(Math.max(0, found.index - 500), found.index);
    let data = Buffer.from(raw.slice(start, end), "latin1");
    if (data[0] === 0x0a || data[0] === 0x0d) data = data.subarray(1);
    if (/FlateDecode/.test(dict)) {
      try {
        data = inflateSync(data);
      } catch {
        marker.lastIndex = end + 9;
        found = marker.exec(raw);
        continue;
      }
    }
    pieces.push(...stringsFromPdfContent(data.toString("latin1")));
    marker.lastIndex = end + 9;
    found = marker.exec(raw);
  }
  if (!pieces.length) pieces.push(...stringsFromPdfContent(raw));
  return pieces.join("\n").slice(0, 20000);
}

const STOP_WORDS = new Set([
  "the", "and", "for", "with", "from", "type", "item", "items", "qty", "quantity",
  "pcs", "size", "spec", "specification", "description", "unit", "total", "page",
]);

function tokens(value) {
  return String(value || "")
    .toLowerCase()
    .split(/[^a-z0-9\u4e00-\u9fff]+/)
    .filter((word) => word.length >= 2 && !STOP_WORDS.has(word) && !/^\d+$/.test(word));
}

function readableEnough(text) {
  const letters = (String(text || "").match(/[a-z\u4e00-\u9fff]/gi) || []).length;
  return letters >= 8 && letters / Math.max(String(text || "").length, 1) > 0.2;
}

function pushBuyerLine(items, name, spec, qty, circled) {
  const title = String(name || "").trim().slice(0, 180);
  if (title.length < 2 || !/[a-z\u4e00-\u9fff]/i.test(title) || isPdfSyntax(title)) return;
  if (!circled && !isProductDescription(title)) return;
  const parsed = Math.floor(Number(qty));
  const amount = Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  const key = `${title.toLowerCase()}|${amount}`;
  if (items.some((row) => `${row.name.toLowerCase()}|${row.qty}` === key)) return;
  items.push({ name: title, spec: String(spec || "").trim().slice(0, 240), qty: amount });
}

function cellsOf(line) {
  const cells = [];
  let current = "";
  let quoted = false;
  const text = String(line || "");
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (char === '"') {
      quoted = !quoted;
      continue;
    }
    if (!quoted && (char === "," || char === "\t" || char === "|")) {
      cells.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  cells.push(current.trim());
  return cells.filter(Boolean);
}

function lineFromCells(cells) {
  const texts = cells.filter((cell) => !/^\d+(\.\d+)?$/.test(cell));
  const qtyCell = cells.find((cell) => /^\d+(\.\d+)?$/.test(cell));
  const header = texts.join(" ").toLowerCase();
  if (/description|quantity|product|specification/.test(header) && texts.length <= 3 && !qtyCell) return null;
  return { name: texts[0] || "", spec: texts.slice(1).join(" · "), qty: qtyCell };
}

function extractBuyerLines(text, circled) {
  const items = [];
  const rawLines = String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  for (const line of rawLines) {
    const cells = cellsOf(line);
    if (cells.length >= 2) {
      const parsed = lineFromCells(cells);
      if (parsed) pushBuyerLine(items, parsed.name, parsed.spec, parsed.qty, circled);
      continue;
    }
    const marked = line.match(/^(.*?)(?:\s+(?:qty|quantity)\s*(\d+(?:\.\d+)?)|\s+[x×]\s*(\d+(?:\.\d+)?))\s*$/i);
    const qty = marked ? Number(marked[2] || marked[3]) : null;
    const name = (marked ? marked[1] : line).trim();
    const words = tokens(name);
    if (circled || qty || words.length >= 2 || isProductDescription(name)) pushBuyerLine(items, name, "", qty, circled);
    if (items.length >= 30) break;
  }
  return items;
}

function sheetItems(base64) {
  try {
    const book = XLSX.read(Buffer.from(base64, "base64"), { type: "buffer" });
    const items = [];
    for (const name of book.SheetNames) {
      const rows = XLSX.utils.sheet_to_json(book.Sheets[name], { header: 1, raw: false });
      for (const row of rows) {
        const cells = (Array.isArray(row) ? row : []).map((cell) => String(cell || "").trim()).filter(Boolean);
        const parsed = lineFromCells(cells);
        if (parsed) pushBuyerLine(items, parsed.name, parsed.spec, parsed.qty, false);
        if (items.length >= 30) return items;
      }
    }
    return items;
  } catch {
    return [];
  }
}

function matchBuyerLine(line, index) {
  const words = tokens(`${line.name} ${line.spec}`);
  if (!words.length) return [];
  const ranked = index
    .map((product) => {
      const hay = `${product.name} ${product.sku} ${product.category} ${product.spec}`.toLowerCase();
      const hits = words.filter((word) => hay.includes(word)).length;
      return { product, hits };
    })
    .filter((row) => row.hits > 0)
    .sort((a, b) => b.hits - a.hits)
    .slice(0, 5);
  if (!ranked.length) return [];
  const top = ranked[0].hits;
  const second = ranked[1]?.hits || 0;
  const confident = top >= 2 && top > second;
  return ranked.map((row, indexNo) => ({
    productId: row.product.id,
    name: row.product.name,
    spec: row.product.spec,
    unit: row.product.unit,
    moq: Math.max(1, Number(row.product.moq) || 1),
    confident: indexNo === 0 && confident,
  }));
}

function rowsFromBuyerLines(items, index, circled) {
  return items.map((line) => ({
    buyerName: line.name,
    buyerSpec: line.spec,
    qty: line.qty,
    circled: Boolean(circled),
    matches: matchBuyerLine(line, index),
  }));
}

function buyerItems(text, circled) {
  if (!circled) {
    const structured = parseBuyerDocument(text).filter((item) => isProductDescription(item.name));
    if (structured.length) return structured;
  }
  return extractBuyerLines(text, circled);
}

function fallbackItems(text, circled) {
  const items = [];
  for (const raw of String(text || "").split(/\n/)) {
    const name = raw.replace(/\s+/g, " ").trim();
    if (name.length < 2 || name.length > 180 || isChatNoise(name)) continue;
    if (!circled && !isProductDescription(name)) continue;
    const letters = name.replace(/[^A-Za-z0-9\u4e00-\u9fff]/g, "");
    if (letters.length < 2) continue;
    items.push({ name, spec: "", qty: null });
    if (items.length >= 40) break;
  }
  return items;
}

function localRows(body, index, text, pictured, circled) {
  const mime = String(body?.mime || "").toLowerCase();
  const name = String(body?.name || "").toLowerCase();
  const base64 = String(body?.base64 || "");
  if (name.endsWith(".xlsx") || name.endsWith(".xls") || mime.includes("sheet") || mime.includes("excel")) {
    const items = sheetItems(base64);
    return { unreadable: items.length === 0, rows: rowsFromBuyerLines(items, index, false) };
  }
  if (!text) return { unreadable: true, rows: [] };
  const items = buyerItems(text, circled);
  const rows = items.length || pictured ? items : fallbackItems(text, circled);
  return { unreadable: rows.length === 0, rows: rowsFromBuyerLines(rows, index, circled) };
}

function isPicture(body) {
  const mime = String(body?.mime || "").toLowerCase();
  const name = String(body?.name || "").toLowerCase();
  return mime.startsWith("image/") || mime.includes("pdf") || name.endsWith(".pdf") || /\.(png|jpe?g|webp|gif|heic|heif)$/.test(name);
}

async function visionBinary() {
  const bin = path.join(tmpdir(), "mattex-vision-ocr");
  const source = path.join(process.cwd(), "scripts", "vision-ocr.swift");
  try {
    const [binStat, sourceStat] = await Promise.all([stat(bin), stat(source)]);
    if (binStat.mtimeMs >= sourceStat.mtimeMs) return bin;
  } catch {
    /* compile when the reader is missing or newer */
  }
  if (process.platform !== "darwin") return "";
  await execFileAsync("swiftc", ["-O", "-o", bin, source], { timeout: 120000 });
  return bin;
}

function specFileExt(body) {
  const name = String(body?.name || "").toLowerCase();
  const mime = String(body?.mime || "").toLowerCase();
  if (name.endsWith(".pdf") || mime.includes("pdf")) return ".pdf";
  if (name.endsWith(".png") || mime === "image/png") return ".png";
  if (name.endsWith(".webp") || mime === "image/webp") return ".webp";
  if (name.endsWith(".gif") || mime === "image/gif") return ".gif";
  if (name.endsWith(".heic") || mime.includes("heic")) return ".heic";
  if (name.endsWith(".heif") || mime.includes("heif")) return ".heif";
  return ".jpg";
}

async function appleVisionText(body) {
  const base64 = String(body?.base64 || "");
  if (!base64 || process.platform !== "darwin" || process.env.SPEC_OCR === "server") return "";
  const ext = specFileExt(body);
  let dir = "";
  try {
    const bin = await visionBinary();
    if (!bin) return "";
    dir = await mkdtemp(path.join(tmpdir(), "spec-ocr-"));
    const file = path.join(dir, `upload${ext}`);
    await writeFile(file, Buffer.from(base64, "base64"));
    const { stdout } = await execFileAsync(bin, [file], { timeout: 30000, maxBuffer: 2_000_000 });
    return String(stdout || "").slice(0, 20000);
  } catch {
    return "";
  } finally {
    if (dir) await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

let ocrWorkerPromise = null;

function resetOcrWorker() {
  const pending = ocrWorkerPromise;
  ocrWorkerPromise = null;
  if (pending) pending.then((worker) => worker.terminate()).catch(() => {});
}

async function recognizeImages(pages) {
  if (!pages.length) return "";
  const { createWorker } = await import("tesseract.js");
  if (!ocrWorkerPromise) {
    ocrWorkerPromise = createWorker("eng+chi_tra", 1, {
      langPath: TESS_DIR,
      cachePath: path.join(tmpdir(), "tessdata"),
      gzip: true,
    }).catch((error) => {
      ocrWorkerPromise = null;
      throw error;
    });
  }
  const worker = await ocrWorkerPromise;
  const parts = [];
  for (const page of pages.slice(0, 3)) {
    const { data } = await worker.recognize(page);
    if (data?.text) parts.push(data.text);
  }
  return parts.join("\n").slice(0, 20000);
}

async function rasterPages(sharp, buffer) {
  const meta = await sharp(buffer, { failOn: "none" }).rotate().metadata();
  const width = meta.width || 0;
  const height = meta.height || 0;
  let pipeline = sharp(buffer, { failOn: "none" }).rotate();
  if (width > 1600) pipeline = pipeline.resize({ width: 1600, withoutEnlargement: true });
  return [await pipeline.png().toBuffer()];
}

function isPdf(body) {
  const mime = String(body?.mime || "").toLowerCase();
  const name = String(body?.name || "").toLowerCase();
  return mime.includes("pdf") || name.endsWith(".pdf");
}

async function pdfServerText(buffer) {
  const mupdf = await import("mupdf");
  const doc = mupdf.Document.openDocument(buffer, "application/pdf");
  const count = Math.min(doc.countPages(), 3);
  const texts = [];
  for (let index = 0; index < count; index += 1) {
    texts.push(doc.loadPage(index).toStructuredText("preserve-whitespace").asText());
  }
  const text = texts.join("\n");
  if (buyerItems(text).length) return text;
  const images = [];
  for (let index = 0; index < count && images.length < 2; index += 1) {
    const png = Buffer.from(doc.loadPage(index).toPixmap(mupdf.Matrix.scale(1.2, 1.2), mupdf.ColorSpace.DeviceRGB, false).asPNG());
    if (png.length > 20_000) images.push(png);
  }
  return recognizeImages(images);
}

async function serverOcrText(body) {
  const base64 = String(body?.base64 || "");
  if (!base64) return "";
  try {
    const buffer = Buffer.from(base64, "base64");
    if (isPdf(body)) return await pdfServerText(buffer);
    const sharpMod = await import("sharp");
    const pages = await rasterPages(sharpMod.default, buffer);
    return recognizeImages(pages);
  } catch {
    resetOcrWorker();
    return "";
  }
}

async function visionText(body) {
  const apple = await appleVisionText(body);
  if (String(apple || "").trim()) return apple;
  try {
    return await serverOcrText(body);
  } finally {
    resetOcrWorker();
  }
}

export function specBlobUrl(value) {
  let url;
  try {
    url = new URL(String(value || ""));
  } catch {
    return "";
  }
  if (url.protocol !== "https:" || url.username || url.password) return "";
  if (!SPEC_BLOB_HOST.test(url.hostname)) return "";
  return url.href;
}

/** Large spec files arrive as a Blob URL. Only our own store is fetched, then the bytes follow the same readers as a small upload. */
export async function loadSpecUpload(body, fetchImpl = globalThis.fetch) {
  const next = { ...(body || {}) };
  if (String(next.base64 || "") || String(next.text || "")) return next;
  const href = specBlobUrl(next.url);
  if (!href) return next;
  let res;
  try {
    res = await fetchImpl(href, { redirect: "error" });
  } catch {
    return next;
  }
  if (!res?.ok) return next;
  const declared = Number(res.headers?.get?.("content-length") || 0);
  if (declared > SPEC_FETCH_MAX) return next;
  const buf = Buffer.from(await res.arrayBuffer());
  if (!buf.length || buf.length > SPEC_FETCH_MAX) return next;
  next.base64 = buf.toString("base64");
  const mime = String(next.mime || "").toLowerCase();
  if (mime.startsWith("image/") && !String(next.dataUrl || "").startsWith("data:image/")) {
    const dataUrl = `data:${mime};base64,${next.base64}`;
    if (dataUrl.length <= 2_000_000) next.dataUrl = dataUrl;
  }
  return next;
}

function zipEntries(buffer) {
  const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 0xffff); i -= 1) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return new Map();
  const count = buf.readUInt16LE(eocd + 10);
  let pos = buf.readUInt32LE(eocd + 16);
  const files = new Map();
  for (let n = 0; n < count; n += 1) {
    if (pos + 46 > buf.length || buf.readUInt32LE(pos) !== 0x02014b50) break;
    const method = buf.readUInt16LE(pos + 10);
    const compSize = buf.readUInt32LE(pos + 20);
    const nameLen = buf.readUInt16LE(pos + 28);
    const extraLen = buf.readUInt16LE(pos + 30);
    const commentLen = buf.readUInt16LE(pos + 32);
    const localOff = buf.readUInt32LE(pos + 42);
    const name = buf.slice(pos + 46, pos + 46 + nameLen).toString("utf8");
    if (localOff + 30 > buf.length) break;
    const localNameLen = buf.readUInt16LE(localOff + 26);
    const localExtraLen = buf.readUInt16LE(localOff + 28);
    const dataStart = localOff + 30 + localNameLen + localExtraLen;
    const comp = buf.slice(dataStart, dataStart + compSize);
    let data = comp;
    if (method === 8) {
      try {
        data = inflateSync(comp);
      } catch {
        data = Buffer.alloc(0);
      }
    } else if (method !== 0) data = Buffer.alloc(0);
    files.set(name, data);
    pos += 46 + nameLen + extraLen + commentLen;
  }
  return files;
}

function docxText(base64) {
  try {
    const xml = zipEntries(Buffer.from(base64, "base64")).get("word/document.xml");
    if (!xml?.length) return "";
    return xml
      .toString("utf8")
      .replace(/<w:p\b[^>]*>/g, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/\n{2,}/g, "\n")
      .trim()
      .slice(0, 20000);
  } catch {
    return "";
  }
}

function readableText(text) {
  return parseBuyerDocument(text).length > 0 || extractBuyerLines(text).length > 0;
}

export function specImageDataUrl(body) {
  const given = String(body?.dataUrl || "");
  if (given.startsWith("data:image/") && given.length <= 2_000_000) return given;
  const mime = String(body?.mime || "").toLowerCase();
  const base64 = String(body?.base64 || "");
  if (!mime.startsWith("image/") || !base64) return "";
  const url = `data:${mime};base64,${base64}`;
  return url.length <= 2_000_000 ? url : "";
}

async function readDocument(body) {
  const circled = await readCircled(body);
  if (circled?.text) return { text: circled.text, pictured: false, circled: true };
  const plain = sourceText(body);
  if (readableText(plain)) return { text: plain, pictured: false, circled: false };
  if (!isPicture(body)) return { text: plain, pictured: false, circled: false };
  const ocr = await visionText(body);
  if (String(ocr || "").trim()) return { text: ocr, pictured: true, circled: false };
  if (String(plain || "").trim()) return { text: plain, pictured: true, circled: false };
  return { text: "", pictured: true, circled: false };
}

async function readCircled(body) {
  const base64 = String(body?.base64 || "");
  if (!base64 || !isPicture(body)) return null;
  try {
    const buffer = Buffer.from(base64, "base64");
    if (isPdf(body)) {
      const found = await circledFromPdf(buffer);
      if (!found?.marked) return null;
      if (String(found.text || "").trim()) return { text: found.text };
      const ocr = await recognizeImages(found.crops || []);
      return String(ocr || "").trim() ? { text: ocr } : null;
    }
    const crops = await circledCropsFromImage(buffer);
    if (!crops.length) return null;
    const ocr = await recognizeImages(crops);
    return String(ocr || "").trim() ? { text: ocr } : null;
  } catch {
    return null;
  }
}

function sourceText(body) {
  const mime = String(body?.mime || "").toLowerCase();
  const name = String(body?.name || "").toLowerCase();
  const base64 = String(body?.base64 || "");
  if (name.endsWith(".xlsx") || name.endsWith(".xls") || mime.includes("sheet") || mime.includes("excel")) {
    return sheetText(base64) || String(body?.text || "");
  }
  if (name.endsWith(".docx") || mime.includes("wordprocessingml")) {
    return docxText(base64) || String(body?.text || "");
  }
  if (body?.text) return String(body.text).slice(0, 20000);
  if (base64 && (name.endsWith(".pdf") || mime.includes("pdf"))) return pdfPlainText(base64);
  if (base64 && !mime.startsWith("image/")) return roughText(base64);
  return "";
}

function catalogMatch(product, confident) {
  return {
    productId: product.id,
    name: product.name,
    spec: product.spec,
    unit: product.unit,
    moq: Math.max(1, Number(product.moq) || 1),
    confident: Boolean(confident),
  };
}

function rowsFromModel(raw, index) {
  const byId = new Map(index.map((product) => [product.id, product]));
  const rows = [];
  for (const row of Array.isArray(raw) ? raw : []) {
    if (Array.isArray(row?.matches) || row?.name) {
      const name = String(row?.name || "").trim();
      if (!name || isChatNoise(name) || !isProductDescription(name)) continue;
      const matches = [];
      for (const match of Array.isArray(row.matches) ? row.matches : []) {
        const product = byId.get(String(match?.productId || ""));
        if (!product || matches.some((item) => item.productId === product.id)) continue;
        matches.push(catalogMatch(product, match?.confident === true && matches.length === 0));
        if (matches.length >= 5) break;
      }
      if (!matches.length && row?.productId) {
        const product = byId.get(String(row.productId));
        if (product) matches.push(catalogMatch(product, row?.kind === "product"));
      }
      rows.push({
        buyerName: name.slice(0, 180),
        buyerSpec: String(row?.spec || "").trim().slice(0, 240),
        qty: Math.max(1, Math.floor(Number(row?.qty)) || 1),
        matches,
      });
      continue;
    }
  }
  return rows;
}

function flatLines(rows) {
  const lines = [];
  for (const row of rows) {
    for (const match of row.matches || []) {
      lines.push({
        kind: match.confident ? "product" : "suggest",
        productId: match.productId,
        name: match.name,
        spec: match.spec,
        qty: row.qty,
        unit: match.unit,
      });
    }
  }
  return lines;
}

function normalizeLines(raw, index) {
  const byId = new Map(index.map((product) => [product.id, product]));
  const lines = [];
  for (const row of Array.isArray(raw) ? raw : []) {
    const product = byId.get(String(row?.productId || ""));
    const kind = row?.kind === "suggest" ? "suggest" : row?.kind === "tailor" || !product ? "tailor" : "product";
    if (kind === "tailor") {
      const name = String(row?.name || "").trim();
      if (!name) continue;
      const qty = Math.max(1, Math.floor(Number(row?.qty)) || 1);
      lines.push({
        kind: "tailor",
        productId: "",
        name,
        spec: String(row?.spec || "").trim(),
        qty,
        checked: false,
      });
      continue;
    }
    const fallbackQty = Math.max(1, Number(product.moq) || 1);
    const qty = Math.max(1, Math.floor(Number(row?.qty)) || fallbackQty);
    lines.push({
      kind,
      productId: product.id,
      name: product.name,
      spec: String(row?.spec || product.spec || "").trim(),
      qty,
      unit: product.unit,
      checked: kind === "product",
    });
  }
  return lines;
}

async function askModel({ text, imageDataUrl, index }) {
  const key = matchKey();
  const content = [
    {
      type: "text",
      text: [
        "Match the buyer specification to this catalog. Return JSON only: {\"lines\":[...]}.",
        "One line per product in the document: {name, spec, qty, matches}.",
        "name and spec are the buyer's own product, copied from the document. qty comes from the document, or 1 when missing.",
        "Skip greetings, salutations, and chat. Pierre，早晨！ and good morning are not products.",
        "Keep only material and product lines, written like a Marketplace product description: the product name plus a size, grade, or thickness when the document gives one. Examples: Gypsum board 12.5mm, A142 reinforcement mesh, Equal angles S275J0.",
        "Skip requirement sentences (shall, should, must), lines that continue a sentence (starting with and or or), locations, room names, and section headings such as Partitioning or Concrete Works.",
        "Skip lines that are not a material or product: dates, revision, page numbers, prices such as Amount (HK$), column headings such as Qty, Unit, Rate, and Description, locations and room names, section headings such as Partitioning, Concrete Works, General requirements, Brand/Model, Material performance specification, Or approved equivalent, and a standard citation on its own such as BS476:Part22.",
        "matches is an array of {productId, confident}. Put the closest catalog product first. confident is true only when that product is the same item.",
        "Other close catalog products follow with confident false. Use an empty matches array when the catalog has no close product.",
        `Catalog: ${JSON.stringify(index)}`,
        text ? `Document text:\n${text}` : "The document is the attached image.",
      ].join("\n"),
    },
  ];
  if (imageDataUrl) content.push({ type: "image_url", image_url: { url: imageDataUrl } });
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [{ role: "user", content }],
    }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  const raw = data?.choices?.[0]?.message?.content || "";
  try {
    return JSON.parse(raw)?.lines;
  } catch {
    return null;
  }
}

export async function handleSpecMatchStatus(request) {
  const member = readSession(request, "buyer") || readSession(request, "staff");
  const guest = guestState(request);
  return {
    status: 200,
    body: {
      ok: true,
      open: true,
      member: Boolean(member),
      remaining: member ? null : Math.max(0, DAILY_LIMIT - guest.count),
    },
  };
}

export async function handleSpecMatch(input, request) {
  const body = await loadSpecUpload(input);
  const member = readSession(request, "buyer") || readSession(request, "staff");
  const guest = guestState(request);
  if (!member && guest.count >= DAILY_LIMIT) {
    return { status: 429, cookie: guestCookie(guest.count), body: { ok: false, error: "limit", remaining: 0 } };
  }
  const imageDataUrl = specImageDataUrl(body);
  const document = await readDocument(body);
  const text = document.text;
  if (!text && !imageDataUrl && !String(body?.base64 || "")) return { status: 400, body: { ok: false, error: "file" } };
  const index = await catalogIndex();
  let parsed = localRows(body, index, text, document.pictured, document.circled);
  if (!document.circled && matchKey() && (text || imageDataUrl)) {
    try {
      const raw = await askModel({ text, imageDataUrl, index });
      const modeled = rowsFromModel(raw, index);
      if (modeled.length) parsed = { unreadable: false, rows: modeled };
    } catch {
      /* keep the rows already read from the file */
    }
  }
  const rows = parsed.rows || [];
  const count = member ? guest.count : guest.count + 1;
  return {
    status: 200,
    cookie: member ? "" : guestCookie(count),
    body: {
      ok: true,
      unreadable: Boolean(parsed.unreadable) || rows.length === 0,
      circled: Boolean(document.circled),
      rows,
      lines: flatLines(rows),
      remaining: member ? null : Math.max(0, DAILY_LIMIT - count),
    },
  };
}

function jsonResult(result) {
  const headers = { "cache-control": "no-store" };
  if (result.cookie) headers["set-cookie"] = result.cookie;
  return Response.json(result.body, { status: result.status || 200, headers });
}

export async function GET(request) {
  return jsonResult(await handleSpecMatchStatus(request));
}

export async function POST(request) {
  let body = {};
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "invalid json" }, { status: 400 });
  }
  return jsonResult(await handleSpecMatch(body, request));
}
