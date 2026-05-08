/**
 * Coleta de métricas de performance no cliente.
 * - Web Vitals: FCP, LCP, CLS, INP, TTFB
 * - TTI aproximado (fallback) via PerformanceObserver de longtasks
 * - Tamanho de bundle por rota: agrega bytes de scripts JS carregados (transferSize)
 *
 * Persistência:
 *  - localStorage key: bex_perf_metrics_v1 (array de snapshots por rota)
 *  - Expor window.__bexPerf para inspeção e download de relatório.
 */

import { onCLS, onFCP, onINP, onLCP, onTTFB, type Metric } from "web-vitals";

type Vitals = Partial<Record<"FCP" | "LCP" | "CLS" | "INP" | "TTFB", number>>;

type RouteSnapshot = {
  route: string;
  ts: string;
  vitals: Vitals;
  ttiApprox?: number;
  bundle: {
    jsBytes: number;
    jsCount: number;
    cssBytes: number;
    cssCount: number;
    totalBytes: number;
    scripts: { name: string; bytes: number }[];
  };
  navigation?: {
    domContentLoaded?: number;
    loadEvent?: number;
    domInteractive?: number;
  };
};

const STORAGE_KEY = "bex_perf_metrics_v1";
const MAX_SNAPSHOTS = 200;

let currentRoute = typeof window !== "undefined" ? window.location.pathname : "/";
let vitals: Vitals = {};
let lastLongTaskEnd = 0;
let snapshotTimer: number | null = null;

function loadAll(): RouteSnapshot[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as RouteSnapshot[]) : [];
  } catch {
    return [];
  }
}

function saveAll(items: RouteSnapshot[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(-MAX_SNAPSHOTS)));
  } catch {
    /* quota */
  }
}

function bundleForRoute(route: string) {
  const scripts: { name: string; bytes: number }[] = [];
  let jsBytes = 0;
  let jsCount = 0;
  let cssBytes = 0;
  let cssCount = 0;

  const entries = performance.getEntriesByType("resource") as PerformanceResourceTiming[];
  for (const e of entries) {
    const size = e.transferSize || e.encodedBodySize || 0;
    const url = e.name.split("?")[0];
    if (e.initiatorType === "script" || /\.js$/.test(url)) {
      jsBytes += size;
      jsCount += 1;
      scripts.push({ name: url.split("/").slice(-1)[0], bytes: size });
    } else if (e.initiatorType === "css" || e.initiatorType === "link" || /\.css$/.test(url)) {
      if (/\.css$/.test(url)) {
        cssBytes += size;
        cssCount += 1;
      }
    }
  }
  scripts.sort((a, b) => b.bytes - a.bytes);
  return {
    jsBytes,
    jsCount,
    cssBytes,
    cssCount,
    totalBytes: jsBytes + cssBytes,
    scripts: scripts.slice(0, 15),
    route,
  };
}

function navTiming() {
  const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
  if (!nav) return undefined;
  return {
    domContentLoaded: Math.round(nav.domContentLoadedEventEnd),
    loadEvent: Math.round(nav.loadEventEnd),
    domInteractive: Math.round(nav.domInteractive),
  };
}

function approxTTI(): number | undefined {
  // Aproximação: max(domInteractive, último longtask antes de 5s de quietude)
  const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
  const di = nav?.domInteractive ?? 0;
  return Math.round(Math.max(di, lastLongTaskEnd));
}

function captureSnapshot(reason: string) {
  const snap: RouteSnapshot = {
    route: currentRoute,
    ts: new Date().toISOString(),
    vitals: { ...vitals },
    ttiApprox: approxTTI(),
    bundle: bundleForRoute(currentRoute),
    navigation: navTiming(),
  };
  const all = loadAll();
  all.push(snap);
  saveAll(all);
  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.info(`[perf] snapshot (${reason})`, snap);
  }
}

function scheduleSnapshot() {
  if (snapshotTimer) window.clearTimeout(snapshotTimer);
  snapshotTimer = window.setTimeout(() => captureSnapshot("debounced"), 4000);
}

function bindVital(metric: Metric) {
  vitals[metric.name as keyof Vitals] = Math.round(metric.value);
  scheduleSnapshot();
}

export function initPerfMetrics() {
  if (typeof window === "undefined") return;
  if ((window as unknown as { __bexPerfInit?: boolean }).__bexPerfInit) return;
  (window as unknown as { __bexPerfInit?: boolean }).__bexPerfInit = true;

  try {
    onFCP(bindVital);
    onLCP(bindVital);
    onCLS(bindVital);
    onINP(bindVital);
    onTTFB(bindVital);
  } catch {
    /* noop */
  }

  try {
    const po = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        lastLongTaskEnd = Math.max(lastLongTaskEnd, entry.startTime + entry.duration);
      }
    });
    po.observe({ type: "longtask", buffered: true });
  } catch {
    /* unsupported */
  }

  window.addEventListener("load", () => scheduleSnapshot());
  window.addEventListener("beforeunload", () => captureSnapshot("unload"));

  (window as unknown as Record<string, unknown>).__bexPerf = {
    snapshot: () => captureSnapshot("manual"),
    all: () => loadAll(),
    clear: () => saveAll([]),
    report: () => generateReport(),
    download: () => downloadReport(),
  };
}

export function setPerfRoute(route: string) {
  if (route === currentRoute) return;
  // captura snapshot da rota anterior antes de trocar
  captureSnapshot("route-change");
  currentRoute = route;
  vitals = {};
  lastLongTaskEnd = 0;
  scheduleSnapshot();
}

// ---------- Relatório ----------

export type PerfReport = {
  generatedAt: string;
  totalSnapshots: number;
  byRoute: Record<
    string,
    {
      samples: number;
      bundleJsKb: number;
      bundleTotalKb: number;
      avg: Vitals & { ttiApprox?: number };
      best: Vitals & { ttiApprox?: number };
      worst: Vitals & { ttiApprox?: number };
      topScripts: { name: string; kb: number }[];
    }
  >;
};

function avg(nums: number[]) {
  if (!nums.length) return undefined;
  return Math.round(nums.reduce((a, b) => a + b, 0) / nums.length);
}

export function generateReport(): PerfReport {
  const all = loadAll();
  const byRoute: PerfReport["byRoute"] = {};
  const grouped = new Map<string, RouteSnapshot[]>();
  for (const s of all) {
    if (!grouped.has(s.route)) grouped.set(s.route, []);
    grouped.get(s.route)!.push(s);
  }
  for (const [route, snaps] of grouped) {
    const keys: (keyof Vitals)[] = ["FCP", "LCP", "CLS", "INP", "TTFB"];
    const collect = (k: keyof Vitals) => snaps.map((s) => s.vitals[k]).filter((v): v is number => v != null);
    const ttis = snaps.map((s) => s.ttiApprox).filter((v): v is number => v != null);
    const last = snaps[snaps.length - 1];
    const avgVitals: Vitals & { ttiApprox?: number } = {};
    const bestVitals: Vitals & { ttiApprox?: number } = {};
    const worstVitals: Vitals & { ttiApprox?: number } = {};
    for (const k of keys) {
      const vs = collect(k);
      avgVitals[k] = avg(vs);
      if (vs.length) {
        bestVitals[k] = Math.min(...vs);
        worstVitals[k] = Math.max(...vs);
      }
    }
    if (ttis.length) {
      avgVitals.ttiApprox = avg(ttis);
      bestVitals.ttiApprox = Math.min(...ttis);
      worstVitals.ttiApprox = Math.max(...ttis);
    }
    byRoute[route] = {
      samples: snaps.length,
      bundleJsKb: Math.round(last.bundle.jsBytes / 1024),
      bundleTotalKb: Math.round(last.bundle.totalBytes / 1024),
      avg: avgVitals,
      best: bestVitals,
      worst: worstVitals,
      topScripts: last.bundle.scripts.slice(0, 8).map((s) => ({ name: s.name, kb: Math.round(s.bytes / 1024) })),
    };
  }
  return {
    generatedAt: new Date().toISOString(),
    totalSnapshots: all.length,
    byRoute,
  };
}

export function downloadReport() {
  const report = generateReport();
  const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `bex-perf-report-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  return report;
}
