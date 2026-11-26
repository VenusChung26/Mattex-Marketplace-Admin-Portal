import { homogenousColorGroup } from "../src/lib/homogenousColors.js";
import { drainageUpvcBySku } from "./upvc-drainage.js";

/**
 * Public-safe catalog output.
 *
 * Staff (Portal) read the full product. Everyone else gets the product without internal fields,
 * and with import notes moved out of the buyer-facing `remark`.
 */

export const INTERNAL_PRODUCT_FIELDS = ["refPrice", "deliveryFee", "sourceUrl", "internalNote"];

const INTERNAL_NOTE_LINE =
  /(local website material|provisional sku|requires confirmation|split basis|copied from|confirm for|does not publish|prc row)/i;

const FACTORY_PICKUP_LEAD_OLD =
  "Self-pickup within the factory, loading assistance, excluding unloading (excluding freight); Delivery at the project site, including unloading (including freight)";
const FACTORY_PICKUP_LEAD =
  "Factory pickup: loading included, freight extra. Site delivery includes freight and unloading.";

export function splitRemark(remark) {
  const pub = [];
  const internal = [];
  for (const line of String(remark || "").split(/\r?\n/)) {
    (INTERNAL_NOTE_LINE.test(line) ? internal : pub).push(line);
  }
  return { remark: pub.join("\n").trim(), internalNote: internal.join("\n").trim() };
}

export function toPublicProduct(product) {
  if (!product || typeof product !== "object") return product;
  const next = { ...product };
  const { remark } = splitRemark(next.remark);
  if (remark) next.remark = remark;
  else delete next.remark;
  for (const key of INTERNAL_PRODUCT_FIELDS) delete next[key];
  const listed = next.listedPrice === true && Number(next.unit_price) > 0;
  delete next.listedPrice;
  if (listed) {
    next.unit_price = Math.round(Number(next.unit_price) * 100) / 100;
    next.priceUponRequest = false;
  } else {
    next.unit_price = null;
    next.priceUponRequest = true;
  }
  const rawLead = String(product.leadTimeLabel || product.lead_time || "").trim();
  const pickupLead = rawLead === FACTORY_PICKUP_LEAD || rawLead === FACTORY_PICKUP_LEAD_OLD
    ? FACTORY_PICKUP_LEAD
    : "From 4 days.";
  next.leadTimeLabel = pickupLead;
  next.lead_time = pickupLead;
  next.leadTime = pickupLead === "From 4 days." ? { min: 4, max: 4 } : product.leadTime || null;
  return next;
}

const XPS_SPEC_GROUPS = [
  { id: "rating", label: "分類 1", labelEn: "Category 1", options: ["B1", "B2"] },
  {
    id: "size",
    label: "分類 2",
    labelEn: "Category 2",
    options: [
      "1200x600x50",
      "1800x600x50",
      "2400x1200x50",
      "1200x600x75",
      "1800x600x75",
      "2400x1200x75",
      "1200x600x100",
      "1800x600x100",
      "2400x1200x100",
      "1200x600x10",
      "2400x1200x10",
      "2400x1200x25",
      "1250x600x20",
      "1250x600x25",
      "1250x600x40",
      "1250x600x50",
      "1250x600x75",
      "1250x600x100",
      "Customize",
    ],
  },
];

const ENVELOPE_CATEGORY = "建築外牆、保溫及防水, Building Envelope, Insulation & Waterproofing";

const GENERIC_OPTION = new Set([
  "customize",
  "customization",
  "customize size",
  "customize drawing upload",
  "paint",
  "dowel bar",
  "aggregates",
  "cable",
  "raised access floors",
  "aluminum cladding",
  "shoe washing machines",
]);

function looseKey(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[×x*]/g, "x")
    .replace(/\s+/g, "")
    .replace(/mm\b/g, "");
}

function optionText(option) {
  return String(typeof option === "string" ? option : option?.label || "").trim();
}

function orderFacts(product) {
  const specs = (Array.isArray(product?.specs) ? product.specs : []).map((line) => String(line).trim()).filter(Boolean);
  const sizeLine = specs.find((line) => /^size\s*:/i.test(line));
  const size = String(product?.sizeDesc || "").trim();
  const detail = (sizeLine ? sizeLine.replace(/^size\s*:\s*/i, "").trim() : "") || size;
  const description = String(product?.description || "").trim();
  const facts = {};
  facts.unit_price = Number(product?.unit_price) > 0 ? Number(product.unit_price) : null;
  if (detail) facts.detail = detail;
  if (description && description !== detail && description !== size) facts.summary = description;
  const sku = String(product?.productNo || "").trim();
  if (sku) facts.sku = sku.toUpperCase();
  if (product?.moq != null && product.moq !== "") facts.moq = product.moq;
  if (product?.unit) facts.unit = product.unit;
  if (product?.leadTime) facts.leadTime = product.leadTime;
  if (product?.leadTimeLabel) facts.leadTimeLabel = product.leadTimeLabel;
  if (specs.length) facts.specs = specs;
  return facts;
}

function rowMatchesLabel(row, label) {
  const text = String(label || "").trim();
  const key = looseKey(text);
  if (!key || GENERIC_OPTION.has(text.toLowerCase())) return false;
  const size = looseKey(String(row?.sizeDesc || "").split("\n")[0]);
  const variant = looseKey(row?.variant);
  const parent = looseKey(row?.parentProduct);
  const name = looseKey(row?.name);
  if (size && size === key) return true;
  if (variant && variant === key) return true;
  if (parent && parent === key) return true;
  if (key.length >= 6 && (name.includes(key) || variant.includes(key) || parent.includes(key))) return true;
  const head = looseKey(text.split(/[·—–]/)[0]);
  if (head && head.length >= 3 && (name.startsWith(head) || variant.startsWith(head))) return true;
  if (/^[a-z]{1,4}\d{1,4}[a-z]?$/i.test(text.replace(/\s+/g, ""))) {
    const blob = `${row?.variant || ""} ${row?.parentProduct || ""} ${row?.name || ""}`;
    return new RegExp(`(^|[^a-z0-9])${text.replace(/\s+/g, "")}([^a-z0-9]|$)`, "i").test(blob);
  }
  return false;
}

function buildSpecChoices(rows, groups) {
  const choices = [];
  for (const row of rows || []) {
    const picks = {};
    for (const group of groups || []) {
      const hits = [];
      for (const option of group.options || []) {
        const label = optionText(option);
        if (rowMatchesLabel(row, label)) hits.push(label);
      }
      if (hits.length === 1) picks[group.id] = hits[0];
    }
    if (!Object.keys(picks).length) continue;
    choices.push({ picks, ...orderFacts(row) });
  }
  return choices;
}

function rememberSource(base, rows) {
  if (!base) return base;
  const choices = buildSpecChoices(rows, base.specGroups);
  if (choices.length) base.specChoices = choices;
  return base;
}

function isXpsBoard(product) {
  const sku = String(product?.productNo || "");
  return /^MKT-XFB-\d+$/i.test(sku) || /^MKT-LOC-SKWY1HCL-/i.test(sku);
}

export function foldXpsFoamBoard(products) {
  const boards = [];
  const rest = [];
  for (const product of products || []) {
    if (isXpsBoard(product)) boards.push(product);
    else rest.push(product);
  }
  if (!boards.length) return products || [];
  boards.sort((a, b) => String(a.productNo).localeCompare(String(b.productNo)));
  const foam = boards.find((product) => /^MKT-XFB-/i.test(String(product.productNo || "")));
  const base = { ...(foam || boards[0]) };
  base.name = "XPS Foam Board";
  base.category = ENVELOPE_CATEGORY;
  base.sizeDesc = "";
  base.description = "";
  base.primarySpec = "";
  base.parentProduct = "";
  base.variant = "";
  base.specGroups = XPS_SPEC_GROUPS;
  rememberSource(base, boards);
  return [...rest, base];
}

const MESH_CATEGORY = "密目防燃安全網, Dense Mesh Flame Retardant Safety Net";

const MESH_SPEC_GROUPS = [
  { id: "colour", label: "顏色", labelEn: "Colour", options: ["Orange", "Green", "Customize"] },
  {
    id: "mesh-size",
    label: "分類 2",
    labelEn: "Category 2",
    options: ["4x9m", "1.5x6m", "2x8m", "4x10m", "4x15m", "2x18m"],
  },
];

export function foldDenseMesh(products) {
  const nets = [];
  const rest = [];
  for (const product of products || []) {
    if (String(product?.category || "") === MESH_CATEGORY) nets.push(product);
    else rest.push(product);
  }
  if (!nets.length) return products || [];
  nets.sort((a, b) => String(a.productNo || "").localeCompare(String(b.productNo || "")));
  const base = { ...(nets.find((product) => product.productNo === "MKT-DMF-0001") || nets[0]) };
  base.name = MESH_CATEGORY;
  base.sizeDesc = "";
  base.parentProduct = "";
  base.variant = "";
  base.specGroups = MESH_SPEC_GROUPS;
  rememberSource(base, nets);
  return [...rest, base];
}

const PRECAST_CATEGORY = "預製混凝土, Precasted Concrete";

const KERB_TYPES = ["K1", "K2", "K3", "K4", "K5", "K6", "K7", "K8", "K9", "K10", "K11", "K12", "K13", "K14", "E1", "E2", "E3"];

const PRECAST_FOLDS = [
  {
    kind: "kerb",
    preferNo: "MKT-LOC-V549EWHM-001",
    name: "預製混凝土路壆 -Precast Concrete Kerb",
    unit: "No",
    shopCategoryId: "precast-concrete-kerb",
    groups: [
      { id: "kerb-type", label: "類型", labelEn: "Type", keepOrder: true, options: KERB_TYPES },
      { id: "kerb-length", label: "長度", labelEn: "Length", keepOrder: true, customUnit: "m", options: ["0.5m", "0.75m", "1m", "2m", "Customize"] },
      { id: "kerb-grade", label: "等級", labelEn: "Grade", keepOrder: true, options: ["20", "30"] },
    ],
  },
  {
    kind: "paving",
    preferNo: "MKT-LOC-E4AP0EXL-001",
    name: "預製混凝土鋪路磚 Precast Concrete Paving Block",
    unit: "No",
    shopCategoryId: "precast-concrete-paving-block",
    cert: "H5102A 200*100*60 or 80\nH5101A 225*112.5*60 or 80",
    aliases: ["預製混凝土地磚", "Precast Concrete Paving"],
    groups: [
      { id: "paving-size", label: "尺寸", labelEn: "Size", keepOrder: true, options: ["200 x 100"] },
      { id: "paving-thickness", label: "厚度", labelEn: "Thickness", keepOrder: true, options: ["60mm", "80mm"] },
      { id: "paving-colour", label: "顏色", labelEn: "Colour", customText: true, options: ["Grey", "Red", "Dark Grey", "Natural Concrete", "Customize"] },
    ],
  },
  {
    kind: "slabs",
    preferNo: "MKT-PC-0009",
    name: "預製混凝土板, Precast Concrete Slabs",
    unit: "件",
    shopCategoryId: "precast-concrete-slabs",
    dropCert: [/QSPSC\s*:\s*2014(?:\s*\([^)]*\))?/gi],
    groups: [
      {
        id: "slab-size",
        label: "分類 1",
        labelEn: "Category 1",
        options: [
          "3000x500x120",
          "3300x500x120",
          "3600x500x120",
          "3900x500x120",
          "4200x500x120",
          "3000x600x120",
          "3300x600x120",
          "3600x600x120",
          "3900x600x120",
          "4200x600x120",
          "3000x500x150",
          "3300x500x150",
          "3600x500x150",
          "3900x500x150",
          "4200x500x150",
          "3000x600x150",
          "3300x600x150",
          "3600x600x150",
          "3900x600x150",
          "4200x600x150",
          "Customize Size",
        ],
      },
    ],
  },
  {
    kind: "lintel",
    preferNo: "MKT-LOC-EJ0U6128-001",
    name: "預製混凝土楣樑, Precast Concrete Lintel",
    unit: "No",
    shopCategoryId: "precast-concrete-lintel",
    clearText: true,
    groups: [{ id: "lintel-grade", label: "等級", labelEn: "Grade", keepOrder: true, options: ["35/20", "20/20"] }],
  },
];

function precastKind(product) {
  if (String(product?.category || "") !== PRECAST_CATEGORY) return "";
  const parent = String(product.parentProduct || "");
  if (parent === "Precast Concrete Kerb" || /^Type [KE]\d+ Kerb$/.test(parent)) return "kerb";
  if (parent === "Precast Concrete Paving") return "paving";
  if (parent === "Precast Concrete Slabs") return "slabs";
  if (parent === "Precast Concrete Lintel") return "lintel";
  return "";
}

function foldedPrecast(list, spec) {
  if (!list.length) return null;
  list.sort((a, b) => String(a.productNo || "").localeCompare(String(b.productNo || "")));
  const base = { ...(list.find((product) => product.productNo === spec.preferNo) || list[0]) };
  base.name = spec.name;
  base.category = PRECAST_CATEGORY;
  if (spec.shopCategoryId) base.shopCategoryId = spec.shopCategoryId;
  base.sizeDesc = "";
  base.parentProduct = "";
  base.variant = "";
  base.specGroups = spec.groups;
  if (spec.clearText) {
    base.description = "";
    base.primarySpec = "";
  }
  if (spec.unit) {
    base.unit = spec.unit;
    base.salesUnit = spec.unit;
    base.specs = (Array.isArray(base.specs) ? base.specs : []).map((line) => (
      /^Sales unit\s*:/i.test(String(line)) ? `Sales unit: ${spec.unit}` : line
    ));
  }
  if (spec.cert) {
    base.certifications = spec.cert;
    base.standard = spec.cert;
    base.description = "";
    base.primarySpec = "";
    const specs = (Array.isArray(base.specs) ? base.specs : []).filter((line) => !/^Cert:\s*/i.test(String(line)));
    base.specs = [...specs, `Cert: ${spec.cert}`];
  }
  if (spec.aliases?.length) base.searchAliases = spec.aliases;
  if (spec.dropCert?.length) {
    const clean = (value) => spec.dropCert.reduce((text, pattern) => text.replace(pattern, " "), String(value || ""))
      .replace(/[ \t]{2,}/g, " ")
      .replace(/\n[ \t]+/g, "\n")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{2,}/g, "\n")
      .trim();
    base.certifications = clean(base.certifications);
    base.standard = clean(base.standard);
    base.specs = (Array.isArray(base.specs) ? base.specs : []).map((line) => (
      /^Cert\s*:/i.test(String(line)) ? `Cert: ${clean(String(line).replace(/^Cert\s*:\s*/i, ""))}` : line
    )).filter((line) => !/^Cert\s*:\s*$/i.test(String(line)));
  }
  rememberSource(base, list);
  return base;
}

export function foldPrecastConcrete(products) {
  const buckets = { kerb: [], paving: [], slabs: [], lintel: [] };
  const rest = [];
  let insertAt = -1;
  for (const product of products || []) {
    const kind = precastKind(product);
    if (!kind) {
      rest.push(product);
      continue;
    }
    if (insertAt < 0) insertAt = rest.length;
    buckets[kind].push(product);
  }
  const folded = PRECAST_FOLDS.map((spec) => foldedPrecast(buckets[spec.kind], spec)).filter(Boolean);
  if (!folded.length) return products || [];
  const at = insertAt < 0 ? rest.length : insertAt;
  return [...rest.slice(0, at), ...folded, ...rest.slice(at)];
}

const BALUSTRADE_CATEGORY = "欄河, Balustrades";
const METAL_ACCESS_CATEGORY = "金屬通道, Metal Access";

const BALUSTRADE_SPEC_GROUPS = [
  {
    id: "steel-material",
    label: "鋼料",
    labelEn: "Steel Materials",
    options: ["Carbon Steel", "Stainless Steel", "Standard Type for Disability", "Customize"],
  },
];

function metalAccessProduct(rows, preferNo, name) {
  const source = rows.find((product) => product.productNo === preferNo) || rows[0];
  const base = { ...source };
  base.name = name;
  base.category = METAL_ACCESS_CATEGORY;
  base.sizeDesc = "";
  base.parentProduct = "";
  base.variant = "";
  base.specGroups = BALUSTRADE_SPEC_GROUPS;
  rememberSource(base, rows);
  return base;
}

export function foldBalustrades(products) {
  const rows = [];
  const rest = [];
  let insertAt = -1;
  for (const product of products || []) {
    if (String(product?.category || "") !== BALUSTRADE_CATEGORY) {
      rest.push(product);
      continue;
    }
    if (insertAt < 0) insertAt = rest.length;
    rows.push(product);
  }
  if (!rows.length) return products || [];
  const folded = [
    metalAccessProduct(rows, "MKT-B-0001", "護欄及欄河, Guardrails & Balustrades"),
    metalAccessProduct(rows, "MKT-B-0004", "欄河, Balustrades"),
  ];
  const at = insertAt < 0 ? rest.length : insertAt;
  return [...rest.slice(0, at), ...folded, ...rest.slice(at)];
}

const OXYGEN_CATEGORY = "氧氣艙, Oxygen Chamber";
const OXYGEN_SHOP_HIDDEN = true;
const EQUIPMENT_CATEGORY = "設備, Equipment";
const SITE_EQUIPMENT_SUBGROUP = "工地設備及儲存, Site Equipment & Storage";

const OXYGEN_SPEC_GROUPS = [
  {
    id: "cabin",
    label: "分類 1",
    labelEn: "Category 1",
    options: ["Single", "Double", "Multiperson"],
  },
  {
    id: "cabin-model",
    label: "型號",
    labelEn: "Model",
    options: [
      "V3 single person cabin",
      "V6 Double person cabin",
      "V8 Multiple person cabin",
      "H3 single person cabin",
      "H6 Double person cabin",
      "H8 Multiple person cabin",
      "H10 Multiple person cabin",
      "U3 single person cabin",
      "U6 Double person cabin",
    ],
  },
];

export function foldOxygenChamber(products) {
  const rows = [];
  const rest = [];
  let insertAt = -1;
  for (const product of products || []) {
    if (String(product?.category || "") !== OXYGEN_CATEGORY) {
      rest.push(product);
      continue;
    }
    if (insertAt < 0) insertAt = rest.length;
    rows.push(product);
  }
  if (!rows.length || OXYGEN_SHOP_HIDDEN) return rest;
  const source = rows.find((product) => product.productNo === "MKT-OC-0004") || rows[0];
  const base = { ...source };
  base.name = "氧氣艙, Oxygen Chamber";
  base.category = EQUIPMENT_CATEGORY;
  delete base.shopSubgroup;
  base.sizeDesc = "";
  base.parentProduct = "";
  base.variant = "";
  base.specGroups = OXYGEN_SPEC_GROUPS;
  rememberSource(base, rows);
  const at = insertAt < 0 ? rest.length : insertAt;
  return [...rest.slice(0, at), base, ...rest.slice(at)];
}

const DOWEL_CATEGORY = "傳力桿, Dowel Bar";
const DOWEL_CERT = [
  "BS 4482",
  "BS 4449",
  "BSEN ISO 1461:2009",
  "BSEN ISO 6892",
  "CS2:2012",
  "BS EN 10025",
].join("\n");

const DOWEL_SPEC_GROUPS = [
  {
    id: "dowel-length",
    label: "長度",
    labelEn: "Length",
    keepOrder: true,
    customText: true,
    options: ["Customize"],
  },
  {
    id: "diameter",
    label: "直徑",
    labelEn: "Diameter",
    keepOrder: true,
    options: ["16mm", "20mm", "25mm", "32mm", "40mm"],
  },
];

export function foldDowelBar(products) {
  const rows = [];
  const rest = [];
  let insertAt = -1;
  for (const product of products || []) {
    if (String(product?.category || "") !== DOWEL_CATEGORY) {
      rest.push(product);
      continue;
    }
    if (insertAt < 0) insertAt = rest.length;
    rows.push(product);
  }
  if (!rows.length) return products || [];
  const source = rows.find((product) => product.productNo === "MKT-DB-0001") || rows[0];
  const base = { ...source };
  base.name = "傳力桿, Dowel Bar";
  base.category = "結構性鋼材、金屬製品, Structure Steel Element, Metal Product";
  base.shopCategoryId = "dowel-bar";
  base.sizeDesc = "";
  base.description = "";
  base.primarySpec = "";
  base.parentProduct = "";
  base.variant = "";
  base.certifications = DOWEL_CERT;
  base.standard = DOWEL_CERT;
  base.specs = (Array.isArray(base.specs) ? base.specs : []).filter((line) => !/^(?:cert|standard)\s*:/i.test(String(line)));
  base.specGroups = DOWEL_SPEC_GROUPS;
  rememberSource(base, rows);
  const at = insertAt < 0 ? rest.length : insertAt;
  return [...rest.slice(0, at), base, ...rest.slice(at)];
}

const LADDER_CATEGORY = "貓梯, Cat Ladder";
const LADDER_CERT = ["Stainless Steel BE EN 10088", "GMS BS EN ISO 1461"].join("\n");
const LADDER_SPEC_GROUPS = [
  {
    id: "ladder-material",
    label: "材料",
    labelEn: "Material",
    keepOrder: true,
    options: ["GMS", "Stainless Steel"],
  },
  {
    id: "ladder-size",
    label: "尺寸",
    labelEn: "Size",
    keepOrder: true,
    customText: true,
    options: ["Customize"],
  },
  {
    id: "ladder-spec",
    label: "規格",
    labelEn: "spec",
    keepOrder: true,
    customText: true,
    options: ["Customize"],
  },
];

export function foldCatLadder(products) {
  const rows = [];
  const rest = [];
  let insertAt = -1;
  for (const product of products || []) {
    if (String(product?.category || "") !== LADDER_CATEGORY) {
      rest.push(product);
      continue;
    }
    if (insertAt < 0) insertAt = rest.length;
    rows.push(product);
  }
  if (!rows.length) return products || [];
  const source = rows.find((product) => product.productNo === "MKT-CL-0001") || rows[0];
  const base = { ...source };
  base.name = "貓梯, Cat Ladder";
  base.category = "結構性鋼材、金屬製品, Structure Steel Element, Metal Product";
  base.shopCategoryId = "cat-ladder";
  base.unit = "No";
  base.salesUnit = "No";
  base.sizeDesc = "";
  base.description = "";
  base.primarySpec = "";
  base.parentProduct = "";
  base.variant = "";
  base.specifications = "";
  base.certifications = LADDER_CERT;
  base.standard = LADDER_CERT;
  base.specs = (Array.isArray(base.specs) ? base.specs : [])
    .filter((line) => !/^(?:cert|standard|type|finish|custom|size)\s*:/i.test(String(line)))
    .map((line) => (/^Sales unit\s*:/i.test(String(line)) ? "Sales unit: No" : line));
  if (!base.specs.some((line) => /^Sales unit\s*:/i.test(String(line)))) base.specs.push("Sales unit: No");
  base.specGroups = LADDER_SPEC_GROUPS;
  rememberSource(base, rows);
  const at = insertAt < 0 ? rest.length : insertAt;
  return [...rest.slice(0, at), base, ...rest.slice(at)];
}

const PAINT_CATEGORY = "油漆, Paint";
const FINISHES_CATEGORY = "建築飾面, Architectural Finishes";

export function foldPaint(products) {
  const rows = [];
  const rest = [];
  for (const product of products || []) {
    if (String(product?.category || "") !== PAINT_CATEGORY) {
      rest.push(product);
      continue;
    }
    rows.push(product);
  }
  if (!rows.length) return products || [];
  return rest;
}

const RAISED_FLOOR_CATEGORY = "架空地板, Raised Access Floors";
const FLOORING_NAME = "瓷磚/牆身及地板系統 - Tiles/Wall & Flooring Systems";

const RAISED_FLOOR_SPEC_GROUPS = [
  {
    id: "floor-kind",
    label: "分類 1",
    labelEn: "Category 1",
    options: ["Raised Access Floors"],
  },
  {
    id: "floor-type",
    label: "分類 2",
    labelEn: "Category 2",
    options: [
      "All Steel OA Floor",
      "OA Microporous All Steel Overhead Floor",
      "OA Slots All Steel Network Floor",
      "Anti-Static Steel Floor",
      "Calcium Sulphate OA Floor",
      "Anti-Static Calcium Sulphate Floor",
      "Anti-Static Ceramic Finish Floor",
      "GRC Inorganic Floor",
      "Glass Raised Floor",
      "Anti-Static Aluminum Floor",
      "All Steel Anti Static Ventilation Floor",
    ],
  },
  {
    id: "floor-size",
    label: "尺寸",
    labelEn: "Size",
    keepOrder: true,
    options: [
      "500x500x25",
      "500x500x26",
      "500x500x28",
      "500x500x30",
      "600x600",
      "600x600x22",
      "600x600x30",
      "600x600x32",
      "600x600x33",
      "600x600x35",
      "600x600x40",
      "600x600x45",
      "600x600x55",
      "Customize",
    ],
  },
  { id: "floor-thickness", label: "厚度", labelEn: "Thickness", field: "thickness", unit: "mm", dependsOn: "floor-size" },
  { id: "floor-width", label: "闊度", labelEn: "Width", field: "width", unit: "mm", dependsOn: "floor-size" },
  { id: "floor-length", label: "長度", labelEn: "Length", field: "length", unit: "mm", dependsOn: "floor-size" },
  {
    id: "floor-spec",
    label: "規格",
    labelEn: "spec",
    keepOrder: true,
    customText: true,
    options: ["Customize"],
  },
];

export function foldRaisedFloors(products) {
  const rows = [];
  const rest = [];
  let insertAt = -1;
  for (const product of products || []) {
    if (String(product?.category || "") !== RAISED_FLOOR_CATEGORY) {
      rest.push(product);
      continue;
    }
    if (insertAt < 0) insertAt = rest.length;
    rows.push(product);
  }
  if (!rows.length) return products || [];
  const source = rows.find((product) => product.productNo === "MKT-RAF-0001") || rows[0];
  const base = { ...source };
  base.name = FLOORING_NAME;
  base.category = "地板系統, Flooring System";
  base.shopCategoryId = "flooring-system-rising-floor";
  base.shopCategoryIds = [
    "flooring-system-timber-floor",
    "flooring-system-rising-floor",
    "flooring-system-sport-flooring",
    "flooring-system-hardener",
    "flooring-system-recycled-plastic-floor",
    "flooring-system-vinyl-floor",
  ];
  base.unit = "No";
  base.salesUnit = "No";
  base.specs = (Array.isArray(base.specs) ? base.specs : []).map((line) => (
    /^Sales unit\s*:/i.test(String(line)) ? "Sales unit: No" : line
  ));
  base.sizeDesc = "";
  base.description = "";
  base.primarySpec = "";
  base.parentProduct = "";
  base.variant = "";
  base.specGroups = RAISED_FLOOR_SPEC_GROUPS;
  rememberSource(base, rows);
  if (Array.isArray(base.specChoices)) {
    base.specChoices = base.specChoices.map((choice) => ({
      ...choice,
      unit: "No",
      specs: (Array.isArray(choice.specs) ? choice.specs : []).map((line) => (
        /^Sales unit\s*:/i.test(String(line)) ? "Sales unit: No" : line
      )),
    }));
  }
  const at = insertAt < 0 ? rest.length : insertAt;
  return [...rest.slice(0, at), base, ...rest.slice(at)];
}

const CLADDING_CATEGORY = "鋁板飾面, Aluminum Cladding";
const CLADDING_NAME = "牆板及飾面, Wall Boards & Cladding";

const CLADDING_SPEC_GROUPS = [
  {
    id: "clad-kind",
    label: "分類 1",
    labelEn: "Category 1",
    options: ["Aluminum Cladding"],
  },
  {
    id: "clad-type",
    label: "分類 2",
    labelEn: "Category 2",
    options: [
      "Fluorocarbon aluminum single plate",
      "Wood-grain aluminum single panel",
      "Alumina single plate",
      "Irregular-shaped aluminum single plate",
      "Hollow carved board",
      "Perforated aluminum plate",
      "Aluminum mesh plate",
      "Galvanized sheet",
      "Aluminum-magnesium-zinc coated sheet",
      "Sound-proof aluminum plate",
      "Insulated aluminum plate",
      "Honeycomb panel series",
      "Corrugated board series",
    ],
  },
  {
    id: "clad-size",
    label: "尺寸",
    labelEn: "Size",
    keepOrder: true,
    customText: true,
    options: ["Customize"],
  },
  {
    id: "clad-spec",
    label: "規格",
    labelEn: "Spec",
    keepOrder: true,
    customText: true,
    options: ["Customize"],
  },
];

export function foldAluminumCladding(products) {
  const rows = [];
  const rest = [];
  let insertAt = -1;
  for (const product of products || []) {
    if (String(product?.category || "") !== CLADDING_CATEGORY) {
      rest.push(product);
      continue;
    }
    if (insertAt < 0) insertAt = rest.length;
    rows.push(product);
  }
  if (!rows.length) return products || [];
  const source = rows.find((product) => product.productNo === "MKT-AC-0001") || rows[0];
  const base = { ...source };
  base.name = CLADDING_NAME;
  base.category = "鋁製品, Aluminium Product";
  base.shopCategoryId = "aluminium-chequered-plate";
  base.shopCategoryIds = ["aluminium-chequered-plate", "aluminium-plate"];
  base.unit = "No";
  base.salesUnit = "No";
  base.specs = (Array.isArray(base.specs) ? base.specs : []).map((line) => (
    /^Sales unit\s*:/i.test(String(line)) ? "Sales unit: No" : line
  ));
  base.sizeDesc = "";
  base.description = "";
  base.primarySpec = "";
  base.parentProduct = "";
  base.variant = "";
  base.tailorSize = false;
  base.specGroups = CLADDING_SPEC_GROUPS;
  rememberSource(base, rows);
  if (Array.isArray(base.specChoices)) {
    base.specChoices = base.specChoices.map((choice) => ({
      ...choice,
      unit: "No",
      specs: (Array.isArray(choice.specs) ? choice.specs : []).map((line) => (
        /^Sales unit\s*:/i.test(String(line)) ? "Sales unit: No" : line
      )),
    }));
  }
  const at = insertAt < 0 ? rest.length : insertAt;
  return [...rest.slice(0, at), base, ...rest.slice(at)];
}

const CABLE_CATEGORY = "電線電纜, Cable";
const MEP_CATEGORY = "機電及公用設施, MEP & Utilities";

const CABLE_SPEC_GROUPS = [
  {
    id: "cable-kind",
    label: "分類 1",
    labelEn: "Category 1",
    options: ["Cable"],
  },
  {
    id: "cable-type",
    label: "電纜類型",
    labelEn: "Type of Cable",
    options: [
      "Armoured power cables with LSHF sheathing",
      "Armoured fire resistant power cables",
      "Single core non-sheathed cables with LSHF crosslinked insulation",
      "Single core fire resistant cables",
      "0.6/1kV single core cable",
    ],
  },
  {
    id: "cable-length",
    label: "所需長度",
    labelEn: "Input length required",
    field: "length",
    unit: "m",
  },
];

export function foldCable(products) {
  const rows = [];
  const rest = [];
  let insertAt = -1;
  for (const product of products || []) {
    if (String(product?.category || "") !== CABLE_CATEGORY) {
      rest.push(product);
      continue;
    }
    if (insertAt < 0) insertAt = rest.length;
    rows.push(product);
  }
  if (!rows.length) return products || [];
  const source = rows.find((product) => product.productNo === "MKT-CBL-0001") || rows[0];
  const base = { ...source };
  base.name = "電氣及電纜, Electrical & Cabling";
  base.category = MEP_CATEGORY;
  base.sizeDesc = "";
  base.description = "";
  base.primarySpec = "";
  base.parentProduct = "";
  base.variant = "";
  base.specGroups = CABLE_SPEC_GROUPS;
  rememberSource(base, rows);
  const at = insertAt < 0 ? rest.length : insertAt;
  return [...rest.slice(0, at), base, ...rest.slice(at)];
}

const SHOE_CATEGORY = "洗鞋機, Shoe Washing Machines";

const SHOE_SPEC_GROUPS = [
  {
    id: "shoe-kind",
    label: "分類 1",
    labelEn: "Category 1",
    options: ["Shoe Washing Machines"],
  },
  {
    id: "shoe-custom",
    label: "分類 2",
    labelEn: "Category 2",
    options: ["Customize"],
  },
  {
    id: "shoe-model",
    label: "型號",
    labelEn: "Model",
    options: ["HE-HCDS02", "HE-HCDS04", "HE-HCDS13", "HE-HCDS14", "HE-HCDS18", "HE-HCDS19"],
  },
];

export function foldShoeWashing(products) {
  const rows = [];
  const rest = [];
  let insertAt = -1;
  for (const product of products || []) {
    if (String(product?.category || "") !== SHOE_CATEGORY) {
      rest.push(product);
      continue;
    }
    if (insertAt < 0) insertAt = rest.length;
    rows.push(product);
  }
  if (!rows.length) return products || [];
  const source = rows.find((product) => product.productNo === "MKT-SWM-0001") || rows[0];
  const base = { ...source };
  base.name = SITE_EQUIPMENT_SUBGROUP;
  base.category = EQUIPMENT_CATEGORY;
  base.sizeDesc = "";
  base.description = "";
  base.primarySpec = "";
  base.parentProduct = "";
  base.variant = "";
  base.specGroups = SHOE_SPEC_GROUPS;
  rememberSource(base, rows);
  const at = insertAt < 0 ? rest.length : insertAt;
  return [...rest.slice(0, at), base, ...rest.slice(at)];
}

const BOARD_CATEGORY = "板材, Board";
const GYPSUM_BOARD_CATEGORY = "石膏板, Gypsum Board";

const CEMENT_SPEC_GROUPS = [
  {
    id: "cement-rating",
    label: "分類 1",
    labelEn: "Category 1",
    options: ["A1 Non-combustible"],
  },
];

const GYPSUM_BOARD_SPEC_GROUPS = [
  {
    id: "gypsum-frr",
    label: "分類 1",
    labelEn: "Category 1",
    options: ["1 hr FRR", "2 hr FRR", "4 hr FRR"],
  },
  {
    id: "gypsum-size",
    label: "分類 2",
    labelEn: "Category 2",
    options: ["1220x2440x9.5", "1220x2440x12", "1220x2440x12.5", "1220x2440x15"],
  },
];

function isCementBoard(product) {
  return String(product?.category || "") === BOARD_CATEGORY && String(product?.parentProduct || "") === "Cement Board";
}

function isGypsumBoard(product) {
  if (String(product?.category || "") === GYPSUM_BOARD_CATEGORY) return true;
  return String(product?.category || "") === BOARD_CATEGORY && String(product?.parentProduct || "") === "Gypsum Board";
}

function finishBoard(source, name, groups, rows) {
  const base = { ...source };
  base.name = name;
  base.category = FINISHES_CATEGORY;
  base.sizeDesc = "";
  base.description = "";
  base.primarySpec = "";
  base.parentProduct = "";
  base.variant = "";
  base.specGroups = groups;
  rememberSource(base, rows);
  return base;
}

export function foldFinishBoards(products) {
  const cement = [];
  const gypsum = [];
  const rest = [];
  let insertAt = -1;
  for (const product of products || []) {
    if (isCementBoard(product)) {
      if (insertAt < 0) insertAt = rest.length;
      cement.push(product);
      continue;
    }
    if (isGypsumBoard(product)) {
      if (insertAt < 0) insertAt = rest.length;
      gypsum.push(product);
      continue;
    }
    rest.push(product);
  }
  const folded = [];
  if (cement.length) {
    const source = cement.find((product) => product.productNo === "MKT-LOC-KT0MOBFL-001") || cement[0];
    folded.push(finishBoard(source, "水泥板, Cement Board", CEMENT_SPEC_GROUPS, cement));
  }
  if (gypsum.length) {
    const source = gypsum.find((product) => product.productNo === "MKT-GBOARD-0001") || gypsum[0];
    folded.push(finishBoard(source, "石膏板, Gypsum Board", GYPSUM_BOARD_SPEC_GROUPS, gypsum));
  }
  if (!folded.length) return products || [];
  const at = insertAt < 0 ? rest.length : insertAt;
  return [...rest.slice(0, at), ...folded, ...rest.slice(at)];
}

const AGGREGATE_CATEGORY = "石料, Aggregate";
const AGGREGATE_SHOP_CATEGORY = "石料, Aggregate";
const AGGREGATE_UNITS = ["M_Ton", "Bag"];
const AGGREGATE_SPEC_TABLE = [
  { label: "Aggregate", sizes: ["10 mm", "20 mm", "40 mm"], cert: "CS3:2013" },
  { label: "Fine Aggregate", cert: "CS3:2013" },
  { label: "General Fill", cert: "CEDD GS\nBS 1377" },
  { label: "Type A Granular Bed", cert: "CEDD GS\nCS3:2013" },
  { label: "Type B Granular Fill", cert: "CEDD GS\nCS3:2013" },
  {
    label: "Rockfill",
    sizes: [
      { label: "200 mm", cert: "Geospec 3\nGrade: 200" },
      { label: "400 mm", cert: "Geospec 3\nGrade: 400" },
    ],
  },
  { label: "Sub-base", cert: "GEO Report 36\nCS3:2013" },
];

function aggregateCertSpecs(cert) {
  const text = String(cert || "").trim();
  return text ? [`Cert: ${text}`] : [];
}

function aggregateSheetGroups(labels) {
  const specOptions = [];
  const sizeOptions = [];
  const unitOptions = [];
  const rows = labels ? AGGREGATE_SPEC_TABLE.filter((row) => labels.includes(row.label)) : AGGREGATE_SPEC_TABLE;
  for (const row of rows) {
    const sizes = row.sizes || [];
    specOptions.push({
      label: row.label,
      ...(sizes.some((size) => size && typeof size === "object" && size.cert) ? {} : { specs: aggregateCertSpecs(row.cert) }),
    });
    for (const size of sizes) {
      const label = typeof size === "string" ? size : size.label;
      const cert = typeof size === "string" ? "" : size.cert;
      sizeOptions.push({
        label,
        key: `${row.label}::${label}`,
        parent: row.label,
        ...(cert ? { specs: aggregateCertSpecs(cert) } : {}),
      });
    }
    for (const unit of AGGREGATE_UNITS) {
      unitOptions.push({ label: unit, key: `${row.label}::${unit}`, parent: row.label, unit });
    }
  }
  return [
    { id: "agg-type", label: "規格", labelEn: "Spec", keepOrder: true, options: specOptions },
    { id: "agg-size", label: "尺寸", labelEn: "Size", dependsOn: "agg-type", keepOrder: true, options: sizeOptions },
    { id: "agg-unit", label: "單位", labelEn: "Unit", dependsOn: "agg-type", keepOrder: true, options: unitOptions },
  ];
}

function aggregateParent(product) {
  return String(product?.parentProduct || "");
}

function aggregateChoices(rows, groups) {
  const choices = [];
  for (const row of rows || []) {
    const picks = {};
    for (const group of groups || []) {
      const hits = [];
      for (const option of group.options || []) {
        const parent = option && typeof option === "object" ? String(option.parent || "") : "";
        if (parent && looseKey(row?.parentProduct) !== looseKey(parent)) continue;
        const label = optionText(option);
        const match = option && typeof option === "object" && option.match ? String(option.match) : label;
        const pick = option && typeof option === "object" ? String(option.key || option.label || "").trim() : label;
        if (rowMatchesLabel(row, match)) hits.push(pick);
      }
      if (hits.length === 1) picks[group.id] = hits[0];
    }
    if (!Object.keys(picks).length) continue;
    choices.push({ picks, ...orderFacts(row) });
  }
  return choices;
}

function aggregateProduct(source, name, groups, rows, shopCategoryId) {
  const base = { ...source };
  base.name = name;
  base.category = AGGREGATE_SHOP_CATEGORY;
  if (shopCategoryId) base.shopCategoryId = shopCategoryId;
  delete base.shopCategoryIds;
  base.sizeDesc = "";
  base.description = "";
  base.primarySpec = "";
  base.parentProduct = "";
  base.variant = "";
  base.specGroups = groups;
  const choices = aggregateChoices(rows, groups);
  if (choices.length) base.specChoices = choices;
  else delete base.specChoices;
  return base;
}

function aggregateShell(source, id, sku, name) {
  const base = aggregateProduct(source, name, [], []);
  base.id = id;
  base.productNo = sku;
  base.provisionalSku = sku;
  base.unit_price = null;
  base.price = null;
  base.priceUponRequest = true;
  base.quote = null;
  return base;
}

export function foldAggregate(products) {
  const rows = [];
  const rest = [];
  let insertAt = -1;
  for (const product of products || []) {
    if (String(product?.category || "") !== AGGREGATE_CATEGORY) {
      rest.push(product);
      continue;
    }
    if (insertAt < 0) insertAt = rest.length;
    rows.push(product);
  }
  if (!rows.length) return products || [];
  const byParent = (name) => rows.filter((product) => aggregateParent(product) === name);
  const coarse = byParent("Coarse Aggregate");
  const subbase = byParent("Sub-base");
  const granular = byParent("Granular Fill");
  const rockfill = byParent("Rockfill");
  const used = new Set([...coarse, ...subbase, ...granular, ...rockfill]);
  const leftover = rows.filter((product) => !used.has(product));
  const coarseSource = coarse.find((product) => product.productNo === "MKT-LOC-MN0AS1TM-001") || coarse[0] || rows[0];
  const stone = aggregateProduct(coarseSource, "石料, Aggregates", aggregateSheetGroups(), [], "aggregate-sub-base");
  stone.shopCategoryIds = ["aggregate-sub-base", "aggregate-recycle", "rockfill", "granular-fill"];
  stone.unit = "M_Ton";
  stone.salesUnit = "M_Ton";
  stone.priceUponRequest = true;
  stone.unit_price = null;
  stone.price = null;
  const folded = [stone];
  const at = insertAt < 0 ? rest.length : insertAt;
  return [...rest.slice(0, at), ...folded, ...leftover, ...rest.slice(at)];
}

const PIPE_CATEGORY = "喉管、配件, Pipe & Fittings & Accessories";
const INFRA_CATEGORY = "基建（排水、污水、食水、海水）, Infrastructure (Drainage, Sewerage, Potable, Seawater)";

const PIPE_FAMILIES = [
  { parent: "Cast Iron Pipe & Fittings", label: "CI Pipe", image: "https://xwwyrgq1kyv6thim.public.blob.vercel-storage.com/catalog/type-ci-2mvpSWGINVZHxzNqaUg594jt7dGOEF.webp" },
  { parent: "Copper Pipe & Copper Alloy Fittings", label: "Copper Pipe", image: "https://xwwyrgq1kyv6thim.public.blob.vercel-storage.com/catalog/Pipe_and_Fittings_Copper_Copper_Alloy_e15f6be04a-bHaWA8Gu2jiFPbBLy4FRXU2LxumrxB.webp" },
  { parent: "Ductile Iron Pipe & Fittings", label: "DI Pipe", image: "https://xwwyrgq1kyv6thim.public.blob.vercel-storage.com/catalog/type-di-aSVUZpOMGn2zwf55ZPvW2yqIwaDaOK.webp" },
  { parent: "Galvanized Steel Pipe & Fittings", label: "Galvanized Steel Pipe", image: "https://xwwyrgq1kyv6thim.public.blob.vercel-storage.com/catalog/3281_406f7c7fa2-AE3wvReZybC4iKJfrW6moipF9Y4GrL.webp" },
  { parent: "HDPE Pipe & Fittings", label: "HDPE Pipe", image: "https://xwwyrgq1kyv6thim.public.blob.vercel-storage.com/catalog/type-hdpe-IVp0yY3Ijh7gp0lklAhNgyeCP1SDXX.webp" },
  { parent: "Mild Steel Pipe & Fittings", label: "Mild Steel Pipe", image: "https://xwwyrgq1kyv6thim.public.blob.vercel-storage.com/catalog/3291_955a263d27-wmdhSfsnJ8wELVvNhN0BrtI2ftK42l.webp" },
];

const PIPE_SPEC_GROUPS = [
  {
    id: "pipe-kind",
    label: "分類 1",
    labelEn: "Category 1",
    options: PIPE_FAMILIES.map((family) => ({ label: family.label, image: family.image })),
  },
];

function isPipeFamily(product) {
  const parent = String(product?.parentProduct || "");
  return PIPE_FAMILIES.some((family) => family.parent === parent);
}

export function foldPipeFittings(products) {
  const rows = [];
  const rest = [];
  let insertAt = -1;
  for (const product of products || []) {
    if (String(product?.category || "") === PIPE_CATEGORY && isPipeFamily(product)) {
      if (insertAt < 0) insertAt = rest.length;
      rows.push(product);
      continue;
    }
    rest.push(product);
  }
  if (!rows.length) return products || [];
  const source = rows.find((product) => product.productNo === "MKT-LOC-S9JBXJFM-001") || rows[0];
  const base = { ...source };
  base.name = "喉管及配件, Pipe & Fittings";
  base.category = INFRA_CATEGORY;
  base.image = PIPE_FAMILIES[0].image;
  base.imageUrl = PIPE_FAMILIES[0].image;
  base.sizeDesc = "";
  base.description = "";
  base.primarySpec = "";
  base.parentProduct = "";
  base.variant = "";
  base.specGroups = PIPE_SPEC_GROUPS;
  rememberSource(base, rows);
  const at = insertAt < 0 ? rest.length : insertAt;
  return [...rest.slice(0, at), base, ...rest.slice(at)];
}

const GU_CATEGORY = "GU型去水溝蓋, GU Type Drainage Gratings";
const GT_CATEGORY = "GT型去水溝蓋, GT Type Drainage Gratings";

function gratingOption(product) {
  const code = String(product?.variant || product?.parentProduct || "").trim();
  const size = String(product?.sizeDesc || "").split("\n")[0].trim();
  const label = code && size && !size.startsWith(code) ? `${code} — ${size}` : size || code;
  if (!label) return null;
  return { label, ...orderFacts(product), detail: size || label };
}

function foldOneGrating(products, category, anchor, groupId) {
  const rows = [];
  const rest = [];
  let insertAt = -1;
  for (const product of products || []) {
    if (String(product?.category || "") !== category) {
      rest.push(product);
      continue;
    }
    if (insertAt < 0) insertAt = rest.length;
    rows.push(product);
  }
  if (!rows.length) return products || [];
  rows.sort((a, b) => String(a.productNo || "").localeCompare(String(b.productNo || ""), undefined, { numeric: true }));
  const source = rows.find((product) => product.productNo === anchor) || rows[0];
  const base = { ...source };
  base.name = category;
  base.category = category;
  base.sizeDesc = "";
  base.description = "";
  base.primarySpec = "";
  base.parentProduct = "";
  base.variant = "";
  base.specGroups = [
    {
      id: groupId,
      label: "分類 1",
      labelEn: "Category 1",
      options: rows.map(gratingOption).filter(Boolean),
    },
  ];
  const at = insertAt < 0 ? rest.length : insertAt;
  return [...rest.slice(0, at), base, ...rest.slice(at)];
}

export function foldDrainageGratings(products) {
  return foldOneGrating(
    foldOneGrating(products, GU_CATEGORY, "MKT-GTD-0001", "gu-size"),
    GT_CATEGORY,
    "MKT-GT-0001",
    "gt-size",
  );
}

const FORGE_CATEGORY = "焊接鋼格板, Forge-welded Grating";
const PRESS_CATEGORY = "壓鎖鋼格板, Press-Lock Grating";
const PRESS_IMAGE = "/assets/press-lock-grating.jpg?v=1";
const FORGE_IMAGE = "/assets/forge-welded-grating.jpg?v=7";

function steelGratingOption(product) {
  const label = String(product?.variant || product?.parentProduct || "").trim();
  if (!label) return null;
  const facts = orderFacts(product);
  if (!facts.detail) facts.detail = String(product?.sizeDesc || product?.description || "").trim();
  return { label, ...facts };
}

function foldOneSteelGrating(products, category, anchor, groupId) {
  const rows = [];
  const rest = [];
  let insertAt = -1;
  for (const product of products || []) {
    if (String(product?.category || "") !== category) {
      rest.push(product);
      continue;
    }
    if (insertAt < 0) insertAt = rest.length;
    rows.push(product);
  }
  if (!rows.length) return products || [];
  rows.sort((a, b) => String(a.productNo || "").localeCompare(String(b.productNo || ""), undefined, { numeric: true }));
  const source = rows.find((product) => product.productNo === anchor) || rows[0];
  const base = { ...source };
  if (category === PRESS_CATEGORY) {
    base.image = PRESS_IMAGE;
    base.images = [PRESS_IMAGE];
    base.imageFallback = "/assets/press-lock-grating.jpg";
  }
  if (category === FORGE_CATEGORY) {
    base.image = FORGE_IMAGE;
    base.images = [FORGE_IMAGE];
    base.imageFallback = "/assets/forge-welded-grating.jpg";
  }
  base.name = category;
  base.category = category;
  base.parentProduct = "";
  base.variant = "";
  base.specGroups = [
    {
      id: groupId,
      label: "分類 1",
      labelEn: "Category 1",
      options: rows.map(steelGratingOption).filter(Boolean),
    },
  ];
  const at = insertAt < 0 ? rest.length : insertAt;
  return [...rest.slice(0, at), base, ...rest.slice(at)];
}

export function foldSteelGratings(products) {
  return foldOneSteelGrating(
    foldOneSteelGrating(products, FORGE_CATEGORY, "MKT-FG-0001", "forge-use"),
    PRESS_CATEGORY,
    "MKT-PG-0001",
    "press-use",
  );
}

const GYPSUM_BLOCK_CATEGORY = "石膏磚, Gypsum Block";

function isGypsumBlockSeries(product) {
  return /^Gypsum Block\s*[—–]\s*\d+\s*mm\b/i.test(String(product?.variant || ""));
}

function isListedGypsumBlock(product) {
  const parent = String(product?.parentProduct || "").trim();
  const variant = String(product?.variant || "").trim();
  const category = String(product?.category || "").trim();
  return parent === "Gypsum Block" || variant === "Gypsum Block" || category === GYPSUM_BLOCK_CATEGORY;
}

const GYPSUM_BLOCK_CERT = ["BS EN 13279", "BS 476", "BS EN ISO 140-3", "BS EN 12859", "BS EN 1364"].join("\n");

const GYPSUM_BLOCK_GROUPS = [
  { id: "gblock-size", label: "尺寸", labelEn: "Size", keepOrder: true, options: ["500mm x 500mm", "500mm x 250mm"] },
  { id: "gblock-thickness", label: "厚度", labelEn: "Thickness", keepOrder: true, options: ["80mm", "100mm", "150mm"] },
  { id: "gblock-density", label: "密度", labelEn: "Density", keepOrder: true, options: ["1,100kg/m3", "1,200kg/m3", "1,400kg/m3"] },
];

export function foldGypsumBlocks(products) {
  const rows = [];
  const rest = [];
  let insertAt = -1;
  for (const product of products || []) {
    if (!isGypsumBlockSeries(product) && !isListedGypsumBlock(product)) {
      rest.push(product);
      continue;
    }
    if (insertAt < 0) insertAt = rest.length;
    rows.push(product);
  }
  if (!rows.length) return products || [];
  const source = rows.find((product) => product.productNo === "MKT-GB-0001") || rows[0];
  const base = { ...source };
  base.name = "石膏磚, Gypsum Block";
  base.category = GYPSUM_BLOCK_CATEGORY;
  base.shopCategoryId = "gypsym-block-2";
  delete base.shopCategoryIds;
  base.sizeDesc = "";
  base.primarySpec = "";
  base.parentProduct = "";
  base.variant = "";
  base.description = "";
  base.unit = "m²";
  base.salesUnit = "m²";
  base.searchAliases = ["Gypsum Block", "石膏磚", "Gypsym Block"];
  base.certifications = GYPSUM_BLOCK_CERT;
  base.standard = GYPSUM_BLOCK_CERT;
  base.specs = ["Cert: BS EN 13279 / BS 476 / BS EN ISO 140-3 / BS EN 12859 / BS EN 1364"];
  base.specGroups = GYPSUM_BLOCK_GROUPS;
  base.specChoices = [];
  const at = Math.max(0, insertAt);
  return [...rest.slice(0, at), base, ...rest.slice(at)];
}

const MANHOLE_NAME = "沙井蓋, Manhole Cover";

/** Series hero images for SpecGroupPicker (logo-free catalog shots under /assets/manhole-series/). */
const MANHOLE_SERIES_IMG_V = "v2";
const MANHOLE_SERIES_IMAGES = {
  "Cast Iron Hinged Grating with Frame for OTG": `/assets/manhole-series/cast-iron-hinged-grating-otg.jpg?${MANHOLE_SERIES_IMG_V}`,
  "Cast Iron Hinged Cover with Frame for STG/BIGT": `/assets/manhole-series/cast-iron-hinged-cover-stg.jpg?${MANHOLE_SERIES_IMG_V}`,
  "Ductile Iron Hinged Grating with Frame for OTG": `/assets/manhole-series/ductile-hinged-grating-otg.jpg?${MANHOLE_SERIES_IMG_V}`,
  "Ductile Iron Hinged Cover with Frame for STG/BIGT": `/assets/manhole-series/ductile-hinged-cover-stg.jpg?${MANHOLE_SERIES_IMG_V}`,
  "Cast Iron Double Seal Solid Cover and Frame (with screws)": `/assets/manhole-series/cast-iron-double-seal-solid.jpg?${MANHOLE_SERIES_IMG_V}`,
  "Cast Iron Double-Triangular & Desilting Manhole Cover and Frame": `/assets/manhole-series/cast-iron-double-triangular.jpg?${MANHOLE_SERIES_IMG_V}`,
  "Double Seal Ductile Iron Manhole Cover and Frame": `/assets/manhole-series/ductile-double-seal.jpg?${MANHOLE_SERIES_IMG_V}`,
  "Square Ductile Iron Surface Box": `/assets/manhole-series/square-ductile-surface-box.jpg?${MANHOLE_SERIES_IMG_V}`,
};

function manholeSeriesImage(series) {
  const key = String(series || "").trim();
  return MANHOLE_SERIES_IMAGES[key] || "";
}

function coverBits(product) {
  const raw = String(product?.variant || product?.name || "");
  const bits = raw.split(/\s*[—–]\s*/).map((part) => part.trim()).filter(Boolean);
  if (/^(?:manhole cover|沙井蓋)$/i.test(bits[0] || "")) bits.shift();
  return bits;
}

function coverHeight(detail) {
  const match = String(detail || "").match(/height\s+\d+(?:\.\d+)?\s*mm/i);
  return match ? match[0].replace(/\s+/g, " ") : "";
}

function uniqueCoverLabels(items, index) {
  const buckets = new Map();
  for (const item of items) {
    const bit = item.rest[index] || item.detail || "Option";
    if (!buckets.has(bit)) buckets.set(bit, []);
    buckets.get(bit).push(item);
  }
  const labels = new Map();
  for (const [bit, group] of buckets) {
    if (group.length === 1) {
      labels.set(group[0], bit);
      continue;
    }
    for (const item of group) {
      const height = coverHeight(item.detail);
      labels.set(item, height ? `${bit} · ${height}` : `${bit} · ${item.detail}`);
    }
  }
  return labels;
}

function isManholeCover(product) {
  const parent = String(product?.parentProduct || "");
  const variant = String(product?.variant || "");
  const name = String(product?.name || "");
  return parent === "Manhole Cover" || /^Manhole Cover\b/.test(variant) || /^沙井蓋\b/.test(name) || /^Manhole Cover\b/.test(name);
}

export function foldManholeCovers(products) {
  const rows = [];
  const rest = [];
  let insertAt = -1;
  for (const product of products || []) {
    if (!isManholeCover(product)) {
      rest.push(product);
      continue;
    }
    if (insertAt < 0) insertAt = rest.length;
    rows.push(product);
  }
  if (!rows.length) return products || [];
  rows.sort((a, b) => String(a.productNo || "").localeCompare(String(b.productNo || ""), undefined, { numeric: true }));

  const seriesOrder = [];
  const bySeries = new Map();
  for (const product of rows) {
    const bits = coverBits(product);
    const series = bits[0] || "Manhole Cover";
    if (!bySeries.has(series)) {
      bySeries.set(series, []);
      seriesOrder.push(series);
    }
    const detail = String(product.sizeDesc || "").trim();
    const summary = String(product.description || "").trim();
    const sku = String(product.productNo || "").trim().toUpperCase();
    const seriesImage = manholeSeriesImage(series) || String(product.image || "");
    bySeries.get(series).push({
      rest: bits.slice(1),
      detail: detail || summary,
      summary: summary && summary !== detail ? summary : "",
      image: seriesImage,
      sku,
      moq: product.moq,
      unit: product.unit,
      leadTime: product.leadTime,
      leadTimeLabel: product.leadTimeLabel,
      specs: Array.isArray(product.specs) ? product.specs : [],
    });
  }

  const seriesOptions = [];
  const midOptions = [];
  const leafOptions = [];
  for (const series of seriesOrder) {
    const items = bySeries.get(series);
    const seriesImage = manholeSeriesImage(series) || items[0]?.image || "";
    const hasMid = items.some((item) => item.rest.length >= 2);
    if (!hasMid && items.length < 2) {
      seriesOptions.push({
        label: series,
        key: series,
        detail: items[0].detail,
        summary: items[0].summary,
        image: seriesImage || items[0].image,
        sku: items[0].sku,
        moq: items[0].moq,
        unit: items[0].unit,
        leadTime: items[0].leadTime,
        leadTimeLabel: items[0].leadTimeLabel,
        specs: items[0].specs,
      });
      continue;
    }
    seriesOptions.push({ label: series, key: series, image: seriesImage });
    if (!hasMid) {
      const labels = uniqueCoverLabels(items, 0);
      for (const item of items) {
        const label = labels.get(item);
        midOptions.push({
          label,
          key: `${series}::${label}`,
          parent: series,
          detail: item.detail,
          summary: item.summary,
          image: item.image,
          sku: item.sku,
          moq: item.moq,
          unit: item.unit,
          leadTime: item.leadTime,
          leadTimeLabel: item.leadTimeLabel,
          specs: item.specs,
        });
      }
      continue;
    }
    const grades = [];
    for (const item of items) {
      const grade = item.rest[0] || "Option";
      if (!grades.includes(grade)) grades.push(grade);
    }
    for (const grade of grades) {
      const gradeKey = `${series}::${grade}`;
      midOptions.push({ label: grade, key: gradeKey, parent: series });
      const children = items.filter((item) => (item.rest[0] || "Option") === grade);
      const labels = uniqueCoverLabels(children, 1);
      for (const item of children) {
        const label = labels.get(item);
        leafOptions.push({
          label,
          key: `${gradeKey}::${label}`,
          parent: gradeKey,
          detail: item.detail,
          summary: item.summary,
          image: item.image,
          sku: item.sku,
          moq: item.moq,
          unit: item.unit,
          leadTime: item.leadTime,
          leadTimeLabel: item.leadTimeLabel,
          specs: item.specs,
        });
      }
    }
  }

  const source = rows[0];
  const base = { ...source };
  base.name = MANHOLE_NAME;
  base.parentProduct = "";
  base.variant = "";
  const hero = seriesOptions.find((option) => option?.image)?.image || manholeSeriesImage(seriesOrder[0]) || base.image;
  if (hero) {
    base.image = hero;
    base.images = [hero, ...(Array.isArray(base.images) ? base.images.filter((url) => url && url !== hero) : [])];
  }
  base.specGroups = [
    { id: "cover-series", label: "系列", labelEn: "Series", options: seriesOptions },
    { id: "cover-kind", label: "類型", labelEn: "Type", dependsOn: "cover-series", options: midOptions },
    { id: "cover-size", label: "尺寸", labelEn: "Size", dependsOn: "cover-kind", options: leafOptions },
  ];
  const at = insertAt < 0 ? rest.length : insertAt;
  return [...rest.slice(0, at), base, ...rest.slice(at)];
}

const WINDOW_CATEGORY = "窗, Window";
const WINDOW_IMAGE = "https://xwwyrgq1kyv6thim.public.blob.vercel-storage.com/catalog/type-window-SkvBIXRlywh5mk2M8wvxUMvsEc0UHH.webp";

const WINDOW_LINES = [
  {
    name: "平開窗, Casement Window",
    anchor: "MKT-WIN-0001",
    test: /Casement Window$/i,
    options: [
      "JC62 · Frame 29mm / Sash 72.6mm",
      "JC67 · Frame 29mm / Sash 72.6mm",
      "JC72 · Frame 29mm / Sash 72.6mm",
      "JC77 · Frame 29mm / Sash 77.6mm",
      "JC82 · Frame 29mm / Sash 70.6mm",
      "JC92 · Frame 34mm / Sash 72.6mm",
    ],
  },
  {
    name: "被動房窗, Passive House Window",
    anchor: "MKT-WIN-0007",
    test: /Passive House Window$/i,
    options: [
      "JC102 · Frame 39mm / Sash 82.6mm",
      "PU85 · Frame 32mm / Sash 70mm",
    ],
  },
  {
    name: "窄框窗, Slim Frame Window",
    anchor: "MKT-WIN-0009",
    test: /Slim Frame Window$/i,
    options: [
      "JC82X · Frame 60mm / Sash 22.5mm",
      "JC90X · Frame 60mm / Sash 22.5mm",
    ],
  },
];

function windowLineOf(product) {
  const name = String(product?.name || "");
  return WINDOW_LINES.find((line) => line.test.test(name)) || null;
}

function foldedWindow(rows, line) {
  const source = rows.find((product) => product.productNo === line.anchor) || rows.find((product) => windowLineOf(product) === line);
  if (!source) return null;
  const base = { ...source };
  base.name = line.name;
  base.category = WINDOW_CATEGORY;
  base.image = source.image || WINDOW_IMAGE;
  base.imageUrl = source.imageUrl || source.image || WINDOW_IMAGE;
  base.sizeDesc = "";
  base.description = "";
  base.primarySpec = "";
  base.parentProduct = "";
  base.variant = "";
  base.specs = (Array.isArray(source.specs) ? source.specs : []).filter((line) => /^Cert:/i.test(String(line)));
  base.specGroups = [
    {
      id: "window-model",
      label: "分類 1",
      labelEn: "Category 1",
      options: line.options,
    },
  ];
  rememberSource(base, rows.filter((product) => windowLineOf(product) === line));
  return base;
}

export function foldWindows(products) {
  const rows = [];
  const rest = [];
  let insertAt = -1;
  for (const product of products || []) {
    if (String(product?.category || "") === WINDOW_CATEGORY && windowLineOf(product)) {
      if (insertAt < 0) insertAt = rest.length;
      rows.push(product);
      continue;
    }
    rest.push(product);
  }
  if (!rows.length) return products || [];
  const folded = WINDOW_LINES.map((line) => foldedWindow(rows, line)).filter(Boolean);
  const at = insertAt < 0 ? rest.length : insertAt;
  return [...rest.slice(0, at), ...folded, ...rest.slice(at)];
}

const TILE_CATEGORY = "瓷磚, Tiles";
const MARBLE_CATEGORY = "天然大理石磚, Natural Marble Tile";

function tileSizeLabel(product) {
  return String(product?.sizeDesc || "").replace(/\s+/g, " ").trim();
}

function tileRole(product) {
  const parent = String(product?.parentProduct || "").trim();
  const name = String(product?.name || "");
  const variant = String(product?.variant || "");
  const category = String(product?.category || "");
  if (parent === "Homogenous Tile" || /^Homogenous Tile\b/i.test(name)) return "homogenous";
  if (parent === "Marble Design Series" || parent === "Natural Marble Tiles" || category === MARBLE_CATEGORY) return "marble";
  if (parent === "Roof Tile" || /^Roof Tile\b/i.test(name)) return "roof";
  if (parent === "Tactile Tile" || /^Tactile Tile\b/i.test(name)) return "tactile";
  if (parent === "Vinyl Flooring" || /^Vinyl Flooring\b/i.test(name)) return "vinyl";
  if (category === "膠地板, Vinyl" || /homogen|heter/i.test(parent) || /homogen|heter/i.test(name)) return "vinyl";
  if (variant === "Mosaic Tile" || /Mosaic Tile/i.test(name)) return "mosaic";
  if (parent === "Ceramic Tile") return "slip";
  if (category === TILE_CATEGORY && !parent) return "ceramic";
  if (category === TILE_CATEGORY && parent && parent !== "Other Tiles") return "ceramic";
  return "";
}

function tileAnchor(rows, sku) {
  return rows.find((product) => product.productNo === sku) || rows.find((product) => product.image) || rows[0];
}

function finishTile(rows, sku, name, specGroups, choices) {
  const source = tileAnchor(rows, sku);
  if (!source) return null;
  const base = { ...source };
  base.name = name;
  base.category = TILE_CATEGORY;
  base.image = source.image || source.imageUrl || "";
  base.imageUrl = source.imageUrl || source.image || "";
  base.sizeDesc = "";
  base.description = "";
  base.primarySpec = "";
  base.parentProduct = "";
  base.variant = "";
  base.specs = (Array.isArray(source.specs) ? source.specs : []).filter((line) => /^Cert:/i.test(String(line)));
  base.specGroups = specGroups;
  if (choices?.length) base.specChoices = choices;
  else rememberSource(base, rows);
  return base;
}

function uniqueLabels(rows, pick) {
  const labels = [];
  for (const row of rows) {
    const label = String(pick(row) || "").trim();
    if (label && !labels.includes(label)) labels.push(label);
  }
  return labels;
}

function vinylFloorSpecGroups() {
  return [
    {
      id: "vinyl-code",
      label: "編號 / 分類",
      labelEn: "Code / Category",
      keepOrder: true,
      options: [
        "Homogeneous Non-Directional (F2)",
        "Homogeneous Electico (F2a)",
        "Homogeneous Acoustic Vinyl (F2b)",
        "Homogeneous Directional (F2d)",
      ],
    },
    {
      id: "vinyl-slip",
      label: "防滑",
      labelEn: "Slip Resistance",
      keepOrder: true,
      options: ["R9", "R10", "R11"],
    },
    {
      id: "vinyl-fire",
      label: "防火反應",
      labelEn: "Reaction to Fire",
      keepOrder: true,
      options: ["B1"],
    },
    {
      id: "vinyl-size",
      label: "尺寸 (厚度 x 闊度 x 長度)",
      labelEn: "Size (thickness x width x length)",
      keepOrder: true,
      options: ["2.0mm x 2m x 20m", "Customize Size"],
    },
    {
      id: "vinyl-thickness",
      label: "厚度",
      labelEn: "Thickness",
      field: "thickness",
      unit: "mm",
      dependsOn: "vinyl-size",
    },
    {
      id: "vinyl-width",
      label: "闊度",
      labelEn: "Width",
      field: "width",
      unit: "m",
      dependsOn: "vinyl-size",
    },
    {
      id: "vinyl-length",
      label: "長度",
      labelEn: "Length",
      field: "length",
      unit: "m",
      dependsOn: "vinyl-size",
    },
  ];
}

function vinylGroups(rows) {
  const imageOf = (pattern) => {
    const row = rows.find((item) => pattern.test(`${item.name || ""} ${item.parentProduct || ""}`));
    return String(row?.image || row?.imageUrl || "");
  };
  const option = (label, image) => (image ? { label, image } : label);
  return [
    {
      id: "vinyl-type",
      label: "分類 1",
      labelEn: "Category 1",
      options: [
        option("Homogenous Vinyl", imageOf(/homogen/i)),
        option("Heterogeneous Vinyl", imageOf(/heter/i)),
      ],
    },
  ];
}

function ratingGroup(rows) {
  const options = uniqueLabels(rows, (row) => row.variant || String(row.name || "").split("—").pop());
  return [{ id: "tile-rating", label: "分類 1", labelEn: "Category 1", options }];
}

function seriesKey(product) {
  const parent = String(product?.parentProduct || "").trim();
  if (parent) return parent;
  const name = String(product?.name || "");
  const comma = name.lastIndexOf(", ");
  const english = comma >= 0 ? name.slice(comma + 2).split(" — ")[0].trim() : "";
  if (english === "Artistic Background") return "Artisitc background";
  if (english === "Texture · Sintered Stone") return "Textrue · Sintered Stone";
  return english;
}

function tileDimension(label) {
  return String(label || "").replace(/\s+/g, "").replace(/[x×]/gi, "*");
}

/** "600*600mm R10" and "600*600mm Matt surface-R9 …" keep the dimension separate from surface and slip rating. */
function parseTileFacet(label) {
  const text = String(label || "").replace(/\s+/g, " ").trim();
  const match = text.match(/^(\d+(?:\.\d+)?(?:\s*[*x×]\s*\d+(?:\.\d+)?){1,2}\s*mm)\b\s*(.*)$/i);
  if (!match) return { size: text, parts: [] };
  const size = tileDimension(match[1]);
  const rest = match[2].trim();
  if (!rest) return { size, parts: [] };
  if (/^glazed$/i.test(rest)) return { size, parts: [{ surface: "Glazed", rating: "" }] };
  if (/^R\d{1,2}$/i.test(rest)) return { size, parts: [{ surface: "", rating: rest.toUpperCase() }] };
  const parts = [];
  const surfaces = /(Matt|Rough|Cloth)\s+surface\s*-?\s*(R\d{1,2})/gi;
  let found = surfaces.exec(rest);
  while (found) {
    const word = found[1].toLowerCase();
    parts.push({
      surface: `${word.charAt(0).toUpperCase()}${word.slice(1)} surface`,
      rating: found[2].toUpperCase(),
    });
    found = surfaces.exec(rest);
  }
  if (parts.length) return { size, parts };
  return { size: text, parts: [] };
}

function ceramicSpec(rows) {
  const series = [];
  const sizes = [];
  const surfaces = [];
  const slips = [];
  const seenSeries = new Set();
  const seenSize = new Set();
  const seenSurface = new Set();
  const seenSlip = new Set();
  const choices = [];
  for (const row of rows) {
    const name = seriesKey(row);
    if (!name) continue;
    if (!seenSeries.has(name)) {
      seenSeries.add(name);
      series.push(name);
    }
    const parsed = parseTileFacet(tileSizeLabel(row));
    const sizeKey = `${name}::${parsed.size}`;
    if (parsed.size && !seenSize.has(sizeKey)) {
      seenSize.add(sizeKey);
      sizes.push({ label: parsed.size, parent: name, key: sizeKey });
    }
    const parts = parsed.parts.length ? parsed.parts : [null];
    for (const part of parts) {
      const picks = { "tile-series": name };
      if (parsed.size) picks["tile-size"] = sizeKey;
      if (part?.surface) {
        const surfaceKey = `${sizeKey}::${part.surface}`;
        if (!seenSurface.has(surfaceKey)) {
          seenSurface.add(surfaceKey);
          surfaces.push({ label: part.surface, parent: sizeKey, key: surfaceKey });
        }
        picks["tile-surface"] = surfaceKey;
      }
      if (part?.rating) {
        const slipParent = part.surface ? `${sizeKey}::${part.surface}` : sizeKey;
        const slipKey = `${slipParent}::${part.rating}`;
        if (!seenSlip.has(slipKey)) {
          seenSlip.add(slipKey);
          const option = { label: part.rating, parent: sizeKey, key: slipKey };
          if (part.surface) {
            option.with = slipParent;
            option.withGroup = "tile-surface";
          }
          slips.push(option);
        }
        picks["tile-slip"] = slipKey;
      }
      choices.push({ picks, ...orderFacts(row) });
    }
  }
  series.sort((a, b) => a.localeCompare(b));
  const groups = [{ id: "tile-series", label: "分類 1", labelEn: "Category 1", options: series }];
  if (sizes.length) {
    groups.push({
      id: "tile-size",
      label: "分類 2",
      labelEn: "Category 2",
      dependsOn: "tile-series",
      options: sizes,
    });
  }
  if (surfaces.length) {
    groups.push({
      id: "tile-surface",
      label: "分類 3",
      labelEn: "Category 3",
      dependsOn: "tile-size",
      options: surfaces,
    });
  }
  if (slips.length) {
    groups.push({
      id: "tile-slip",
      label: "分類 4",
      labelEn: "Category 4",
      dependsOn: "tile-size",
      options: slips,
    });
  }
  return { groups, choices };
}

function marbleGroups(rows) {
  const design = rows.filter((row) => row.parentProduct === "Marble Design Series" || String(row.category || "") === MARBLE_CATEGORY);
  const rated = rows.filter((row) => row.parentProduct === "Natural Marble Tiles");
  const designImage = design.find((row) => row.image)?.image || "";
  const ratedImage = rated.find((row) => row.image)?.image || "";
  const kinds = [];
  if (design.length) kinds.push(designImage ? { label: "Marble Design Series", image: designImage } : "Marble Design Series");
  for (const label of uniqueLabels(rated, (row) => row.variant)) {
    kinds.push(ratedImage ? { label, image: ratedImage } : label);
  }
  const sizes = uniqueLabels(design, tileSizeLabel).map((label) => ({ label, parent: "Marble Design Series" }));
  const groups = [{ id: "marble-kind", label: "分類 1", labelEn: "Category 1", options: kinds }];
  if (sizes.length) {
    groups.push({
      id: "marble-size",
      label: "分類 2",
      labelEn: "Category 2",
      dependsOn: "marble-kind",
      options: sizes,
    });
  }
  return groups;
}

export function foldTiles(products) {
  const buckets = {
    homogenous: [],
    ceramic: [],
    marble: [],
    roof: [],
    tactile: [],
    vinyl: [],
    mosaic: [],
    slip: [],
  };
  const rest = [];
  let insertAt = -1;
  for (const product of products || []) {
    const role = tileRole(product);
    if (!role) {
      rest.push(product);
      continue;
    }
    if (insertAt < 0) insertAt = rest.length;
    buckets[role].push(product);
  }
  if (insertAt < 0) return products || [];
  const ceramic = ceramicSpec(buckets.ceramic);
  const folded = [
    finishTile(buckets.homogenous, "MKT-LOC-SS97X4VR-001", "通體磚, Homogenous Tile", ratingGroup(buckets.homogenous)),
    finishTile(buckets.ceramic, "MKT-T-0001", "瓷磚, Ceramic Tiles", ceramic.groups, ceramic.choices),
    finishTile(buckets.marble, "MKT-T-0007", "天然大理石磚, Natural Marble Tile", marbleGroups(buckets.marble)),
    finishTile(buckets.roof, "MKT-LOC-H88YVLMY-001", "屋面瓦, Roof Tile", ratingGroup(buckets.roof)),
    finishTile(buckets.tactile, "MKT-LOC-F7KUYGFV-001", "觸覺引路磚, Tactile Tile", ratingGroup(buckets.tactile)),
    finishTile(buckets.vinyl, "MKT-LOC-ZC0456CR-001", "膠地板, Vinyl Tile", vinylGroups(buckets.vinyl)),
    finishTile(buckets.mosaic, "MKT-LOC-WJMMHU9P-001", "馬賽克, Mosaic Tile", [
      { id: "mosaic-size", label: "分類 1", labelEn: "Category 1", options: uniqueLabels(buckets.mosaic, tileSizeLabel) },
    ]),
    finishTile(buckets.slip, "MKT-LOC-YFE22YRE-001", "防滑瓷磚, Ceramic Tiles R7–R11", [
      { id: "slip-rating", label: "分類 1", labelEn: "Category 1", options: ["R7", "R8", "R9", "R10", "R11"] },
    ]),
  ].filter(Boolean);
  return [...rest.slice(0, insertAt), ...folded, ...rest.slice(insertAt)];
}

const TIMBER_CATEGORY = "木材、夾板, Timber / Plywood";
const TIMBER_TOLERANCE = "(with +/- 1mm to tolerance)";

const TIMBER_FOLDS = [
  {
    kind: "white-faced",
    match: /White faced Plywood/i,
    name: "白板夾板, FSC White Faced Plywood",
    aliases: ["White faced Plywood", "白板夾板"],
    withThickness: true,
    dropThickness: ["17mm"],
    grade: "F2",
    thicknessNote: "with +/- 1mm to tolerance",
    spec: "FSC & BS1455:1972",
    shopCategoryId: "plywood",
  },
  {
    kind: "red-faced",
    match: /Red faced Plywood/i,
    name: "紅板夾板, FSC Red Faced Plywood",
    aliases: ["Red faced Plywood", "紅板夾板"],
    withThickness: true,
    dropThickness: ["17mm"],
    grade: "F3",
    thicknessNote: "with +/- 1mm to tolerance",
    spec: "FSC & BS1455:1972",
    shopCategoryId: "plywood",
  },
  {
    kind: "filmface",
    match: /Film\s*face Plywood/i,
    name: "菲林板 - FSC Faced Plywood",
    aliases: ["Filmface Plywood", "Film Face Plywood", "菲林板"],
    withThickness: true,
    dropThickness: ["17mm"],
    thicknessNote: "with +/- 1mm to tolerance",
    spec: "FSC & BS1455:1972",
    shopCategoryId: "film-face-plywood",
  },
  {
    kind: "softwood",
    match: /\bSoftwood\b/i,
    name: "木方, PEFC Softwood",
    aliases: ["Softwood", "木方", "木方（加拿大）", "PEFC Softwood"],
    withThickness: false,
    tolerance: false,
    spec: "FSC & BS1455:1972",
    shopCategoryId: "softwood",
    lengths: ["4m (13.17')", "Customize"],
    sizeLabels: {
      "1\" x 4\" 4M (13.17') long": "1\" x 4\" 4M",
      "2\" x 3\" x 4M (13.17') long": "2\" x 3\" 4M",
      "2\" x 4\" 4M (13.17') long": "2\" x 4\" 4M",
    },
    sizeOrder: ["1\" x 4\" 4M", "2\" x 3\" 4M", "2\" x 4\" 4M"],
  },
];

function timberParts(product) {
  const bits = String(product?.sizeDesc || "")
    .split(/\s*·\s*/)
    .map((bit) => String(bit || "").trim())
    .filter(Boolean);
  if (bits.length >= 3) return { size: bits[0], thickness: bits[1], grade: bits[2] };
  if (bits.length === 2) return { size: bits[0], thickness: "", grade: bits[1] };
  if (bits.length === 1) return { size: bits[0], thickness: "", grade: "" };
  return { size: "", thickness: "", grade: "" };
}

function timberKind(product) {
  if (String(product?.category || "") !== TIMBER_CATEGORY) return "";
  const name = String(product?.name || "");
  // Need a concrete size/grade row (listed or sheet SKU), not the category stub alone.
  const parts = timberParts(product);
  const sized = Boolean(parts.size && (parts.thickness || parts.grade || /—/.test(name)));
  if (!sized && !/^MKT-(LIST|SHEET)-/i.test(String(product?.productNo || ""))) return "";
  if (!sized) return "";
  for (const spec of TIMBER_FOLDS) {
    if (spec.match.test(name)) return spec.kind;
  }
  return "";
}

function timberThicknessKey(size, thickness) {
  return `${size}::${thickness}`;
}

function timberDisplaySize(spec, size) {
  const map = spec?.sizeLabels;
  if (!map) return size;
  if (!Object.prototype.hasOwnProperty.call(map, size)) return "";
  return String(map[size] || size);
}

function timberGroups(rows, spec) {
  const withThickness = spec?.withThickness !== false;
  const drop = new Set((spec?.dropThickness || []).map((item) => String(item).trim().toLowerCase()));
  const sizes = [];
  const thicknessOpts = [];
  const gradeOpts = [];
  const seenSize = new Set();
  const seenThick = new Set();
  const seenGrade = new Set();
  for (const row of rows) {
    const parts = timberParts(row);
    const size = timberDisplaySize(spec, parts.size);
    const { thickness, grade } = parts;
    if (!size) continue;
    if (drop.has(String(thickness).trim().toLowerCase())) continue;
    if (!seenSize.has(size)) {
      seenSize.add(size);
      sizes.push(size);
    }
    if (withThickness && thickness) {
      const thickKey = timberThicknessKey(size, thickness);
      if (!seenThick.has(thickKey)) {
        seenThick.add(thickKey);
        thicknessOpts.push({ label: thickness, parent: size, key: thickKey });
      }
      if (!spec?.grade && grade) {
        const gradeKey = `${thickKey}::${grade}`;
        if (!seenGrade.has(gradeKey)) {
          seenGrade.add(gradeKey);
          gradeOpts.push({ label: grade, parent: thickKey, key: gradeKey });
        }
      }
    } else if (!spec?.grade && grade) {
      const gradeKey = `${size}::${grade}`;
      if (!seenGrade.has(gradeKey)) {
        seenGrade.add(gradeKey);
        gradeOpts.push({ label: grade, parent: size, key: gradeKey });
      }
    }
  }
  if (Array.isArray(spec?.lengths) && spec.lengths.length) {
    const order = spec.sizeOrder || [];
    const ordered = [...sizes].sort((a, b) => {
      const left = order.indexOf(a);
      const right = order.indexOf(b);
      if (left < 0 && right < 0) return 0;
      if (left < 0) return 1;
      if (right < 0) return -1;
      return left - right;
    });
    return [
      { id: "ply-size", label: "尺寸", labelEn: "Size", keepOrder: true, options: ordered },
      {
        id: "ply-length",
        label: "長度",
        labelEn: "Length",
        dependsOn: "ply-size",
        keepOrder: true,
        customText: true,
        options: ordered.flatMap((size) => spec.lengths.map((label) => ({ label, parent: size }))),
      },
    ];
  }
  const groups = [
    { id: "ply-size", label: "尺寸", labelEn: "Size", options: sizes },
    {
      id: "ply-thickness",
      label: "厚度 (mm)",
      labelEn: "Thickness (mm)",
      dependsOn: "ply-size",
      note: spec?.thicknessNote || "",
      options: thicknessOpts,
    },
  ];
  if (spec?.grade) {
    groups.push({ id: "ply-grade", label: "等級", labelEn: "Grade", keepOrder: true, options: [spec.grade] });
  } else if (gradeOpts.length) {
    groups.push({
      id: "ply-grade",
      label: "等級",
      labelEn: "Grade",
      dependsOn: withThickness ? "ply-thickness" : "ply-size",
      options: gradeOpts,
    });
  }
  return groups.filter((group) => (group.options || []).length > 0);
}

function timberChoices(rows, groups, spec) {
  const withThickness = spec?.withThickness !== false;
  const drop = new Set((spec?.dropThickness || []).map((item) => String(item).trim().toLowerCase()));
  const seen = new Set();
  const choices = [];
  for (const row of rows) {
    const parts = timberParts(row);
    const size = timberDisplaySize(spec, parts.size);
    const { thickness, grade } = parts;
    if (!size) continue;
    if (drop.has(String(thickness).trim().toLowerCase())) continue;
    const picks = { "ply-size": size };
    if (withThickness && thickness) picks["ply-thickness"] = timberThicknessKey(size, thickness);
    if (spec?.grade) picks["ply-grade"] = spec.grade;
    else if (withThickness && thickness && grade) picks["ply-grade"] = `${picks["ply-thickness"]}::${grade}`;
    else if (grade) picks["ply-grade"] = `${size}::${grade}`;
    const groupIds = new Set((groups || []).map((group) => group.id));
    for (const key of Object.keys(picks)) {
      if (!groupIds.has(key)) delete picks[key];
    }
    if (!Object.keys(picks).length) continue;
    const signature = JSON.stringify(picks);
    if (seen.has(signature)) continue;
    seen.add(signature);
    const facts = orderFacts(row);
    // Keep buyer description as the tolerance note — do not leak host plywood essays into picks.
    if (spec?.grade) {
      facts.detail = [size, thickness, spec.grade].filter(Boolean).join(" · ");
      if (Array.isArray(facts.specs)) {
        facts.specs = facts.specs.map((line) => (/^size\s*:/i.test(line) ? `Size: ${facts.detail}` : line));
      }
    }
    if (spec?.sizeLabels) {
      facts.detail = size;
      if (Array.isArray(facts.specs)) {
        facts.specs = facts.specs.map((line) => (/^size\s*:/i.test(line) ? `Size: ${size}` : line));
      }
    }
    if (spec?.thicknessNote) delete facts.summary;
    else if (spec?.tolerance !== false) facts.summary = TIMBER_TOLERANCE;
    else delete facts.summary;
    choices.push({ picks, ...facts });
  }
  return choices;
}

const TIMBER_CARD_IMAGES = {
  "white-faced": "/assets/timber/white-faced-plywood.jpg?v=1",
  "red-faced": "/assets/timber/red-faced-plywood.jpg?v=1",
  filmface: "/assets/timber/film-faced-plywood.jpg?v=1",
  softwood: "/assets/timber/softwood.jpg?v=1",
  triangle: "/assets/timber/triangle-string.jpg?v=1",
};

function applyCardImage(product, src) {
  if (!product || !src) return product;
  product.image = src;
  product.images = [src];
  product.imageFallback = src.split("?")[0];
  return product;
}

function foldedTimber(list, spec) {
  if (!list.length) return null;
  list.sort((a, b) => String(a.productNo || "").localeCompare(String(b.productNo || "")));
  const base = { ...list[0] };
  applyCardImage(base, TIMBER_CARD_IMAGES[spec.kind]);
  base.name = spec.name;
  base.category = TIMBER_CATEGORY;
  if (spec.shopCategoryId) base.shopCategoryId = spec.shopCategoryId;
  base.sizeDesc = "";
  base.primarySpec = "";
  base.parentProduct = "";
  base.variant = "";
  base.description = spec.thicknessNote || spec.tolerance === false ? "" : TIMBER_TOLERANCE;
  if (spec.aliases?.length) base.searchAliases = spec.aliases;
  base.specGroups = timberGroups(list, spec);
  if (spec?.spec) {
    base.certifications = spec.spec;
    base.standard = spec.spec;
    const specs = (Array.isArray(base.specs) ? base.specs : []).filter((line) => !/^Cert:\s*/i.test(String(line)));
    base.specs = [...specs, `Cert: ${spec.spec}`];
  }
  if (Array.isArray(spec?.lengths) && spec.lengths.length) {
    base.specs = (Array.isArray(base.specs) ? base.specs : []).filter((line) => !/CF\/PC|Grade\s+[A-Z0-9]/i.test(String(line)));
  }
  const choices = timberChoices(list, base.specGroups, spec);
  if (choices.length) base.specChoices = choices;
  return base;
}

/** Host category stubs replaced by the listed Size→Thickness→Grade folds. */
function isTimberStub(product, foldedKinds) {
  if (String(product?.category || "") !== TIMBER_CATEGORY) return false;
  const name = String(product?.name || "").trim();
  const english = name.includes(", ") ? name.slice(name.lastIndexOf(", ") + 2).trim() : name;
  if (foldedKinds.has("filmface") && /^Film\s*Face Plywood$/i.test(english) && !/—/.test(english)) return true;
  if ((foldedKinds.has("white-faced") || foldedKinds.has("red-faced") || foldedKinds.has("filmface")) && /^Plywood$/i.test(english) && !/—/.test(english)) {
    return true;
  }
  // "木材, Timber" stays so the shop can move it into flooring.
  return false;
}

function presentTriangleString(product) {
  const sizes = ["25mm x 25mm", "20mm x 20mm"];
  const specs = (Array.isArray(product?.specs) ? product.specs : []).filter((line) => {
    const text = String(line);
    if (/^(Cert|Size|Packing)\s*:/i.test(text)) return false;
    if (/10\s*["”″]|25mm\s*[×x]/i.test(text)) return false;
    return true;
  });
  return {
    ...product,
    name: "三角線 - Non-FSC Timber Triangle String",
    shopCategoryId: "non-fsc-timber-triangle",
    sizeDesc: "",
    primarySpec: "",
    specifications: "",
    description: "",
    certifications: "",
    standard: "",
    specs,
    specGroups: [
      { id: "triangle-size", label: "尺寸", labelEn: "Size", keepOrder: true, options: sizes.map((label) => ({ label })) },
      {
        id: "triangle-length",
        label: "長度",
        labelEn: "Length",
        dependsOn: "triangle-size",
        keepOrder: true,
        options: sizes.map((size) => ({ label: "3m", parent: size })),
      },
    ],
  };
}

/** Collapse listed White/Red/Filmface plywood (+ Softwood) into Size → Thickness → Grade pickers. */
export function foldTimberPlywood(products) {
  const buckets = Object.fromEntries(TIMBER_FOLDS.map((spec) => [spec.kind, []]));
  const rest = [];
  let insertAt = -1;
  for (const product of products || []) {
    const kind = timberKind(product);
    if (!kind) {
      rest.push(product);
      continue;
    }
    if (insertAt < 0) insertAt = rest.length;
    buckets[kind].push(product);
  }
  const folded = TIMBER_FOLDS.map((spec) => foldedTimber(buckets[spec.kind], spec)).filter(Boolean);
  if (!folded.length) return products || [];
  const foldedKinds = new Set(TIMBER_FOLDS.filter((spec) => buckets[spec.kind].length).map((spec) => spec.kind));
  const cleaned = rest.filter((product) => !isTimberStub(product, foldedKinds)).map((product) => {
    if (/Triangle String|三角線/i.test(String(product?.name || ""))) {
      return presentTriangleString(applyCardImage({ ...product }, TIMBER_CARD_IMAGES.triangle));
    }
    return product;
  });
  const removed = rest.length - cleaned.length;
  const at = Math.max(0, (insertAt < 0 ? cleaned.length : insertAt) - removed);
  return [...cleaned.slice(0, at), ...folded, ...cleaned.slice(at)];
}

const REBAR_CATEGORY = "鋼筋網, Reinforcement Mesh";
const REBAR_STANDARD = "British Standard: BS 4483:2005; BS 4449:2005";
const REBAR_CUSTOM = "Customize Size";

const REBAR_FAMILIES = [
  {
    id: "mkt-mesh-a142",
    name: "方格鋼筋網, Square Mesh Fabric",
    shopCategoryId: "mesh-2",
    moq: 90,
    rows: [
      ["A142", "22.38", "2.1m x 4.8m", "MKT-MESH-A142"],
      ["A252", "39.82", "2.1m x 4.8m", "MKT-MESH-A252"],
      ["A393", "62.09", "2.1m x 4.8m", "MKT-MESH-A393"],
      ["B503", "59.77", "2.1m x 4.8m", "MKT-MESH-B503"],
      ["C283", "28.02", "2.1m x 4.8m", "MKT-MESH-C283"],
      ["C503", "45.46", "2.1m x 4.8m", "MKT-MESH-C503"],
      ["B1131", "109.87", "2.1m x 4.8m", "MKT-MESH-B1131"],
      ["B785", "82.05", "2.1m x 4.8m", "MKT-MESH-B785"],
      ["C785", "67.74", "2.1m x 4.8m", "MKT-MESH-C785"],
    ],
  },
  {
    id: "mkt-mesh-structural",
    name: "建築物結構網, Structural Mesh Fabric",
    rows: [
      ["B385", "45.66", "2.1 × 4.8 m", "MKT-MESH-B385"],
    ],
  },
  {
    id: "mkt-mesh-long",
    name: "長格鋼筋網, Long Mesh Fabric",
    rows: [
      ["C385", "36.09", "2.1 × 4.8 m", "MKT-MESH-C385"],
    ],
  },
  {
    id: "mkt-mesh-wrapping",
    name: "小方格鋼筋網, Wrapping Mesh Fabric",
    rows: [
      ["D98", "15.52", "2.1 × 4.8 m", "MKT-MESH-D98"],
      ["D49", "5.82", "2.1 × 3.6 m", "MKT-MESH-D49"],
    ],
  },
];

function rebarSpecGroups(rows, spec = {}) {
  const moq = spec.moq ?? 1;
  const groups = [
    {
      id: "mesh-ref",
      label: spec.refLabel || "英國標準編號",
      labelEn: spec.refLabelEn || "BS Ref.No.",
      keepOrder: true,
      options: rows.map(([code, , , sku]) => ({
        label: code,
        key: code,
        sku,
        moq,
        unit: "sheet",
      })),
    },
  ];
  if (spec.mass !== false) {
    groups.push({
      id: "mesh-mass",
      label: "網片重量",
      labelEn: "Mass Per Sheet",
      dependsOn: "mesh-ref",
      keepOrder: true,
      options: rows.map(([code, mass]) => ({
        label: `${mass} kg`,
        key: `${mass} kg`,
        parent: code,
      })),
    });
  }
  groups.push(
    {
      id: "mesh-size",
      label: spec.sizeLabel || "網片規格",
      labelEn: spec.sizeLabelEn || "Size of Sheet",
      dependsOn: "mesh-ref",
      keepOrder: true,
      options: [
        ...rows.map(([code, , size]) => ({ label: size, key: size, parent: code })),
        ...rows.map(([code]) => ({ label: REBAR_CUSTOM, key: REBAR_CUSTOM, parent: code })),
      ],
    },
    {
      id: "mesh-width",
      label: "闊度",
      labelEn: "Width",
      field: "width",
      unit: "m",
      dependsOn: "mesh-size",
    },
    {
      id: "mesh-length",
      label: "長度",
      labelEn: "Length",
      field: "length",
      unit: "m",
      dependsOn: "mesh-size",
    },
  );
  return groups;
}

function isRebarRow(product) {
  if (String(product?.category || "") === REBAR_CATEGORY) return true;
  const name = String(product?.name || "");
  return /Square Reinforcement Mesh|Building Structural Mesh|Rectangular Reinforcement Mesh|方格鋼筋網 —|結構用鋼筋網 —|長方格鋼筋網 —/.test(name);
}

export function foldReinforcementMesh(products) {
  const rows = [];
  const rest = [];
  let insertAt = -1;
  for (const product of products || []) {
    if (!isRebarRow(product)) {
      rest.push(product);
      continue;
    }
    if (insertAt < 0 && String(product?.category || "") === REBAR_CATEGORY) insertAt = rest.length;
    rows.push(product);
  }
  if (!rows.some((product) => String(product?.category || "") === REBAR_CATEGORY)) return products || [];
  const image = rows.find((product) => String(product?.category || "") === REBAR_CATEGORY && product.image)?.image || "/assets/prod-mesh.webp";
  const imageFallback = rows.find((product) => product.imageFallback)?.imageFallback || "/assets/prod-mesh.webp";
  const folded = REBAR_FAMILIES.map((family) => {
    const base = {
      ...(rows.find((product) => product.productNo === "MKT-MESH-A142") || rows[0]),
    };
    base.id = family.id;
    base.name = family.name;
    base.category = REBAR_CATEGORY;
    base.productNo = family.rows[0][3];
    base.provisionalSku = family.rows[0][3];
    base.parentProduct = "";
    base.variant = "";
    base.sizeDesc = "";
    base.description = "";
    base.primarySpec = "";
    base.specs = [];
    base.specifications = "";
    base.standard = REBAR_STANDARD;
    base.certifications = "";
    base.unit = "sheet";
    base.salesUnit = "sheet";
    base.moq = family.moq || 1;
    if (family.shopCategoryId) base.shopCategoryId = family.shopCategoryId;
    base.unit_price = null;
    base.price = null;
    base.priceUponRequest = true;
    base.listedPrice = false;
    base.quote = null;
    base.hit = false;
    base.tailorMade = false;
    base.image = image;
    base.images = [image];
    base.imageFallback = imageFallback;
    base.specGroups = rebarSpecGroups(family.rows, family.id === "mkt-mesh-a142" ? {
      moq: 90,
      mass: false,
      refLabel: "型號",
      refLabelEn: "Model",
      sizeLabel: "尺寸",
      sizeLabelEn: "Size",
    } : {});
    delete base.specChoices;
    return base;
  });
  const at = insertAt < 0 ? rest.length : insertAt;
  return [...rest.slice(0, at), ...folded, ...rest.slice(at)];
}

const MARKET_CATEGORY_RENAMES = {
  "Aggregate 石料": "石料, Aggregate",
  "板材, Board": "板, Board",
  "鋼筋網, Reinforcement Mesh": "網, Mesh",
  "預製混凝土, Precasted Concrete": "預製混凝土製品, Precast Concrete Products",
  "磚、砌塊, Brick & Block": "沙磚, Brick & Block",
  "喉管、配件, Pipe & Fittings & Accessories": "管道及配件, Pipe & Fittings & Accessories",
  "批盪, Plastering": "泥水工程, Plastering",
  "瓷磚, Tiles": "磚, Tile",
  "木材、夾板, Timber / Plywood": "木板/夾板, Timber / Plywood",
  Software: "數位與科技服務, Digital & Technology Services",
  "結構鋼、金屬製品, Structure Steel Element, Metal Product": "結構性鋼材、金屬製品, Structure Steel Element, Metal Product",
};

function marketShell(template, id, sku, name, category) {
  const base = { ...(template || {}) };
  base.id = id;
  base.productNo = sku;
  base.provisionalSku = sku;
  base.name = name;
  base.category = category;
  base.sizeDesc = "";
  base.description = "";
  base.primarySpec = "";
  base.parentProduct = "";
  base.variant = "";
  base.specs = [];
  base.specifications = "";
  base.specGroups = [];
  base.purposes = [];
  base.certifications = "";
  base.standard = "";
  base.image = "";
  base.images = [];
  base.imageUrl = "";
  base.imageFallback = "";
  base.unit_price = null;
  base.price = null;
  base.priceUponRequest = true;
  base.quote = null;
  base.moq = 1;
  delete base.shopCategoryId;
  delete base.shopCategoryIds;
  delete base.specChoices;
  return base;
}

function bilingualCut(name) {
  const text = String(name || "").replace(/\s+/g, " ").trim();
  let from = 0;
  let cut = -1;
  while (from < text.length) {
    const comma = text.indexOf(", ", from);
    if (comma < 0) break;
    const left = text.slice(0, comma).trim();
    const right = text.slice(comma + 2).trim();
    let depth = 0;
    let balanced = true;
    for (const char of left) {
      if (char === "(") depth += 1;
      else if (char === ")") depth -= 1;
      if (depth < 0) balanced = false;
    }
    if (depth !== 0) balanced = false;
    if (
      balanced &&
      /[\u4e00-\u9fff]/.test(left) &&
      right &&
      !/[\u4e00-\u9fff]/.test(right) &&
      /^[A-Z]/.test(right)
    ) {
      cut = comma;
      const leftTail = left.split(/\s+[—–]\s+/).slice(1).join(" — ");
      const rightTail = right.split(/\s+[—–]\s+/).slice(1).join(" — ");
      if (leftTail && leftTail === rightTail) return comma;
    }
    from = comma + 2;
  }
  return cut;
}

function englishHead(name) {
  const text = String(name || "").replace(/\s+/g, " ").trim();
  const cut = bilingualCut(text);
  const right = cut >= 0 ? text.slice(cut + 2).trim() : text;
  return right.split(/\s+[—–]\s+/)[0].trim();
}

function optionLabel(product) {
  const text = String(product?.name || "").replace(/\s+/g, " ").trim();
  const cut = bilingualCut(text);
  const left = cut >= 0 ? text.slice(0, cut).trim() : text;
  const parts = left.split(/\s+[—–]\s+/).map((part) => part.trim()).filter(Boolean);
  if (parts.length > 1) return parts[1];
  const variant = String(product?.variant || "").trim();
  const variantParts = variant.split(/\s+[—–]\s+/).map((part) => part.trim()).filter(Boolean);
  if (variantParts.length > 1) return variantParts[variantParts.length - 1];
  if (variant && variant !== parts[0]) return variant;
  return "";
}

function retitleProducts(products, test, name, category) {
  let found = false;
  for (const product of products) {
    if (!test(product)) continue;
    product.name = name;
    product.category = category;
    found = true;
  }
  return found;
}

function oneMarketProduct(products, spec) {
  const rows = [];
  const rest = [];
  for (const product of products) {
    if (spec.test(product)) rows.push(product);
    else rest.push(product);
  }
  const template = rows[0] || products[0];
  if (!template) return products;
  const base = rows.length ? { ...rows[0] } : marketShell(template, spec.id, spec.sku, spec.name, spec.category);
  base.name = spec.name;
  base.category = spec.category;
  if (!rows.length) {
    base.id = spec.id;
    base.productNo = spec.sku;
    base.provisionalSku = spec.sku;
  } else if (rows.length === 1) {
    base.sizeDesc = rows[0].sizeDesc;
    base.description = rows[0].description;
    base.specGroups = rows[0].specGroups;
    base.specChoices = rows[0].specChoices;
  } else {
    const options = [];
    const seen = new Set();
    const choiceRows = [];
    for (const row of rows) {
      const option = optionLabel(row);
      if (!option || seen.has(option)) continue;
      seen.add(option);
      options.push(option);
      choiceRows.push(row);
    }
    base.sizeDesc = "";
    base.parentProduct = "";
    base.variant = "";
    base.description = "";
    base.primarySpec = "";
    if (options.length > 1) {
      base.specGroups = [{
        id: spec.groupId,
        label: spec.label,
        labelEn: spec.labelEn,
        options,
      }];
      base.specChoices = choiceRows.map((row) => ({
        picks: { [spec.groupId]: optionLabel(row) },
        ...orderFacts(row),
      }));
    }
  }
  const at = products.findIndex((product) => spec.test(product));
  rest.splice(at < 0 ? rest.length : at, 0, base);
  return rest;
}

export function applyMarketList(products) {
  let next = (products || []).map((product) => {
    const category = MARKET_CATEGORY_RENAMES[String(product?.category || "")];
    return category ? { ...product, category } : product;
  });
  const chemical = "化學品, Chemical Products";
  const flooring = "地板系統, Flooring System";
  const board = "板, Board";
  const mesh = "網, Mesh";
  const precast = "預製混凝土製品, Precast Concrete Products";
  next = oneMarketProduct(next, {
    test: (product) => /concrete additive|混凝土添加劑/i.test(product?.name || ""),
    name: "混凝土添加劑, Concrete Additive",
    category: chemical,
    id: "mkt-chemical-additive",
    sku: "MKT-CHEM-ADDITIVE",
    groupId: "chem-type",
    label: "類型",
    labelEn: "Type",
  });
  for (const product of next) {
    if (!/concrete additive|混凝土添加劑/i.test(product?.name || "")) continue;
    product.name = "乳化液, Emulsion";
    product.category = "泥水工程, Plastering";
    product.shopCategoryId = "plaster-concrete-additive";
    product.unit = "Pail";
    product.salesUnit = "Pail";
    product.description = "";
    product.primarySpec = "";
    product.sizeDesc = "";
    product.searchAliases = ["混凝土添加劑", "Concrete Additive"];
    product.specGroups = [{
      id: "emulsion-product",
      label: "產品",
      labelEn: "Product",
      keepOrder: true,
      options: [
        "Bonding agent and polymer additive",
        "Co-polymer emulsion",
        "Styrene acrylic co-polymer dispersion",
      ],
    }];
    product.specChoices = [];
    product.specs = (Array.isArray(product.specs) ? product.specs : [])
      .filter((line) => !/^(?:cert|grading)\s*:/i.test(String(line)))
      .map((line) => (/^Sales unit\s*:/i.test(String(line)) ? "Sales unit: Pail" : line));
  }
  next = oneMarketProduct(next, {
    test: (product) => /^base plaster$/i.test(englishHead(product?.name)) && /\d+\s*mpa/i.test(product?.name || ""),
    name: "底層批盪, Base Plaster",
    category: chemical,
    id: "mkt-chemical-plaster",
    sku: "MKT-CHEM-PLASTER",
    groupId: "plaster-grade",
    label: "等級",
    labelEn: "Grade",
  });
  for (const product of next) {
    if (!/^底層批盪, Base Plaster$/i.test(product?.name || "")) continue;
    product.category = "泥水工程, Plastering";
    product.shopCategoryId = "base-plaster";
    product.unit = "包";
    product.salesUnit = "包";
    product.certifications = "EN 1015";
    product.standard = "EN 1015";
    product.specGroups = [{
      id: "plaster-grade",
      label: "等級",
      labelEn: "Grading / Option",
      keepOrder: true,
      options: ["15MPa", "30MPa"],
    }];
    product.specs = (Array.isArray(product.specs) ? product.specs : [])
      .filter((line) => !/^cert\s*:/i.test(String(line)))
      .map((line) => (/^Sales unit\s*:/i.test(String(line)) ? "Sales unit: Bag" : line));
    if (Array.isArray(product.specChoices)) {
      product.specChoices = product.specChoices.map((choice) => {
        const raw = String(choice?.picks?.["plaster-grade"] || "").replace(/\s+/g, "");
        const grade = /^15/i.test(raw) ? "15MPa" : /^30/i.test(raw) ? "30MPa" : raw;
        return {
          ...choice,
          unit: "包",
          picks: { ...(choice.picks || {}), "plaster-grade": grade },
          specs: (Array.isArray(choice.specs) ? choice.specs : [])
            .filter((line) => !/^cert\s*:/i.test(String(line)))
            .map((line) => (/^Sales unit\s*:/i.test(String(line)) ? "Sales unit: Bag" : line)),
        };
      });
    }
  }
  const skimCert = ["BS EN 1015 - 11", "BS EN 1015 - 12", "BS 4551", "EN 13914", "BS 8481"].join("\n");
  next = oneMarketProduct(next, {
    test: (product) => /^skimcoat$/i.test(englishHead(product?.name)) && /\d+\s*mpa/i.test(product?.name || ""),
    name: "抹灰, Skimcoat",
    category: "泥水工程, Plastering",
    id: "mkt-skimcoat",
    sku: "MKT-SKIMCOAT",
    groupId: "skim-grade",
    label: "等級",
    labelEn: "Grading / Option",
  });
  for (const product of next) {
    if (!/^抹灰, Skimcoat$/i.test(product?.name || "")) continue;
    product.category = "泥水工程, Plastering";
    product.shopCategoryId = "skimcoat";
    product.unit = "包";
    product.salesUnit = "包";
    product.certifications = skimCert;
    product.standard = skimCert;
    product.description = "";
    product.primarySpec = "";
    product.sizeDesc = "";
    product.specGroups = [{
      id: "skim-grade",
      label: "等級",
      labelEn: "Grading / Option",
      keepOrder: true,
      options: ["6MPa", "11MPa", "15MPa"],
    }];
    product.specs = (Array.isArray(product.specs) ? product.specs : [])
      .filter((line) => !/^cert\s*:/i.test(String(line)))
      .map((line) => (/^Sales unit\s*:/i.test(String(line)) ? "Sales unit: 包" : line));
    if (Array.isArray(product.specChoices)) {
      product.specChoices = product.specChoices.map((choice) => {
        const raw = String(choice?.picks?.["skim-grade"] || "").replace(/\s+/g, "");
        const grade = /^6/i.test(raw) ? "6MPa" : /^11/i.test(raw) ? "11MPa" : /^15/i.test(raw) ? "15MPa" : raw;
        return {
          ...choice,
          unit: "包",
          summary: "",
          detail: "",
          picks: { ...(choice.picks || {}), "skim-grade": grade },
          specs: (Array.isArray(choice.specs) ? choice.specs : [])
            .filter((line) => !/^cert\s*:/i.test(String(line)))
            .map((line) => (/^Sales unit\s*:/i.test(String(line)) ? "Sales unit: 包" : line)),
        };
      });
    }
  }
  retitleProducts(next, (product) => /non-shrink grout|不收縮灌漿/i.test(product?.name || ""), "不收縮灌漿料, Non-shrink Grout", "泥水工程, Plastering");
  for (const product of next) {
    if (!/non-shrink grout|不收縮灌漿/i.test(product?.name || "")) continue;
    product.shopCategoryId = "plaster-non-shrink-grout";
  }
  for (const product of next) {
    const sku = String(product?.productNo || "").toUpperCase();
    if (!sku.startsWith("MKT-LOC-AM9Q2AQ8")) continue;
    product.category = "混凝土，水泥及砂, Cement & Sand";
    product.shopCategoryId = "cements";
    product.unit = "bag";
    product.salesUnit = "bag";
    product.certifications = "BS EN197-1:2011";
    product.standard = "BS EN197-1:2011";
    product.specs = (Array.isArray(product.specs) ? product.specs : []).map((line) => {
      if (/^cert\s*:/i.test(String(line))) return "Cert: BS EN197-1:2011";
      if (/^Sales unit\s*:/i.test(String(line))) return "Sales unit: bag";
      return line;
    });
  }
  for (const product of next) {
    const sku = String(product?.productNo || "").toUpperCase();
    if (!sku.startsWith("MKT-LOC-QNQFC7XL")) continue;
    product.category = "混凝土，水泥及砂, Cement & Sand";
    product.shopCategoryId = "sand";
    product.unit = "M_Ton / Bag";
    product.salesUnit = "M_Ton / Bag";
    product.certifications = "BS 812";
    product.standard = "BS 812";
    product.specs = (Array.isArray(product.specs) ? product.specs : []).map((line) => {
      if (/^cert\s*:/i.test(String(line))) return "Cert: BS 812";
      if (/^Sales unit\s*:/i.test(String(line))) return "Sales unit: M_Ton / Bag";
      return line;
    });
  }
  for (const product of next) {
    if (!/masonry mortar|砌築砂漿/i.test(product?.name || "")) continue;
    product.category = "泥水工程, Plastering";
    product.shopCategoryId = "masonry-mortar";
    product.unit = "Bag";
    product.salesUnit = "Bag";
    product.specs = (Array.isArray(product.specs) ? product.specs : []).map((line) => (
      /^Sales unit\s*:/i.test(String(line)) ? "Sales unit: Bag" : line
    ));
    if (Array.isArray(product.specChoices)) {
      product.specChoices = product.specChoices.map((choice) => ({
        ...choice,
        unit: "Bag",
        specs: (Array.isArray(choice.specs) ? choice.specs : []).map((line) => (
          /^Sales unit\s*:/i.test(String(line)) ? "Sales unit: Bag" : line
        )),
      }));
    }
  }
  for (const product of next) {
    const sku = String(product?.productNo || "").toUpperCase();
    if (!sku.startsWith("MKT-LOC-CM2ILACS")) continue;
    product.name = "瓷磚黏結劑, Tile Adhesive";
    product.category = "泥水工程, Plastering";
    product.shopCategoryId = "tile-adhesive";
    product.unit = "Bag";
    product.salesUnit = "Bag";
    product.searchAliases = ["瓷磚膠", "Tile Adhesive"];
    product.specs = (Array.isArray(product.specs) ? product.specs : []).map((line) => (
      /^Sales unit\s*:/i.test(String(line)) ? "Sales unit: Bag" : line
    ));
    if (Array.isArray(product.specChoices)) {
      product.specChoices = product.specChoices.map((choice) => ({
        ...choice,
        unit: "Bag",
        specs: (Array.isArray(choice.specs) ? choice.specs : []).map((line) => (
          /^Sales unit\s*:/i.test(String(line)) ? "Sales unit: Bag" : line
        )),
      }));
    }
  }
  for (const product of next) {
    const sku = String(product?.productNo || "").toUpperCase();
    if (!sku.startsWith("MKT-LOC-HOIZI7H1")) continue;
    const groutCert = "EN 12808\nBS 5980\nBS 6920";
    product.name = "瓷磚填縫劑, Tile Grout";
    product.category = "泥水工程, Plastering";
    product.shopCategoryId = "tile-grout";
    product.unit = "bag";
    product.salesUnit = "bag";
    product.certifications = groutCert;
    product.standard = groutCert;
    product.searchAliases = ["填縫劑", "Tile Grout"];
    product.specGroups = [
      { id: "grout-option", label: "選項", labelEn: "Option", keepOrder: true, options: ["2kg", "25kg"] },
      {
        id: "grout-color",
        label: "顏色",
        labelEn: "Color",
        keepOrder: true,
        options: [
          "White", "Light Grey", "Grey", "Dark Grey", "Almond", "Peach", "Bone", "Buff", "Charcoal",
          "Orange", "Yellow", "Light Green", "Apple Green", "Green", "Opal", "Pink", "Rose", "Tan",
          "Chocolate", "Brick", "Brown", "Light Blue", "Blue", "Black",
        ],
      },
    ];
    product.specs = (Array.isArray(product.specs) ? product.specs : [])
      .filter((line) => !/^cert\s*:/i.test(String(line)))
      .map((line) => (/^Sales unit\s*:/i.test(String(line)) ? "Sales unit: bag" : line));
  }
  for (const product of next) {
    const sku = String(product?.productNo || "").toUpperCase();
    if (!sku.startsWith("MKT-LOC-JVRAN0O6")) continue;
    product.category = "泥水工程, Plastering";
    product.shopCategoryId = "floor-screed";
    product.unit = "Bag";
    product.salesUnit = "Bag";
    product.specs = (Array.isArray(product.specs) ? product.specs : []).map((line) => (
      /^Sales unit\s*:/i.test(String(line)) ? "Sales unit: Bag" : line
    ));
    if (Array.isArray(product.specChoices)) {
      product.specChoices = product.specChoices.map((choice) => ({
        ...choice,
        unit: "Bag",
        specs: (Array.isArray(choice.specs) ? choice.specs : []).map((line) => (
          /^Sales unit\s*:/i.test(String(line)) ? "Sales unit: Bag" : line
        )),
      }));
    }
  }
  for (const product of next) {
    const sku = String(product?.productNo || "").toUpperCase();
    if (!sku.startsWith("MKT-LOC-Q87LE913")) continue;
    product.category = "泥水工程, Plastering";
    product.shopCategoryId = "self-levelling-screed";
    product.specGroups = [
      {
        id: "screed-product",
        label: "產品",
        labelEn: "Product",
        keepOrder: true,
        options: ["30 MPa", "35 MPa", "40 MPa"],
      },
      {
        id: "screed-color",
        label: "顏色",
        labelEn: "color",
        keepOrder: true,
        dependsOn: "screed-product",
        when: ["30 MPa"],
        options: [
          "Brown", "Peru", "Yellow", "Dark Brown", "Red", "Light Salmon", "Blue", "Greyish Blue",
          "Beige", "Charcoal", "Dim Grey", "Ash Grey", "Grey", "Cool Grey", "Warm Grey",
          "Dark Green", "Forest Green", "Olive Green",
        ],
      },
    ];
  }
  for (const product of next) {
    const sku = String(product?.productNo || "").toUpperCase();
    if (!sku.startsWith("MKT-LOC-YTHKRTKH")) continue;
    const coatCert = "BS6920: Part 1: 1988\nASTM C 29\nASTM D 638-02a";
    product.name = "英泥質防水塗層, Cementitious Waterproofing Coating";
    product.category = "防水, Waterproofing";
    product.shopCategoryId = "cementitious-waterproofing-coating";
    product.unit = "Pack";
    product.salesUnit = "Pack";
    product.certifications = coatCert;
    product.standard = coatCert;
    product.searchAliases = ["水泥基防水塗料", "Cementitious Waterproofing Coating"];
    product.specs = (Array.isArray(product.specs) ? product.specs : [])
      .filter((line) => !/^cert\s*:/i.test(String(line)))
      .map((line) => (/^Sales unit\s*:/i.test(String(line)) ? "Sales unit: Pack" : line));
    if (Array.isArray(product.specChoices)) {
      product.specChoices = product.specChoices.map((choice) => ({
        ...choice,
        unit: "Pack",
        specs: (Array.isArray(choice.specs) ? choice.specs : [])
          .filter((line) => !/^cert\s*:/i.test(String(line)))
          .map((line) => (/^Sales unit\s*:/i.test(String(line)) ? "Sales unit: Pack" : line)),
      }));
    }
  }
  for (const product of next) {
    const sku = String(product?.productNo || "").toUpperCase();
    if (!sku.startsWith("MKT-LOC-CZWC9JQ2")) continue;
    const bitumenCert = "ASTM D1227\nASTM C309";
    product.name = "瀝青油, Bitumen Emulsion Protective Coating";
    product.category = "防水, Waterproofing";
    product.shopCategoryId = "bitumen-emulsion-coating";
    product.unit = "Drum";
    product.salesUnit = "Drum";
    product.certifications = bitumenCert;
    product.standard = bitumenCert;
    product.searchAliases = ["瀝青乳液保護塗層", "Bitumen Emulsion Protective Coating"];
    product.specGroups = [{
      id: "bitumen-product",
      label: "產品",
      labelEn: "Product",
      keepOrder: true,
      options: ["25 Liter", "200 Liter"],
    }];
    product.specs = (Array.isArray(product.specs) ? product.specs : [])
      .filter((line) => !/^cert\s*:/i.test(String(line)))
      .map((line) => (/^Sales unit\s*:/i.test(String(line)) ? "Sales unit: Drum" : line));
    if (Array.isArray(product.specChoices)) {
      product.specChoices = product.specChoices.map((choice) => ({
        ...choice,
        unit: "Drum",
        specs: (Array.isArray(choice.specs) ? choice.specs : [])
          .filter((line) => !/^cert\s*:/i.test(String(line)))
          .map((line) => (/^Sales unit\s*:/i.test(String(line)) ? "Sales unit: Drum" : line)),
      }));
    }
  }
  for (const product of next) {
    const sku = String(product?.productNo || "").toUpperCase();
    if (!sku.startsWith("MKT-LOC-HTTFD4I4")) continue;
    const epoxyCert = "ASTM D543\nBS 1881\nBSEN 12390";
    product.name = "環氧樹脂塗層, Coal Tar Epoxy Coating";
    product.category = "防水, Waterproofing";
    product.shopCategoryId = "coal-tar-epoxy-coating";
    product.unit = "Pack";
    product.salesUnit = "Pack";
    product.certifications = epoxyCert;
    product.standard = epoxyCert;
    product.searchAliases = ["煤焦油環氧塗層", "Coal Tar Epoxy Coating"];
    product.specs = (Array.isArray(product.specs) ? product.specs : [])
      .filter((line) => !/^cert\s*:/i.test(String(line)))
      .map((line) => (/^Sales unit\s*:/i.test(String(line)) ? "Sales unit: Pack" : line));
    if (Array.isArray(product.specChoices)) {
      product.specChoices = product.specChoices.map((choice) => ({
        ...choice,
        unit: "Pack",
        specs: (Array.isArray(choice.specs) ? choice.specs : [])
          .filter((line) => !/^cert\s*:/i.test(String(line)))
          .map((line) => (/^Sales unit\s*:/i.test(String(line)) ? "Sales unit: Pack" : line)),
      }));
    }
  }
  for (const product of next) {
    const sku = String(product?.productNo || "").toUpperCase();
    if (!sku.startsWith("MKT-LOC-C0AJSXNT")) continue;
    product.name = "馬路膠紙, Polyethylene Membrane";
    product.category = "防水, Waterproofing";
    product.shopCategoryId = "polyethylene-membrane";
    product.unit = "Roll";
    product.salesUnit = "Roll";
    product.certifications = "";
    product.standard = "";
    product.searchAliases = ["聚乙烯防水膜", "Polyethylene Membrane"];
    product.specGroups = [{
      id: "membrane-thickness",
      label: "厚度",
      labelEn: "Thickness",
      keepOrder: true,
      options: ["0.08mm", "0.125mm", "0.25mm"],
    }];
    product.specs = (Array.isArray(product.specs) ? product.specs : [])
      .filter((line) => !/^(?:cert|standard)\s*:/i.test(String(line)))
      .map((line) => (/^Sales unit\s*:/i.test(String(line)) ? "Sales unit: Roll" : line));
    if (Array.isArray(product.specChoices)) {
      product.specChoices = product.specChoices.map((choice) => ({
        ...choice,
        unit: "Roll",
        specs: (Array.isArray(choice.specs) ? choice.specs : [])
          .filter((line) => !/^(?:cert|standard)\s*:/i.test(String(line)))
          .map((line) => (/^Sales unit\s*:/i.test(String(line)) ? "Sales unit: Roll" : line)),
      }));
    }
  }
  for (const product of next) {
    const sku = String(product?.productNo || "").toUpperCase();
    if (!sku.startsWith("MKT-LOC-IUC7LLXE")) continue;
    const acrylicCert = "ASTM D2370\nASTM C1202\nASTM E96";
    product.name = "丙烯酸防水塗料, Acrylic Waterproofing Coating";
    product.category = "防水, Waterproofing";
    product.shopCategoryId = "acrylic-waterproofing-coating";
    product.unit = "Drum";
    product.salesUnit = "Drum";
    product.certifications = acrylicCert;
    product.standard = acrylicCert;
    product.specs = (Array.isArray(product.specs) ? product.specs : [])
      .filter((line) => !/^cert\s*:/i.test(String(line)))
      .map((line) => (/^Sales unit\s*:/i.test(String(line)) ? "Sales unit: Drum" : line));
    if (Array.isArray(product.specChoices)) {
      product.specChoices = product.specChoices.map((choice) => ({
        ...choice,
        unit: "Drum",
        specs: (Array.isArray(choice.specs) ? choice.specs : [])
          .filter((line) => !/^cert\s*:/i.test(String(line)))
          .map((line) => (/^Sales unit\s*:/i.test(String(line)) ? "Sales unit: Drum" : line)),
      }));
    }
  }
  for (const product of next) {
    const sku = String(product?.productNo || "").toUpperCase();
    if (!sku.startsWith("MKT-LOC-K8L5OJNP")) continue;
    product.name = "止水泥, Waterplug";
    product.category = "防水, Waterproofing";
    product.shopCategoryId = "waterplug";
    product.unit = "Tin";
    product.salesUnit = "Tin";
    product.certifications = "";
    product.standard = "";
    product.searchAliases = ["速凝止水劑", "Waterplug"];
    product.specs = (Array.isArray(product.specs) ? product.specs : [])
      .filter((line) => !/^(?:cert|standard)\s*:/i.test(String(line)))
      .map((line) => (/^Sales unit\s*:/i.test(String(line)) ? "Sales unit: Tin" : line));
    if (Array.isArray(product.specChoices)) {
      product.specChoices = product.specChoices.map((choice) => ({
        ...choice,
        unit: "Tin",
        specs: (Array.isArray(choice.specs) ? choice.specs : [])
          .filter((line) => !/^(?:cert|standard)\s*:/i.test(String(line)))
          .map((line) => (/^Sales unit\s*:/i.test(String(line)) ? "Sales unit: Tin" : line)),
      }));
    }
  }
  next = oneMarketProduct(next, {
    test: (product) => /其他化學產品|chemical product \(others\)/i.test(product?.name || ""),
    name: "其他化學產品, Chemical Product (Others)",
    category: chemical,
    id: "mkt-chemical-others",
    sku: "MKT-CHEM-OTHERS",
  });
  retitleProducts(next, (product) => /wood plastic|木塑複合板/i.test(product?.name || ""), "木塑複合板, Wood Plastic Composite", "環保產品, Environmental Product");
  for (const product of next) {
    if (!/wood plastic|木塑複合板/i.test(product?.name || "")) continue;
    product.shopCategoryId = "wood-plastic-compsite";
    product.unit = "No";
    product.salesUnit = "No";
    product.specGroups = [
      { id: "wpc-size", label: "尺寸", labelEn: "Size", keepOrder: true, customText: true, options: ["Customize"] },
      { id: "wpc-spec", label: "規格", labelEn: "spec", keepOrder: true, customText: true, options: ["Customize"] },
    ];
    product.specs = (Array.isArray(product.specs) ? product.specs : []).map((line) => (
      /^Sales unit\s*:/i.test(String(line)) ? "Sales unit: No" : line
    ));
  }
  retitleProducts(next, (product) => /^timber$/i.test(englishHead(product?.name)), "木地板, Flooring System - Timber Floor", flooring);
  retitleProducts(next, (product) => /tiles\s*\/\s*wall\s*&\s*flooring|牆身及地板系統/i.test(product?.name || ""), FLOORING_NAME, flooring);
  retitleProducts(next, (product) => /vinyl tile|膠地板/i.test(product?.name || ""), "乙烯基地板, Flooring System - Vinyl Floor", flooring);
  next = oneMarketProduct(next, {
    test: (product) => /sport flooring|運動地板/i.test(product?.name || ""),
    name: "運動地板, Flooring System - Sport Flooring",
    category: flooring,
    id: "mkt-floor-sport",
    sku: "MKT-FLOOR-SPORT",
  });
  next = oneMarketProduct(next, {
    test: (product) => /flooring system - hardener|硬化劑/i.test(product?.name || ""),
    name: "硬化劑, Flooring System - Hardener",
    category: flooring,
    id: "mkt-floor-hardener",
    sku: "MKT-FLOOR-HARDENER",
  });
  next = oneMarketProduct(next, {
    test: (product) => /recycled plastic floor|再生塑料地板/i.test(product?.name || ""),
    name: "再生塑料地板, Flooring System - Recycled Plastic Floor",
    category: flooring,
    id: "mkt-floor-recycled",
    sku: "MKT-FLOOR-RECYCLED",
  });
  const floorShops = [
    [/Flooring System - Timber Floor|木地板/i, "flooring-system-timber-floor"],
    [/瓷磚\/牆身及地板系統|Tiles\/Wall & Flooring/i, "flooring-system-rising-floor"],
    [/Flooring System - Sport Flooring|運動地板/i, "flooring-system-sport-flooring"],
    [/Flooring System - Hardener|硬化劑/i, "flooring-system-hardener"],
    [/Flooring System - Recycled Plastic Floor|再生塑料地板/i, "flooring-system-recycled-plastic-floor"],
    [/Flooring System - Vinyl Floor|乙烯基地板/i, "flooring-system-vinyl-floor"],
  ];
  for (const product of next) {
    const shop = floorShops.find(([test]) => test.test(product?.name || ""));
    if (!shop) continue;
    product.shopCategoryId = shop[1];
    product.unit = "No";
    product.salesUnit = "No";
    product.specs = (Array.isArray(product.specs) ? product.specs : []).map((line) => (
      /^Sales unit\s*:/i.test(String(line)) ? "Sales unit: No" : line
    ));
    if (Array.isArray(product.specChoices)) {
      product.specChoices = product.specChoices.map((choice) => ({
        ...choice,
        unit: "No",
        specs: (Array.isArray(choice.specs) ? choice.specs : []).map((line) => (
          /^Sales unit\s*:/i.test(String(line)) ? "Sales unit: No" : line
        )),
      }));
    }
  }
  retitleProducts(next, (product) => /xps foam board|擠塑板/i.test(product?.name || ""), "隔熱板, Board (Insulation)", board);
  retitleProducts(next, (product) => /gypsum board|石膏板/i.test(product?.name || "") && !/block|石膏磚/i.test(product?.name || ""), "石膏板, Board (Gypsum)", board);
  next = next.filter((product) => !/partition board|間隔板/i.test(`${product?.name || ""} ${product?.parentProduct || ""}`));
  next = next.filter((product) => String(product?.category || "") !== "扶手, Handrails" && !/ball joint handrail/i.test(product?.name || ""));
  next = next.filter((product) => !/^MKT-LOC-AWBWHT8F/i.test(String(product?.productNo || "")));
  next = next.filter((product) => !/^MKT-LOC-WJMMHU9P/i.test(String(product?.productNo || "")));
  next = next.filter((product) => !/^MKT-LOC-YFE22YRE/i.test(String(product?.productNo || "")));
  retitleProducts(next, (product) => /cement board|水泥板|泥水板/i.test(product?.name || ""), "泥水板, Board (Cement)", board);
  next = oneMarketProduct(next, {
    test: (product) => /aluminium plate|aluminum plate|鋁板,/i.test(product?.name || ""),
    name: "鋁板, Aluminium Plate",
    category: "鋁製品, Aluminium Product",
    id: "mkt-aluminium-plate",
    sku: "MKT-AL-PLATE",
  });
  next = oneMarketProduct(next, {
    test: (product) => /mild steel galvanized wire mesh|低碳鋼鍍鋅絲網/i.test(product?.name || ""),
    name: "低碳鋼鍍鋅絲網, Mild Steel Galvanized Wire Mesh",
    category: mesh,
    id: "mkt-mesh-gi-wire",
    sku: "MKT-MESH-GI-WIRE",
  });
  next = oneMarketProduct(next, {
    test: (product) => /mild steel wire mesh|低碳鋼絲網/i.test(product?.name || ""),
    name: "低碳鋼絲網, Mild Steel Wire Mesh",
    category: mesh,
    id: "mkt-mesh-ms-wire",
    sku: "MKT-MESH-MS-WIRE",
  });
  next = oneMarketProduct(next, {
    test: (product) => /ytong|aac block/i.test(`${product?.name || ""} ${product?.parentProduct || ""}`),
    name: "Autoclaved Aerated Concrete (AAC) Block (蒸壓加氣混凝土磚)",
    category: precast,
    id: "mkt-precast-aac",
    sku: "MKT-PRECAST-AAC",
    groupId: "aac-size",
    label: "尺寸",
    labelEn: "Size",
  });
  next = oneMarketProduct(next, {
    test: (product) => /prestressed concrete pile|預製預應力混凝土樁/i.test(product?.name || ""),
    name: "預製預應力混凝土樁, Precast Prestressed Concrete Pile",
    category: precast,
    id: "mkt-precast-pile",
    sku: "MKT-PRECAST-PILE",
  });
  next = oneMarketProduct(next, {
    test: (product) => /prestressed concrete items|預製預應力混凝土項目/i.test(product?.name || ""),
    name: "預製預應力混凝土項目, Precast Prestressed Concrete Items",
    category: precast,
    id: "mkt-precast-prestress",
    sku: "MKT-PRECAST-PRESTRESS",
  });
  next = oneMarketProduct(next, {
    test: (product) => /concrete façade|concrete facade|預製混凝土立面/i.test(product?.name || ""),
    name: "預製混凝土立面, Precast Concrete Façade",
    category: precast,
    id: "mkt-precast-facade",
    sku: "MKT-PRECAST-FACADE",
  });
  next = oneMarketProduct(next, {
    test: (product) => /precast concrete manhole|預製混凝土沙井/i.test(product?.name || ""),
    name: "預製混凝土沙井, Precast Concrete Manhole",
    category: precast,
    id: "mkt-precast-manhole",
    sku: "MKT-PRECAST-MANHOLE",
  });
  const tile = "磚, Tile";
  for (const product of next) {
    const name = String(product?.name || "");
    if (/防滑瓷磚|ceramic tiles r7/i.test(name)) {
      product.name = "防滑瓷磚, Anti-slip Tile";
      product.category = tile;
      product.searchAliases = ["Ceramic Tiles R7–R11", "Ceramic Tiles R7-R11"];
    } else if (/過底磚|通體磚|homogenous tile/i.test(name)) {
      const homoCert = "DIN 51130\nENISO 10545\nEN 15771";
      product.name = "過底磚, Homogenous Tile";
      product.category = tile;
      product.shopCategoryId = "ceramic-homogenous-tile";
      product.green = false;
      product.unit = "m²";
      product.salesUnit = "m²";
      product.certifications = homoCert;
      product.standard = homoCert;
      product.searchAliases = ["通體磚", "Homogenous Tile"];
      product.specChoices = [];
      product.specGroups = [
        {
          id: "homo-slip",
          label: "防滑等級",
          labelEn: "Slip rating",
          keepOrder: true,
          options: ["R10", "R11", "R12"],
        },
        {
          id: "homo-size",
          label: "尺寸",
          labelEn: "Size",
          keepOrder: true,
          options: ["150x150mm", "200x200mm", "300x300mm", "300x600mm", "600x600mm"],
        },
        {
          id: "homo-color",
          label: "顏色",
          labelEn: "Colour",
          keepOrder: true,
          options: [
            "Cream", "Light Grey", "Purplish Brown", "Ivory", "White", "Light Beige", "Sand",
            "Apricot", "Light Brown", "Dusty Pink", "Sage Green", "Medium Grey", "Dark Grey",
          ],
        },
      ];
      product.specs = (Array.isArray(product.specs) ? product.specs : [])
        .filter((line) => !/^cert\s*:/i.test(String(line)))
        .map((line) => (/^Sales unit\s*:/i.test(String(line)) ? "Sales unit: m²" : line));
    } else if (/乙烯基地板|flooring system - vinyl floor/i.test(name)) {
      const kept = (Array.isArray(product.specGroups) ? product.specGroups : []).filter((group) => {
        const id = String(group?.id || "");
        return id !== "tile-color" && id !== "vinyl-type" && id !== "vinyl-code" && id !== "vinyl-slip" && id !== "vinyl-fire" && id !== "vinyl-size" && id !== "vinyl-thickness" && id !== "vinyl-width" && id !== "vinyl-length";
      });
      product.specGroups = [...kept, ...vinylFloorSpecGroups(), homogenousColorGroup()];
    } else if (/天面磚|屋面瓦|roof tile/i.test(name)) {
      const roofCert = "ASTM E1980\nCS1\nBS EN 491";
      product.name = "天面磚, Roof Tile";
      product.category = tile;
      product.shopCategoryId = "roof-tile";
      product.green = false;
      product.unit = "m²";
      product.salesUnit = "m²";
      product.certifications = roofCert;
      product.standard = roofCert;
      product.searchAliases = ["屋面瓦", "Roof Tile"];
      product.specChoices = [];
      product.description = "";
      product.primarySpec = "";
      product.specGroups = [
        {
          id: "roof-size",
          label: "尺寸",
          labelEn: "Size",
          keepOrder: true,
          options: ["300x300mm", "400x400mm"],
        },
        {
          id: "roof-thickness",
          label: "厚度",
          labelEn: "thickness",
          keepOrder: true,
          options: ["30mm", "35mm", "40mm", "50mm"],
        },
        {
          id: "roof-color",
          label: "顏色",
          labelEn: "Colour",
          keepOrder: true,
          options: ["Grey", "Light Grey (SRI>75)"],
        },
      ];
      product.specs = (Array.isArray(product.specs) ? product.specs : [])
        .filter((line) => !/^cert\s*:/i.test(String(line)))
        .map((line) => (/^Sales unit\s*:/i.test(String(line)) ? "Sales unit: m²" : line));
    } else if (/觸覺引路磚|盲人導向磚|tactile tile/i.test(name)) {
      const tactileCert = "EN 14411\nEN 16165\nEN ISO 6769";
      product.name = "盲人導向磚, Tactile Tile";
      product.category = tile;
      product.shopCategoryId = "tactile-tile";
      product.green = false;
      product.unit = "m²";
      product.salesUnit = "m²";
      product.certifications = tactileCert;
      product.standard = tactileCert;
      product.searchAliases = ["觸覺引路磚", "Tactile Tile"];
      product.specChoices = [];
      product.description = "";
      product.primarySpec = "";
      product.specGroups = [
        {
          id: "tactile-type",
          label: "類型",
          labelEn: "Type",
          keepOrder: true,
          options: ["Directional", "Hazard Warning", "Oriental (Positional)"],
        },
        {
          id: "tactile-material",
          label: "材料",
          labelEn: "Material",
          keepOrder: true,
          options: ["Homogeneous Tactile", "Precast concrete tactile"],
        },
        {
          id: "tactile-color",
          label: "顏色",
          labelEn: "Colour",
          keepOrder: true,
          options: ["Yellow", "Light Grey", "Dark Grey"],
        },
      ];
      product.specs = (Array.isArray(product.specs) ? product.specs : [])
        .filter((line) => !/^cert\s*:/i.test(String(line)))
        .map((line) => (/^Sales unit\s*:/i.test(String(line)) ? "Sales unit: m²" : line));
    } else if (/馬賽克磚|馬賽克,|mosaic tile/i.test(name)) {
      product.name = "馬賽克磚, Mosaic Tile";
      product.category = tile;
      product.searchAliases = ["馬賽克", "Mosaic Tile"];
    } else if (/天然大理石|natural marble/i.test(name)) {
      product.name = "人造麻石, Artificial Granite";
      product.category = tile;
      product.shopCategoryId = "artificial-granite";
      product.green = false;
      product.unit = "m²";
      product.salesUnit = "m²";
      product.certifications = "DIN 51130";
      product.standard = "DIN 51130";
      product.searchAliases = ["天然大理石磚", "Natural Marble Tiles", "Natural Marble Tile"];
      product.specChoices = [];
      product.description = "";
      product.primarySpec = "";
      product.specGroups = [
        {
          id: "marble-size",
          label: "尺寸",
          labelEn: "Size",
          keepOrder: true,
          options: ["100x100mm", "200x200mm", "300x300mm", "600x600mm", "100x200mm", "300x600mm"],
        },
        {
          id: "marble-slip",
          label: "防滑",
          labelEn: "Slip resistance",
          keepOrder: true,
          options: ["R11", "R12", "R13"],
        },
        {
          id: "marble-color",
          label: "顏色",
          labelEn: "Colour",
          keepOrder: true,
          options: [
            "Cream", "White", "Grey", "Pink", "Beige", "Blue", "Yellow",
            "Dark Grey", "Light Yellow", "Blue-Grey", "Black",
          ],
        },
      ];
      product.specs = (Array.isArray(product.specs) ? product.specs : [])
        .filter((line) => !/^cert\s*:/i.test(String(line)))
        .map((line) => (/^Sales unit\s*:/i.test(String(line)) ? "Sales unit: m²" : line));
    } else if (/^瓷磚,/.test(name) && /ceramic tiles?$/i.test(name)) {
      const ceramicCert = "EN ISO 10545";
      product.name = "瓷磚, Ceramic Tile";
      product.category = tile;
      product.shopCategoryId = "ceramic-homogenous-tile";
      product.green = false;
      product.unit = "m²";
      product.salesUnit = "m²";
      product.certifications = ceramicCert;
      product.standard = ceramicCert;
      product.specChoices = [];
      product.description = "";
      product.primarySpec = "";
      product.specGroups = [
        {
          id: "ceramic-size",
          label: "尺寸",
          labelEn: "Size",
          keepOrder: true,
          options: ["100x100mm", "150x150mm", "200x200mm", "300x300mm", "300x600mm", "600x600mm"],
        },
        {
          id: "ceramic-finish",
          label: "飾面",
          labelEn: "Finishes",
          keepOrder: true,
          options: ["Glossy", "Matt"],
        },
        {
          id: "ceramic-color",
          label: "顏色",
          labelEn: "Colour",
          keepOrder: true,
          options: [
            "Red", "Orange", "Amber", "Lemon", "Dark Green", "Mint", "Light Green",
            "Blue", "Navy", "Black", "Grey", "Light Grey", "White",
          ],
        },
      ];
      product.specs = (Array.isArray(product.specs) ? product.specs : [])
        .filter((line) => !/^cert\s*:/i.test(String(line)))
        .map((line) => (/^Sales unit\s*:/i.test(String(line)) ? "Sales unit: m²" : line));
    } else if (/玻璃磚|glass tile/i.test(name)) {
      product.name = "玻璃磚, Glass Tile";
      product.category = tile;
      product.searchAliases = ["Other Tiles — Glass Tile", "Other Tiles"];
    } else if (/金屬磚|metal tile/i.test(name)) {
      product.name = "金屬磚, Metal Tile";
      product.category = tile;
      product.searchAliases = ["Other Tiles — Metal Tile", "Other Tiles"];
    } else if (/軟木磚|cork tile/i.test(name)) {
      product.name = "軟木磚, Cork Tile";
      product.category = tile;
      product.searchAliases = ["Other Tiles — Cork Tile", "Other Tiles"];
    } else if (/隔音磚|acoustic tile/i.test(name)) {
      product.name = "隔音磚, Acoustic Tile";
      product.category = tile;
      product.searchAliases = ["Other Tiles — Acoustic Tile", "Other Tiles"];
    } else if (/預製混凝土地磚|precast concrete paving/i.test(name) && product.shopCategoryId !== "precast-concrete-paving-block") {
      product.name = "預製混凝土地磚, Precast Concrete Paving";
      product.category = tile;
      product.searchAliases = ["預製混凝土製品", "Precast Concrete Products"];
    }
  }
  return replaceDigitalServices(next);
}

const DIGITAL_CATEGORY = "數位與科技服務, Digital & Technology Services";
const DIGITAL_OFFER = [
  ["mkt-sw-eprocurement-tmm", "MKT-SW-TMM", "電子採購 (TMM), eProcurement (TMM)"],
  ["mkt-sw-dwss", "MKT-SW-DWSS", "數位工程監督系統 (DWSS), Digital Works Supervision System (DWSS)"],
  ["mkt-sw-sdm", "MKT-SW-SDM", "智能文件管理 (SDM), Smart Document Management (SDM)"],
  ["mkt-sw-cet", "MKT-SW-CET", "補償事件工具, Compensation Event Tool"],
  ["mkt-sw-pay", "MKT-SW-PAY", "付款方案, Payment Solution"],
  ["mkt-sw-4s", "MKT-SW-4S", "智能工地安全系統 (4S), Smart Site Safety System (4S)"],
];

function isDigitalService(product) {
  const category = String(product?.category || "");
  return category === "Software" || category === DIGITAL_CATEGORY || category === "數位與科技服務";
}

function replaceDigitalServices(products) {
  const template = products.find(isDigitalService);
  if (!template) return products;
  const index = products.findIndex(isDigitalService);
  const rest = products.filter((product) => !isDigitalService(product));
  const shells = DIGITAL_OFFER.map(([id, sku, name]) => {
    const shell = marketShell(template, id, sku, name, DIGITAL_CATEGORY);
    shell.unit = "license";
    shell.salesUnit = "license";
    shell.moq = 1;
    shell.supplier = template.supplier || "Mattex";
    shell.image = template.image || "";
    shell.images = shell.image ? [shell.image] : [];
    shell.imageFallback = template.imageFallback || "";
    return shell;
  });
  const at = index < 0 ? rest.length : Math.min(index, rest.length);
  return [...rest.slice(0, at), ...shells, ...rest.slice(at)];
}

const CLAY_PIPE_SIZES = [
  [150, 1500],
  [200, 2000],
  [225, 2000],
  [250, 2000],
  [300, 2000],
  [375, 2000],
  [450, 2000],
  [600, 2000],
];

function clayPipeSpecGroups() {
  return [
    {
      id: "clay-class",
      label: "等級",
      labelEn: "Class",
      options: [{ label: "120" }],
    },
    {
      id: "clay-size",
      label: "尺寸（直徑 x 長度）",
      labelEn: "Size(Diameter x Length)",
      options: CLAY_PIPE_SIZES.map(([diameter, length]) => ({ label: `DN${diameter} mm x ${length} mm` })),
    },
  ];
}

function attachClayPipeSpecs(products) {
  return (products || []).map((product) => {
    const sku = String(product?.productNo || product?.sku || "").toUpperCase();
    const name = String(product?.name || "");
    if (sku !== "MKT-LOC-YFXTEFOC-001" && !/clay pipe|瓦管/i.test(name)) return product;
    return { ...product, specGroups: clayPipeSpecGroups(), shopCategoryId: "pipe-clay" };
  });
}

const UPVC_NOMINAL_SIZES = ["DN16", "DN20", "DN25", "DN30", "DN40", "DN50", "DN65", "DN75", "DN100", "DN150", "DN200", "DN250", "DN300"];
const UPVC_REDUCER_SIZES = [
  "DN20 x DN16", "DN25 x DN16", "DN25 x DN20", "DN30 x DN16", "DN30 x DN20", "DN30 x DN25",
  "DN40 x DN16", "DN40 x DN20", "DN40 x DN25", "DN40 x DN30", "DN50 x DN16", "DN50 x DN20",
  "DN50 x DN25", "DN50 x DN30", "DN50 x DN40", "DN65 x DN50", "DN75 x DN50", "DN75 x DN65",
  "DN100 x DN50", "DN100 x DN75", "DN150 x DN100", "DN200 x DN150",
];

function nominalSizeGroup(id, sizes) {
  return {
    id,
    label: "公稱尺寸",
    labelEn: "Nominal Size",
    keepOrder: true,
    options: sizes.map((label) => ({ label })),
  };
}

function codeThenSize(id, pairs) {
  return [
    {
      id: `${id}-code`,
      label: "產品編號",
      labelEn: "Product Code",
      keepOrder: true,
      options: pairs.map(([code]) => ({ label: code })),
    },
    {
      id: `${id}-size`,
      label: "公稱尺寸",
      labelEn: "Nominal Size",
      dependsOn: `${id}-code`,
      keepOrder: true,
      options: pairs.map(([code, size]) => ({ label: size, parent: code })),
    },
  ];
}

function upvcPipeSpecGroups() {
  return [
    {
      id: "upvc-pipe-color",
      label: "顏色",
      labelEn: "Color",
      keepOrder: true,
      options: [{ label: "Gray" }, { label: "White" }],
    },
    {
      id: "upvc-pipe-size",
      label: "尺寸",
      labelEn: "Size",
      keepOrder: true,
      options: UPVC_NOMINAL_SIZES.map((label) => ({ label })),
    },
    {
      id: "upvc-pipe-length",
      label: "長度",
      labelEn: "Length",
      dependsOn: "upvc-pipe-color",
      keepOrder: true,
      showDisabled: true,
      options: [
        { label: "4000mm", parent: "Gray" },
        { label: "5500mm", parent: "White" },
      ],
    },
  ];
}

function upvcElbowSpecGroups() {
  return [
    {
      id: "upvc-elbow-color",
      label: "顏色",
      labelEn: "Color",
      keepOrder: true,
      options: [{ label: "Gray" }, { label: "White" }],
    },
    nominalSizeGroup("upvc-elbow-size", UPVC_NOMINAL_SIZES),
  ];
}

function upvcReducerSpecGroups() {
  return [nominalSizeGroup("upvc-reducer-size", UPVC_REDUCER_SIZES)];
}

const UPVC_DN_TO_75 = ["DN16", "DN20", "DN25", "DN30", "DN40", "DN50", "DN65", "DN75"];
const UPVC_CAP_SIZES = ["DN16", "DN20", "DN25", "DN30", "DN40", "DN50", "DN65", "DN75", "DN100", "DN150"];
const UPVC_ELBOW45_SIZES = ["DN16", "DN20", "DN30", "DN40", "DN50", "DN65", "DN75", "DN100", "DN150", "DN200"];
const UPVC_COUPLING_SIZES = ["DN13", "DN16", "DN20", "DN25", "DN30", "DN40", "DN50", "DN65", "DN75", "DN100", "DN150", "DN200", "DN250"];
const UPVC_BSPT_SIZES = [
  "DN16 x 1/2\"", "DN20 x 3/4\"", "DN25 x 1\"", "DN30 x 1-1/4\"", "DN40 x 1-1/2\"",
  "DN50 x 2\"", "DN65 x 2-1/2\"", "DN75 x 3\"", "DN100 x 4\"", "DN150 x 6\"",
];
const UPVC_REDUCING_TEE_SIZES = [
  "DN16 x DN13", "DN20 x DN16", "DN25 x DN16", "DN25 x DN20",
  "DN30 x DN16", "DN30 x DN20", "DN30 x DN25",
  "DN40 x DN16", "DN40 x DN20", "DN40 x DN25", "DN40 x DN30",
  "DN50 x DN16", "DN50 x DN20", "DN50 x DN25", "DN50 x DN30", "DN50 x DN40",
  "DN65 x DN50", "DN75 x DN25", "DN75 x DN40", "DN75 x DN50",
  "DN100 x DN50", "DN100 x DN75", "DN150 x DN50", "DN150 x DN75", "DN150 x DN100", "DN200 x DN150",
];
const UPVC_FAUCET_ELBOW_SIZES = ["DN16 x 1/2\"", "DN20 x 3/4\"", "DN25 x 1\"", "DN20 x 1/2\""];
const UPVC_FAUCET_TEE_SIZES = ["DN16 x 1/2\"", "DN20 x 3/4\"", "DN20 x 1/2\"", "DN25 x 1/2\"", "DN25 x 1\"", "DN25 x 3/4\""];
const UPVC_FAUCET_SOCKET_SIZES = ["DN16 x 1/2\"", "DN20 x 3/4\"", "DN25 x 1\"", "DN20 x 1/2\"", "DN25 x 1/2\"", "DN25 x 3/4\""];
const UPVC_BALL_VALVE_SIZES = ["1/2\"", "3/4\"", "1\"", "1 1/4\"", "1 1/2\"", "2\"", "2 1/2\"", "3\"", "4\""];

function upvcFlangeSpecGroups() {
  return [
    {
      id: "upvc-flange-type",
      label: "類型",
      labelEn: "Type",
      keepOrder: true,
      options: [{ label: "One Piece" }, { label: "Two Pieces" }],
    },
    nominalSizeGroup("upvc-flange-size", UPVC_NOMINAL_SIZES),
  ];
}

function upvcBracketSpecGroups() {
  const pairs = [
    ["2100", "1\""], ["2101", "1-1/4\""], ["2102", "1-1/2\""], ["2103", "2\""],
    ["2104", "2-1/2\""], ["2105", "3\""], ["2106", "4\""], ["2107", "6\""],
  ];
  const handles = [
    ["1\"", ["3\""]],
    ["1-1/4\"", ["4\""]],
    ["1-1/2\"", ["4\""]],
    ["2\"", ["4\""]],
    ["2-1/2\"", ["4\"", "5\"", "6\""]],
    ["3\"", ["4\"", "5\"", "6\""]],
    ["4\"", ["4\"", "5\"", "6\""]],
    ["6\"", ["4\"", "5\"", "6\""]],
  ];
  return [
    ...codeThenSize("upvc-bracket", pairs),
    {
      id: "upvc-bracket-handle",
      label: "手柄長度",
      labelEn: "Handle Length",
      dependsOn: "upvc-bracket-size",
      keepOrder: true,
      options: handles.flatMap(([size, lengths]) => lengths.map((label) => ({ label, parent: size }))),
    },
  ];
}

const UPVC_FITTING_GROUPS = {
  "MKT-LOC-XDB0B1RF-004": () => codeThenSize("upvc-gasket-a", [
    ["D0737", "50 mm"], ["D0739", "75 mm"], ["D0740", "100 mm"], ["D0741", "150 mm"],
    ["D0742", "200 mm"], ["D0743", "250 mm"], ["D0744", "300 mm"],
  ]),
  "MKT-LOC-XDB0B1RF-005": () => codeThenSize("upvc-gasket-b", [
    ["D0003-B", "50 mm"], ["D0004-B", "65 mm"], ["D0005-B", "75 mm"], ["D0007-B", "150 mm"],
    ["D0008-B", "200 mm"], ["D0009-B", "250 mm"], ["D0010-B", "300 mm"],
  ]),
  "MKT-LOC-XDB0B1RF-006": () => codeThenSize("upvc-clip", [
    ["1001", "16 mm"], ["1002", "20 mm"], ["1003", "25 mm"],
    ["1001-6", "16 mm"], ["1002-6", "20 mm"], ["1003-6", "25 mm"],
  ]),
  "MKT-LOC-XDB0B1RF-007": () => codeThenSize("upvc-cement", [["S100", "100 g"], ["S500", "500 g"]]),
  "MKT-LOC-XDB0B1RF-008": upvcBracketSpecGroups,
  "MKT-LOC-XDB0B1RF-009": upvcFlangeSpecGroups,
  "MKT-LOC-XDB0B1RF-010": () => [nominalSizeGroup("upvc-gate-size", ["DN16"])],
  "MKT-LOC-XDB0B1RF-011": () => [nominalSizeGroup("upvc-stop-size", ["DN16", "DN20"])],
  "MKT-LOC-XDB0B1RF-012": () => [nominalSizeGroup("upvc-flex-size", UPVC_DN_TO_75)],
  "MKT-LOC-XDB0B1RF-013": () => [nominalSizeGroup("upvc-union-size", UPVC_DN_TO_75)],
  "MKT-LOC-XDB0B1RF-014": () => [nominalSizeGroup("upvc-cap-size", UPVC_CAP_SIZES)],
  "MKT-LOC-XDB0B1RF-015": () => [nominalSizeGroup("upvc-elbow45-size", UPVC_ELBOW45_SIZES)],
  "MKT-LOC-XDB0B1RF-016": () => [nominalSizeGroup("upvc-coupling-size", UPVC_COUPLING_SIZES)],
  "MKT-LOC-XDB0B1RF-017": () => [nominalSizeGroup("upvc-equal-tee-size", UPVC_NOMINAL_SIZES)],
  "MKT-LOC-XDB0B1RF-018": () => [nominalSizeGroup("upvc-ball-size", UPVC_BALL_VALVE_SIZES)],
  "MKT-LOC-XDB0B1RF-019": () => [nominalSizeGroup("upvc-bspt-size", UPVC_BSPT_SIZES)],
  "MKT-LOC-XDB0B1RF-020": () => [nominalSizeGroup("upvc-reducing-tee-size", UPVC_REDUCING_TEE_SIZES)],
  "MKT-LOC-XDB0B1RF-021": () => [nominalSizeGroup("upvc-faucet-elbow-size", UPVC_FAUCET_ELBOW_SIZES)],
  "MKT-LOC-XDB0B1RF-022": () => [nominalSizeGroup("upvc-faucet-tee-size", UPVC_FAUCET_TEE_SIZES)],
  "MKT-LOC-XDB0B1RF-023": () => [nominalSizeGroup("upvc-faucet-socket-size", UPVC_FAUCET_SOCKET_SIZES)],
};

function presentUpvcProduct(product, groups, cert) {
  const specs = (Array.isArray(product.specs) ? product.specs : []).filter((line) => !/^Cert:\s*/i.test(String(line)));
  const about = Array.isArray(product.purposes) ? product.purposes.filter(Boolean).join(" ") : String(product.purposes || "").trim();
  return {
    ...product,
    specGroups: groups,
    shopCategoryId: "pipe-fittings-pvc-upvc",
    sizeDesc: "",
    primarySpec: "",
    description: about,
    certifications: cert,
    standard: cert,
    specs: cert ? [...specs, `Cert: ${cert}`] : specs,
  };
}

const CONCRETE_PIPE_CERT = "BS EN 196:2002 BS 5911:PART1:2002";
const CONCRETE_PIPE_SKU = "MKT-LOC-FY2WOX2L-001";
const CONCRETE_PIPE_HIDDEN = new Set([
  "MKT-LOC-FY2WOX2L-002",
  "MKT-LOC-FY2WOX2L-003",
  "MKT-LOC-FY2WOX2L-004",
  "MKT-LOC-FY2WOX2L-005",
  "MKT-LOC-FY2WOX2L-006",
  "MKT-LOC-FY2WOX2L-007",
]);

function concretePipeSpecGroups() {
  const ranges = [
    ["DN150 - DN600", ["DN150", "DN225", "DN300", "DN375", "DN450", "DN525", "DN600"]],
    ["DN675 - DN2400", ["DN675", "DN700", "DN750", "DN800", "DN825", "DN900", "DN1000", "DN1050", "DN1200", "DN1350", "DN1400", "DN1500", "DN1600", "DN1650", "DN1800", "DN1950", "DN2000", "DN2100", "DN2200", "DN2250", "DN2400"]],
    ["DN2500 - DN3500", ["DN2500", "DN2700", "DN2800", "DN3000", "DN3200", "DN3500"]],
  ];
  return [
    {
      id: "concrete-pipe-range",
      label: "尺寸範圍",
      labelEn: "Range",
      keepOrder: true,
      options: ranges.map(([label]) => ({ label })),
    },
    {
      id: "concrete-pipe-size",
      label: "公稱尺寸",
      labelEn: "Nominal Size",
      dependsOn: "concrete-pipe-range",
      keepOrder: true,
      options: ranges.flatMap(([range, sizes]) => sizes.map((label) => ({ label, parent: range }))),
    },
  ];
}

function presentConcretePipe(product) {
  const about = Array.isArray(product.purposes) ? product.purposes.filter(Boolean).join(" ") : String(product.purposes || "").trim();
  return {
    ...product,
    name: "混凝土管 - Concrete Pipe",
    specGroups: concretePipeSpecGroups(),
    shopCategoryId: "pipe-concrete",
    sizeDesc: "",
    primarySpec: "",
    specifications: "",
    description: about,
    certifications: CONCRETE_PIPE_CERT,
    standard: CONCRETE_PIPE_CERT,
    specs: [`Cert: ${CONCRETE_PIPE_CERT}`],
  };
}

const JACKING_PIPE_SKU = "MKT-LOC-JP3K8N2Q-001";
const JACKING_PIPE_ABOUT = "Jacking pipes are concrete pipes pushed into place by pipe jacking for underground drainage and sewer crossings. Joints use a rubber gasket, with mortar or concrete fill.";

function jackingPipeSpecGroups() {
  const plain = ["DN450", "DN600", "DN750", "DN800", "DN900", "DN1000", "DN1050", "DN1200", "DN1350", "DN1400", "DN1500", "DN1600", "DN1650", "DN1800", "DN2000", "DN2200", "DN2500", "DN2800", "DN3000"];
  const typed = ["DN900", "DN1000", "DN1050", "DN1200", "DN1350", "DN1400", "DN1500", "DN1600", "DN1650", "DN1800", "DN2000", "DN2200", "DN2500", "DN2800", "DN3000"];
  const types = [
    ["Jacking Pipe", "DN450 - DN3000", plain],
    ["T-Type Jacking Pipe", "DN900 - DN3000", typed],
    ["S-Type Jacking Pipe", "DN900 - DN3000", typed],
  ];
  return [
    {
      id: "jacking-pipe-type",
      label: "類型",
      labelEn: "Type",
      keepOrder: true,
      options: types.map(([label]) => ({ label })),
    },
    {
      id: "jacking-pipe-range",
      label: "尺寸範圍",
      labelEn: "Range",
      dependsOn: "jacking-pipe-type",
      keepOrder: true,
      options: types.map(([type, range]) => ({ label: range, parent: type })),
    },
    {
      id: "jacking-pipe-size",
      label: "公稱尺寸",
      labelEn: "Nominal Size",
      dependsOn: "jacking-pipe-range",
      keepOrder: true,
      options: types.flatMap(([, range, sizes]) => sizes.map((label) => ({ label, parent: range }))),
    },
  ];
}

function presentJackingPipe(product) {
  return {
    ...product,
    name: "頂管 - Jacking Pipe",
    specGroups: jackingPipeSpecGroups(),
    shopCategoryId: "pipe-concrete",
    sizeDesc: "",
    primarySpec: "",
    specifications: "",
    description: JACKING_PIPE_ABOUT,
    purposes: JACKING_PIPE_ABOUT,
    certifications: "",
    standard: "",
    specs: [],
  };
}

function brickSpecGroups(sizes, thicknesses, sizeNote = "") {
  return [
    { id: "brick-size", label: "尺寸", labelEn: "Size", keepOrder: true, note: sizeNote, options: sizes },
    {
      id: "brick-thickness",
      label: "厚度",
      labelEn: "Thickness",
      dependsOn: "brick-size",
      keepOrder: true,
      options: sizes.flatMap((size) => thicknesses.map((label) => ({ label, parent: size }))),
    },
  ];
}

function presentBrickBlock(product, spec) {
  const next = {
    ...product,
    name: spec.name,
    category: "沙磚, Brick & Block",
    shopCategoryId: spec.shopCategoryId,
    sizeDesc: "",
    primarySpec: "",
    specifications: "",
    description: "",
    specGroups: brickSpecGroups(spec.sizes, spec.thicknesses, spec.sizeNote || ""),
  };
  delete next.specChoices;
  const specs = (Array.isArray(product?.specs) ? product.specs : []).filter((line) => !/^(Size|Cert)\s*:/i.test(String(line)));
  if (spec.cert) {
    next.certifications = spec.cert;
    next.standard = spec.cert;
    next.specs = [...specs, `Cert: ${spec.cert}`];
  } else {
    next.certifications = "";
    next.standard = "";
    next.specs = specs;
  }
  if (spec.aliases) next.searchAliases = spec.aliases;
  return next;
}

const BRICK_BLOCKS = {
  "MKT-LOC-CSB4N8Q2-001": {
    name: "Concrete Sand Block (沙磚)",
    shopCategoryId: "brick",
    sizes: ["98 x 210mm", "100 x 220mm", "100 x 225mm"],
    thicknesses: ["60mm", "75mm", "100mm"],
    sizeNote: "+/- 3mm tolerance",
    cert: "BS 6073 Part 1",
  },
  "MKT-LOC-LWB4N8Q2-001": {
    name: "Lightweight Block (輕磚)",
    shopCategoryId: "lightweight-block",
    sizes: ["600 x 200mm"],
    thicknesses: ["75mm", "100mm", "150mm"],
  },
};

function isAacBlock(product) {
  const sku = String(product?.productNo || product?.sku || "").toUpperCase();
  if (sku === "MKT-LOC-Y974EM5J-001" || sku === "MKT-PRECAST-AAC") return true;
  return /ytong|aac block/i.test(`${product?.name || ""} ${product?.parentProduct || ""}`);
}

const PRECAST_BLOCK_CERT = "ISO 9001:2015\nConcrete Quality Manual";

function presentPrecastConcreteBlock(product) {
  const specs = (Array.isArray(product?.specs) ? product.specs : [])
    .filter((line) => !/^Cert\s*:/i.test(String(line)))
    .map((line) => (/^Sales unit\s*:/i.test(String(line)) ? "Sales unit: No" : line));
  specs.push("Cert: ISO 9001:2015 / Concrete Quality Manual");
  return {
    ...product,
    shopCategoryId: "precast-concrete-block",
    unit: "No",
    salesUnit: "No",
    certifications: PRECAST_BLOCK_CERT,
    standard: PRECAST_BLOCK_CERT,
    specs,
  };
}

function attachPrecastBlockSpecs(products) {
  return (products || []).flatMap((product) => {
    const sku = String(product?.productNo || product?.sku || "").toUpperCase();
    if (/^MKT-LOC-TDHE8GV6-00[1-4]$/.test(sku)) return [];
    if (!/^MKT-PC-000[1-8]$/.test(sku)) return [product];
    return [presentPrecastConcreteBlock(product)];
  });
}

function attachBrickSpecs(products) {
  return (products || []).map((product) => {
    const sku = String(product?.productNo || product?.sku || "").toUpperCase();
    const listed = BRICK_BLOCKS[sku];
    if (listed) return presentBrickBlock(product, listed);
    if (!isAacBlock(product)) return product;
    return presentBrickBlock(product, {
      name: "Autoclaved Aerated Concrete (AAC) Block (蒸壓加氣混凝土磚)",
      shopCategoryId: "aac-block",
      sizes: ["600 x 200mm"],
      thicknesses: ["75mm", "100mm", "150mm", "225mm"],
      cert: "BS 6073 Part 1",
      aliases: ["YTONG AAC Block", "YTONG 加氣混凝土砌塊"],
    });
  });
}

function attachJackingPipeSpecs(products) {
  return (products || []).map((product) => {
    const sku = String(product?.productNo || product?.sku || "").toUpperCase();
    if (sku === JACKING_PIPE_SKU) return presentJackingPipe(product);
    return product;
  });
}

function attachConcretePipeSpecs(products) {
  return (products || []).flatMap((product) => {
    const sku = String(product?.productNo || product?.sku || "").toUpperCase();
    if (CONCRETE_PIPE_HIDDEN.has(sku)) return [];
    if (sku === CONCRETE_PIPE_SKU) return [presentConcretePipe(product)];
    return [product];
  });
}

function attachUpvcSpecs(products) {
  const known = {
    "MKT-LOC-XDB0B1RF-001": [upvcPipeSpecGroups, "BS EN 1452-2 : 2009 BS 3505 : 1986"],
    "MKT-LOC-XDB0B1RF-002": [upvcElbowSpecGroups, ""],
    "MKT-LOC-XDB0B1RF-003": [upvcReducerSpecGroups, "BS EN 1452-3 : 2010"],
  };
  return (products || []).map((product) => {
    const sku = String(product?.productNo || product?.sku || "").toUpperCase();
    const drainage = drainageUpvcBySku[sku];
    if (drainage) return presentUpvcProduct(product, drainage.groups, drainage.cert);
    const fitting = UPVC_FITTING_GROUPS[sku];
    if (fitting) return presentUpvcProduct(product, fitting(), "BS EN 1452-3 : 2010");
    const current = known[sku];
    if (current) return presentUpvcProduct(product, current[0](), current[1]);
    return product;
  });
}

const BUYER_PROJECTION = "buyer-catalog-v1";
const BUYER_ETAG_SUFFIX = "-timber-ply-fold4-press1-forge7-mesh3-lead1-plaster2-custom1-agg6-tax4-digital1-vinylspec5-equip1-gypsum1-plyfsc3-oxygenhide1-claypipe4-upvc8-concrete2-jacking1-plycert1-plycat1-film1-timber3-gypsumcert1-gypsumcat1-brick1-precastblock1-drop3-kerb1-kerbinput3-kerbcat1-paving1-slab2-lintel1-wpc1-wpc2-paint1-floor2-clad1-multi1-partition1-mesh2-dowel1-handrail1-ladder1-wpc3-floor3-clad2-plaster1-skim2-additive1-grout1-cement1-sand1-mortar1-adhesive2-tilegrout3-screed1-level1-barrier1-coat1-bitumen1-epoxy1-membrane1-acrylic1-waterplug1-homo4-ceramic1-granite1-roof1-tactile1-mosaic1-slip1-softwood2-gblock1-pcert1-aggunit1-aggsheet1-aggsub4-aggmulti1-softcut1-plastername1-plasterbag1-screedmpa1-groutcolor1-durm1-granite1";


export function buyerCatalogVersion(etag) {
  const value = String(etag || "");
  return !value || value === "seed" || value.endsWith(BUYER_ETAG_SUFFIX) ? value : `${value}${BUYER_ETAG_SUFFIX}`;
}

export function toPublicCatalog(catalog) {
  if (!catalog || typeof catalog !== "object" || catalog.buyerProjection === BUYER_PROJECTION) return catalog;
  let products = (catalog.products || [])
    .filter((p) => p && p.published !== false && !p.deleted && !p.held)
    .map(toPublicProduct);
  for (const fold of [foldXpsFoamBoard, foldDenseMesh, foldPrecastConcrete, foldBalustrades,
    foldOxygenChamber, foldDowelBar, foldCatLadder, foldPaint, foldRaisedFloors, foldAluminumCladding,
    foldCable, foldShoeWashing, foldFinishBoards, foldAggregate, foldPipeFittings,
    foldWindows, foldTiles, foldDrainageGratings, foldSteelGratings, foldManholeCovers,
    foldGypsumBlocks, foldTimberPlywood, foldReinforcementMesh]) products = fold(products);
  products = attachPrecastBlockSpecs(attachBrickSpecs(attachJackingPipeSpecs(attachConcretePipeSpecs(attachUpvcSpecs(attachClayPipeSpecs(applyMarketList(products)))))));
  const previous = new Map((catalog.categories || []).map((item) => [item?.name, item]));
  const categories = [...new Set(products.map((p) => String(p.category || "").trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, "zh"))
    .map((name) => ({ name, image: previous.get(name)?.image || "", imageFallback: previous.get(name)?.imageFallback || "" }));
  return { ...catalog, buyerProjection: BUYER_PROJECTION, etag: buyerCatalogVersion(catalog.etag), products, categories };
}
