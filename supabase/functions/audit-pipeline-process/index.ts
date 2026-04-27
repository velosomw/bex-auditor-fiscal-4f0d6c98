// Audit Pipeline Process — Pré-processamento inteligente de balancetes
// Stack: Lovable AI Gateway (chat/JSON) + Supabase Postgres.
//
// Quick Wins aplicados (v2):
//   1. Cache em memória (hash da descrição) → evita LLM calls repetidos
//   2. Paralelismo aumentado (CHUNK_SIZE 80, MAX_PARALLEL 6)
//   3. Deduplicação pré-LLM (descrições idênticas processadas 1x)
//   4. Heurística PL melhorada (Capital Social / Reservas / Lucros / Prejuízos)
//   5. Logging estruturado por estágio (timestamps + métricas)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

interface BalanceteRow {
  conta: string;
  descricao: string;
  values: Record<string, number>;
}

interface PipelineRequest {
  company_id?: string;
  document_id?: string;
  file_name: string;
  ocr_score?: number;
  balanco: BalanceteRow[];
  dre: BalanceteRow[];
  documentInfo?: { empresa?: string; periodo?: string; tipo?: string };
}

type NormResult = { conta_normalizada: string; categoria: string; tipo: string; matched: boolean };

/* ──────────────── Logging estruturado (Quick Win 5) ──────────────── */
function stageLog(reqId: string, stage: string, extra: Record<string, unknown> = {}) {
  console.log(JSON.stringify({ reqId, stage, ts: new Date().toISOString(), ...extra }));
}

/* ──────────────── Cache em memória global (Quick Win 1) ──────────────── */
// Persiste entre invocações enquanto a edge instance estiver quente
const NORMALIZE_CACHE = new Map<string, NormResult>();
const CACHE_MAX = 5000;

function cacheKey(desc: string): string {
  return (desc || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function cacheGet(desc: string): NormResult | undefined {
  return NORMALIZE_CACHE.get(cacheKey(desc));
}

function cacheSet(desc: string, val: NormResult) {
  if (NORMALIZE_CACHE.size >= CACHE_MAX) {
    // FIFO simples: remove o primeiro
    const firstKey = NORMALIZE_CACHE.keys().next().value;
    if (firstKey) NORMALIZE_CACHE.delete(firstKey);
  }
  NORMALIZE_CACHE.set(cacheKey(desc), val);
}

/* ──────────────── Heurística PL melhorada (Quick Win 4) ──────────────── */
function classifyAccount(desc: string): { tipo: string; categoria: string } {
  const d = (desc || "").toLowerCase();

  // PL — DETECÇÃO PRIORITÁRIA (antes de receita/despesa para evitar "lucros" virar receita)
  if (
    /(capital\s*social|capital\s*subscrito|capital\s*integraliz|capital\s*a\s*integraliz)/.test(d) ||
    /(reserva\s*(legal|estatut|capital|lucro|reavaliaç))/.test(d) ||
    /(lucros?\s*(acumulad|a\s*distribu|do\s*exerc))/.test(d) ||
    /(preju[ií]zos?\s*acumulad)/.test(d) ||
    /(patrim[oô]nio\s*l[ií]quido|patrimonio\s*liquido)/.test(d) ||
    /(a[çc][oõ]es?\s*em\s*tesouraria|ações\s*em\s*tesouraria)/.test(d) ||
    /(ajustes?\s*de\s*avalia[çc][aã]o)/.test(d)
  ) {
    return { tipo: "pl", categoria: "patrimonio_liquido" };
  }

  if (/(receita|venda|faturamento)/.test(d)) return { tipo: "receita", categoria: "receita" };
  if (/(custo|cmv)/.test(d)) return { tipo: "despesa", categoria: "custo" };
  if (/(despesa|gasto)/.test(d)) return { tipo: "despesa", categoria: "despesa" };
  if (/(imobilizado|intangivel|investiment|longo prazo|nao circulante|não circulante)/.test(d))
    return { tipo: "ativo", categoria: "ativo_nao_circulante" };
  if (/(caixa|banco|aplica|cliente|estoque|recebe|circulante|duplicat)/.test(d))
    return { tipo: "ativo", categoria: "ativo_circulante" };
  if (/(exigivel.*longo|passivo.*nao.*circulante|passivo.*não.*circulante|financiamento.*longo)/.test(d))
    return { tipo: "passivo", categoria: "passivo_nao_circulante" };
  if (/(fornecedor|emprestimo|financiamento|salario|imposto a pagar|factoring|fidc|duplicat.*descont|obrigac)/.test(d))
    return { tipo: "passivo", categoria: "passivo_circulante" };
  return { tipo: "ativo", categoria: "ativo_circulante" };
}

/* ──────────────── Classificação por código de conta brasileiro ────────────────
   Plano de contas padrão BR:
   1.x = Ativo  | 2.x = Passivo + PL  | 3.x = Receita  | 4.x = Custo/Despesa
   Subdivisão típica: 2.1/2.2 = Passivo, 2.3/2.4/2.5 = PL */
function classifyByCode(conta: string): { tipo: string; categoria: string } | null {
  const c = String(conta || "").trim().replace(/[\s\-]+/g, ".");
  if (!c) return null;
  const first = c.charAt(0);
  const second = c.charAt(2); // após o primeiro ponto
  if (first === "1") {
    // Ativo: 1.1/1.2 = circulante, 1.3+ = não circulante
    if (second === "1" || second === "2") return { tipo: "ativo", categoria: "ativo_circulante" };
    return { tipo: "ativo", categoria: "ativo_nao_circulante" };
  }
  if (first === "2") {
    // PL: 2.3, 2.4, 2.5 (Capital, Reservas, Lucros)
    if (second === "3" || second === "4" || second === "5") {
      return { tipo: "pl", categoria: "patrimonio_liquido" };
    }
    if (second === "1") return { tipo: "passivo", categoria: "passivo_circulante" };
    if (second === "2") return { tipo: "passivo", categoria: "passivo_nao_circulante" };
    return { tipo: "passivo", categoria: "passivo_circulante" };
  }
  if (first === "3") return { tipo: "receita", categoria: "receita" };
  if (first === "4") return { tipo: "despesa", categoria: "despesa" };
  if (first === "5") return { tipo: "despesa", categoria: "custo" };
  return null;
}

/* ──────────────── Normalização semântica em lote via LLM ──────────────── */
const CHUNK_SIZE = 80; // Quick Win 2: era 40
const MAX_PARALLEL = 6; // Quick Win 2: era 4

async function normalizeChunk(
  rows: Array<{ conta: string; descricao: string }>,
  dictText: string,
): Promise<NormResult[]> {
  const inputList = rows.map((r, i) => `${i}. ${r.descricao || r.conta}`).join("\n");

  const systemPrompt = `Você é um CONTADOR ESPECIALISTA em classificação contábil brasileira (CPC/IFRS/NBC TA/Lei 6.404/76).

TAREFA: Padronizar e classificar contas de um balancete usando SIMILARIDADE SEMÂNTICA (não literal).

REGRAS CRÍTICAS:
1. Para cada conta, retorne:
   - conta_normalizada: termo padrão consolidado (ex.: "Bcos c/Mvto" → "Bancos Conta Movimento"; "Dupl. Desct." → "Duplicatas Descontadas")
   - categoria: uma de [ativo_circulante, ativo_nao_circulante, passivo_circulante, passivo_nao_circulante, patrimonio_liquido, receita, custo, despesa]
   - tipo: uma de [ativo, passivo, pl, receita, despesa]
   - matched: true se mapeou via dicionário/exemplo, false se inferiu por contexto
2. ATENÇÃO ESPECIAL AO PATRIMÔNIO LÍQUIDO: Capital Social, Reservas (Legal/Estatutária/Capital/Lucros), Lucros Acumulados, Lucros do Exercício, Prejuízos Acumulados, Ajustes de Avaliação Patrimonial, Ações em Tesouraria → SEMPRE tipo="pl", categoria="patrimonio_liquido". NUNCA classifique "Lucros Acumulados" como receita.
3. Use SIMILARIDADE SEMÂNTICA — contas equivalentes devem ter o MESMO termo padrão.
4. NÃO invente categorias novas.
5. Sinais de risco: factoring, FIDC, duplicatas descontadas → categoria correta + termo padronizado.
6. Mantenha a MESMA ORDEM das contas de entrada.

DICIONÁRIO CONTÁBIL DE REFERÊNCIA:
${dictText || "(vazio — use seu conhecimento contábil)"}`;

  const userPrompt = `Normalize estas ${rows.length} contas mantendo EXATAMENTE a mesma ordem do input:\n\n${inputList}\n\nRetorne via tool call return_normalized_accounts.`;

  const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash-lite",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "return_normalized_accounts",
            description: "Retorna lista de contas normalizadas na mesma ordem do input.",
            parameters: {
              type: "object",
              properties: {
                accounts: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      conta_normalizada: { type: "string" },
                      categoria: {
                        type: "string",
                        enum: [
                          "ativo_circulante",
                          "ativo_nao_circulante",
                          "passivo_circulante",
                          "passivo_nao_circulante",
                          "patrimonio_liquido",
                          "receita",
                          "custo",
                          "despesa",
                        ],
                      },
                      tipo: {
                        type: "string",
                        enum: ["ativo", "passivo", "pl", "receita", "despesa"],
                      },
                      matched: { type: "boolean" },
                    },
                    required: ["conta_normalizada", "categoria", "tipo", "matched"],
                    additionalProperties: false,
                  },
                },
              },
              required: ["accounts"],
              additionalProperties: false,
            },
          },
        },
      ],
      tool_choice: { type: "function", function: { name: "return_normalized_accounts" } },
    }),
  });

  if (!r.ok) {
    console.warn("LLM normalize HTTP", r.status, (await r.text()).slice(0, 300));
    return rows.map((row) => {
      const { tipo, categoria } = classifyAccount(row.descricao || row.conta);
      return { conta_normalizada: row.descricao || row.conta, categoria, tipo, matched: false };
    });
  }

  try {
    const j = await r.json();
    const tc = j.choices?.[0]?.message?.tool_calls?.[0];
    const args = JSON.parse(tc?.function?.arguments || "{}");
    const accounts = Array.isArray(args.accounts) ? (args.accounts as NormResult[]) : [];

    // Tolerante: alinha por índice. Se LLM retornou menos/mais, completa com heurística.
    if (accounts.length !== rows.length) {
      console.warn(`LLM normalize size mismatch: ${accounts.length} vs ${rows.length} — usando alinhamento parcial + fallback heurístico`);
    }

    return rows.map((row, i) => {
      const llm = accounts[i];
      if (llm && llm.conta_normalizada && llm.tipo && llm.categoria) {
        return llm;
      }
      const { tipo, categoria } = classifyAccount(row.descricao || row.conta);
      return { conta_normalizada: row.descricao || row.conta, categoria, tipo, matched: false };
    });
  } catch (e) {
    console.warn("LLM normalize parse error", e);
    return rows.map((row) => {
      const { tipo, categoria } = classifyAccount(row.descricao || row.conta);
      return { conta_normalizada: row.descricao || row.conta, categoria, tipo, matched: false };
    });
  }
}

/* Wrapper: cache + dedup + chunk + paralelização (Quick Wins 1, 2, 3) */
async function normalizeAccountsLLM(
  rows: Array<{ conta: string; descricao: string }>,
  // deno-lint-ignore no-explicit-any
  dictionary: any[],
  reqId: string,
): Promise<NormResult[]> {
  if (rows.length === 0) return [];

  const dictText = (dictionary || [])
    .slice(0, 80)
    .map((d) => `- "${d.termo_original}" → "${d.termo_padrao}" [${d.categoria}]`)
    .join("\n");

  // Resultado final por índice
  const finalResults: NormResult[] = new Array(rows.length);

  // Quick Win 1+3: cache lookup + dedup
  const uniqueByDesc = new Map<string, { row: { conta: string; descricao: string }; indices: number[] }>();
  let cacheHits = 0;

  rows.forEach((row, idx) => {
    const desc = row.descricao || row.conta;
    const cached = cacheGet(desc);
    if (cached) {
      finalResults[idx] = cached;
      cacheHits++;
      return;
    }
    const key = cacheKey(desc);
    const existing = uniqueByDesc.get(key);
    if (existing) {
      existing.indices.push(idx);
    } else {
      uniqueByDesc.set(key, { row, indices: [idx] });
    }
  });

  const uniqueRows = Array.from(uniqueByDesc.values()).map((v) => v.row);
  const dedupSavings = rows.length - cacheHits - uniqueRows.length;

  stageLog(reqId, "normalize.dedup", {
    total: rows.length,
    cache_hits: cacheHits,
    unique_to_process: uniqueRows.length,
    dedup_savings: dedupSavings,
  });

  if (uniqueRows.length === 0) {
    stageLog(reqId, "normalize.complete", { llm_calls: 0, source: "100%_cache" });
    return finalResults;
  }

  // Chunkifica + paraleliza (Quick Win 2)
  const chunks: Array<{ conta: string; descricao: string }[]> = [];
  for (let i = 0; i < uniqueRows.length; i += CHUNK_SIZE) {
    chunks.push(uniqueRows.slice(i, i + CHUNK_SIZE));
  }

  stageLog(reqId, "normalize.llm_start", {
    chunks: chunks.length,
    chunk_size: CHUNK_SIZE,
    max_parallel: MAX_PARALLEL,
    waves: Math.ceil(chunks.length / MAX_PARALLEL),
  });

  const t0 = Date.now();
  const allLLMResults: NormResult[] = [];
  for (let i = 0; i < chunks.length; i += MAX_PARALLEL) {
    const wave = chunks.slice(i, i + MAX_PARALLEL);
    const settled = await Promise.all(wave.map((c) => normalizeChunk(c, dictText)));
    settled.forEach((s) => allLLMResults.push(...s));
  }
  stageLog(reqId, "normalize.llm_done", {
    duration_ms: Date.now() - t0,
    llm_processed: allLLMResults.length,
  });

  // Distribui resultado LLM para todos os índices (cache + originais)
  uniqueRows.forEach((row, i) => {
    const desc = row.descricao || row.conta;
    const result = allLLMResults[i];
    if (!result) return;
    cacheSet(desc, result);
    const entry = uniqueByDesc.get(cacheKey(desc));
    entry?.indices.forEach((idx) => {
      finalResults[idx] = result;
    });
  });

  // Garante que nenhum índice fica vazio (fallback heurístico)
  rows.forEach((row, idx) => {
    if (!finalResults[idx]) {
      const { tipo, categoria } = classifyAccount(row.descricao || row.conta);
      finalResults[idx] = {
        conta_normalizada: row.descricao || row.conta,
        categoria,
        tipo,
        matched: false,
      };
    }
  });

  return finalResults;
}

/* ──────────────── Limpeza de balancete: remove sintéticas e deduplica ────────────────
   Problemas comuns no parsing de balancetes Excel:
   1. Hierarquia (1.1.01 totaliza 1.1.01.001+1.1.01.002) → soma dupla
   2. Linhas sintéticas com descrição genérica ("Ativo", "Passivo Circulante", "DRE")
   3. Excel mal formatado: mesma conta aparece como [código] + [descrição] em linhas separadas
      com valores idênticos → soma dupla
   Esta função aplica 3 filtros em sequência. */
/* Opções de deduplicação por tipo/escala de dado.
   - dataKind: 'balanco' (BRL) | 'dre' (BRL) | 'indice' (índices/percentuais) | 'unidade' (R$ mil/milhão) | 'auto'
   - eps: tolerância absoluta para considerar dois valores "iguais"
   - decimals: precisão de arredondamento ao calcular a chave de valor
   - proxWindow: janela de proximidade (linhas adjacentes) para considerar duplicata
   - relTol: tolerância RELATIVA (ex.: 1e-4 = 0,01%) — adicional ao eps absoluto.
   Quando 'auto', os parâmetros são derivados da magnitude mediana dos valores:
     |mediana| < 1         → eps=1e-4, decimals=4 (índices)
     |mediana| < 1.000     → eps=1e-2, decimals=2 (BRL pequeno)
     |mediana| < 1.000.000 → eps=1e-2, decimals=2 (BRL padrão)
     |mediana| ≥ 1.000.000 → eps=1,    decimals=0 (BRL grande / R$ mil-milhão)
   relTol fixo em 1e-5 quando auto. */
export type DedupDataKind = "balanco" | "dre" | "indice" | "unidade" | "auto";
export interface DedupOptions {
  dataKind?: DedupDataKind;
  eps?: number;
  decimals?: number;
  proxWindow?: number;
  relTol?: number;
}

function resolveDedupParams(
  values: number[],
  opts: DedupOptions,
): { eps: number; decimals: number; proxWindow: number; relTol: number; scale: string } {
  const proxWindow = opts.proxWindow ?? 3;

  // Overrides explícitos vencem qualquer auto-detecção
  if (opts.eps !== undefined && opts.decimals !== undefined) {
    return {
      eps: opts.eps,
      decimals: opts.decimals,
      proxWindow,
      relTol: opts.relTol ?? 0,
      scale: "manual",
    };
  }

  // Presets por tipo de dado
  const kind = opts.dataKind ?? "auto";
  const presets: Record<Exclude<DedupDataKind, "auto">, { eps: number; decimals: number; relTol: number }> = {
    balanco: { eps: 0.01, decimals: 2, relTol: 1e-5 },
    dre: { eps: 0.01, decimals: 2, relTol: 1e-5 },
    indice: { eps: 1e-4, decimals: 4, relTol: 1e-4 },
    unidade: { eps: 1, decimals: 0, relTol: 1e-5 },
  };

  if (kind !== "auto") {
    const p = presets[kind];
    return {
      eps: opts.eps ?? p.eps,
      decimals: opts.decimals ?? p.decimals,
      proxWindow,
      relTol: opts.relTol ?? p.relTol,
      scale: kind,
    };
  }

  // AUTO: deriva da magnitude mediana
  const abs = values.map((v) => Math.abs(Number(v) || 0)).filter((v) => v > 0);
  if (abs.length === 0) {
    return { eps: opts.eps ?? 0.01, decimals: opts.decimals ?? 2, proxWindow, relTol: opts.relTol ?? 1e-5, scale: "auto:empty" };
  }
  abs.sort((a, b) => a - b);
  const median = abs[Math.floor(abs.length / 2)];

  let eps: number, decimals: number, scale: string;
  if (median < 1) {
    eps = 1e-4; decimals = 4; scale = "auto:indice";
  } else if (median < 1_000) {
    eps = 0.01; decimals = 2; scale = "auto:brl-small";
  } else if (median < 1_000_000) {
    eps = 0.01; decimals = 2; scale = "auto:brl";
  } else {
    eps = 1; decimals = 0; scale = "auto:brl-large";
  }
  return {
    eps: opts.eps ?? eps,
    decimals: opts.decimals ?? decimals,
    proxWindow,
    relTol: opts.relTol ?? 1e-5,
    scale,
  };
}

function cleanBalanceteRows<T extends { conta: string; descricao: string; values: Record<string, number> }>(
  rows: T[],
  opts: DedupOptions = {},
): T[] {
  if (rows.length === 0) return rows;

  // FILTRO 1: hierarquia por código
  const normalize = (c: string) => String(c || "").trim().replace(/[\s\-]+/g, ".").replace(/\.+/g, ".");
  const codes = rows.map((r) => normalize(r.conta));
  const hasHierarchy = codes.some((c) => c.includes("."));
  let step1 = rows;
  if (hasHierarchy) {
    const codeSet = new Set(codes.filter(Boolean));
    step1 = rows.filter((r) => {
      const c = normalize(r.conta);
      if (!c) return true;
      for (const other of codeSet) {
        if (other !== c && other.startsWith(c + ".")) return false;
      }
      return true;
    });
  }

  // FILTRO 2: descrições sintéticas/totalizadoras genéricas
  const SYNTHETIC_PATTERNS = [
    /^ativo$/i,
    /^ativo\s+(circulante|n[aã]o\s+circulante|total)$/i,
    /^passivo$/i,
    /^passivo\s+(circulante|n[aã]o\s+circulante|total)$/i,
    /^patrim[oô]nio\s+l[ií]quido$/i,
    /^total\s+do?\s+(ativo|passivo|patrim[oô]nio)/i,
    /^total\s+geral/i,
    /^demonstra[çc][aã]o\s+de?\s+resultado/i,
    /^demonstrativo\s+de?\s+resultado/i,
    /^dre$/i,
    /^receita\s+(bruta|l[ií]quida|total|operacional)$/i,
    /^despesa\s+(total|operacional)$/i,
    /^resultado\s+(bruto|operacional|antes|do\s+exerc[ií]cio|l[ií]quido)/i,
    /^lucro\s+(bruto|operacional|antes|do\s+exerc[ií]cio|l[ií]quido)/i,
    /^subtotal/i,
    /^totaliza/i,
  ];
  const step2 = step1.filter((r) => {
    const d = String(r.descricao || "").trim();
    return !SYNTHETIC_PATTERNS.some((p) => p.test(d));
  });

  // FILTRO 3: deduplicação robusta por chave composta + janela de proximidade
  // Chave de identidade: (código_normalizado, descrição_normalizada, valor_arredondado)
  // Critério de proximidade: só considera duplicata se aparecer dentro de PROX_WINDOW linhas,
  // evitando colapsar contas distintas que coincidentemente têm o mesmo valor em pontos
  // muito separados do balancete (ex.: dois empréstimos diferentes com saldo idêntico).
  const lastYear = (() => {
    const years = Object.keys(step2[0]?.values || {});
    return years.sort().reverse()[0] || "_";
  })();
  const EPS = 0.01;
  const PROX_WINDOW = 3; // linhas adjacentes consideradas "mesma conta repetida pelo parser"

  const normCode = (s: string) =>
    String(s || "").trim().toLowerCase().replace(/[\s\-]+/g, ".").replace(/\.+/g, ".");
  const normDesc = (s: string) =>
    String(s || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  const isCodeLike = (s: string) => {
    const t = String(s || "").trim();
    return !t || /^\d+$/.test(t) || t.length < 4;
  };
  const descRichness = (s: string) => {
    const t = normDesc(s);
    if (!t) return 0;
    if (/^\d+$/.test(t)) return 1; // só dígitos
    return t.split(/\s+/).filter(Boolean).length + 2; // # de palavras
  };

  type Indexed = { row: T; idx: number; code: string; desc: string; valR: number };
  const indexed: Indexed[] = step2.map((row, idx) => ({
    row,
    idx,
    code: normCode(row.conta),
    desc: normDesc(row.descricao),
    valR: Math.round((Number(row.values?.[lastYear] || 0)) * 100) / 100,
  }));

  // Conjunto de índices a remover
  const dropped = new Set<number>();
  // Map de chave forte → primeiro índice já mantido (dentro da janela)
  // Chave forte: code + "|" + desc + "|" + val (todas obrigatórias e não vazias)
  // Chave fraca: usada apenas para o caso "código vs descrição em linhas vizinhas"
  for (let i = 0; i < indexed.length; i++) {
    if (dropped.has(i)) continue;
    const a = indexed[i];
    const aHasCode = !!a.code;
    const aHasDesc = !!a.desc && !isCodeLike(a.row.descricao);

    for (let j = i + 1; j < Math.min(indexed.length, i + 1 + PROX_WINDOW); j++) {
      if (dropped.has(j)) continue;
      const b = indexed[j];

      // Sem valor → não considera duplicata por valor
      if (a.valR === 0 || b.valR === 0) continue;
      if (Math.abs(a.valR - b.valR) >= EPS) continue;

      const bHasCode = !!b.code;
      const bHasDesc = !!b.desc && !isCodeLike(b.row.descricao);

      // CASO 1 — Chave forte: mesmo código + mesma descrição + mesmo valor → duplicata exata
      if (aHasCode && bHasCode && a.code === b.code && aHasDesc && bHasDesc && a.desc === b.desc) {
        dropped.add(j);
        continue;
      }

      // CASO 2 — Mesmo código (não vazio) + mesmo valor + descrições compatíveis
      // (uma é prefixo da outra, ou uma é vazia/code-like)
      if (aHasCode && bHasCode && a.code === b.code) {
        const oneEmpty = !aHasDesc || !bHasDesc;
        const oneContainsOther =
          aHasDesc && bHasDesc && (a.desc.includes(b.desc) || b.desc.includes(a.desc));
        if (oneEmpty || oneContainsOther) {
          // Mantém a linha com descrição mais rica
          const keepA = descRichness(a.row.descricao) >= descRichness(b.row.descricao);
          dropped.add(keepA ? j : i);
          if (!keepA) break; // i foi descartado, próximo i
          continue;
        }
      }

      // CASO 3 — Artefato típico do Excel: linha [só código] + linha [só descrição]
      // adjacentes (j === i+1) com mesmo valor → 2 linhas representam a MESMA conta.
      // Só aplica para vizinhos imediatos para não colapsar contas distintas.
      if (j === i + 1) {
        const aIsCodeOnly = isCodeLike(a.row.descricao);
        const bIsCodeOnly = isCodeLike(b.row.descricao);
        if (aIsCodeOnly !== bIsCodeOnly) {
          // Mantém a com descrição textual; descarta a só-código
          if (aIsCodeOnly) {
            dropped.add(i);
            break;
          } else {
            dropped.add(j);
            continue;
          }
        }
      }

      // Caso contrário: NÃO deduplica (contas distintas que coincidem em valor)
    }
  }

  const step3 = indexed.filter((x) => !dropped.has(x.idx)).map((x) => x.row);
  return step3;
}

/* ──────────────── Validador contábil ──────────────── */
function validateBalanco(rows: Array<{ valor: number; tipo: string }>): {
  valid: boolean;
  ativo: number;
  passivo: number;
  pl: number;
  diff: number;
  alertas: string[];
} {
  // Soma com sinal preservado (não usar Math.abs — perde compensações de provisões/depreciações)
  const sum = (t: string) =>
    rows.filter((r) => r.tipo === t).reduce((a, b) => a + (Number(b.valor) || 0), 0);
  const ativo = Math.abs(sum("ativo"));
  const passivo = Math.abs(sum("passivo"));
  const pl = Math.abs(sum("pl"));
  const diff = Math.abs(ativo - (passivo + pl));
  const tolerance = Math.max(ativo * 0.02, 1000);
  const alertas: string[] = [];
  if (ativo === 0) alertas.push("Ativo total = 0 (verifique extração)");
  if (passivo + pl === 0) alertas.push("Passivo + PL = 0 (verifique extração)");
  if (diff > tolerance && ativo > 0) {
    alertas.push(
      `Equação contábil desbalanceada: Ativo (${ativo.toFixed(0)}) ≠ Passivo+PL (${(passivo + pl).toFixed(0)}). Diferença: ${diff.toFixed(0)}`,
    );
  }
  return { valid: diff <= tolerance, ativo, passivo, pl, diff, alertas };
}

/* ──────────────── Worker assíncrono (roda em background, sem idle timeout) ──────────────── */
async function runPipeline(
  reqId: string,
  body: PipelineRequest,
  documentId: string,
  // deno-lint-ignore no-explicit-any
  supabase: any,
  tStart: number,
) {
  try {
    // 2. Carregar dicionário
    const tDict = Date.now();
    const { data: dictionary } = await supabase
      .from("contabil_dictionary")
      .select("termo_original, termo_padrao, categoria")
      .limit(200);
    stageLog(reqId, "dictionary.loaded", {
      entries: dictionary?.length || 0,
      duration_ms: Date.now() - tDict,
    });

    // 3. Combinar balanço + DRE
    const allRowsRaw = [
      ...(body.balanco || []).map((r) => ({ ...r, _src: "balanco" as const })),
      ...(body.dre || []).map((r) => ({ ...r, _src: "dre" as const })),
    ];

    // 3.1 Filtrar contas sintéticas (totalizadoras) — manter apenas analíticas (folhas)
    // Evita dupla contagem hierárquica que inflava ativo em ~10x
    const balancoLeaves = cleanBalanceteRows(body.balanco || []);
    const dreLeaves = cleanBalanceteRows(body.dre || []);
    const allRows = [
      ...balancoLeaves.map((r) => ({ ...r, _src: "balanco" as const })),
      ...dreLeaves.map((r) => ({ ...r, _src: "dre" as const })),
    ];
    stageLog(reqId, "hierarchy.filtered", {
      raw_rows: allRowsRaw.length,
      leaf_rows: allRows.length,
      removed_synthetic: allRowsRaw.length - allRows.length,
    });

    if (allRows.length === 0) {
      await supabase
        .from("pipeline_documents")
        .update({ status: "failed", error_message: "Sem linhas para processar" })
        .eq("id", documentId);
      return;
    }

    const years = Object.keys(body.balanco?.[0]?.values || body.dre?.[0]?.values || { _: 0 });
    const lastYear = years.sort().reverse()[0] || "_";

    // 4. Normalização em lote
    const tNorm = Date.now();
    const normalized = await normalizeAccountsLLM(
      allRows.map((r) => ({ conta: r.conta, descricao: r.descricao })),
      dictionary || [],
      reqId,
    );
    stageLog(reqId, "normalize.total", { duration_ms: Date.now() - tNorm, rows: allRows.length });

    // 4.1 Override por código de conta (mais confiável que descrição)
    let mappedCount = 0;
    let codeOverrides = 0;
    const normalizedRows = allRows.map((row, i) => {
      const n = normalized[i];
      const byCode = classifyByCode(row.conta);
      // Código tem precedência: 1.x sempre é Ativo, 2.3+ sempre é PL, etc.
      const finalTipo = byCode?.tipo || n.tipo;
      const finalCat = byCode?.categoria || n.categoria;
      if (byCode && (byCode.tipo !== n.tipo || byCode.categoria !== n.categoria)) codeOverrides++;
      // mapping_score = % com classificação válida (matched OU código reconhecido)
      if (n.matched || byCode) mappedCount++;
      const valor = Number(row.values?.[lastYear] || 0);
      return {
        conta_original: row.descricao || row.conta,
        conta_normalizada: n.conta_normalizada,
        valor,
        tipo: finalTipo,
        categoria: finalCat,
        matched: n.matched || !!byCode,
      };
    });
    stageLog(reqId, "classification.done", {
      total: normalizedRows.length,
      mapped: mappedCount,
      code_overrides: codeOverrides,
    });

    // 5. Persistir balancete_data
    if (normalizedRows.length > 0) {
      const { error: bdErr } = await supabase.from("balancete_data").insert(
        normalizedRows.map((r) => ({
          document_id: documentId,
          conta_original: r.conta_original,
          conta_normalizada: r.conta_normalizada,
          valor: r.valor,
          tipo: r.tipo,
          categoria: r.categoria,
        })),
      );
      if (bdErr) console.warn("balancete_data insert warn:", bdErr.message);
    }

    // 6. Validação
    const validation = validateBalanco(normalizedRows);
    stageLog(reqId, "validation.done", {
      ativo: validation.ativo,
      passivo: validation.passivo,
      pl: validation.pl,
      diff: validation.diff,
      valid: validation.valid,
    });

    // 7. Score
    const ocrScore = Math.max(0, Math.min(1, body.ocr_score ?? 0.85));
    const mappingScore = normalizedRows.length > 0 ? mappedCount / normalizedRows.length : 0;
    const validationScore = validation.valid
      ? 1
      : Math.max(0, 1 - validation.diff / Math.max(validation.ativo, 1));
    const qualityScore = ocrScore * 0.3 + mappingScore * 0.3 + validationScore * 0.4;

    // 7.1 Indicadores financeiros derivados
    const sumByCat = (cat: string) =>
      normalizedRows
        .filter((r) => r.categoria === cat)
        .reduce((a, b) => a + Math.abs(Number(b.valor) || 0), 0);
    const ativoCirc = sumByCat("ativo_circulante");
    const ativoNaoCirc = sumByCat("ativo_nao_circulante");
    const passivoCirc = sumByCat("passivo_circulante");
    const passivoNaoCirc = sumByCat("passivo_nao_circulante");
    const receita = normalizedRows
      .filter((r) => r.tipo === "receita")
      .reduce((a, b) => a + Math.abs(Number(b.valor) || 0), 0);
    const despesa = normalizedRows
      .filter((r) => r.tipo === "despesa")
      .reduce((a, b) => a + Math.abs(Number(b.valor) || 0), 0);
    const resultado = receita - despesa;

    const indicadoresFinanceiros = {
      liquidez_corrente: passivoCirc > 0 ? +(ativoCirc / passivoCirc).toFixed(3) : null,
      endividamento_geral:
        validation.ativo > 0
          ? +((validation.passivo / validation.ativo) * 100).toFixed(2)
          : null,
      composicao_endividamento:
        validation.passivo > 0 ? +((passivoCirc / validation.passivo) * 100).toFixed(2) : null,
      margem_liquida: receita > 0 ? +((resultado / receita) * 100).toFixed(2) : null,
      roe: validation.pl > 0 ? +((resultado / validation.pl) * 100).toFixed(2) : null,
      receita_total: receita,
      despesa_total: despesa,
      resultado_periodo: resultado,
    };

    // 7.2 Análise contextual via LLM (Auditor Contábil Sênior IA)
    const tAnalysis = Date.now();
    let aiInsights: { resumo: string; pontos_atencao: string[]; recomendacoes: string[] } | null = null;
    try {
      const ctx = `Empresa: ${body.documentInfo?.empresa || "N/D"}
Período: ${body.documentInfo?.periodo || lastYear}

INDICADORES CONSOLIDADOS:
- Ativo Total: R$ ${validation.ativo.toLocaleString("pt-BR")}
- Passivo Total: R$ ${validation.passivo.toLocaleString("pt-BR")}
- Patrimônio Líquido: R$ ${validation.pl.toLocaleString("pt-BR")}
- Equação Contábil: ${validation.valid ? "BALANCEADA" : `DESBALANCEADA (Δ R$ ${validation.diff.toLocaleString("pt-BR")})`}

ESTRUTURA:
- Ativo Circulante: R$ ${ativoCirc.toLocaleString("pt-BR")}
- Ativo Não Circulante: R$ ${ativoNaoCirc.toLocaleString("pt-BR")}
- Passivo Circulante: R$ ${passivoCirc.toLocaleString("pt-BR")}
- Passivo Não Circulante: R$ ${passivoNaoCirc.toLocaleString("pt-BR")}

DRE:
- Receita: R$ ${receita.toLocaleString("pt-BR")}
- Despesa: R$ ${despesa.toLocaleString("pt-BR")}
- Resultado: R$ ${resultado.toLocaleString("pt-BR")}

ÍNDICES:
- Liquidez Corrente: ${indicadoresFinanceiros.liquidez_corrente ?? "N/D"}
- Endividamento Geral: ${indicadoresFinanceiros.endividamento_geral ?? "N/D"}%
- Composição Endividamento (curto prazo): ${indicadoresFinanceiros.composicao_endividamento ?? "N/D"}%
- Margem Líquida: ${indicadoresFinanceiros.margem_liquida ?? "N/D"}%
- ROE: ${indicadoresFinanceiros.roe ?? "N/D"}%`;

      const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            {
              role: "system",
              content: `Você é o Auditor Contábil Sênior IA da BEX Auditoria, especialista em análise financeira pelas normas CPC/IFRS/Lei 6.404/76 com foco em diagnóstico de solvência, recuperação judicial e governança corporativa. Seja direto, técnico e cite valores absolutos quando relevante. Limite cada item a 1 frase objetiva.`,
            },
            {
              role: "user",
              content: `Analise este balancete e retorne JSON via tool call:\n\n${ctx}`,
            },
          ],
          tools: [
            {
              type: "function",
              function: {
                name: "return_audit_insights",
                description: "Retorna análise contextual estruturada do auditor.",
                parameters: {
                  type: "object",
                  properties: {
                    resumo: {
                      type: "string",
                      description: "1-2 frases sobre saúde financeira geral.",
                    },
                    pontos_atencao: {
                      type: "array",
                      items: { type: "string" },
                      description: "3-5 alertas técnicos (liquidez, endividamento, margem, etc.)",
                    },
                    recomendacoes: {
                      type: "array",
                      items: { type: "string" },
                      description: "2-4 ações sugeridas pelo auditor.",
                    },
                  },
                  required: ["resumo", "pontos_atencao", "recomendacoes"],
                  additionalProperties: false,
                },
              },
            },
          ],
          tool_choice: { type: "function", function: { name: "return_audit_insights" } },
        }),
      });
      if (aiResp.ok) {
        const aj = await aiResp.json();
        const tc = aj.choices?.[0]?.message?.tool_calls?.[0];
        aiInsights = JSON.parse(tc?.function?.arguments || "null");
      } else {
        console.warn("ai insights HTTP", aiResp.status);
      }
    } catch (e) {
      console.warn("ai insights error:", e instanceof Error ? e.message : e);
    }
    stageLog(reqId, "ai_insights.done", {
      duration_ms: Date.now() - tAnalysis,
      has_insights: !!aiInsights,
    });

    // 8. Persistir analysis_results
    await supabase.from("pipeline_analysis_results").insert({
      document_id: documentId,
      indicadores: {
        ativo_total: validation.ativo,
        passivo_total: validation.passivo,
        pl: validation.pl,
        ativo_circulante: ativoCirc,
        ativo_nao_circulante: ativoNaoCirc,
        passivo_circulante: passivoCirc,
        passivo_nao_circulante: passivoNaoCirc,
        contas_total: normalizedRows.length,
        contas_mapeadas: mappedCount,
        ...indicadoresFinanceiros,
        ai_insights: aiInsights,
      },
      alertas: validation.alertas,
      ocr_score: ocrScore,
      mapping_score: mappingScore,
      validation_score: validationScore,
      quality_score: qualityScore,
    });

    await supabase.from("pipeline_documents").update({ status: "completed" }).eq("id", documentId);

    stageLog(reqId, "request.complete", {
      total_ms: Date.now() - tStart,
      quality_score: qualityScore,
      cache_size: NORMALIZE_CACHE.size,
    });
  } catch (e) {
    stageLog(reqId, "worker.error", { error: e instanceof Error ? e.message : String(e) });
    console.error("audit-pipeline-process worker error:", e);
    await supabase
      .from("pipeline_documents")
      .update({
        status: "failed",
        error_message: e instanceof Error ? e.message.slice(0, 500) : "Unknown error",
      })
      .eq("id", documentId);
  }
}

/* ──────────────── Handler (202 + background) ──────────────── */
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const reqId = crypto.randomUUID().slice(0, 8);
  const tStart = Date.now();

  try {
    const body: PipelineRequest = await req.json();
    stageLog(reqId, "request.received", {
      file: body.file_name,
      balanco_rows: body.balanco?.length || 0,
      dre_rows: body.dre?.length || 0,
      has_company: !!body.company_id,
      has_document: !!body.document_id,
    });

    const authHeader = req.headers.get("Authorization") || "";
    const jwt = authHeader.replace("Bearer ", "");
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: userData } = await supabase.auth.getUser(jwt);
    const userId = userData?.user?.id;
    if (!userId) {
      return new Response(JSON.stringify({ error: "Usuário não autenticado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 1. Registrar (ou reutilizar) documento — sincronamente
    let documentId: string;
    if (body.document_id) {
      const { data: existingDoc } = await supabase
        .from("pipeline_documents")
        .select("id")
        .eq("id", body.document_id)
        .maybeSingle();
      if (!existingDoc) throw new Error(`document_id ${body.document_id} não encontrado`);
      // deno-lint-ignore no-explicit-any
      documentId = (existingDoc as any).id;
      const updatePayload: Record<string, unknown> = { status: "normalizing" };
      if (body.company_id) updatePayload.company_id = body.company_id;
      await supabase.from("pipeline_documents").update(updatePayload).eq("id", documentId);
    } else {
      const { data: doc, error: docErr } = await supabase
        .from("pipeline_documents")
        .insert({
          company_id: body.company_id || null,
          file_name: body.file_name,
          file_type: body.file_name.split(".").pop() || "unknown",
          status: "normalizing",
          created_by: userId,
        })
        .select()
        .single();
      if (docErr || !doc) throw new Error(`Falha ao registrar documento: ${docErr?.message}`);
      // deno-lint-ignore no-explicit-any
      documentId = (doc as any).id;
    }
    stageLog(reqId, "document.ready", { document_id: documentId });

    // 2. Dispara worker em background (não bloqueia a resposta — sem idle timeout)
    // deno-lint-ignore no-explicit-any
    const edgeRt = (globalThis as any).EdgeRuntime;
    const workerPromise = runPipeline(reqId, body, documentId, supabase, tStart);
    if (edgeRt?.waitUntil) {
      edgeRt.waitUntil(workerPromise);
    } else {
      // Fallback local: apenas dispara sem await
      workerPromise.catch((e) => console.error("worker bg error:", e));
    }

    // 3. Retorna 202 imediatamente — cliente faz polling em pipeline_documents.status
    return new Response(
      JSON.stringify({
        status: "processing",
        document_id: documentId,
        req_id: reqId,
        message:
          "Documento enfileirado para processamento em background. Faça polling em pipeline_documents.status até 'completed' ou 'failed'.",
      }),
      { status: 202, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    stageLog(reqId, "request.error", { error: e instanceof Error ? e.message : String(e) });
    console.error("audit-pipeline-process error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
