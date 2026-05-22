/**
 * Edge Function: audit-bs-dados
 *
 * Backend authoritative implementation of the BS & Dados consolidation engine.
 * Mirrors the client-side `bsDadosBuilder.ts` so that the same single source of
 * truth is available for: PDF reports, server exports, audit history snapshots
 * and any third party integration. Persists the consolidated snapshot into
 * `pipeline_analysis_results.indicadores` when `document_id` is provided.
 *
 * INPUT (POST JSON):
 * {
 *   document_id?: string,                  // optional — persists snapshot
 *   balancetes: Array<{
 *     mes: string,                         // "YYYY-MM" or "Março 2024"
 *     linhas: Array<{
 *       conta?: string,
 *       descricao?: string,
 *       ref1?: string | null,              // Ref Capital BEX (A, B, AA…)
 *       saldo: number
 *     }>
 *   }>
 * }
 *
 * OUTPUT:
 * {
 *   bsDados: BSDadosRow[],                 // consolidated rows
 *   indicadores: BSIndicators[],           // derived metrics per month
 *   summary: { meses: number, total_linhas: number, errors: number },
 *   persisted?: boolean
 * }
 */
import { createClient } from "npm:@supabase/supabase-js@2.95.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2.95.0/cors";

// ─── Tipos ───────────────────────────────────────────────
interface InputLinha {
  conta?: string;
  descricao?: string;
  ref1?: string | null;
  saldo: number;
}
interface InputBalancete {
  mes: string;
  linhas: InputLinha[];
}
interface BSDadosRow {
  mes: string;
  mesKey: string;
  receita_liquida: number;
  cmv: number;
  despesas: number;
  resultado: number;
  ativo_circulante: number;
  passivo_circulante: number;
  ativo_nao_circulante: number;     // FIX #3
  passivo_nao_circulante: number;   // FIX #3
  patrimonio_liquido: number;       // FIX #3
  ativo_total: number;              // FIX #3
  passivo_total: number;            // FIX #3
  estoques: number;
  disponivel: number;
  divida_tributaria: number;
  divida_trabalhista: number;
  divida_financeira: number;
  fornecedores: number;
  credores_rj: number;
  divida_total: number;
  hasReceita: boolean;
  hasBalanco: boolean;
  errors: string[];
  ytd_desacumulado?: boolean;
}
interface BSIndicators {
  mes: string;
  cmvPercent: number | null;
  despesaPercent: number | null;
  cmvDespesaPercent: number | null;
  resultadoPercent: number | null;
  liquidezCorrente: number | null;
  liquidezSeca: number | null;
  liquidezImediata: number | null;
}
interface KanitzRow {
  mesKey: string;
  ativo_total: number;
  patrimonio_liquido: number;
  x1: number; x2: number; x3: number; x4: number; x5: number;
  score: number;
  rating: string;
  insight: string;
}

// ─── Constantes (espelham bsDadosBuilder.ts) ─────────────
const MES_FULL = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

const REF1_MAP: Record<string, keyof BSDadosRow> = {
  "A": "disponivel", "B": "disponivel", "C": "ativo_circulante", "D": "estoques",
  "E": "ativo_circulante", "F": "ativo_circulante", "G": "ativo_circulante", "H": "ativo_circulante",
  "I": "ativo_circulante", "J": "ativo_circulante", "K": "ativo_circulante", "L": "ativo_circulante",
  "M": "ativo_circulante", "N": "ativo_circulante", "O": "ativo_circulante",
  "AA": "divida_financeira", "BB": "fornecedores", "CC": "divida_trabalhista",
  "DD": "divida_tributaria", "II": "credores_rj", "LL": "credores_rj",
  "EE": "passivo_circulante", "FF": "passivo_circulante", "GG": "passivo_circulante", "HH": "passivo_circulante",
  "JJ": "passivo_circulante", "KK": "passivo_circulante", "MM": "passivo_circulante", "NN": "divida_tributaria",
  "OO": "passivo_circulante", "II1": "divida_tributaria",
  "PP": "fornecedores", "QQ": "divida_financeira", "RR": "divida_tributaria", "SS": "divida_tributaria", "TT": "divida_financeira", "CC1": "credores_rj",
  // GG1/HH1 (PL: Capital/Lucros Acumulados) NÃO mapeados para "resultado" — resultado vem da DRE.
  "RECEITA": "receita_liquida", "RECEITA LIQUIDA": "receita_liquida", "RECEITA LÍQUIDA": "receita_liquida",
  "DEDUCOES_RECEITA": "receita_liquida",
  "CMV": "cmv", "DESPESAS": "despesas", "DESPESA": "despesas", "RESULTADO": "resultado",
  "ATIVO CIRCULANTE": "ativo_circulante", "PASSIVO CIRCULANTE": "passivo_circulante",
  "ESTOQUES": "estoques", "ESTOQUE": "estoques", "DISPONIVEL": "disponivel", "DISPONÍVEL": "disponivel",
  "PASSIVO TRIBUTARIO": "divida_tributaria", "PASSIVO TRIBUTÁRIO": "divida_tributaria",
  "PASSIVO TRABALHISTA": "divida_trabalhista",
  "EMPRESTIMOS": "divida_financeira", "EMPRÉSTIMOS": "divida_financeira", "FINANCIAMENTOS": "divida_financeira",
  "FORNECEDORES": "fornecedores", "CREDORES RJ": "credores_rj", "RECUPERACAO JUDICIAL": "credores_rj",
};

const AC_REFS = new Set(["A","B","C","D","E","F","G","H","I","J","K","L","M","N","O"]);
const PC_REFS = new Set(["AA","BB","CC","DD","EE","FF","GG","HH","II","JJ","KK","LL","MM","NN","OO","II1"]);

const REF_BY_PREFIX: Array<[RegExp, string]> = [
  [/^11101/, "A"], [/^11102/, "B"], [/^1111/, "C"], [/^113/, "D"], [/^1141/, "E"], [/^1142/, "F"], [/^119/, "G"],
  [/^121/, "P"], [/^122/, "Q"], [/^123/, "R"], [/^124/, "S"],
  [/^211/, "AA"], [/^212/, "BB"], [/^213/, "CC"], [/^2148/, "II1"], [/^214/, "DD"], [/^2151/, "II"], [/^2152/, "LL"],
  [/^221/, "QQ"], [/^222/, "PP"], [/^223/, "RR"], [/^224/, "CC1"],
  [/^231/, "GG1"], [/^232/, "HH1"], [/^24/, "GG1"],
  [/^31/, "RECEITA"], [/^32/, "DEDUCOES_RECEITA"], [/^33/, "DEDUCOES_RECEITA"], [/^4/, "CMV"], [/^5/, "DESPESAS"], [/^6/, "DESPESAS"], [/^7/, "DESPESAS"],
];

function inferRefByCode(code?: string): string | null {
  const c = String(code || "").replace(/\s+/g, "");
  return REF_BY_PREFIX.find(([pattern]) => pattern.test(c))?.[1] ?? null;
}

const FALLBACK_PATTERNS: Partial<Record<keyof BSDadosRow, RegExp>> = {
  receita_liquida: /\breceita.*l[ií]quid|venda.*l[ií]quid\b/i,
  cmv: /\bc(?:mv|sv|pv)\b|\bcusto\s+(?:das?\s+)?(?:mercadoria|servi[cç]o|produto|venda)/i,
  despesas: /\bdespesa|gasto\s+oper/i,
  resultado: /\b(?:lucro|preju[ií]zo|resultado)\s+(?:l[ií]quid|do\s+exerc|do\s+per[ií]odo)/i,
  ativo_circulante: /\bativo\s+circulante\b/i,
  passivo_circulante: /\bpassivo\s+circulante\b/i,
  estoques: /\bestoqu/i,
  disponivel: /\b(?:caixa|disponibilidade|disponivel|bancos?|aplica[cç][aã]o\s+financ|equivalente)/i,
  divida_tributaria: /\b(?:tribut|impostos?\s+a\s+(?:pagar|recolher)|icms|iss|pis|cofins|irpj|csll)/i,
  divida_trabalhista: /\b(?:sal[aá]rios?\s+a\s+pagar|f[eé]rias|13[ºo°]?|inss\s+a\s+pagar|fgts\s+a\s+pagar|encargos\s+sociais|trabalhista)/i,
  divida_financeira: /\b(?:empr[eé]stimos?|financiamentos?|deb[eê]ntures?|leasing|arrendamento)/i,
  fornecedores: /\bfornecedor/i,
  credores_rj: /\b(?:credores?\s+(?:rj|recupera[cç][aã]o)|recupera[cç][aã]o\s+judic)/i,
};

// ─── Helpers ─────────────────────────────────────────────
const upper = (s: string) => (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim();
const norm  = (s: string) => (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim().replace(/\s+/g, " ");
const pad2  = (n: number | string) => String(n).padStart(2, "0");

const MES_ABREV: Record<string, number> = { jan:1,fev:2,mar:3,abr:4,mai:5,jun:6,jul:7,ago:8,set:9,out:10,nov:11,dez:12 };
const MES_LONG:  Record<string, number> = { janeiro:1,fevereiro:2,marco:3,abril:4,maio:5,junho:6,julho:7,agosto:8,setembro:9,outubro:10,novembro:11,dezembro:12 };

function expandYear(y: string | number): number | null {
  const n = Number(y); if (!Number.isFinite(n)) return null;
  if (n >= 1900 && n <= 2100) return n;
  if (n >= 0 && n <= 79) return 2000 + n;
  if (n >= 80 && n <= 99) return 1900 + n;
  return null;
}
function buildKey(y: number, mm: number): string | null {
  if (mm < 1 || mm > 12 || y < 1900 || y > 2100) return null;
  return `${y}-${pad2(mm)}`;
}

/** Normaliza qualquer rótulo de período → "YYYY-MM" (ou devolve a entrada se falhar). */
function periodToMesKey(p: string): string {
  if (!p) return p;
  const raw = String(p).trim();
  const direct = raw.match(/^(\d{4})-(0[1-9]|1[0-2])$/);
  if (direct) return `${direct[1]}-${direct[2]}`;
  const s = norm(raw);
  let m = s.match(/^(\d{4})[\s/\-.](\d{1,2})$/);
  if (m) { const y = expandYear(m[1])!, mm = Number(m[2]); const k = buildKey(y, mm); if (k) return k; }
  m = s.match(/^(\d{1,2})[\s/\-.](\d{2,4})$/);
  if (m) { const mm = Number(m[1]), y = expandYear(m[2]); if (y) { const k = buildKey(y, mm); if (k) return k; } }
  m = s.match(/^([a-z]+)[\s/\-.]+(\d{2,4})$/);
  if (m) { const mm = MES_LONG[m[1]] ?? MES_ABREV[m[1].slice(0,3)]; const y = expandYear(m[2]); if (mm && y) { const k = buildKey(y, mm); if (k) return k; } }
  m = s.match(/^(\d{2,4})[\s/\-.]+([a-z]+)$/);
  if (m) { const y = expandYear(m[1]); const mm = MES_LONG[m[2]] ?? MES_ABREV[m[2].slice(0,3)]; if (mm && y) { const k = buildKey(y, mm); if (k) return k; } }
  m = s.match(/^(\d{4})$/); if (m) { const y = expandYear(m[1]); if (y) return `${y}-12`; }
  return raw;
}

function mesKeyToLabel(k: string): string {
  const m = /^(\d{4})-(\d{1,2})$/.exec(k);
  if (!m) return k;
  const idx = parseInt(m[2],10)-1;
  return idx>=0 && idx<12 ? `${MES_FULL[idx]} ${m[1]}` : k;
}

function emptyRow(mesKey: string): BSDadosRow {
  return {
    mes: mesKeyToLabel(mesKey), mesKey,
    receita_liquida: 0, cmv: 0, despesas: 0, resultado: 0,
    ativo_circulante: 0, passivo_circulante: 0,
    ativo_nao_circulante: 0, passivo_nao_circulante: 0,
    patrimonio_liquido: 0, ativo_total: 0, passivo_total: 0,
    estoques: 0, disponivel: 0,
    divida_tributaria: 0, divida_trabalhista: 0, divida_financeira: 0,
    fornecedores: 0, credores_rj: 0, divida_total: 0,
    hasReceita: false, hasBalanco: false, errors: [],
  };
}

function resolveKey(linha: InputLinha): keyof BSDadosRow | null {
  const ref1 = linha.ref1 ?? inferRefByCode(linha.conta);
  if (ref1) {
    const k = REF1_MAP[upper(ref1)];
    if (k) return k;
  }
  const text = `${linha.descricao || ""} ${linha.conta || ""}`;
  for (const [k, re] of Object.entries(FALLBACK_PATTERNS)) {
    if (re && re.test(text)) return k as keyof BSDadosRow;
  }
  return null;
}

// FIX #3 — Buckets estendidos: trackeia ANC, PNC, PL via ref1 para Kanitz
interface Buckets {
  ac: number; pc: number;
  anc: number; pnc: number; pl: number;
  sawACTotal: boolean; sawPCTotal: boolean;
}

// ANC = P..J1 (15 refs do MD §2.2)
const ANC_REFS = new Set(["P","Q","R","S","T","U","V","W","X","Y","Z","A1","B1","C1","D1","E1","F1","G1","H1","I1","J1"]);
// PNC = PP..FF1 (§2.4)
const PNC_REFS = new Set(["PP","QQ","RR","SS","TT","UU","VV","WW","XX","YY","ZZ","A1A","B1A","C1A","D1A","E1A","F1A","AA1","BB1","CC1A","DD1","EE1","FF1"]);
// PL = GG1, HH1 + "Resultado" (§2.5)
const PL_REFS = new Set(["GG1","HH1","RESULTADO_EXERCICIO"]);

function applyValue(row: BSDadosRow, key: keyof BSDadosRow, v: number, ref1: string | null | undefined, b: Buckets) {
  if (!Number.isFinite(v)) return;
  switch (key) {
    case "receita_liquida": row.receita_liquida += upper(ref1 || "") === "DEDUCOES_RECEITA" ? -Math.abs(v) : Math.abs(v); break;
    case "cmv":             row.cmv -= Math.abs(v); break;
    case "despesas":        row.despesas -= Math.abs(v); break;
    case "resultado":       row.resultado += v; break;
    case "ativo_circulante":  row.ativo_circulante  += Math.abs(v); b.sawACTotal = true; break;
    case "passivo_circulante": row.passivo_circulante += Math.abs(v); b.sawPCTotal = true; break;
    case "estoques":
    case "disponivel":
    case "divida_tributaria":
    case "divida_trabalhista":
    case "divida_financeira":
    case "fornecedores":
    case "credores_rj":
      (row as any)[key] += Math.abs(v); break;
  }
  const refUp = ref1 ? upper(ref1) : "";
  if (refUp && AC_REFS.has(refUp)) b.ac += Math.abs(v);
  else if (refUp && PC_REFS.has(refUp)) b.pc += Math.abs(v);
  else if (refUp && ANC_REFS.has(refUp)) b.anc += Math.abs(v);
  else if (refUp && PNC_REFS.has(refUp)) b.pnc += Math.abs(v);
  else if (refUp && PL_REFS.has(refUp)) b.pl += v; // PL preserva sinal
}

function finalize(r: BSDadosRow): BSDadosRow {
  r.divida_total = r.divida_tributaria + r.divida_trabalhista + r.divida_financeira + r.fornecedores + r.credores_rj;
  // Resultado derivado da DRE (cmv/despesas já negativos) — evita dupla contagem do PL.
  r.resultado = r.receita_liquida + r.cmv + r.despesas;
  r.ativo_total = r.ativo_circulante + r.ativo_nao_circulante;
  r.passivo_total = r.passivo_circulante + r.passivo_nao_circulante;
  r.hasReceita = r.receita_liquida > 0;
  r.hasBalanco = r.ativo_circulante > 0 || r.passivo_circulante > 0 || r.divida_total > 0;
  if (!r.hasReceita) r.errors.push("Receita líquida ausente ou zerada");
  if (r.cmv > 0)     r.errors.push("CMV positivo (deveria ser negativo)");
  return r;
}

/**
 * FIX #1 (DEFINITIVO) — Prune hierárquico robusto.
 * Combina:
 *  (a) detecção de pais por código com separador "." OU contínuo numérico
 *  (b) filtro de descrições sintéticas/totalizadoras conhecidas
 */
const SYNTHETIC_DESC_PATTERNS: RegExp[] = [
  /^ativo$/i, /^ativo\s+(circulante|n[aã]o\s+circulante|total|realiz[aá]vel)/i,
  /^passivo$/i, /^passivo\s+(circulante|n[aã]o\s+circulante|total|exig[ií]vel)/i,
  /^patrim[oô]nio\s+l[ií]quido$/i,
  /^total\s+do?\s+(ativo|passivo|patrim[oô]nio|circulante|n[aã]o\s+circulante)/i,
  /^total\s+geral/i, /^subtotal/i, /^totaliza/i,
  /^demonstra[çc][aã]o\s+de?\s+resultado/i, /^demonstrativo\s+de?\s+resultado/i, /^dre$/i,
  /^receita\s+(bruta|l[ií]quida|total|operacional)$/i,
  /^despesa\s+(total|operacional)$/i,
  /^resultado\s+(bruto|operacional|antes|do\s+exerc[ií]cio|l[ií]quido)/i,
  /^lucro\s+(bruto|operacional|antes|do\s+exerc[ií]cio|l[ií]quido)/i,
];
function isSyntheticDesc(desc?: string): boolean {
  const d = String(desc || "").trim();
  if (!d) return false;
  return SYNTHETIC_DESC_PATTERNS.some(p => p.test(d));
}

function pruneParents(linhas: InputLinha[]): InputLinha[] {
  const normCode = (c?: string) => String(c || "").replace(/\s+/g, "").replace(/\.+$/g, "");
  const codes = linhas.map(l => normCode(l.conta));
  const codeSet = new Set(codes.filter(Boolean));
  const parents = new Set<string>();
  for (const c of codeSet) {
    for (const other of codeSet) {
      if (other.length > c.length && other.startsWith(c)) {
        const next = other.charAt(c.length);
        if (/[0-9.]/.test(next) || c.endsWith(".")) { parents.add(c); break; }
      }
    }
  }
  return linhas.filter(l => {
    const c = normCode(l.conta);
    // Remove descrições sintéticas mesmo quando sem código
    if (isSyntheticDesc(l.descricao)) return false;
    if (!c) return true;
    return !parents.has(c);
  });
}

/**
 * FIX #2 — Desacumular DRE quando os valores aparecem como saldo YTD.
 * Heurística:
 *  - Para cada chave de DRE (receita_liquida, cmv, despesas), olhar a série mensal
 *    DENTRO do mesmo ano-civil ordenada por mesKey.
 *  - Se |valor(mês_n)| > |valor(mês_(n-1))| em 2+ pares consecutivos do mesmo ano,
 *    considerar acumulado. Aplica differencing: novo_n = bruto_n - bruto_(n-1).
 *  - Mês de janeiro nunca é desacumulado (é o ponto de partida do exercício).
 *  - Reset entre anos preservado.
 */
function desacumularDRE(rows: BSDadosRow[]): BSDadosRow[] {
  if (rows.length < 2) return rows;
  const sorted = [...rows].sort((a, b) => a.mesKey.localeCompare(b.mesKey));
  const dreKeys: Array<"receita_liquida" | "cmv" | "despesas"> = ["receita_liquida", "cmv", "despesas"];
  // Agrupar por ano
  const byYear = new Map<string, BSDadosRow[]>();
  for (const r of sorted) {
    const y = r.mesKey.slice(0, 4);
    if (!byYear.has(y)) byYear.set(y, []);
    byYear.get(y)!.push(r);
  }
  for (const [, group] of byYear) {
    if (group.length < 2) continue;
    for (const k of dreKeys) {
      // Detecta monotonia crescente em valor absoluto (sinal típico de YTD)
      let monotonicPairs = 0;
      for (let i = 1; i < group.length; i++) {
        const prev = Math.abs(group[i - 1][k] as number);
        const curr = Math.abs(group[i][k] as number);
        if (prev > 0 && curr > prev * 1.15) monotonicPairs++;
      }
      // Se a maioria dos pares cresce significativamente → YTD
      if (monotonicPairs >= Math.max(2, Math.floor((group.length - 1) * 0.6))) {
        const original = group.map(g => g[k] as number);
        for (let i = group.length - 1; i >= 1; i--) {
          (group[i] as any)[k] = original[i] - original[i - 1];
        }
        for (const r of group) {
          if (!r.errors.includes(`DRE.${k} desacumulada (YTD detectado)`)) {
            r.errors.push(`DRE.${k} desacumulada (YTD detectado)`);
          }
          r.ytd_desacumulado = true;
        }
      }
    }
    // Recalcula resultado pós-desacumulação
    for (const r of group) {
      r.resultado = r.receita_liquida + r.cmv + r.despesas;
    }
  }
  return sorted;
}

function buildBSDados(balancetes: InputBalancete[]): BSDadosRow[] {
  const rowsByMes = new Map<string, BSDadosRow>();
  const bucketsByMes = new Map<string, Buckets>();

  const dup: Record<string, number> = {};
  for (const b of balancetes) {
    const k = periodToMesKey(b.mes);
    dup[k] = (dup[k] || 0) + 1;
  }

  for (const b of balancetes) {
    const mesKey = periodToMesKey(b.mes);
    if (!rowsByMes.has(mesKey)) {
      rowsByMes.set(mesKey, emptyRow(mesKey));
      bucketsByMes.set(mesKey, { ac: 0, pc: 0, anc: 0, pnc: 0, pl: 0, sawACTotal: false, sawPCTotal: false });
    }
    if (dup[mesKey] > 1) {
      const r = rowsByMes.get(mesKey)!;
      const msg = `Mês duplicado entre balancetes (×${dup[mesKey]}) — valores somados`;
      if (!r.errors.includes(msg)) r.errors.push(msg);
    }
    const row = rowsByMes.get(mesKey)!;
    const buckets = bucketsByMes.get(mesKey)!;
    const linhasLeaf = pruneParents(b.linhas || []);
    for (const linha of linhasLeaf) {
      const key = resolveKey(linha);
      if (!key) continue;
      applyValue(row, key, Number(linha.saldo) || 0, linha.ref1 ?? inferRefByCode(linha.conta), buckets);
    }
  }

  for (const [mesKey, row] of rowsByMes) {
    const b = bucketsByMes.get(mesKey)!;
    if (!b.sawACTotal && b.ac > 0) row.ativo_circulante = b.ac;
    if (!b.sawPCTotal && b.pc > 0) row.passivo_circulante = b.pc;
    row.ativo_nao_circulante = b.anc;
    row.passivo_nao_circulante = b.pnc;
    row.patrimonio_liquido = b.pl;
  }

  const finalized = Array.from(rowsByMes.values()).map(finalize)
    .sort((a, b) => a.mesKey.localeCompare(b.mesKey));
  return desacumularDRE(finalized);
}

const safePct = (a: number, b: number): number | null =>
  !b || !Number.isFinite(b) ? null : Number(((a / b) * 100).toFixed(2));
const safeDiv = (a: number, b: number): number | null =>
  !b || !Number.isFinite(b) ? null : Number((a / b).toFixed(4));

function enrich(rows: BSDadosRow[]): BSIndicators[] {
  return rows.map(r => ({
    mes: r.mes,
    cmvPercent: safePct(Math.abs(r.cmv), r.receita_liquida),
    despesaPercent: safePct(Math.abs(r.despesas), r.receita_liquida),
    cmvDespesaPercent: safePct(Math.abs(r.cmv) + Math.abs(r.despesas), r.receita_liquida),
    resultadoPercent: safePct(r.resultado, r.receita_liquida),
    liquidezCorrente: safeDiv(r.ativo_circulante, r.passivo_circulante),
    liquidezSeca: safeDiv(r.ativo_circulante - r.estoques, r.passivo_circulante),
    liquidezImediata: safeDiv(r.disponivel, r.passivo_circulante),
  }));
}

// ─── FIX #3: Kanitz por mês ─────────────────────────────
function computeKanitz(rows: BSDadosRow[]): KanitzRow[] {
  return rows.map(r => {
    const AC = r.ativo_circulante;
    const PC = r.passivo_circulante;
    const ELP = r.passivo_nao_circulante;
    const PL = r.patrimonio_liquido;
    const LL = r.resultado;
    const RLP = 0;
    const safe = (n: number, d: number) => (Math.abs(d) < 0.01 ? 0 : n / d);
    const x1 = safe(LL, PL);
    const x2 = safe(AC + RLP, PC + ELP);
    const x3 = safe(AC - r.estoques, PC);
    const x4 = safe(AC, PC);
    const x5 = safe(PC + ELP, PL);
    const score = 0.05 * x1 + 1.65 * x2 + 3.55 * x3 - 1.06 * x4 - 0.33 * x5;
    let rating = "B - Atenção";
    let insight = "Faixa de penumbra — monitorar.";
    if (score > 0) { rating = "A - Solvente"; insight = "Empresa em situação financeira saudável."; }
    else if (score < -3) { rating = "C - Insolvente"; insight = "Forte indicativo de insolvência."; }
    return {
      mesKey: r.mesKey,
      ativo_total: r.ativo_total,
      patrimonio_liquido: PL,
      x1: Number(x1.toFixed(4)), x2: Number(x2.toFixed(4)), x3: Number(x3.toFixed(4)),
      x4: Number(x4.toFixed(4)), x5: Number(x5.toFixed(4)),
      score: Number(score.toFixed(4)),
      rating, insight,
    };
  });
}

// ─── FIX #3: Insights determinísticos compactos ─────────
function computeInsights(rows: BSDadosRow[], kanitz: KanitzRow[]): {
  diagnostico: string; problemas: any[]; riscos: any[]; recomendacoes: any[]; positivos: any[]; tendencia: string;
} {
  const ultimo = rows[rows.length - 1];
  const ultK = kanitz[kanitz.length - 1];
  const problemas: any[] = [];
  const riscos: any[] = [];
  const positivos: any[] = [];
  const recomendacoes: any[] = [];
  if (ultimo) {
    if (ultimo.resultado < 0) problemas.push({ tipo: "resultado_negativo", valor: ultimo.resultado, descricao: "Prejuízo no exercício" });
    if (ultimo.patrimonio_liquido < 0) riscos.push({ tipo: "passivo_a_descoberto", valor: ultimo.patrimonio_liquido, descricao: "PL negativo" });
    if (ultimo.passivo_circulante > ultimo.ativo_circulante) riscos.push({ tipo: "liquidez_critica", descricao: "PC > AC" });
    if (ultK && ultK.score < -3) riscos.push({ tipo: "kanitz_insolvente", valor: ultK.score });
    if (ultimo.divida_total > 0) problemas.push({ tipo: "endividamento", valor: ultimo.divida_total });
    if (ultimo.receita_liquida > 0) positivos.push({ tipo: "receita_existente", valor: ultimo.receita_liquida });
    recomendacoes.push({ acao: "Revisar política de capital de giro" });
    if (ultimo.patrimonio_liquido < 0) recomendacoes.push({ acao: "Capitalização urgente" });
  }
  const tendencia = rows.length >= 2
    ? (rows[rows.length - 1].resultado < rows[0].resultado ? "deterioracao" : "melhora")
    : "estavel";
  const diagnostico = ultK
    ? `Kanitz=${ultK.score.toFixed(2)} (${ultK.rating}). ${ultK.insight}`
    : "Análise determinística baseada nos dados consolidados.";
  return { diagnostico, problemas, riscos, recomendacoes, positivos, tendencia };
}

// ─── HTTP handler ────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => null);
    if (!body || !Array.isArray(body.balancetes)) {
      return new Response(JSON.stringify({ error: "balancetes[] obrigatório" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── SANITIZAÇÃO DE mesKey (FIX #2) ───────────────────────
    // Rejeita placeholders ("atual", "corrente", "—") que quebram o cast ::date
    // mais adiante e fazem perder TODA a persistência determinística.
    const isValidMesKey = (k: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(k);
    const rawBalancetes: InputBalancete[] = body.balancetes;
    const sanitized: InputBalancete[] = [];
    const rejected: Array<{ mes: string; reason: string }> = [];
    for (const b of rawBalancetes) {
      const mk = periodToMesKey(b.mes);
      if (isValidMesKey(mk)) {
        sanitized.push({ ...b, mes: mk });
      } else {
        rejected.push({ mes: b.mes, reason: `mês inválido após normalização: "${mk}"` });
      }
    }
    if (sanitized.length === 0) {
      return new Response(JSON.stringify({
        error: "Nenhum balancete com mês válido (YYYY-MM). Forneça meses explícitos antes de consolidar.",
        rejected,
      }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (rejected.length > 0) {
      console.warn(`[audit-bs-dados] ${rejected.length} balancete(s) descartados por mês inválido:`, rejected);
    }

    const balancetes: InputBalancete[] = sanitized;
    const bsDados = buildBSDados(balancetes);
    const indicadores = enrich(bsDados);
    const summary = {
      meses: bsDados.length,
      total_linhas: balancetes.reduce((s, b) => s + (b.linhas?.length || 0), 0),
      errors: bsDados.reduce((s, r) => s + r.errors.length, 0),
      rejected_meses: rejected.length,
    };


    let persisted = false;
    let auditId: string | null = null;
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } },
    );

    // (a) snapshot legacy em pipeline_analysis_results (compat)
    if (body.document_id && typeof body.document_id === "string") {
      const { error } = await supabase.from("pipeline_analysis_results").insert({
        document_id: body.document_id,
        indicadores: { bsDados, indicadores, summary, generated_at: new Date().toISOString() },
        mapping_score: bsDados.length ? 1 : 0,
        validation_score: summary.errors === 0 ? 1 : 0.5,
        quality_score: summary.errors === 0 && bsDados.length ? 1 : 0.5,
      });
      persisted = !error;
    }

    // (b) MD MASTER: cria audit + balancetes + bs_dados + indicadores
    if (body.company_id && typeof body.company_id === "string") {
      try {
        // userId via JWT
        const { data: userData } = await supabase.auth.getUser(
          (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, ""),
        );
        const createdBy = userData?.user?.id;
        if (createdBy) {
          // 1. cria auditoria
          const { data: auditRow, error: aErr } = await supabase
            .from("audits")
            .insert({
              company_id: body.company_id,
              created_by: createdBy,
              name: body.audit_name || `Auditoria ${new Date().toLocaleDateString("pt-BR")}`,
              variant: body.variant || "completo",
              status: "completed",
              meses_count: bsDados.length,
              metadata: { source: "audit-bs-dados", summary, periodos: bsDados.map(r => r.mesKey) },
            })
            .select("id")
            .single();
          if (aErr) throw aErr;
          auditId = auditRow.id as string;

          // 2. balancetes (1 linha por mês) — captura IDs para gravar lines
          const balancetesIns = balancetes.map((b) => ({
            audit_id: auditId,
            created_by: createdBy,
            mes_referencia: `${periodToMesKey(b.mes)}-01`,
            file_name: body.file_name || "balancete",
            total_linhas: (b.linhas || []).length,
            content_hash: body.content_hash || null,
            pipeline_document_id: body.document_id || null,
          }));
          let balIdByMes = new Map<string, string>();
          if (balancetesIns.length > 0) {
            const { data: insertedBals, error: bErr } = await supabase
              .from("balancetes")
              .insert(balancetesIns)
              .select("id, mes_referencia");
            if (bErr) throw bErr;
            for (const row of insertedBals || []) {
              balIdByMes.set(String(row.mes_referencia).slice(0, 7), row.id as string);
            }

            // 2b. PERSISTÊNCIA GRANULAR: balancete_lines (conta × período × saldo)
            // — fundação da rastreabilidade temporal (Onda 1).
            const linesIns: any[] = [];
            for (const b of balancetes) {
              const mesKey = periodToMesKey(b.mes);
              const balId = balIdByMes.get(mesKey);
              if (!balId) continue;
              for (const l of (b.linhas || [])) {
                if (!l || (!l.conta && !l.descricao)) continue;
                const saldo = Number(l.saldo) || 0;
                if (!Number.isFinite(saldo)) continue;
                linesIns.push({
                  balancete_id: balId,
                  conta: String(l.conta || "").trim() || "—",
                  descricao: l.descricao ? String(l.descricao).slice(0, 500) : null,
                  ref1: l.ref1 ?? inferRefByCode(l.conta) ?? null,
                  saldo,
                });
              }
            }
            // Insere em lotes de 500 para evitar payload grande
            for (let i = 0; i < linesIns.length; i += 500) {
              const chunk = linesIns.slice(i, i + 500);
              const { error: lErr } = await supabase.from("balancete_lines").insert(chunk);
              if (lErr) console.warn("balancete_lines insert warn:", lErr.message);
            }
          }

          // 3. bs_dados (snapshot consolidado)
          const bsRows = bsDados.map((r) => ({
            audit_id: auditId,
            mes: `${r.mesKey}-01`,
            receita_liquida: r.receita_liquida,
            cmv: r.cmv,
            despesas: r.despesas,
            resultado: r.resultado,
            ativo_circulante: r.ativo_circulante,
            passivo_circulante: r.passivo_circulante,
            estoques: r.estoques,
            disponivel: r.disponivel,
            divida_tributaria: r.divida_tributaria,
            divida_trabalhista: r.divida_trabalhista,
            divida_financeira: r.divida_financeira,
            fornecedores: r.fornecedores,
            credores_rj: r.credores_rj,
            divida_total: r.divida_total,
            errors: r.errors,
          }));
          if (bsRows.length > 0) {
            await supabase.from("bs_dados").upsert(bsRows, { onConflict: "audit_id,mes" });
          }

          // 4. indicadores
          const indRows = indicadores.map((i, idx) => ({
            audit_id: auditId,
            mes: `${bsDados[idx].mesKey}-01`,
            cmv_percent: i.cmvPercent,
            despesa_percent: i.despesaPercent,
            cmv_despesa_percent: i.cmvDespesaPercent,
            resultado_percent: i.resultadoPercent,
            liquidez_corrente: i.liquidezCorrente,
            liquidez_seca: i.liquidezSeca,
            liquidez_imediata: i.liquidezImediata,
          }));
          if (indRows.length > 0) {
            await supabase.from("indicadores").insert(indRows);
          }

          // 5. log
          await supabase.from("audit_logs").insert({
            audit_id: auditId,
            etapa: "bs_dados.persist",
            status: "ok",
            payload: { meses: bsDados.length, errors: summary.errors },
          });

          persisted = true;
        }
      } catch (mdErr) {
        console.warn("MD MASTER persist warn:", (mdErr as Error)?.message);
      }
    }


    return new Response(JSON.stringify({ bsDados, indicadores, summary, persisted, audit_id: auditId }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || "internal_error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
