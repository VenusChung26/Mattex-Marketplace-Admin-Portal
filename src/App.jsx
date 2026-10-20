import { BrowserRouter, Route, Routes } from "react-router-dom";
import { useEffect } from "react";
import ScrollToTop from "./components/ScrollToTop";
import { LanguageProvider } from "./i18n.jsx";
import AdminPortal from "./pages/admin/AdminPortal";
import StaffSetPasswordPage from "./pages/admin/StaffSetPasswordPage";
import StaffForgotPasswordPage from "./pages/admin/StaffForgotPasswordPage";
import { useStore } from "./hooks/useStore";

function BootGate() {
  const { catalogBootReady } = useStore();
  useEffect(() => {
    if (!catalogBootReady) return undefined;
    const boot = document.querySelector("[data-boot='mattex']");
    if (!boot) return undefined;
    const frame = requestAnimationFrame(() => {
      boot.hidden = true;
    });
    return () => cancelAnimationFrame(frame);
  }, [catalogBootReady]);
  return null;
}

export default function App() {
  return (
    <BrowserRouter>
      <LanguageProvider>
        <BootGate />
        <ScrollToTop />
        <Routes>
          <Route path="/set-password" element={<StaffSetPasswordPage />} />
          <Route path="/forgot-password" element={<StaffForgotPasswordPage />} />
          <Route path="*" element={<AdminPortal />} />
        </Routes>
      </LanguageProvider>
    </BrowserRouter>
  );
}
