# BEx & Kanitz Engine Documentation - [MD-BEX-ARCHITECTURE-CERTIFICATION-002]

## 1. Visão Geral da Arquitetura
A arquitetura do motor financeiro da plataforma BEx baseia-se no princípio da **Single Source of Truth (SSOT)** e no conceito de **P1 Synthetic Authority**. O fluxo de dados segue uma cadeia de custódia rígida para garantir paridade entre análise em tela e exportação (PDF/DOCX).

### Cadeia de Processamento:
`BALANCETE (PDF/Excel) -> audit-parse-pdf (Edge) -> auditAIService (Parser) -> audit-bs-dados (Edge) -> p1SyntheticResolver -> residualFactsResolver -> canonicalFinancialSnapshotService -> Certified Snapshot (Frozen) -> Consumers (BEx/Kanitz UI)`

---

## 2. Motor de Extração e Parser (Camada 1 e 2)

### A. audit-parse-pdf (Edge Function)
- **Tecnologia:** Gemini 1.5 Pro via Lovable AI Gateway.
- **Função:** Extração bruta de texto e tabelas.
- **Heurística de Score (OCR Score):** Avalia qualidade baseada na detecção de contas e períodos.

### B. auditAIService.ts / auditMonthDetector.ts
- **inferRefByCode:** Classificador determinístico que mapeia códigos contábeis para Referências BEx (A, B, AA, etc.) sem depender de IA.
- **Detecção de Período:** Lógica tripla (Nome do Arquivo -> Cabeçalhos de Coluna -> Fallback) para normalizar competências no formato `YYYY-MM`.

---

## 3. Motor de Resolução Financeira (Camada 3)

### A. p1SyntheticResolver.ts (O Coração do Motor)
Implementa a **Autoridade Sintética P1**.
- **Regra P1:** Se uma conta sintética (totalizadora de grupo) existe, seu valor é ABSOLUTO. O motor ignora a soma dos filhos analíticos para evitar erros de arredondamento ou contas não mapeadas.
- **Hierarquia:** P1 (Sintética) > P2 (Filhos) > P3 (Folhas).
- **Integrity Gates:** Validam se o Balanço fecha e se as relações hierárquicas são lógicas (ex: Estoque não pode ser maior que Ativo Circulante).
- **Hard Gate [MD-BEX-FINAL]:** Proíbe contas de Receita Líquida (grupo 3.1) de serem classificadas como Resultado.

### B. residualFactsResolver.ts
Resolve fatos que dependem de taxonomia textual complexa:
- **Dívida Onerosa:** Separação entre Empréstimos e Fornecedores no PC e PNC. Totalizada em `borrowings.total = CP + LP`.
- **Obrigações Trabalhistas:** Separação de salários, impostos e retenções via **§MIXED-TAXONOMY-DESCENT**.
- **EBITDA Sign Sanity Gate:** Garante que Depreciação e Amortização não reduzam o LAJIR artificialmente (Tolerância de 0.10).
- **Certification Chain:** EBITDA e Cobertura de Juros só são certificados se a Receita e o Resultado base forem certificados pelo P1.

---

## 4. Estrutura Canônica (Camada 4)

### A. canonicalFinancialSnapshotService.ts
Materializa o `CertifiedFinancialSnapshot`.
- **Imutabilidade:** O snapshot é congelado (`Object.freeze`) com `FINAL_ACCOUNTING_CORE_FREEZE = true`.
- **Traceability:** Inclui `processing_run_id`, `runtime_trace_id` e `source_file_hash`.
- **Paridade:** Garante que o BEx e o Kanitz consumam EXATAMENTE os mesmos números.

### B. indicatorsEngine.ts
Calcula os 40+ indicadores econômicos (Liquidez, Rentabilidade, Endividamento) a partir dos fatos certificados.

---

## 5. Banco de Dados e Funções (Camada 5)

### Tabelas Principais (Supabase):
- `audits`: Registro mestre da auditoria.
- `balancetes`: Metadados dos arquivos processados.
- `balancete_lines`: Armazena todas as contas extraídas (código, descrição, saldo).
- `bs_dados`: Snapshot consolidado das 47 contas principais por mês.
- `indicadores`: Snapshot dos ratios calculados.
- `kanitz_scores`: Resultados do modelo de solvência.
- `pipeline_analysis_results`: Cache JSON da extração (OCR Results).

---

## 6. Modelo Matemático Kanitz
- **Fórmula:** `K = 0,05*RPL + 1,65*LG + 3,55*LS - 1,06*LC - 0,33*GE`
- **Regra de Inaplicabilidade:** Se PL <= 0, o Kanitz é marcado como `NOT_APPLICABLE` (substituído pelo ISG).
- **Classificação:**
  - `> 1.0`: Saudável
  - `0.0 a 1.0`: Estável
  - `-1.0 a 0.0`: Atenção
  - `-3.0 a -1.0`: Risco
  - `< -3.0`: Insolvente

---

## 7. Homologação Produtiva [MD-BEX-FINAL-RUNTIME-ASSERTS]
- **A01 — Resultado:** Card executivo vinculado ao fato de competência.
- **A02 — Borrowings:** Dívida financeira totalizada (CP + LP), excluindo arrendamentos.
- **A03 — Tax LP:** Card de tributário LP vinculado diretamente ao fato certificado.
- **A07 — Safe Pagination:** Configurada a **Safe Zone de 26mm** e `max-height: 245mm`.

*Documentação atualizada em 10/08/2026 para refletir o Core Frozen v1.0.*
