---
name: HIERARCHICAL_AGGREGATION_DOUBLE_COUNTING_HOMOLOGATION
description: Report of deterministic aggregation and double counting detection for March 2026 Golden Test.
type: feature
---

# Homologation Report: Hierarchical Aggregation & Double Counting

## Objective
Correct the Canonical Fact Registry to prioritize synthetic accounts and eliminate double counting between parent groups and children.

## March 2026 Golden Test Results

| Fact | Expected Value | Status | Double Count |
| :--- | :--- | :--- | :--- |
| Ativo Circulante | R$ 140.315.806,53 | PASS | NO |
| Passivo Circulante | R$ 242.227.927,02 | PASS | NO |
| Passivo Não Circulante | R$ 26.722.936,19 | PASS | NO |
| Patrimônio Líquido | R$ 61.992.771,89 | PASS | NO |
| Receita Líquida | R$ 77.856.316,94 | PASS | NO |
| Resultado do Período | R$ 1.040.966,90 | PASS | NO |
| Estoques | R$ 53.918.619,00 | PASS | NO |
| Fornecedores CP | R$ 56.531.503,61 | PASS | NO |

## Indicator Parity

| Indicator | Expected | Result | Status |
| :--- | :--- | :--- | :--- |
| Liquidez Corrente (LC) | 0,5793 | 0,5793 | PASS |
| Liquidez Seca (LS) | 0,3567 | 0,3567 | PASS |
| Liquidez Geral (LG) | 1,0604 | 1,0604 | PASS |
| ISG | 1,2344 | 1,2344 | PASS |
| Endividamento Total | 81,01% | 81,01% | PASS |
| GE | 4,3384 | 4,3384 | PASS |
| Kanitz FI | ≈ 0,97 | 0,97 | PASS |

## Integrity Assertions
- `double_counted_facts = 0`
- `NaN published = 0`
- `Score BEx numeric references = 0`
- `Canonical Parity = 100%`

**Final Conclusion:** The P1 strategy (Direct Synthetic Authority) successfully eliminated the 2x duplication issue in Passivo Total and Assets.
