const PRODUCT = /防火|石膏|岩棉|礦棉|密封膠|密封|批盪|夾板|防水|保溫|混凝土|水泥|角鋼|鋼筋|螺絲|瓷磚|地磚|喉管|線槽|格柵|竹棚|板|磚|網|管|鋼|門|窗|玻璃|鋁|砂|\b(?:tile|board|mesh|pipe|screw|h-tec|gypsum|plasterboard|drywall|studs?|channels?|rockwool|mineral\s*wool|sealants?|concrete|plinths?|cements?|bricks?|blocks?|steels?|angles?|timbers?|plywoods?|insulations?|membranes?|waterproof(?:ing)?|doors?|windows?|paints?|glass|aluminium|aluminum|cables?|ducts?|valves?|gratings?|screeds?|aggregates?|rebars?|reinforcements?|panels?|furrings?|scaffold(?:ing)?)\b/i;

const SECTION = /^(?:partitioning|concrete\s+works?|brickwork(?:\s*&\s*blockwork)?|blockwork|finishes|finishing\s+works?|builder'?s?\s+work)(?:\s*-\s*not\s+used)?$/i;

const PLACE = /^(?:landscape\s+deck|archives?\s+repository|(?:inner|outer|external|internal)\s+wall\s+surfaces?|(?:slab\s+)?soffit(?:\s*\/\s*ceiling)?|ceiling|detailed\s+location)$/i;

function clean(line) {
  return String(line || "").replace(/\s+/g, " ").trim();
}

function bareLine(text) {
  return text.replace(/^[•·\-–—\s]+/, "").replace(/[：:|]+$/, "").trim();
}

/** A date, heading, standard citation, or boilerplate line. Not a material name. */
function isNotMaterialName(text) {
  const bare = bareLine(text);
  if (!bare) return true;
  if (/^(?:date|dated|issued|revised|issue\s*date|revision\s*date|日期|發出日期|修訂日期)\s*[:：]/i.test(bare)) return true;
  if (/^(?:date|dated)\s*[:：]?\s*(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?|\d{4}|\d{1,2}[/-]\d{1,2})/i.test(bare)) return true;
  if (/^(?:general|particular|technical)\s+requirements?$/i.test(bare)) return true;
  if (/^(?:一般|特別|特殊|技術)要求$/.test(bare)) return true;
  if (/^brand\s*\/\s*model$/i.test(bare)) return true;
  if (/^material\s+performan?ce\s+specification$/i.test(bare)) return true;
  if (/^duty["”']?\s+criteria\b/i.test(bare)) return true;
  if (/\b(?:shall achieve|to be verified|field test|inclusion of)\b/i.test(bare)) return true;
  if (/^or\s+approved\s+equivalent\.?$/i.test(bare)) return true;
  if (/^或(?:核准)?同等(?:產品|物料)?\.?$/.test(bare)) return true;
  if (/^(?:prepared|checked|approved|drawn)\s+by\b/i.test(bare)) return true;
  if (/^page\s+\d+(\s+of\s+\d+)?$/i.test(bare)) return true;
  if (/^第\s*\d+\s*頁/.test(bare) && bare.length < 16) return true;
  const label = bare.replace(/[（(]/g, "(").replace(/[）)]/g, ")");
  if (/^amount\s*\(\s*hk\s*\$?\s*\)$/i.test(label)) return true;
  if (/^(?:unit\s*)?rate\s*\(\s*hk\s*\$?\s*\)$/i.test(label)) return true;
  if (/^(?:amount|rate|unit\s*rate|qty|quantity|unit|item\s*no\.?|item|description|detailed\s+location|location)$/i.test(label)) return true;
  if (/^(?:金額|單價|數量|單位|項目|位置)$/.test(label)) return true;
  if (/^schedule\s+of\s+quantities\s+and\s+rates$/i.test(label)) return true;
  if (/^schedule\s+no\.?\s*[\d.]+$/i.test(label)) return true;
  if (/^[（(]?\s*h?n?serted\s+by\s*[）)]?$/i.test(label)) return true;
  if (/^allow\s+below\b/i.test(label)) return true;
  if (/^necessary\s+for\s+completion\s+of\s+the\s+works\b/i.test(label)) return true;
  if (PRODUCT.test(bare)) return false;
  if (/^(?:compliance(?:\s+of)?\s+)?(?:bs|astm|en|iso|gb\/t|gb)[\d:.&\w\s/-]*$/i.test(bare)) return true;
  if (/^\d+\s*-?\s*hours?\s+fire\s+rating$/i.test(bare)) return true;
  if (/^(?:overall\b.+\bthickness\s*=|sound\s+reduction\b|min\.?\s*stc\b)/i.test(bare)) return true;
  return false;
}

/** A short material or product line, in the same shape as a Marketplace product description. */
export function isProductDescription(line) {
  const text = clean(line);
  const bare = bareLine(text);
  if (!bare || bare.length > 220 || isNotMaterialName(text)) return false;
  if (SECTION.test(bare) || PLACE.test(bare)) return false;
  if (/^(?:and|or)\b/i.test(bare)) return false;
  if (/\b(?:shall|should|must|required to)\b/i.test(bare)) return false;
  if (/\b(?:strategy|penetrations?)\b/i.test(bare)) return false;
  if (/^(?:and\s+)?all\s+necessary\b/i.test(bare)) return false;
  return PRODUCT.test(bare);
}

/** Chat, a greeting, a file chip, a signature, or a line that is not a material. */
export function isChatNoise(line) {
  const text = clean(line);
  if (!text) return false;
  if (isNotMaterialName(text)) return true;
  if (text.length <= 40 && /^(?:[\p{L}.．·][\p{L}.．·\s]{0,30}[，,]\s*)?(?:早晨|早安|早上好|午安|晚安|你好|您好|哈囉|哈啰|hello|hi|hey|good\s*morning|good\s*afternoon|good\s*evening)[!！.。~\s]*$/iu.test(text)) return true;
  if (PRODUCT.test(text)) return false;
  if (/早晨|早安|早上好|午安|晚安|你好|您好|good\s*morning|check\s*check|幫你處理|帮你处理/i.test(text)) return true;
  if (/^\d+\s*頁\s*[•·.\s]*pdf\s*[•·.\s]*\d+(?:\.\d+)?\s*mb$/i.test(text)) return true;
  if (/[?？]|是否可以|報價人|报价人/.test(text)) return true;
  if (text.length < 80 && /\b(?:ltd|limited|company)\b|有限公司/i.test(text)) return true;
  return false;
}
