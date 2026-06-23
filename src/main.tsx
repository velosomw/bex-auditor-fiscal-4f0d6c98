import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { initSecurityProtections } from "./lib/security";
import { initPerfMetrics } from "./lib/perfMetrics";

initSecurityProtections();
initPerfMetrics();

// Auto-recover from stale dynamic import chunks after a new deploy
window.addEventListener("vite:preloadError", () => {
  if (!sessionStorage.getItem("__chunk_reloaded__")) {
    sessionStorage.setItem("__chunk_reloaded__", "1");
    window.location.reload();
  }
});
window.addEventListener("error", (e) => {
  const msg = e?.message || "";
  if (msg.includes("Failed to fetch dynamically imported module") && !sessionStorage.getItem("__chunk_reloaded__")) {
    sessionStorage.setItem("__chunk_reloaded__", "1");
    window.location.reload();
  }
});

createRoot(document.getElementById("root")!).render(<App />);
