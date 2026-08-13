# MD-PORT-00 — Visão Geral, Arquitetura e Ordem de Execução

## Objetivo

Este documento é o mapa mestre da plataforma **BEx (Balanço Executivo / Auditoria Financeira IA)**,
construída em **React + Vite + Supabase (Lovable Cloud)**. Ele descreve, em nível de arquitetura, o
fluxo completo de dados — **Upload → Parser IA → Motor Canônico P1 → Fatos Residuais → Snapshot
Certificado → Indicadores/Kanitz → Renderer/PDF** — e define a **ordem exata** em que os demais 17
documentos MD-PORT-XX devem ser aplicados para reconstruir o sistema byte-a-byte em outro projeto
Lovable Cloud/Supabase.

Este MD-00 não contém instruções de implementação linha-a-linha (isso está nos MDs específicos);
ele contém o **inventário de arquivos**, as **dependências entre blocos**, os **invariantes de
negócio (Core Freeze)** e os **critérios de homologação globais** que todo o sistema replicado deve
satisfazer.

## Escopo

Cobre:
- A arquitetura de alto nível (frontend React/Vite, Supabase Postgres, Edge Functions Deno, Storage,
  filas `pgmq`, AI Gateway Lovable).
- O inventário de todos os arquivos relevantes de `src/services`, `src/components/audit`,
  `src/pages/Audit.tsx`, `supabase/functions/*` e `src/index.css`.
- Os invariantes de negócio que **nunca podem ser violados** em nenhuma reimplementação
  (MD-001, P1 Synthetic Authority, Kanitz NOT_APPLICABLE, Source Binding).
- A ordem de aplicação dos MDs de portabilidade 01 a 17 (assumindo que os MDs 06–17, não incluídos
  neste lote, cobrem UI/Kanitz UI/Relatórios/PDF/Multi-tenant/Billing etc., mas cuja pré-condição é
  este MD-00 e os MDs 01–05 aqui detalhados).

## Pré-requisitos

- Ambiente Lovable Cloud (ou Supabase self-hosted equivalente) com:
  - Extensões: `pgcrypto`, `vector` (pgvector), `pgmq`.
  - Variável de projeto `project_id` configurada em `supabase/config.toml`.
  - Secret `LOVABLE_API_KEY` (AI Gateway) configurado nas Edge Functions.
  - `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY` disponíveis no runtime Deno das
    Edge Functions.
- Node/Bun para o frontend Vite + React + TypeScript + Tailwind + shadcn/ui.
- Acesso ao AI Gateway Lovable (`https://ai.gateway.lovable.dev/v1/chat/completions`) com modelos
  `google/gemini-2.0-flash`, `google/gemini-1.5-pro`, `openai/gpt-4o`, `openai/gpt-4o-mini`,
  `google/text-embedding-004`.

---

## 1. Arquitetura em Camadas

```
┌───────────────────────────────────────────────────────────────────────────┐
│  FRONTEND (React + Vite)                                                  │
│  src/pages/Audit.tsx  ──►  src/services/auditAIService.ts (upload/parse)  │
│                       ──►  src/services/auditMonthDetector.ts (mês)       │
│                       ──►  src/services/mesNormalizer.ts (YYYY-MM SSOT)   │
└───────────────────────────────┬───────────────────────────────────────────┘
                                 │ fetch (Bearer JWT)
                                 ▼
┌───────────────────────────────────────────────────────────────────────────┐
│  EDGE FUNCTIONS (Deno / supabase/functions)                               │
│  1. audit-parse-pdf         → OCR/parse via Gemini multimodal             │
│  2. audit-pipeline-process  → normalização contábil (LLM + fast-path)     │
│                                + lock/dedup + content_hash                │
│  3. audit-bs-dados          → consolidação determinística (core.ts)      │
│  4. audit-analyze           → insights, risco, roteamento de criticidade  │
│  5. audit-chat              → assistente conversacional                  │
│  6. enqueue-ai-job /                                                      │
│     process-ai-jobs-queue   → fila assíncrona pgmq (bex_ai_jobs)          │
│  7. document-ai-process     → Document AI/Google fallback estruturado    │
└───────────────────────────────┬───────────────────────────────────────────┘
                                 │
                                 ▼
┌───────────────────────────────────────────────────────────────────────────┐
│  MOTOR CANÔNICO (src/services — roda no browser E replicado server-side) │
│  p1SyntheticResolver.ts   → P1 Synthetic Authority (hierarquia de contas) │
│  residualFactsResolver.ts → tributos/trabalhista/dívida/EBITDA/margens    │
│  bsDadosBuilder.ts        → BSDadosRow[] (SSOT por competência)           │
│  indicatorsEngine.ts      → IndicatorRow (LC/LS/LG/ROE/ROA/EBITDA/...)    │
│  kanitzCalculator.ts      → Fator de Insolvência (fórmula fixa)           │
│  canonicalFinancialSnapshotService.ts → CertifiedFinancialSnapshot        │
│                              (Object.freeze — fábrica única de fatos)     │
└───────────────────────────────┬───────────────────────────────────────────┘
                                 │
                                 ▼
┌───────────────────────────────────────────────────────────────────────────┐
│  PERSISTÊNCIA (Postgres/Supabase)                                         │
│  audits → balancetes → balancete_lines / balancete_consolidado            │
│         → bs_dados → indicadores → kanitz_scores → insights → audit_logs  │
│  pipeline_documents / ocr_results / balancete_data /                      │
│  pipeline_analysis_results / pipeline_embeddings / dataset_validated /    │
│  account_mapping / audit_account_cache / contabil_dictionary              │
│  ai_jobs (+ pgmq bex_ai_jobs / bex_ai_jobs_dlq) / ai_usage_logs /         │
│  ai_cost_config / ai_gateway_config                                       │
└───────────────────────────────┬───────────────────────────────────────────┘
                                 │
                                 ▼
┌───────────────────────────────────────────────────────────────────────────┐
│  CONSUMO / RENDER (src/components/audit + src/pages/Audit.tsx)            │
│  TabKanitz, TabBSDados, TabPivotBalancete, TabGraficosAuditoria,           │
│  TabGraficosParecer, AuditCharts(Bex), KanitzThermometer, EquilibrioBadge, │
│  MapeamentoPorGrupo, ReportFormulas, SanityDiagnostico, WindowSelector     │
│  → PDF/impressão via window.print() com CSS dedicado em src/index.css     │
└───────────────────────────────────────────────────────────────────────────┘
```

## 2. Inventário de Arquivos Relevantes

### 2.1 `src/services/*` (motor de domínio — roda 100% no browser, sem servidor obrigatório)

| Arquivo | Responsabilidade |
|---|---|
| `accountingFirmsService.ts` | CRUD de escritórios contábeis (multi-tenant). |
| `accountingNormalizationService.ts` | `normalizeIncomeStatementSign`, `safe_divide` — normaliza sinais de DRE e evita divisão por zero. |
| `agentLearningService.ts` | Registro de aprendizado do agente (few-shot / feedback de auditores). |
| `auditAIService.ts` | Núcleo do upload: detecção de tipo de arquivo, `parseDocumentAI`, `parseSpreadsheet`, `inferRefByCode` (classificador REF_BY_PREFIX), `parseMultipleFiles`. |
| `auditChartsOptions.ts` | Opções/configuração dos gráficos (ECharts/Recharts). |
| `auditDatasetBuilder.ts` | Monta datasets para exportação/validação. |
| `auditHistoryService.ts` | Histórico de auditorias por empresa. |
| `auditMonthDetector.ts` | Detecção de mês/ano por nome de arquivo, por coluna de header e range multi-mês; `relabelYearsAsMonths`, `mergeMultiMonth`. |
| `auditSideHelper.ts` | Utilitários de layout/side panel. |
| `balanceteChartsParser.ts` | Parser auxiliar para gráficos de balancete. |
| `bsDadosBuilder.ts` | Constrói `BSDadosRow[]` — consumo do `p1SyntheticResolver` + `residualFactsResolver`. |
| `bsDadosServerClient.ts` | Client-side wrapper que chama `audit-bs-dados` (persistência server-side). |
| `bsDadosToMonthlyDatum.ts` | Adapta `BSDadosRow` para série mensal de gráficos. |
| `canonicalFinancialSnapshotService.ts` | **Fábrica única** do `CertifiedFinancialSnapshot` — proíbe qualquer consumer de recalcular fatos. |
| `certificationResult.ts` | Tipos/util de certificação (`CERTIFIED`/`FAILED`). |
| `companiesService.ts` | CRUD de empresas (tabela `companies`). |
| `dashboardStatsService.ts` | Estatísticas agregadas do dashboard. |
| `entityFinancialDataService.ts` | Bridge entre entidade (empresa) e dados financeiros consolidados. |
| `gestorIaCostService.ts` | Consulta `ai_usage_logs`/`ai_cost_config` para custo de IA. |
| `gestorIaIndicatorsService.ts` | Indicadores administrativos do painel Gestor IA. |
| `grupoResultadoDictionary.ts` | `matchGrupoCanonico` — dicionário de grupos de resultado. |
| `indicatorsEngine.ts` | **Engine única** de indicadores (`computeIndicatorsForRow`, `buildIndicatorSeries`, `buildISGSeries`). |
| `kanitzCalculator.ts` | Camadas 1–5 do Kanitz legado (`KanitzResultV2`) — mantido por compatibilidade com `ParsedFinancialData`. |
| `kanitzMonthly.ts` | Série mensal de Kanitz para gráficos. |
| `mesNormalizer.ts` | **SSOT** de normalização de período `YYYY-MM` (`normalizeMesKey`, `mesKeyToLabel`, `detectDuplicates`). |
| `p1SyntheticResolver.ts` | **Core Freeze**: `resolveP1Facts`, `normalizeAccountCode`, `runIntegrityGates` — autoridade P1/P2/P3/NOT_AVAILABLE. |
| `periodContextService.ts` | `resolvePeriodContext` — dias do período, fator de anualização. |
| `pipelineDiagnosticService.ts` | Diagnóstico/telemetria do pipeline (para `pipeline-diagnostic-seed`). |
| `reportLimitsService.ts` | Limites de geração de relatório por plano. |
| `residualFactsResolver.ts` / `.js` | **Fatos residuais**: tributos, trabalhista, dívida onerosa, despesas financeiras, EBITDA/LAJIR/cobertura de juros, margens. |
| `validationReviewService.ts` | Fluxo de revisão/validação humana pós-IA. |
| `variationMoM.ts` | Variação mês-a-mês (MoM) para séries. |

### 2.2 `supabase/functions/*` (Edge Functions Deno)

| Função | Responsabilidade | `verify_jwt` |
|---|---|---|
| `audit-parse-pdf` | OCR/parse multimodal (Gemini) de PDF/DOCX/TXT → `{balanco, dre, years, documentInfo}` + grava `ocr_results`. | `false` |
| `audit-pipeline-process` | Normalização contábil (fast-path + LLM em chunks), lock por `company_id`, dedup por `content_hash`, grava `pipeline_documents`, dispara `audit-bs-dados`. | `false` |
| `audit-bs-dados` | Consolidação determinística SSOT (`core.ts`, `classifier.ts`, `sinais.ts`) → grava `bs_dados`, `indicadores`, `kanitz_scores`, `insights`. | (padrão true) |
| `audit-analyze` | Geração de insights/diagnóstico com roteamento de criticidade (`model-router.ts`). | `false` |
| `audit-chat` | Chat assistente sobre os dados da auditoria. | `false` |
| `enqueue-ai-job` | Registra `ai_jobs` + publica mensagem em `pgmq` (`bex_ai_jobs`). | `false` |
| `process-ai-jobs-queue` | Worker: `read_email_batch` (pgmq) + `ai_jobs_claim_batch` (RPC) + `aiGatewayFetch`. | `true` |
| `document-ai-process` | Fallback de extração estruturada via Google Document AI. | `false` |
| `pipeline-diagnostic-seed` | Seed de diagnóstico/homologação do pipeline. | `false` |
| `dictionary-backfill-embeddings` | Popula `pipeline_embeddings` (pgvector) a partir de `contabil_dictionary`. | (padrão) |
| `abacatepay-create-billing` / `abacatepay-webhook` | Cobrança/assinatura (fora do escopo contábil). | — |
| `admin-*`, `auth-email-hook`, `process-email-queue`, `email-template-preview`, `provision-accounting-firm`, `subscription-manage`, `ai-gateway-status`, `ai-gateway-test` | Infra administrativa/e-mail/billing — não fazem parte do núcleo contábil, mas compõem a plataforma completa. | ver `config.toml` |
| `_shared/ai-fetch.ts` | `aiGatewayFetch` — retry/backoff (3 tentativas, timeout 120000ms). | — |
| `_shared/model-router.ts` | `ROUTING_MATRIX` — Gemini 2.0 Flash como padrão, GPT-4o para risco avançado. | — |

### 2.3 `src/components/audit/*`

| Componente | Responsabilidade |
|---|---|
| `AuditCharts.tsx` / `AuditChartsBex.tsx` | Gráficos principais de auditoria (evolução patrimonial, DRE). |
| `DedupPresetForm.tsx` | UI de configuração de estratégia de deduplicação (`sum`/`max-abs`/`last`/`first`). |
| `EquilibrioBadge.tsx` | Badge de equilíbrio patrimonial (fechamento AT=PC+PNC+PL). |
| `KanitzThermometer.tsx` | Termômetro visual do Fator de Insolvência. |
| `MapeamentoPorGrupo.tsx` | Tabela de mapeamento conta→grupo canônico. |
| `MonthsConfirmDialog.tsx` | Diálogo de confirmação manual de meses detectados. |
| `MonthsConsistencyAlert.tsx` | Alerta de inconsistência de meses (gaps, duplicatas). |
| `ReportFormulas.tsx` | Exibição das fórmulas usadas no relatório (transparência). |
| `SanityDiagnostico.tsx` | Painel de diagnóstico/sanity check dos fatos certificados. |
| `TabBSDados.tsx` | Aba de dados consolidados (BS & Dados). |
| `TabGraficosAuditoria.tsx` / `TabGraficosParecer.tsx` | Abas de gráficos para impressão/relatório. |
| `TabKanitz.tsx` | Aba dedicada ao Kanitz (standalone). |
| `TabPivotBalancete.tsx` | Pivot table do balancete consolidado. |
| `WindowSelector.tsx` | Seletor de janela temporal (mês/trimestre/ano). |

### 2.4 `src/pages/Audit.tsx`

Página principal (5562 linhas) que orquestra: upload de arquivos, chamada a `parseMultipleFiles`,
disparo do `runAuditPipeline` (client → `audit-pipeline-process`), tratamento do erro `pipeline_busy`
(HTTP 409) com `toast`, subscrição Realtime em `pipeline_documents`, montagem do
`CertifiedFinancialSnapshot`, renderização das abas (`tabOrder`) com navegação progressiva
(`maxUnlocked`), e o modo de impressão/PDF (`window.print()` com CSS `@media print`).

### 2.5 `src/index.css`

Contém os tokens de design (HSL, shadcn/ui), variáveis de tema, e as regras `@media print` usadas
pelo `Audit.tsx` para geração do PDF (classes `.report-card-keep-together`, `.break-inside-avoid`,
`page-break-before: always` em blocos de seção).

---

## 3. Invariantes de Negócio — Core Freeze (NÃO PODEM SER ALTERADOS)

1. **MD-001 (Enterprise Balance Sheet Extraction & Canonical Reconciliation Engine)**: o balancete é
   a **única fonte primária de verdade**; nenhum estágio posterior pode alterar dados extraídos do
   balancete.
2. **P1 Synthetic Authority absoluta**: em `p1SyntheticResolver.resolveP1Facts`, existindo uma conta
   sintética explícita (P1) para um `canonical_role`, o motor **nunca** desce para P2 (soma de
   filhos) ou P3 (soma de folhas analíticas). Ordem de autoridade: `P1_SYNTHETIC > P2_CHILDREN >
   P3_LEAVES > NOT_AVAILABLE`.
3. **Proibição de somar pai + filho**: em nenhuma composição (`compose`, `pickNonOverlapping`,
   `pickByTaxonomy`) um nó sintético e seu descendente podem ser somados simultaneamente — sempre se
   filtra `topmost()`/`pickNonOverlapping` para reter apenas nós não sobrepostos.
4. **Kanitz `NOT_APPLICABLE` se `PL <= 0`**: em `buildCanonicalKanitz` e `calcKanitz`,
   `applicable = patrimonio_liquido > 0`; se falso, `fi = NaN`, `classificacao = "na"` (ou
   `"bloqueado"` no legado), e o indicador alternativo publicado é o **ISG**
   (`Ativo Total / Passivo Exigível`).
5. **Source Binding obrigatório**: todo `CertifiedFact` deve carregar `source_account_code`,
   `source_account_description`, `source_hierarchy_level`, `authority` e `excluded_candidates` — não
   é permitido publicar um valor numérico sem a evidência/origem da conta.
6. **Role Exclusivity**: Receita Líquida e Resultado do Exercício não podem vir da mesma conta
   (`ROLE_COLLISION_WITH_NET_REVENUE`); contas `3.1` nunca podem ser tratadas como Resultado
   Acumulado (`PROHIBITED_RESULT_SOURCE_REVENUE_GROUP`).
7. **Resultado Acumulado ≠ Resultado da Competência**: o resultado de competência só é publicado
   quando há saldo anterior confiável (`derivation: "ACCUMULATED_MINUS_PREVIOUS_BALANCE"`); do
   contrário, fica `NOT_AVAILABLE` (`PERIOD_RESULT_INDISTINGUISHABLE_FROM_ACCUMULATED`).
8. **`CORE_FINANCIAL_SNAPSHOT_LOCK = true`**: o `residualFactsResolver` nunca altera AT, AC, ANC,
   RLP, Estoques, PC, PNC, PL, Receita, Resultado, Fornecedores nem os índices
   LC/LS/LG/ISG/RPL/GE/FI — ele só produz fatos **residuais e complementares**.
9. **Snapshot congelado**: `buildCertifiedFinancialSnapshot` retorna um objeto com
   `Object.freeze(snapshot.facts)`, `Object.freeze(snapshot.kanitz)`,
   `Object.freeze(snapshot.byCompetency)` e `Object.freeze(snapshot)` — nenhum consumer pode mutar o
   snapshot após certificação.
10. **Fórmula Kanitz fixa**: `K = 0,05·RL/RPL + 1,65·LG + 3,55·LS − 1,06·LC − 0,33·GE` — proibido
    aplicar `abs()`, inversão de sinal, ou qualquer patch de sinal (`console.log` de assertion match
    mantido propositalmente no código como guarda de regressão).
11. **Dedup determinístico por `content_hash` (SHA-256)** com `PARSER_VERSION` versionado —
    qualquer mudança no parser deve fazer bump de `PARSER_VERSION` para invalidar cache.
12. **Lock de pipeline por `company_id`** com janela de 10 minutos e **stale lock bypass de 3
    minutos** (ver MD-PORT-03).

## 4. Ordem de Execução dos MDs de Portabilidade

A ordem abaixo é obrigatória porque cada bloco depende do anterior (schema antes de funções, funções
antes de orquestração, motor de parsing antes de motor canônico):

1. **MD-PORT-00** (este documento) — visão geral, invariantes, inventário.
2. **MD-PORT-01** — Schema de banco (tabelas, enums, funções, triggers, RLS) — **pré-requisito de
   tudo**, pois todas as Edge Functions e o frontend dependem das tabelas existirem com RLS correta.
3. **MD-PORT-02** — Storage e topologia de Edge Functions (buckets, CORS, `verify_jwt`, filas
   `pgmq`, `_shared/ai-fetch.ts`, `_shared/model-router.ts`) — depende do schema (tabelas
   `ai_jobs`, `ai_gateway_config`, `ai_cost_config`, `ai_usage_logs` já existentes).
4. **MD-PORT-03** — Upload e orquestração do pipeline no frontend (`auditAIService.ts`,
   `Audit.tsx`) — depende das Edge Functions do MD-02 estarem deployadas.
5. **MD-PORT-04** — Extração/roteamento de IA (prompts, `aiGatewayFetch`, `ai_usage_logs`) — depende
   do MD-02 (funções) e é consumido pelo MD-03 (upload chama `audit-parse-pdf`).
6. **MD-PORT-05** — Parser de balancete e detecção de mês (`auditMonthDetector.ts`,
   `mesNormalizer.ts`, `inferRefByCode`, dedup por `content_hash`) — depende do MD-03/04 (dados já
   chegam via upload) e alimenta o motor canônico (MD-06 em diante, fora deste lote).
7. **MD-PORT-06 a MD-PORT-17** (fora deste lote de entrega): motor canônico P1/residual/snapshot,
   indicadores/Kanitz, UI de abas (`TabKanitz`, `TabBSDados`, etc.), geração de PDF/impressão,
   multi-tenant, billing/assinatura, e-mail transacional, admin/gestor IA — todos dependem
   estritamente de MD-00 a MD-05 estarem implementados e homologados antes de iniciar.

### Dependências entre blocos (grafo resumido)

```
MD-01 (schema) ─┬─► MD-02 (storage+edge functions)
                │        │
                │        ▼
                └─► MD-03 (upload/orquestração) ◄──── MD-04 (IA/model-router)
                              │
                              ▼
                        MD-05 (parser/mês)
                              │
                              ▼
                 [motor canônico P1 + residual + snapshot — MD-06+]
                              │
                              ▼
                 [indicadores/Kanitz + UI/PDF — MD-07..17]
```

## 5. Critérios de Homologação Globais

Estes critérios se aplicam a **todo** o sistema replicado, independentemente do MD específico:

1. **Zero downgrade de invariantes**: rodar os 8 gates de `runIntegrityGates` (`CHILD_LE_PARENT`,
   `HIERARCHY_INTEGRITY`, `PC_PRESENCE`, `PNC_PRESENCE`, etc.) sobre um balancete Golden e obter
   `passed: true` em todos.
2. **RLS habilitada em 100% das tabelas** listadas no MD-PORT-01, sem exceção, mesmo em tabelas
   internas de fila/cache.
3. **Nenhuma policy `USING (true)` para tabelas com dados sensíveis** (exceto SELECTs
   explicitamente documentados como públicos, como `ai_cost_config` e `user_roles` de leitura).
4. **Upload de um balancete de teste (Golden 01/02)** produz o mesmo `CertifiedFinancialSnapshot`
   (mesmos `facts`, `facts_status`, `kanitz.fi`, `residual.*`) em ambos os ambientes (origem e
   réplica) — comparação byte-a-byte dos campos numéricos com tolerância `1e-6`.
5. **Pipeline lock**: dois uploads simultâneos para a mesma `company_id` resultam em HTTP 409
   `pipeline_busy` no segundo, e o primeiro completa normalmente.
6. **Dedup**: reenviar o mesmo arquivo (mesmo `content_hash`) sem `force_reprocess` retorna HTTP 200
   com `dedup_hit: true` e não gera novo registro em `pipeline_documents`.
7. **Kanitz**: para um balancete com `PL <= 0`, `kanitz.applicable === false`,
   `kanitz.classificacao === "na"`, e a UI exibe o ISG como indicador alternativo.
8. **AI Gateway**: simular timeout (mock 504) confirma 3 tentativas com backoff exponencial
   (`baseDelayMs=400`, `maxDelayMs=4000`, `perAttemptTimeoutMs=120000`) antes de falhar
   definitivamente.
9. **PDF/impressão**: o relatório completo gerado via `window.print()` preserva quebras de página
   nos blocos marcados com `page-break-before: always` e não corta cards ao meio
   (`break-inside-avoid`).
10. **Custos de IA**: toda chamada ao AI Gateway gera uma linha em `ai_usage_logs` com
    `cost_calculated` calculado a partir de `ai_cost_config` (não pode haver chamada de IA sem
    rastreamento de custo).

## Checklist de Implementação

- [ ] Provisionar projeto Supabase/Lovable Cloud com extensões `pgcrypto`, `vector`, `pgmq`.
- [ ] Aplicar MD-PORT-01 (schema completo) e validar `SELECT` em todas as tabelas via `service_role`.
- [ ] Aplicar MD-PORT-02 (buckets + Edge Functions + `config.toml` com `verify_jwt` corretos).
- [ ] Configurar secret `LOVABLE_API_KEY` nas Edge Functions que chamam o AI Gateway.
- [ ] Aplicar MD-PORT-03 (frontend de upload) e validar fluxo de `pipeline_busy`/dedup.
- [ ] Aplicar MD-PORT-04 (prompts + model-router) e validar `ai_usage_logs` populada.
- [ ] Aplicar MD-PORT-05 (parser/mês) e validar `balancete_lines`/`balancete_consolidado`.
- [ ] Rodar os 10 Critérios de Homologação Globais listados acima antes de prosseguir para MD-06+.
- [ ] Validar Core Freeze com 2 balancetes Golden distintos (planos de contas diferentes: BEx padrão
      e Giannini) confirmando que `inferRefByCode`/`p1SyntheticResolver` classificam corretamente
      ambos sem hard-code de valores.

## Critérios de Homologação

- Todos os itens da seção 5 (Critérios de Homologação Globais) aprovados.
- Nenhuma tabela do inventário do MD-PORT-01 ausente no banco replicado.
- Nenhuma Edge Function do inventário da seção 2.2 ausente ou com `verify_jwt` divergente do
  `config.toml` original.
- Snapshot certificado idêntico (tolerância `1e-6`) entre ambiente original e réplica para ao menos
  2 balancetes de planos de contas distintos.
