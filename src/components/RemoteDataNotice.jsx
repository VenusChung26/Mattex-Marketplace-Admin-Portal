import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useLanguage } from "../i18n";
import { getRemoteDataReady, subscribeRemoteData } from "../lib/supabasePersist";

export default function RemoteDataNotice() {
  const ready = useSyncExternalStore(subscribeRemoteData, getRemoteDataReady, () => null);
  const hadOutage = useRef(false);
  const [reviewNeeded, setReviewNeeded] = useState(false);
  const { lang } = useLanguage();
  const zh = lang === "zh";

  useEffect(() => {
    if (ready === false) hadOutage.current = true;
    else if (ready === true && hadOutage.current) {
      hadOutage.current = false;
      setReviewNeeded(true);
    }
  }, [ready]);

  if (ready !== false && !reviewNeeded) return null;
  const message = ready === false
    ? (zh ? "連線暫時中斷。請保留頁面；變更尚未確認儲存，恢復後請重新儲存。" : "Connection interrupted. Keep this page open; changes are not confirmed saved. Please save again after reconnecting.")
    : (zh ? "連線已恢復。如剛才儲存失敗，請重新儲存；系統不會自動重送。" : "Connection restored. Please retry any failed saves; changes are not resubmitted automatically.");

  return (
    <div role="status" className="sticky top-0 z-[70] flex items-center justify-between gap-4 bg-amber-50 px-4 py-3 text-sm text-amber-950">
      <p>{message}</p>
      {ready === true && <button type="button" className="shrink-0 underline" onClick={() => setReviewNeeded(false)}>{zh ? "知道了" : "Dismiss"}</button>}
    </div>
  );
}
