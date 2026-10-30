/**
 * Public-safe catalog output.
 *
 * Staff (Portal) read the full product. Everyone else gets the product without internal fields,
 * and with import notes moved out of the buyer-facing `remark`.
 */

export const INTERNAL_PRODUCT_FIELDS = ["refPrice", "deliveryFee", "sourceUrl", "internalNote"];

const INTERNAL_NOTE_LINE =
  /(local website material|provisional sku|requires confirmation|split basis|copied from|confirm for|does not publish|prc row)/i;

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
      "Customize Size",
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
  { id: "colour", label: "顏色", labelEn: "Colour", options: ["Orange", "Green", "Customization"] },
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
          "Customize",
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
const SITE_FACILITIES_CATEGORY = "工地設施, Site Facilities";
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
  if (!rows.length) return products || [];
  const source = rows.find((product) => product.productNo === "MKT-OC-0004") || rows[0];
  const base = { ...source };
  base.name = "氧氣艙, Oxygen Chamber";
  base.category = SITE_FACILITIES_CATEGORY;
  base.shopSubgroup = SITE_EQUIPMENT_SUBGROUP;
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
    options: ["Customize Size"],
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
  base.category = SITE_FACILITIES_CATEGORY;
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
const RAW_MATERIALS_CATEGORY = "原材料, Raw Materials";

const AGGREGATE_SPEC_GROUPS = [
  {
    id: "aggregate-kind",
    label: "分類 1",
    labelEn: "Category 1",
    options: ["Aggregates"],
  },
  {
    id: "aggregate-type",
    label: "分類 2",
    labelEn: "Category 2",
    options: [
      "Coarse Aggregate 5 mm",
      "Coarse Aggregate 10 mm",
      "Coarse Aggregate 20 mm",
      "Coarse Aggregate 40 mm",
      "Sub-base Type 1 — 5 mm",
      "Sub-base Type 1 — 10 mm",
      "Sub-base Type 1 — 20 mm",
      "Sub-base Type 1 — 40 mm",
      "Granular Fill — Type A",
      "Granular Fill — Type B",
      "Rockfill Grade 75",
      "Rockfill Grade 200",
      "Rockfill Grade 400",
      "Rockfill Grade 700",
    ],
  },
  {
    id: "aggregate-unit",
    label: "分類 3",
    labelEn: "Category 3",
    options: ["Ton", "Lot", "Sample (Proctor)"],
  },
];

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
  const source = rows.find((product) => product.productNo === "MKT-LOC-MN0AS1TM-001") || rows[0];
  const base = { ...source };
  base.name = "石料, Aggregates";
  base.category = RAW_MATERIALS_CATEGORY;
  base.sizeDesc = "";
  base.description = "";
  base.primarySpec = "";
  base.parentProduct = "";
  base.variant = "";
  base.specGroups = AGGREGATE_SPEC_GROUPS;
  rememberSource(base, rows);
  const at = insertAt < 0 ? rest.length : insertAt;
  return [...rest.slice(0, at), base, ...rest.slice(at)];
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

function isGypsumBlockSeries(product) {
  return /^Gypsum Block\s*[—–]\s*\d+\s*mm\b/i.test(String(product?.variant || ""));
}

function gypsumBlockBits(product) {
  const bits = String(product?.variant || "").split(/\s*[—–]\s*/).map((part) => part.trim()).filter(Boolean);
  if (/^gypsum block$/i.test(bits[0] || "")) bits.shift();
  return bits;
}

function gypsumBlockFacts(product) {
  const detail = String(product?.sizeDesc || "").trim();
  const summary = String(product?.description || "").trim();
  return {
    detail,
    summary: summary && summary !== detail ? summary : "",
    image: String(product?.image || ""),
    sku: String(product?.productNo || "").trim().toUpperCase(),
    moq: product?.moq,
    unit: product?.unit,
    leadTime: product?.leadTime,
    leadTimeLabel: product?.leadTimeLabel,
    specs: Array.isArray(product?.specs) ? product.specs : [],
  };
}

function thicknessOrder(label) {
  const match = String(label || "").match(/(\d+(?:\.\d+)?)/);
  return match ? Number(match[1]) : 999;
}

export function foldGypsumBlocks(products) {
  const rows = [];
  const rest = [];
  let insertAt = -1;
  for (const product of products || []) {
    if (!isGypsumBlockSeries(product)) {
      rest.push(product);
      continue;
    }
    if (insertAt < 0) insertAt = rest.length;
    rows.push(product);
  }
  if (rows.length < 2) return products || [];

  const byThickness = new Map();
  for (const product of rows) {
    const bits = gypsumBlockBits(product);
    const thickness = bits[0] || "Gypsum Block";
    if (!byThickness.has(thickness)) byThickness.set(thickness, []);
    byThickness.get(thickness).push({ bits, facts: gypsumBlockFacts(product) });
  }

  const seriesOptions = [];
  const gradeOptions = [];
  const leafOptions = [];
  for (const thickness of [...byThickness.keys()].sort((a, b) => thicknessOrder(a) - thicknessOrder(b))) {
    const items = byThickness.get(thickness);
    if (items.length === 1) {
      seriesOptions.push({ label: thickness, key: thickness, ...items[0].facts });
      continue;
    }
    seriesOptions.push({ label: thickness, key: thickness });
    const grades = [];
    for (const item of items) {
      const grade = item.bits[4] || "Standard";
      if (!grades.includes(grade)) grades.push(grade);
    }
    grades.sort((a, b) => (a === "Standard" ? 0 : 1) - (b === "Standard" ? 0 : 1) || a.localeCompare(b));
    const oneGrade = grades.length < 2;
    for (const grade of grades) {
      const gradeKey = `${thickness}::${grade}`;
      const children = items
        .filter((item) => (item.bits[4] || "Standard") === grade)
        .sort((a, b) => thicknessOrder(a.bits[1]) - thicknessOrder(b.bits[1]) || String(a.bits[3]).localeCompare(String(b.bits[3])));
      if (!oneGrade) gradeOptions.push({ label: grade, key: gradeKey, parent: thickness });
      const seen = new Set();
      for (const item of children) {
        let label = [item.bits[1], item.bits[2], item.bits[3]].filter(Boolean).join(" · ") || item.facts.detail || "Option";
        if (seen.has(label)) label = item.facts.detail ? `${label} · ${item.facts.detail}` : `${label} · ${seen.size + 1}`;
        seen.add(label);
        const option = {
          label,
          key: `${oneGrade ? thickness : gradeKey}::${label}`,
          parent: oneGrade ? thickness : gradeKey,
          ...item.facts,
        };
        if (oneGrade) gradeOptions.push(option);
        else leafOptions.push(option);
      }
    }
  }

  const base = { ...rows[0] };
  base.name = GYPSUM_BLOCK_NAME;
  base.sizeDesc = "";
  base.description = "";
  base.primarySpec = "";
  base.parentProduct = "";
  base.variant = "";
  base.specGroups = [
    { id: "block-thickness", label: "分類 1", labelEn: "Category 1", options: seriesOptions },
    { id: "block-grade", label: "分類 2", labelEn: "Category 2", dependsOn: "block-thickness", options: gradeOptions },
    { id: "block-spec", label: "分類 3", labelEn: "Category 3", dependsOn: "block-grade", options: leafOptions },
  ];
  const at = insertAt < 0 ? rest.length : insertAt;
  return [...rest.slice(0, at), base, ...rest.slice(at)];
}

const MANHOLE_NAME = "沙井蓋, Manhole Cover";

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
    bySeries.get(series).push({
      rest: bits.slice(1),
      detail: detail || summary,
      summary: summary && summary !== detail ? summary : "",
      image: String(product.image || ""),
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
    const hasMid = items.some((item) => item.rest.length >= 2);
    if (!hasMid && items.length < 2) {
      seriesOptions.push({
        label: series,
        key: series,
        detail: items[0].detail,
        summary: items[0].summary,
        image: items[0].image,
        sku: items[0].sku,
        moq: items[0].moq,
        unit: items[0].unit,
        leadTime: items[0].leadTime,
        leadTimeLabel: items[0].leadTimeLabel,
        specs: items[0].specs,
      });
      continue;
    }
    seriesOptions.push({ label: series, key: series });
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
  base.specGroups = [
    { id: "cover-series", label: "分類 1", labelEn: "Category 1", options: seriesOptions },
    { id: "cover-kind", label: "分類 2", labelEn: "Category 2", dependsOn: "cover-series", options: midOptions },
    { id: "cover-size", label: "分類 3", labelEn: "Category 3", dependsOn: "cover-kind", options: leafOptions },
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

function finishTile(rows, sku, name, specGroups) {
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
  rememberSource(base, rows);
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

function ceramicGroups(rows) {
  const sizesBySeries = new Map();
  for (const row of rows) {
    const series = seriesKey(row);
    if (!series) continue;
    if (!sizesBySeries.has(series)) sizesBySeries.set(series, []);
    const size = tileSizeLabel(row);
    const sizes = sizesBySeries.get(series);
    if (size && !sizes.includes(size)) sizes.push(size);
  }
  const series = [...sizesBySeries.keys()].sort((a, b) => a.localeCompare(b));
  const sizeOptions = [];
  for (const name of series) {
    for (const size of sizesBySeries.get(name)) sizeOptions.push({ label: size, parent: name });
  }
  const groups = [{ id: "tile-series", label: "分類 1", labelEn: "Category 1", options: series }];
  if (sizeOptions.length) {
    groups.push({
      id: "tile-size",
      label: "分類 2",
      labelEn: "Category 2",
      dependsOn: "tile-series",
      options: sizeOptions,
    });
  }
  return groups;
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
  const folded = [
    finishTile(buckets.homogenous, "MKT-LOC-SS97X4VR-001", "通體磚, Homogenous Tile", ratingGroup(buckets.homogenous)),
    finishTile(buckets.ceramic, "MKT-T-0001", "瓷磚, Ceramic Tiles", ceramicGroups(buckets.ceramic)),
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

export function toPublicCatalog(catalog) {
  if (!catalog || typeof catalog !== "object") return catalog;
  return {
    ...catalog,
    products: Array.isArray(catalog.products) ? catalog.products.map(toPublicProduct) : [],
  };
}
