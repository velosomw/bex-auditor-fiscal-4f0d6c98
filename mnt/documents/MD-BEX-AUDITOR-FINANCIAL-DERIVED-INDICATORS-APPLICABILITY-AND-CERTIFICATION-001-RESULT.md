# RESULTADO DA CERTIFICAÇÃO — MD-BEX-AUDITOR-FINANCIAL-DERIVED-INDICATORS-APPLICABILITY-AND-CERTIFICATION-001

## 01. Resumo Executivo
Certificação da Engine Contábil v2.1 concluída com sucesso. O sistema agora distingue corretamente fatos monetários (BRL) de percentuais, aplica Gates de Aplicabilidade para Patrimônio Líquido negativo e exige dupla reconciliação para o EBITDA.

## 02. Auditor Findings Implemented
- **FINDING_01 (PL Negativo):** Resolvido. Imobilização do PL exibe "Não aplicável" para PL <= 0.
- **FINDING_02 & 03 (EBITDA Math):** Implementada reconciliação dupla (Método A ≈ Método B).
- **FINDING_04 (EBITDA Unit):** EBITDA forçado para unidade BRL (R$).
- **FINDING_05 (Golden Test):** Validação dos valores de Jan/Fev/Mar 2026 realizada.

## 03. Root Cause — Imobilização PL
- **OLD_RUNTIME:** Fallback para `0.0%` quando o denominador era negativo.
- **ROOT_CAUSE:** Falta de um gate semântico de aplicabilidade antes da divisão.
- **NEW_RUNTIME:** `NEGATIVE_EQUITY_INDICATOR_APPLICABILITY_GATE` ativado. Status: `NOT_APPLICABLE`.

## 04. EBITDA Validation (Golden Test)
| Competência | EBITDA Esperado | Status | Unidade | Sinal |
|-------------|-----------------|--------|---------|-------|
| Jan/2026    | R$ 2.417.550,00 | CERTIFIED | BRL | Positivo |
| Fev/2026    | -R$ 195.362,00  | CERTIFIED | BRL | Negativo (Preservado) |
| Mar/2026    | R$ 240.101,00   | CERTIFIED | BRL | Positivo |

## 05. Matriz de Aplicabilidade
| Indicador | Jan/26 | Fev/26 | Mar/26 | Motivo |
|-----------|--------|--------|--------|--------|
| Imobilização PL | N/A | N/A | N/A | PL Negativo |
| ROE | N/A | N/A | N/A | PL Negativo |
| Grau Endividamento | N/A | N/A | N/A | PL Negativo |

## 06. Decisão Final de Certificação
**STATUS: APPROVED (CORE FROZEN v1.1)**
Todas as regras do MD-BEX-001 foram integradas à Engine e validadas nos renders de UI e PDF.
