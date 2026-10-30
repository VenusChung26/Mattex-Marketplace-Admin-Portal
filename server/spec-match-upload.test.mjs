import test from "node:test";
import assert from "node:assert/strict";
import * as XLSX from "xlsx";
import { handleSpecMatch, loadSpecUpload, specBlobUrl, specImageDataUrl } from "../api/spec-match.js";

const request = { headers: { get: () => "" } };
const blobUrl = "https://abc.public.blob.vercel-storage.com/rfq/specs/list.xlsx";

function workbook() {
  const book = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet([
    ["Item", "Qty"],
    ["Reinforcement mesh A142", "10"],
  ]);
  XLSX.utils.book_append_sheet(book, sheet, "Spec");
  return XLSX.write(book, { type: "buffer", bookType: "xlsx" });
}

test("only this site's blob host can be read back", () => {
  assert.equal(specBlobUrl(blobUrl), blobUrl);
  assert.equal(specBlobUrl("https://files.blob.vercel-storage.com/rfq/a.pdf"), "https://files.blob.vercel-storage.com/rfq/a.pdf");
  assert.equal(specBlobUrl("http://abc.public.blob.vercel-storage.com/a.pdf"), "");
  assert.equal(specBlobUrl("https://evil.example/a.pdf"), "");
  assert.equal(specBlobUrl("https://blob.vercel-storage.com.evil.example/a.pdf"), "");
  assert.equal(specBlobUrl("https://user:pass@abc.public.blob.vercel-storage.com/a.pdf"), "");
});

test("a large spec is read from its blob url", async () => {
  const bytes = workbook();
  const loaded = await loadSpecUpload(
    {
      name: "list.xlsx",
      mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      url: blobUrl,
    },
    async () => ({
      ok: true,
      headers: { get: () => String(bytes.length) },
      arrayBuffer: async () => bytes,
    })
  );
  assert.equal(Buffer.from(loaded.base64, "base64").length, bytes.length);
  const refused = await handleSpecMatch({ name: "list.xlsx", mime: "application/pdf", url: "https://evil.example/list.xlsx" }, request);
  assert.equal(refused.status, 400);
  assert.equal(refused.body.error, "file");
});

test("a blob url with a spreadsheet becomes match rows", async () => {
  const bytes = workbook();
  const previous = globalThis.fetch;
  globalThis.fetch = async (href) => {
    assert.equal(href, blobUrl);
    return {
      ok: true,
      headers: { get: () => String(bytes.length) },
      arrayBuffer: async () => bytes,
    };
  };
  try {
    const result = await handleSpecMatch(
      {
        name: "list.xlsx",
        mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        url: blobUrl,
      },
      request
    );
    assert.equal(result.status, 200);
    assert.equal(result.body.ok, true);
    assert.equal(result.body.error, undefined);
    assert.ok(result.body.rows.some((row) => /mesh/i.test(row.buyerName)));
  } finally {
    globalThis.fetch = previous;
  }
});

test("an oversized blob is not loaded", async () => {
  let called = false;
  const loaded = await loadSpecUpload(
    { name: "big.pdf", mime: "application/pdf", url: blobUrl.replace("list.xlsx", "big.pdf") },
    async () => {
      called = true;
      return {
        ok: true,
        headers: { get: () => String(21 * 1024 * 1024) },
        arrayBuffer: async () => {
          throw new Error("should not read the body");
        },
      };
    }
  );
  assert.equal(called, true);
  assert.equal(loaded.base64, undefined);
});

test("a short text line still becomes a row", async () => {
  const result = await handleSpecMatch({ name: "items.txt", mime: "text/plain", text: "Mesh" }, request);
  assert.equal(result.status, 200);
  assert.equal(result.body.unreadable, false);
  assert.equal(result.body.rows[0].buyerName, "Mesh");
});

test("a photo sent as base64 is ready for the model", () => {
  const url = specImageDataUrl({ mime: "image/jpeg", base64: "aGVsbG8=" });
  assert.equal(url.startsWith("data:image/jpeg;base64,"), true);
  assert.equal(specImageDataUrl({ mime: "application/pdf", base64: "aGVsbG8=" }), "");
});

test("a photo whose text is already extracted still becomes rows", async () => {
  const result = await handleSpecMatch(
    {
      name: "photo.jpg",
      mime: "image/jpeg",
      text: "Reinforcement mesh A142 qty 10",
    },
    request
  );
  assert.equal(result.status, 200);
  assert.equal(result.body.ok, true);
  assert.equal(result.body.unreadable, false);
  assert.ok(result.body.rows.some((row) => /mesh/i.test(row.buyerName)));
});

test("a greeting is not extracted as a product", async () => {
  const previousMatch = process.env.SPEC_MATCH_API_KEY;
  const previousOpen = process.env.OPENAI_API_KEY;
  delete process.env.SPEC_MATCH_API_KEY;
  delete process.env.OPENAI_API_KEY;
  try {
    const result = await handleSpecMatch(
      {
        name: "chat.txt",
        mime: "text/plain",
        text: "SSL Pacific LTD- Fanny\nPierre，早晨！\nT3 防火板 Wins H-Tec 1200x2400\n孔是否可以？及報價人\n8頁•PDF• 3 MB\n早晨Fanny，我check check，儘快幫你處理",
      },
      request
    );
    const names = (result.body.rows || []).map((row) => row.buyerName);
    assert.equal(result.status, 200);
    assert.equal(names.some((name) => /早晨/.test(name)), false);
    assert.ok(names.some((name) => /防火板/.test(name)));
  } finally {
    if (previousMatch == null) delete process.env.SPEC_MATCH_API_KEY;
    else process.env.SPEC_MATCH_API_KEY = previousMatch;
    if (previousOpen == null) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousOpen;
  }
});
