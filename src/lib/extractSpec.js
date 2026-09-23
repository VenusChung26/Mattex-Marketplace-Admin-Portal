/** PROTOTYPE — simulated AI extraction from pasted text, filenames, and text files. */

const CATEGORY_HINTS = [
  { keys: ["precast", "hollow-core", "slab", "panel"], name: "Precast Concrete" },
  { keys: ["barrier", "jersey"], name: "Barriers" },
  { keys: ["brick", "block", "masonry"], name: "Brick & Block" },
  { keys: ["waterproof", "membrane", "torch"], name: "Waterproofing" },
  { keys: ["manhole", "channel", "dn600", "drain"], name: "Manhole & Channel" },
  { keys: ["insulation", "xps", "pir"], name: "Insulation" },
  { keys: ["plaster", "skim", "gypsum plaster"], name: "Plastering" },
  { keys: ["safety net", "debris net"], name: "Safety Net" },
  { keys: ["steel", "s355", "s275", "ub ", "uc ", "beam", "metal"], name: "Structure Steel Element, Metal Product" },
  { keys: ["tile", "porcelain", "ceramic"], name: "Tile" },
  { keys: ["timber", "plywood", "wood"], name: "Timber / Plywood" },
  { keys: ["board", "gypsum board", "cement board"], name: "Board" },
  { keys: ["aggregate", "sand", "crushed"], name: "Aggregate" },
  { keys: ["pipe", "fitting", "upvc", "dn15", "dn20"], name: "Pipe & Fittings & Accessories" },
  { keys: ["cable", "tray", "trunking", "conduit"], name: "Cable Containment" },
];

function titleCase(value) {
  return String(value || "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (ch) => ch.toUpperCase());
}

export function matchCategory(text, categories = []) {
  const blob = String(text || "").toLowerCase();
  const hinted = CATEGORY_HINTS.find((row) => row.keys.some((key) => blob.includes(key)));
  if (hinted) {
    const exact = categories.find((c) => c.name === hinted.name);
    return exact ? exact.name : hinted.name;
  }
  const named = categories.find((c) => blob.includes(String(c.name || "").toLowerCase().split(",")[0]));
  return named ? named.name : "";
}

function parseLines(text, categories) {
  const lines = String(text || "")
    .split(/\r?\n|;|\u2022/)
    .map((line) => line.replace(/^[\s\-*\d.)]+/, "").trim())
    .filter((line) => line.length > 2 && !/^(item|qty|quantity|description|name|spec)$/i.test(line));
  return lines.slice(0, 12).map((line) => {
    const parts = line.split(/[,—–|]/).map((part) => part.trim()).filter(Boolean);
    const name = (parts[0] || line).slice(0, 90);
    const spec = parts.slice(1).join(" · ") || line;
    return {
      name,
      category: matchCategory(line, categories),
      spec,
    };
  });
}

function fromFilename(file, categories) {
  const stem = String(file.name || "").replace(/\.[^.]+$/, "");
  const name = titleCase(stem) || file.name;
  const kind = String(file.type || "").startsWith("image/") ? "image" : "document";
  return {
    name,
    category: matchCategory(`${stem} ${file.name}`, categories),
    spec: kind === "image" ? "From drawing / photo — confirm spec." : "From document — confirm spec.",
  };
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function fileKind(file) {
  const type = String(file?.type || "");
  const name = String(file?.name || "").toLowerCase();
  if (type.startsWith("image/") || /\.(png|jpe?g|gif|webp|heic)$/.test(name)) return "image";
  if (type.startsWith("text/") || /\.(txt|csv|md)$/.test(name)) return "text";
  return "document";
}

export async function extractSpecItems({ files = [], text = "", categories = [] } = {}) {
  await wait(700);
  const items = [];
  if (String(text || "").trim()) items.push(...parseLines(text, categories));
  for (const file of files.slice(0, 8)) {
    const kind = fileKind(file);
    if (kind === "text") {
      try {
        const content = await file.text();
        const parsed = parseLines(content, categories);
        if (parsed.length) items.push(...parsed);
        else items.push(fromFilename(file, categories));
      } catch {
        items.push(fromFilename(file, categories));
      }
    } else {
      items.push(fromFilename(file, categories));
    }
  }
  const unique = [];
  const seen = new Set();
  for (const item of items) {
    const key = `${item.name}|${item.spec}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push({
      id: `ex-${unique.length}-${Date.now().toString(36)}`,
      name: item.name,
      category: item.category || "",
      spec: item.spec || "",
    });
  }
  if (!unique.length) {
    unique.push({
      id: `ex-empty-${Date.now().toString(36)}`,
      name: "",
      category: "",
      spec: "",
    });
  }
  return unique;
}

export const SPEC_MAX_BYTES = 4 * 1024 * 1024;

const blobUrlCache = new Map();

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("read"));
    reader.readAsDataURL(file);
  });
}

function dataUrlToBlob(dataUrl) {
  const raw = String(dataUrl || "");
  const comma = raw.indexOf(",");
  const header = comma >= 0 ? raw.slice(0, comma) : "";
  const data = comma >= 0 ? raw.slice(comma + 1) : "";
  const mime = header.match(/data:([^;,]+)/)?.[1] || "application/octet-stream";
  if (header.includes(";base64")) {
    const binary = atob(data);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type: mime });
  }
  return new Blob([decodeURIComponent(data)], { type: mime });
}

export function openUrlForAttachment(file) {
  const src = String(file?.url || "");
  if (!src) return "";
  if (src.startsWith("blob:")) return src;
  if (!src.startsWith("data:")) return src;
  const key = `${file.name}|${file.size}|${src.length}|${file.type || ""}`;
  const cached = blobUrlCache.get(key);
  if (cached) return cached;
  try {
    const blobUrl = URL.createObjectURL(dataUrlToBlob(src));
    blobUrlCache.set(key, blobUrl);
    return blobUrl;
  } catch {
    return src;
  }
}

export async function fileToAttachment(file) {
  if (Number(file?.size) > SPEC_MAX_BYTES) {
    const err = new Error("too_large");
    err.code = "too_large";
    throw err;
  }
  const url = await readFileAsDataUrl(file);
  return {
    name: file.name,
    type: file.type || "",
    size: Number(file.size) || 0,
    kind: fileKind(file),
    url,
  };
}

export async function attachmentsFromFiles(files = [], pastedText = "") {
  const out = [];
  for (const file of (files || []).slice(0, 8)) {
    out.push(await fileToAttachment(file));
  }
  const excerpt = String(pastedText || "").trim();
  if (excerpt) {
    out.push({
      name: "pasted-spec.txt",
      type: "text/plain",
      size: excerpt.length,
      kind: "text",
      url: `data:text/plain;charset=utf-8,${encodeURIComponent(excerpt)}`,
    });
  }
  return out;
}
