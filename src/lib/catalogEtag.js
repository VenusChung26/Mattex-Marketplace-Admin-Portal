/** Catalog versions are opaque and shared by the first render, polls and live reads. */
export function catalogContentStamp(value) {
  return String(value || "");
}
