const ABOUT =
  "UPVC pipes and fittings are plastic piping systems made from unpolyvinyl chloride material. They feature excellent chemical resistance, good insulation properties, lightweight construction, and ease of installation. These types of pipes are widely used in building water supply systems, drainage systems, chemical pipelines, and agricultural irrigation systems. Combined with various fittings—such as elbows, tees, and joints—they form a complete system.";

const SUFFIX = "(For Drainage Water)";

function drain(name) {
  return name.includes(SUFFIX) ? name : `${name} ${SUFFIX}`;
}

function sizeGroup(id, labels) {
  return {
    id,
    label: "公稱尺寸",
    labelEn: "Nominal Size",
    keepOrder: true,
    options: labels.map((label) => ({ label })),
  };
}

function chips(id, labels) {
  return [sizeGroup(`${id}-size`, labels)];
}

function mm(...nums) {
  return nums.map((n) => `${n} mm`);
}

function x(...rows) {
  return rows.map((parts) => `${parts.join(" x ")} mm`);
}

function codeSize(id, pairs) {
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

function typeSize(id, variants) {
  return [
    {
      id: `${id}-type`,
      label: "類型",
      labelEn: "Type",
      keepOrder: true,
      options: variants.map(([type]) => ({ label: type })),
    },
    {
      id: `${id}-size`,
      label: "公稱尺寸",
      labelEn: "Nominal Size",
      dependsOn: `${id}-type`,
      keepOrder: true,
      options: variants.flatMap(([type, labels]) => labels.map((label) => ({ label, parent: type }))),
    },
  ];
}

function sizeAndSocket(id, rows) {
  const multi = rows.some((row) => row[1].length > 1);
  if (!multi) {
    return chips(id, rows.map(([size, sockets]) => (sockets.length ? `${size} · ${sockets[0]}` : size)));
  }
  return [
    sizeGroup(`${id}-size`, rows.map(([size]) => size)),
    {
      id: `${id}-socket`,
      label: "接口類型",
      labelEn: "Socket Type",
      dependsOn: `${id}-size`,
      keepOrder: true,
      options: rows.flatMap(([size, sockets]) => sockets.map((label) => ({ label, parent: size }))),
    },
  ];
}

function drainagePipe(id) {
  return [
    {
      id: `${id}-color`,
      label: "顏色",
      labelEn: "Color",
      keepOrder: true,
      options: [{ label: "White" }],
    },
    sizeGroup(`${id}-size`, ["DN32", "DN40", "DN50", "DN65", "DN80", "DN100", "DN150", "DN200"]),
    {
      id: `${id}-length`,
      label: "長度",
      labelEn: "Length",
      keepOrder: true,
      options: [{ label: "5500mm" }],
    },
  ];
}

const PRODUCTS = [];

function add(name, build, cert = "") {
  const sku = `MKT-LOC-XDB0B1RF-${String(24 + PRODUCTS.length).padStart(3, "0")}`;
  const id = `drain-${sku.slice(-3)}`;
  PRODUCTS.push({ sku, name: drain(name), groups: build(id), cert });
}

const PIPE_CERT = "BS 5255 : 1989 BS 4514 : 1989 BS EN 1329-1 : 2014";

add("uPVC Pipe (For Drainage Water)", drainagePipe, PIPE_CERT);
add("Stainless Steel Pipe Clip", (id) => codeSize(id, [
  ["SSP3301", "32 mm"], ["SSP3303", "50 mm"], ["SSP3307", "150 mm"],
  ["SSP6301", "32 mm"], ["SSP6303", "50 mm"], ["SSP6305", "80 mm"], ["SSP6307", "150 mm"],
]));
add("PVC Pipe Clip", (id) => codeSize(id, [
  ["A2202", "40 mm"], ["A2203", "50 mm"], ["A2207", "150 mm"],
  ["A2201-4\"", "32 mm"], ["A2205-4\"", "80 mm"], ["A2206-4\"", "100 mm"], ["A2207-4\"", "150 mm"],
]));
add("Traps Body", (id) => chips(id, mm(50, 80, 100)));
add("Round Traps With I.O.", (id) => chips(id, mm(50, 80, 100)));
add("Square Traps", (id) => chips(id, mm(100)));
add("\"U\" Trap", (id) => chips(id, mm(100)));
add("\"U\" Trap With I.O.", (id) => chips(id, mm(100)));
add("\"U\" Trap With Vent", (id) => chips(id, x([100, 100, 50])));
add("Holderbats", (id) => chips(id, mm(32, 40)));
add("Sealing Ring", (id) => chips(id, [...mm(50, 80, 100, 150), "200 mm (GB)"]));
add("Boss Connector", (id) => chips(id, ["100 x 50 mm", "100 x 50 mm (With Bracket)"]));
add("Plug With Ring Seal", (id) => chips(id, ["1-1/4\"", "1-1/2\"", "2\""]));
add("\"H\" Shape Connector", (id) => chips(id, x([100, 50, 50], [100, 50, 100])));
add("B.J. Reducer", (id) => chips(id, ["36.4 x 38 mm", "43 x 48 mm", "55.9 x 60 mm"]));
add("Weathering Apron", (id) => chips(id, mm(40, 50, 65, 80, 100, 150)));
add("Hopper", (id) => chips(id, mm(100)));
add("Level Reducer", (id) => chips(id, x([100, 100, 50])));
add("Grate", (id) => chips(id, mm(50, 80, 100)));
add("Floor Drain (Washing Machine)", (id) => chips(id, mm(100)));
add("Floor Drain (Horizontal Type)", (id) => chips(id, mm(40, 50)));
add("Floor Drain", (id) => chips(id, mm(40, 50)));
add("Floor Drain (Refilling)", (id) => chips(id, x([40, 25], [40, 32], [50, 32])));
add("Access Cap", (id) => chips(id, mm(32, 40, 50, 65, 80, 100, 150)));
add("Vent Cowl", (id) => chips(id, mm(50, 80, 100, 150)));
add("Cap", (id) => chips(id, mm(32, 40, 50, 80, 100)));
add("Cap (Threaded)", (id) => chips(id, ["1-1/4\""]));
add("Screw Plug Adaptor (Spigot End)", (id) => chips(id, mm(20, 32, 40, 50)));
add("Expansion Joint (Spigot End)", (id) => chips(id, mm(50, 100)));
add("Seal Ring Adaptor", (id) => chips(id, mm(50, 80, 100, 150)));
add("Caulking Bush", (id) => chips(id, mm(80, 100)));
add("W.C Pan Connector (Spigot End)", (id) => chips(id, mm(100)));
add("W.C Eva Connector Bend 14°", (id) => chips(id, mm(100)));
add("W.C Eva Connector Bend 90°", (id) => chips(id, mm(100)));
add("W.C Eva Offset Connector", (id) => chips(id, mm(100)));
add("W.C Offset Connector", (id) => chips(id, mm(100)));
add("W.C Pan Connector (\"Z\" Type)", (id) => chips(id, mm(100)));
add("W.C Pan Connector Bend 88° (Seal)", (id) => chips(id, mm(100)));
add("W.C Pan Connector Bend 88° (Plain)", (id) => chips(id, mm(100)));
add("W.C Eva Level Invert Connector", (id) => chips(id, mm(100)));
add("W.C Eva Level Invert Connector (Adjustable)", (id) => chips(id, mm(100)));
add("Elbow 90°", (id) => chips(id, mm(32, 40, 50, 80, 100, 150)));
add("Elbow 90° With I.O.", (id) => chips(id, mm(100)));
add("Elbow 90° With Side Boss & I.O.", (id) => chips(id, x([100, 100, 50])));
add("Elbow 90° With Top Boss & I.O.", (id) => chips(id, x([100, 100, 50])));
add("Elbow 90° With Side Boss", (id) => chips(id, x([100, 50])));
add("Elbow 90° With Top Boss", (id) => chips(id, x([100, 50])));
add("BSPT Elbow 90°", (id) => chips(id, mm(32, 40, 50)));
add("Coupling", (id) => chips(id, mm(32, 40, 50, 65, 80, 100, 150)));
add("Access Fitting", (id) => chips(id, [...mm(65, 80, 100, 150), "200 mm (GB)"]));
add("Bend 88°", (id) => chips(id, mm(32, 40, 50, 65, 80, 100, 150)));
add("Bend 88° With I.O. (Side)", (id) => chips(id, mm(32, 40, 50, 65, 80, 100, 150)));
add("Bend 88° With I.O. (Bottom)", (id) => chips(id, mm(32, 40, 50, 65, 80, 100, 150)));
add("Bend 88° With Top Boss & I.O.", (id) => chips(id, x([100, 50])));
add("Bend 45°", (id) => chips(id, mm(32, 40, 50, 65, 80, 100, 150, 200)));
add("Bend 45° (M/F)", (id) => chips(id, mm(32, 40, 50, 65, 80, 100, 150)));
add("Expansion Coupling", (id) => chips(id, [...mm(40, 50, 65, 80, 100), "100 mm (Elongated)", "150 mm"]));
add("Double Junction Adaptor", (id) => chips(id, x([40, 20], [40, 25], [40, 32])));
add("Double Junction 88°", (id) => chips(id, x([80, 50], [100, 50], [150, 100])));
add("Double Junction 88° (Equal)", (id) => chips(id, x([50, 50])));
add("Double Junction 88° With I.O.", (id) => chips(id, x([100, 100])));
add("Reducing Junction 45° With I.O.", (id) => chips(id, x([80, 50], [100, 50], [100, 80], [150, 100])));
add("Reducing Junction 45°", (id) => chips(id, x([80, 50], [100, 50], [100, 80], [150, 100])));
add("Junction 45°", (id) => chips(id, mm(32, 40, 50, 65, 80, 100, 150)));
add("Junction 45° With I.O.", (id) => chips(id, mm(32, 40, 50, 65, 80, 100, 150)));
add("Junction 88°", (id) => chips(id, mm(32, 40, 50, 65, 80, 100, 150)));
add("Junction 88° With I.O.", (id) => chips(id, mm(32, 40, 50, 65, 80, 100, 150)));
add("90° Tee Adaptor", (id) => chips(id, x([40, 20], [40, 25])));
add("Tee 90°", (id) => chips(id, mm(32, 40, 50, 65, 80, 100, 150, 200)));
add("Reducing Tee", (id) => chips(id, x([40, 32], [50, 32], [50, 40])));
add("90° Tee With I.O.", (id) => chips(id, x([40, 32], [50, 32], [50, 40])));
add("Multi Boss Junction", (id) => chips(id, x([100, 100, 100], [150, 100, 100])));
add("Double Reducing Junction 88° With I.O.", (id) => chips(id, x([80, 50], [100, 50], [150, 50], [150, 100])));
add("Double Junction 45°", (id) => chips(id, x([80, 50], [100, 50], [150, 50], [150, 100])));
add("Double Junction 45° With I.O.", (id) => chips(id, x([80, 50], [100, 50])));
add("\"S\" Trap", (id) => chips(id, x([32, 87], [40, 87], [50, 112])));
add("Access Plug", (id) => chips(id, [
  "16 mm x 1/2\"", "20 mm x 3/4\"", "25 mm x 1\"", "32 mm x 1-1/4\"", "40 mm x 1-1/2\"", "50 mm x 2\"",
]));
add("BSPT Male Adaptor (Spigot End)", (id) => chips(id, [
  "32 mm x 1-1/4\"", "40 mm x 1-1/2\"", "50 mm x 2\"", "65 mm x 2-1/2\"", "80 mm x 3\"", "100 mm x 4\"",
]));
add("BSPT Male Coupling", (id) => chips(id, [
  "32 mm x 1-1/4\"", "40 mm x 1-1/2\"", "50 mm x 2\"", "65 mm x 2-1/2\"", "80 mm x 3\"",
]));
add("BSPT Female Adaptor (Spigot End)", (id) => chips(id, [
  "32 mm x 1-1/4\"", "40 mm x 1-1/2\"", "50 mm x 2\"", "65 mm x 2-1/2\"",
]));
add("BSPT Tee 90°", (id) => chips(id, ["32 mm x 1-1/4\"", "40 mm x 1-1/2\"", "50 mm x 2\""]));
add("BSPT Tee 90° (Reducing)", (id) => chips(id, [
  "40 x 32 mm x 1-1/2\"", "50 x 32 mm x 2\"", "50 x 40 mm x 2\"",
]));
add("Level Invert Reducer (M/F)", (id) => chips(id, [
  ...x([40, 32], [50, 32], [50, 40], [65, 40], [80, 50], [80, 65], [100, 50], [100, 65], [100, 80], [150, 100]).map((label) => `${label} · M`),
]));
add("Reducing Bush", (id) => chips(id, [
  ...x([40, 32], [50, 32], [50, 40], [65, 50], [80, 40], [80, 50], [80, 65], [100, 50], [100, 65], [100, 80], [150, 100]).map((label) => `${label} · M`),
  "200 x 150 mm · F",
]));
add("Roof Top Rainwater Outlet With Flat Cover", (id) => chips(id, ["100 mm · F", "150 mm · M"]));
add("Roof Top Rainwater Outlet With Conical Cover", (id) => chips(id, ["100 mm · F", "150 mm · M"]));
add("Roof Top Rainwater Outlet With Conical Cover (Long Grate)", (id) => chips(id, mm(100)));
add("Floor Drain - Square Type", (id) => chips(id, [
  "40 mm · 175 mm · UPVC",
  "40 mm · 200 mm · UPVC",
  "50 mm · 150 mm · UPVC",
  "50 mm · 175 mm · UPVC",
  "50 mm · 200 mm · UPVC",
  "50 mm · 200 mm · S.S",
]));
add("Floor Drain - Square Type (Shallow)", (id) => chips(id, x([150, 100])));
add("Floor Drain - Square Type (Round Body)", (id) => chips(id, x([100, 50])));
add("BSPT Floor Drain - Circular Type", (id) => chips(id, ["50 mm x 2\""]));
add("Floor Drain - Circular Type (Tall)", (id) => chips(id, x([80, 50])));
add("Floor Drain - Circular Type (Short)", (id) => chips(id, x([80, 50])));
add("BSPT Floor Drain - Square Type", (id) => chips(id, ["100 x 50 mm x 2\""]));
add("Bottle Trap", (id) => typeSize(id, [
  ["Standard", x([32, 77], [40, 77])],
  ["Anti-Syphonic", x([32, 77], [40, 77])],
]));
add("\"P\" Trap", (id) => typeSize(id, [
  ["Standard", x([32, 87], [40, 87], [50, 112])],
  ["Anti-Syphonic", x([32, 87], [40, 87], [50, 112])],
]));
add("\"U\" Trap (Small)", (id) => typeSize(id, [
  ["Standard", x([32, 80], [40, 78], [50, 80])],
  ["Anti-Syphonic", x([32, 80], [40, 78], [50, 80])],
]));
add("\"P\" Trap (Inlet Pipe)", (id) => typeSize(id, [
  ["Standard", mm(40, 50)],
  ["Anti-Syphonic", [...mm(40, 50), "50 mm (with I.O.)"]],
]));
add("W.C Pan Connector (Morf)", (id) => sizeAndSocket(id, [["100 mm", ["F", "M"]]]));
add("Bend 15° (F/F) or (F/M)", (id) => sizeAndSocket(id, mm(80, 100, 150).map((size) => [size, ["F", "M"]])));
add("Multi Boss Junction 88° (F/F) of (F/M) With I.O.", (id) => sizeAndSocket(id, [
  ["80 x 50 x 50 x 50 mm", ["F/F", "M/F"]],
  ["100 x 50 x 50 x 50 x 50 mm", ["F/F", "M/F"]],
  ["100 x 50 x 50 x 50 mm", ["F/F", "M/F"]],
]));
add("Multi Boss Junction 45° (F/F) of (F/M) With I.O.", (id) => sizeAndSocket(id, [
  ["80 x 50 x 50 x 50 x 50 mm", ["F", "M"]],
  ["80 x 50 x 50 x 50 mm", ["F", "M"]],
  ["100 x 50 x 50 x 50 mm", ["F", "M"]],
]));
add("Ring Seal Junction 88° (F/F) (M/F) With I.O.", (id) => sizeAndSocket(id, [
  ["100 x 50 x 50 mm", ["With Access", "F", "M", "Extendable"]],
]));
add("Reducing Junction 88°", (id) => sizeAndSocket(id, [
  ["80 x 50 mm", ["F"]],
  ["100 x 50 mm", ["F", "M"]],
  ["100 x 80 mm", ["F"]],
  ["150 x 50 mm", ["F"]],
  ["150 x 100 mm", ["F", "M"]],
  ["GB200 x 150 mm", ["F"]],
]));
add("Reducing Junction 88° With I.O.", (id) => sizeAndSocket(id, [
  ["80 x 50 mm", ["F"]],
  ["100 x 50 mm", ["F", "M", "With Access"]],
  ["100 x 80 mm", ["F"]],
  ["150 x 50 mm", ["F"]],
  ["150 x 100 mm", ["F", "M", "With Access"]],
]));

export const DRAINAGE_UPVC = PRODUCTS;
export const drainageUpvcBySku = Object.fromEntries(PRODUCTS.map((product) => [product.sku, product]));

export function drainageListedRows() {
  return PRODUCTS.map((product) => ({
    sku: product.sku,
    market: "HK",
    category: "Pipe & Fittings & Accessories",
    subcategory: "",
    product: product.name,
    zh: "",
    size: "",
    packing: "",
    grade: "",
    unit: "",
    moq: "",
    lead: "",
    spec: "",
    cert: product.cert,
    purposes: ABOUT,
    price: null,
  }));
}
