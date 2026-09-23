import { useLanguage } from "../i18n";

export default function ProjectListEditor({
  projects = [],
  onChange,
  idPrefix = "project",
  compact = false,
}) {
  const { t } = useLanguage();
  const rows = Array.isArray(projects) && projects.length ? projects : [""];

  function setRow(index, value) {
    const next = rows.slice();
    next[index] = value;
    onChange(next);
  }

  function addRow() {
    onChange([...rows, ""]);
  }

  function removeRow(index) {
    if (rows.length <= 1) {
      onChange([""]);
      return;
    }
    onChange(rows.filter((_, i) => i !== index));
  }

  return (
    <div className="space-y-2">
      {rows.map((name, index) => (
        <div key={`${idPrefix}-${index}`} className="flex items-center gap-2">
          <input
            type="text"
            value={name}
            onChange={(e) => setRow(index, e.target.value)}
            placeholder={t("projectPlaceholder")}
            autoComplete="off"
            className={`field-input min-w-0 flex-1 ${compact ? "!py-2" : ""}`}
          />
          <button
            type="button"
            className="shrink-0 text-xs font-semibold text-mute hover:text-[#8a2b2b]"
            onClick={() => removeRow(index)}
          >
            {t("deleteProject")}
          </button>
        </div>
      ))}
      <button type="button" className="text-xs font-semibold text-brand-700 hover:text-brand-800" onClick={addRow}>
        + {t("addProject")}
      </button>
    </div>
  );
}
