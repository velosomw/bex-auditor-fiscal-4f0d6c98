# BEX & Kanitz Final Certification — Runtime Corrected v1.1

## Certified Adjustments (Final Patch)

1. **Tax LP Binding (R$ 131k)**:
   - Fixed mapping in `Audit.tsx` for pages 2, 5, and 6.
   - Points directly to `snapshot.facts.tax_noncurrent` (Synthetic 2.2.3).
   - Added to "Key Points" summary on page 1.

2. **EBITDA Certification Gate**:
   - Strictly rendering `N/A` when `snapshot.residual.ebitda.status !== "AVAILABLE"`.
   - Applied to "Passivo / EBITDA" and all derivative cards.

3. **Margin Sign & Context**:
   - Unified `margemLiquida` consumer to use `residualFactsResolver` values where possible.
   - Fixed explicit calculation labels to preserve mathematical parity.

4. **Safe Pagination**:
   - Replaced overflow mechanisms with `report-card-keep-together` and `break-inside-avoid`.
   - Page 3 (Going Concern) and Page 4 (Technical Comments) now use container-level keep-together logic.
   - Removed static page limits.

5. **ISG Definition (Kanitz N/A)**:
   - Updated all text references to ISG = AT / (PC + PNC).
   - Synchronized `bsDadosBuilder.ts` indicator memory.

6. **Acronym Unification**:
   - PMR -> PMR (Clientes)
   - PMP -> PMP (Fornecedores)
   - Idade Média Estoque -> PME (Estoques)

**Status: BEX_KANITZ_PRODUCTION_HOMOLOGATED_FINAL_V1_1**
**Core Frozen: ACTIVE**