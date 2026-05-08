import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { setPerfRoute } from "@/lib/perfMetrics";

/** Notifica o coletor de métricas a cada troca de rota. */
export const PerfRouteTracker = () => {
  const location = useLocation();
  useEffect(() => {
    setPerfRoute(location.pathname);
  }, [location.pathname]);
  return null;
};

export default PerfRouteTracker;
