## Diagnóstico (logs + DB da empresa "01 - EMPRESA XPTO - BL 6 Meses")

Após inspecionar `audits`, `balancetes`, `bs_dados` e `audit_reports` da empresa, detectei **3 desvios estruturais** que explicam os gráficos vazios e abas zeradas:

| # | Sintoma observado no banco | Causa raiz |
|---|---|---|
| 1 | Arquivo "Balancetes 08.2025 a 01.2026 (6 meses).xlsx" gerou apenas **2 balancetes** (2025-12 e 2026-12) em vez de 6 | O parser (`tryParseBalanceteMensalBR` em `auditAIService.ts`) só mantém **uma sheet** (a com mais linhas) e descarta as outras 5. Quando recai no fallback, só lê o ANO em headers — colapsa 6 meses em "2025"/"2026", e `periodToMesKey` força ambos para dezembro |
| 2 | `bs_dados.receita_liquida = 0` em todos os meses | DRE não foi capturada — sem `Ref Capital` (apenas inferência por código). O fallback path nem retorna `ref1`, e a lógica `applyValue` depende de classificação correta |
| 3 | `audit_reports.periodos = NULL` e `audit_documents.metadata.periodos = NULL` | A persistência salva os campos, mas como o parser só achou 2 períodos espúrios, os arrays ficam degradados |

Resultado prático: os gráficos do `AuditCharts` recebem apenas 2 pontos (ambos em dezembro) com receita zerada → o `MonthsConsistencyAlert` deveria avisar, mas nem chega lá pois `entries` no relatório também só tem 2 meses fictícios.

## O que vou corrigir

### 1. Parser multi-sheet de balancete (`src/services/auditAIService.ts`)
- Em `parseSpreadsheet`, **iterar TODAS as sheets** que casam o template `tryParseBalanceteMensalBR`, não apenas a "best".
- Para cada sheet, derivar o `mesKey` por (a) coluna de mês detectada → (b) **nome da sheet** (ex: "08-2025", "AGO/25") via `detectMonthFromYearLabel` → (c) string detectada no `documentInfo` da sheet (ex: "Período: 08/2025") → (d) fallback para nome do arquivo.
- Cada sheet vira um período em `years[]`; cada `BalanceteRowParsed.values[mesKey]` recebe o saldo daquela sheet.
- Quando o arquivo tem **uma única sheet com 6 meses em colunas** (cenário B), o caminho atual já funciona — manter intacto.

### 2. Detecção de meses pelo nome do arquivo "intervalo"
Adicionar em `auditMonthDetector.ts` o reconhecimento de `"08.2025 a 01.2026"` / `"08-2025 até 01-2026"` → expande para a lista completa de meses no intervalo (6 meses). Usado como fallback quando nada na planilha sinaliza o mês.

### 3. Diálogo de confirmação de meses (já existe `MonthsConfirmDialog`)
Quando o parser detectar **mais de 1 período** mas a confiança for `< 0.8` em qualquer um, abrir o diálogo após o upload para o usuário confirmar/ajustar a atribuição mês↔sheet **antes** de processar. Garante que sempre cheguem 6 entradas em `balanceteEntries`.

### 4. Reprocessar a empresa de teste
- Apagar a auditoria atual `2c987bd2-…` (balancetes/bs_dados/reports vinculados) via migration controlada.
- Reexecutar o fluxo na UI usando o mesmo arquivo para validar:
  - 6 linhas em `balancetes` com `mes_referencia` distintos (2025-08…2026-01)
  - 6 linhas em `bs_dados` com `receita_liquida > 0` e `ativo_circulante = passivo_circulante + PL`
  - `audit_reports.periodos` populado com 6 chaves
  - Aba **Gráficos de Auditoria**: 6 pontos no eixo X, sem alerta de inconsistência
  - Aba **BS & Dados**: 6 colunas
  - Aba **Pivot Balancete**: 6 colunas
  - Aba **Kanitz**: 6 scores mensais

### 5. Validação visual (QA)
- Capturar screenshot da fase de Resultados após processar.
- Confirmar via `psql` que `bs_dados` tem 6 linhas e `divida_total > 0`.
- Verificar console para alertas de mapeamento.

## Arquivos a editar
- `src/services/auditAIService.ts` — multi-sheet loop + atribuição de mês por sheet
- `src/services/auditMonthDetector.ts` — parser de intervalo "MM.YYYY a MM.YYYY"
- `src/pages/Audit.tsx` — abrir `MonthsConfirmDialog` quando confiança < 0.8
- `supabase/migrations/…` — limpar auditoria de teste antes do reprocessamento

Não vou alterar o motor de gráficos (`AuditCharts`, `bsDadosToMonthlyDatum`) — eles já estão corretos; o problema é a **fonte de dados** que chega até eles.