import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { initSecurityProtections } from "./lib/security";
import { initPerfMetrics } from "./lib/perfMetrics";

initSecurityProtections();
initPerfMetrics();

createRoot(document.getElementById("root")!).render(<App />);
