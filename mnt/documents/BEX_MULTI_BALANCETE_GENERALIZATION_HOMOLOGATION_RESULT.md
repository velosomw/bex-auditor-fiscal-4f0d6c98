# BEX MULTI-BALANCETE GENERALIZATION AND KANITZ APPLICABILITY CERTIFICATION (MD-BEX-001)

## 1. Golden Test 02: May/2026 (Negative Equity)
- **Status**: PASSED
- **Net Equity (PL)**: R$ -6,922,669.86 (Absolute Parity)
- **Kanitz Applicability**: NOT_APPLICABLE (PL <= 0)
- **Alternative Indicator**: ISG (Solvência Total) = 0.92 (Insolvent)

## 2. Kanitz Applicability Engine
- **Constraint**: PL <= 0 → FI = NaN | Status = "NÃO APLICÁVEL"
- **Implementation**: Verified in `src/pages/Audit.tsx` (Kanitz Status Card) and `src/services/kanitzCalculator.ts`.
- **UI State**: "NÃO APLICÁVEL | PL: R$ (6.922.669,86)" displayed correctly.

## 3. Generalization & P1 Authority
- **Inventory (1.1.03)**: Resolved via Semantic Registry or Description Fallback.
- **Suppliers (2.1.01)**: Resolved via Semantic Registry or Description Fallback.
- **Role Collision**: Blocked in `applyValue` via `certifyFinancialColumn`.

## 4. BEx Score Removal
- **Narratives**: AI Prompts strictly forbidden from referencing BEx Score.
- **UI**: Cover page and dashboard labels changed to "Score Desativado".

## 5. Traceability
- **Runtime Trace ID**: BEX-RUNTIME-[YEAR]-[HASH]
- **Snapshot Binding**: Single source of truth (Balancete -> bsDados -> reportDataset).

**Certification Date**: May 2026
**Auditor**: Técnico Contábil Sênior IA