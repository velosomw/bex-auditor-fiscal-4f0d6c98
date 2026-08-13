# MD-PORT-02 — Storage e Topologia das Edge Functions (BEx Platform)

## 1. Objetivo

Este documento descreve, em nível de implementação, toda a topologia de backend serverless (Supabase Edge Functions, Deno) e a infraestrutura de storage/fila que sustenta o pipeline de auditoria contábil da Plataforma BEx. O objetivo é permitir que outro engenheiro replique **byte a byte** o comportamento observado em produção em um novo projeto Lovable Cloud/Supabase, incluindo: inventário de funções, contratos JSON de request/response, variáveis de ambiente (secrets), políticas de CORS, `verify_jwt` por função (`supabase/config.toml`), a fila `pgmq` de jobs assíncronos de IA (`ai_jobs` + DLQ), e os módulos compartilhados `_shared/ai-fetch.ts` e `_shared/model-router.ts`.

## 2. Escopo

Inclui:
- Buckets de Storage e políticas RLS de `storage.objects`.
- Inventário completo de edge functions relevantes ao domínio de auditoria: `audit-parse-pdf`, `audit-pipeline-process`, `audit-bs-dados`, `audit-analyze`, `audit-chat`, `enqueue-ai-job`, `process-ai-jobs-queue`, `document-ai-process`.
- Contrato JSON real de cada função (extraído do código-fonte).
- `supabase/config.toml` — `verify_jwt` por função.
- Secrets/env vars usadas (`Deno.env.get(...)`).
- Cabeçalhos CORS padronizados.
- Fila `pgmq` (`bex_ai_jobs` / `bex_ai_jobs_dlq`) e funções auxiliares `ai_jobs_claim_batch`, `move_to_dlq`, `read_email_batch`, `delete_email`, `enqueue_email`.
- `_shared/ai-fetch.ts` (retry/backoff) e `_shared/model-router.ts` (roteamento de modelo).

Não inclui: lógica de parsing de balancete (ver MD-PORT-05) nem orquestração de upload/pipeline_documents (ver MD-PORT-03) — apenas referências cruzadas quando necessário.

## 3. Pré-requisitos

- Projeto Supabase com `pgmq` habilitado (extensão de filas baseada em Postgres) — usado por `enqueue-ai-job`/`process-ai-jobs-queue` via RPCs (`enqueue_email`, `read_email_batch`, `delete_email`, `move_to_dlq`).
- Secret `LOVABLE_API_KEY` configurado (chave do Lovable AI Gateway — `https://ai.gateway.lovable.dev/v1/chat/completions`).
- Secrets `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY` (injetados automaticamente pelo runtime das edge functions Lovable Cloud).
- Opcional: `GOOGLE_DOCUMENT_AI_API_KEY`, `GOOGLE_DOC_AI_PROJECT_ID`, `GOOGLE_DOC_AI_LOCATION`, `GOOGLE_DOC_AI_PROCESSOR_ID` (usados apenas por `document-ai-process` quando o pipeline decide OCR via Google Document AI ao invés de multimodal Gemini).
- Deno runtime (`serve` de `https://deno.land/std@0.168.0/http/server.ts`) e `@supabase/supabase-js@2.45.0` (client) / `@2.95.0` (algumas funções mais novas usam `npm:@supabase/supabase-js@2.95.0`).

## 4. Storage — Buckets e Políticas

A plataforma **não usa Storage Buckets do Supabase para o fluxo principal de upload de balancetes**. O upload de PDFs/planilhas para extração via IA é feito **inteiramente em memória no browser**: o arquivo é convertido para Base64 (`fileToBase64` em `src/services/auditAIService.ts`) e enviado diretamente no corpo JSON da requisição HTTP para `audit-parse-pdf` ou `document-ai-process`. Não há persistência do arquivo binário original em `storage.objects`; apenas o **resultado estruturado** (JSON extraído) é persistido em `ocr_results.structured_json` (tabela Postgres).

O único bucket efetivamente utilizado no domínio de plataforma (fora do escopo direto de auditoria, mas parte do mesmo projeto) é:

```sql
INSERT INTO storage.buckets (id, name, public)
VALUES ('email-assets', 'email-assets', true)
ON CONFLICT (id) DO UPDATE SET public = true;

CREATE POLICY "Public read email-assets"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'email-assets');
```

Para replicar o comportamento de auditoria em outro projeto, **não é necessário criar bucket de storage para os arquivos de balancete**. Caso se deseje reter o binário original (auditoria/trilha de evidência), a recomendação de porte é:

```sql
INSERT INTO storage.buckets (id, name, public)
VALUES ('audit-source-documents', 'audit-source-documents', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Users can upload their own audit documents"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'audit-source-documents' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can read their own audit documents"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'audit-source-documents' AND auth.uid()::text = (storage.foldername(name))[1]);
```

Isso é uma extensão recomendada, não uma réplica do sistema original (que opera 100% via Base64 in-memory).

## 5. CORS — Padrão Global

Todas as edge functions do domínio compartilham o mesmo bloco de cabeçalhos CORS (copiado literalmente, com pequenas variações em `process-ai-jobs-queue`):

```ts
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};
```

Variante enxuta usada em `process-ai-jobs-queue/index.ts`:

```ts
const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type, apikey" };
```

Toda função responde a `OPTIONS` com `return new Response(null, { headers: corsHeaders })` (ou `"ok"` em `audit-bs-dados`, que usa `corsHeaders` importado de `npm:@supabase/supabase-js@2.95.0/cors`).

## 6. `supabase/config.toml` — verify_jwt por função

```toml
project_id = "mrvizydgxysaxazhmfqk"

[functions]
  [functions.revalidate-credentials]
    verify_jwt = false
  [functions.admin-create-user]
    verify_jwt = false
  [functions.audit-analyze]
    verify_jwt = false
  [functions.audit-chat]
    verify_jwt = false
  [functions.audit-parse-pdf]
    verify_jwt = false
  [functions.audit-pipeline-process]
    verify_jwt = false
  [functions.auth-email-hook]
    verify_jwt = false
  [functions.bootstrap-companies]
    verify_jwt = false
  [functions.document-ai-process]
    verify_jwt = false
  [functions.pipeline-diagnostic-seed]
    verify_jwt = false
  [functions.process-email-queue]
    verify_jwt = true
  [functions.enqueue-ai-job]
    verify_jwt = false
  [functions.process-ai-jobs-queue]
    verify_jwt = true
  [functions.email-template-preview]
    verify_jwt = false
```

**Observação crítica de porte:** `verify_jwt = false` no `config.toml` significa que o **gateway do Supabase não valida** o JWT antes de invocar a função — a validação (quando existe) é feita **manualmente dentro do código** da função via `supabase.auth.getUser(jwt)`. Isso é o padrão em `enqueue-ai-job` (valida explicitamente) e em `audit-pipeline-process` (valida explicitamente). Já `audit-parse-pdf`, `audit-analyze`, `audit-chat` e `document-ai-process` **não fazem nenhuma validação de usuário** — são efetivamente endpoints públicos protegidos apenas pela obscuridade da URL + rate limit do Lovable AI Gateway. Ao portar, decida conscientemente se este comportamento (endpoints de IA sem autenticação) é aceitável no novo ambiente; caso contrário, adicione validação de JWT manual nessas quatro funções mantendo `verify_jwt = false` (necessário porque o client chama com a **anon key**, não com o JWT do usuário, em alguns fluxos).

`process-ai-jobs-queue` tem `verify_jwt = true` porque é chamado apenas internamente: (a) por `pg_cron` a cada minuto usando o `service_role` key como `Authorization`, e (b) via `triggerWorker()` dentro de `enqueue-ai-job`, que também usa `SERVICE_KEY`.

## 7. Secrets / Variáveis de Ambiente

| Secret | Usado em | Propósito |
|---|---|---|
| `LOVABLE_API_KEY` | audit-parse-pdf, audit-pipeline-process, audit-analyze, audit-chat, enqueue-ai-job (indireto), process-ai-jobs-queue, document-ai-process | Bearer token do Lovable AI Gateway |
| `SUPABASE_URL` | todas | URL do projeto |
| `SUPABASE_SERVICE_ROLE_KEY` | audit-parse-pdf (persistência ocr_results), audit-pipeline-process, audit-bs-dados, audit-analyze, enqueue-ai-job, process-ai-jobs-queue, document-ai-process | Bypassa RLS para writes administrativos |
| `SUPABASE_ANON_KEY` | enqueue-ai-job | Cliente com JWT do usuário para respeitar RLS na inserção em `ai_jobs` |
| `GOOGLE_DOCUMENT_AI_API_KEY` | document-ai-process | API key do Google Document AI (OCR alternativo) |
| `GOOGLE_DOC_AI_PROJECT_ID` / `GOOGLE_DOC_AI_LOCATION` (default `"us"`) / `GOOGLE_DOC_AI_PROCESSOR_ID` | document-ai-process | Identificação do processor do Document AI |
| `BEX_FORCE_PROVIDER` | model-router.ts (`selectModel`) | Override manual de provedor (`"google"` \| `"openai"`) para cost-control emergencial |

Todos os `Deno.env.get(...)` são lidos no topo do módulo (top-level) quando o valor é obrigatório (ex.: `const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;` em `audit-pipeline-process`), ou dentro do handler quando opcional/validado explicitamente (ex.: `audit-parse-pdf`, que lança erro custom se ausente).

## 8. Inventário de Edge Functions

### 8.1 `audit-parse-pdf` (`supabase/functions/audit-parse-pdf/index.ts`)

**Propósito:** Parser multimodal de documento financeiro (PDF nativo via Gemini, sem OCR externo). É o "AGENTE PARSER MULTIFORMATO".

**Request:**
```json
{
  "fileBase64": "string (base64 do arquivo, sem prefixo data:)",
  "fileName": "string",
  "mimeType": "string (ex: application/pdf)",
  "documentId": "uuid | undefined (opcional — se presente, persiste em ocr_results)"
}
```

**Response 200:**
```json
{
  "extracted": {
    "pdfType": "PDF/A-1 | DOCX | OFX | SPED | ...",
    "documentInfo": { "empresa": "string", "periodo": "string", "tipo": "balancete|balanço|dre|dfc|extrato|relatório" },
    "years": ["2023", "2022"],
    "balanco": [ { "conta": "1", "descricao": "ATIVO TOTAL", "values": {"2023": 1000000, "2022": 900000} } ],
    "dre": [ { "conta": "3.01", "descricao": "RECEITA LÍQUIDA", "values": {"2023": 500000} } ]
  },
  "ocr_score": 0.85,
  "persisted": true
}
```

Erros: `400` (sem `fileBase64`), `429` (rate limit gateway), `402` (créditos insuficientes), `500` (erro genérico ou falha ao parsear JSON da IA).

**Modelo usado:** roteado via `selectModel("ocr_parse", "medium")` → `google/gemini-2.0-flash` (ver §11 model-router).

**Chamada ao gateway:**
```ts
const response = await aiGatewayFetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
  method: "POST",
  headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
  body: JSON.stringify({
    model: decision.model,
    messages: [
      { role: "system", content: EXTRACTION_PROMPT },
      { role: "user", content: [
          { type: "image_url", image_url: { url: `data:${mimeType || "application/pdf"};base64,${fileBase64}` } },
          { type: "text", text: `Extraia todos os dados financeiros deste documento (${fileName})...` },
        ] },
    ],
    temperature: 0.1,
    max_tokens: 16000,
  }),
}, { label: `ocr_parse:${decision.serviceTag}`, maxAttempts: 3, perAttemptTimeoutMs: 120_000 });
```

**Score OCR (`computeOcrScore`)** — heurística determinística (base 0.5, +0.15 se `balanco.length>0`, +0.10 se `dre.length>0`, +0.05 se `years.length>0`, +0.05 se `documentInfo` não vazio, +0.10 se total de linhas > 30, +0.05 se > 80), limitado a `[0,1]`.

**Persistência (best-effort, nunca quebra a resposta):** se `documentId` for informado e existir em `pipeline_documents`, insere em `ocr_results`:
```ts
await admin.from("ocr_results").insert({
  document_id: documentId,
  provider: "lovable_ai_gemini",
  ocr_score: ocrScore,
  raw_text: JSON.stringify(extracted).slice(0, 20000),
  structured_json: extracted,
});
```

**Reparo de JSON truncado (`extractAndRepairJson`)** — pipeline de 3 tentativas: (1) `JSON.parse` direto após strip de cercas ```` ```json ````; (2) remoção de vírgulas penduradas + caracteres de controle; (3) contagem de chaves/colchetes abertos/fechados fora de strings, fecha o balanceamento e tenta novamente a partir do último ponto "completo" (`},`, `]`, `",` etc.), desde que esse ponto esteja além de 50% do texto.

### 8.2 `audit-pipeline-process` (`supabase/functions/audit-pipeline-process/index.ts`, 1484 linhas)

**Propósito:** "Enterprise Balance Sheet Extraction & Canonical Reconciliation Engine (MD-001)". É o motor central que recebe o balancete já parseado (balanco[]/dre[]), normaliza semanticamente cada conta via LLM (com cache e fast-path), persiste `pipeline_documents`, calcula scores de qualidade e atualiza progresso em tempo real. Ver MD-PORT-03 e MD-PORT-04 para detalhes de orquestração e IA.

**Request (`PipelineRequest`):**
```ts
interface PipelineRequest {
  company_id?: string;
  document_id?: string;
  file_name: string;
  ocr_score?: number;
  balanco: BalanceteRow[];   // { conta, descricao, values: Record<string, number> }
  dre: BalanceteRow[];
  documentInfo?: { empresa?: string; periodo?: string; tipo?: string };
  dedup?: { balanco?: DedupOptions; dre?: DedupOptions };
  force_reprocess?: boolean;
}
```

**Resposta imediata:** `202 Accepted` com `{ document_id }` — o processamento pesado roda em background (worker assíncrono dentro da mesma invocação, usando `EdgeRuntime.waitUntil`-like padrão, atualizando `pipeline_documents.progress`/`status` via Realtime, consumido pelo frontend via subscription — ver MD-PORT-03 §5).

**Erro `409 pipeline_busy`:**
```json
{
  "error": "pipeline_busy",
  "message": "Já existe um processamento em andamento para esta empresa. Aguarde a conclusão (até 10 min) e tente novamente.",
  "active_document_id": "uuid"
}
```
com header `Retry-After: 30`. Ver detalhamento completo do lock em MD-PORT-03 §4.

**`PARSER_VERSION`** — constante de versionamento (`"2026.08.11.17"`) usada para invalidar automaticamente o cache de dedup por `content_hash` sempre que a lógica do parser muda (ela entra na composição do hash SHA-256, ver §9 abaixo e MD-PORT-03 §3).

### 8.3 `audit-bs-dados` (`supabase/functions/audit-bs-dados/index.ts`, 447 linhas)

**Propósito:** Implementação autoritativa server-side do motor de consolidação BS & Dados (espelha `src/services/bsDadosBuilder.ts` client-side), usada para PDFs/exports server-side e histórico de auditoria. Persiste em `pipeline_analysis_results.indicadores` quando `document_id` é fornecido, e cria `audits`/`balancetes`/`balancete_lines`/`bs_dados`/`indicadores`/`kanitz_scores`/`insights` quando `company_id` é fornecido.

**Request (modo padrão):**
```json
{
  "document_id": "uuid (opcional)",
  "company_id": "uuid (opcional — dispara criação de audit completa)",
  "audit_name": "string (opcional)",
  "variant": "completo (opcional)",
  "file_name": "string (opcional)",
  "content_hash": "string (opcional)",
  "balancetes": [
    { "mes": "YYYY-MM | Março 2024", "linhas": [ { "conta": "1.1.1", "descricao": "Caixa", "ref1": "A", "saldo": 1000.5 } ] }
  ]
}
```

**Request (modo reprocess):**
```json
{ "reprocess_audit_id": "uuid" }
```
Relê `balancetes`/`balancete_lines` já persistidas da auditoria, recalcula `bsDados`/`indicadores`/`kanitz`/`insights` com a lógica **atual** do motor (`core.ts`) e **regrava** as tabelas de snapshot (`bs_dados`, `indicadores`, `kanitz_scores`, `insights`), sem criar nova auditoria.

**Response (modo padrão):**
```json
{
  "bsDados": [ /* BSDadosRow[] por mês */ ],
  "indicadores": [ /* BSIndicators[] por mês */ ],
  "summary": { "meses": 3, "total_linhas": 540, "errors": 0, "rejected_meses": 0 },
  "persisted": true,
  "audit_id": "uuid | null"
}
```

**Sanitização crítica de `mesKey`:** todo `b.mes` é normalizado via `periodToMesKey` e validado com `/^\d{4}-(0[1-9]|1[0-2])$/`; balancetes cujo mês não normaliza para um `YYYY-MM` válido são **descartados** (`rejected[]`) para não quebrar o cast `::date` no Postgres. Se **todos** forem rejeitados, retorna `400`.

**Background tasks (`waitUntil`-style, não bloqueiam a resposta):** inserção em `pipeline_analysis_results` (snapshot legacy), inserção em `balancete_lines` em lotes de 500 linhas com concorrência 6 (`CONCURRENCY = 6`), e `audit_logs`.

### 8.4 `audit-analyze` (`supabase/functions/audit-analyze/index.ts`, 735 linhas)

**Propósito:** Motor multiagente de análise contábil (5 agentes em prompt único: Estruturador, Validador, Auditor, Risk Engine, Gerador de Relatório) — produz o diagnóstico Kanitz, indicadores e pendências. Implementa também as camadas de aprendizado contábil L0 (cache DB por empresa+período), L1 (match exato em `contabil_dictionary`), L2 (RAG por embedding via `match_contabil_dictionary`) e L3 (envio ao LLM apenas do que restou).

**Camadas de resolução de contas (`resolveAccounts`):**
1. **L0** — cache `audit_account_cache` por `(company_id, periodo, conta_original_normalizada)`; hit incrementa `hits`.
2. **L1** — `contabil_dictionary` com `frequencia >= 3` (match exato normalizado, sem acento/case).
3. **L2** — embeddings (`google/text-embedding-004` via `/v1/embeddings`) restrito aos top-25 por `|valor|` (controle de custo), com `match_contabil_dictionary` (RPC pgvector, `match_threshold: 0.85`).
4. **L3** — tudo que sobrar é enviado ao LLM (fora deste arquivo, delegado ao pipeline principal).

Persistência: upsert em `audit_account_cache` (`onConflict: "company_id,periodo,conta_original_normalizada"`), incremento de `hits` para L0.

**`SYSTEM_PROMPT`** (trecho real, ver arquivo fonte completo para os 5 agentes) define a estrutura JSON obrigatória de saída, incluindo `diagnostico`, `validacaoContabil`, `pendencias[]`, `indicadoresCalculados`, `kanitz`. Fórmulas explícitas no prompt:
```
LC = AC / PC | LS = (AC − Estoques) / PC | LG = (AC + RLP) / (PC + PNC) | LI = Caixa / PC
X1 = LL / PL | X2 = (AC + RLP) / (PC + ELP) | X3 = (AC − Estoques) / PC | X4 = AC / PC | X5 = − ((PC + ELP) / PL)
FI = 0,05·X1 + 1,65·X2 + 3,55·X3 − 1,06·X4 − 0,33·X5
```

### 8.5 `audit-chat` (`supabase/functions/audit-chat/index.ts`)

**Propósito:** Chat do "Auditor Contábil Sênior IA" com **escopo exclusivo** ao balancete carregado na auditoria (prompt proíbe explicitamente comparações externas/benchmarks de mercado).

**Request:**
```json
{
  "messages": [ { "role": "user", "content": "..." } ],
  "context": { "...": "objeto livre com dados da análise atual" },
  "criticality": "low | medium | high (opcional)"
}
```

**Response:** `text/event-stream` (streaming SSE repassado 1:1 do gateway — `return new Response(response.body, { headers: { ...corsHeaders, "Content-Type": "text/event-stream" } })`).

**Modelo:** `selectModel("chat_assistant", criticality || "medium")` → padrão `google/gemini-2.0-flash`, escala para `google/gemini-1.5-pro` em `criticality="high"`.

**Timeout/retry:** `aiGatewayFetch(..., { label: "audit_chat", maxAttempts: 3, perAttemptTimeoutMs: 60_000 })` — note que o chat usa timeout menor (60s) que os demais (120s), pois é interativo.

### 8.6 `enqueue-ai-job` (`supabase/functions/enqueue-ai-job/index.ts`)

**Propósito:** Endpoint síncrono e leve que **enfileira** um job assíncrono de IA (insight ou relatório) na fila `pgmq` `bex_ai_jobs`, grava o tracking em `ai_jobs` e dispara o worker (`process-ai-jobs-queue`) em background best-effort, retornando imediatamente.

**Request:**
```json
{
  "kind": "insight | report | custom",
  "payload": { "...": "objeto livre — ver §8.7 para shape esperado por kind" },
  "document_id": "uuid | null",
  "company_id": "uuid | null",
  "priority": 5
}
```

**Response 202:**
```json
{ "job_id": "uuid", "status": "queued" }
```

Fluxo interno:
1. Valida JWT manualmente: `userClient.auth.getUser(jwt)` (client criado com `ANON_KEY` + header `Authorization` do usuário, para que o INSERT em `ai_jobs` respeite RLS).
2. `INSERT INTO ai_jobs (kind, priority, requested_by, document_id, company_id, payload, status='queued')`.
3. Client admin (`SERVICE_KEY`) chama RPC `enqueue_email(queue_name: 'bex_ai_jobs', payload: { job_id, kind })` — nome da RPC é genérico (reaproveitado da fila de e-mails) mas opera sobre a fila `bex_ai_jobs`.
4. Se o enqueue falhar, marca `ai_jobs.status = 'failed'` imediatamente (evita job órfão).
5. Atualiza `ai_jobs.pgmq_msg_id` com o `msg_id` retornado.
6. Dispara `triggerWorker()` (fetch para `process-ai-jobs-queue` com `Authorization: Bearer ${SERVICE_KEY}`) — **best-effort**, não bloqueia a resposta.

`priority` é sempre clampado entre 1 e 10 (`clamp(body.priority ?? 5, 1, 10)`).

### 8.7 `process-ai-jobs-queue` (`supabase/functions/process-ai-jobs-queue/index.ts`)

**Propósito:** Worker da fila. Disparado (a) por `pg_cron` a cada minuto, (b) por auto-trigger pós-`enqueue`. Lê em lote, reserva jobs com `FOR UPDATE SKIP LOCKED`, processa em ondas de concorrência limitada, e trata falhas com retry/DLQ.

**Constantes:**
```ts
const MAX_BATCH = 6;        // mensagens lidas do pgmq por execução
const CONCURRENCY = 3;      // jobs processados em paralelo
const VISIBILITY_SEC = 300; // 5 min — visibility timeout do pgmq
```

**Fluxo:**
1. `sb.rpc("read_email_batch", { queue_name: "bex_ai_jobs", batch_size: 6, vt: 300 })` — lê até 6 mensagens, tornando-as invisíveis por 300s para outras instâncias.
2. `sb.rpc("ai_jobs_claim_batch", { p_limit: ids.length })` — reserva os jobs correspondentes (`status → 'processing'`), com `SKIP LOCKED` para evitar corrida entre instâncias concorrentes do worker.
3. Processa em ondas de `CONCURRENCY = 3` via `Promise.all`.
4. Sucesso: `ai_jobs.status='completed'`, grava `result`, `finished_at`; `sb.rpc("delete_email", { queue_name, message_id })` remove a mensagem da fila.
5. Falha com tentativas restantes (`job.attempts < job.max_attempts`): `ai_jobs.status='queued'` + `error_message`; **não deleta a mensagem** — o pgmq reentrega automaticamente após o visibility timeout expirar.
6. Falha esgotando tentativas: `ai_jobs.status='failed'` + `sb.rpc("move_to_dlq", { source_queue: "bex_ai_jobs", dlq_name: "bex_ai_jobs_dlq", message_id, payload })`.

**Roteador interno por `kind` (`runJob`):**
- `insight` → `runInsight` — usa `selectModel("audit_insights", "medium", signals)`, tool call obrigatório `return_audit_insights` com schema `{ resumo, pontos_atencao[], recomendacoes[] }`, `maxAttempts: 3, perAttemptTimeoutMs: 90_000`.
- `report` → `runReport` — usa `selectModel("report_generation", "medium", signals)`, tool call `return_report_sections` (`sections: Record<string,string>`), `perAttemptTimeoutMs: 120_000`.
- `custom` → `runCustom` — encaminha payload cru ao gateway com modelo default `google/gemini-2.5-flash`, `perAttemptTimeoutMs: 90_000`.

Payload de `insight`/`report` (`job.payload`):
```ts
{ signals?: RiskSignals; contexto: string; prompt?: string; secoes?: string[] }
```
`RiskSignals` (definido em `model-router.ts`) permite recalcular a criticidade dinamicamente dentro do job (ver §11).

### 8.8 `document-ai-process` (`supabase/functions/document-ai-process/index.ts`)

**Propósito:** Pipeline OCR multi-engine + estruturação via IA, usado como alternativa/complemento a `audit-parse-pdf` para formatos não-PDF ou quando se deseja usar Google Document AI ao invés do multimodal Gemini nativo.

**Roteamento por MIME (constantes `DOC_AI_MIMES`, `SPREADSHEET_MIMES`, `WORD_MIMES`, `TEXT_MIMES`):**
- PDF/imagens → Google Document AI (`extractFromDocumentAI`) — requer `GOOGLE_DOCUMENT_AI_API_KEY` + `projectId`/`processorId`; retorna `400` explicando quais faltam se ausentes.
- XLSX/XLS/ODS/CSV/TSV → `xlsx@0.18.5` (`extractFromSpreadsheet`/`extractFromCsv`).
- DOCX/DOC → `mammoth@1.8.0` (`extractFromDocx`).
- TXT/MD/RTF → decodificação direta (`extractFromText`).
- MIME desconhecido → `415`.

**Truncamento de contexto:** `MAX_CHARS = 120_000` — texto extraído maior é cortado com marcador `"\n\n[... TEXTO TRUNCADO ...]"`.

**Estruturação:** chamada direta (sem `aiGatewayFetch`, sem retry) ao gateway com `model: "google/gemini-2.5-flash"`, `temperature: 0.1`, `max_tokens: 16000`, usando o prompt `STRUCTURE_PROMPT` (mesmo schema de saída de `audit-parse-pdf`, adaptado a texto bruto ao invés de imagem).

**Response 200:**
```json
{
  "ok": true,
  "pipeline": "xlsx-parser (2 abas, 340 linhas) → gemini-2.5-flash",
  "ocr": { "pages": 2, "chars": 48213, "engine": "xlsx-parser (2 abas, 340 linhas)" },
  "extracted": { "pdfType": "XLSX", "documentInfo": {...}, "years": [...], "balanco": [...], "dre": [...] }
}
```

## 9. `_shared/ai-fetch.ts` — Retry/Backoff do AI Gateway

Wrapper único usado por **todas** as chamadas ao Lovable AI Gateway que precisam de resiliência (todas exceto `document-ai-process`, que chama `fetch` cru).

```ts
export interface AIFetchOptions {
  maxAttempts?: number;        // default 3
  baseDelayMs?: number;        // default 400
  maxDelayMs?: number;         // default 4000
  perAttemptTimeoutMs?: number;// default 120000
  label?: string;
}

const RETRYABLE_STATUS = new Set([429, 502, 503, 504]);
```

**Regras de retry:**
- Retenta apenas `429/502/503/504`. Nunca retenta outros 4xx nem sucesso.
- Backoff exponencial com **full jitter**: `delay = random() * min(cap, base * 2^(attempt-1))`.
- Se o header `Retry-After` estiver presente na resposta 429, ele **tem prioridade** sobre o backoff exponencial (`pickDelay` usa o valor em segundos convertido para ms, respeitando o teto `maxDelayMs`).
- Timeout por tentativa via `AbortController` — combina com um `signal` externo eventualmente passado em `init.signal`.
- Em caso de exaustão de tentativas por erro de rede/timeout, propaga a última `Response` retryável se existir; caso contrário relança o erro original.
- Consome o corpo da resposta retryável (`await res.text()`) antes de tentar de novo, para evitar vazamento de conexão no runtime Deno.

Uso típico (idêntico em todas as funções que chamam LLM):
```ts
const response = await aiGatewayFetch(url, init, { label: "ocr_parse:gemini_2_flash", maxAttempts: 3, perAttemptTimeoutMs: 120_000 });
```

## 10. Tabela de Timeouts/Retries por Função

| Função / operação | maxAttempts | perAttemptTimeoutMs | Observação |
|---|---|---|---|
| audit-parse-pdf (parse principal) | 3 | 120000 | multimodal |
| audit-pipeline-process → `callLLMNormalize` | 3 | 120000 | normalização em chunk (LLM) |
| audit-chat | 3 | 60000 | streaming interativo |
| process-ai-jobs-queue → `runInsight` | 3 | 90000 | tool call |
| process-ai-jobs-queue → `runReport` | 3 | 120000 | tool call, texto extenso |
| process-ai-jobs-queue → `runCustom` | 3 | 90000 | payload cru |
| document-ai-process (estruturação) | 1 (sem wrapper) | sem timeout explícito | usa `fetch` cru, não `aiGatewayFetch` |

## 11. `_shared/model-router.ts` — Matriz de Roteamento de Modelo

Ver detalhamento completo (incluindo `computeCriticality`) em MD-PORT-04. Resumo estrutural necessário para o entendimento da topologia:

```ts
export type ProcessKey =
  | "ocr_parse" | "structure_extract" | "audit_insights"
  | "risk_advanced" | "chat_assistant" | "embeddings" | "report_generation";

export type Criticality = "low" | "medium" | "high";

export const ROUTING_MATRIX: Record<ProcessKey, Record<Criticality, { model: string; provider: "google"|"openai"; serviceTag: string }>> = {
  ocr_parse:          { low: gemini_2_flash, medium: gemini_2_flash, high: gemini_1.5_pro },
  structure_extract:  { low: gemini_2_flash, medium: gemini_2_flash, high: gemini_1.5_pro },
  audit_insights:     { low: gemini_2_flash, medium: gemini_1.5_pro, high: gpt4o },
  risk_advanced:      { low: gpt4o_mini,     medium: gpt4o,          high: gpt4o },
  chat_assistant:     { low: gemini_2_flash, medium: gemini_2_flash, high: gemini_1.5_pro },
  embeddings:         { low: text-embedding-004 (fixo nas 3 criticidades) },
  report_generation:  { low: gemini_2_flash, medium: gemini_1.5_pro, high: gpt4o },
};

export const MODEL_FALLBACK: Record<string, string[]> = {
  "google/gemini-1.5-pro":   ["openai/gpt-4o"],
  "google/gemini-2.0-flash": ["google/gemini-1.5-pro", "google/gemini-1.5-flash"],
  "openai/gpt-4o":           ["google/gemini-1.5-pro"],
};
```

`selectModel(process, criticality, signals?)` retorna `{ model, provider, serviceTag, reason, criticality }`, aplicando override de `BEX_FORCE_PROVIDER` quando definido (fallback para `openai/gpt-5-mini` ou `google/gemini-3-flash-preview`).

## 12. Fila `pgmq` — `ai_jobs`, `bex_ai_jobs`, DLQ

**Tabelas/objetos envolvidos:**
- Tabela de tracking `public.ai_jobs` — colunas usadas no código: `id, kind, priority, requested_by, document_id, company_id, payload, status, attempts, max_attempts, pgmq_msg_id, result, error_message, finished_at`.
- Fila pgmq `bex_ai_jobs` (nome lógico da fila de jobs de IA — reaproveita a infraestrutura pgmq originalmente criada para e-mails, daí os nomes de RPC `enqueue_email`/`read_email_batch`/`delete_email`).
- Fila DLQ `bex_ai_jobs_dlq`.

**Funções SQL SECURITY DEFINER (RPCs) chamadas pelas edge functions** — todas com `EXECUTE` **revogado** de `anon`/`authenticated`/`PUBLIC` (apenas `service_role` pode chamar, conforme migração `20260525173801`):
```sql
REVOKE EXECUTE ON FUNCTION public.ai_jobs_claim_batch(integer) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.ai_jobs_dlq_peek(integer) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.ai_jobs_dlq_purge(bigint) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.ai_jobs_queue_stats() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.ai_jobs_retry(uuid) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.ai_jobs_timeseries(text) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.calculate_ai_cost(text, numeric, numeric, numeric, numeric) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.enqueue_email(text, jsonb) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.delete_email(text, bigint) FROM anon, authenticated, PUBLIC;
```

Isso implica que **todo** acesso à fila via RPC deve ocorrer com o client Supabase criado com `SUPABASE_SERVICE_ROLE_KEY` (jamais com `anon`/JWT de usuário) — exatamente como implementado em `enqueue-ai-job` (client `adminClient`) e `process-ai-jobs-queue` (client `sb` global com `SERVICE_KEY`).

**Ciclo de vida de uma mensagem:**
1. `enqueue-ai-job` insere `ai_jobs` (status `queued`) e chama `enqueue_email('bex_ai_jobs', {job_id, kind})` → recebe `msg_id`.
2. `process-ai-jobs-queue` lê em lote com `read_email_batch('bex_ai_jobs', 6, 300)` (visibility timeout 300s).
3. `ai_jobs_claim_batch(p_limit)` faz `SELECT ... FOR UPDATE SKIP LOCKED` e marca `status='processing'`.
4. Sucesso → `delete_email` remove definitivamente a mensagem.
5. Falha reentregável → mensagem permanece na fila (reaparece após VT expirar); `ai_jobs.status` volta a `queued`.
6. Falha definitiva (`attempts >= max_attempts`) → `move_to_dlq('bex_ai_jobs', 'bex_ai_jobs_dlq', message_id, payload)` + `ai_jobs.status='failed'`.

**`calculate_ai_cost`** é chamada indiretamente (não via RPC direto no worker, mas o padrão de custo em `trackUsage` de `audit-pipeline-process`/`audit-analyze`/`document-ai-process` lê `ai_cost_config` e calcula custo em código, gravando em `ai_usage_logs` — ver MD-PORT-04 §7 para o detalhamento completo do modelo de custo).

## 13. Checklist de Implementação

- [ ] Criar as 8 edge functions listadas em §8 com os nomes exatos (usados por `functions.invoke` no client e por `config.toml`).
- [ ] Copiar `_shared/ai-fetch.ts` e `_shared/model-router.ts` sem alterações estruturais (apenas ajustar `ROUTING_MATRIX` se os modelos disponíveis no novo Lovable AI Gateway diferirem).
- [ ] Configurar `supabase/config.toml` com os blocos `[functions.<nome>]` e `verify_jwt` exatamente como em §6, decidindo explicitamente sobre autenticação manual nas funções com `verify_jwt=false`.
- [ ] Provisionar secrets: `LOVABLE_API_KEY` obrigatório; `GOOGLE_DOCUMENT_AI_API_KEY`/`GOOGLE_DOC_AI_*` apenas se for usar `document-ai-process` com Document AI.
- [ ] Criar tabela `ai_jobs` com as colunas de §12 e RLS permitindo `INSERT`/`SELECT` apenas do próprio `requested_by`.
- [ ] Provisionar `pgmq` e criar as filas `bex_ai_jobs` / `bex_ai_jobs_dlq`, além das RPCs `enqueue_email`, `read_email_batch`, `delete_email`, `move_to_dlq`, `ai_jobs_claim_batch` (com `REVOKE EXECUTE` de `anon`/`authenticated`).
- [ ] Configurar `pg_cron` para chamar `process-ai-jobs-queue` a cada minuto com o `service_role` key.
- [ ] Criar tabelas de custo `ai_cost_config` e `ai_usage_logs` (ver MD-PORT-04 §7).
- [ ] Validar CORS idêntico em todas as funções (copiar bloco de §5).
- [ ] Confirmar que nenhum arquivo binário de balancete precisa de bucket dedicado, a menos que se opte pela extensão de trilha de evidência (§4).

## 14. Critérios de Homologação

1. `POST audit-parse-pdf` com um PDF de balancete real retorna `extracted.balanco` e `extracted.dre` não vazios e `ocr_score` entre 0 e 1.
2. `POST enqueue-ai-job` com `kind="insight"` retorna `202` com `job_id`, e em até 60s (via `pg_cron` ou trigger automático) o registro em `ai_jobs` muda para `status="completed"` com `result.insights` preenchido.
3. Forçar um erro 503 simulado no gateway confirma que `aiGatewayFetch` faz exatamente 3 tentativas com backoff crescente (validar via logs `[label] tentativa N/3 ... backoff Xms`).
4. Disparar 2 requisições simultâneas de `audit-pipeline-process` para a mesma `company_id` deve retornar `409 pipeline_busy` na segunda enquanto a primeira está em `pending/normalizing/processing` e `updated_at` recente (< 3 min).
5. Um job de IA que falha 3 vezes seguidas deve aparecer em `bex_ai_jobs_dlq` (verificável via `ai_jobs_dlq_peek`) e `ai_jobs.status='failed'`.
6. Nenhuma função do domínio deve responder sem os cabeçalhos CORS de §5 em requisições `OPTIONS`.
7. `verify_jwt` no `config.toml` deve bater exatamente com a tabela de §6; qualquer divergência é falha de homologação.
