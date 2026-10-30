import test from "node:test";
import assert from "node:assert/strict";
import { circledFromPdf, findInkCircles } from "../api/circled.js";
import { isProductDescription } from "../src/lib/buyerLine.js";
import { handleSpecMatch } from "../api/spec-match.js";

const request = { headers: { get: () => "" } };

test("a product description keeps materials and drops locations and headings", () => {
  assert.equal(isProductDescription("Gypsum board 12.5mm"), true);
  assert.equal(isProductDescription("A142 reinforcement mesh"), true);
  assert.equal(isProductDescription("Concrete Plinth"), true);
  assert.equal(isProductDescription("thermal insulation board"), true);
  assert.equal(isProductDescription("石膏板"), true);
  assert.equal(isProductDescription("Landscape deck"), false);
  assert.equal(isProductDescription("Archives Repository"), false);
  assert.equal(isProductDescription("PARTITIONING"), false);
  assert.equal(isProductDescription("Concrete Works"), false);
  assert.equal(isProductDescription("Amount (HK$)"), false);
  assert.equal(isProductDescription("Date:July 2026"), false);
  assert.equal(isProductDescription("Inner wall surfaces"), false);
  assert.equal(isProductDescription("Insulation shall be continuous with the vapour-control"), false);
  assert.equal(isProductDescription("and air-sealing strategy of the repository"), false);
  assert.equal(isProductDescription("pipe penetrations"), false);
});

test("a coloured ring is a circle and a filled stamp is not", () => {
  const width = 240;
  const height = 180;
  const data = Buffer.alloc(width * height * 3, 255);
  const cx = 120;
  const cy = 90;
  const rx = 70;
  const ry = 40;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const dx = (x - cx) / rx;
      const dy = (y - cy) / ry;
      const distance = Math.sqrt(dx * dx + dy * dy);
      if (distance > 0.9 && distance < 1.05) {
        const i = (y * width + x) * 3;
        data[i] = 220;
        data[i + 1] = 20;
        data[i + 2] = 20;
      }
    }
  }
  const circles = findInkCircles(data, width, height, 3);
  assert.equal(circles.length, 1);
  assert.ok(circles[0].left < cx && circles[0].left + circles[0].width > cx);
  assert.ok(circles[0].top < cy && circles[0].top + circles[0].height > cy);

  const stamp = Buffer.alloc(width * height * 3, 255);
  for (let y = 40; y < 140; y += 1) {
    for (let x = 40; x < 160; x += 1) {
      const i = (y * width + x) * 3;
      stamp[i] = 200;
      stamp[i + 1] = 20;
      stamp[i + 2] = 20;
    }
  }
  assert.equal(findInkCircles(stamp, width, height, 3).length, 0);
});

async function circledPdf() {
  const mupdf = await import("mupdf");
  const doc = new mupdf.PDFDocument();
  const font = new mupdf.Font("Times-Roman");
  const fontObj = doc.addSimpleFont(font);
  const contents = "BT /F1 12 Tf 40 160 Td (Landscape deck) Tj 0 -50 Td (Gypsum board 12.5mm) Tj ET";
  const pageObj = doc.addPage([0, 0, 320, 220], 0, { Font: { F1: fontObj } }, contents);
  doc.insertPage(-1, pageObj);
  const page = doc.loadPage(0);
  const annot = page.createAnnotation("Circle");
  annot.setRect([28, 90, 250, 145]);
  return Buffer.from(doc.saveToBuffer().asUint8Array());
}

test("a red ring drawn on the page keeps only the line inside it", async () => {
  const mupdf = await import("mupdf");
  const doc = new mupdf.PDFDocument();
  const font = doc.addSimpleFont(new mupdf.Font("Times-Roman"));
  const contents = "BT /F1 12 Tf 40 160 Td (Landscape deck) Tj 0 -50 Td (Gypsum board 12.5mm) Tj ET 1 0 0 RG 3 w 30 95 220 50 re S";
  doc.insertPage(-1, doc.addPage([0, 0, 320, 220], 0, { Font: { F1: font } }, contents));
  const bytes = Buffer.from(doc.saveToBuffer().asUint8Array());
  const found = await circledFromPdf(bytes);
  assert.equal(found.marked, true);
  assert.equal(found.text, "Gypsum board 12.5mm");
});

test("a circled PDF line is the only extracted item", async () => {
  const bytes = await circledPdf();
  const found = await circledFromPdf(bytes);
  assert.equal(found.marked, true);
  assert.match(found.text, /Gypsum board 12\.5mm/);
  assert.doesNotMatch(found.text, /Landscape deck/);

  const result = await handleSpecMatch({
    name: "circled.pdf",
    mime: "application/pdf",
    base64: bytes.toString("base64"),
  }, request);
  assert.equal(result.body.circled, true);
  assert.deepEqual(result.body.rows.map((row) => row.buyerName), ["Gypsum board 12.5mm"]);
  assert.equal(result.body.rows[0].circled, true);
});
