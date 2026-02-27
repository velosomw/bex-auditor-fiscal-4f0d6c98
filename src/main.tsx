import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { initSecurityProtections } from "./lib/security";

initSecurityProtections();

createRoot(document.getElementById("root")!).render(<App />);
