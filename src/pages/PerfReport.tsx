import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { AlertTriangle, Bell } from "lucide-react";
import { generateReport, downloadReport, type PerfReport } from "@/lib/perfMetrics";
import {
  type AlertMetric,
  type Thresholds,
  loadThresholds,
  saveThresholds,
  loadBaseline,
  saveBaseline,
  captureBaselineFromCurrent,
  clearBaseline,
  evaluateAlerts,
  DEFAULT_THRESHOLDS,
} from "@/lib/perfAlerts";

const fmt = (n?: number) => (n == null ? "—" : n.toLocaleString("pt-BR"));
const METRIC_LABELS: Record<AlertMetric, string> = {
  LCP: "LCP (ms)",
  FCP: "FCP (ms)",
  TTFB: "TTFB (ms)",
  INP: "INP (ms)",
  ttiApprox: "TTI ~ (ms)",
  bundleJsKb: "Bundle JS (KB)",
};

const PerfReportPage = () => {
  const [report, setReport] = useState<PerfReport>(() => generateReport());
  const [thresholds, setThresholds] = useState<Thresholds>(() => loadThresholds());
  const [baseline, setBaselineState] = useState(() => loadBaseline());
  const [notifiedKeys, setNotifiedKeys] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    const t = window.setInterval(() => setReport(generateReport()), 5000);
    return () => window.clearInterval(t);
  }, []);

  const alerts = useMemo(
    () => evaluateAlerts(report, baseline, thresholds),
    [report, baseline, thresholds],
  );

  // Notifica via toast quando um novo alerta aparece.
  useEffect(() => {
    const next = new Set(notifiedKeys);
    let changed = false;
    for (const a of alerts) {
      const key = `${a.route}|${a.metric}|${Math.round(a.deltaPct)}`;
      if (!next.has(key)) {
        next.add(key);
        changed = true;
        toast.warning(`Regressão em ${a.route}`, {
          description: `${METRIC_LABELS[a.metric]}: ${fmt(Math.round(a.baseline))} → ${fmt(Math.round(a.current))} (+${a.deltaPct.toFixed(1)}%, limite ${a.threshold}%)`,
        });
      }
    }
    if (changed) setNotifiedKeys(next);
  }, [alerts, notifiedKeys]);

  const routes = Object.entries(report.byRoute).sort(([, a], [, b]) => b.bundleJsKb - a.bundleJsKb);

  const updateThreshold = (m: AlertMetric, v: number) => {
    const next = { ...thresholds, [m]: v };
    setThresholds(next);
    saveThresholds(next);
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Relatório de Performance</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Snapshots coletados: {report.totalSnapshots} · Atualizado a cada 5s · Gerado em{" "}
            {new Date(report.generatedAt).toLocaleString("pt-BR")}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setReport(generateReport())}>
            Atualizar
          </Button>
          <Button
            onClick={() => {
              downloadReport();
            }}
          >
            Baixar JSON
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              localStorage.removeItem("bex_perf_metrics_v1");
              setReport(generateReport());
            }}
          >
            Limpar
          </Button>
        </div>
      </div>

      {routes.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Nenhuma métrica coletada ainda. Navegue pela aplicação e volte aqui.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {routes.map(([route, data]) => (
            <Card key={route}>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center justify-between flex-wrap gap-2">
                  <span className="font-mono text-sm">{route}</span>
                  <span className="text-xs text-muted-foreground font-normal">
                    {data.samples} amostra(s) · JS {data.bundleJsKb} KB · Total {data.bundleTotalKb} KB
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b text-muted-foreground">
                        <th className="text-left py-2 font-medium">Métrica</th>
                        <th className="text-right py-2 font-medium">Média</th>
                        <th className="text-right py-2 font-medium">Melhor</th>
                        <th className="text-right py-2 font-medium">Pior</th>
                      </tr>
                    </thead>
                    <tbody className="font-mono">
                      {(["FCP", "LCP", "TTFB", "INP", "CLS"] as const).map((k) => (
                        <tr key={k} className="border-b border-border/40">
                          <td className="py-1.5">{k} {k === "CLS" ? "" : "(ms)"}</td>
                          <td className="text-right">{fmt(data.avg[k])}</td>
                          <td className="text-right text-emerald-600">{fmt(data.best[k])}</td>
                          <td className="text-right text-rose-600">{fmt(data.worst[k])}</td>
                        </tr>
                      ))}
                      <tr className="border-b border-border/40">
                        <td className="py-1.5">TTI ~ (ms)</td>
                        <td className="text-right">{fmt(data.avg.ttiApprox)}</td>
                        <td className="text-right text-emerald-600">{fmt(data.best.ttiApprox)}</td>
                        <td className="text-right text-rose-600">{fmt(data.worst.ttiApprox)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {data.topScripts.length > 0 && (
                  <div className="mt-4">
                    <p className="text-xs text-muted-foreground mb-2">Top scripts carregados nesta rota:</p>
                    <ul className="text-xs font-mono space-y-1">
                      {data.topScripts.map((s) => (
                        <li key={s.name} className="flex justify-between border-b border-border/30 py-1">
                          <span className="truncate pr-3">{s.name}</span>
                          <span className="text-muted-foreground">{s.kb} KB</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <div className="mt-8 text-xs text-muted-foreground">
        Dica: no console do navegador, use <code>window.__bexPerf.report()</code>,{" "}
        <code>window.__bexPerf.download()</code> ou <code>window.__bexPerf.clear()</code>.
      </div>
    </div>
  );
};

export default PerfReportPage;
