# MD-PORT-04 — Extração de Documentos por IA e Roteamento de Modelos

> Documento de portabilidade exata (replicação bit-a-bit de comportamento) do subsistema de
> extração/OCR e roteamento de modelos de IA da plataforma BEx. Fonte de verdade: código real
> em `supabase/functions/_shared/{model-router.ts,ai-fetch.ts}`, `supabase/functions/audit-parse-pdf/index.ts`,
> `supabase/functions/audit-pipeline-process/index.ts`, `supabase/functions/document-ai-process/index.ts`,
> `supabase/functions/audit-analyze/index.ts` e `src/services/gestorIaCostService.ts`.

---

## 1. Visão geral do subsistema

O pipeline de IA da BEx é dividido em 4 estágios, cada um implementado como uma Supabase Edge
Function independente (Deno), todas chamando o **Lovable AI Gateway**
(`https://ai.gateway.lovable.dev/v1/chat/completions` e `/v1/embeddings`) autenticado via
`Authorization: Bearer ${LOVABLE_API_KEY}`:

1. **`audit-parse-pdf`** — OCR + extração estruturada de PDF/imagem via multimodal Gemini (envia o
   arquivo como `image_url` em base64 no próprio corpo da mensagem).
2. **`document-ai-process`** — pipeline alternativo de extração para formatos não-PDF (XLSX, CSV,
   DOCX, TXT) ou PDFs via Google Document AI (OCR dedicado), seguido de estruturação via Gemini.
3. **`audit-pipeline-process`** — motor canônico de reconciliação contábil (MD-001): normaliza
   descrições de contas via cache + dicionário + LLM em lote (tool calling), calcula hash de
   dedupe, persiste em `pipeline_documents`/`ocr_results`.
4. **`audit-analyze`** — motor multi-agente (5 agentes simulados em um único prompt) de análise de
   risco, Kanitz, Score RJ e relatório executivo; usa cache em 3 camadas (L0 DB exato, L1 dicionário
   exato, L2 embedding/RAG) antes de acionar o LLM (L3), reduzindo tokens.

Toda chamada ao gateway passa obrigatoriamente por `aiGatewayFetch` (retry/backoff) e, sempre que
o processo é multi-tarefa, o modelo é decidido por `selectModel()` do `model-router.ts`. Todo uso
de IA (tokens, requests, páginas) é registrado em `ai_usage_logs`, com custo calculado a partir de
`ai_cost_config` (client-side em `gestorIaCostService.ts` e server-side via trigger SQL
`calculate_ai_cost`).

---

## 2. Roteamento de modelos — `supabase/functions/_shared/model-router.ts`

### 2.1 Contrato de tipos

```ts
export type ProcessKey =
  | "ocr_parse"          // Leitura/parse de PDF, balancete, DRE
  | "structure_extract"  // Estruturação de dados via Document AI
  | "audit_insights"     // Geração de insights da auditoria
  | "risk_advanced"      // Análise de risco avançado (RJ, solvência)
  | "chat_assistant"     // Chat do Auditor IA
  | "embeddings"         // Vetorização para busca semântica
  | "report_generation"; // Geração de relatórios finais

export type Criticality = "low" | "medium" | "high";

export interface RoutingDecision {
  model: string;
  provider: "google" | "openai";
  serviceTag: string;
  reason: string;
  criticality: Criticality;
}
```

### 2.2 Matriz oficial de roteamento (`ROUTING_MATRIX`)

Regra geral do sistema: **padrão = Gemini** (custo baixo, multimodal, contexto longo); **GPT-4o**
é reservado para análise de risco avançado com criticidade alta.

| ProcessKey | low | medium | high |
|---|---|---|---|
| `ocr_parse` | `google/gemini-2.0-flash` (`gemini_2_flash`) | `google/gemini-2.0-flash` (`gemini_2_flash`) | `google/gemini-1.5-pro` (`gemini_pro`) |
| `structure_extract` | `google/gemini-2.0-flash` | `google/gemini-2.0-flash` | `google/gemini-1.5-pro` |
| `audit_insights` | `google/gemini-2.0-flash` | `google/gemini-1.5-pro` | `openai/gpt-4o` (`gpt4o`) |
| `risk_advanced` | `openai/gpt-4o-mini` (`gpt4o_mini`) | `openai/gpt-4o` | `openai/gpt-4o` |
| `chat_assistant` | `google/gemini-2.0-flash` | `google/gemini-2.0-flash` | `google/gemini-1.5-pro` |
| `embeddings` | `google/text-embedding-004` (`embedding`) | idem | idem |
| `report_generation` | `google/gemini-2.0-flash` | `google/gemini-1.5-pro` | `openai/gpt-4o` |

Observação de arquitetura: os modelos "LTS" declarados no roteador são `gemini-2.0-flash` e
`gemini-1.5-pro`. Na prática, alguns callers (histórico de evolução do produto, ver
`document-ai-process/index.ts` e `audit-pipeline-process/index.ts`) chamam diretamente
`google/gemini-2.5-flash` / `google/gemini-2.5-pro` sem passar pelo router — isso é uma
inconsistência conhecida do código-fonte legado e **deve ser preservada na réplica** (não
normalizar), pois a tabela `ai_cost_config` mantém entradas para ambas as famílias de nomes
(`gemini_2_flash`/`gemini_pro` E `gemini_2_5_flash`/`gemini_2_5_pro`, além de aliases hifenizados
`gemini-2.5-pro`, `gemini-2.5-flash`, `gemini-2.5-flash-lite`).

### 2.3 Fallback chain

```ts
export const MODEL_FALLBACK: Record<string, string[]> = {
  "google/gemini-1.5-pro":   ["openai/gpt-4o"],
  "google/gemini-2.0-flash": ["google/gemini-1.5-pro", "google/gemini-1.5-flash"],
  "openai/gpt-4o":           ["google/gemini-1.5-pro"],
};
```

Esta tabela é declarada mas **não é consumida automaticamente por `aiGatewayFetch`** (que apenas
faz retry no mesmo modelo). O único caller que implementa fallback real de *modelo diferente* é
`audit-pipeline-process/index.ts` → `normalizeChunk()`, que tenta `gemini-2.0-flash` e, se a
contagem de itens retornados não bater com o input, faz retry chamando `callLLMNormalize` com
`google/gemini-1.5-pro` explicitamente (não usa a tabela `MODEL_FALLBACK`).

### 2.4 Cálculo de criticidade — `computeCriticality(signals)`

```ts
export interface RiskSignals {
  balanceValid?: boolean;
  patrimonioLiquido?: number | null;
  liquidezCorrente?: number | null;
  endividamentoGeral?: number | null;
  kanitzScore?: number | null;
}

export function computeCriticality(signals: RiskSignals): Criticality {
  const reasons: string[] = [];
  if (signals.balanceValid === false) reasons.push("balanco_desbalanceado");
  if (typeof signals.patrimonioLiquido === "number" && signals.patrimonioLiquido <= 0) reasons.push("pl_negativo");
  if (typeof signals.liquidezCorrente === "number" && signals.liquidezCorrente < 1) reasons.push("liquidez_critica");
  if (typeof signals.endividamentoGeral === "number" && signals.endividamentoGeral > 80) reasons.push("endividamento_critico");
  if (typeof signals.kanitzScore === "number" && signals.kanitzScore < -3) reasons.push("kanitz_insolvencia");

  if (reasons.length >= 2) return "high";
  if (reasons.length === 1) return "medium";
  return "low";
}
```

Critérios de escalonamento (documentados no cabeçalho do arquivo):
- Balanço desbalanceado (Ativo ≠ Passivo + PL)
- Patrimônio Líquido negativo
- Liquidez Corrente < 1
- Endividamento Geral > 80%
- Score Kanitz < −3 (insolvência iminente)

2+ sinais → `high` (escala para GPT-4o onde aplicável); 1 sinal → `medium` (Gemini Pro); 0 sinais →
`low` (Gemini Flash, mais barato).

### 2.5 `selectModel(process, criticality, signals)`

```ts
export function selectModel(
  process: ProcessKey,
  criticality: Criticality = "medium",
  signals?: RiskSignals,
): RoutingDecision {
  const finalCriticality: Criticality = signals ? computeCriticality(signals) : criticality;
  const entry = ROUTING_MATRIX[process][finalCriticality];

  const force = (typeof Deno !== "undefined" ? Deno.env.get("BEX_FORCE_PROVIDER") : undefined) as
    | "google" | "openai" | undefined;

  let model = entry.model, provider = entry.provider, serviceTag = entry.serviceTag;
  let reason = `process=${process} criticality=${finalCriticality}`;

  if (force && force !== entry.provider) {
    const fallback =
      force === "openai"
        ? { model: "openai/gpt-5-mini", provider: "openai" as const, serviceTag: "gpt5_mini" }
        : { model: "google/gemini-3-flash-preview", provider: "google" as const, serviceTag: "gemini_flash" };
    model = fallback.model; provider = fallback.provider; serviceTag = fallback.serviceTag;
    reason += ` force=${force}`;
  }

  return { model, provider, serviceTag, reason, criticality: finalCriticality };
}
```

**Regras de replicação:**
- Se `signals` for passado, a criticidade é **sempre** recalculada por `computeCriticality`,
  ignorando o parâmetro `criticality` recebido.
- A variável de ambiente `BEX_FORCE_PROVIDER` (`"google"` | `"openai"`) força um override de
  emergência (kill-switch de custo). O modelo de override é fixo (`openai/gpt-5-mini` ou
  `google/gemini-3-flash-preview`), independentemente do `ProcessKey` original — isso é
  intencional (controle de custo emergencial) e deve ser preservado.
- Exemplo de uso real (`audit-parse-pdf/index.ts`):
  ```ts
  const decision = selectModel("ocr_parse", "medium");
  console.log(`[router] ocr_parse → ${decision.model} (${decision.reason})`);
  ```

---

## 3. `aiGatewayFetch` — retry/backoff — `supabase/functions/_shared/ai-fetch.ts`

### 3.1 Interface de opções

```ts
export interface AIFetchOptions {
  maxAttempts?: number;        // default 3
  baseDelayMs?: number;        // default 400
  maxDelayMs?: number;         // default 4000
  perAttemptTimeoutMs?: number;// default 120_000 (120s)
  label?: string;              // identificador de log
}

const RETRYABLE_STATUS = new Set([429, 502, 503, 504]);
```

Não retenta 4xx (exceto 429) nem respostas 2xx/streaming. **Timeout por tentativa: 120000 ms**,
implementado via `AbortController` + `setTimeout(() => ctrl.abort(), perAttemptTimeoutMs)`. O
`signal` externo (se fornecido em `init.signal`) é combinado com o controller interno — se o
external abortar, o interno também aborta.

### 3.2 Cálculo de delay — `pickDelay`

```ts
function pickDelay(attempt: number, base: number, cap: number, retryAfterHeader?: string | null) {
  if (retryAfterHeader) {
    const sec = Number(retryAfterHeader);
    if (Number.isFinite(sec) && sec > 0) return Math.min(cap, sec * 1000);
  }
  // exponencial com jitter (full jitter)
  const exp = Math.min(cap, base * Math.pow(2, attempt - 1));
  return Math.floor(Math.random() * exp);
}
```

- Se a resposta 429 trouxer header `Retry-After` (segundos), este valor é respeitado (limitado ao
  teto `maxDelayMs`), convertido para ms.
- Caso contrário, usa backoff exponencial com **full jitter**: `random(0, min(cap, base·2^(n-1)))`.
  Com defaults (base=400, cap=4000): tentativa 1→2 delay ∈ [0,400); 2→3 delay ∈ [0,800); nunca
  excede 4000ms.

### 3.3 Fluxo completo

```ts
export async function aiGatewayFetch(url: string, init: RequestInit, opts: AIFetchOptions = {}): Promise<Response> {
  const maxAttempts = opts.maxAttempts ?? 3;
  const baseDelay = opts.baseDelayMs ?? 400;
  const maxDelay = opts.maxDelayMs ?? 4000;
  const perAttemptTimeout = opts.perAttemptTimeoutMs ?? 120_000;
  const label = opts.label ?? "ai_gateway";

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), perAttemptTimeout);
    // combina signal externo, se houver
    try {
      const res = await fetch(url, { ...init, signal: ctrl.signal });
      clearTimeout(timer);
      if (res.ok || !RETRYABLE_STATUS.has(res.status)) return res;
      // status retryável: consome body, aplica backoff (usa Retry-After se presente) e continua
      // após esgotar as tentativas, retorna a última Response (não lança)
    } catch (err) {
      clearTimeout(timer);
      // AbortError/timeout ou erro de rede: aplica backoff e retenta
      // após esgotar as tentativas: se houve alguma Response retryável anterior, retorna-a;
      // caso contrário, propaga o erro (throw)
    }
  }
}
```

**Pontos críticos para replicação exata:**
1. Em caso de status retryável (429/502/503/504), o corpo da resposta é sempre consumido
   (`await res.text()`) antes do retry, para liberar a conexão (comentário original: "Deno pode
   vazar sem isso").
2. Ao esgotar `maxAttempts` com status retryável, a função **retorna a última `Response`** (não
   lança exceção) — o caller deve checar `response.ok` manualmente.
3. Ao esgotar `maxAttempts` com erro de rede/abort, a função **lança** (`throw`) a menos que exista
   uma `Response` retryável anterior guardada (`lastResponse`), caso em que a retorna.
4. Log de sucesso após retry: `console.log(\`[${label}] recuperado na tentativa ${attempt} status=${res.status}\`)`.

### 3.4 Uso típico nos callers

```ts
// audit-parse-pdf/index.ts
await aiGatewayFetch(url, init, { label: `ocr_parse:${decision.serviceTag}`, maxAttempts: 3, perAttemptTimeoutMs: 120_000 });

// audit-pipeline-process/index.ts (normalização em lote via tool calling)
await aiGatewayFetch(url, init, { label: "llm_normalize", maxAttempts: 3, perAttemptTimeoutMs: 120_000 });
```

Todos os callers do repositório usam explicitamente `maxAttempts: 3` e
`perAttemptTimeoutMs: 120_000`, coincidindo com os defaults — a réplica deve manter esses valores
como constantes de configuração, não hard-coded distribuído em cada chamada.

---

## 4. `audit-parse-pdf` — extração multimodal de PDF/imagem

### 4.1 Fluxo

1. Recebe `{ fileBase64, fileName, mimeType, documentId }` via POST JSON.
2. Valida `LOVABLE_API_KEY` presente (env).
3. Chama `selectModel("ocr_parse", "medium")` → decisão de modelo (default: `google/gemini-2.0-flash`).
4. Monta mensagem multimodal (`image_url` com `data:${mimeType};base64,${fileBase64}` + texto de
   instrução) e chama `aiGatewayFetch` com `temperature: 0.1`, `max_tokens: 16000`.
5. Trata erros: `429` → `{ error: "Rate limit excedido..." }` (status 429); `402` → `{ error: "Créditos insuficientes." }` (status 402); outros `!ok` → `{ error: "Erro ao processar documento via IA" }` (status 500).
6. Extrai/repara JSON da resposta (`extractAndRepairJson`).
7. Calcula `ocr_score` heurístico (`computeOcrScore`).
8. Persiste **best-effort** em `ocr_results` (nunca quebra a resposta principal se falhar), somente
   se `documentId` existir e o `pipeline_documents` correspondente existir.
9. Retorna `{ extracted, ocr_score, persisted }` (status 200).

### 4.2 Prompt de extração — `EXTRACTION_PROMPT` (cópia integral)

```
Você é o AGENTE PARSER MULTIFORMATO — um parser contábil especializado da plataforma BEX.

Sua função é reconhecer e interpretar diferentes formatos de arquivos financeiros.

## FORMATOS SUPORTADOS

**PDF (todos os tipos):** PDF padrão, PDF/A (A-1, A-2, A-3), PDF/X (X-1a, X-3, X-4), PDF/E, PDF/UA, PDF/VT, PDF OCR, PAdES (ISO)
**Planilhas Excel:** XLSX, XLSM, XLSB, XLTX, XLTM, XLS
**Documentos:** DOCX, DOC, TXT, RTF
**Dados estruturados:** JSON, XML, OFX (Open Financial Exchange), SPED (Sistema Público de Escrituração Digital)

## CAPACIDADES DE IDENTIFICAÇÃO

Identifique automaticamente o TIPO de documento:
- **Balancete** — lista de contas com saldos (débito/crédito/saldo)
- **Balanço Patrimonial** — Ativo × Passivo + PL
- **DRE** — Demonstração do Resultado do Exercício
- **DFC** — Demonstração de Fluxo de Caixa
- **Extrato Bancário** — movimentações com datas e valores
- **Relatório Financeiro** — análises e indicadores

## INSTRUÇÕES DE EXTRAÇÃO

1. Identifique TODAS as contas contábeis presentes
2. Extraia valores numéricos para cada período/ano
3. Classifique cada conta como BALANÇO ou DRE
4. Preserve a hierarquia contábil (contas sintéticas e analíticas)
5. Se houver múltiplos períodos, extraia todos
6. Converta todos os valores para formato numérico
7. Identifique o tipo/formato do documento
8. Para OFX, extraia transações e saldos bancários
9. Para SPED, identifique blocos e registros contábeis
10. Para XML, interprete a estrutura de tags financeiras

Responda EXCLUSIVAMENTE em JSON válido:

{
  "pdfType": "tipo do documento (PDF/A-1, DOCX, OFX, SPED, etc.)",
  "documentInfo": {
    "empresa": "nome da empresa se identificado",
    "periodo": "período do documento",
    "tipo": "balancete | balanço | dre | dfc | extrato | relatório"
  },
  "years": ["2023", "2022"],
  "balanco": [
    {
      "conta": "1",
      "descricao": "ATIVO TOTAL",
      "values": {"2023": 1000000, "2022": 900000}
    }
  ],
  "dre": [
    {
      "conta": "3.01",
      "descricao": "RECEITA LÍQUIDA",
      "values": {"2023": 500000, "2022": 450000}
    }
  ]
}

REGRAS:
- Extraia TODAS as linhas contábeis, não resuma
- Se não conseguir distinguir Balanço de DRE, coloque tudo em "balanco"
- Valores negativos com sinal negativo
- OCR para documentos digitalizados
- Para OFX: extraia BANKTRANLIST e converta para formato contábil
- Para SPED: extraia registros I150/I155 (balancete) e I350/I355 (DRE)
- Responda APENAS com JSON
```

O prompt do usuário (mensagem `role: "user"`, além da imagem) é:

```
Extraia todos os dados financeiros deste documento (${fileName}). Identifique o tipo de documento
(balancete, balanço, DRE, DFC, extrato) e extraia todas as contas contábeis com seus valores.
```

### 4.3 Heurística `computeOcrScore` (contrato exato)

```ts
function computeOcrScore(extracted: Record<string, unknown>): number {
  let score = 0.5;
  const balanco = (extracted.balanco as unknown[]) || [];
  const dre = (extracted.dre as unknown[]) || [];
  const years = (extracted.years as unknown[]) || [];
  const info = (extracted.documentInfo as Record<string, unknown>) || {};
  if (balanco.length > 0) score += 0.15;
  if (dre.length > 0) score += 0.10;
  if (years.length > 0) score += 0.05;
  if (info && Object.keys(info).length > 0) score += 0.05;
  if (balanco.length + dre.length > 30) score += 0.10;
  if (balanco.length + dre.length > 80) score += 0.05;
  return Math.max(0, Math.min(1, score));
}
```

Score base 0.5; máximo teórico 1.0 (0.5+0.15+0.10+0.05+0.05+0.10+0.05=1.0); clamp em `[0,1]`.

### 4.4 `extractAndRepairJson` — reparo de JSON truncado/malformado

Algoritmo de 3 estágios, deve ser replicado byte-a-byte pois trata respostas truncadas por
`max_tokens`:

1. Remove cercas de código markdown (`` ```json `` / `` ``` ``), localiza o primeiro `{` e tenta
   `JSON.parse` direto.
2. Se falhar: remove vírgulas penduradas (`,}` → `}`, `,]` → `]`) e caracteres de controle (exceto
   `\n`/`\t`); tenta `JSON.parse` novamente.
3. Se falhar: percorre a string caractere a caractere rastreando `openBraces`/`openBrackets`
   respeitando strings/escapes; se terminar dentro de uma string, fecha com `"`; localiza o último
   ponto de corte "seguro" (`},`, `}`, `],`, `]`, `",`, `"`) que esteja além de 50% do texto;
   trunca ali, remove vírgula final pendurada, e fecha `]`/`}` na quantidade calculada de brackets
   abertos remanescentes. Se `JSON.parse` funcionar, loga `"Successfully repaired truncated JSON"`.
4. Se todas as tentativas falharem: `throw new Error("Não foi possível extrair JSON válido da resposta da IA.")`.

### 4.5 Persistência em `ocr_results`

```ts
await admin.from("ocr_results").insert({
  document_id: documentId,
  provider: "lovable_ai_gemini",
  ocr_score: ocrScore,
  raw_text: JSON.stringify(extracted).slice(0, 20000), // snippet truncado
  structured_json: extracted,
});
```

Pré-condição: `SELECT id FROM pipeline_documents WHERE id = documentId` deve retornar linha —
caso contrário, o insert é pulado com `console.warn` (não é erro fatal).

---

## 5. `document-ai-process` — extração multi-formato via engine dedicada

### 5.1 Roteamento por MIME

```ts
const DOC_AI_MIMES = new Set([
  "application/pdf", "image/png", "image/jpeg", "image/jpg", "image/gif",
  "image/tiff", "image/bmp", "image/webp",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);
const SPREADSHEET_MIMES = new Set([
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel", "application/vnd.oasis.opendocument.spreadsheet",
  "text/csv", "text/tab-separated-values",
]);
const WORD_MIMES = new Set([
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
]);
const TEXT_MIMES = new Set(["text/plain", "text/markdown", "application/rtf", "text/rtf"]);
```

Inferência de MIME por extensão (`inferMimeFromName`) quando `mimeType` ausente ou
`application/octet-stream`, mapa: `pdf, png, jpg/jpeg, gif, tif/tiff, bmp, webp, xlsx, xls, ods,
csv, tsv, docx, doc, txt, md, rtf`.

### 5.2 Extratores por formato

- **PDF/imagem → Google Document AI**: `POST https://${location}-documentai.googleapis.com/v1/projects/${projectId}/locations/${location}/processors/${processorId}:process?key=${apiKey}`
  com body `{ rawDocument: { content: fileBase64, mimeType } }`. Requer envs
  `GOOGLE_DOCUMENT_AI_API_KEY`, `GOOGLE_DOC_AI_PROJECT_ID`, `GOOGLE_DOC_AI_LOCATION` (default `"us"`),
  `GOOGLE_DOC_AI_PROCESSOR_ID` (ou overrides no payload `projectId`/`location`/`processorId`). Se
  faltar `projectId`/`processorId`, retorna 400 com `{ error, missing: { projectId, processorId } }`.
- **XLSX/XLS/ODS → `XLSX.read` (npm:xlsx@0.18.5)**: converte cada aba para CSV (`FS: "\t"`), gera
  seções `=== Aba: ${sheetName} (${rowCount} linhas) ===`.
- **CSV/TSV**: `TextDecoder("utf-8")` puro, split por linha.
- **DOCX → `mammoth@1.8.0`**: `mammoth.extractRawText({ buffer: bytes })`.
- **TXT/MD/RTF**: decodificação UTF-8 direta.

Se `extraction.text` vazio após qualquer extrator: `422 { error: "Não foi possível extrair texto do documento" }`.
MIME não suportado: `415`.

### 5.3 Truncamento de contexto

```ts
const MAX_CHARS = 120_000;
const inputText = extraction.text.length > MAX_CHARS
  ? extraction.text.slice(0, MAX_CHARS) + "\n\n[... TEXTO TRUNCADO ...]"
  : extraction.text;
```

### 5.4 Prompt de estruturação — `STRUCTURE_PROMPT` (cópia integral)

```
Você é o AGENTE PARSER CONTÁBIL BEX. Receberá o TEXTO BRUTO já extraído de um documento financeiro brasileiro (pode vir de OCR, planilha tabular, ou texto puro).

Identifique o tipo (Balancete, Balanço Patrimonial, DRE, DFC, Extrato) e estruture TODAS as contas com seus valores por período.

Responda EXCLUSIVAMENTE em JSON válido:
{
  "pdfType": "string (PDF, XLSX, CSV, DOCX, TXT...)",
  "documentInfo": { "empresa": "string", "periodo": "string", "tipo": "balancete|balanço|dre|dfc|extrato|relatório" },
  "years": ["2023","2022"],
  "balanco": [{ "conta": "1", "descricao": "ATIVO TOTAL", "values": {"2023": 1000000, "2022": 900000} }],
  "dre":     [{ "conta": "3.01", "descricao": "RECEITA LÍQUIDA", "values": {"2023": 500000, "2022": 450000} }]
}

REGRAS:
- Extraia TODAS as linhas, não resuma
- Valores numéricos puros (sem R$, sem pontos de milhar). Negativos com sinal -
- Se não distinguir Balanço de DRE, use "balanco"
- Responda APENAS com JSON
```

Chamada com `model: "google/gemini-2.5-flash"` (nome fixo, **não passa por `selectModel`**),
`temperature: 0.1`, `max_tokens: 16000`. Mensagem `user`:
`Arquivo: ${fileName}\nFormato: ${mimeType}\nEngine de extração: ${extraction.engine}\n\nTEXTO EXTRAÍDO:\n${inputText}`.

Importante: esta função chama `fetch` diretamente (não `aiGatewayFetch`) — **sem retry/backoff**.
Deve ser replicada exatamente assim (comportamento legado divergente de `audit-parse-pdf`), a menos
que explicitamente solicitada a padronização.

### 5.5 Resposta e tracking

```ts
return new Response(JSON.stringify({
  ok: true,
  pipeline: `${extraction.engine} → gemini-2.5-flash`,
  ocr: { pages: extraction.pages, chars: extraction.text.length, engine: extraction.engine },
  extracted,
}), { status: 200, ... });
```

Dois `trackUsage()` possíveis: um para o estágio OCR (`type: "ocr", service: "document_ai",
requests: pages || 1`) quando via Document AI, e um sempre para o estágio de estruturação
(`type: "mapping", service: "gemini_flash"`, tokens de `aiData.usage` ou estimativa
`Math.ceil(len/4)`).

---

## 6. `audit-pipeline-process` — motor canônico de reconciliação (MD-001)

Arquivo mais complexo (1484 linhas). Constitui a "fonte única da verdade" contábil — nenhum
estágio posterior pode alterar dados extraídos do balancete.

`PARSER_VERSION = "2026.08.11.17"` — deve ser incrementada a cada mudança que afete números
calculados; usada no hash de dedupe (`buildContentHashSource`) para invalidar cache automaticamente.

### 6.1 Cache em 3 camadas (normalização de contas)

1. **Cache em memória do processo** (`NORMALIZE_CACHE`, `Map`, `CACHE_MAX = 5000`, política FIFO) —
   chave normalizada (`cacheKey`: lowercase, trim, colapsa espaços).
2. **Cache persistente DB** (`contabil_dictionary`, lookup O(1) por termo).
3. **Fast-path agressivo por código de conta BR** (`classifyByCode`): plano de contas `1.x=Ativo,
   2.x=Passivo+PL (2.3/2.4/2.5=PL), 3.x=Receita, 4.x=Despesa, 5.x=Custo` — tratado como **autoridade**,
   dispensa LLM quando o código é presente e reconhecível.
4. Fallback por palavras-chave fortes (`STRONG_KEYWORDS` regex) quando não há código.
5. **LLM em lote (tool calling)** apenas para o que sobrar, em chunks de `CHUNK_SIZE = 120` com
   `MAX_PARALLEL = 12` requisições concorrentes.

### 6.2 Prompt de normalização semântica (`callLLMNormalize`, cópia integral do system prompt)

```
Você é um CONTADOR ESPECIALISTA em classificação contábil brasileira (CPC/IFRS/NBC TA/Lei 6.404/76).

TAREFA: Padronizar e classificar contas de um balancete usando SIMILARIDADE SEMÂNTICA (não literal).

REGRAS CRÍTICAS:
1. RETORNE EXATAMENTE ${rows.length} ITENS no array `accounts` — nem mais, nem menos. Esta regra é absoluta.
2. Mantenha a MESMA ORDEM das contas de entrada (item 0 do output corresponde ao item 0 do input).
3. Para cada conta, retorne:
   - conta_normalizada: termo padrão consolidado (ex.: "Bcos c/Mvto" → "Bancos Conta Movimento"; "Dupl. Desct." → "Duplicatas Descontadas")
   - categoria: uma de [ativo_circulante, ativo_nao_circulante, passivo_circulante, passivo_nao_circulante, patrimonio_liquido, receita, custo, despesa]
   - tipo: uma de [ativo, passivo, pl, receita, despesa]
   - matched: true se mapeou via dicionário/exemplo, false se inferiu por contexto
4. ATENÇÃO ESPECIAL AO PATRIMÔNIO LÍQUIDO: Capital Social, Reservas (Legal/Estatutária/Capital/Lucros), Lucros Acumulados, Lucros do Exercício, Prejuízos Acumulados, Ajustes de Avaliação Patrimonial, Ações em Tesouraria → SEMPRE tipo="pl", categoria="patrimonio_liquido". NUNCA classifique "Lucros Acumulados" como receita.
5. Use SIMILARIDADE SEMÂNTICA — contas equivalentes devem ter o MESMO termo padrão.
6. NÃO invente categorias novas.
7. Sinais de risco: factoring, FIDC, duplicatas descontadas → categoria correta + termo padronizado.

DICIONÁRIO CONTÁBIL DE REFERÊNCIA:
${dictText || "(vazio — use seu conhecimento contábil)"}
```

Mensagem do usuário: `Normalize estas ${rows.length} contas mantendo EXATAMENTE a mesma ordem e
tamanho do input (${rows.length} itens):\n\n${inputList}\n\nRetorne via tool call
return_normalized_accounts com ${rows.length} elementos no array.`

Chamada via **tool calling forçado**: `tool_choice: { type: "function", function: { name:
"return_normalized_accounts" } }`, com schema JSON estrito (`minItems`/`maxItems` = `rows.length`,
`additionalProperties: false`, enums fechados para `categoria` e `tipo`). Isso garante estrutura
determinística e evita respostas em markdown.

Chamada via `aiGatewayFetch(..., { label: "llm_normalize", maxAttempts: 3, perAttemptTimeoutMs: 120_000 })`.

### 6.3 Estratégia de retry com troca de modelo

```ts
async function normalizeChunk(rows, dictText) {
  let accounts = await callLLMNormalize(rows, dictText, "google/gemini-2.0-flash");
  if (!accounts || accounts.length !== rows.length) {
    accounts = await callLLMNormalize(rows, dictText, "google/gemini-1.5-pro"); // retry com modelo diferente
  }
  if (!accounts) {
    // fallback heurístico local (classifyAccount) por descrição, matched:false
    return rows.map((row) => { const {tipo, categoria} = classifyAccount(row.descricao || row.conta);
      return { conta_normalizada: row.descricao || row.conta, categoria, tipo, matched: false }; });
  }
  // valida item a item; se item individual vier incompleto, aplica fallback heurístico só nesse item
  return rows.map((row, i) => {
    const llm = accounts![i];
    if (llm && llm.conta_normalizada && llm.tipo && llm.categoria) return llm;
    const { tipo, categoria } = classifyAccount(row.descricao || row.conta);
    return { conta_normalizada: row.descricao || row.conta, categoria, tipo, matched: false };
  });
}
```

Este é o único ponto do código onde há **retry cruzando modelos** (não apenas retentativas de
transporte) — motivado por mismatch de contagem de itens no array retornado (sinal de resposta
truncada/mal formatada do LLM).

### 6.4 Hash de dedupe

```ts
async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
function buildContentHashSource(body: PipelineRequest): string {
  const norm = (rows = []) => rows.map((r) => `${r.conta||""}|${r.descricao||""}|${Number(r.valor)||0}`).sort().join("\n");
  return [`parser:${PARSER_VERSION}`, body.company_id||"", body.documentInfo?.periodo||"", norm(body.balanco), "::dre::", norm(body.dre)].join("\n");
}
```

Prefixar sempre com `parser:${PARSER_VERSION}` garante invalidação automática do cache de dedupe
a cada evolução do parser. `force_reprocess: true` no payload ignora um dedup hit.

### 6.5 Progresso em tempo real

```ts
async function updateProgress(supabase, documentId, message) {
  await supabase.from("pipeline_documents").update({ progress: message, updated_at: new Date().toISOString() }).eq("id", documentId);
}
```
Falhas nesta função são silenciadas (não-crítico para o pipeline).

### 6.6 `trackUsage` (idêntico em todos os 3 arquivos server-side)

```ts
async function trackUsage(input: {
  type: string; provider: string; service: string; document_id?: string | null;
  tokens_input?: number; tokens_output?: number; requests?: number; metadata?: Record<string, unknown>;
}) {
  const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  const { data: cfg } = await sb.from("ai_cost_config").select("*").eq("service", input.service).maybeSingle();
  const ti = Number(input.tokens_input||0), to = Number(input.tokens_output||0), rq = Number(input.requests||0);
  const cost = cfg
    ? (ti/1000)*Number(cfg.cost_per_1k_input||0) + (to/1000)*Number(cfg.cost_per_1k_output||0)
      + rq*Number(cfg.cost_per_request||0) + Number(cfg.cost_fixed||0)
    : 0;
  await sb.from("ai_usage_logs").insert({
    type: input.type, provider: input.provider, service: input.service,
    document_id: input.document_id ?? null, tokens_input: ti, tokens_output: to, requests: rq,
    cost_calculated: cost, metadata: input.metadata ?? null,
  });
}
```

Notar: o cálculo client-side (edge function) **replica** a fórmula SQL de `calculate_ai_cost`, mas
não inclui `cost_per_page` (a versão edge não usa `pages`). Se `cfg` não for encontrado, `cost = 0`
— o valor é então corrigido posteriormente pela trigger SQL `trg_calculate_cost` no INSERT (ver §8),
que roda `calculate_ai_cost` **apenas se** `cost_calculated IS NULL OR = 0`.

Falhas em `trackUsage` são **sempre engolidas** (`.catch(() => {})` ou `try/catch` com
`console.warn`) — nunca devem quebrar o fluxo principal do pipeline.

---

## 7. `audit-analyze` — motor multi-agente e cache RAG (L0/L1/L2/L3)

### 7.1 Cache de aprendizado contábil (camadas)

- **L0** — `audit_account_cache`: cache exato por `(company_id, periodo, conta_original_normalizada)`,
  hit instantâneo, incrementa `hits` a cada acerto.
- **L1** — `contabil_dictionary`: match exato por termo normalizado, exige `frequencia >= 3` para
  ser aceito (evita ruído de termos pouco confirmados).
- **L2** — RAG por embedding: gera embedding via `google/text-embedding-004`
  (`POST https://ai.gateway.lovable.dev/v1/embeddings`), busca via RPC
  `sb.rpc("match_contabil_dictionary", { query_embedding, match_threshold: 0.85, match_count: 1 })`.
  Por controle de custo, **apenas as top 25 contas por `|valor|`** são candidatas a embedding
  (`sortedRemaining.slice(0, 25)`); o restante vai direto para "unresolved" (L3/IA).
- **L3** — envio ao LLM (Gemini Flash) somente das contas que sobraram sem match.

Persistência pós-resolução: L1/L2 novas são upsertadas em `audit_account_cache` (`onConflict:
"company_id,periodo,conta_original_normalizada"`); hits de L0 são incrementados individualmente
(`update({ hits: hits+1 })` por linha, sem batch RPC — comentário no código indica volume baixo).

Estatísticas retornadas: `{ total, l0, l1, l2, l3, tokensSaved, embeddingsAvoided }`, onde
`tokensSaved = round(((l0+l1+l2) * 60) / 4)` (heurística ~60 chars/conta, 4 chars/token) e
`embeddingsAvoided = l0` (contas que teriam sido candidatas a embedding mas foram resolvidas antes).

### 7.2 Prompt principal — `SYSTEM_PROMPT` (5 agentes simulados, cópia integral)

```
Você é uma plataforma multi-agente de auditoria contábil de nível SÊNIOR composta por 5 agentes que atuam em sequência. Combine ANÁLISE KANITZ AVANÇADA + RELATÓRIO EXECUTIVO ACIONÁVEL.

═══════════════════════════════════════════════════════════════
## AGENTE 1 — ESTRUTURADOR CONTÁBIL
═══════════════════════════════════════════════════════════════
Transforme os dados extraídos em modelo contábil consolidado:
- Classifique TODAS as contas em: Ativo Circulante, Ativo Não Circulante, Passivo Circulante, Passivo Não Circulante, Patrimônio Líquido, Receita, Custo, Despesa
- Identifique e totalize: Clientes, Estoques, Fornecedores, Bancos, Aplicações financeiras, Duplicatas Descontadas, Factoring, FIDC

═══════════════════════════════════════════════════════════════
## AGENTE 2 — VALIDADOR CONTÁBIL (CRÍTICO — execute SEMPRE)
═══════════════════════════════════════════════════════════════
VERIFIQUE OBRIGATORIAMENTE:
- Ativo = Passivo + PL (tolerância 2%)
- Receita − Despesas = Resultado coerente
- Contas duplicadas ou com sinal invertido
- Valores anômalos (zero, negativo onde não deveria)
Se houver inconsistência → registre em "pendencias" com gravidade adequada.

═══════════════════════════════════════════════════════════════
## AGENTE 3 — AUDITOR FINANCEIRO
═══════════════════════════════════════════════════════════════
Execute análise técnica APROFUNDADA:
- Variação horizontal (AH) > 25% = anômalo → investigar
- Concentração de clientes / risco de estoque parado
- Dependência de antecipação de recebíveis (factoring/FIDC/dupl. descontadas) = ALERTA DE LIQUIDEZ
- Going concern — sinais: PL negativo, prejuízos sucessivos, LC < 1
- Fundamente CADA achado com norma específica (CPC, IFRS, NBC TA, Lei 6.404/76, Lei 11.101/2005)

═══════════════════════════════════════════════════════════════
## AGENTE 4 — RISK ENGINE (cálculos automáticos)
═══════════════════════════════════════════════════════════════

### Liquidez:
- LC = AC / PC | LS = (AC − Estoques) / PC | LG = (AC + RLP) / (PC + PNC) | LI = Caixa / PC

### Endividamento:
- ET = PT / AT | CE = PC / PT | ImobPL = Imobilizado / PL

### Atividade:
- Giro Ativo = Receita / AT | PMR = (Clientes × 360) / Receita | PMP = (Fornecedores × 360) / CMV | Giro Estoque = CMV / Estoque Médio

### Rentabilidade:
- Margem Líquida, Margem Operacional, ROE, ROA, Cobertura de Juros

### Modelo Kanitz — Termômetro de Insolvência:
X1 = LL / PL | X2 = (AC + RLP) / (PC + ELP) | X3 = (AC − Estoques) / PC | X4 = AC / PC | X5 = − ((PC + ELP) / PL)
**FI = 0,05·X1 + 1,65·X2 + 3,55·X3 − 1,06·X4 − 0,33·X5**
- FI > 0 → Solvência | 0 ≥ FI ≥ −3 → Penumbra | FI < −3 → Insolvência

### Score BEX-RJ:
Score = Endividamento×0.25 + Liquidez×0.20 + PL×0.20 + Geração Caixa×0.20 + Concentração Dívida×0.15

═══════════════════════════════════════════════════════════════
## AGENTE 5 — GERADOR DE RELATÓRIO EXECUTIVO
═══════════════════════════════════════════════════════════════
Linguagem profissional, OBJETIVA, FOCO EM DECISÃO.
- Resumo executivo (mín. 200 palavras): diagnóstico + riscos + recomendações
- Insights ACIONÁVEIS (não descritivos): "Custos consomem X% da receita — renegociar fornecedor Y"
- Recomendações com prioridade e prazo

═══════════════════════════════════════════════════════════════
## REGRAS GLOBAIS
═══════════════════════════════════════════════════════════════
1. NÃO INVENTE dados — base-se APENAS nos números fornecidos
2. Se um dado faltar → declare "não disponível" em vez de assumir
3. Use os DADOS NORMALIZADOS PELO PIPELINE como base preferencial
4. Use os EXEMPLOS VALIDADOS (few-shot) como padrão de qualidade
5. Responda EXCLUSIVAMENTE em JSON válido — sem markdown, sem texto antes/depois

═══════════════════════════════════════════════════════════════
## ESTRUTURA JSON OBRIGATÓRIA
═══════════════════════════════════════════════════════════════
{
  "diagnostico": {
    "riskLevel": "baixo" | "moderado" | "elevado" | "critico",
    "resumo": "string (mín. 200 palavras) — diagnóstico + riscos + indicadores + recomendações estratégicas",
    "pontosChave": [{ "item": "string", "status": "positivo" | "atencao" | "critico", "detail": "string" }],
    "estruturaFinanceira": {
      "ativo_circulante": 0, "ativo_nao_circulante": 0, "ativo_total": 0,
      "passivo_circulante": 0, "passivo_nao_circulante": 0, "passivo_total": 0,
      "patrimonio_liquido": 0, "receita_liquida": 0, "lucro_liquido": 0,
      "estoques": 0, "clientes": 0, "caixa": 0, "fornecedores": 0
    }
  },
  "validacaoContabil": {
    "valido": true, "ativo_total": 0, "passivo_pl_total": 0, "diferenca": 0,
    "erros": [], "alertas": []
  },
  "pendencias": [
    {
      "id": "p1",
      "tipo": "Inconsistência" | "Impropriedade" | "Fragilidade" | "Omissão" | "Observação",
      "gravidade": "critico" | "alto" | "medio" | "baixo" | "observacao",
      "conta": "código/descrição",
      "problema": "descrição técnica",
      "fundamentacao": "CPC/IFRS/NBC TA/Lei específicos",
      "risco": "descrição",
      "impacto": "quantificação financeira",
      "recomendacao": "ação corretiva específica"
    }
  ],
  "indicadoresCalculados": {
    "liquidezCorrente": 0, "liquidezSeca": 0, "liquidezGeral": 0, "liquidezImediata": 0,
    "endividamentoTotal": 0, "composicaoEndividamento": 0, "imobilizacaoPL": 0,
    "giroAtivo": 0, "pmr": 0, "pmp": 0, "giroEstoque": 0,
    "margemLiquida": 0, "margemOperacional": 0, "roe": 0, "roa": 0, "coberturaJuros": 0
  },
  "kanitz": {
    "fatorInsolvencia": 0,
    "classificacao": "solvente" | "penumbra" | "insolvente",
    "componentes": { "rpl": 0, "lg": 0, "ls": 0, "lc": 0, "ge": 0 }
  },
  "scoreRJ": {
    "score": 0,
    "classificacao": "Saudável" | "Atenção" | "Alto Risco" | "Forte Indicativo de RJ",
    "componentes": [{ "nome": "string", "peso": 0.0, "valor": 0, "nota": "string" }]
  },
  "alertasPatrimoniais": [
    { "conta": "código — descrição", "alerta": "pergunta sobre risco", "detail": "valores", "gravidade": "alto" | "medio" | "baixo" }
  ],
  "riscosEndividamento": [
    { "tipo": "Risco Bancário" | "Risco Trabalhista" | "Risco Fiscal" | "Risco de Factoring", "nivel": "alto" | "medio" | "baixo", "detail": "descrição" }
  ],
  "alertasIA": [
    { "icone": "⚠", "titulo": "string", "descricao": "insight ACIONÁVEL (não descritivo)", "severidade": "critico" | "alto" | "medio" | "baixo" }
  ],
  "relatorioExecutivo": {
    "resumo_executivo": "parágrafo executivo",
    "diagnostico": "diagnóstico técnico-financeiro",
    "pontos_atencao": ["ponto 1", "ponto 2"],
    "recomendacoes": [
      { "prioridade": "alta" | "media" | "baixa", "acao": "recomendação acionável", "prazo": "imediato | 30d | 90d" }
    ]
  }
}

CHECKLIST FINAL antes de responder:
✓ Validação contábil executada (Ativo = Passivo + PL)
✓ TODOS os 16 indicadores calculados
✓ Kanitz FI calculado com fórmula completa
✓ Mínimo 4 pendências fundamentadas em normas
✓ Mínimo 3 alertas patrimoniais e 3 alertas IA acionáveis
✓ Factoring/FIDC/dupl. descontadas identificados se presentes
✓ Relatório executivo com recomendações priorizadas
✓ APENAS JSON na resposta
```

### 7.3 Contrato do `structured_json`

O output final acima é o contrato retornado ao chamador (persistido tipicamente na coluna
`structured_json`/`analysis_json` do documento de auditoria). Regras de forma obrigatórias:
- JSON puro, sem markdown/cercas de código.
- Todos os 16 campos de `indicadoresCalculados` presentes mesmo que 0/"não disponível".
- Mínimo 4 `pendencias`, mínimo 3 `alertasPatrimoniais`, mínimo 3 `alertasIA` — o prompt exige,
  mas a réplica **deve validar programaticamente** esses mínimos e reprocessar/alertar se o LLM
  não cumprir (o parser de reparo de JSON é o mesmo `extractAndRepairJson` de `audit-parse-pdf`,
  copiado 1:1 neste arquivo).

---

## 8. `ai_usage_logs`, `ai_cost_config` e `calculate_ai_cost`

### 8.1 Esquema (via migrações)

`ai_cost_config`: `provider, service (unique), label, cost_per_1k_input, cost_per_1k_output,
cost_per_request, cost_per_page, cost_fixed, currency default 'USD', active, notes, updated_at`.

`ai_usage_logs`: `type, provider, service, document_id, tokens_input, tokens_output, requests,
pages, cost_calculated, metadata jsonb, created_by, created_at`. Índices em `type`, `service`,
`created_at`.

### 8.2 Função SQL `calculate_ai_cost` (versão vigente, com normalização de nome)

```sql
CREATE OR REPLACE FUNCTION public.calculate_ai_cost(p_service text, p_tokens_input numeric, p_tokens_output numeric, p_requests numeric, p_pages numeric)
 RETURNS numeric LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE cfg record; total numeric := 0; norm_service text;
BEGIN
  SELECT * INTO cfg FROM public.ai_cost_config WHERE service = p_service AND active = true LIMIT 1;
  IF NOT FOUND THEN
    norm_service := replace(replace(p_service, '-', '_'), '.', '_');
    SELECT * INTO cfg FROM public.ai_cost_config WHERE service = norm_service AND active = true LIMIT 1;
  END IF;
  IF NOT FOUND THEN RETURN 0; END IF;
  total :=
    COALESCE((p_tokens_input / 1000.0) * cfg.cost_per_1k_input, 0) +
    COALESCE((p_tokens_output / 1000.0) * cfg.cost_per_1k_output, 0) +
    COALESCE(p_requests * cfg.cost_per_request, 0) +
    COALESCE(p_pages * cfg.cost_per_page, 0) +
    COALESCE(cfg.cost_fixed, 0);
  RETURN total;
END; $function$;
```

`EXECUTE` foi revogado de `anon`/`authenticated`/`PUBLIC` e concedido apenas a `service_role`
(migrações `20260525173801` e `20260525180631`) — só edge functions com service role podem chamar.

### 8.3 Trigger de auto-cálculo

```sql
CREATE OR REPLACE FUNCTION public.trg_calculate_cost() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.cost_calculated IS NULL OR NEW.cost_calculated = 0 THEN
    NEW.cost_calculated := public.calculate_ai_cost(NEW.service, NEW.tokens_input, NEW.tokens_output, NEW.requests, NEW.pages);
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER before_insert_ai_cost BEFORE INSERT ON public.ai_usage_logs
FOR EACH ROW EXECUTE FUNCTION public.trg_calculate_cost();
```

Implicação de replicação: mesmo que a edge function grave `cost_calculated: 0` (porque `cfg` não
foi encontrado no client-side em `trackUsage`), a trigger SQL recalcula automaticamente no
`INSERT`, usando os mesmos parâmetros — **rede de segurança dupla**. Se o serviço estiver com nome
divergente (hífen vs underscore), a função normaliza automaticamente antes de desistir.

### 8.4 Seeds de `ai_cost_config` (2026, valores em USD)

| service | provider | cost_per_1k_input | cost_per_1k_output | cost_per_page | cost_fixed | label |
|---|---|---|---|---|---|---|
| `gemini_2_5_flash` | google | 0.00035 | 0.00070 | 0 | 0 | Gemini 2.5 Flash (parsing/mapping) |
| `gemini_2_5_pro` | google | 0.0035 | 0.0105 | 0 | 0 | Gemini 2.5 Pro (insights/relatório) |
| `embedding` | google | 0.00010 | 0 | 0 | 0 | Vertex AI Embeddings |
| `document_ai` | google | 0 | 0 | 0.015 | 0 | Google Document AI (OCR) |
| `storage_supabase` | internal | 0 | 0 | 0 | 0.0002 | Storage Lovable Cloud |
| `infra_compute` | internal | 0 | 0 | 0 | 0.0005 | Infra / Compute |

Além disso, migração posterior insere **aliases hifenizados** (`gemini-2.5-pro`,
`gemini-2.5-flash`, `gemini-2.5-flash-lite`) espelhando os underscored, com `ON CONFLICT (service)
DO NOTHING` — usados quando algum caller loga `service` com hífen em vez de underscore.

### 8.5 `ai_cost_diagnostics()` (SQL) e `runCostDiagnostics()` (client)

`ai_cost_diagnostics()` (SQL, `SECURITY DEFINER`) retorna `json` com `maior_custo_servico`,
`custo_total`, `custo_por_tipo` (agregado via view `ai_cost_summary`).

`runCostDiagnostics()` (client, `gestorIaCostService.ts`) é o caminho operacional real usado pela
UI de gestão de custos: como `ai_usage_logs` é **imutável** (sem permissão de UPDATE por
design), recalcula cada log com a tabela de preços vigente e, se houver diferença, insere um log
`type: "adjustment"` com o **delta** (não sobrescreve o original). Guard-rail: se
`ratio = max(original/recalculated, recalculated/original) > 10`, o log é **pulado** (log de
`console.warn`) para evitar aplicar ajustes catastróficos causados por tabela de preços corrompida.
Ajustes anteriores (`type === "adjustment"`) nunca são reprocessados.

### 8.6 `logAiUsage` (client-side, uso direto do frontend)

```ts
export async function logAiUsage(input: {...}): Promise<void> {
  const config = await fetchCostConfig();
  const cfg = config.find((c) => c.service === input.service);
  const cost = cfg ? calculateCost({...input}, cfg) : 0;
  const { data: { user } } = await supabase.auth.getUser();
  await supabase.from("ai_usage_logs").insert({ ...input, cost_calculated: cost, created_by: user?.id ?? null });
}
```

`calculateCost` (fórmula client, idêntica à SQL, incluindo `cost_per_page`):
```ts
export function calculateCost(usage, config): number {
  const ti = Number(usage.tokens_input||0), to = Number(usage.tokens_output||0);
  const rq = Number(usage.requests||0), pg = Number(usage.pages||0);
  return (ti/1000)*config.cost_per_1k_input + (to/1000)*config.cost_per_1k_output
    + rq*config.cost_per_request + pg*config.cost_per_page + config.cost_fixed;
}
```

---

## 9. Checklist de Implementação

- [ ] Criar `_shared/model-router.ts` com `ROUTING_MATRIX`, `MODEL_FALLBACK`, `computeCriticality`,
      `selectModel`, exportando os tipos `ProcessKey`, `Criticality`, `RoutingDecision`, `RiskSignals`
      **exatamente** como especificado (nomes de `serviceTag` são chave estrangeira lógica de
      `ai_cost_config.service` — não renomear sem migrar a tabela de preços).
- [ ] Criar `_shared/ai-fetch.ts` com `aiGatewayFetch`, respeitando defaults `maxAttempts=3`,
      `baseDelayMs=400`, `maxDelayMs=4000`, `perAttemptTimeoutMs=120000`, `RETRYABLE_STATUS =
      {429,502,503,504}`, full-jitter exponencial e respeito a `Retry-After`.
- [ ] Implementar `audit-parse-pdf`: prompt `EXTRACTION_PROMPT` idêntico, `temperature: 0.1`,
      `max_tokens: 16000`, `computeOcrScore` idêntico, `extractAndRepairJson` com os 3 estágios de
      reparo, persistência best-effort em `ocr_results` condicionada à existência do documento em
      `pipeline_documents`.
- [ ] Implementar `document-ai-process`: mapas de MIME idênticos, `inferMimeFromName`,
      extratores (Document AI / xlsx / csv / mammoth / texto puro), truncamento em `MAX_CHARS =
      120_000`, prompt `STRUCTURE_PROMPT` idêntico, chamada **sem** `aiGatewayFetch` (fetch direto,
      sem retry — comportamento legado a preservar).
- [ ] Implementar `audit-pipeline-process`: `PARSER_VERSION` versionado, cache 3 camadas
      (memória/DB/fast-path por código BR), `classifyByCode`/`classifyAccount`/`STRONG_KEYWORDS`,
      `CHUNK_SIZE=120`, `MAX_PARALLEL=12`, tool calling com schema `minItems=maxItems=rows.length`,
      retry cruzando `gemini-2.0-flash` → `gemini-1.5-pro` em mismatch de contagem, hash SHA-256 de
      dedupe prefixado com `parser:${PARSER_VERSION}`, `updateProgress` non-blocking.
- [ ] Implementar `audit-analyze`: cache L0 (`audit_account_cache`)/L1
      (`contabil_dictionary`, freq≥3)/L2 (embedding `google/text-embedding-004` + RPC
      `match_contabil_dictionary`, threshold 0.85, top-25 por `|valor|`)/L3 (LLM), prompt
      `SYSTEM_PROMPT` de 5 agentes idêntico, contrato `structured_json` completo com os 16
      indicadores, Kanitz, Score RJ, mínimos de pendências/alertas.
- [ ] Criar tabelas/migrações: `ai_cost_config`, `ai_usage_logs` (colunas `pages`, `reference_id`),
      função `calculate_ai_cost` (com normalização hífen/ponto→underscore), trigger
      `trg_calculate_cost` (`BEFORE INSERT`, só recalcula se `cost_calculated IS NULL OR = 0`), view
      `ai_cost_summary`, função `ai_cost_diagnostics`, seeds de preço 2026 + aliases hifenizados.
      Revogar `EXECUTE` de `calculate_ai_cost` para `anon`/`authenticated`, conceder a `service_role`.
- [ ] Portar `gestorIaCostService.ts`: `calculateCost`, `fetchCostConfig`, `upsertCostConfig`,
      `fetchUsageLogs`, `fetchCostIndicators` (agregações por período/mês/serviço + insights
      automáticos), `runCostDiagnostics` (com guard-rail de ratio > 10×), `logAiUsage`.
- [ ] Garantir todas as chamadas de `trackUsage`/`logAiUsage` sejam **best-effort** (nunca lançam,
      nunca bloqueiam o fluxo principal de extração/análise).
- [ ] Configurar envs obrigatórias: `LOVABLE_API_KEY`, `SUPABASE_URL`,
      `SUPABASE_SERVICE_ROLE_KEY`, `GOOGLE_DOCUMENT_AI_API_KEY`, `GOOGLE_DOC_AI_PROJECT_ID`,
      `GOOGLE_DOC_AI_LOCATION` (default `"us"`), `GOOGLE_DOC_AI_PROCESSOR_ID`, `BEX_FORCE_PROVIDER`
      (opcional, kill-switch).

## 10. Critérios de Homologação

1. **Roteamento determinístico**: para os mesmos `ProcessKey`+`Criticality`, `selectModel` deve
   retornar sempre o mesmo `model`/`provider`/`serviceTag`. Testar as 7×3 combinações da matriz.
2. **Escalonamento de criticidade**: fixture com 2 sinais de risco simultâneos deve produzir
   `criticality: "high"`; 1 sinal → `"medium"`; 0 sinais → `"low"` — validar com casos de borda
   (`liquidezCorrente = 1` não deve contar como crítico, pois a condição é estritamente `< 1`).
3. **Kill-switch**: com `BEX_FORCE_PROVIDER=openai`, qualquer `ProcessKey` cujo `entry.provider`
   seja `"google"` deve retornar `model: "openai/gpt-5-mini"`, `serviceTag: "gpt5_mini"`.
4. **Retry/backoff**: simular respostas 429 com `Retry-After: 2` — delay observado deve ser
   `min(4000, 2000)` ms; simular 3× 503 seguidos — função deve retornar a última `Response` (status
   503) sem lançar exceção; simular timeout (mock que nunca resolve) — abort deve ocorrer aos
   120000 ms e retry deve ocorrer até `maxAttempts`.
5. **Reparo de JSON truncado**: fixture com JSON cortado no meio de um array de `balanco` deve ser
   reparado e retornar objeto válido com o array truncado fechado corretamente (sem lançar).
6. **`ocr_score`**: para um payload com `balanco.length=50, dre.length=40, years=["2023","2022"],
   documentInfo={...}`, o score esperado é `0.5+0.15+0.10+0.05+0.05+0.10 = 0.95` (total de linhas
   90 > 30 mas ≤ 80).
7. **Idempotência de persistência**: reenviar o mesmo `documentId` inexistente em
   `pipeline_documents` não deve lançar erro — resposta HTTP 200 com `persisted: false`.
8. **Contrato `structured_json` do `audit-analyze`**: validar via schema/zod que a resposta contém
   todas as chaves de nível 1 (`diagnostico, validacaoContabil, pendencias, indicadoresCalculados,
   kanitz, scoreRJ, alertasPatrimoniais, riscosEndividamento, alertasIA, relatorioExecutivo`) e que
   `pendencias.length >= 4`, `alertasPatrimoniais.length >= 3`, `alertasIA.length >= 3` — falhas
   devem gerar alerta de qualidade (não bloqueante, mas logado).
9. **Custo consistente**: inserir um `ai_usage_logs` com `service` inexistente em
   `ai_cost_config` deve resultar em `cost_calculated = 0` após a trigger (não erro); inserir com
   `service = "gemini-2.5-pro"` (hífen) deve resolver corretamente via normalização para
   `gemini_2_5_pro` (ou usar o alias hifenizado se presente).
10. **Diagnóstico de custo com guard-rail**: fixture com um log cujo `cost_calculated` original é
    `0.001` e o recalculado seria `100` (ratio > 10×) deve ser **pulado** por `runCostDiagnostics`,
    sem gerar log de ajuste.
11. **Fallback de normalização contábil**: mockar `callLLMNormalize` retornando array com tamanho
    diferente de `rows.length` na 1ª chamada; validar que a 2ª chamada usa `google/gemini-1.5-pro`;
    se ambas falharem, validar que o resultado final usa `classifyAccount` local com
    `matched: false` em 100% das linhas.
12. **Cache RAG do `audit-analyze`**: com uma conta já presente em `audit_account_cache` para o
    mesmo `company_id`+`periodo`, a resolução deve ser L0 (sem chamar embedding nem LLM) e `hits`
    deve incrementar em 1 no registro correspondente.

## 11. Troubleshooting

| Sintoma | Causa provável | Ação |
|---|---|---|
| `500 Erro ao processar documento via IA` em `audit-parse-pdf` | Status não-retryável (400/404) do gateway, ou `RETRYABLE_STATUS` esgotado | Checar `LOVABLE_API_KEY`, verificar payload `image_url` (mimeType correto), inspecionar log `[label] esgotou N tentativas`. |
| `429 Rate limit excedido` recorrente | Volume de chamadas paralelas alto (`MAX_PARALLEL=12` em `audit-pipeline-process`) excedendo cota do gateway | Reduzir `MAX_PARALLEL`, ou aumentar `maxDelayMs`, ou aplicar `BEX_FORCE_PROVIDER` temporário. |
| `"Não foi possível extrair JSON válido da resposta da IA."` | Resposta do modelo truncada além do que o reparo consegue corrigir (>50% do conteúdo perdido) | Aumentar `max_tokens` (atual 16000), ou dividir o documento em chunks menores antes da extração. |
| `structure_extract` retorna 400 com `missing.projectId/processorId` | Envs do Document AI não configuradas | Configurar `GOOGLE_DOC_AI_PROJECT_ID`/`GOOGLE_DOC_AI_PROCESSOR_ID` ou usar overrides no payload da chamada. |
| `cost_calculated = 0` em muitos logs (`ai_usage_logs`) | `service` não bate com nenhuma linha ativa em `ai_cost_config` (nem no nome normalizado) | Rodar `runCostDiagnostics()` pela UI de custos; conferir se o `serviceTag` do router bate com a tabela de preços; adicionar linha faltante em `ai_cost_config`. |
| Contas do balancete indo para categoria errada (ex.: "Lucros Acumulados" como receita) | Fast-path por keyword (`classifyAccount`) rodou antes da checagem de PL, ou LLM não seguiu a Regra 4 do prompt de normalização | Confirmar que a checagem de PL está *antes* de receita/despesa em `classifyAccount` (ordem importa); revisar poucos-shots/exemplos no dicionário `contabil_dictionary`. |
| Normalização muito lenta em documentos grandes | `CHUNK_SIZE=120`/`MAX_PARALLEL=12` insuficientes, ou fast-path (código BR) não está sendo atingido por ausência de código de conta no documento | Verificar se o parser upstream preserva o campo `conta` (código); sem código, tudo cai para LLM (mais lento e caro). |
| Retry infinito percebido (>3 tentativas nos logs) | Confundir múltiplas chamadas independentes (ex.: chunks paralelos) com retries da mesma chamada | Verificar `label` no log — cada chunk tem seu próprio `label`/contexto; `aiGatewayFetch` nunca excede `maxAttempts` por chamada individual. |
| Diferença entre custo mostrado na UI e valor real cobrado pelo provedor | Preços em `ai_cost_config` desatualizados, ou uso de `gpt-5-mini`/`gemini-3-flash-preview` (override de `BEX_FORCE_PROVIDER`) sem entrada de preço correspondente | Atualizar `ai_cost_config` sempre que novos modelos de override forem adicionados ao `selectModel`; validar antes de ativar `BEX_FORCE_PROVIDER` em produção. |
| `document-ai-process` falha silenciosamente sem retry em erro transitório (502/503) | Esta função usa `fetch` direto (não `aiGatewayFetch`) por decisão original do código-fonte | Comportamento esperado/legado — se replicar com retry, documentar como desvio intencional da fonte. |

