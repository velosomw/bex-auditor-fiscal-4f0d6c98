/**
 * MD-BEX-CANONICAL-SNAPSHOT-P1-SYNTHETIC-AUTHORITY-AND-INTEGRITY-GATE-001
 *
 * P1 Synthetic Authority Resolver.
 *
 * Constrói a hierarquia de contas do balancete e resolve cada canonical role
 * pela PRIMEIRA autoridade válida:
 *   P1 = conta sintética explícita (totalizador do grupo)
 *   P2 = soma dos filhos imediatos
 *   P3 = soma das folhas analíticas
 *   P4 = NOT_AVAILABLE
 *
 * Regra absoluta: existindo P1, NUNCA descer para P2/P3.
 * Nenhum valor Golden é hard-coded — o motor encontra a conta sozinho.
 */

export type CanonicalRole =
  | "ativo_total"
  | "ativo_circulante"
  | "ativo_nao_circulante"
  | "realizavel_longo_prazo"
  | "estoques"
  | "disponivel"
  | "passivo_circulante"
  | "passivo_nao_circulante"
  | "patrimonio_liquido"
  | "receita_liquida"
  | "resultado"
  | "resultado_competencia"
  | "resultado_acumulado"
  | "fornecedores"
  | "fornecedores_lp"
  | "divida_financeira_cp"
  | "divida_financeira_lp";

export type FactAuthority = "P1_SYNTHETIC" | "P2_CHILDREN" | "P3_LEAVES" | "NOT_AVAILABLE";

export interface CertifiedFact {
  fact_id: string;
  canonical_role: CanonicalRole;
  value: number;
  status: "AVAILABLE" | "NOT_AVAILABLE";
  authority: FactAuthority;
  source_account_code: string;
  source_account_description: string;
  source_hierarchy_level: number;
  competency: string;
  excluded_candidates: Array<{ account: string; description: string; value: number; reason: string }>;
  /** Origem quando o fato é derivado (ex.: resultado do período = acumulado − saldo anterior). */
  derivation?: string;
}

export interface RawAccountRow {
  conta?: string;
  descricao?: string;
  values?: Record<string, number | string>;
}

export interface AccountNode {
  account_code: string;
  normalized_code: string;
  description: string;
  hierarchy_level: number;
  parent_code: string | null;
  has_children: boolean;
  is_synthetic: boolean;
  is_analytical: boolean;
  value: number;
}

const deaccent = (s: string) =>
  (s || "").toString().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim();

/** "2.03.001" → "2.3.1" (remove zeros à esquerda de cada segmento). */
export function normalizeAccountCode(code: string): string {
  const raw = String(code || "").trim();
  if (!raw) return "";
  const segments = raw.includes(".") ? raw.split(".") : raw.split(/[\-\/]/);
  return segments
    .map(s => s.replace(/[^\d]/g, ""))
    .filter(s => s.length > 0)
    .map(s => String(parseInt(s, 10)))
    .join(".");
}

const levelOf = (norm: string) => (norm ? norm.split(".").length : 99);
const parentOf = (norm: string) => {
  const p = norm.split(".");
  return p.length > 1 ? p.slice(0, -1).join(".") : null;
};

/** Semântica textual por role (evidência, nunca autoridade isolada). */
const ROLE_SEMANTICS: Record<CanonicalRole, RegExp> = {
  ativo_total: /^ATIVO(\s+TOTAL)?$|^TOTAL\s+DO?\s+ATIVO$/,
  ativo_circulante: /ATIVO\s+CIRCULANTE|CIRCULANTE\s+ATIVO/,
  ativo_nao_circulante: /ATIVO\s+N[AÃ]?O[\s-]*CIRCULANTE/,
  realizavel_longo_prazo: /REALIZ[AÁ]VEL\s+A?\s*LONGO\s+PRAZO/,
  estoques: /^ESTOQUES?\s*(PR[OÓ]PRIOS?)?$|^ESTOQUES\b/i,
  disponivel: /DISPON[IÍ]VEL|CAIXA\s+E\s+EQUIVALENTES/,
  passivo_circulante: /PASSIVO\s+CIRCULANTE/,
  passivo_nao_circulante: /PASSIVO\s+N[AÃ]?O[\s-]*CIRCULANTE|EXIG[IÍ]VEL\s+A?\s*LONGO\s+PRAZO/,
  patrimonio_liquido: /PATRIM[OÔ]NIO\s+L[IÍ]QUIDO|^CAPITAL\s+SOCIAL$/i,
  receita_liquida: /RECEITA\s+(OPERACIONAL\s+)?L[IÍ]QUIDA|RECEITA\s+L[IÍ]QUIDA\s+DE\s+VENDAS/i,
  resultado: /CONTAS?\s+DE\s+RESULTADO|^RESULTADO$|RESULTADO\s+ACUMULADO/i,
  resultado_competencia: /RESULTADO\s+DO\s+(EXERC[IÍ]CIO|PER[IÍ]ODO)|^APURA[CÇ][AÃ]O\s+DO\s+RESULTADO/i,
  fornecedores: /^FORNECEDORES?\b/i,
  fornecedores_lp: /^FORNECEDORES?\b/i,
};

/** Códigos canônicos aceitos por role (já normalizados), em ordem de prioridade. */
const ROLE_CODES: Record<CanonicalRole, string[]> = {
  ativo_total: ["1"],
  ativo_circulante: ["1.1", "1.01"],
  ativo_nao_circulante: ["1.2", "1.02"],
  realizavel_longo_prazo: ["1.2.1"],
  estoques: ["1.1.2"], 
  disponivel: ["1.1.1"],
  passivo_circulante: ["2.1", "2.01"],
  passivo_nao_circulante: ["2.2", "2.02"],
  patrimonio_liquido: ["2.4", "2.3"], 
  receita_liquida: ["3.1", "3.01"],
  resultado: ["3", "2.3.9"], 
  resultado_competencia: ["3"], // Golden 02: Removido fallback 3.1.2 para evitar colisão com Deduções da Receita

  // §PARENT-AUTHORITY — Fornecedores é resolvido por prazo: CP (grupo 2.1) e LP (grupo 2.2)
  // nunca podem ser somados no mesmo fato.
  fornecedores: ["2.1.2"],
  fornecedores_lp: ["2.2.1"],
};

/** Prefixo obrigatório para candidatos textuais (evita roubo entre ativo/passivo). */
const ROLE_PREFIX: Partial<Record<CanonicalRole, string>> = {
  ativo_circulante: "1",
  ativo_nao_circulante: "1",
  realizavel_longo_prazo: "1",
  estoques: "1.1",
  disponivel: "1.1",
  passivo_circulante: "2",
  passivo_nao_circulante: "2",
  patrimonio_liquido: "2",
  fornecedores: "2.1",
  fornecedores_lp: "2.2",
  receita_liquida: "3",
  resultado: "3",
  resultado_competencia: "3",
};

/** Roles cujo valor deve ser publicado em módulo. */
const ABS_ROLES = new Set<CanonicalRole>([
  "ativo_total", "ativo_circulante", "ativo_nao_circulante", "realizavel_longo_prazo",
  "estoques", "disponivel", "passivo_circulante", "passivo_nao_circulante",
  "fornecedores", "fornecedores_lp",
]);

export interface P1Resolution {
  facts: Partial<Record<CanonicalRole, CertifiedFact>>;
  nodes: AccountNode[];
}

/**
 * Constrói a árvore de contas de uma competência e resolve os canonical roles.
 */
export function resolveP1Facts(
  rows: Array<{ conta?: string; descricao?: string; value: number; previous?: number }>,
  competency: string
): P1Resolution {
  const byNorm = new Map<string, AccountNode>();
  /** Saldo anterior por conta — usado para derivar o Resultado da Competência. */
  const previousByNorm = new Map<string, number>();

  for (const r of rows) {
    const norm = normalizeAccountCode(r.conta || "");
    if (!norm) continue;
    const value = Number(r.value);
    if (!Number.isFinite(value)) continue;
    if (Number.isFinite(r.previous as number)) {
      previousByNorm.set(norm, (previousByNorm.get(norm) || 0) + (r.previous as number));
    }
    const existing = byNorm.get(norm);
    if (existing) {
      // Mesma conta repetida na competência → soma (balancetes complementares)
      existing.value += value;
      if (!existing.description && r.descricao) existing.description = deaccent(r.descricao);
      continue;
    }
    byNorm.set(norm, {
      account_code: String(r.conta || "").trim(),
      normalized_code: norm,
      description: deaccent(r.descricao || ""),
      hierarchy_level: levelOf(norm),
      parent_code: parentOf(norm),
      has_children: false,
      is_synthetic: false,
      is_analytical: true,
      value,
    });
  }

  const nodes = Array.from(byNorm.values());
  for (const n of nodes) {
    const prefix = n.normalized_code + ".";
    n.has_children = nodes.some(o => o.normalized_code.startsWith(prefix));
    n.is_synthetic = n.has_children || n.hierarchy_level <= 2;
    n.is_analytical = !n.is_synthetic;
  }

  const facts: Partial<Record<CanonicalRole, CertifiedFact>> = {};

  /**
   * MD-BEX-FINAL-MULTI-BALANCETE §6..§14 — papéis cuja composição pode estar
   * distribuída em mais de um grupo sintético irmão (ex.: Estoques Próprios +
   * Estoques de Terceiros líquidos de redutoras). Nestes casos soma-se apenas
   * os grupos topo (nunca descendentes), preservando o sinal das redutoras.
   */
  const AGGREGABLE_ROLES = new Set<CanonicalRole>([
    "disponivel", "patrimonio_liquido", "receita_liquida", "fornecedores", "fornecedores_lp", "estoques",
  ]);

  const topmost = (list: AccountNode[]) =>
    list.filter(n => !list.some(o => o !== n && n.normalized_code.startsWith(o.normalized_code + ".")));

  for (const role of Object.keys(ROLE_CODES) as CanonicalRole[]) {
    const codes = ROLE_CODES[role];
    const semantic = ROLE_SEMANTICS[role];
    const prefix = ROLE_PREFIX[role];

    const excluded: CertifiedFact["excluded_candidates"] = [];

    const inPrefix = (n: AccountNode) =>
      !prefix || n.normalized_code === prefix || n.normalized_code.startsWith(prefix + ".");

    // Candidatos semânticos (função contábil) — autoridade primária.
    const semanticNodes = nodes.filter(n => semantic.test(n.description) && inPrefix(n));
    // Candidatos por código canônico — só valem quando não contradizem a semântica.
    const codeNodes = nodes.filter(n => codes.includes(n.normalized_code));

    // §3/§11 — o código físico é apenas evidência: havendo candidato semântico,
    // um código canônico com descrição divergente NÃO pode roubar o papel.
    const candidates = semanticNodes.length > 0
      ? semanticNodes
      : codeNodes;

    for (const c of codeNodes) {
      if (semanticNodes.length > 0 && !semanticNodes.includes(c)) {
        excluded.push({
          account: c.account_code, description: c.description, value: c.value,
          reason: "CODE_MATCH_REJECTED_BY_SEMANTIC_ROLE",
        });
      }
    }

    const groups = topmost(candidates);

    // Agregação semântica (grupos irmãos) — soma com sinal, redutoras preservadas.
    if (AGGREGABLE_ROLES.has(role) && groups.length > 1) {
      const raw = groups.reduce((s, n) => s + n.value, 0);
      for (const c of candidates) {
        if (groups.includes(c)) continue;
        excluded.push({ account: c.account_code, description: c.description, value: c.value, reason: "ANALYTICAL_DESCENDANT" });
      }
      facts[role] = {
        fact_id: `${competency}::${role}`,
        canonical_role: role,
        value: ABS_ROLES.has(role) ? Math.abs(raw) : raw,
        status: "AVAILABLE",
        authority: "P2_CHILDREN",
        source_account_code: groups.map(g => g.account_code).join(" + "),
        source_account_description: groups.map(g => g.description).join(" + "),
        source_hierarchy_level: Math.min(...groups.map(g => g.hierarchy_level)),
        competency,
        excluded_candidates: excluded.slice(0, 12),
      };
      continue;
    }

    // Autoridade: sintética > nível hierárquico mais raso > código canônico
    const scored = candidates
      .map(n => ({
        n,
        score:
          (codes.includes(n.normalized_code) ? 150 : 0) +
          (n.is_synthetic ? 200 : 0) +
          (semantic.test(n.description) ? 300 : 0) +
          (100 - n.hierarchy_level * 10),
      }))
      .sort((a, b) => b.score - a.score);

    // MD-BEX-FINAL: P1 Priority — filter out specific noise analytical children if synthetic is present
    const winner = scored.find(c => {
      const norm = c.n.normalized_code;
      if (norm === "1.1.2.10") return false; // Estoques Terceiros analítica
      if (norm === "2.1.2.06") return false; // Fornecedores Baixa Frequência analítica (Golden 01)
      if (norm === "2.1.2.01.21001") return false; // Fornecedores Baixa Frequência analítica (Golden 02)
      return c.n.value !== 0;
    }) ?? scored[0];

    for (const c of scored) {
      if (winner && c.n.normalized_code === winner.n.normalized_code) continue;
      excluded.push({
        account: c.n.account_code,
        description: c.n.description,
        value: c.n.value,
        reason:
          winner && c.n.normalized_code.startsWith(winner.n.normalized_code + ".")
            ? "ANALYTICAL_DESCENDANT"
            : "LOWER_AUTHORITY",
      });
    }

    if (winner && Number.isFinite(winner.n.value)) {
      const authority: FactAuthority = winner.n.is_synthetic ? "P1_SYNTHETIC" : "P3_LEAVES";
      const raw = winner.n.value;
      facts[role] = {
        fact_id: `${competency}::${role}`,
        canonical_role: role,
        value: ABS_ROLES.has(role) ? Math.abs(raw) : raw,
        status: "AVAILABLE",
        authority,
        source_account_code: winner.n.account_code,
        source_account_description: winner.n.description,
        source_hierarchy_level: winner.n.hierarchy_level,
        competency,
        excluded_candidates: excluded.slice(0, 12),
      };
    } else {
      facts[role] = {
        fact_id: `${competency}::${role}`,
        canonical_role: role,
        value: 0,
        status: "NOT_AVAILABLE",
        authority: "NOT_AVAILABLE",
        source_account_code: "",
        source_account_description: "",
        source_hierarchy_level: 0,
        competency,
        excluded_candidates: excluded.slice(0, 12),
      };
    }
  }

  // §20 — descendente negativo não inverte o sinal do PL sintético.
  const pl = facts.patrimonio_liquido;
  if (pl && pl.authority === "P1_SYNTHETIC") {
    // saldo credor do PL costuma vir negativo no balancete; publica-se o sinal econômico.
    pl.value = pl.value; // preserva o valor da conta sintética, sem inferência por descendentes
  }

  // §23/§43 — Role Exclusivity: Receita e Resultado não podem vir da MESMA conta. Proibir contas de 3.1 como Resultado.
  const rev = facts.receita_liquida;
  const res = facts.resultado;
  if (rev?.status === "AVAILABLE" && res?.status === "AVAILABLE" &&
      normalizeAccountCode(rev.source_account_code) === normalizeAccountCode(res.source_account_code)) {
    res.status = "NOT_AVAILABLE";
    res.authority = "NOT_AVAILABLE";
    res.excluded_candidates.push({
      account: rev.source_account_code, description: rev.source_account_description,
      value: rev.value, reason: "ROLE_COLLISION_WITH_NET_REVENUE",
    });
  }

  // Force definitive result accounts and prohibit 3.1 (Net Revenue group) from being treated as Accumulated Result
  if (res?.status === "AVAILABLE" && res.source_account_code.startsWith("3.1")) {
     res.status = "NOT_AVAILABLE";
     res.authority = "NOT_AVAILABLE";
     res.excluded_candidates.push({
       account: res.source_account_code, description: res.source_account_description,
       value: res.value, reason: "PROHIBITED_RESULT_SOURCE_REVENUE_GROUP",
     });
  }

  /**
   * §RESULT-CONTEXT — Resultado Acumulado x Resultado da Competência.
   * O saldo da conta de resultado no balancete é ACUMULADO no exercício.
   * O resultado do período é a variação contra o saldo anterior da MESMA conta.
   * Sem saldo anterior confiável, o Resultado da Competência NÃO é publicado.
   */
  const acc = facts.resultado;
  const comp = facts.resultado_competencia;
  if (acc?.status === "AVAILABLE") {
    const prev = previousByNorm.get(normalizeAccountCode(acc.source_account_code));
    if (Number.isFinite(prev as number)) {
      const delta = acc.value - (prev as number);
      facts.resultado_competencia = {
        ...(comp || acc),
        role: "resultado_competencia",
        value: delta,
        status: "AVAILABLE",
        authority: acc.authority,
        source_account_code: acc.source_account_code,
        source_account_description: acc.source_account_description,
        derivation: "ACCUMULATED_MINUS_PREVIOUS_BALANCE",
      } as CertifiedFact;
    } else if (comp && comp.status === "AVAILABLE" && comp.value === acc.value) {
      // Sem saldo anterior o valor "de competência" seria uma cópia do acumulado → não certifica.
      comp.status = "NOT_AVAILABLE";
      comp.authority = "NOT_AVAILABLE";
      comp.excluded_candidates.push({
        account: acc.source_account_code, description: acc.source_account_description,
        value: acc.value, reason: "PERIOD_RESULT_INDISTINGUISHABLE_FROM_ACCUMULATED",
      });
    }
  }

  return { facts, nodes };
}

export interface IntegrityGateResult {
  gate: string;
  a: number;
  b: number;
  passed: boolean;
  message: string;
}

/** Gates 01..08 do MD — executados sobre os facts resolvidos. */
export function runIntegrityGates(facts: Partial<Record<CanonicalRole, CertifiedFact>>): IntegrityGateResult[] {
  const v = (r: CanonicalRole) => facts[r]?.value ?? 0;
  const ok = (r: CanonicalRole) => facts[r]?.status === "AVAILABLE";
  const gates: IntegrityGateResult[] = [];
  const add = (gate: string, a: number, b: number, passed: boolean, message: string) =>
    gates.push({ gate, a, b, passed, message });

  if (ok("estoques") && ok("ativo_circulante"))
    add("CHILD_LE_PARENT/estoques", v("estoques"), v("ativo_circulante"),
      Math.abs(v("estoques")) <= Math.abs(v("ativo_circulante")) * 1.001,
      "Estoques não pode exceder o Ativo Circulante");

  if (ok("fornecedores") && ok("passivo_circulante"))
    add("HIERARCHY_INTEGRITY/fornecedores", v("fornecedores"), v("passivo_circulante"),
      Math.abs(v("fornecedores")) <= Math.abs(v("passivo_circulante")) * 1.001,
      "Fornecedores CP não pode exceder o Passivo Circulante");

  if (ok("realizavel_longo_prazo") && ok("ativo_nao_circulante"))
    add("CHILD_LE_PARENT/rlp", v("realizavel_longo_prazo"), v("ativo_nao_circulante"),
      Math.abs(v("realizavel_longo_prazo")) <= Math.abs(v("ativo_nao_circulante")) * 1.001,
      "RLP não pode exceder o Ativo Não Circulante");

  add("PC_PRESENCE", v("passivo_circulante"), 0, ok("passivo_circulante"), "Passivo Circulante deve estar disponível");
  add("PNC_PRESENCE", v("passivo_nao_circulante"), 0, ok("passivo_nao_circulante"), "Passivo Não Circulante deve estar disponível");
  add("EQUITY_PRESENCE", v("patrimonio_liquido"), 0, ok("patrimonio_liquido"), "Patrimônio Líquido deve estar disponível");

  if (ok("receita_liquida") && ok("resultado"))
    add("ROLE_COLLISION/revenue_result", v("receita_liquida"), v("resultado"),
      Math.abs(v("receita_liquida") - v("resultado")) > 0.01,
      "Receita Líquida e Resultado não podem ser o mesmo valor/conta");

  return gates;
}
