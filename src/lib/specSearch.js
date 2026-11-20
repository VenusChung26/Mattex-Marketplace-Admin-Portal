import { foldHan } from "./han.js";
import { specGroupApplies } from "./productFields.js";
import { preparedSpecGroups, selectionOptionKey, selectionOptionLabel } from "./productSelection.js";

export function isCustomizeSizeLabel(value) {
  return /^(customize size|custom dimensions)$/i.test(String(value || "").trim());
}

export function isPlainCustomizeLabel(value) {
  return /^(customize|customization|customize drawing upload)$/i.test(String(value || "").trim());
}

export function isCustomizeLabel(value) {
  return isCustomizeSizeLabel(value) || isPlainCustomizeLabel(value);
}

export function customizeButtonText(value, lang) {
  if (isCustomizeSizeLabel(value)) return lang === "zh" ? "自訂尺寸" : "Customize Size";
  if (isPlainCustomizeLabel(value)) return lang === "zh" ? "自訂規格" : "Customize";
  return "";
}

function optionBits(option) {
  if (option == null) return [];
  if (typeof option !== "object") return [String(option)];
  return [option.label, option.key, option.detail, option.summary, option.sku, ...(Array.isArray(option.specs) ? option.specs : [])];
}

function choiceBits(choice) {
  if (!choice || typeof choice !== "object") return [];
  return [choice.detail, choice.summary, choice.sku, ...(Array.isArray(choice.specs) ? choice.specs : []), ...Object.values(choice.picks || {})];
}

function searchableBits(bits) {
  return bits.map((bit) => String(bit || "").trim()).filter((bit) => bit && !isCustomizeLabel(bit));
}

export function specOptionSearchText(product) {
  const parts = [];
  for (const group of product?.specGroups || []) {
    for (const option of group?.options || []) parts.push(...searchableBits(optionBits(option)));
  }
  for (const choice of product?.specChoices || []) parts.push(...searchableBits(choiceBits(choice)));
  return parts.join(" ");
}

function parentPicks(groups, group, option) {
  const picks = { [group.id]: selectionOptionKey(option) };
  let parent = option && typeof option === "object" ? option.parent : "";
  let depends = group.dependsOn;
  for (let guard = 0; parent && depends && guard < 8; guard += 1) {
    const parentGroup = groups.find((item) => item?.id === depends);
    if (!parentGroup) break;
    const parentOption = (parentGroup.options || []).find((item) => selectionOptionKey(item) === parent || selectionOptionLabel(item) === parent);
    picks[parentGroup.id] = parentOption ? selectionOptionKey(parentOption) : parent;
    parent = parentOption && typeof parentOption === "object" ? parentOption.parent : "";
    depends = parentGroup.dependsOn;
  }
  return picks;
}

function scoreMatch(tokens, label, text) {
  const foldedLabel = foldHan(label).toLowerCase();
  const foldedText = foldHan(text).toLowerCase();
  const hits = tokens.filter((token) => foldedText.includes(token));
  if (!hits.length) return 0;
  const exact = tokens.some((token) => foldedLabel === token);
  return (exact ? 1000 : 0) + hits.length * 20 + foldedLabel.length;
}

/** Closest spec option for a search. Exact label wins, otherwise the longer label. */
export function bestSpecMatch(product, query) {
  const tokens = foldHan(String(query || "").trim()).toLowerCase().split(/\s+/).filter((token) => token.length >= 2);
  if (!tokens.length || !product) return null;
  const groups = preparedSpecGroups(product.specGroups);
  let best = null;
  for (const group of groups) {
    for (const option of group?.options || []) {
      const label = selectionOptionLabel(option);
      if (!label || isCustomizeLabel(label)) continue;
      const text = searchableBits(optionBits(option)).join(" ");
      const score = scoreMatch(tokens, label, text);
      if (!score || (best && score <= best.score)) continue;
      best = { score, label, picks: parentPicks(groups, group, option) };
    }
  }
  for (const choice of product.specChoices || []) {
    const picks = choice?.picks || {};
    const label = Object.values(picks).map((value) => String(value || "").trim()).find((value) => value && !isCustomizeLabel(value)) || "";
    if (!label) continue;
    const text = searchableBits(choiceBits(choice)).join(" ");
    const score = scoreMatch(tokens, label, text);
    if (!score || (best && score <= best.score)) continue;
    best = { score, label, picks: { ...picks } };
  }
  return best ? { label: best.label, picks: best.picks } : null;
}

/** Matched option, its parents, and the first standard choice in each following group. */
export function searchSpecPicks(product, query) {
  const match = bestSpecMatch(product, query);
  if (!match || !product) return null;
  const groups = preparedSpecGroups(product.specGroups);
  const next = { ...match.picks };
  for (const group of groups) {
    if (next[group.id] || group.field || !specGroupApplies(group, next)) continue;
    const parent = group.dependsOn ? next[group.dependsOn] : "";
    if (group.dependsOn && !parent) continue;
    const option = (group.options || []).find((item) => {
      const label = selectionOptionLabel(item);
      if (!label || isCustomizeLabel(label)) return false;
      if (item && typeof item === "object" && item.parent && item.parent !== parent) return false;
      if (item && typeof item === "object" && item.with && item.with !== next[item.withGroup]) return false;
      return true;
    });
    if (option) next[group.id] = selectionOptionKey(option);
  }
  return next;
}

function optionNames(group) {
  return new Set((group?.options || []).flatMap((option) => [selectionOptionLabel(option), selectionOptionKey(option)]));
}

/** Map an unsent draft's old custom labels onto the product's current options. */
export function migratePickedSpecs(groups, picks) {
  if (!picks || typeof picks !== "object") return picks || null;
  const shown = preparedSpecGroups(groups);
  const next = { ...picks };
  for (const group of shown) {
    const value = String(next[group.id] || "").trim();
    if (!value) continue;
    const names = optionNames(group);
    if (names.has(value)) continue;
    let mapped = value;
    if (isCustomizeSizeLabel(value) && names.has("Customize Size")) mapped = "Customize Size";
    else if (isPlainCustomizeLabel(value) && names.has("Customize")) mapped = "Customize";
    else if (/^customize$/i.test(value) && names.has("Customize Size") && !names.has("Customize")) mapped = "Customize Size";
    else if (/^customize size$/i.test(value) && names.has("Customize") && !names.has("Customize Size")) mapped = "Customize";
    if (names.has(mapped)) next[group.id] = mapped;
  }
  return next;
}
