import test from "node:test";
import assert from "node:assert/strict";
import {
  filterTileEntries,
  optionCount,
  readTileQuery,
  sizeBucketId,
  tileEntries,
  tileFilterGroups,
  tileKindId,
  withTilePatch,
} from "../src/lib/tileBrowse.js";

test("nominal size buckets keep the real edge sizes", () => {
  assert.equal(sizeBucketId("600*600mm"), "600x600");
  assert.equal(sizeBucketId("600*1200*9mm"), "1200x600");
  assert.equal(sizeBucketId("300*300mm"), "400");
  assert.equal(sizeBucketId("<5 cm"), "400");
  assert.equal(sizeBucketId("1200*2700mm"), "2400");
  assert.equal(sizeBucketId("900*2700mm"), "");
  assert.equal(sizeBucketId("400*800mm"), "");
});

const ceramic = {
  id: "ceramic",
  name: "瓷磚, Ceramic Tile",
  specGroups: [
    { id: "tile-series", options: ["Stay Stone", "Alabama"] },
    {
      id: "tile-size",
      options: [
        { label: "600*600mm", parent: "Stay Stone", key: "Stay Stone::600*600mm" },
        { label: "600*1200mm", parent: "Stay Stone", key: "Stay Stone::600*1200mm" },
        { label: "800*800mm", parent: "Alabama", key: "Alabama::800*800mm" },
      ],
    },
    {
      id: "tile-slip",
      options: [
        { label: "R10", parent: "Stay Stone::600*600mm", key: "a" },
        { label: "R9", parent: "Alabama::800*800mm", key: "b" },
      ],
    },
  ],
};

test("ceramic filters use series, and pattern stays at zero", () => {
  const rows = tileEntries([ceramic, { id: "glass", name: "玻璃磚, Glass Tile" }], "ceramic");
  assert.equal(rows.length, 2);
  assert.equal(optionCount(rows, { pattern: [], colour: [], size: [], slip: [], type: [] }, "size", "600x600"), 1);
  assert.equal(optionCount(rows, { pattern: [], colour: [], size: [], slip: [], type: [] }, "pattern", "wood"), 0);
  const sized = filterTileEntries(rows, { pattern: [], colour: [], size: ["600x600", "800x800"], slip: [], type: [] });
  assert.deepEqual(sized.map((row) => row.view.name), ["Stay Stone", "Alabama"]);
  const both = filterTileEntries(rows, { pattern: [], colour: [], size: ["600x600"], slip: ["R10"], type: [] });
  assert.equal(both.length, 1);
  const missed = filterTileEntries(rows, { pattern: [], colour: [], size: ["600x600"], slip: ["R9"], type: [] });
  assert.equal(missed.length, 0);
  assert.equal(tileKindId({ name: "防滑瓷磚, Anti-slip Tile" }), "slip");
  assert.equal(tileKindId({ name: "過底磚, Homogenous Tile" }), "homogenous");
});

test("tactile tile lists size, thickness, patterns, colours, slip and standards", () => {
  assert.deepEqual(
    tileFilterGroups("tactile").map((group) => group.titleEn),
    ["Size", "Thickness", "Patterns", "Colours", "Slip Resistance", "Standards"]
  );
  const facets = { pattern: [], colour: [], size: [], slip: [], type: [], thickness: [], standard: [] };
  const rows = tileEntries([{
    id: "tactile",
    name: "觸覺引路磚, Tactile Tile",
    certifications: "BS 476 & ASTM C1028-96",
    specGroups: [{ id: "tile-rating", options: ["Truncated Domes", "Directional Bars"] }],
  }], "tactile");
  assert.equal(optionCount(rows, facets, "pattern", "domes"), 1);
  assert.equal(optionCount(rows, facets, "standard", "bs-476"), 1);
  assert.equal(optionCount(rows, facets, "standard", "astm-c1028"), 1);
  assert.equal(optionCount(rows, facets, "size", "300x300"), 0);
  assert.equal(optionCount(rows, facets, "thickness", "20"), 0);
  assert.equal(optionCount(rows, facets, "colour", "yellow"), 0);
  const both = filterTileEntries(rows, { ...facets, pattern: ["bars"], standard: ["bs-476"] });
  assert.equal(both.length, 1);
});

test("switching subcategory clears filters that do not apply", () => {
  const next = withTilePatch(
    { kind: "ceramic", pattern: ["wood"], colour: ["grey"], size: ["600x600"], slip: ["R10"], type: [], sizeCustom: true, slipCustom: true },
    { kind: "roof" }
  );
  assert.deepEqual(next.pattern, []);
  assert.deepEqual(next.size, []);
  assert.equal(next.sizeCustom, false);
  assert.equal(next.slipCustom, false);
  const params = new URLSearchParams("kind=mosaic&slip=R7");
  assert.deepEqual(readTileQuery(params).slip, []);
  assert.equal(readTileQuery(new URLSearchParams("kind=glass&sizeCustom=1")).sizeCustom, false);
  assert.equal(readTileQuery(new URLSearchParams("kind=ceramic&sizeCustom=1")).sizeCustom, true);
  assert.equal(readTileQuery(new URLSearchParams(""), { optional: true }).kind, "");
});
