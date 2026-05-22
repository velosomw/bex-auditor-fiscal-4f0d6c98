// Prefetch idle das rotas autenticadas mais usadas.
// Cada importação dispara o fetch do chunk; o navegador faz cache para a navegação real.

type Loader = () => Promise<unknown>;

const loaders: Record<string, Loader> = {
  userDashboard: () => import("@/pages/UserDashboard"),
  userEmpresas: () => import("@/pages/UserEmpresas"),
  audit: () => import("@/pages/Audit"),
  reportView: () => import("@/pages/ReportView"),
  companyPage: () => import("@/pages/CompanyPage"),
  empresas: () => import("@/pages/Empresas"),
  dashboard: () => import("@/pages/Dashboard"),
  gestorIA: () => import("@/pages/GestorIA"),
};

const prefetched = new Set<string>();

const runIdle = (cb: () => void) => {
  const ric = (globalThis as any).requestIdleCallback as
    | ((cb: () => void, opts?: { timeout?: number }) => number)
    | undefined;
  if (ric) ric(cb, { timeout: 2000 });
  else setTimeout(cb, 600);
};

export function prefetchRoute(key: keyof typeof loaders) {
  if (prefetched.has(key)) return;
  prefetched.add(key);
  loaders[key]?.().catch(() => prefetched.delete(key));
}

/** Pré-carrega rotas típicas do usuário final logado. */
export function prefetchUserRoutes() {
  runIdle(() => {
    prefetchRoute("userEmpresas");
    prefetchRoute("audit");
    prefetchRoute("reportView");
    prefetchRoute("companyPage");
  });
}

/** Pré-carrega rotas típicas do auditor/coordenadora. */
export function prefetchStaffRoutes() {
  runIdle(() => {
    prefetchRoute("dashboard");
    prefetchRoute("empresas");
    prefetchRoute("companyPage");
    prefetchRoute("reportView");
  });
}

/** Pré-carrega rotas do Gestor IA. */
export function prefetchGestorRoutes() {
  runIdle(() => {
    prefetchRoute("gestorIA");
  });
}
