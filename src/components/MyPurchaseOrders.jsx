import { Link } from "react-router-dom";
import { usePurchaseOrders } from "../hooks/usePurchaseOrders";
import { useLanguage } from "../i18n";
import { withLocale } from "../lib/locale";

/** Small link from My RFQs to the purchase orders page. The list itself lives at /pos (display only, from the server). */
export default function MyPurchaseOrders({ signedIn }) {
  const { lang } = useLanguage();
  const { records } = usePurchaseOrders(Boolean(signedIn));
  if (!signedIn) return null;
  const label = lang === "zh" ? "我的採購單" : "My purchase orders";
  return (
    <p className="mb-3 text-sm">
      <Link to={withLocale(lang, "/pos")} className="font-semibold text-brand-700 hover:underline">
        {label}
        {records.length ? ` ${records.length}` : ""} →
      </Link>
    </p>
  );
}
