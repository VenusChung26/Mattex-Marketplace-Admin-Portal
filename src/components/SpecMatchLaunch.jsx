import { useNavigate } from "react-router-dom";
import { useLanguage } from "../i18n";
import { withLocale } from "../lib/locale";

export default function SpecMatchLaunch({ className, children, ...rest }) {
  const { lang } = useLanguage();
  const navigate = useNavigate();

  return (
    <button type="button" className={className} {...rest} onClick={() => navigate(withLocale(lang, "/spec-match"))}>
      {children}
    </button>
  );
}
