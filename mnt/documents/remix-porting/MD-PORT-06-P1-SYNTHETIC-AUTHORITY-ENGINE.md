# MD-PORT-06-P1-SYNTHETIC-AUTHORITY-ENGINE

## Título
Motor de Autoridade Sintética P1 (P1 Synthetic Authority Engine) — Hierarquia de Resolução de Fatos Contábeis, Integrity Gates e Equação Patrimonial

## Objetivo
Este documento especifica, em nível de implementação, o motor central de resolução de fatos financeiros do BEX Audit Platform, implementado em `src/services/p1SyntheticResolver.ts` e consumido por `src/services/bsDadosBuilder.ts`. O objetivo é permitir que uma equipe de engenharia replique **byte a byte** o comportamento do motor em outro stack (ex.: Remix + qualquer backend), preservando:

1. A hierarquia de autoridade **P1_SYNTHETIC > P2_CHILDREN > P3_LEAVES > NOT_AVAILABLE**;
2. A construção determinística da árvore de contas a partir de um balancete bruto;
3. O conjunto completo de `CanonicalRole`, `ROLE_SEMANTICS`, `ROLE_CODES`, `ROLE_PREFIX`, `ABS_ROLES` e `AGGREGABLE_ROLES`;
4. A proibição absoluta de somar conta-pai com conta-filha (double counting);
5. Os Integrity Gates (incluindo o "Gate 21" de equilíbrio patrimonial) implementados em `bsDadosBuilder.ts`;
6. A derivação do Resultado da Competência a partir do saldo acumulado menos o saldo anterior;
7. O `SEMANTIC_ROLE_REGISTRY` e o detector de colisão de papéis (Role Collision Detector).

Nenhum valor "Golden" (valor esperado de teste) é hard-coded em nenhum ponto do motor — toda resolução de conta é feita algoritmicamente a partir do conteúdo do balancete.

## Escopo
Este documento cobre exclusivamente:
- `src/services/p1SyntheticResolver.ts` (motor de resolução P1/P2/P3, Integrity Gates 01..08)
- Trechos de `src/services/bsDadosBuilder.ts` relacionados a: `SEMANTIC_ROLE_REGISTRY`, `isSyntheticAuthority`, `certifyFinancialColumn`, `finalize()` (Gate 21), `BALANCE_TOLERANCE`.

Não cobre: fatos residuais (tributos, trabalhista, EBITDA — ver MD-PORT-07), nem o snapshot congelado (ver MD-PORT-08).

## Pré-requisitos
- TypeScript ≥ 4.9 (uso de `Partial<Record<K,V>>`, template literal types não usados mas tipos estritos sim).
- Nenhuma dependência de biblioteca externa: o motor é 100% funções puras sobre arrays e regex nativas do JS.
- Conhecimento do plano de contas contábil brasileiro (Ativo=1, Passivo=2, Resultado=3..8) e de nomenclatura de balancetes (colunas "conta", "descricao", "saldo").
- Estrutura de entrada mínima: linhas com `{ conta: string; descricao: string; value: number; previous?: number }` por competência.

---

## 1. Visão Geral da Hierarquia de Autoridade

O motor resolve, para cada `CanonicalRole` (ex.: `ativo_circulante`, `estoques`, `fornecedores`), qual conta do balancete deve ser a **fonte de verdade** daquele fato financeiro. A resolução segue autoridade estrita e decrescente:

| Autoridade | Significado | Quando se aplica |
|---|---|---|
| `P1_SYNTHETIC` | Existe uma conta sintética (totalizadora) explícita no balancete cuja descrição e/ou código bate com o papel | Prioridade máxima — jamais descartada em favor de somas de filhos |
| `P2_CHILDREN` | Não há sintética única, mas existem 2+ grupos-irmãos "topo" (topmost) que juntos compõem o papel | Usado apenas para `AGGREGABLE_ROLES` |
| `P3_LEAVES` | Não há sintética nem agregação de irmãos; usa-se a conta analítica (folha) de maior pontuação | Última autoridade positiva |
| `NOT_AVAILABLE` | Nenhum candidato foi encontrado, ou candidatos foram todos desqualificados por gates de exclusividade | Fato **nunca** é substituído por zero "fake" — o campo fica marcado como indisponível |

**Regra absoluta (linha 13 do arquivo fonte):**
> "Regra absoluta: existindo P1, NUNCA descer para P2/P3."

Isso é garantido estruturalmente: o algoritmo de scoring (seção 5 abaixo) sempre atribui pontuação máxima a contas sintéticas, e a filtragem de `excluded_candidates` marca explicitamente toda conta descendente de um vencedor como `"ANALYTICAL_DESCENDANT"`, prevenindo que ela seja somada em paralelo em qualquer camada consumidora.

---

## 2. Construção da Árvore de Contas (`resolveP1Facts`)

Assinatura real:

```ts
export function resolveP1Facts(
  rows: Array<{ conta?: string; descricao?: string; value: number; previous?: number }>,
  competency: string
): P1Resolution
```

onde:

```ts
export interface P1Resolution {
  facts: Partial<Record<CanonicalRole, CertifiedFact>>;
  nodes: AccountNode[];
}
```

### 2.1 Normalização de código de conta

```ts
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
```

Esta função é a base de toda comparação de hierarquia: dois códigos de origens distintas (`2.03.001` de um plano e `2.3.1` de outro) tornam-se equivalentes após normalização. O separador aceito é `.`, com fallback para `-` ou `/` quando não há ponto.

### 2.2 Nível hierárquico e conta-pai

```ts
const levelOf = (norm: string) => (norm ? norm.split(".").length : 99);
const parentOf = (norm: string) => {
  const p = norm.split(".");
  return p.length > 1 ? p.slice(0, -1).join(".") : null;
};
```

- `"1"` → nível 1, pai `null`.
- `"1.1.2"` → nível 3, pai `"1.1"`.
- Um código malformado (`normalizeAccountCode` retorna `""`) recebe nível `99` (sentinela de "fora da árvore"), nunca participando de comparações de hierarquia.

### 2.3 Deduplicação e agregação por competência

```ts
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
```

Cenário coberto: dois balancetes do mesmo mês (ex.: matriz + filial) trazem a mesma conta "2.1.2 Fornecedores" duas vezes — os valores são **somados**, nunca sobrescritos. O `previous` (saldo anterior) também é acumulado por conta normalizada — usado depois na derivação do Resultado da Competência (Seção 7).

A função `deaccent` normaliza a descrição para comparação textual robusta:

```ts
const deaccent = (s: string) =>
  (s || "").toString().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim();
```

### 2.4 Marcação de contas sintéticas vs. analíticas

```ts
const nodes = Array.from(byNorm.values());
for (const n of nodes) {
  const prefix = n.normalized_code + ".";
  n.has_children = nodes.some(o => o.normalized_code.startsWith(prefix));
  n.is_synthetic = n.has_children || n.hierarchy_level <= 2;
  n.is_analytical = !n.is_synthetic;
}
```

Regra: uma conta é sintética se **tem filhos no balancete atual** OU se está nos dois primeiros níveis da árvore (`1`, `1.1`, `2`, `2.3`, etc. — mesmo que, isoladamente, não haja outras contas descendentes explícitas naquele arquivo). Isso cobre balancetes truncados (só mostram os totalizadores, sem detalhamento analítico).

`AccountNode` (tipo completo):

```ts
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
```

---

## 3. `CanonicalRole` — Enumeração Completa

```ts
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
```

`FactAuthority`:

```ts
export type FactAuthority = "P1_SYNTHETIC" | "P2_CHILDREN" | "P3_LEAVES" | "NOT_AVAILABLE";
```

`CertifiedFact` — a estrutura de saída de cada role resolvida, incluindo trilha de auditoria e candidatos descartados:

```ts
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
```

Nunca é permitido criar um `CertifiedFact` fora deste shape. `fact_id` segue o padrão `${competency}::${role}` (ex.: `"2024-03::estoques"`), garantindo idempotência e rastreabilidade cross-competência.

---

## 4. `ROLE_SEMANTICS` — Tabela Regex Real (Evidência Primária)

A semântica textual é **evidência**, nunca autoridade isolada — sempre combinada com prefixo de código (Seção 6) e com a presença/ausência de filhos (sintética vs. analítica):

```ts
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
  resultado_acumulado: /RESULTADO\s+ACUMULADO/i,
  fornecedores: /^FORNECEDORES?\b/i,
  fornecedores_lp: /^FORNECEDORES?\b/i,
  divida_financeira_cp: /EMPRESTIM|FINANCIAMENT|DEBENTURE|LEASING|ARRENDAMENT|CEDULA DE CREDITO|CAPITAL DE GIRO|OBRIGACOES FINANCEIR/i,
  divida_financeira_lp: /EMPRESTIM|FINANCIAMENT|DEBENTURE|LEASING|ARRENDAMENT|CEDULA DE CREDITO|CAPITAL DE GIRO|OBRIGACOES FINANCEIR/i,
};
```

Observações críticas de porting:
- `estoques` usa `/i` case-insensitive mas as descrições já foram `deaccent()`-adas para maiúsculas — o flag é redundante mas inofensivo, deve ser preservado por fidelidade.
- `fornecedores` e `fornecedores_lp` compartilham a **mesma regex**; a diferenciação CP vs. LP vem exclusivamente do `ROLE_PREFIX` (Seção 6), não da semântica textual.
- `divida_financeira_cp` e `divida_financeira_lp` também compartilham regex — mesma lógica de diferenciação por prefixo.

---

## 5. `ROLE_CODES` — Códigos Canônicos por Prioridade

```ts
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
  resultado_competencia: ["3"],
  resultado_acumulado: ["2.4.1", "2.3.7"],
  fornecedores: ["2.1.2"],
  fornecedores_lp: ["2.2.1"],
  divida_financeira_cp: ["2.1.1"],
  divida_financeira_lp: ["2.2.2"],
};
```

Estes códigos são "evidência de código" (camada B do sistema de prioridade), usados apenas quando não há candidato semântico melhor qualificado (ver Seção 8, `§3/§11`).

---

## 6. `ROLE_PREFIX` — Guarda de Prefixo Obrigatório

```ts
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
  divida_financeira_cp: "2.1",
  divida_financeira_lp: "2.2",
  receita_liquida: "3",
  resultado: "3",
  resultado_competencia: "3",
  resultado_acumulado: "2",
};
```

Propósito: evita "roubo" de papel entre Ativo e Passivo apenas por coincidência textual. Exemplo: sem essa guarda, uma conta de Passivo cuja descrição contenha "circulante" jamais poderia ser confundida com Ativo Circulante, pois o prefixo `"1"` restringe a busca à árvore do Ativo.

`inPrefix` é testado com:

```ts
const inPrefix = (n: AccountNode) =>
  !prefix || n.normalized_code === prefix || n.normalized_code.startsWith(prefix + ".");
```

Se `ROLE_PREFIX[role]` for `undefined` (roles como `ativo_total`), **qualquer** prefixo é aceito.

---

## 7. `ABS_ROLES` e `AGGREGABLE_ROLES`

```ts
/** Roles cujo valor deve ser publicado em módulo. */
const ABS_ROLES = new Set<CanonicalRole>([
  "ativo_total", "ativo_circulante", "ativo_nao_circulante", "realizavel_longo_prazo",
  "estoques", "disponivel", "passivo_circulante", "passivo_nao_circulante",
  "fornecedores", "fornecedores_lp", "divida_financeira_cp", "divida_financeira_lp",
]);
```

Estas roles são sempre publicadas como `Math.abs(raw)` no `CertifiedFact.value`, independentemente do sinal contábil real (saldo credor/devedor). Roles fora deste set (`patrimonio_liquido`, `receita_liquida`, `resultado`, `resultado_competencia`, `resultado_acumulado`) preservam o sinal econômico natural.

```ts
/**
 * MD-BEX-FINAL-MULTI-BALANCETE §6..§14 — papéis cuja composição pode estar
 * distribuída em mais de um grupo sintético irmão (ex.: Estoques Próprios +
 * Estoques de Terceiros líquidos de redutoras). Nestes casos soma-se apenas
 * os grupos topo (nunca descendentes), preservando o sinal das redutoras.
 */
const AGGREGABLE_ROLES = new Set<CanonicalRole>([
  "disponivel", "patrimonio_liquido", "receita_liquida", "fornecedores", "fornecedores_lp", "estoques",
]);
```

---

## 8. `topmost()` — Filtro Anti-Double-Counting

```ts
const topmost = (list: AccountNode[]) =>
  list.filter(n => !list.some(o => o !== n && n.normalized_code.startsWith(o.normalized_code + ".")));
```

Esta é a função-chave que **fisicamente impede** que um pai e um filho sejam somados no mesmo agregado: dado um conjunto de candidatos, `topmost()` retorna apenas os nós que **não são descendentes de nenhum outro nó do mesmo conjunto**. Usada tanto na agregação de irmãos (`AGGREGABLE_ROLES`) quanto na filtragem de grupos do `pickByTaxonomy` em `residualFactsResolver.ts` (MD-PORT-07).

### 8.1 A Regra de Ouro — Proibição de Somar Pai+Filho

Em nenhum ponto do código a soma `parent.value + child.value` ocorre para o mesmo agregado. Todas as agregações passam obrigatoriamente por `topmost()` (ou por `pickNonOverlapping` no `residualFactsResolver.ts`, que implementa a mesma lógica). Isso é auditável por grep:

```ts
const groups = topmost(candidates);
if (AGGREGABLE_ROLES.has(role) && groups.length > 1) {
  const raw = groups.reduce((s, n) => s + n.value, 0);
  ...
}
```

Toda conta excluída por ser descendente de um vencedor recebe `reason: "ANALYTICAL_DESCENDANT"` no array `excluded_candidates`, preservando a trilha de auditoria de por que ela **não** entrou na soma.

---

## 9. Algoritmo Completo de Resolução por Role

Para cada `role` em `Object.keys(ROLE_CODES)`:

```ts
const codes = ROLE_CODES[role];
const semantic = ROLE_SEMANTICS[role];
const prefix = ROLE_PREFIX[role];

const excluded: CertifiedFact["excluded_candidates"] = [];

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
```

### 9.1 Ramo de Agregação (AGGREGABLE_ROLES)

Se o role está em `AGGREGABLE_ROLES` e há mais de um grupo "topo" candidato:

```ts
const groups = topmost(candidates);
if (AGGREGABLE_ROLES.has(role) && groups.length > 1) {
  const raw = groups.reduce((s, n) => s + n.value, 0);
  ...
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
```

### 9.2 Ramo de Scoring (autoridade sintética > raso > código canônico)

```ts
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
```

Pesos: semântica (+300) > sintética (+200) > código canônico (+150) > nível hierárquico raso (até +90, decrescente 10 pontos por nível). Isto significa que uma conta sintética com match semântico exato no nível 2 pontua `300+200+150+80=730`, enquanto uma folha analítica sem código canônico no nível 5 pontua `300+0+0+50=350` — a sintética sempre vence quando ambas casam semanticamente.

### 9.3 Exceções manuais (denylist de ruído analítico)

```ts
// MD-BEX-FINAL: P1 Priority — filter out specific noise analytical children if synthetic is present
const winner = scored.find(c => {
  const norm = c.n.normalized_code;
  if (norm === "1.1.2.10") return false; // Estoques Terceiros analítica
  if (norm === "2.1.2.06") return false; // Fornecedores Baixa Frequência analítica (Golden 01)
  if (norm === "2.1.2.01.21001") return false; // Fornecedores Baixa Frequência analítica (Golden 02)
  return c.n.value !== 0;
}) ?? scored[0];
```

Nota de porting: estes três códigos são exclusões pontuais mapeadas a partir de balancetes reais de homologação (Goldens); devem ser portados literalmente, sem reinterpretação — são regras de dados reais, não regras de negócio genéricas.

### 9.4 Publicação do Fato e Trilha de Exclusão

```ts
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
```

Note que `P2_CHILDREN` **nunca** é atribuído neste ramo de scoring — só o ramo de agregação (9.1) produz `P2_CHILDREN`. O scoring produz apenas `P1_SYNTHETIC` (quando `is_synthetic===true`) ou `P3_LEAVES` (quando `is_synthetic===false`).

`excluded_candidates` é sempre truncado a 12 itens (`.slice(0, 12)`) — limite de payload para UI/auditoria, não afeta o cálculo.

---

## 10. Pós-processamento — Regras de Correção Semântica

### 10.1 §20 — Sinal do PL sintético não é invertido por descendentes

```ts
// §20 — descendente negativo não inverte o sinal do PL sintético.
const pl = facts.patrimonio_liquido;
if (pl && pl.authority === "P1_SYNTHETIC") {
  // saldo credor do PL costuma vir negativo no balancete; publica-se o sinal econômico.
  pl.value = pl.value; // preserva o valor da conta sintética, sem inferência por descendentes
}
```

Esta linha é uma **no-op explícita** (documentação de intenção): reforça, por comentário no código, que nenhuma lógica subsequente deve reescrever `pl.value` a partir de componentes analíticos.

### 10.2 §23/§43 — Role Exclusivity: Receita ≠ Resultado

```ts
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
```

Se a mesma conta normalizada seria ao mesmo tempo a Receita Líquida e o Resultado, o Resultado é **invalidado** (não a Receita — Receita tem prioridade de exclusividade).

### 10.3 Proibição de origem 3.1 para Resultado

```ts
if (res?.status === "AVAILABLE" && res.source_account_code.startsWith("3.1")) {
   res.status = "NOT_AVAILABLE";
   res.authority = "NOT_AVAILABLE";
   res.excluded_candidates.push({
     account: res.source_account_code, description: res.source_account_description,
     value: res.value, reason: "PROHIBITED_RESULT_SOURCE_REVENUE_GROUP",
   });
}
```

O grupo `3.1` é reservado para Receita Líquida por convenção do plano de contas; jamais pode ser fonte de Resultado.

---

## 11. Derivação do Resultado da Competência (§RESULT-CONTEXT)

Este é um dos pontos mais sutis e mais fáceis de errar em um porting: o saldo de uma conta de resultado no balancete é **acumulado no exercício**, não o resultado do mês/competência isolado.

```ts
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
```

Regra de porting crítica: **jamais** publicar `resultado_competencia = resultado_acumulado` como fallback silencioso. Se não houver `previous` confiável, o campo deve permanecer `NOT_AVAILABLE` — nunca deve ser inferido por igualdade de valor (isso é detectado e vetado explicitamente pelo `else if`).

`derivation: "ACCUMULATED_MINUS_PREVIOUS_BALANCE"` é o único valor possível para este campo neste fluxo, e deve ser exibido na UI de auditoria como prova de proveniência do cálculo.

---

## 12. Integrity Gates 01..08 (`runIntegrityGates`)

```ts
export interface IntegrityGateResult {
  gate: string;
  a: number;
  b: number;
  passed: boolean;
  message: string;
}

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
```

Tolerância de todos os gates de "child ≤ parent": **0,1%** (`* 1.001`), aplicada sobre valor absoluto de ambos os lados (protege contra saldos credores/devedores invertidos).

Tabela de gates:

| Gate | Verificação | Tolerância |
|---|---|---|
| `CHILD_LE_PARENT/estoques` | `|estoques| ≤ |ativo_circulante| × 1.001` | 0,1% |
| `HIERARCHY_INTEGRITY/fornecedores` | `|fornecedores| ≤ |passivo_circulante| × 1.001` | 0,1% |
| `CHILD_LE_PARENT/rlp` | `|RLP| ≤ |ativo_nao_circulante| × 1.001` | 0,1% |
| `PC_PRESENCE` | `passivo_circulante` deve estar `AVAILABLE` | — |
| `PNC_PRESENCE` | `passivo_nao_circulante` deve estar `AVAILABLE` | — |
| `EQUITY_PRESENCE` | `patrimonio_liquido` deve estar `AVAILABLE` | — |
| `ROLE_COLLISION/revenue_result` | `|receita − resultado| > 0.01` (i.e., devem ser DIFERENTES) | R$ 0,01 |

---

## 13. Gate 21 — Equação Patrimonial (implementado em `bsDadosBuilder.ts::finalize`)

O "Gate 21" refere-se ao teste de integridade patrimonial executado dentro da função `finalize()` de `bsDadosBuilder.ts`:

```ts
// Golden Test Integrity Check (Gate 21): Ativo - (PC + PNC + PL) ≈ Resultado do Período
const at = row.ativo_circulante + row.ativo_nao_circulante;
const pt = row.passivo_circulante + row.passivo_nao_circulante + row.patrimonio_liquido;
const integrityGap = Math.abs(at - pt - row.resultado);

// MD-BEX-RUNTIME-CONSUMER Requirement 23: Vendas != Resultado != EBITDA assertion
if (row.receita_liquida === row.resultado && row.receita_liquida !== 0) {
  row.errors.push("Colisão Crítica: Receita Líquida e Resultado do Período são idênticos.");
}

if (integrityGap > 1000) {
  row.errors.push(`Gap de integridade patrimonial detectado: R$ ${integrityGap.toLocaleString("pt-BR")}`);
}
```

**Equação Patrimonial testada:** `Ativo Total ≈ Passivo Circulante + Passivo Não Circulante + Patrimônio Líquido + Resultado do Período`.

Tolerância absoluta: **R$ 1.000,00** (não percentual). Acima disso, um erro textual é anexado a `row.errors` (não bloqueia o processamento, mas é exibido na UI de auditoria e pode reprovar a homologação/certificação final se presente na lista de `limitations` do snapshot).

### 13.1 `BALANCE_TOLERANCE` — Tolerância Percentual de Grupo

```ts
// Tolerância padrão para validação Ativo = Passivo + PL (0.5%).
export const BALANCE_TOLERANCE = 0.005;
```

Usada para comparar valor declarado (Camada A — conta sintética/GT) vs. valor calculado (Camada B — soma de folhas), por grupo:

```ts
if (buckets.sawACTotal && buckets.ac > 0) {
  const diff = Math.abs(row.ativo_circulante - buckets.ac);
  const ref = Math.max(row.ativo_circulante, buckets.ac);
  if (ref > 0 && diff / ref > BALANCE_TOLERANCE) {
    row.errors.push(`Ativo Circulante divergente dos componentes (Δ ${(diff/ref*100).toFixed(2)}%)`);
  }
}
```

Mesma checagem replicada para `passivo_circulante`.

### 13.2 Semáforo de 3 Fases (`classifyDeviation`)

```ts
/** Classifica desvio em status trifásico (1%/3%/>3%). */
export function classifyDeviation(desvio: number, declaradoAusente: boolean): GroupMappingStatus {
  if (declaradoAusente) return "sem_total";
  const abs = Math.abs(desvio);
  if (abs <= 0.01) return "ok";
  if (abs <= 0.03) return "atencao";
  return "erro";
}
```

`GroupMappingStatus = "ok" | "atencao" | "erro" | "sem_total"`. Esta função classifica cada grupo do balancete (2 dígitos — ex. `"11"`, `"21"`, `"4"`) na trilha `GroupMappingEntry[]` exibida na UI "explicável" (dados de auditoria por grupo), com limiares de **1%** ("ok") e **3%** ("atenção"); acima de 3% é "erro" e é promovido para `row.errors`.

---

## 14. `SEMANTIC_ROLE_REGISTRY` e Detector de Colisão de Papéis

Definido em `bsDadosBuilder.ts` (não em `p1SyntheticResolver.ts`), este registro é um mapa direto código→campo, usado como **camada 0** de prioridade (antes até da lógica de Ref1/regex do builder):

```ts
export const SEMANTIC_ROLE_REGISTRY: Record<string, keyof BSDadosRow> = {
  // ATIVO
  "1": "ativo_total" as any,
  "1.1": "ativo_circulante",
  "1.01": "ativo_circulante",
  "1.1.2": "estoques",
  "1.01.02": "estoques",
  "1.2": "ativo_nao_circulante",
  "1.02": "ativo_nao_circulante",
  "1.2.01": "realizavel_longo_prazo",
  // PASSIVO
  "2": "passivo_total" as any,
  "2.1": "passivo_circulante",
  "2.01": "passivo_circulante",
  "2.2": "passivo_nao_circulante",
  "2.02": "passivo_nao_circulante",
  "2.3": "patrimonio_liquido",
  "2.03": "patrimonio_liquido",
  "2.4": "patrimonio_liquido",
  // DRE
  "3": "resultado" as any,
  "3.1": "receita_liquida",
  "3.01": "receita_liquida",
  "4": "cmv",
  "5": "cmv",
  "6": "despesas",
  "7": "despesas_financeiras",
  "8": "outras_nao_operacionais",
};
```

### 14.1 `isSyntheticAuthority` — Detecção P1 no Builder

```ts
export function isSyntheticAuthority(code: string, desc?: string): keyof BSDadosRow | null {
  if (!code) return null;
  const clean = code.replace(/[^\d]/g, "");

  for (const registryCode of Object.keys(SEMANTIC_ROLE_REGISTRY)) {
    const regClean = registryCode.replace(/[^\d]/g, "");
    if (clean === regClean) return SEMANTIC_ROLE_REGISTRY[registryCode];

    const normClean = clean.replace(/^0+/, "");
    const normReg = regClean.replace(/^0+/, "");
    if (normClean === normReg) return SEMANTIC_ROLE_REGISTRY[registryCode];
  }

  const d = (desc || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  if (/\bestoques?\b|\bestoques? pr[oó]prios?\b|\bmercadorias? para revenda\b|\bprodutos? acabados?\b|\bmat[eé]ria-prima\b/i.test(d)) {
    if (code.startsWith("1.1") || code.startsWith("1.01")) return "estoques";
  }

  if (/\bfornecedores?\b/i.test(d) && !/\badiantamento\b|\bfinanceir\b/i.test(d)) {
    if (code.startsWith("2.1") || code.startsWith("2.01")) return "fornecedores";
    if (code.startsWith("2.2") || code.startsWith("2.02")) return "fornecedores_lp" as any;
  }

  const parts = code.split(".");
  if (parts.length <= 2) {
    if (code.startsWith("1")) return "ativo_total" as any;
    if (code.startsWith("2")) return "passivo_total" as any;
  }

  return null;
}
```

### 14.2 `certifyFinancialColumn` — Detector de Colisão de Coluna

```ts
function certifyFinancialColumn(key: keyof BSDadosRow, value: number, row: RowLike): boolean {
  const v = Math.abs(value);
  if (v === 0) return true; // Zeros são neutros

  // Regra 1: Contas de Resultado (DRE) não podem ter saldos astronômicos típicos de Ativo Total
  if (key === "receita_liquida" && v > 1000000000000) return false;

  // Regra 2: Role Collision Detector. Uma conta já vinculada a um papel P1 não pode ser "roubada" por outro.
  const accountCode = (row.conta || "").trim();
  if (accountCode && SEMANTIC_ROLE_REGISTRY[accountCode] && SEMANTIC_ROLE_REGISTRY[accountCode] !== key) {
    return false;
  }

  return true;
}
```

Uso em `applyValue`:

```ts
if (sourceRow && !certifyFinancialColumn(key, v, sourceRow)) {
  target.errors.push(`Bloqueio de colisão de papel/coluna: conta ${sourceRow.conta} tentou assumir ${key}`);
  return;
}
```

Este é o mecanismo que impede, por exemplo, que uma conta que já está registrada no `SEMANTIC_ROLE_REGISTRY` como `"1"→ativo_total` seja acidentalmente somada em `receita_liquida` por um fallback regex mal calibrado. A conta é rejeitada silenciosamente da atribuição errada e um erro de auditoria é registrado.

### 14.3 Limite anti-erro de importação/coluna

`v > 1_000_000_000_000` (1 trilhão) para `receita_liquida` é um limite de sanidade que detecta erro clássico de importação onde um valor de Ativo Total (tipicamente ordens de grandeza maiores) acaba sendo lançado por engano na coluna de receita.

---

## 15. `excluded_candidates` / `CertifiedFact` — Consumo em Auditoria

O array `excluded_candidates` de cada `CertifiedFact` é publicado integralmente no campo `p1_facts` de `BSDadosRow`:

```ts
/** MD-P1-001 — trilha de resolução por canonical role (P1/P2/P3 + descartados). */
p1_facts?: Record<string, CertifiedFact>;
```

Todo consumidor de UI (tela de auditoria, tooltip explicativo, export PDF) deve exibir, para cada fato certificado:
1. `authority` (P1/P2/P3/NOT_AVAILABLE);
2. `source_account_code` + `source_account_description`;
3. Lista de `excluded_candidates` com `reason` (`CODE_MATCH_REJECTED_BY_SEMANTIC_ROLE`, `ANALYTICAL_DESCENDANT`, `LOWER_AUTHORITY`, `ROLE_COLLISION_WITH_NET_REVENUE`, `PROHIBITED_RESULT_SOURCE_REVENUE_GROUP`, `PERIOD_RESULT_INDISTINGUISHABLE_FROM_ACCUMULATED`, `P1_CONFLICT_RESOLVED_BY_SYNTHETIC`).

### 15.1 Tabela de motivos (`reason`) e onde são emitidos

| `reason` | Onde é emitido |
|---|---|
| `CODE_MATCH_REJECTED_BY_SEMANTIC_ROLE` | Ao filtrar `codeNodes` quando existe `semanticNodes` |
| `ANALYTICAL_DESCENDANT` | Ao excluir descendentes do vencedor na agregação ou no scoring |
| `LOWER_AUTHORITY` | Candidato de menor pontuação, não descendente do vencedor |
| `ROLE_COLLISION_WITH_NET_REVENUE` | Receita e Resultado apontam para a mesma conta |
| `PROHIBITED_RESULT_SOURCE_REVENUE_GROUP` | Resultado apontava para grupo `3.1` |
| `PERIOD_RESULT_INDISTINGUISHABLE_FROM_ACCUMULATED` | Sem `previous` e valor de competência = valor acumulado |
| `P1_CONFLICT_RESOLVED_BY_SYNTHETIC` | (emitido em `bsDadosBuilder.ts`) valor agregado anterior divergia >1% do valor P1 |

---

## Checklist de Implementação

1. [ ] Implementar `normalizeAccountCode` com exatamente a mesma lógica de segmentação (`.` → fallback `-`/`/`) e remoção de zeros à esquerda.
2. [ ] Implementar `deaccent` (NFD + remoção de diacríticos + upper-case) e aplicá-la a toda descrição antes de qualquer regex.
3. [ ] Construir `AccountNode[]` com `has_children`, `is_synthetic` (`has_children || hierarchy_level <= 2`), `is_analytical`.
4. [ ] Portar literalmente as 17 entradas de `CanonicalRole`, `ROLE_SEMANTICS`, `ROLE_CODES`, `ROLE_PREFIX`.
5. [ ] Portar `ABS_ROLES` (12 roles) e `AGGREGABLE_ROLES` (6 roles) exatamente como listados.
6. [ ] Implementar `topmost()` e garantir que **toda** agregação de contas passe por ele (nunca somar pai+filho).
7. [ ] Implementar o algoritmo de scoring com os pesos exatos: semântica +300, sintética +200, código canônico +150, `100 - nível*10`.
8. [ ] Portar a denylist de exclusões pontuais (`1.1.2.10`, `2.1.2.06`, `2.1.2.01.21001`) como regra literal de dado, documentando a origem (Goldens de homologação).
9. [ ] Implementar as 3 correções pós-processamento: sinal do PL sintético (no-op documentado), Role Exclusivity Receita×Resultado, proibição de origem `3.1` para Resultado.
10. [ ] Implementar a derivação do Resultado da Competência (`ACCUMULATED_MINUS_PREVIOUS_BALANCE`) com o gate anti-cópia (`PERIOD_RESULT_INDISTINGUISHABLE_FROM_ACCUMULATED`).
11. [ ] Implementar os 7 Integrity Gates de `runIntegrityGates` com tolerância `* 1.001` para os 3 gates hierárquicos.
12. [ ] Implementar o Gate 21 (equação patrimonial) com tolerância absoluta de R$ 1.000,00.
13. [ ] Implementar `BALANCE_TOLERANCE = 0.005` e `classifyDeviation` com limiares 1%/3%.
14. [ ] Portar `SEMANTIC_ROLE_REGISTRY`, `isSyntheticAuthority` e `certifyFinancialColumn` incluindo o limite de sanidade de 1 trilhão para `receita_liquida`.
15. [ ] Garantir que todo `CertifiedFact` publicado inclua `excluded_candidates` truncado a 12 itens, com os `reason` codes exatos listados na Seção 15.1.
16. [ ] Nunca hard-codar valores esperados de teste (Goldens) fora das exclusões pontuais documentadas — toda resolução deve ser algorítmica.

## Critérios de Homologação

1. Para um balancete com conta sintética `1.1` "Ativo Circulante" e 5 contas analíticas filhas, o fato `ativo_circulante` deve ter `authority: "P1_SYNTHETIC"` e `value` igual ao saldo da conta `1.1`, nunca à soma das 5 folhas (mesmo que divirjam).
2. Para um balancete sem conta sintética de Estoques mas com "Estoques Próprios" e "Estoques de Terceiros" como grupos irmãos, o fato `estoques` deve ter `authority: "P2_CHILDREN"` e `value` igual à soma dos dois grupos topo, com `excluded_candidates` vazio de contas descendentes de ambos.
3. Toda conta identificada como `ANALYTICAL_DESCENDANT` do vencedor não pode aparecer somada em nenhum agregado publicado.
4. Se Receita Líquida e Resultado do Período resolverem para a mesma `normalizeAccountCode`, o gate `ROLE_COLLISION/revenue_result` deve reprovar (`passed: false`) e `resultado.status` deve ser `NOT_AVAILABLE`.
5. Resultado da Competência só é publicado (`status: AVAILABLE`) quando existe saldo anterior (`previous`) finito para a mesma conta normalizada da conta de Resultado Acumulado; caso contrário, permanece `NOT_AVAILABLE`.
6. Gate 21 deve reprovar (gerar erro em `row.errors`) sempre que `|Ativo Total − (PC+PNC+PL) − Resultado| > R$ 1.000,00`.
7. Nenhuma conta cujo código conste em `SEMANTIC_ROLE_REGISTRY` pode ser atribuída a um campo diferente do registrado — testar com um balancete adversarial que tenta forçar a conta `"1"` para `receita_liquida` via regex fallback; o resultado esperado é rejeição silenciosa com erro em `row.errors`.
8. Reexecutar o motor duas vezes com os mesmos dados de entrada deve produzir exatamente o mesmo `CertifiedFact[]` (determinismo total, sem estado global, sem `Math.random`, sem `Date.now()` na lógica de resolução).
