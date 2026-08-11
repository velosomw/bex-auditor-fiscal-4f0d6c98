# Implementation Plan - MD-BEX-ACCOUNTING-FORMULA-CORRECTION-ENGINE-001

This plan implements the structural correction of the accounting formula engine, focusing on temporal normalization, sign consistency, and certified vs. proxy logic.

## User Review Required

> [!IMPORTANT]
> This patch enforces strict validation. Indicators for months with insufficient context or zero/negative denominators (like GE/ROE with PL <= 0) will return "N/A" instead of zero.

## Proposed Changes

### 1. Temporal & Period Context Service
- Create `src/services/periodContextService.ts` to implement `resolve_period_context()`.
- Logic for `annualization_factor` calculation based on `period_months`.
- Detection of `MONTHLY`, `ACCUMULATED`, `ANNUAL`, and `UNKNOWN` types.

### 2. Sign & Data Normalization Service
- Create `src/services/accountingNormalizationService.ts`.
- Implement `normalize_income_statement_sign()` and `safe_divide()`.
- Standardize Business Facts normalization (net_income, financial_expense, etc.).

### 3. Indicators Engine Overhaul (`src/services/indicatorsEngine.ts`)
- Refactor `computeIndicatorsForRow` to use the new normalization and temporal services.
- Implement corrected formulas for ROA/ROE (annualized), PMR/PMP/PME (period-based).
- Add metadata support for `calculation_type` (certified vs proxy) and `status`.
- Fix EBITDA and Margins to use certified LAJIR and Revenue from SSOT.

### 4. Kanitz & Solvency Logic (`src/services/kanitzCalculator.ts`)
- Enforce `NOT_APPLICABLE` for Kanitz if `PL <= 0`.
- Decouple ISG from Kanitz (ISG remains calculable even if Kanitz is N/A).

### 5. Single Source of Truth (`src/services/bsDadosBuilder.ts`)
- Update `BSDadosRow` to include the new quality metadata.
- Implement `tax_noncurrent` binding to synthetic `2.2.3` (already partially present, but hardening).
- Enhance P1 authority logic to preserve synthetic sign integrity.

### 6. Residual Facts & EBITDA (`src/services/residualFactsResolver.ts`)
- Harden EBITDA reconstruction (`LAJIR + D&A`).
- Implement derived fact certification gates.

## Technical Details
- Versioning: Set `formula_engine_version` to `BEX-ACCOUNTING-FORMULA-ENGINE-2.0`.
- No changes to UI/Layout, only to data processing logic.
- Automated generation of `MD-BEX-ACCOUNTING-FORMULA-CORRECTION-ENGINE-001-RESULT.md` for validation.
