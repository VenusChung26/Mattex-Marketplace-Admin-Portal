/** Text the buyer circled, boxed, or highlighted on a spec file. */

const MARK_TYPES = new Set(["Circle", "Ink", "Square", "Polygon", "Highlight", "Underline", "Squiggly"]);

function isMarkPixel(r, g, b) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max - min < 45 || max < 110) return false;
  if (r > 150 && r > g + 40 && r > b + 40) return true;
  if (b > 130 && b > r + 30 && b > g + 20) return true;
  if (g > 130 && g > r + 30 && g > b + 20) return true;
  if (r > 170 && g > 140 && b < 130 && r + g > b * 3) return true;
  if (r > 160 && b > 120 && g < 140 && r > g + 30 && b > g + 10) return true;
  return false;
}

function dilate(mask, width, height) {
  const next = new Uint8Array(mask);
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const p = y * width + x;
      if (!mask[p]) continue;
      next[p - 1] = 1;
      next[p + 1] = 1;
      next[p - width] = 1;
      next[p + width] = 1;
    }
  }
  return next;
}

/** Coloured pen rings on a raster. Filled stamps and thin underlines are not circles. */
export function findInkCircles(data, width, height, channels) {
  if (!width || !height || !data?.length) return [];
  const mask = new Uint8Array(width * height);
  let count = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * channels;
      if (!isMarkPixel(data[i] || 0, data[i + 1] || 0, data[i + 2] || 0)) continue;
      mask[y * width + x] = 1;
      count += 1;
    }
  }
  if (count < 60 || count > width * height * 0.15) return [];
  const ink = dilate(mask, width, height);
  const seen = new Uint8Array(width * height);
  const circles = [];
  for (let start = 0; start < ink.length; start += 1) {
    if (!ink[start] || seen[start]) continue;
    const stack = [start];
    seen[start] = 1;
    const pixels = [];
    let minX = width;
    let minY = height;
    let maxX = 0;
    let maxY = 0;
    while (stack.length) {
      const p = stack.pop();
      pixels.push(p);
      const x = p % width;
      const y = (p / width) | 0;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
      if (pixels.length > 24000) break;
      const steps = [1, -1, width, -width, width + 1, width - 1, -width + 1, -width - 1];
      for (const step of steps) {
        const q = p + step;
        if (q < 0 || q >= ink.length || seen[q] || !ink[q]) continue;
        const nx = q % width;
        if (Math.abs(nx - x) > 1) continue;
        seen[q] = 1;
        stack.push(q);
      }
    }
    const boxW = maxX - minX + 1;
    const boxH = maxY - minY + 1;
    if (boxW < 36 || boxH < 18 || boxW > width * 0.96 || boxH > height * 0.96) continue;
    const aspect = boxW / boxH;
    if (aspect < 0.18 || aspect > 8) continue;
    const area = boxW * boxH;
    if (pixels.length / area > 0.42) continue;
    const band = Math.max(3, Math.round(Math.min(boxW, boxH) * 0.2));
    let border = 0;
    for (const p of pixels) {
      const x = p % width;
      const y = (p / width) | 0;
      if (x - minX <= band || maxX - x <= band || y - minY <= band || maxY - y <= band) border += 1;
    }
    if (border / pixels.length < 0.6) continue;
    circles.push({ left: minX, top: minY, width: boxW, height: boxH });
  }
  circles.sort((a, b) => b.width * b.height - a.width * a.height);
  return circles.slice(0, 8);
}

function annotationRects(page) {
  if (typeof page.getAnnotations !== "function") return [];
  const bounds = page.getBounds();
  const pageW = Math.abs(bounds[2] - bounds[0]) || 1;
  const pageH = Math.abs(bounds[3] - bounds[1]) || 1;
  const rects = [];
  for (const annot of page.getAnnotations()) {
    let type = "";
    try {
      type = annot.getType();
    } catch {
      type = "";
    }
    if (!MARK_TYPES.has(type)) continue;
    const rect = annot.getRect();
    const w = Math.abs(rect[2] - rect[0]);
    const h = Math.abs(rect[3] - rect[1]);
    if (w < 8 || h < 8) continue;
    if (w > pageW * 0.94 && h > pageH * 0.94) continue;
    rects.push(rect);
  }
  return rects;
}

function quadCenter(quad) {
  const xs = [quad[0], quad[2], quad[4], quad[6]];
  const ys = [quad[1], quad[3], quad[5], quad[7]];
  return {
    x: (Math.min(...xs) + Math.max(...xs)) / 2,
    y: (Math.min(...ys) + Math.max(...ys)) / 2,
  };
}

function contains(rect, x, y) {
  const left = Math.min(rect[0], rect[2]) - 2;
  const right = Math.max(rect[0], rect[2]) + 2;
  const bottom = Math.min(rect[1], rect[3]) - 2;
  const top = Math.max(rect[1], rect[3]) + 2;
  return x >= left && x <= right && y >= bottom && y <= top;
}

export function textInside(page, rects) {
  if (!rects.length) return [];
  const lines = [];
  const text = page.toStructuredText("preserve-whitespace");
  let current = "";
  text.walk({
    beginLine() {
      current = "";
    },
    onChar(rune, _origin, _font, _size, quad) {
      const { x, y } = quadCenter(quad);
      if (rects.some((rect) => contains(rect, x, y))) current += rune;
    },
    endLine() {
      const line = current.replace(/\s+/g, " ").trim();
      if (line) lines.push(line);
    },
  });
  return lines;
}

/** Image y grows downward from the top of the page. PDF y grows upward. */
export function pixelBoxToPdf(box, bounds, scale) {
  const [x0, , , y1] = bounds;
  const left = x0 + box.left / scale;
  const right = x0 + (box.left + box.width) / scale;
  const top = y1 - box.top / scale;
  const bottom = y1 - (box.top + box.height) / scale;
  return [left, bottom, right, top];
}

export function pdfBoxToPixel(rect, bounds, scale, width, height) {
  const [x0, , , y1] = bounds;
  const left = Math.max(0, Math.floor((Math.min(rect[0], rect[2]) - x0) * scale));
  const right = Math.min(width, Math.ceil((Math.max(rect[0], rect[2]) - x0) * scale));
  const top = Math.max(0, Math.floor((y1 - Math.max(rect[1], rect[3])) * scale));
  const bottom = Math.min(height, Math.ceil((y1 - Math.min(rect[1], rect[3])) * scale));
  const boxW = Math.max(1, right - left);
  const boxH = Math.max(1, bottom - top);
  const insetX = Math.min(8, Math.floor(boxW * 0.06));
  const insetY = Math.min(8, Math.floor(boxH * 0.08));
  return {
    left: Math.min(width - 1, left + insetX),
    top: Math.min(height - 1, top + insetY),
    width: Math.max(1, boxW - insetX * 2),
    height: Math.max(1, boxH - insetY * 2),
  };
}

async function inkRectsOnPng(png) {
  const sharpMod = await import("sharp");
  const sharp = sharpMod.default;
  const resized = await sharp(png).resize({ width: 900, withoutEnlargement: true }).png().toBuffer();
  const { data, info } = await sharp(resized).raw().toBuffer({ resolveWithObject: true });
  const boxes = findInkCircles(data, info.width, info.height, info.channels);
  return { resized, info, boxes };
}

export async function circledFromPdf(buffer) {
  const mupdf = await import("mupdf");
  const doc = mupdf.Document.openDocument(buffer, "application/pdf");
  const count = Math.min(doc.countPages(), 8);
  const lines = [];
  const crops = [];
  let marked = false;
  for (let index = 0; index < count; index += 1) {
    const page = doc.loadPage(index);
    const markup = annotationRects(page);
    let rects = markup;
    const bounds = page.getBounds();
    const scale = 1.5;
    let png = null;
    if (!rects.length && index < 3) {
      const pixmap = page.toPixmap(mupdf.Matrix.scale(scale, scale), mupdf.ColorSpace.DeviceRGB, false, true);
      png = Buffer.from(pixmap.asPNG());
      const found = await inkRectsOnPng(png);
      const pageW = Math.abs(bounds[2] - bounds[0]) || 1;
      const drawn = pageW * scale;
      const fit = found.info.width / drawn;
      rects = found.boxes.map((box) => pixelBoxToPdf({
        left: box.left / fit,
        top: box.top / fit,
        width: box.width / fit,
        height: box.height / fit,
      }, bounds, scale));
      if (rects.length) png = found.resized;
    }
    if (!rects.length) continue;
    const pageLines = textInside(page, rects);
    if (!markup.length && !pageLines.length) {
      const plain = page.toStructuredText("preserve-whitespace").asText();
      if (String(plain || "").trim().length > 40) continue;
    }
    marked = true;
    if (pageLines.length) {
      lines.push(...pageLines);
      continue;
    }
    if (!png) {
      const pixmap = page.toPixmap(mupdf.Matrix.scale(scale, scale), mupdf.ColorSpace.DeviceRGB, false, false);
      png = Buffer.from(pixmap.asPNG());
    }
    const sharpMod = await import("sharp");
    const meta = await sharpMod.default(png).metadata();
    const width = meta.width || 1;
    const height = meta.height || 1;
    const pageW = Math.abs(bounds[2] - bounds[0]) || 1;
    const pixelScale = width / pageW;
    for (const rect of rects) {
      const box = pdfBoxToPixel(rect, bounds, pixelScale, width, height);
      crops.push(await sharpMod.default(png).extract(box).png().toBuffer());
    }
  }
  return { marked, text: lines.join("\n").slice(0, 20000), crops };
}

export async function circledCropsFromImage(buffer) {
  const found = await inkRectsOnPng(buffer);
  if (!found.boxes.length) return [];
  const sharpMod = await import("sharp");
  const sharp = sharpMod.default;
  const crops = [];
  for (const box of found.boxes) {
    const insetX = Math.min(8, Math.floor(box.width * 0.06));
    const insetY = Math.min(8, Math.floor(box.height * 0.08));
    crops.push(await sharp(found.resized).extract({
      left: box.left + insetX,
      top: box.top + insetY,
      width: Math.max(1, box.width - insetX * 2),
      height: Math.max(1, box.height - insetY * 2),
    }).png().toBuffer());
  }
  return crops;
}
