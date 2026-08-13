# MD-PORT-03 — Upload e Orquestração do Pipeline (BEx Platform)

## 1. Objetivo
Descrever, com precisão de implementação, o fluxo completo desde o upload de arquivo no frontend (`src/pages/Audit.tsx`, `src/services/auditAIService.ts`) até a consolidação em `pipeline_documents`, incluindo: cálculo de `content_hash`, deduplicação, locks de concorrência por `company_id` (janela de 10 min, bypass de stale lock de 3 min), estados de `status`/`progress`, tratamento do erro `409 pipeline_busy` com toast no frontend, e a máquina de estados completa do pipeline.

## 2. Escopo
- Fluxo de upload multi-arquivo (`parseMultipleFiles`), detecção de tipo de arquivo, conversão Base64.
- Disparo do pipeline (`runAuditPipeline`) e realtime subscription de progresso.
- Lock distribuído por `company_id` em `audit-pipeline-process`.
- Dedup por `content_hash` (SHA-256) e por resultado já `completed`.
- Reconciliação de retries e do polling de fallback (8 min).
- Máquina de estados de `pipeline_documents.status`.

## 3. Upload no Frontend

### 3.1 Detecção de tipo de arquivo
`src/services/auditAIService.ts` classifica cada `File` por extensão:
```ts
const SPREADSHEET_EXTENSIONS = [".xlsx", ".xls", ".csv", ".xlsm", ".xlsb", ".xltx", ".xltm"];
const PDF_EXTENSIONS = [".pdf"];
const DOCUMENT_EXTENSIONS = [".docx", ".doc", ".txt", ".rtf"];
const DATA_EXTENSIONS = [".json", ".xml", ".ofx", ".sped"];
```
`isPDF`, `isSpreadsheet`, `isDocument`, `isDataFile` roteiam para `parseFile`:
```ts
export async function parseFile(file: File, documentId?: string): Promise<ParsedFinancialData> {
  if (isPDF(file) || isDocument(file)) return parseDocumentAI(file, documentId);
  if (isDataFile(file)) return parseDataFileAI(file);
  return parseSpreadsheet(file);
}
```

### 3.2 Conversão para Base64 (sem storage bucket)
```ts
async function fileToBase64(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}
```
O binário nunca é persistido em Storage — apenas transportado in-memory até `audit-parse-pdf`/`document-ai-process`, que devolvem o JSON estruturado.

### 3.3 Parse multi-arquivo e consolidação
`parseMultipleFiles(files: File[])` itera sequencialmente (não paralelo, para não estourar rate limit do gateway), acumulando `balanco[]`/`dre[]`/`years[]` e registrando por arquivo: `{ fileName, format, type, rows, success, error? }`. Falhas individuais não abortam o lote — o array `fileResults` reporta o erro por item e a UI (`Audit.tsx`) loga `console.warn("Some files failed:", failedFiles)` sem bloquear o fluxo.

## 4. Disparo do Pipeline e Content Hash

### 4.1 `runAuditPipeline` (client → edge function)
```ts
export async function runAuditPipeline(
  parsedData: ParsedFinancialData,
  fileName: string,
  companyId?: string,
  existingDocumentId?: string,
  dedup?: DedupConfig,
  onProgress?: (ev: PipelineProgressEvent) => void,
  forceReprocess?: boolean,
): Promise<PipelineResult | null> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return null;

  const response = await fetch(`${SUPABASE_URL}/functions/v1/audit-pipeline-process`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify({
      company_id: companyId,
      document_id: existingDocumentId,
      file_name: fileName,
      balanco: parsedData.balanco,
      dre: parsedData.dre,
      documentInfo: parsedData.documentInfo,
      ocr_score: parsedData.ocrScore,
      ...(dedup ? { dedup } : {}),
      ...(forceReprocess ? { force_reprocess: true } : {}),
    }),
  });
  ...
}
```
Note que a requisição usa o **JWT do usuário logado** (`session.access_token`), não a `anon key` — coerente com `verify_jwt=false` no `config.toml` mas validação manual dentro da função (`supabase.auth.getUser(jwt)`).

### 4.2 Cálculo do `content_hash` (server-side, `audit-pipeline-process`)
```ts
const PARSER_VERSION = "2026.08.11.17"; // bump invalida cache de dedup

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function buildContentHashSource(body: PipelineRequest): string {
  const norm = (rows: BalanceteRow[] = []) =>
    rows.map((r) => `${r.conta || ""}|${r.descricao || ""}|${Number(r.valor) || 0}`).sort().join("\n");
  return [
    `parser:${PARSER_VERSION}`,
    body.company_id || "",
    body.documentInfo?.periodo || "",
    norm(body.balanco),
    "::dre::",
    norm(body.dre),
  ].join("\n");
}

const contentHash = await sha256Hex(buildContentHashSource(body));
```
**Ponto crítico de porte:** o hash inclui `parser:${PARSER_VERSION}` como primeiro componente — isso significa que **qualquer bump** de versão do parser invalida automaticamente todos os caches de dedup anteriores, forçando reprocessamento mesmo com dados idênticos. Isso é intencional (evita servir resultados calculados por lógica desatualizada).

## 5. Lock de Concorrência por `company_id`

Implementado inteiramente dentro do handler HTTP de `audit-pipeline-process` (síncrono, antes de responder `202`):

```ts
if (body.company_id) {
  const lockSince = new Date(Date.now() - 10 * 60_000).toISOString();   // janela do lock: 10 min
  const staleSince = new Date(Date.now() - 3 * 60_000).toISOString();   // bypass de stale lock: 3 min

  const { data: activePipeline } = await supabase
    .from("pipeline_documents")
    .select("id, status, updated_at")
    .eq("company_id", body.company_id)
    .in("status", ["pending", "normalizing", "processing"])
    .gte("updated_at", lockSince)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (activePipeline?.id && activePipeline.id !== body.document_id) {
    const isStale = new Date(activePipeline.updated_at) < new Date(staleSince);

    if (!isStale) {
      // BLOQUEIA: retorna 409 pipeline_busy
      return new Response(JSON.stringify({
        error: "pipeline_busy",
        message: "Já existe um processamento em andamento para esta empresa. Aguarde a conclusão (até 10 min) e tente novamente.",
        active_document_id: activePipeline.id,
      }), { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json", "Retry-After": "30" } });
    } else {
      // BYPASS: lock "morto" (sem update há mais de 3 min) — libera e sobrescreve
      await supabase.from("pipeline_documents")
        .update({ status: "failed", error_message: "Overridden by new pipeline request (stale lock)" })
        .eq("id", activePipeline.id);
    }
  }
}
```

**Regras exatas:**
1. O lock só se aplica quando `company_id` é fornecido no request.
2. Considera "ativo" qualquer `pipeline_documents` da mesma empresa com `status IN ('pending','normalizing','processing')` e `updated_at >= now() - 10min`.
3. Se o documento ativo encontrado for o **mesmo** `document_id` do request atual (reprocessamento do próprio doc), o lock **não se aplica** (`activePipeline.id !== body.document_id`).
4. Se existir lock ativo de outro documento e `updated_at` for **recente** (dentro dos últimos 3 min), retorna `409` com `Retry-After: 30`.
5. Se `updated_at` do lock ativo for **mais antigo que 3 min** (mas ainda dentro da janela de 10 min), é considerado **stale**: o pipeline anterior é marcado `status="failed"` com `error_message="Overridden by new pipeline request (stale lock)"`, e o **novo** pipeline prossegue normalmente.
6. Esse mecanismo assume que uma pipeline saudável atualiza `pipeline_documents.updated_at` com frequência maior que 3 minutos (via `updateProgress`, ver §7); um worker travado/morto (crash, timeout do runtime) para de atualizar e vira elegível a stale-override em até 3 minutos.

## 6. Deduplicação por `content_hash`

Ocorre **apenas quando `document_id` não é informado** (i.e., não é um reprocessamento explícito de documento existente):

```ts
if (body.document_id) {
  // Atualiza documento existente, sem dedup
  const updatePayload = { status: "normalizing", content_hash: contentHash, parser_version: PARSER_VERSION, ...(body.company_id && { company_id: body.company_id }) };
  await supabase.from("pipeline_documents").update(updatePayload).eq("id", documentId);
} else {
  const dup = body.force_reprocess ? null : (await supabase
    .from("pipeline_documents")
    .select("id, status")
    .eq("content_hash", contentHash)
    .eq("created_by", userId)
    .eq("status", "completed")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()).data;

  if (dup?.id) {
    // reaproveita documento já processado — não reprocessa
  }
}
```
Critérios de match: mesmo `content_hash` **E** mesmo `created_by` (usuário) **E** `status='completed'`. `force_reprocess=true` (botão "Forçar reprocessamento" na UI) ignora completamente este dedup hit.

## 7. Progresso em Tempo Real (`pipeline_documents.progress`)

O worker background chama repetidamente:
```ts
async function updateProgress(supabase, documentId: string, message: string) {
  try {
    await supabase.from("pipeline_documents")
      .update({ progress: message, updated_at: new Date().toISOString() })
      .eq("id", documentId);
  } catch (_) { /* não-crítico */ }
}
```
Cada chamada também atualiza `updated_at`, o que **realimenta o mecanismo de stale-lock** de §5 (pipelines vivos "renovam" seu próprio lock a cada etapa).

## 8. Consumo do Progresso no Frontend

`runAuditPipeline` (client) usa **duas estratégias em paralelo**: Realtime subscription + polling de fallback.

```ts
const channel = supabase
  .channel(`pipeline-doc-${documentId}`)
  .on("postgres_changes", { event: "UPDATE", schema: "public", table: "pipeline_documents", filter: `id=eq.${documentId}` },
    (payload) => {
      const row: any = payload.new;
      if (row) onProgress?.({ status: row.status ?? "processing", progress: row.progress ?? null, documentId });
    })
  .subscribe();

// 2b. Polling como fallback (caso realtime perca um evento) até status final — até 8min
```
O polling de fallback existe porque conexões Realtime podem cair silenciosamente (especialmente em redes corporativas/proxy); o teto documentado no código é **8 minutos** de espera total antes de desistir.

## 9. Tratamento de `409 pipeline_busy` no Frontend

Camada 1 — `runAuditPipeline` (`auditAIService.ts`):
```ts
if (!response.ok) {
  if (response.status === 409) {
    const body = await response.json();
    const errorMsg = body?.message || "Já existe um processamento em andamento para esta empresa.";
    onProgress?.({ status: "error", progress: errorMsg, documentId: body?.active_document_id });
    throw new Error(`pipeline_busy: ${errorMsg}`);
  }
  console.warn("Pipeline enqueue falhou:", response.status);
  return null;
}
```

Camada 2 — `Audit.tsx` (captura do `throw` acima e exibição de toast):
```tsx
} catch (e: any) {
  console.warn("Pipeline IA pulado (continuando análise):", e);
  if (e?.message?.includes("pipeline_busy") || (e instanceof Response && e.status === 409)) {
    toast({
      title: "Processamento em andamento",
      description: "Já existe uma análise sendo executada para esta empresa. Por favor, aguarde alguns instantes.",
      variant: "default",
    });
  }
}
```
**Decisão de design importante:** o erro `pipeline_busy` **não interrompe** o fluxo de análise geral do usuário — o `catch` engole o erro, mostra o toast informativo, e a função de análise (`handleAnalyze`/similar em `Audit.tsx`) **continua** para as etapas seguintes (ex.: consolidação BS & Dados local, exibição de relatório com os dados já parseados no client), tratando o pipeline IA server-side como um "enriquecimento opcional" e não uma dependência bloqueante.

## 10. Máquina de Estados — `pipeline_documents.status`

```
                 ┌──────────┐
   (insert)  →   │ pending  │
                 └────┬─────┘
                      │ (worker inicia)
                      ▼
               ┌─────────────┐      (retry de normalização
               │ normalizing │◄──┐   com modelo diferente)
               └──────┬──────┘   │
                      │──────────┘
                      ▼
               ┌─────────────┐
               │ processing  │  (agregação BS&Dados, cálculo Kanitz, insights)
               └──────┬──────┘
             ┌────────┴─────────┐
             ▼                  ▼
      ┌────────────┐     ┌───────────┐
      │ completed  │     │  failed   │
      └────────────┘     └───────────┘
```

Transições observadas no código-fonte:
- `pending` → `normalizing`: setado no handler síncrono ao (re)usar um `document_id` existente (`updatePayload.status = "normalizing"`), ou implicitamente ao criar novo documento.
- `normalizing`/`processing` → `failed`: (a) exceção não tratada no worker (`catch` global grava `status:"failed", error_message`); (b) override por stale lock (outro processo assume o `company_id`); (c) falha determinística de negócio (ex.: nenhum mês válido — tratado em `audit-bs-dados`, não aqui, mas segue o mesmo padrão de `status` textual).
- `processing` → `completed`: ao final do worker, com `progress: "Concluído"`.
- Estados considerados "ativos" para fins de lock (§5): `pending`, `normalizing`, `processing`.

## 11. Retries Internos do Worker (Normalização Semântica)

Dentro do worker (não exposto ao client), cada chunk de contas é normalizado com **retry de modelo diferente** (não apenas retry de rede):
```ts
async function normalizeChunk(rows, dictText) {
  let accounts = await callLLMNormalize(rows, dictText, "google/gemini-2.0-flash");
  if (!accounts || accounts.length !== rows.length) {
    accounts = await callLLMNormalize(rows, dictText, "google/gemini-1.5-pro"); // retry com outro modelo
  }
  if (!accounts) {
    // fallback determinístico sem IA: classifyAccount() heurístico
    return rows.map((row) => { const { tipo, categoria } = classifyAccount(row.descricao || row.conta); return { conta_normalizada: row.descricao || row.conta, categoria, tipo, matched: false }; });
  }
  return rows.map((row, i) => accounts![i] ?? fallbackHeuristic(row));
}
```
Cada chamada individual (`callLLMNormalize`) já usa `aiGatewayFetch(..., { label: "llm_normalize", maxAttempts: 3, perAttemptTimeoutMs: 120_000 })` — logo o pior caso é **até 6 tentativas totais** por chunk (3 no modelo Flash + 3 no modelo Pro) antes de cair no fallback 100% determinístico (`classifyByCode`/`classifyAccount`), garantindo que o pipeline **nunca trava indefinidamente** por indisponibilidade do provedor de IA.

`CHUNK_SIZE = 120`, `MAX_PARALLEL = 12` — contas são divididas em lotes de até 120 itens, processados com até 12 chamadas LLM concorrentes.

## 12. Fast-Path Sem LLM (`tryFastPath`)

Antes de qualquer chamada LLM, cada linha passa por 3 níveis de resolução determinística: (1) cache em memória (`NORMALIZE_CACHE`, até 5000 entradas, FIFO); (2) cache persistente `contabil_dictionary`/`audit_account_cache` (DB); (3) **código de conta brasileiro como autoridade** (`classifyByCode` — plano 1.x/2.x/3.x/4.x/5.x é estrutural e cobre ~100% dos casos sem ambiguidade). Apenas o resíduo sem código reconhecível e sem cache vai para o LLM.

## 13. Checklist de Implementação

- [ ] Implementar `fileToBase64` e o roteador `parseFile` exatamente como em §3.
- [ ] Implementar `buildContentHashSource`/`sha256Hex` com a string de composição EXATA de §4.2 (incluindo `parser:${PARSER_VERSION}` como primeiro componente).
- [ ] Definir e versionar manualmente uma constante `PARSER_VERSION` — todo bump de lógica de negócio relevante deve incrementá-la.
- [ ] Implementar o lock de `company_id` com as janelas exatas: 10 min (lock ativo) e 3 min (stale bypass).
- [ ] Garantir que o worker chame `updateProgress` com frequência suficiente (idealmente a cada etapa, nunca deixando passar > 3 min sem update) para não ser vítima do próprio stale-lock bypass.
- [ ] Implementar resposta `409` com corpo `{ error: "pipeline_busy", message, active_document_id }` e header `Retry-After: 30`.
- [ ] No client, tratar `409` sem interromper o fluxo de UX — apenas notificar via toast e prosseguir com dados client-side disponíveis.
- [ ] Implementar Realtime subscription (`postgres_changes` em `pipeline_documents`) + polling de fallback com teto de 8 min.
- [ ] Implementar dedup por `content_hash` + `created_by` + `status='completed'`, com bypass via `force_reprocess`.
- [ ] Implementar fast-path determinístico (código de conta) antes de qualquer chamada LLM de normalização.
- [ ] Implementar retry de modelo diferente (Flash → Pro) antes de cair no fallback heurístico 100% local.

## 14. Critérios de Homologação

1. Duas requisições simultâneas de pipeline para a mesma `company_id`: a segunda deve retornar `409` enquanto a primeira estiver em `pending/normalizing/processing` com `updated_at` < 3 min.
2. Após travar deliberadamente um worker (ex.: matar o processo) e aguardar > 3 min, uma nova requisição para a mesma empresa deve **suceder** (bypass de stale lock) e o documento antigo deve aparecer como `status='failed'` com a mensagem exata `"Overridden by new pipeline request (stale lock)"`.
3. Reenviar o **mesmo** balancete (mesmos `balanco`/`dre`/`periodo`/`company_id`) sem `document_id` e sem `force_reprocess` deve reaproveitar o documento já `completed` (mesmo `content_hash`), sem reprocessar.
4. Definir `force_reprocess: true` no mesmo cenário do item 3 deve **forçar** reprocessamento completo.
5. Alterar `PARSER_VERSION` e reenviar dados idênticos deve gerar um `content_hash` diferente, invalidando o dedup do item 3.
6. No frontend, disparar um upload enquanto outro está em andamento para a mesma empresa deve exibir o toast "Processamento em andamento" e não travar a tela nem lançar exceção não tratada no console.
7. O campo `pipeline_documents.progress` deve mudar de valor ao menos 3 vezes durante um processamento típico, sendo o valor final exatamente `"Concluído"` quando `status='completed'`.
