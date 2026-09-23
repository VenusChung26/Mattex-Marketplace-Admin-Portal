import { Link } from "react-router-dom";
import { closeAuthModal } from "../lib/store";
import { useLanguage } from "../i18n";
import { withLocale } from "../lib/locale";

export default function MattexChainInvite({ className = "" }) {
  const { t, lang } = useLanguage();
  return (
    <div className={className}>
      <Link
        to={withLocale(lang, "/signup")}
        className="btn-primary !py-3"
        onClick={() => closeAuthModal()}
      >
        {t("openMarketplaceAccount")}
      </Link>
    </div>
  );
}
