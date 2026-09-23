import { useLanguage } from "../i18n";
import { openUrlForAttachment } from "../lib/extractSpec";

export default function AttachmentLinks({ files, className = "mt-0.5 text-xs text-brand-700", label }) {
  const { t } = useLanguage();
  if (!files?.length) return null;

  return (
    <p className={className}>
      {label || t("uploadSpecForItem")}:{" "}
      {files.map((file, i) => {
        const href = openUrlForAttachment(file);
        return (
          <span key={`${file.name}-${i}`}>
            {i ? ", " : null}
            {href ? (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-2 hover:text-brand-800"
                onClick={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
              >
                {file.name}
              </a>
            ) : (
              <span>{file.name}</span>
            )}
          </span>
        );
      })}
    </p>
  );
}
