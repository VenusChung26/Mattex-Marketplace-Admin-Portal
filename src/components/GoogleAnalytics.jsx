import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { installGtag, shouldInstallGa, trackPageview } from "../lib/analytics";

export default function GoogleAnalytics() {
  const location = useLocation();

  useEffect(() => {
    if (!shouldInstallGa()) return;
    installGtag();
  }, []);

  useEffect(() => {
    if (!shouldInstallGa()) return;
    installGtag();
    trackPageview(location);
  }, [location.pathname, location.search]);

  return null;
}
