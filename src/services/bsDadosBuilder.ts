/**
 * BS & DADOS BUILDER — Single Source of Truth
 *
 * Replica a lógica da aba "Dados para Gráficos" da planilha BEX:
 *   Balancete (Saldo Atual) → Agrupamento por Ref 1 (Ref Capital) → Estrutura mensal consolidada
 *
 * Aceita 3 cenários:
 *   1) 1 balancete com 1 mês (mês atribuído pelo usuário)
 *   2) 1 balancete com múltiplos meses já no arquivo (extração direta)
 *   3) 2 ou 3 balancetes, cada um com mês atribuído pelo usuário
 *
 * REGRAS DE SINAL:
 *   - Receita Líquida → POSITIVA
 *   - CMV / Despesas → NEGATIVOS
 *   - Resultado → mantém sinal natural
 *   - Componentes de dívida → POSITIVOS (módulo)
 *   - Percentuais derivados → sempre POSITIVOS
 */
import { inferRefByCode, type ParsedFinancialData } from "@/services/auditAIService";
import {
  mesKeyToLabel as _mesKeyToLabel,
  periodToMesKey as _periodToMesKey,
  detectDuplicates,
} from "@/services/mesNormalizer";

// Mapeamento Ref 1 (Ref Capital BEX) → chave canônica BS & Dados.
// Cobertura COMPLETA das 47 referências da aba "BS" do template
// (Ativo Circulante A..O, ANC P..J1, Passivo Circulante AA..II1, PNC PP..FF1, PL GG1/HH1/Resultado).
// Ref ausente do mapa = ignorada na consolidação (não-zerada apenas se houver fallback regex).
export const REF1_MAP: Record<string, keyof BSDadosRow> = {
  // ── Ativo Circulante (A..O) ──
  "A": "disponivel",        // Caixa e Equivalentes
  "B": "disponivel",        // Aplicações Financeiras
  "C": "ativo_circulante",  // Contas a receber clientes (também → contas_receber via orth.)
  "D": "estoques",          // Estoque
  "E": "ativo_circulante",
  "F": "ativo_circulante",
  "G": "ativo_circulante",
  "H": "ativo_circulante",
  "I": "ativo_circulante",
  "J": "ativo_circulante",
  "K": "ativo_circulante",
  "L": "ativo_circulante",
  "M": "ativo_circulante",
  "N": "ativo_circulante",
  "O": "ativo_circulante",
  // ── Ativo Não Circulante (P..J1) ──
  "P": "ativo_nao_circulante",  "Q": "ativo_nao_circulante",  "R": "ativo_nao_circulante",
  "S": "ativo_nao_circulante",  "T": "ativo_nao_circulante",  "U": "ativo_nao_circulante",
  "V": "ativo_nao_circulante",  "W": "ativo_nao_circulante",  "X": "ativo_nao_circulante",
  "Y": "ativo_nao_circulante",  "Z": "ativo_nao_circulante",  "A1": "ativo_nao_circulante",
  "B1": "ativo_nao_circulante",
  "C1": "ativo_nao_circulante", // Imobilizado Líquido — também alimenta orth. imobilizado
  "D1": "ativo_nao_circulante", // Intangível — também alimenta orth. imobilizado
  "E1": "ativo_nao_circulante", "F1": "ativo_nao_circulante", "G1": "ativo_nao_circulante",
  "H1": "ativo_nao_circulante", "I1": "ativo_nao_circulante", "J1": "ativo_nao_circulante",
  // ── Passivo Circulante (AA..II1) ──
  "AA": "divida_financeira",
  "BB": "fornecedores",
  "CC": "divida_trabalhista",
  "DD": "divida_tributaria",
  "EE": "passivo_circulante",
  "FF": "passivo_circulante",
  "GG": "passivo_circulante",
  "HH": "passivo_circulante",
  "II": "credores_rj",
  "JJ": "passivo_circulante",
  "KK": "passivo_circulante",
  "LL": "credores_rj",
  "MM": "passivo_circulante",
  "NN": "divida_tributaria",
  "OO": "passivo_circulante",
  "II1": "divida_tributaria",
  // ── Passivo Não Circulante (PP..FF1) ──
  "PP": "fornecedores",        // LP
  "QQ": "divida_financeira",   // LP
  "RR": "divida_tributaria",   // LP
  "SS": "divida_tributaria",
  "TT": "divida_financeira",
  "UU": "passivo_nao_circulante", "VV": "passivo_nao_circulante", "WW": "passivo_nao_circulante",
  "XX": "passivo_nao_circulante", "YY": "passivo_nao_circulante", "ZZ": "passivo_nao_circulante",
  "AA1": "passivo_nao_circulante", "BB1": "passivo_nao_circulante",
  "CC1": "credores_rj",        // RJ LP
  "DD1": "passivo_nao_circulante", "EE1": "passivo_nao_circulante", "FF1": "passivo_nao_circulante",
  // ── Patrimônio Líquido ──
  "GG1": "patrimonio_liquido", // Capital Social
  "HH1": "patrimonio_liquido", // Lucros/Prejuízos Acumulados
  "RESULTADO": "resultado",
  // ── Aliases textuais (fallback quando ref1 vem como nome) ──
  "RECEITA": "receita_liquida",
  "DEDUCOES_RECEITA": "receita_liquida",
  "RECEITA LIQUIDA": "receita_liquida",
  "RECEITA LÍQUIDA": "receita_liquida",
  "CMV": "cmv",
  "DESPESAS": "despesas",
  "DESPESA": "despesas",
  "ATIVO CIRCULANTE": "ativo_circulante",
  "ATIVO NAO CIRCULANTE": "ativo_nao_circulante",
  "ATIVO NÃO CIRCULANTE": "ativo_nao_circulante",
  "PASSIVO CIRCULANTE": "passivo_circulante",
  "PASSIVO NAO CIRCULANTE": "passivo_nao_circulante",
  "PASSIVO NÃO CIRCULANTE": "passivo_nao_circulante",
  "PATRIMONIO LIQUIDO": "patrimonio_liquido",
  "PATRIMÔNIO LÍQUIDO": "patrimonio_liquido",
  "ESTOQUES": "estoques",
  "ESTOQUE": "estoques",
  "DISPONIVEL": "disponivel",
  "DISPONÍVEL": "disponivel",
  "PASSIVO TRIBUTARIO": "divida_tributaria",
  "PASSIVO TRIBUTÁRIO": "divida_tributaria",
  "PASSIVO TRABALHISTA": "divida_trabalhista",
  "EMPRESTIMOS": "divida_financeira",
  "EMPRÉSTIMOS": "divida_financeira",
  "FINANCIAMENTOS": "divida_financeira",
  "FORNECEDORES": "fornecedores",
  "CREDORES RJ": "credores_rj",
  "RECUPERACAO JUDICIAL": "credores_rj",
};


// Padrões regex usados quando o balancete extraído não traz "Ref 1" explícito
// (espelha auditDatasetBuilder porém alinhado às chaves do MD)
const FALLBACK_PATTERNS: Record<keyof BSDadosRow, RegExp | null> = {
  mes: null, mesKey: null,
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
  divida_total: null,
  hasReceita: null, hasBalanco: null, errors: null,
};

// ─── Tipos ───────────────────────────────────────────────
export interface BSDadosRow {
  mes: string;            // "Março 2024"
  mesKey: string;         // "2024-03"
  receita_liquida: number;
  cmv: number;
  despesas: number;
  resultado: number;
  ativo_circulante: number;
  passivo_circulante: number;
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
}

export interface BalanceteEntry {
  /** Identificador do arquivo / balancete de origem */
  fileName: string;
  /** Mês de referência atribuído pelo usuário (formato YYYY-MM). Pode ser null se múltiplos meses já estão no arquivo. */
  mesReferencia: string | null;
  /** Quando o usuário escolheu "auto-detect", lista de meses YYYY-MM resolvidos pelo parser. */
  mesesDetectados?: string[];
}

// ─── Helpers ─────────────────────────────────────────────
const toUpperNoAccent = (s: string) =>
  (s || "")
    .toString()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .trim();

// Re-exporta para manter compatibilidade dos imports existentes.
export const mesKeyToLabel = _mesKeyToLabel;
export const periodToMesKey = _periodToMesKey;

function emptyRow(mesKey: string): BSDadosRow {
  return {
    mes: mesKeyToLabel(mesKey), mesKey,
    receita_liquida: 0, cmv: 0, despesas: 0, resultado: 0,
    ativo_circulante: 0, passivo_circulante: 0,
    estoques: 0, disponivel: 0,
    divida_tributaria: 0, divida_trabalhista: 0, divida_financeira: 0,
    fornecedores: 0, credores_rj: 0, divida_total: 0,
    hasReceita: false, hasBalanco: false, errors: [],
  };
}

// ─── Núcleo: agrupa linhas (Ref 1) ───────────────────────
interface RowLike {
  descricao?: string;
  conta?: string;
  ref1?: string | null;
  saldo: number;
}

// Conjuntos de Refs Capital que agregam totalizadores AC e PC (template BEX).
// Estes acumuladores SÓ são usados quando o balancete não traz a linha
// totalizadora explícita "ATIVO CIRCULANTE" / "PASSIVO CIRCULANTE".
const AC_REFS = new Set(["A","B","C","D","E","F","G","H","I","J","K","L","M","N","O"]);
const PC_REFS = new Set(["AA","BB","CC","DD","EE","FF","GG","HH","II","JJ","KK","LL","MM","NN","OO","II1"]);

// Buckets internos por mês para somar componentes (acumulador AC/PC derivado).
type ComponentBuckets = { ac: number; pc: number; sawACTotal: boolean; sawPCTotal: boolean };

/** Resolve a chave canônica de uma linha pelo Ref 1; cai para regex se ausente. */
function resolveKey(row: RowLike): keyof BSDadosRow | null {
  const ref1 = row.ref1 ?? inferRefByCode(row.conta || "");
  if (ref1) {
    const k = REF1_MAP[toUpperNoAccent(ref1)];
    if (k) return k;
  }
  const text = `${row.descricao || ""} ${row.conta || ""}`;
  for (const [key, pattern] of Object.entries(FALLBACK_PATTERNS)) {
    if (!pattern) continue;
    if (pattern.test(text)) return key as keyof BSDadosRow;
  }
  return null;
}

function applyValue(
  target: BSDadosRow,
  key: keyof BSDadosRow,
  value: number,
  ref1: string | null | undefined,
  buckets: ComponentBuckets,
) {
  const v = Number(value);
  if (!Number.isFinite(v)) return;
  switch (key) {
    case "receita_liquida":
      (target as any)[key] = (target[key] as number) + (toUpperNoAccent(ref1 || "") === "DEDUCOES_RECEITA" ? -Math.abs(v) : Math.abs(v)); break;
    case "cmv":
    case "despesas":
      (target as any)[key] = (target[key] as number) - Math.abs(v); break;
    case "resultado":
      (target as any)[key] = (target[key] as number) + v; break;
    case "ativo_circulante":
      target.ativo_circulante += Math.abs(v);
      buckets.sawACTotal = true; break;
    case "passivo_circulante":
      target.passivo_circulante += Math.abs(v);
      buckets.sawPCTotal = true; break;
    case "estoques":
    case "disponivel":
    case "divida_tributaria":
    case "divida_trabalhista":
    case "divida_financeira":
    case "fornecedores":
    case "credores_rj":
      (target as any)[key] = (target[key] as number) + Math.abs(v); break;
    default: break;
  }
  // Acumula componentes para derivar AC/PC SE o balancete não trouxer o total.
  const refUp = ref1 ? toUpperNoAccent(ref1) : "";
  if (refUp && AC_REFS.has(refUp)) buckets.ac += Math.abs(v);
  else if (refUp && PC_REFS.has(refUp)) buckets.pc += Math.abs(v);
}

// Tolerância padrão para validação Ativo = Passivo + PL (0.5%).
export const BALANCE_TOLERANCE = 0.005;

function finalize(row: BSDadosRow, buckets?: ComponentBuckets): BSDadosRow {
  row.divida_total =
    row.divida_tributaria + row.divida_trabalhista + row.divida_financeira +
    row.fornecedores + row.credores_rj;
  // Resultado derivado da DRE (determinístico) — cmv/despesas já vêm negativos.
  // Evita dupla contagem com contas de PL no balanço (Capital, Lucros Acumulados).
  row.resultado = row.receita_liquida + row.cmv + row.despesas;
  row.hasReceita = row.receita_liquida > 0;
  row.hasBalanco = row.ativo_circulante > 0 || row.passivo_circulante > 0 || row.divida_total > 0;
  // Validações
  if (!row.hasReceita) row.errors.push("Receita líquida ausente ou zerada");
  if (row.cmv > 0) row.errors.push("CMV positivo (deveria ser negativo)");
  // Validação contábil: AC declarado ≈ soma de componentes (proxy de Ativo=Passivo+PL)
  if (buckets) {
    if (buckets.sawACTotal && buckets.ac > 0) {
      const diff = Math.abs(row.ativo_circulante - buckets.ac);
      const ref = Math.max(row.ativo_circulante, buckets.ac);
      if (ref > 0 && diff / ref > BALANCE_TOLERANCE) {
        row.errors.push(`Ativo Circulante divergente dos componentes (Δ ${(diff/ref*100).toFixed(2)}%)`);
      }
    }
    if (buckets.sawPCTotal && buckets.pc > 0) {
      const diff = Math.abs(row.passivo_circulante - buckets.pc);
      const ref = Math.max(row.passivo_circulante, buckets.pc);
      if (ref > 0 && diff / ref > BALANCE_TOLERANCE) {
        row.errors.push(`Passivo Circulante divergente dos componentes (Δ ${(diff/ref*100).toFixed(2)}%)`);
      }
    }
  }
  return row;
}

// ─── BUILDER ─────────────────────────────────────────────
/**
 * Constrói as linhas BS & Dados a partir do ParsedFinancialData (saída do pipeline)
 * combinado com os meses atribuídos manualmente pelo usuário (quando aplicável).
 *
 * @param parsed   Dados já extraídos pelo pipeline (DRE + Balanço por período)
 * @param entries  Lista de balancetes carregados; usado para mapear arquivos sem mês detectado
 */
export function buildBSDados(
  parsed: ParsedFinancialData | null | undefined,
  entries: BalanceteEntry[] = [],
): BSDadosRow[] {
  if (!parsed) return [];
  const periodsRaw = parsed.years ?? [];

  // Meses atribuídos pelo usuário (autoridade quando presentes).
  const userMesKeys = entries
    .map(e => e.mesReferencia)
    .filter((k): k is string => !!k);

  // Estratégia de meses:
  //  - Se usuário atribuiu N meses E o pipeline detectou ≤ 1 período, usa entries
  //    (cenário: 1 balancete sem multi-mês embutido, ou 2-3 balancetes 1-mês cada).
  //  - Caso contrário, usa periodsRaw (pipeline detectou multi-mês no arquivo).
  const useUser = userMesKeys.length > 0 && (periodsRaw.length <= 1 || periodsRaw.every(p => p.length < 7));
  const usableMesKeys: string[] = useUser
    ? userMesKeys
    : (periodsRaw.length ? periodsRaw.map(periodToMesKey).filter(k => k && k.includes("-")) : userMesKeys);

  // Detecta duplicatas determinísticas (helper compartilhado).
  // Regra de mescla padrão p/ duplicidade de balancetes do MESMO mês: SOMA
  // (assume balancetes complementares — ex.: matriz + filial). Quando o
  // duplicado é o MESMO arquivo recarregado, o hash dedupe na pipeline já
  // bloqueia antes de chegar aqui.
  const { duplicates: dupList } = detectDuplicates(usableMesKeys);
  const dupSet = new Set(dupList.map(d => d.mesKey));

  const rowsByMes = new Map<string, BSDadosRow>();
  const bucketsByMes = new Map<string, ComponentBuckets>();
  // Ordem determinística (cronológica) — evita ordens de Set dependentes de inserção.
  const orderedKeys = Array.from(new Set(usableMesKeys)).sort();
  orderedKeys.forEach(k => {
    rowsByMes.set(k, emptyRow(k));
    bucketsByMes.set(k, { ac: 0, pc: 0, sawACTotal: false, sawPCTotal: false });
    if (dupSet.has(k)) {
      const r = rowsByMes.get(k)!;
      const count = dupList.find(d => d.mesKey === k)?.count ?? 2;
      const msg = `Mês duplicado entre balancetes (×${count}) — valores somados`;
      if (!r.errors.includes(msg)) r.errors.push(msg);
    }
  });

  // Itera DRE + Balanço, mapeando por período → mesKey.
  // Quando useUser=true, ignoramos a chave de período do parsed (vem genérica como "2024")
  // e distribuímos as linhas para todos os meses do usuário (fallback de mês único).
  const allRows = [
    ...((parsed.dre ?? []) as any[]),
    ...((parsed.balanco ?? []) as any[]),
  ];

  // ── Prune de contas sintéticas (pais) para evitar dupla contagem ─────
  // Se existe 7110100017, então 7 / 71 / 711 / 711010 são pais e devem ser ignorados.
  const normCode = (c?: string) => String(c || "").replace(/\s+/g, "").replace(/\.+$/g, "");
  const allCodes = new Set(allRows.map(r => normCode(r.conta)).filter(Boolean));
  const parentCodes = new Set<string>();
  for (const c of allCodes) {
    for (const other of allCodes) {
      if (other.length > c.length && other.startsWith(c)) {
        const next = other.charAt(c.length);
        if (/[0-9.]/.test(next) || c.endsWith(".")) { parentCodes.add(c); break; }
      }
    }
  }
  const leafRows = allRows.filter(r => {
    const c = normCode(r.conta);
    return !c || !parentCodes.has(c);
  });

  for (const row of leafRows) {
    const ref1 = (row.ref1 as string | undefined) ?? (row.refCapital as string | undefined) ?? inferRefByCode(row.conta) ?? null;
    const valuesObj = row.values || {};
    const periodKeys = Object.keys(valuesObj);

    for (const period of periodKeys) {
      const value = valuesObj[period];
      const key = resolveKey({
        descricao: row.descricao,
        conta: row.conta,
        ref1,
        saldo: Number(value) || 0,
      });
      if (!key) continue;

      // Resolve mesKey: NUNCA replicar o saldo de 1 período em N meses do usuário —
      // isso causa alucinação (mesmo valor repetido). Quando o parser só trouxe 1
      // período e há múltiplos meses do usuário, aplicamos APENAS ao primeiro mês
      // e marcamos os demais com erro explicativo (visível na aba BS & Dados).
      let targetKeys: string[];
      if (useUser && periodKeys.length <= 1 && userMesKeys.length > 0) {
        targetKeys = [userMesKeys[0]];
      } else {
        targetKeys = [periodToMesKey(period)];
      }

      for (const mesKey of targetKeys) {
        const target = rowsByMes.get(mesKey);
        const buckets = bucketsByMes.get(mesKey);
        if (!target || !buckets) continue;
        applyValue(target, key, Number(value) || 0, ref1, buckets);
      }
    }
  }

  // (legado: variável allRows mantida para o bloco abaixo)
  void leafRows;


  // Marca meses sem dados reais quando o parser só extraiu 1 período
  if (allRows.length > 0) {
    const allPeriodKeys = new Set<string>();
    for (const r of allRows) for (const k of Object.keys(r.values || {})) allPeriodKeys.add(k);
    if (allPeriodKeys.size <= 1 && userMesKeys.length > 1) {
      const applied = userMesKeys[0];
      for (const mk of userMesKeys.slice(1)) {
        const t = rowsByMes.get(mk);
        if (!t) continue;
        const msg = `Sem dados extraídos para este mês — o balancete só forneceu valores para ${applied}. Recarregue o balancete correspondente para evitar inferência.`;
        if (!t.errors.includes(msg)) t.errors.push(msg);
      }
    }
  }

  // Se balancete não trouxe linha totalizadora "ATIVO/PASSIVO CIRCULANTE",
  // usa a soma dos componentes (Refs A..O / AA..II1) como derivado.
  for (const [mesKey, target] of rowsByMes) {
    const b = bucketsByMes.get(mesKey)!;
    if (!b.sawACTotal && b.ac > 0) target.ativo_circulante = b.ac;
    if (!b.sawPCTotal && b.pc > 0) target.passivo_circulante = b.pc;
  }

  const sortedRows = Array.from(rowsByMes.values())
    .map(r => finalize(r, bucketsByMes.get(r.mesKey)))
    .sort((a, b) => a.mesKey.localeCompare(b.mesKey));

  // ── AJUSTE DE ACUMULADO (Mês vs Acumulado Ano) ──
  // Conforme solicitado: Contas de resultado (Grupos 3 a 8) zeram no final do ano.
  // Se o mês N e N-1 são do mesmo ano, o valor do mês N = Saldo(N) - Saldo(N-1).
  // IMPORTANTE: Este ajuste só deve ser aplicado se os dados extraídos forem ACUMULADOS do ano.
  // Se forem dados mensais puros (Delta), a subtração geraria valores incorretos.
  // Heurística de Acumulado: se a receita do mês N é significativamente maior (>30%) que a do mês N-1 em todos os meses,
  // ou se todos os meses subsequentes apresentam crescimento na receita líquida, assumimos que os dados estão acumulados.
  let isAccumulated = false;
  if (sortedRows.length > 1) {
    let consistentIncrease = 0;
    for (let i = 1; i < sortedRows.length; i++) {
      // Verifica se houve aumento consistente na Receita Líquida (característica de acumulado ano)
      if (sortedRows[i].receita_liquida >= sortedRows[i-1].receita_liquida) consistentIncrease++;
    }
    // Se mais de 75% dos meses apresentam crescimento ou estabilidade na receita, tratamos como acumulado
    if (consistentIncrease >= (sortedRows.length - 1) * 0.75) isAccumulated = true;
  }

  if (isAccumulated) {
    for (let i = sortedRows.length - 1; i > 0; i--) {
      const current = sortedRows[i];
      const previous = sortedRows[i - 1];
      
      const currentYear = current.mesKey.split("-")[0];
      const previousYear = previous.mesKey.split("-")[0];
      
      if (currentYear === previousYear) {
        current.receita_liquida = Math.max(0, current.receita_liquida - previous.receita_liquida);
        current.cmv = -(Math.abs(current.cmv) - Math.abs(previous.cmv));
        current.despesas = -(Math.abs(current.despesas) - Math.abs(previous.despesas));
        current.resultado = current.resultado - previous.resultado;
      }
    }
  }

  return sortedRows;
}

// ─── INDICADORES DERIVADOS ───────────────────────────────
const safeDiv = (a: number, b: number): number | null =>
  !b || !Number.isFinite(b) || b === 0 ? null : a / b;

export function computeBSIndicators(r: BSDadosRow) {
  return {
    cmv_percent: safeDiv(Math.abs(r.cmv), r.receita_liquida),
    despesa_percent: safeDiv(Math.abs(r.despesas), r.receita_liquida),
    cmv_despesa_percent: safeDiv(Math.abs(r.cmv) + Math.abs(r.despesas), r.receita_liquida),
    resultado_percent: safeDiv(r.resultado, r.receita_liquida),
    liquidez_corrente: safeDiv(r.ativo_circulante, r.passivo_circulante),
    liquidez_seca: safeDiv(r.ativo_circulante - r.estoques, r.passivo_circulante),
    liquidez_imediata: safeDiv(r.disponivel, r.passivo_circulante),
  };
}

// ─── EXPORT XLSX (CSV simples — sem dependência) ─────────
export function exportBSDadosToCSV(rows: BSDadosRow[]): string {
  const headers = [
    "Mês","Receita Líquida","CMV","Despesas","Resultado",
    "Ativo Circulante","Passivo Circulante","Estoques","Disponível",
    "Dívida Tributária","Dívida Trabalhista","Dívida Financeira",
    "Fornecedores","Credores RJ","Dívida Total",
  ];
  const lines = [headers.join(";")];
  for (const r of rows) {
    lines.push([
      r.mes,
      r.receita_liquida, r.cmv, r.despesas, r.resultado,
      r.ativo_circulante, r.passivo_circulante, r.estoques, r.disponivel,
      r.divida_tributaria, r.divida_trabalhista, r.divida_financeira,
      r.fornecedores, r.credores_rj, r.divida_total,
    ].map(v => typeof v === "number" ? v.toFixed(2).replace(".", ",") : v).join(";"));
  }
  return lines.join("\n");
}
