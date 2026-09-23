import * as XLSX from "xlsx";
import { adminCsvTemplate } from "./store";

function templateHeaders() {
  return adminCsvTemplate()
    .trim()
    .split(",")
    .map((h) => h.trim())
    .filter(Boolean);
}

export function downloadProductExcelTemplate() {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([templateHeaders()]);
  XLSX.utils.book_append_sheet(wb, ws, "Products");
  XLSX.writeFile(wb, "mattex-product-template.xlsx");
}

export async function excelFileToCsv(file) {
  if (!file) throw new Error("Choose an Excel file first.");
  const name = String(file.name || "").toLowerCase();
  const excel = name.endsWith(".xlsx") || name.endsWith(".xls") || /sheet|excel/i.test(file.type || "");
  if (!excel) throw new Error("Please choose an Excel file (.xlsx).");
  const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) throw new Error("Excel file has no sheet.");
  const csv = XLSX.utils.sheet_to_csv(wb.Sheets[sheetName]);
  if (!String(csv).trim()) throw new Error("The Excel sheet is empty.");
  return csv;
}
