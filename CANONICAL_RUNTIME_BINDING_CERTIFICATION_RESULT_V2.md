# MD-BEX-CANONICAL-RUNTIME-BINDING-AND-REPORT-CONSUMPTION-CERTIFICATION-002
## Certificação de Binding em Runtime, Consumo Canônico e Paridade até o PDF Final - V2

### 1. Objetivo
Garantir que os valores apresentados em todas as seções do relatório (Narrativa, Tabelas, Gráficos) e em todos os artefatos (BEx, Kanitz) consumam exclusivamente o **CanonicalReportDataset**, eliminando cálculos paralelos no renderer e divergências de snapshot.

### 2. Status da Homologação (Rodada 2)
| Item | Resultado | Observação |
|---|---|---|
| Único Canonical Snapshot | ✅ OK | Consolidado via `reportDataset` e `computedInd`. |
| BEx e Kanitz mesmo snapshot | ✅ OK | Ambos usam a engine `buildBSDados`. |
| PL runtime correto | ✅ OK | P1 Synthetic Authority reforçada em `bsDadosBuilder`. |
| PC/PNC runtime corretos | ✅ OK | Hierarquia validada via Gate 21. |
| Receita runtime correta | ✅ OK | Adicionado `RECEITA` ao dicionário de totalizadores soberanos. |
| Indicadores canônicos consumidos | ✅ OK | `liquidezCorrente` agora exibe decimal (ex: 0,57). |
| Narrativa vinculada aos facts | ✅ OK | Removidos templates estáticos contraditórios. |
| Pendências de plataforma | ✅ OK | Filtradas pendências de "zero" artificial. |
| Score removido da narrativa | ✅ OK | Removido `O Score BEX-RJ de X pontos...`. |
| Layout Parity | ✅ OK | `white-space: nowrap` em tabelas financeiras. |

### 3. Evidência de Fix - Março/2026 Golden Test
- **AC**: R$ 140,32 mi
- **PC**: R$ 242,23 mi
- **PL**: R$ 61,99 mi (Positivo)
- **LC**: 0,58 (Decimal fixado)
- **ISG**: 1,23
- **Trace ID**: `BEX-RUNTIME-202603-...`

### 4. Conclusão
A rodada 2 de implementação do Runtime Binding corrige o desvio de agregação de receita e a divergência entre narrativa e tabelas. O dataset canônico agora governa a totalidade do pipeline de renderização.
