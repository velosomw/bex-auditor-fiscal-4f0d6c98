/**
 * MD-BEX-FINAL-RUNTIME-CUTOVER-AND-UNIFIED-REPORT-CONSUMER-001
 *
 * canonicalFinancialSnapshotService — ÚNICA fábrica de fatos financeiros da plataforma.
 *
 * BALANCETE → EXTRAÇÃO → WORKSPACE → CERTIFIED FINANCIAL SNAPSHOT → BEx / Kanitz
 *
 * Regras absolutas:
 *  - Nenhum consumer (narrativa, tabela, gráfico, cards, Kanitz embutido/standalone)
 *    pode localizar contas, somar contas, decidir sintética, recalcular PL/Receita/Estoques.
 *  - Proibido fallback para aiAnalysis, ParsedFinancialData bruto ou builders paralelos.
 *  - O snapshot é congelado (Object.freeze) após certificação.
 */
import { buildBSDados, type BalanceteEntry, type BSDadosRow } from "@/services/bsDadosBuilder";
import { computeIndicatorsForRow, type IndicatorRow } from "@/services/indicatorsEngine";
import type { ParsedFinancialData } from "@/services/auditAIService";
import { detectBalanceClosure, type BalanceClosure, type ResidualFacts } from "@/services/residualFactsResolver";

export type FactStatus = "AVAILABLE" | "NOT_AVAILABLE";

export interface CanonicalFacts {
  ativo_circulante: number;
  ativo_nao_circulante: number;
  ativo_total: number;
  realizavel_longo_prazo: number;
  estoques: number;
  disponivel: number;
  passivo_circulante: number;
  passivo_nao_circulante: number;
  passivo_total: number;
  patrimonio_liquido: number;
  receita_liquida: number;
  resultado_liquido: number;
  fornecedores: number;
  divida_tributaria: number;
  divida_trabalhista: number;
  divida_financeira: number;
}

export interface CanonicalKanitzModel {
  competency: string;
  applicable: boolean;
  reason_code: "EQUITY_POSITIVE" | "EQUITY_NON_POSITIVE";
  /** Fator de Insolvência — NaN quando não aplicável (nunca 0 artificial). */
  fi: number;
  rpl: number;
  lg: number;
  ls: number;
  lc: number;
  /** GE = Passivo Total Exigível / PL. Sem inversão de sinal, sem abs(). */
  ge: number;
  isg: number;
  classificacao: "saudavel" | "estavel" | "atencao" | "risco" | "insolvente" | "na";
}

export interface CanonicalCompetencySnapshot {
  competency: string;
  facts: CanonicalFacts;
  facts_status: Record<string, FactStatus>;
  ratios: IndicatorRow;
  kanitz: CanonicalKanitzModel;
  /** MD-FINAL-RESIDUAL-001 — tributos, trabalhistas, empréstimos, despesas financeiras, EBITDA. */
  residual?: ResidualFacts;
  /** MD-FINAL-RESIDUAL-001 §34..§37 — modo de fechamento patrimonial. */
  closure: BalanceClosure;
}

export interface CertifiedFinancialSnapshot {
  snapshot_id: string;
  processing_run_id: string; // MD-CUTOVER-001 §6
  runtime_trace_id: string;
  snapshot_version: string;
  company_id: string;
  competency: string;
  source_file_name: string;
  source_file_hash: string;
  processing_timestamp: string;
  facts: CanonicalFacts;
  facts_status: Record<string, FactStatus>;
  ratios: IndicatorRow;
  kanitz: CanonicalKanitzModel;
  residual?: ResidualFacts;
  closure: BalanceClosure;
  /** Séries por competência — Balance History, gráficos e tabelas consomem daqui. */
  byCompetency: Record<string, CanonicalCompetencySnapshot>;
  competencies: string[];
  /** Compat: mesma série de indicadores indexada por competência. */
  history: Record<string, IndicatorRow>;
  limitations: string[];
  report_certification_status: "CERTIFIED" | "FAILED";
}

const SNAPSHOT_VERSION = "MD-CUTOVER-001";

const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : NaN);

function hashString(input: string): string {
  let h = 5381;
  for (let i = 0; i < input.length; i++) h = ((h << 5) + h + input.charCodeAt(i)) | 0;
  return Math.abs(h).toString(36).toUpperCase();
}

function sortCompetencies(keys: string[]): string[] {
  return [...keys].sort((a, b) => {
    const pa = a.includes("/") ? a.split("/").reverse().join("") : a;
    const pb = b.includes("/") ? b.split("/").reverse().join("") : b;
    return pa.localeCompare(pb);
  });
}

function factsFromRow(r: BSDadosRow): CanonicalFacts {
  const ac = r.ativo_circulante;
  const anc = r.ativo_nao_circulante;
  const pc = r.passivo_circulante;
  const pnc = r.passivo_nao_circulante;
  return {
    ativo_circulante: ac,
    ativo_nao_circulante: anc,
    // MD-P1-001: Ativo Total autoritativo (conta sintética "1") quando disponível.
    ativo_total: Number.isFinite(r.ativo_total as number) ? (r.ativo_total as number) : ac + anc,
    realizavel_longo_prazo: r.realizavel_longo_prazo,

    estoques: r.estoques,
    disponivel: r.disponivel,
    passivo_circulante: pc,
    passivo_nao_circulante: pnc,
    passivo_total: pc + pnc,
    patrimonio_liquido: r.patrimonio_liquido,
    receita_liquida: r.receita_liquida,
    resultado_liquido: r.resultado,
    fornecedores: r.fornecedores,
    divida_tributaria: Math.abs(r.divida_tributaria || 0),
    divida_trabalhista: Math.abs(r.divida_trabalhista || 0),
    divida_financeira: Math.abs(r.divida_financeira || 0),
  };
}

/**
 * CanonicalKanitzReportModel — modelo ÚNICO usado pelo Kanitz embutido e pelo standalone.
 * K = 0,05·RPL + 1,65·LG + 3,55·LS − 1,06·LC − 0,33·GE
 */
export function buildCanonicalKanitz(competency: string, f: CanonicalFacts, ind: IndicatorRow): CanonicalKanitzModel {
  const applicable = f.patrimonio_liquido > 0;
  const lc = ind.liquidezCorrente;
  const ls = ind.liquidezSeca;
  const lg = ind.liquidezGeral;
  const isg = ind.isg;
  const rpl = applicable ? f.resultado_liquido / f.patrimonio_liquido : NaN;
  const ge = applicable ? f.passivo_total / f.patrimonio_liquido : NaN;
  const fi = applicable ? 0.05 * rpl + 1.65 * lg + 3.55 * ls - 1.06 * lc - 0.33 * ge : NaN;
  const classificacao: CanonicalKanitzModel["classificacao"] = !applicable
    ? "na"
    : fi > 1 ? "saudavel" : fi > 0 ? "estavel" : fi > -1 ? "atencao" : fi >= -3 ? "risco" : "insolvente";
  return {
    competency,
    applicable,
    reason_code: applicable ? "EQUITY_POSITIVE" : "EQUITY_NON_POSITIVE",
    fi, rpl, lg, ls, lc, ge, isg, classificacao,
  };
}

export interface SnapshotSource {
  companyId?: string | null;
  fileName?: string | null;
  fileSize?: number | null;
  processingRunId?: string; // MD-CUTOVER-001 §6
}

/**
 * Materializa o snapshot certificado. Este é o ÚNICO ponto de criação de fatos.
 * Retorna null apenas quando não há absolutamente nenhuma competência extraída.
 */
export function buildCertifiedFinancialSnapshot(
  parsedData: ParsedFinancialData | null | undefined,
  balanceteEntries: BalanceteEntry[] | null | undefined,
  source: SnapshotSource = {}
): CertifiedFinancialSnapshot | null {
  if (!parsedData) return null;
  const rows = buildBSDados(parsedData, balanceteEntries || []);
  if (!rows || rows.length === 0) return null;

  const byCompetency: Record<string, CanonicalCompetencySnapshot> = {};
  const history: Record<string, IndicatorRow> = {};

  for (const r of rows) {
    const ind = computeIndicatorsForRow(r);
    const facts = factsFromRow(r);
    byCompetency[r.mesKey] = {
      competency: r.mesKey,
      facts,
      facts_status: (r.facts_status as Record<string, FactStatus>) || {},
      ratios: ind,
      kanitz: buildCanonicalKanitz(r.mesKey, facts, ind),
      residual: r.residual_facts,
      closure: detectBalanceClosure({
        ativo_total: facts.ativo_total,
        passivo_circulante: facts.passivo_circulante,
        passivo_nao_circulante: facts.passivo_nao_circulante,
        patrimonio_liquido: facts.patrimonio_liquido,
        resultado_liquido: facts.resultado_liquido,
      }),
    };
    history[r.mesKey] = ind;
  }

  const competencies = sortCompetencies(Object.keys(byCompetency));
  const latestKey = competencies[competencies.length - 1];
  if (!latestKey) return null;
  const latest = byCompetency[latestKey];

  const fileName = source.fileName || (parsedData as any)?.fileName || "balancete";
  const fileHash = hashString(`${fileName}|${source.fileSize ?? 0}|${competencies.join(",")}`);
  const runId = source.processingRunId || `RUN-${new Date().toISOString().split('T')[0]}-${fileHash.slice(0, 4)}`;
  const traceId = `BEX-RUNTIME-${latestKey.replace(/[^0-9]/g, "")}-${fileHash}`;

  // Certificação: fatos principais precisam existir (zero só é válido se vier do balancete)
  const critical: (keyof CanonicalFacts)[] = [
    "ativo_circulante", "passivo_circulante", "patrimonio_liquido",
  ];
  const latestRow = rows.find(r => r.mesKey === latestKey);
  const gateFailures = (latestRow?.integrity_gates || []).filter(g => !g.passed);
  const failed = critical.some(k => !Number.isFinite(num(latest.facts[k]))) || gateFailures.length > 0;


  const snapshot: CertifiedFinancialSnapshot = {
    snapshot_id: `SNAP-${traceId}`,
    processing_run_id: runId,
    runtime_trace_id: traceId,
    snapshot_version: SNAPSHOT_VERSION,
    company_id: source.companyId || "manual",
    competency: latestKey,
    source_file_name: fileName,
    source_file_hash: fileHash,
    processing_timestamp: new Date().toISOString(),
    facts: latest.facts,
    facts_status: latest.facts_status,
    ratios: latest.ratios,
    kanitz: latest.kanitz,
    residual: latest.residual,
    closure: latest.closure,
    byCompetency,
    competencies,
    history,
    limitations: (rows.find(r => r.mesKey === latestKey)?.errors as string[]) || [],
    report_certification_status: failed ? "FAILED" : "CERTIFIED",
  };

  Object.freeze(snapshot.facts);
  Object.freeze(snapshot.kanitz);
  Object.freeze(snapshot.byCompetency);
  return Object.freeze(snapshot);
}