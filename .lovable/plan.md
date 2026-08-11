# Plan: Final Financial Derived Indicators Applicability and Certification [MD-BEX-001]

Implement a hardened financial engine to correctly handle Negative Equity (PL), certify EBITDA via dual-reconciliation, and ensure unit/sign consistency across the platform.

## User Review Required

> [!IMPORTANT]
> This patch enforces `N/A` for indicators requiring positive equity (e.g., Immobilization of Equity) when PL ≤ 0, and mandates EBITDA certification via two independent calculation methods. 

- Does the list of indicators requiring positive equity (Immobilization, ROE, Debt/Equity) match your expectations?
- Is the reconciliation tolerance of R$ 1,00 between EBITDA methods acceptable?

## Proposed Changes

### 1. Financial Engine Hardening (`src/services/`)

#### [residualFactsResolver.ts]
- **EBITDA Re-Certification**: Implement the dual-reconciliation gate:
    - Method A: LAJIR + Depreciation + Amortization
    - Method B: Net Result + Taxes + Normalized Financial Result + D&A
- **Certification Gate**: Only mark as `CERTIFIED` if Method A ≈ Method B (tolerance R$ 1.00).
- **Unit & Metadata**: Return explicit `unit: "BRL"` and `status` details.
- **Sign Preservation**: Prohibit `Math.abs()` on EBITDA results; preserve negative values.

#### [indicatorsEngine.ts]
- **Applicability Gates**: Implement `NEGATIVE_EQUITY_INDICATOR_APPLICABILITY_GATE`.
- **Equity-Dependent Indicators**: If `PL <= 0`, return `NaN` and set `na` flags for:
    - `imobilizacaoPL`
    - `roe`
    - `grauEndividamentoPL`
- **Unit Parity**: Ensure units are passed correctly to consumers (BRL vs PERCENT).

#### [kanitzCalculator.ts]
- **Unified EBITDA**: Ensure Kanitz consumes the certified EBITDA from `residualFactsResolver` instead of independent reconstruction.

### 2. UI & Renderer Hardening (`src/pages/` & `src/components/`)

#### [Audit.tsx]
- **Renderer Gates**: Update all cards and tables to check for `status === "NOT_APPLICABLE"` or `status === "NOT_CERTIFIED"`.
- **Text Labels**: Replace `0,0%` or `0` with "Não aplicável — Patrimônio Líquido negativo" or "N/A — Não certificado".
- **EBITDA Unit**: Force `R$` prefix and prevent percentage formatting.

#### [AuditCharts.tsx] & [TabGraficosAuditoria.tsx]
- **Zero Line Preservation**: Ensure charts show negative EBITDA correctly below the zero axis.
- **Null Handling**: Treat `NOT_APPLICABLE` as `null` in data series to prevent "zero" plot points.

### 3. Documentation & Validation

- **MD-BEX-AUDITOR-FINANCIAL-DERIVED-INDICATORS-APPLICABILITY-AND-CERTIFICATION-001-RESULT.md**: Generate the final validation report with Jan/Feb/Mar Golden Test comparisons.

## Technical Details

- **Tolerance**: `const RECONCILIATION_TOLERANCE = 1.00;`
- **Canonical Roles**:
    - `derived.immobilization_of_equity` (PERCENT)
    - `derived.ebitda` (BRL)
    - `derived.ebitda_margin` (PERCENT)
- **Gate Implementation**: `if (equity <= 0) return { value: null, status: 'NOT_APPLICABLE', reason: 'NEGATIVE_EQUITY' };`
