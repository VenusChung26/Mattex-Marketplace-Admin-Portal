import { homogenousColorGroup } from "../src/lib/homogenousColors.js";

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
    name: "預製混凝土路緣, Precasted Concrete Kerb",
    groups: [
      { id: "kerb-type", label: "類型", labelEn: "Type", options: KERB_TYPES },
      { id: "kerb-length", label: "分類 2", labelEn: "Category 2", options: ["0.5m", "0.75m", "1m", "2m", "Customize"] },
      { id: "kerb-kind", label: "分類 3", labelEn: "Category 3", options: ["Normal Kerb", "Edge Kerb (Terminate Kerb)"] },
    ],
  },
  {
    kind: "paving",
    preferNo: "MKT-LOC-E4AP0EXL-001",
    name: "預製混凝土地磚, Precast Concrete Paving",
    groups: [
      { id: "paving-colour", label: "顏色", labelEn: "Colour", options: ["Grey", "Red", "Dark Grey", "Natural Concrete"] },
    ],
  },
  {
    kind: "slabs",
    preferNo: "MKT-PC-0009",
    name: "預製混凝土板, Precast Concrete Slabs",
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
    groups: [{ id: "lintel-custom", label: "分類 1", labelEn: "Category 1", options: ["Customize"] }],
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
  base.sizeDesc = "";
  base.parentProduct = "";
  base.variant = "";
  base.specGroups = spec.groups;
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
const STEEL_CATEGORY = "鋼材, Steel";

const DOWEL_SPEC_GROUPS = [
  {
    id: "dowel-kind",
    label: "分類 1",
    labelEn: "Category 1",
    options: ["Dowel Bar"],
  },
  {
    id: "material",
    label: "材料類型",
    labelEn: "Material Type",
    options: ["Mild Steel", "Galvanized Steel", "Stainless Steel"],
  },
  {
    id: "diameter",
    label: "分類 3",
    labelEn: "Category 3",
    options: ["16mm", "20mm", "22mm", "25mm", "32mm", "36mm", "38mm", "40mm", "50mm"],
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
  base.name = "鋼筋及連接, Reinforcement & Connections";
  base.category = STEEL_CATEGORY;
  base.sizeDesc = "";
  base.description = "";
  base.parentProduct = "";
  base.variant = "";
  base.specGroups = DOWEL_SPEC_GROUPS;
  rememberSource(base, rows);
  const at = insertAt < 0 ? rest.length : insertAt;
  return [...rest.slice(0, at), base, ...rest.slice(at)];
}

const PAINT_CATEGORY = "油漆, Paint";
const FINISHES_CATEGORY = "建築飾面, Architectural Finishes";

const PAINT_SPEC_GROUPS = [
  {
    id: "paint-kind",
    label: "分類 1",
    labelEn: "Category 1",
    options: ["Paint"],
  },
  {
    id: "size",
    label: "分類 2",
    labelEn: "Category 2",
    options: ["Interior", "Exterior", "Floor", "Multi-effect Functional Coating", "Nano Waterproof"],
  },
  {
    id: "paint-name",
    label: "分類 3",
    labelEn: "Category 3",
    options: [
      "Archi+ Pietra Intonaco",
      "Crystal Diamond Sand Paint",
      "Nalan Starry Glitter Paint",
      "Eggshell Wall Paint 3.0",
      "Velvet Wall Paint",
      "Liquid Polish Paint",
      "Elegance Spar Paint",
      "Skin Texture Paint",
      "Microcement Paint",
      "Interior Latex Paint",
      "Waterborne Metallic Paint",
      "Antileakage Waterproof Coating",
      "Matte Multicolored Art Paint",
      "Venetian Plaster",
      "Granite Stone Coating-A",
      "Liquid Stone Coating",
      "Granite Stone Coating-B",
      "Texture Series",
      "Exterior Latex Paint",
      "Natural Stone Paint",
      "Mineral Sand Paint",
      "Microcement",
      "Epoxy Floor Paint",
      "Waterproof Coating Series",
      "Deodorant And Formaldehyde Removal Series",
      "Waterproof And Heat Insulation Integration Coating",
      "Resistant Emulsion Universal Paint",
      "Nano Waterproof Series",
      "Nano Rooftop Waterproof Coating",
    ],
  },
];

export function foldPaint(products) {
  const rows = [];
  const rest = [];
  let insertAt = -1;
  for (const product of products || []) {
    if (String(product?.category || "") !== PAINT_CATEGORY) {
      rest.push(product);
      continue;
    }
    if (insertAt < 0) insertAt = rest.length;
    rows.push(product);
  }
  if (!rows.length) return products || [];
  const source = rows.find((product) => product.productNo === "MKT-PNT-0001") || rows[0];
  const base = { ...source };
  base.name = "表面飾面, Surface Finishes";
  base.category = FINISHES_CATEGORY;
  base.sizeDesc = "";
  base.description = "";
  base.primarySpec = "";
  base.parentProduct = "";
  base.variant = "";
  base.specGroups = PAINT_SPEC_GROUPS;
  rememberSource(base, rows);
  const at = insertAt < 0 ? rest.length : insertAt;
  return [...rest.slice(0, at), base, ...rest.slice(at)];
}

const RAISED_FLOOR_CATEGORY = "架空地板, Raised Access Floors";
const FLOORING_NAME = "瓷磚／牆身及地板系統, Tiles / Wall & Flooring Systems";

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
    label: "分類 3",
    labelEn: "Category 3",
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
  base.category = FINISHES_CATEGORY;
  base.sizeDesc = "";
  base.description = "";
  base.primarySpec = "";
  base.parentProduct = "";
  base.variant = "";
  base.specGroups = RAISED_FLOOR_SPEC_GROUPS;
  rememberSource(base, rows);
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
    label: "分類 3",
    labelEn: "Category 3",
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
  base.category = FINISHES_CATEGORY;
  base.sizeDesc = "";
  base.description = "";
  base.primarySpec = "";
  base.parentProduct = "";
  base.variant = "";
  base.tailorSize = true;
  base.specGroups = CLADDING_SPEC_GROUPS;
  rememberSource(base, rows);
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
const AGGREGATE_SIZES = ["5 mm", "10 mm", "20 mm", "40 mm"];

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

function aggregateProduct(source, name, groups, rows) {
  const base = { ...source };
  base.name = name;
  base.category = AGGREGATE_SHOP_CATEGORY;
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
  const subbaseSource = subbase[0] || coarseSource;
  const stoneGroups = [
    {
      id: "agg-type",
      label: "類型",
      labelEn: "Type",
      options: [
        { label: "Coarse Aggregate", image: String(coarseSource?.image || "") },
        { label: "Sub-base", image: String(subbaseSource?.image || "") },
      ],
    },
    {
      id: "agg-size",
      label: "尺寸",
      labelEn: "Size",
      dependsOn: "agg-type",
      options: [
        ...AGGREGATE_SIZES.map((size) => ({ label: size, key: `coarse-${size}`, parent: "Coarse Aggregate" })),
        ...AGGREGATE_SIZES.map((size) => ({ label: `Type 1 — ${size}`, key: `subbase-${size}`, parent: "Sub-base", match: size })),
      ],
    },
  ];
  const granularGroups = [
    {
      id: "fill-type",
      label: "類型",
      labelEn: "Type",
      options: ["Type A", "Type B"],
    },
  ];
  const rockGroups = [
    {
      id: "rock-grade",
      label: "等級",
      labelEn: "Grade",
      options: ["Grade 75", "Grade 200", "Grade 400", "Grade 700"],
    },
  ];
  const folded = [];
  if (coarse.length || subbase.length) {
    folded.push(aggregateProduct(
      coarseSource,
      "石料, Aggregate & Sub-base",
      stoneGroups,
      [...coarse, ...subbase],
    ));
  }
  folded.push(aggregateShell(coarseSource, "mkt-aggregate-recycle", "MKT-AGG-RECYCLE", "重用石料, Aggregate Recycle"));
  if (rockfill.length) {
    folded.push(aggregateProduct(
      rockfill.find((product) => product.productNo === "MKT-LOC-OKPDQN87-001") || rockfill[0],
      "堆料, Rockfill",
      rockGroups,
      rockfill,
    ));
  }
  if (granular.length) {
    folded.push(aggregateProduct(
      granular.find((product) => product.productNo === "MKT-LOC-S94FDIM7-001") || granular[0],
      "砂石料, Granular Fill",
      granularGroups,
      granular,
    ));
  }
  folded.push(aggregateShell(coarseSource, "mkt-aggregate-gravel", "MKT-AGG-GRAVEL", "砂礫, Gravel"));
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

const GYPSUM_BLOCK_NAME = "石膏磚, Gypsum Block";
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

  const face = rows.find((product) => String(product.category || "") === GYPSUM_BLOCK_CATEGORY && product.image) || rows.find((product) => product.image) || rows[0];
  const sheet = rows.find((product) => product.specUrl);
  const base = { ...face };
  base.id = "mkt-gypsum-block";
  base.productNo = "MKT-GB-0001";
  base.provisionalSku = "MKT-GB-0001";
  base.name = GYPSUM_BLOCK_NAME;
  base.category = GYPSUM_BLOCK_CATEGORY;
  base.green = false;
  base.sizeDesc = "";
  base.description = "";
  base.primarySpec = "";
  base.parentProduct = "";
  base.variant = "";
  base.specs = [];
  base.price = null;
  base.unit_price = null;
  base.priceUponRequest = true;
  base.quote = null;
  base.image = face.image || "";
  base.images = base.image ? [base.image] : [];
  base.imageUrl = face.imageUrl || base.image;
  base.imageFallback = face.imageFallback || "/assets/type-gypsum.webp?v=20260929b";
  if (sheet?.specUrl) base.specUrl = sheet.specUrl;
  delete base.specChoices;
  base.specGroups = [
    { id: "block-size", label: "尺寸", labelEn: "Size", keepOrder: true, options: ["500mm x 500mm", "500mm x 250mm"] },
    { id: "block-thickness", label: "厚度", labelEn: "Thickness", keepOrder: true, options: ["80mm", "100mm", "150mm"] },
    { id: "block-density", label: "密度", labelEn: "Density", keepOrder: true, options: ["1,100kg/m3", "1,200kg/m3", "1,400kg/m3"] },
    { id: "block-standard", label: "規格", labelEn: "Spec.", keepOrder: true, options: ["BS EN 13279", "BS 476", "BS EN ISO 140-3", "BS EN 12859", "BS EN 1364"] },
  ];
  const at = insertAt < 0 ? rest.length : insertAt;
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
  },
  {
    kind: "filmface",
    match: /Film\s*face Plywood/i,
    name: "菲林板, Filmface Plywood",
    withThickness: true,
    dropThickness: ["17mm"],
    thicknessNote: "with +/- 1mm to tolerance",
  },
  {
    kind: "softwood",
    match: /\bSoftwood\b/i,
    name: "木方（加拿大）, Softwood",
    // packing is CF/PC volume, still shown as 分類 2 so Softwood also has 3 pickers
    withThickness: true,
    tolerance: false,
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
    const { size, thickness, grade } = timberParts(row);
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
  if (spec?.spec) {
    groups.push({ id: "ply-spec", label: "規格", labelEn: "Spec", keepOrder: true, options: [spec.spec] });
  }
  return groups.filter((group) => (group.options || []).length > 0);
}

function timberChoices(rows, groups, spec) {
  const withThickness = spec?.withThickness !== false;
  const drop = new Set((spec?.dropThickness || []).map((item) => String(item).trim().toLowerCase()));
  const seen = new Set();
  const choices = [];
  for (const row of rows) {
    const { size, thickness, grade } = timberParts(row);
    if (!size) continue;
    if (drop.has(String(thickness).trim().toLowerCase())) continue;
    const picks = { "ply-size": size };
    if (withThickness && thickness) picks["ply-thickness"] = timberThicknessKey(size, thickness);
    if (spec?.grade) picks["ply-grade"] = spec.grade;
    else if (withThickness && thickness && grade) picks["ply-grade"] = `${picks["ply-thickness"]}::${grade}`;
    else if (grade) picks["ply-grade"] = `${size}::${grade}`;
    if (spec?.spec) picks["ply-spec"] = spec.spec;
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
  base.sizeDesc = "";
  base.primarySpec = "";
  base.parentProduct = "";
  base.variant = "";
  base.description = spec.thicknessNote || spec.tolerance === false ? "" : TIMBER_TOLERANCE;
  if (spec.aliases?.length) base.searchAliases = spec.aliases;
  base.specGroups = timberGroups(list, spec);
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
    if (/Triangle String|三角線/i.test(String(product?.name || ""))) return applyCardImage({ ...product }, TIMBER_CARD_IMAGES.triangle);
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
    rows: [
      ["A393", "62.09", "2.1 × 4.8 m", "MKT-MESH-A393"],
      ["A252", "39.82", "2.1 × 4.8 m", "MKT-MESH-A252"],
      ["A193", "30.44", "2.1 × 4.8 m", "MKT-MESH-A193"],
      ["A142", "22.38", "2.1 × 4.8 m", "MKT-MESH-A142"],
    ],
  },
  {
    id: "mkt-mesh-structural",
    name: "建築物結構網, Structural Mesh Fabric",
    rows: [
      ["B1131", "109.87", "2.1 × 4.8 m", "MKT-MESH-B1131"],
      ["B785", "82.05", "2.1 × 4.8 m", "MKT-MESH-B785"],
      ["B503", "59.77", "2.1 × 4.8 m", "MKT-MESH-B503"],
      ["B385", "45.66", "2.1 × 4.8 m", "MKT-MESH-B385"],
      ["B283", "37.6", "2.1 × 4.8 m", "MKT-MESH-B283"],
    ],
  },
  {
    id: "mkt-mesh-long",
    name: "長格鋼筋網, Long Mesh Fabric",
    rows: [
      ["C785", "67.74", "2.1 × 4.8 m", "MKT-MESH-C785"],
      ["C636", "55.94", "2.1 × 4.8 m", "MKT-MESH-C636"],
      ["C503", "45.46", "2.1 × 4.8 m", "MKT-MESH-C503"],
      ["C385", "36.09", "2.1 × 4.8 m", "MKT-MESH-C385"],
      ["C283", "28.02", "2.1 × 4.8 m", "MKT-MESH-C283"],
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

function rebarSpecGroups(rows) {
  return [
    {
      id: "mesh-ref",
      label: "英國標準編號",
      labelEn: "BS Ref.No.",
      keepOrder: true,
      options: rows.map(([code, , , sku]) => ({
        label: code,
        key: code,
        sku,
        moq: 1,
        unit: "sheet",
      })),
    },
    {
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
    },
    {
      id: "mesh-size",
      label: "網片規格",
      labelEn: "Size of Sheet",
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
  ];
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
    base.moq = 1;
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
    base.specGroups = rebarSpecGroups(family.rows);
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
  next = oneMarketProduct(next, {
    test: (product) => /^base plaster$/i.test(englishHead(product?.name)) && /\d+\s*mpa/i.test(product?.name || ""),
    name: "批盪料, Cement Base Plaster",
    category: chemical,
    id: "mkt-chemical-plaster",
    sku: "MKT-CHEM-PLASTER",
    groupId: "plaster-grade",
    label: "等級",
    labelEn: "Grade",
  });
  retitleProducts(next, (product) => /non-shrink grout|不收縮灌漿/i.test(product?.name || ""), "不收縮灌漿料, Non-shrink Grout", chemical);
  next = oneMarketProduct(next, {
    test: (product) => /其他化學產品|chemical product \(others\)/i.test(product?.name || ""),
    name: "其他化學產品, Chemical Product (Others)",
    category: chemical,
    id: "mkt-chemical-others",
    sku: "MKT-CHEM-OTHERS",
  });
  retitleProducts(next, (product) => /wood plastic|木塑複合板/i.test(product?.name || ""), "木塑複合板, Wood Plastic Composite", "環保產品, Environmental Product");
  retitleProducts(next, (product) => /^timber$/i.test(englishHead(product?.name)), "木地板, Flooring System - Timber Floor", flooring);
  retitleProducts(next, (product) => /tiles\s*\/\s*wall\s*&\s*flooring|牆身及地板系統/i.test(product?.name || ""), "升高地台板, Flooring System - Rising Floor", flooring);
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
  retitleProducts(next, (product) => /xps foam board|擠塑板/i.test(product?.name || ""), "隔熱板, Board (Insulation)", board);
  retitleProducts(next, (product) => /gypsum board|石膏板/i.test(product?.name || "") && !/block|石膏磚/i.test(product?.name || ""), "石膏板, Board (Gypsum)", board);
  next = oneMarketProduct(next, {
    test: (product) => /partition board|間隔板/i.test(product?.name || ""),
    name: "間隔板, Board (Partition)",
    category: board,
    id: "mkt-board-partition",
    sku: "MKT-BOARD-PARTITION",
    groupId: "partition-frr",
    label: "耐火時效",
    labelEn: "Fire rating",
  });
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
    test: (product) => /ytong|aac block|輕磚/i.test(`${product?.name || ""} ${product?.parentProduct || ""}`),
    name: "輕磚, Precast Concrete Products (Light-weight Block)",
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
      product.name = "過底磚, Homogenous Tile";
      product.category = tile;
      product.searchAliases = ["通體磚", "Homogenous Tile"];
      if (Array.isArray(product.specGroups)) {
        product.specGroups = product.specGroups.filter((group) => group?.id !== "tile-color");
      }
    } else if (/乙烯基地板|flooring system - vinyl floor/i.test(name)) {
      const kept = (Array.isArray(product.specGroups) ? product.specGroups : []).filter((group) => {
        const id = String(group?.id || "");
        return id !== "tile-color" && id !== "vinyl-type" && id !== "vinyl-code" && id !== "vinyl-slip" && id !== "vinyl-fire" && id !== "vinyl-size" && id !== "vinyl-thickness" && id !== "vinyl-width" && id !== "vinyl-length";
      });
      product.specGroups = [...kept, ...vinylFloorSpecGroups(), homogenousColorGroup()];
    } else if (/天面磚|屋面瓦|roof tile/i.test(name)) {
      product.name = "天面磚, Roof Tile";
      product.category = tile;
      product.searchAliases = ["屋面瓦", "Roof Tile"];
    } else if (/馬賽克磚|馬賽克,|mosaic tile/i.test(name)) {
      product.name = "馬賽克磚, Mosaic Tile";
      product.category = tile;
      product.searchAliases = ["馬賽克", "Mosaic Tile"];
    } else if (/天然大理石|natural marble/i.test(name)) {
      product.name = "天然大理石磚, Natural Marble Tiles";
      product.category = tile;
      product.searchAliases = ["Natural Marble Tile"];
    } else if (/^瓷磚,/.test(name) && /ceramic tiles?$/i.test(name)) {
      product.name = "瓷磚, Ceramic Tile";
      product.category = tile;
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
    } else if (/預製混凝土地磚|precast concrete paving/i.test(name)) {
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
      options: CLAY_PIPE_SIZES.map(([diameter, length]) => ({ label: `${diameter} mm x ${length} mm` })),
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

const BUYER_PROJECTION = "buyer-catalog-v1";
const BUYER_ETAG_SUFFIX = "-timber-ply-fold4-press1-forge7-mesh3-lead1-plaster2-custom1-agg6-tax4-digital1-vinylspec5-equip1-gypsum1-plyfsc3-oxygenhide1-claypipe2";


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
    foldOxygenChamber, foldDowelBar, foldPaint, foldRaisedFloors, foldAluminumCladding,
    foldCable, foldShoeWashing, foldFinishBoards, foldAggregate, foldPipeFittings,
    foldWindows, foldTiles, foldDrainageGratings, foldSteelGratings, foldManholeCovers,
    foldGypsumBlocks, foldTimberPlywood, foldReinforcementMesh]) products = fold(products);
  products = attachClayPipeSpecs(applyMarketList(products));
  const previous = new Map((catalog.categories || []).map((item) => [item?.name, item]));
  const categories = [...new Set(products.map((p) => String(p.category || "").trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, "zh"))
    .map((name) => ({ name, image: previous.get(name)?.image || "", imageFallback: previous.get(name)?.imageFallback || "" }));
  return { ...catalog, buyerProjection: BUYER_PROJECTION, etag: buyerCatalogVersion(catalog.etag), products, categories };
}
