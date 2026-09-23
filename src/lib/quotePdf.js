const PAGE_W = 1240;
const PAGE_H = 1754;
const MARGIN = 72;
const A4_PT_W = 595.28;
const A4_PT_H = 841.89;

function wrapText(ctx, text, maxWidth) {
  const value = String(text || "").trim() || "-";
  const words = value.split(/\s+/);
  const lines = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (ctx.measureText(next).width <= maxWidth) {
      current = next;
      continue;
    }
    if (current) lines.push(current);
    if (ctx.measureText(word).width <= maxWidth) {
      current = word;
      continue;
    }
    let chunk = "";
    for (const ch of word) {
      const trial = chunk + ch;
      if (ctx.measureText(trial).width <= maxWidth) chunk = trial;
      else {
        if (chunk) lines.push(chunk);
        chunk = ch;
      }
    }
    current = chunk;
  }
  if (current) lines.push(current);
  return lines.length ? lines : ["-"];
}

function makePageCanvas() {
  const canvas = document.createElement("canvas");
  canvas.width = PAGE_W;
  canvas.height = PAGE_H;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, PAGE_W, PAGE_H);
  ctx.fillStyle = "#143528";
  ctx.fillRect(0, 0, PAGE_W, 18);
  return { canvas, ctx };
}

function drawHeader(ctx, { kind, count, page, totalPages, refNo }) {
  const isBuy = kind === "buy";
  ctx.fillStyle = "#143528";
  ctx.font = "700 22px 'PingFang TC', 'Noto Sans TC', sans-serif";
  ctx.fillText("Mattex Marketplace", MARGIN, 64);
  ctx.font = "600 36px 'Songti TC', 'Noto Serif TC', serif";
  ctx.fillText(isBuy ? "現貨訂單清單" : "報價清單", MARGIN, 118);
  if (refNo) {
    ctx.textAlign = "right";
    ctx.fillStyle = "#5b6660";
    ctx.font = "500 16px 'PingFang TC', 'Noto Sans TC', sans-serif";
    ctx.fillText(isBuy ? "訂單編號" : "RFQ 編號", PAGE_W - MARGIN, 92);
    ctx.fillStyle = "#143528";
    ctx.font = "700 26px 'PingFang TC', 'Noto Sans TC', sans-serif";
    ctx.fillText(String(refNo), PAGE_W - MARGIN, 126);
    ctx.textAlign = "left";
  }
  ctx.font = "400 18px 'PingFang TC', 'Noto Sans TC', sans-serif";
  ctx.fillStyle = "#5b6660";
  const date = new Date().toLocaleDateString("zh-HK", { year: "numeric", month: "short", day: "numeric" });
  ctx.fillText(`${count} 項 · ${date} · ${page}/${totalPages}`, MARGIN, 150);
  ctx.strokeStyle = "#d6ddd8";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(MARGIN, 168);
  ctx.lineTo(PAGE_W - MARGIN, 168);
  ctx.stroke();
}

function drawFooter(ctx, kind) {
  const outro = kind === "buy" ? "請確認庫存及單價，謝謝。" : "請提供交貨期及單價，謝謝。";
  ctx.fillStyle = "#5b6660";
  ctx.font = "400 16px 'PingFang TC', 'Noto Sans TC', sans-serif";
  ctx.fillText(outro, MARGIN, PAGE_H - 48);
}

const THUMB = 120;
const THUMB_GAP = 20;

function itemLayout(item) {
  const hasImg = Boolean(item.imageEl);
  const labelX = hasImg ? MARGIN + 44 + THUMB + THUMB_GAP : MARGIN + 48;
  const valueX = labelX + 120;
  const nameWidth = PAGE_W - MARGIN - valueX;
  return { hasImg, labelX, valueX, nameWidth };
}

function itemHeight(ctx, item) {
  const { nameWidth } = itemLayout(item);
  const nameLines = wrapText(ctx, item.name, nameWidth);
  const specLines = item.spec ? wrapText(ctx, `規格／備註: ${item.spec}`, nameWidth + 120) : [];
  const attachLines = item.attachments ? wrapText(ctx, `附件: ${item.attachments}`, nameWidth + 120) : [];
  const textH =
    (nameLines.length + 3) * 28 +
    (specLines.length ? specLines.length * 24 + 8 : 0) +
    (attachLines.length ? attachLines.length * 24 + 8 : 0) +
    28;
  return Math.max(textH, item.imageEl ? THUMB + 24 : 0);
}

function drawThumb(ctx, imageEl, x, y) {
  ctx.fillStyle = "#f6f7f5";
  ctx.fillRect(x, y, THUMB, THUMB);
  const scale = Math.min(THUMB / imageEl.width, THUMB / imageEl.height);
  const w = Math.max(1, imageEl.width * scale);
  const h = Math.max(1, imageEl.height * scale);
  ctx.drawImage(imageEl, x + (THUMB - w) / 2, y + (THUMB - h) / 2, w, h);
  ctx.strokeStyle = "#d6ddd8";
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, THUMB - 1, THUMB - 1);
}

function drawItem(ctx, item, y) {
  const { hasImg, labelX, valueX, nameWidth } = itemLayout(item);
  const nameLines = wrapText(ctx, item.name, nameWidth);
  const specLines = item.spec ? wrapText(ctx, `規格／備註: ${item.spec}`, nameWidth + 120) : [];
  const attachLines = item.attachments ? wrapText(ctx, `附件: ${item.attachments}`, nameWidth + 120) : [];
  ctx.fillStyle = "#143528";
  ctx.font = "700 22px 'PingFang TC', 'Noto Sans TC', sans-serif";
  ctx.fillText(`${item.index}.`, MARGIN, y);
  if (hasImg) drawThumb(ctx, item.imageEl, MARGIN + 40, y - 18);
  const rows = [
    ["貨名", nameLines],
    ["貨號", [item.sku]],
    ["數量", [item.qty]],
    ["單價", [item.price]],
  ];
  let cursor = y;
  ctx.font = "500 18px 'PingFang TC', 'Noto Sans TC', sans-serif";
  for (const [label, lines] of rows) {
    ctx.fillStyle = "#5b6660";
    ctx.fillText(label, labelX, cursor);
    ctx.fillStyle = "#121816";
    for (const line of lines) {
      ctx.fillText(line, valueX, cursor);
      cursor += 28;
    }
  }
  if (specLines.length) {
    cursor += 4;
    ctx.fillStyle = "#5b6660";
    ctx.font = "400 16px 'PingFang TC', 'Noto Sans TC', sans-serif";
    for (const line of specLines) {
      ctx.fillText(line, labelX, cursor);
      cursor += 24;
    }
  }
  if (attachLines.length) {
    cursor += specLines.length ? 0 : 4;
    ctx.fillStyle = "#5b6660";
    ctx.font = "400 16px 'PingFang TC', 'Noto Sans TC', sans-serif";
    for (const line of attachLines) {
      ctx.fillText(line, labelX, cursor);
      cursor += 24;
    }
  }
  const bottom = Math.max(cursor, hasImg ? y - 18 + THUMB : cursor);
  ctx.strokeStyle = "#eceeea";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(MARGIN, bottom + 8);
  ctx.lineTo(PAGE_W - MARGIN, bottom + 8);
  ctx.stroke();
  return bottom + 28;
}

function paginateItems(ctx, items) {
  const pages = [];
  let current = [];
  let used = 188;
  for (const item of items) {
    ctx.font = "500 18px 'PingFang TC', 'Noto Sans TC', sans-serif";
    const height = itemHeight(ctx, item);
    if (current.length && used + height > PAGE_H - 88) {
      pages.push(current);
      current = [];
      used = 188;
    }
    current.push(item);
    used += height;
  }
  if (current.length) pages.push(current);
  return pages.length ? pages : [[]];
}

function renderPages({ kind, items, refNo }) {
  const probe = makePageCanvas().ctx;
  const groups = paginateItems(probe, items);
  return groups.map((group, index) => {
    const { canvas, ctx } = makePageCanvas();
    drawHeader(ctx, { kind, count: items.length, page: index + 1, totalPages: groups.length, refNo });
    ctx.font = "500 18px 'PingFang TC', 'Noto Sans TC', sans-serif";
    let y = 208;
    for (const item of group) y = drawItem(ctx, item, y);
    drawFooter(ctx, kind);
    return canvas;
  });
}

function loadPdfImage(src) {
  const value = String(src || "").trim();
  if (!value) return Promise.resolve(null);
  return new Promise((resolve) => {
    const img = new Image();
    if (!value.startsWith("data:")) img.crossOrigin = "anonymous";
    const timer = window.setTimeout(() => resolve(null), 4000);
    img.onload = () => {
      window.clearTimeout(timer);
      resolve(img);
    };
    img.onerror = () => {
      window.clearTimeout(timer);
      resolve(null);
    };
    img.src = value;
  });
}

function canvasToJpeg(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("pdf-jpeg"));
          return;
        }
        blob.arrayBuffer().then((buffer) => {
          resolve({ bytes: new Uint8Array(buffer), w: canvas.width, h: canvas.height });
        }, reject);
      },
      "image/jpeg",
      0.88
    );
  });
}

function concatBytes(parts) {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function jpegsToPdf(images) {
  const encoder = new TextEncoder();
  const parts = [];
  const offsets = [];
  let size = 0;

  function add(raw) {
    const bytes = typeof raw === "string" ? encoder.encode(raw) : raw;
    parts.push(bytes);
    size += bytes.length;
  }

  function mark() {
    offsets.push(size);
  }

  add("%PDF-1.4\n");
  mark();
  add("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");
  mark();
  const pageRefs = images.map((_, i) => `${3 + i * 3} 0 R`).join(" ");
  add(`2 0 obj\n<< /Type /Pages /Count ${images.length} /Kids [${pageRefs}] >>\nendobj\n`);

  images.forEach((image, i) => {
    const pageNum = 3 + i * 3;
    const imgNum = pageNum + 1;
    const contentNum = pageNum + 2;
    mark();
    add(
      `${pageNum} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${A4_PT_W} ${A4_PT_H}] /Resources << /XObject << /Im${i + 1} ${imgNum} 0 R >> >> /Contents ${contentNum} 0 R >>\nendobj\n`
    );
    mark();
    add(
      `${imgNum} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${image.w} /Height ${image.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${image.bytes.length} >>\nstream\n`
    );
    add(image.bytes);
    add("\nendstream\nendobj\n");
    mark();
    const content = `q ${A4_PT_W} 0 0 ${A4_PT_H} 0 0 cm /Im${i + 1} Do Q`;
    add(`${contentNum} 0 obj\n<< /Length ${content.length} >>\nstream\n${content}\nendstream\nendobj\n`);
  });

  const xrefStart = size;
  add(`xref\n0 ${offsets.length + 1}\n0000000000 65535 f \n`);
  for (const offset of offsets) {
    add(`${String(offset).padStart(10, "0")} 00000 n \n`);
  }
  add(`trailer\n<< /Size ${offsets.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`);
  return concatBytes(parts);
}

export async function buildQuotePdf({ kind, items, refNo }) {
  const prepared = await Promise.all(
    (Array.isArray(items) ? items : []).map(async (item) => ({
      ...item,
      imageEl: await loadPdfImage(item.image),
    }))
  );
  const pages = renderPages({ kind, items: prepared, refNo });
  const jpegs = [];
  for (const canvas of pages) jpegs.push(await canvasToJpeg(canvas));
  const bytes = jpegsToPdf(jpegs);
  const stamp = new Date().toISOString().slice(0, 10);
  const slug = String(refNo || "").replace(/[^\w.-]+/g, "") || stamp;
  const filename = kind === "buy" ? `mattex-order-${slug}.pdf` : `mattex-quote-${slug}.pdf`;
  const blob = new Blob([bytes], { type: "application/pdf" });
  const file = new File([blob], filename, { type: "application/pdf" });
  return { blob, file, filename, url: URL.createObjectURL(blob) };
}

export function downloadBlob(blob, filename) {
  const href = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = href;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(href), 4000);
}

export function canSharePdfFile(file) {
  try {
    return Boolean(navigator.share && navigator.canShare && file && navigator.canShare({ files: [file] }));
  } catch {
    return false;
  }
}

export async function sharePdfFile(file, text) {
  if (!canSharePdfFile(file)) return false;
  try {
    await navigator.share({ files: [file], title: file.name, text });
    return true;
  } catch (error) {
    if (error?.name === "AbortError") return true;
    return false;
  }
}
