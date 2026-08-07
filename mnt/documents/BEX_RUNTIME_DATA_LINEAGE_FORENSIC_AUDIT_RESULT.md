---
name: BEX_RUNTIME_DATA_LINEAGE_FORENSIC_AUDIT_RESULT
description: Auditoria Forense de Linhagem de Dados em Runtime — Rastreabilidade Física dos Valores Publicados.
type: reference
---

# Auditoria Forense de Linhagem de Dados em Runtime (BEx/Kanitz)
**Versão:** 1.0
**Data da Auditoria:** 2026-08-07

## 1. Executive Summary
Esta auditoria identificou que a divergência de valores entre Narrativa, Tabelas e Kanitz decorre de múltiplas fontes de verdade coexistindo no runtime. Enquanto as tabelas e o Kanitz consomem o `reportDataset` (baseado no `bsDadosBuilder`), a narrativa e partes do BEx ainda utilizam fallbacks do `aiAnalysis` ou caches não invalidados, resultando em "fantasmas" de execuções anteriores ou extrações incompletas.

## 2. Runtime Architecture Observed
A cadeia de execução observada segue este fluxo:
1. **Source:** Arquivo (PDF/XLSX) -> `parseMultipleFiles` -> `ParsedFinancialData`.
2. **Engine:** `ParsedFinancialData` -> `buildBSDados` (Soberano) -> `BSDadosRow[]`.
3. **Indicators:** `BSDadosRow` -> `computeIndicatorsForRow` -> `IndicatorRow`.
4. **Binding:** `reportDataset` (useMemo em `Audit.tsx`) encapsula Fatos + Indicadores.
5. **Consumption:**
   - **Tabelas BEx/Kanitz:** Consumidores do `reportDataset`.
   - **Narrativa BEx:** Consome `aiAnalysis` (gerado via `analyzeFinancialData`), que recebe `deterministicFacts` mas pode ignorá-los se houver falha de mapeamento ou se o prompt for tendencioso a extrações antigas.

## 3. Snapshot Inventory
- **Canonical Snapshot:** `reportDataset` (Trace ID `BEX-RUNTIME-...`). Gerado a cada renderização do `TabRelatorioFinal`.
- **Legacy Snapshot:** `aiAnalysis` (bloco `diagnostico.estruturaFinanceira`). Persiste em cache de estado do React até novo processamento.
- **Server Snapshot:** Tabela `public.bs_dados` (auditada via `audit_id`).

## 4. Critical Fact Lineage

| Fato | BEx Narrative | BEx Table | Kanitz | Root Source |
| :--- | :--- | :--- | :--- | :--- |
| PL | `aiAnalysis.estrutura.pl` | `reportDataset.facts.pl` | `latestInd._pl` | `bs_dados` / `balancete_lines` |
| AC | `aiAnalysis.estrutura.ac` | `reportDataset.facts.ac` | `latestInd._ac` | `balancete_lines` |
| PC | `aiAnalysis.estrutura.pc` | `reportDataset.facts.pc` | `latestInd._pc` | `balancete_lines` |

## 5. Investigação de Valores Anômalos

| Valor | Encontrado em | Origem Física | Diagnóstico |
| :--- | :--- | :--- | :--- |
| 464.980.056 | BEx Narrative | `aiAnalysis` (IA Extraction) | **LEGACY_BRANCH**: Extração bruta da IA ignorando hierarquia. |
| -48.373.933 | BEx/Kanitz | `bsDadosBuilder` (Folhas) | **WRONG_AGGREGATION**: Soma de folhas sem P1 (Sintética) para Mar/26. |
| 21.906 | BEx/Kanitz | `ParsedFinancialData` | **WRONG_COLUMN**: Captura de saldo de conta específica como se fosse AC. |
| 6.997.173 | Kanitz/BEx | `balancete_data` | **SEMANTIC_CONFLICT**: Valor de "Vendas" sendo mapeado para EBITDA/Resultado. |

## 6. Root Cause Ranking

### ROOT CAUSE 01: Legacy Narrative Dataset Active
- **Severity:** CRITICAL
- **File:** `src/pages/Audit.tsx` (Linhas 2780-2820, 3510-3530)
- **Detail:** A narrativa utiliza `activeDiag.resumo` e `aiAnalysis`, que são produtos da `analyzeFinancialData`. Se o mapeamento entre o motor determinístico e o prompt da IA falhar, a IA inventa valores baseados na extração bruta.

### ROOT CAUSE 02: P1 Synthetic Authority Bypass
- **Severity:** CRITICAL
- **File:** `src/services/bsDadosBuilder.ts`
- **Detail:** O motor `buildBSDados` falha ao certificar contas sintéticas de nível superior (ex: "2.3") em certos planos de contas, disparando o P2 (agregação de folhas) que é inerentemente mais ruidoso e propenso a erros de sinal.

### ROOT CAUSE 03: Null-to-Zero Fallback in Indicators
- **Severity:** HIGH
- **File:** `src/services/indicatorsEngine.ts`
- **Detail:** Padrão `r.estoques || 0` mascara a ausência de dados, transformando "Não Encontrado" em "Zero", o que gera pendências falsas no relatório.

## 7. Recommended Remediation Plan
1. **Unificar Contexto da IA:** Modificar `analyzeFinancialData` para aceitar obrigatoriamente o `reportDataset.facts` como única fonte numérica para o prompt do Gemini.
2. **Hardening P1:** Atualizar `GROUP_TOTAL_CODES` para incluir variações de níveis (1.01, 2.03) e forçar a prioridade sobre descendentes.
3. **Invalidação de Cache de Extração:** Limpar `aiAnalysis` sempre que um novo `parsedData` for gerado, impedindo que a narrativa do relatório anterior "vaze" para o novo.

## 8. Conclusão
A auditoria confirma que o sistema possui os dados corretos, mas sofre de "Bifurcação de Consumo". A correção não deve ser em fórmulas, mas na **Linhagem de Binding** (Data Wiring).
