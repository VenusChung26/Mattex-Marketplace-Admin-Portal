/** Tile and vinyl list filters. Types are multi-select. A facet shows only when every selected type has it. */
import { homogenousColorGroup } from "./homogenousColors.js";

const PATTERNS = [
  { id: "wood", zh: "木紋磚", en: "Wood-grain Tile" },
  { id: "stone", zh: "石紋磚 / 雲石紋磚", en: "Stone / Marble-grain Tile" },
  { id: "cement", zh: "水泥紋磚", en: "Cement-grain Tile" },
  { id: "slate", zh: "板岩磚", en: "Slate Tile" },
  { id: "slab", zh: "岩板 / 大板磚", en: "Sintered / Large Slab" },
  { id: "bath", zh: "浴室磚", en: "Bathroom Tile" },
  { id: "kitchen", zh: "廚房磚", en: "Kitchen Tile" },
  { id: "living", zh: "客廳地磚 / 地台磚", en: "Living Room / Floor Tile" },
  { id: "feature", zh: "特色牆磚", en: "Feature Wall Tile" },
  { id: "outdoor", zh: "外牆磚 / 戶外地磚", en: "Exterior / Outdoor Tile" },
  { id: "decor", zh: "花磚 / 六角磚 / 魚骨磚", en: "Pattern / Hexagon / Herringbone Tile" },
];

const COLOURS = [
  { id: "grey", zh: "灰色 Grey", en: "Grey" },
  { id: "beige", zh: "米色 Beige", en: "Beige" },
  { id: "timber", zh: "木色 Timber", en: "Timber" },
  { id: "white", zh: "白色 White", en: "White" },
  { id: "black", zh: "黑色 Black", en: "Black" },
  { id: "brown", zh: "啡色 Brown", en: "Brown" },
  { id: "blue", zh: "藍色 Blue", en: "Blue" },
  { id: "green", zh: "綠色 Green", en: "Green" },
  { id: "red", zh: "紅色 Red", en: "Red" },
  { id: "multi", zh: "多色 / 其他 Multicolour / Others", en: "Multicolour / Others" },
];

const PAVING_COLOURS = [
  { id: "grey", zh: "灰色 Grey", en: "Grey" },
  { id: "red", zh: "紅色 Red", en: "Red" },
  { id: "dark-grey", zh: "深灰 Dark Grey", en: "Dark Grey" },
  { id: "natural", zh: "混凝土本色 Natural Concrete", en: "Natural Concrete" },
];

const SIZE_SQUARE = [
  { id: "600x600", zh: "600 x 600", en: "600 x 600" },
  { id: "800x800", zh: "800 x 800", en: "800 x 800" },
  { id: "900x900", zh: "900 x 900", en: "900 x 900" },
  { id: "1200x1200", zh: "1200 x 1200", en: "1200 x 1200" },
];

const SIZE_RECT = [
  { id: "600x300", zh: "600 x 300", en: "600 x 300" },
  { id: "1200x150", zh: "1200 x 150", en: "1200 x 150" },
  { id: "1200x198", zh: "1200 x 198", en: "1200 x 198" },
  { id: "1200x200", zh: "1200 x 200", en: "1200 x 200" },
  { id: "1197x597", zh: "1197 x 597", en: "1197 x 597" },
  { id: "1200x600", zh: "1200 x 600", en: "1200 x 600" },
  { id: "1500x750", zh: "1500 x 750", en: "1500 x 750" },
  { id: "1800x900", zh: "1800 x 900", en: "1800 x 900" },
  { id: "400", zh: "400 x 400 或以下", en: "400 x 400 and below" },
  { id: "2400", zh: "2400 x 1200 或以上", en: "2400 x 1200 and above" },
];

const SLIP = ["R9", "R10", "R11", "R12"].map((id) => ({ id, zh: id, en: id }));
const SLIP_ANTI = ["R7", "R8", "R9", "R10", "R11", "R12"].map((id) => ({ id, zh: id, en: id }));

const TACTILE = [
  { id: "domes", zh: "圓點 Truncated Domes", en: "Truncated Domes" },
  { id: "bars", zh: "導向條 Directional Bars", en: "Directional Bars" },
];

const TACTILE_SIZES = [
  { id: "200x200", zh: "200 x 200", en: "200 x 200" },
  { id: "300x300", zh: "300 x 300", en: "300 x 300" },
  { id: "400x400", zh: "400 x 400", en: "400 x 400" },
  { id: "300x600", zh: "300 x 600", en: "300 x 600" },
];

const TACTILE_THICKNESS = [
  { id: "10", zh: "10 mm", en: "10 mm" },
  { id: "15", zh: "15 mm", en: "15 mm" },
  { id: "20", zh: "20 mm", en: "20 mm" },
  { id: "25", zh: "25 mm", en: "25 mm" },
];

const TACTILE_COLOURS = [
  { id: "yellow", zh: "黃色 Yellow", en: "Yellow" },
  { id: "grey", zh: "灰色 Grey", en: "Grey" },
  { id: "black", zh: "黑色 Black", en: "Black" },
  { id: "red", zh: "紅色 Red", en: "Red" },
];

const TACTILE_STANDARDS = [
  { id: "bs-476", zh: "BS 476", en: "BS 476", match: /BS\s*476/i },
  { id: "astm-c1028", zh: "ASTM C1028", en: "ASTM C1028", match: /ASTM\s*C\s*1028/i },
];

export const TILE_KINDS = [
  { id: "ceramic", zh: "瓷磚", en: "Ceramic Tile", filters: ["pattern", "colour", "size", "slip"] },
  { id: "homogenous", zh: "過底磚", en: "Homogenous Tile", filters: ["slip"] },
  { id: "marble", zh: "天然大理石磚", en: "Natural Marble Tiles", filters: ["size", "slip"] },
  { id: "roof", zh: "天面磚", en: "Roof Tile", filters: ["slip"] },
  { id: "mosaic", zh: "馬賽克磚", en: "Mosaic Tile", filters: ["size"] },
  { id: "slip", zh: "防滑瓷磚", en: "Anti-slip Tile", filters: ["slip-anti"] },
  { id: "tactile", zh: "觸覺引路磚", en: "Tactile Tile", filters: ["tactile-size", "thickness", "tactile-pattern", "tactile-colour", "slip", "standard"] },
  { id: "glass", zh: "玻璃磚", en: "Glass Tile", filters: [] },
  { id: "metal", zh: "金屬磚", en: "Metal Tile", filters: [] },
  { id: "cork", zh: "軟木磚", en: "Cork Tile", filters: [] },
  { id: "acoustic", zh: "隔音磚", en: "Acoustic Tile", filters: [] },
  { id: "paving", zh: "預製混凝土地磚", en: "Precast Concrete Paving", filters: ["paving-colour"] },
];

const KIND_IDS = new Set(TILE_KINDS.map((kind) => kind.id));
const VINYL_KIND = "vinyl";
export const VINYL_CATEGORY_ID = "flooring-system-vinyl-floor";
const FACET_KEYS = ["pattern", "colour", "size", "slip", "type", "thickness", "standard", "code", "vcolor", "fire", "vsize"];

const VINYL_CODES = [
  { id: "f2", label: "Homogeneous Non-Directional (F2)", zh: "同質無方向 (F2)", en: "Homogeneous Non-Directional (F2)" },
  { id: "f2a", label: "Homogeneous Electico (F2a)", zh: "同質導電 (F2a)", en: "Homogeneous Electico (F2a)" },
  { id: "f2b", label: "Homogeneous Acoustic Vinyl (F2b)", zh: "同質隔音 (F2b)", en: "Homogeneous Acoustic Vinyl (F2b)" },
  { id: "f2d", label: "Homogeneous Directional (F2d)", zh: "同質有方向 (F2d)", en: "Homogeneous Directional (F2d)" },
];
const VINYL_CODE_BY_ID = new Map(VINYL_CODES.map((row) => [row.id, row]));
const VINYL_COLOR_WHEN = (homogenousColorGroup().when || []).map(String);
const VINYL_COLOR_OPTIONS = (homogenousColorGroup().options || []).map((option) => ({
  id: String(option.key || option.label || ""),
  zh: option.zh || option.label || "",
  en: option.en || option.label || "",
  image: option.image || "",
}));

function kindById(id) {
  return TILE_KINDS.find((kind) => kind.id === id) || TILE_KINDS[0];
}

export function kindLabel(kind) {
  const row = typeof kind === "string" ? kindById(kind) : kind;
  return `${row.zh}, ${row.en}`;
}

function optionText(option) {
  if (option && typeof option === "object") return String(option.label || option.key || "");
  return String(option || "");
}

function optionParent(option) {
  return option && typeof option === "object" ? String(option.parent || "") : "";
}

function optionKey(option) {
  if (option && typeof option === "object") return String(option.key || option.label || "");
  return String(option || "");
}

export function tileKindId(product) {
  const name = String(product?.name || "");
  if (/玻璃磚|glass tile/i.test(name)) return "glass";
  if (/金屬磚|metal tile/i.test(name)) return "metal";
  if (/軟木磚|cork tile/i.test(name)) return "cork";
  if (/隔音磚|acoustic tile/i.test(name)) return "acoustic";
  if (/預製混凝土地磚|precast concrete paving/i.test(name)) return "paving";
  if (/觸覺引路磚|tactile tile/i.test(name)) return "tactile";
  if (/馬賽克|mosaic tile/i.test(name)) return "mosaic";
  if (/防滑瓷磚|anti-slip|ceramic tiles r7/i.test(name)) return "slip";
  if (/天面磚|屋面瓦|roof tile/i.test(name)) return "roof";
  if (/天然大理石|natural marble/i.test(name)) return "marble";
  if (/過底磚|通體磚|homogenous tile/i.test(name)) return "homogenous";
  if (/瓷磚|ceramic tile/i.test(name)) return "ceramic";
  return "";
}

/** Real millimetre sizes fall into the nominal buckets. Unmatched sizes stay visible until a size is checked. */
export function sizeBucketId(label) {
  const text = String(label || "").trim();
  const cm = text.match(/^<\s*(\d+(?:\.\d+)?)\s*cm$/i);
  if (cm) return Number(cm[1]) * 10 <= 400 ? "400" : "";
  const nums = text.replace(/[x×]/gi, "*").match(/\d+(?:\.\d+)?/g);
  if (!nums || nums.length < 2) return "";
  const width = Math.min(Number(nums[0]), Number(nums[1]));
  const height = Math.max(Number(nums[0]), Number(nums[1]));
  if (!width || !height) return "";
  const exact = [
    [600, 600, "600x600"],
    [800, 800, "800x800"],
    [900, 900, "900x900"],
    [1200, 1200, "1200x1200"],
    [300, 600, "600x300"],
    [150, 1200, "1200x150"],
    [198, 1200, "1200x198"],
    [200, 1200, "1200x200"],
    [597, 1197, "1197x597"],
    [600, 1200, "1200x600"],
    [750, 1500, "1500x750"],
    [900, 1800, "1800x900"],
  ];
  for (const [x, y, id] of exact) {
    if (Math.abs(width - x) < 1 && Math.abs(height - y) < 1) return id;
  }
  if (height <= 400 && width <= 400) return "400";
  if (height >= 2400 && width >= 1200) return "2400";
  return "";
}

function slipId(label) {
  const text = String(label || "").trim().toUpperCase();
  return /^R\d{1,2}$/.test(text) ? text : "";
}

function pavingColourId(label) {
  const text = String(label || "").trim().toLowerCase();
  if (text === "dark grey") return "dark-grey";
  if (text === "natural concrete") return "natural";
  if (text === "grey") return "grey";
  if (text === "red") return "red";
  return "";
}

function tactileId(label) {
  const text = String(label || "");
  if (/truncated domes|圓點/i.test(text)) return "domes";
  if (/directional bars|導向條/i.test(text)) return "bars";
  return "";
}

function groupOptions(product, id) {
  return (product?.specGroups || []).find((group) => group?.id === id)?.options || [];
}

function seriesNames(product) {
  return groupOptions(product, "tile-series").map(optionText).filter(Boolean);
}

export function seriesDisplayGroups(product, seriesName, bucketIds = []) {
  const groups = product?.specGroups || [];
  const seriesGroup = groups.find((group) => group?.id === "tile-series");
  const sizeGroup = groups.find((group) => group?.id === "tile-size");
  let sizes = (sizeGroup?.options || []).filter((option) => optionParent(option) === seriesName);
  if (bucketIds.length) sizes = sizes.filter((option) => bucketIds.includes(sizeBucketId(optionText(option))));
  const sizeKeys = new Set(sizes.map(optionKey));
  const next = [];
  if (seriesGroup) next.push({ ...seriesGroup, options: [seriesName] });
  if (sizes.length) next.push({ ...sizeGroup, options: sizes });
  for (const id of ["tile-surface", "tile-slip"]) {
    const group = groups.find((item) => item?.id === id);
    if (!group) continue;
    const options = (group.options || []).filter((option) => sizeKeys.has(optionParent(option)));
    if (options.length) next.push({ ...group, options });
  }
  return next;
}

function collectSizes(product, seriesName) {
  const buckets = new Set();
  const sizes = seriesName
    ? groupOptions(product, "tile-size").filter((option) => optionParent(option) === seriesName)
    : [...groupOptions(product, "marble-size"), ...groupOptions(product, "mosaic-size"), ...groupOptions(product, "tile-size")];
  for (const option of sizes) {
    const bucket = sizeBucketId(optionText(option));
    if (bucket) buckets.add(bucket);
  }
  return buckets;
}

function collectSlips(product, seriesName) {
  const ratings = new Set();
  const groups = seriesName ? ["tile-slip"] : ["tile-slip", "tile-rating", "slip-rating", "marble-kind"];
  for (const id of groups) {
    for (const option of groupOptions(product, id)) {
      if (seriesName && id === "tile-slip" && !String(optionParent(option)).startsWith(`${seriesName}::`)) continue;
      const rating = slipId(optionText(option));
      if (rating) ratings.add(rating);
    }
  }
  return ratings;
}

function collectColours(product) {
  const colours = new Set();
  for (const option of groupOptions(product, "paving-colour")) {
    const id = pavingColourId(optionText(option));
    if (id) colours.add(id);
  }
  return colours;
}

function collectTactilePatterns(product) {
  const patterns = new Set();
  for (const option of groupOptions(product, "tile-rating")) {
    const id = tactileId(optionText(option));
    if (id) patterns.add(id);
  }
  return patterns;
}

function productBlob(product) {
  return [
    product?.certifications,
    product?.standard,
    ...(Array.isArray(product?.specs) ? product.specs : []),
  ].join(" ");
}

function collectStandards(product) {
  const blob = productBlob(product);
  const ids = new Set();
  for (const item of TACTILE_STANDARDS) {
    if (item.match.test(blob)) ids.add(item.id);
  }
  return ids;
}

function collectTypes(product) {
  const types = new Set();
  for (const option of groupOptions(product, "tile-rating")) {
    const id = tactileId(optionText(option));
    if (id) types.add(id);
  }
  return types;
}

function viewOf(product, { name = "", matchLabel = "", groups = null, hideSpecGroups = [] } = {}) {
  return {
    ...product,
    name: name || product.name,
    matchLabel,
    specGroups: groups || product.specGroups,
    hideSpecGroups,
  };
}

export function tileEntries(products, kindId) {
  const kind = kindById(kindId);
  const rows = [];
  for (const product of products || []) {
    if (tileKindId(product) !== kind.id) continue;
    if (kind.id === "ceramic") {
      for (const series of seriesNames(product)) {
        rows.push({
          key: `${product.id}:${series}`,
          product,
          view: viewOf(product, {
            name: series,
            matchLabel: series,
            groups: seriesDisplayGroups(product, series),
            hideSpecGroups: ["tile-series"],
          }),
          sizes: collectSizes(product, series),
          slips: collectSlips(product, series),
          colours: new Set(),
          patterns: new Set(),
          types: new Set(),
        });
      }
      continue;
    }
    rows.push({
      key: product.id,
      product,
      view: viewOf(product),
      sizes: collectSizes(product),
      slips: collectSlips(product),
      colours: collectColours(product),
      patterns: collectTactilePatterns(product),
      thickness: new Set(),
      standards: collectStandards(product),
      types: collectTypes(product),
    });
  }
  return rows;
}

function selected(list) {
  return Array.isArray(list) ? list.filter(Boolean) : [];
}

function matchesFacets(entry, facets) {
  if (selected(facets.pattern).length && !selected(facets.pattern).some((id) => entry.patterns.has(id))) return false;
  if (selected(facets.colour).length && !selected(facets.colour).some((id) => entry.colours.has(id))) return false;
  if (selected(facets.size).length && !selected(facets.size).some((id) => entry.sizes.has(id))) return false;
  if (selected(facets.slip).length && !selected(facets.slip).some((id) => entry.slips.has(id))) return false;
  if (selected(facets.type).length && !selected(facets.type).some((id) => entry.types.has(id))) return false;
  if (selected(facets.thickness).length && !selected(facets.thickness).some((id) => entry.thickness?.has(id))) return false;
  if (selected(facets.standard).length && !selected(facets.standard).some((id) => entry.standards?.has(id))) return false;
  return true;
}

export function filterTileEntries(entries, facets) {
  return (entries || []).filter((entry) => matchesFacets(entry, facets || {}));
}

export function optionCount(entries, facets, group, optionId) {
  return filterTileEntries(entries, { ...(facets || {}), [group]: [optionId] }).length;
}

function knownIds(options) {
  return new Set((options || []).map((option) => option.id));
}

export function tileFilterGroups(kindId) {
  const kind = kindById(kindId);
  const groups = [];
  for (const filter of kind.filters) {
    if (filter === "pattern") {
      groups.push({ id: "pattern", titleZh: "紋", titleEn: "Pattern", options: PATTERNS });
    } else if (filter === "colour") {
      groups.push({ id: "colour", titleZh: "色調", titleEn: "Colour Tone", options: COLOURS });
    } else if (filter === "paving-colour") {
      groups.push({ id: "colour", titleZh: "色調", titleEn: "Colour Tone", options: PAVING_COLOURS });
    } else if (filter === "size") {
      groups.push({
        id: "size",
        titleZh: "尺寸",
        titleEn: "Nominal Size (mm)",
        sections: [
          { titleZh: "方形 Square", titleEn: "Square", options: SIZE_SQUARE },
          { titleZh: "長方形 Rectangular", titleEn: "Rectangular", options: SIZE_RECT },
        ],
        options: [...SIZE_SQUARE, ...SIZE_RECT],
        customized: "size",
      });
    } else if (filter === "slip" || filter === "slip-anti") {
      groups.push({
        id: "slip",
        titleZh: "防滑",
        titleEn: "Slip Resistance",
        options: filter === "slip-anti" ? SLIP_ANTI : SLIP,
        customized: "slip",
      });
    } else if (filter === "type") {
      groups.push({ id: "type", titleZh: "類型", titleEn: "Type", options: TACTILE });
    } else if (filter === "tactile-size") {
      groups.push({ id: "size", titleZh: "尺寸", titleEn: "Size", options: TACTILE_SIZES, customized: "size" });
    } else if (filter === "thickness") {
      groups.push({ id: "thickness", titleZh: "厚度", titleEn: "Thickness", options: TACTILE_THICKNESS });
    } else if (filter === "tactile-pattern") {
      groups.push({ id: "pattern", titleZh: "紋", titleEn: "Patterns", options: TACTILE });
    } else if (filter === "tactile-colour") {
      groups.push({ id: "colour", titleZh: "顏色", titleEn: "Colours", options: TACTILE_COLOURS });
    } else if (filter === "standard") {
      groups.push({
        id: "standard",
        titleZh: "標準",
        titleEn: "Standards",
        options: TACTILE_STANDARDS.map(({ id, zh, en }) => ({ id, zh, en })),
      });
    }
  }
  return groups;
}

function allowedFacetIds(kindValue, state) {
  const allowed = {};
  for (const key of FACET_KEYS) allowed[key] = new Set();
  for (const group of commonFilterGroups(parseKinds(kindValue), state)) {
    allowed[group.id] = knownIds(group.options);
  }
  return allowed;
}

function customFlags(kindValue, state) {
  const flags = new Set();
  for (const group of commonFilterGroups(parseKinds(kindValue), state)) {
    if (group.customized) flags.add(group.customized);
  }
  return flags;
}

function vinylCodeGroup() {
  return { id: "code", titleZh: "編號", titleEn: "Code", options: VINYL_CODES };
}

function vinylFilterGroups(state) {
  const selectedCodes = selected(state?.code).map((id) => VINYL_CODE_BY_ID.get(id)?.label).filter(Boolean);
  const colorOn = !selectedCodes.length || selectedCodes.some((label) => VINYL_COLOR_WHEN.includes(label));
  const groups = [vinylCodeGroup()];
  if (colorOn) {
    groups.push({ id: "vcolor", titleZh: "顏色", titleEn: "Colour", options: VINYL_COLOR_OPTIONS, swatch: true });
  }
  groups.push(
    { id: "slip", titleZh: "防滑", titleEn: "Slip Resistance", options: ["R9", "R10", "R11"].map((id) => ({ id, zh: id, en: id })) },
    { id: "fire", titleZh: "防火反應", titleEn: "Reaction to Fire", options: [{ id: "b1", zh: "B1", en: "B1" }] },
    {
      id: "vsize",
      titleZh: "尺寸",
      titleEn: "Size",
      options: [
        { id: "roll", zh: "2.0mm x 2m x 20m", en: "2.0mm x 2m x 20m" },
        { id: "custom", zh: "自訂尺寸", en: "Customize Size" },
      ],
    },
  );
  return groups;
}

function groupsForKind(kindId, state) {
  if (kindId === VINYL_KIND) return vinylFilterGroups(state);
  return tileFilterGroups(kindId);
}

export function commonFilterGroups(kinds, state) {
  const lists = (kinds || []).map((kindId) => groupsForKind(kindId, state));
  if (!lists.length) return [];
  const ids = lists[0].map((group) => group.id).filter((id) => lists.every((list) => list.some((group) => group.id === id)));
  return ids.map((id) => {
    const members = lists.map((list) => list.find((group) => group.id === id));
    const options = [];
    const seen = new Set();
    for (const member of members) {
      for (const option of member.options || []) {
        if (seen.has(option.id)) continue;
        seen.add(option.id);
        options.push(option);
      }
    }
    const customized = members.every((member) => member.customized) ? members[0].customized : "";
    return {
      id,
      titleZh: members[0].titleZh,
      titleEn: members[0].titleEn,
      options,
      swatch: members.every((member) => member.swatch),
      customized,
      sections: members.length === 1 ? members[0].sections : undefined,
    };
  });
}

export function listTypes(products) {
  const present = new Set();
  let vinyl = false;
  for (const product of products || []) {
    const kind = tileKindId(product);
    if (kind) present.add(kind);
    if (isVinylFloor(product)) vinyl = true;
  }
  const types = TILE_KINDS.filter((kind) => present.has(kind.id)).map((kind) => ({ id: kind.id, zh: kind.zh, en: kind.en }));
  if (vinyl) types.push({ id: VINYL_KIND, zh: "乙烯基地板", en: "Vinyl Floor" });
  return types;
}

function cleanList(value, allowed) {
  const raw = Array.isArray(value) ? value : String(value || "").split(",");
  const seen = new Set();
  const next = [];
  for (const item of raw) {
    const id = String(item || "").trim();
    if (!id || !allowed?.has(id) || seen.has(id)) continue;
    seen.add(id);
    next.push(id);
  }
  return next;
}

export function emptyTileQuery() {
  return {
    kind: "ceramic",
    pattern: [],
    colour: [],
    size: [],
    slip: [],
    type: [],
    thickness: [],
    standard: [],
    code: [],
    vcolor: [],
    fire: [],
    vsize: [],
    sizeCustom: false,
    slipCustom: false,
  };
}

export function parseKinds(value) {
  const seen = new Set();
  const kinds = [];
  for (const part of String(value || "").split(",")) {
    const id = part.trim();
    if ((!KIND_IDS.has(id) && id !== VINYL_KIND) || seen.has(id)) continue;
    seen.add(id);
    kinds.push(id);
  }
  return kinds;
}

export function isVinylFloor(product) {
  return /乙烯基地板|flooring system - vinyl floor|膠地板,\s*vinyl/i.test(`${product?.name || ""} ${product?.category || ""}`);
}

function flagOn(value) {
  return value === true || value === "1" || value === 1;
}

function normalizeTileState(state, { clearCustom = false } = {}) {
  const next = { ...emptyTileQuery(), ...(state || {}) };
  next.kind = parseKinds(next.kind).join(",");
  if (clearCustom) {
    next.sizeCustom = false;
    next.slipCustom = false;
  }
  const codeGroup = commonFilterGroups(parseKinds(next.kind), { code: [] }).some((group) => group.id === "code");
  next.code = cleanList(next.code, codeGroup ? new Set(VINYL_CODES.map((row) => row.id)) : new Set());
  const allowed = allowedFacetIds(next.kind, next);
  for (const key of FACET_KEYS) {
    if (key === "code") continue;
    next[key] = cleanList(next[key], allowed[key]);
  }
  const custom = customFlags(next.kind, next);
  next.sizeCustom = custom.has("size") && flagOn(next.sizeCustom);
  next.slipCustom = custom.has("slip") && flagOn(next.slipCustom);
  return next;
}

export function readTileQuery(params, { optional = false } = {}) {
  const requested = String(params?.get?.("kind") || "");
  const kinds = parseKinds(requested);
  if (!kinds.length) return { ...emptyTileQuery(), kind: optional ? "" : "ceramic" };
  const base = { ...emptyTileQuery(), kind: kinds.join(",") };
  for (const key of FACET_KEYS) base[key] = params?.get?.(key) || [];
  base.sizeCustom = params?.get?.("sizeCustom");
  base.slipCustom = params?.get?.("slipCustom");
  return normalizeTileState(base);
}

export function withTilePatch(state, patch) {
  const next = { ...emptyTileQuery(), ...(state || {}), ...(patch || {}) };
  const kindChanged = Boolean(patch && Object.prototype.hasOwnProperty.call(patch, "kind") && String(patch.kind) !== String(state?.kind || ""));
  return normalizeTileState(next, { clearCustom: kindChanged });
}

const TILE_QUERY_KEYS = ["kind", ...FACET_KEYS, "sizeCustom", "slipCustom", "sizeNote", "slipNote"];

export function tileSearchParams(state, current) {
  const params = new URLSearchParams(current || "");
  const next = withTilePatch(state, {});
  for (const key of TILE_QUERY_KEYS) params.delete(key);
  if (!next.kind) return params;
  params.set("kind", next.kind);
  for (const key of FACET_KEYS) {
    if (next[key].length) params.set(key, next[key].join(","));
  }
  if (next.sizeCustom) params.set("sizeCustom", "1");
  if (next.slipCustom) params.set("slipCustom", "1");
  return params;
}

export function clearTileSearchParams(current) {
  const params = new URLSearchParams(current || "");
  for (const key of TILE_QUERY_KEYS) params.delete(key);
  return params;
}

/** Per-product text entered from the Customized button. Empty lines stay off the quote. */
export function tileProductNote(note, lang, state) {
  const lines = [];
  const size = String(note?.size || "").trim();
  const slip = String(note?.slip || "").trim();
  if (state?.sizeCustom && size) lines.push(lang === "en" ? `Customized size: ${size}` : `自訂尺寸：${size}`);
  if (state?.slipCustom && slip) lines.push(lang === "en" ? `Customized slip: ${slip}` : `自訂防滑：${slip}`);
  return lines.join("\n");
}

const VINYL_SIZE_LABEL = { roll: "2.0mm x 2m x 20m", custom: "Customize Size" };
const VINYL_FIRE_LABEL = { b1: "B1" };

function specLabels(product, groupId) {
  const group = (product?.specGroups || []).find((item) => item?.id === groupId);
  return (group?.options || []).map((option) => optionText(option));
}

function hasAnyLabel(labels, wanted) {
  if (!wanted.length) return true;
  return wanted.some((label) => labels.includes(label));
}

export function vinylMatches(product, state) {
  if (!isVinylFloor(product)) return false;
  const codes = selected(state?.code).map((id) => VINYL_CODE_BY_ID.get(id)?.label).filter(Boolean);
  if (!hasAnyLabel(specLabels(product, "vinyl-code"), codes)) return false;
  if (!hasAnyLabel(specLabels(product, "vinyl-slip"), selected(state?.slip))) return false;
  if (!hasAnyLabel(specLabels(product, "vinyl-fire"), selected(state?.fire).map((id) => VINYL_FIRE_LABEL[id] || id))) return false;
  if (!hasAnyLabel(specLabels(product, "vinyl-size"), selected(state?.vsize).map((id) => VINYL_SIZE_LABEL[id] || id))) return false;
  const colors = selected(state?.vcolor);
  if (colors.length) {
    if (codes.length && !codes.some((label) => VINYL_COLOR_WHEN.includes(label))) return false;
    const keys = specLabels(product, "tile-color");
    const ids = ((product?.specGroups || []).find((group) => group?.id === "tile-color")?.options || []).map((option) => String(option?.key || option?.label || ""));
    if (!colors.some((id) => ids.includes(id) || keys.includes(id))) return false;
  }
  return true;
}

/** Null means no type is selected, so the caller keeps the full list. */
export function applyListFilter(products, state) {
  const kinds = parseKinds(state?.kind);
  if (!kinds.length) return null;
  const entries = [];
  for (const kind of kinds) {
    if (kind === VINYL_KIND) {
      for (const product of products || []) {
        if (!vinylMatches(product, state)) continue;
        entries.push({ key: product.id, product, grouped: false, hideSpecGroups: [] });
      }
      continue;
    }
    const rows = filterTileEntries(tileEntries(products, kind), state).map((entry) => applySizeBuckets(entry, state.size));
    for (const entry of rows) {
      entries.push({
        key: entry.key,
        product: entry.view,
        grouped: false,
        hideSpecGroups: entry.view.hideSpecGroups || [],
      });
    }
  }
  return entries;
}

export function vinylFacetsActive(state) {
  return ["code", "vcolor", "slip", "fire", "vsize"].some((key) => selected(state?.[key]).length);
}

export function listOptionCount(products, state, groupId, optionId) {
  const rows = applyListFilter(products, { ...state, [groupId]: [optionId] });
  return rows ? rows.length : 0;
}

export function applySizeBuckets(entry, bucketIds) {
  if (!bucketIds?.length || !entry?.view?.matchLabel) return entry;
  return {
    ...entry,
    view: {
      ...entry.view,
      specGroups: seriesDisplayGroups(entry.product, entry.view.matchLabel, bucketIds),
    },
  };
}
