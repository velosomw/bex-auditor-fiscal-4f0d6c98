# Plan: [MD-BEX-ACCOUNTING-DERIVED-FACTS-CERTIFICATION-AND-PUBLICATION-CORRECTION-001]

Implement final accounting derived facts certification and publication hardening.

## Technical Details

### 1. Hardened Negative Equity Applicability Gate
- **indicatorsEngine.ts**: Update `computeIndicatorsForRow` to strictly return `NaN` and set status to `NOT_AVAILABLE`/`NOT_APPLICABLE` for `imobilizacaoPL`, `roe`, `grauEndividamentoPL`, `isg`, and `cicloCaixa` when `PL <= 0`.
- **residualFactsResolver.ts**: Ensure `interest_coverage` and `ebitda` also respect this gate if their interpretation depends on positive equity context in narratives.

### 2. EBITDA Certification Engine v2.1
- **residualFactsResolver.ts**: 
    - Fix the **Dual Reconciliation Gate**: The diff `2.589.297` in Jan/2026 indicates that `LAJIR` (from synthetic groups) and `Result` (from P1/P2) are not yet aligned.
    - Implement a **Fallback Reconciler**: If Method A and Method B diverge, check if `LAJIR` was derived from a synthetic group (Authority P1) and if `Result` was derived from a lower authority. Prioritize P1 Synthetic Authority for the published value but flag `NOT_CERTIFIED` if the memory doesn't reconcile.
    - **Unit Enforcement**: Force `unit: "BRL"` and prevent `0` fallbacks for `NULL`/`NOT_FOUND` accounts.
    - **Sign Preservation**: Ensure negative EBITDA (like Feb/2026 -R$ 195.362) is preserved without `Math.abs()`.

### 3. Interest Coverage & Tax LP Correction
- **residualFactsResolver.ts**:
    - **Tax LP**: Bind `tax.noncurrent` strictly to account group `2.2.3` using P1 Authority. Prohibit returning `0` if the group is `NOT_FOUND`.
    - **Interest Coverage**: Recalculate as `LAJIR / Financial Expenses` (absolute). If LAJIR is -83k and FinExp is 25k, coverage is -3.32x, not 96x. Reject values that don't match the current snapshot's math.
- **Audit.tsx**: Update `Tax LP` card to consume `snapshot.residual.tax.noncurrent_obligations.value` correctly.

### 4. Margins & Result Parity
- **residualFactsResolver.ts**: Ensure `margins.current_month` only calculates if `Resultado da Competência` and `Receita Líquida` share the same `period_context` (MONTH). Prohibit using YTD result for monthly margin.
- **bsDadosBuilder.ts**: Enhance `resultado_competencia` derivation logic to avoid collisions with Net Revenue.

### 5. Safe Pagination & UI Hardening
- **index.css**: Harden `.report-page` and safe zones to strictly enforce `245mm` max content height.
- **Audit.tsx**: 
    - Implement `report-card-keep-together` and `page-break-before` rules for tables and long narrative blocks.
    - Block "no risk" narratives if `ebitda.status !== 'CERTIFIED'`.
    - Update EBITDA card to show "N/A - Falha na Reconciliação" when not certified.

### 6. Validation & Certification
- Create `mnt/documents/MD-BEX-ACCOUNTING-DERIVED-FACTS-CERTIFICATION-AND-PUBLICATION-CORRECTION-001-RESULT.md` with a full matrix of Jan/Feb/Mar 2026 facts vs Golden Values.
