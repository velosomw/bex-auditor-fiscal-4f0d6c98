# Plan: MD-BEX-FINAL-SURGICAL-DERIVED-TAX-MARGIN-PAGINATION-PATCH-001

Objective: Apply surgical corrections to Interest Coverage, EBITDA certification, Tax LP rendering, Margin signs/context, and PDF pagination for final homologation.

## Technical Tasks

### 1. S01: Interest Coverage Math Correction
- **Service**: `src/services/residualFactsResolver.ts`
- **Logic**: Ensure `interest_coverage = EBIT / Interest Expense`.
- **EBIT**: Reconstruct as `Result Current + Interest Expense`.
- **Assert**: March ~6.04x, May ~-0.04x.

### 2. S02: EBITDA Safe Certification Gate
- **Service**: `src/services/residualFactsResolver.ts`
- **Logic**: Strict reconciliation check. If `EBIT + D&A != EBITDA` (within rounding), set status to `NOT_CERTIFIED` and value to `null`.
- **UI**: Ensure "N/A" display when not certified.

### 3. S03: Tax Noncurrent (LP) Renderer
- **Page**: `src/pages/Audit.tsx`
- **Action**: Bind all "Obrigações Tributárias (LP)" fields (Pages 2, 5, 6, 7) directly to `tax_noncurrent`.
- **Constraint**: Prohibit `|| 0` fallbacks.

### 4. S04: Margin Sign & Period Context
- **Service**: `src/services/indicatorsEngine.ts` / `src/services/residualFactsResolver.ts`
- **Logic**: Prohibit `Math.abs()` on margins. Match numerator/denominator periods.
- **Assert**: May Margin ~-8.3% (consistent across all pages).

### 5. S05: Safe Pagination & Flow
- **Style**: `src/index.css`
- **Logic**: Reinforce `245mm` max height and `report-keep-together` for key blocks (Going Concern, Pendencies).
- **Page**: `src/pages/Audit.tsx`
- **Action**: Ensure `page-break-before` triggers correctly for orphaned blocks.

### 6. Verification & Artifacts
- **File**: Create `mnt/documents/BEX_KANITZ_FINAL_SURGICAL_PATCH_RESULT.md`.
- **Logic**: Binary validation of all 5 surgical points.
