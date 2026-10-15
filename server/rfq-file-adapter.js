import fs from "node:fs";
import path from "node:path";

const FILE = () => path.join(process.cwd(), ".local-rfq-store.json");

/**
 * Local development storage for RFQ and PO. One JSON file, written atomically (temp file then rename)
 * so a crash never leaves half a file. Vercel disks are read-only, so this is for local use only.
 */
export function fileAdapter() {
  return {
    async load() {
      try {
        const parsed = JSON.parse(fs.readFileSync(FILE(), "utf8"));
        return parsed && typeof parsed === "object" ? parsed : null;
      } catch {
        return null;
      }
    },
    async save(state) {
      const target = FILE();
      const temp = `${target}.${process.pid}.tmp`;
      fs.writeFileSync(temp, JSON.stringify(state));
      fs.renameSync(temp, target);
    },
  };
}
