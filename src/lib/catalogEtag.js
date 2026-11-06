/** Shop GET /api/catalog appends transform suffixes; version polls return the base snapshot etag. */
export function catalogContentStamp(value) {
  return String(value || "")
    .replace(/-timber-ply-fold\d+$/i, "")
    .replace(/-ask(?:-[a-z0-9]+)*$/i, "");
}
