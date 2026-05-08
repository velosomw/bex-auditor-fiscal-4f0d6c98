/**
 * Sistema de alertas de regressão de performance.
 * - Baseline: snapshot fixado pelo usuário (por rota), guardado em localStorage.
 * - Thresholds: percentuais configuráveis (LCP, FCP, TTFB, INP, TTI, JS bytes).
 * - Avaliação: compara últimas amostras agregadas (média) contra o baseline.
 */

import { generateReport, type PerfReport } from "@/lib/perfMetrics";

export type AlertMetric = "LCP" | "FCP" | "TTFB" | "INP" | "ttiApprox" | "bundleJsKb";

export type Thresholds = Record<AlertMetric, number>; // % de piora tolerada

export const DEFAULT_THRESHOLDS: Thresholds = {
  LCP: 10,
  FCP: 10,
  TTFB: 15,
  INP: 15,
  ttiApprox: 15,
  bundleJsKb: 20,
};

const TH_KEY = "bex_perf_thresholds_v1";
const BASE_KEY = "bex_perf_baseline_v1";

export type Baseline = Record<string, Partial<Record<AlertMetric, number>>>; // route -> metric -> value

export function loadThresholds(): Thresholds {
  try {
    const raw = localStorage.getItem(TH_KEY);
    return raw ? { ...DEFAULT_THRESHOLDS, ...JSON.parse(raw) } : { ...DEFAULT_THRESHOLDS };
  } catch {
    return { ...DEFAULT_THRESHOLDS };
  }
}

export function saveThresholds(t: Thresholds) {
  localStorage.setItem(TH_KEY, JSON.stringify(t));
}

export function loadBaseline(): Baseline {
  try {
    const raw = localStorage.getItem(BASE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function saveBaseline(b: Baseline) {
  localStorage.setItem(BASE_KEY, JSON.stringify(b));
}

/** Fixa o estado atual como baseline para todas as rotas com amostras. */
export function captureBaselineFromCurrent(): Baseline {
  const report = generateReport();
  const base: Baseline = {};
  for (const [route, data] of Object.entries(report.byRoute)) {
    base[route] = {
      LCP: data.avg.LCP,
      FCP: data.avg.FCP,
      TTFB: data.avg.TTFB,
      INP: data.avg.INP,
      ttiApprox: data.avg.ttiApprox,
      bundleJsKb: data.bundleJsKb,
    };
  }
  saveBaseline(base);
  return base;
}

export function clearBaseline() {
  localStorage.removeItem(BASE_KEY);
}

export type PerfAlert = {
  route: string;
  metric: AlertMetric;
  baseline: number;
  current: number;
  deltaPct: number;
  threshold: number;
};

export function evaluateAlerts(
  report: PerfReport = generateReport(),
  baseline: Baseline = loadBaseline(),
  thresholds: Thresholds = loadThresholds(),
): PerfAlert[] {
  const alerts: PerfAlert[] = [];
  for (const [route, data] of Object.entries(report.byRoute)) {
    const b = baseline[route];
    if (!b) continue;
    const current: Record<AlertMetric, number | undefined> = {
      LCP: data.avg.LCP,
      FCP: data.avg.FCP,
      TTFB: data.avg.TTFB,
      INP: data.avg.INP,
      ttiApprox: data.avg.ttiApprox,
      bundleJsKb: data.bundleJsKb,
    };
    (Object.keys(current) as AlertMetric[]).forEach((m) => {
      const baseVal = b[m];
      const curVal = current[m];
      if (baseVal == null || curVal == null || baseVal <= 0) return;
      const deltaPct = ((curVal - baseVal) / baseVal) * 100;
      if (deltaPct > thresholds[m]) {
        alerts.push({
          route,
          metric: m,
          baseline: baseVal,
          current: curVal,
          deltaPct,
          threshold: thresholds[m],
        });
      }
    });
  }
  return alerts.sort((a, b) => b.deltaPct - a.deltaPct);
}
