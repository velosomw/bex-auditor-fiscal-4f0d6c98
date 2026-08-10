# BEX_FINAL_CONSUMER_RUNTIME_HARD_CUTOVER_RESULT

## A. Core Freeze Verification
- `FINAL_ACCOUNTING_CORE_FREEZE` = TRUE
- Source Binding: Frozen
- Snapshot ID: Frozen
- Processing Run ID: Frozen
- Canonical Account Mapping: Frozen

## B. March Golden Assertions
- PL: -5.814.097,17 (PASS)
- Revenue: 2.904.639,46 (PASS)
- Result Current Month: 435.247,05 (PASS)
- Result Accumulated: 292.578,64 (PASS)
- Borrowings Total: 2.172.211,38 (PASS)
- Tax LP: 131.426,70 (PASS)
- Suppliers LP: 321.628,76 (PASS)

## C. May Golden Assertions
- PL: -6.905.037,81 (PASS)
- Revenue: 3.914.485,54 (PASS)
- Result Current Month: -324.833,14 (PASS)
- Result Accumulated: -798.362,00 (PASS)
- Borrowings Total: 2.112.408,34 (PASS)
- Tax LP: 131.426,70 (PASS)
- Suppliers LP: 304.144,22 (PASS)

## D. Result Consumer Audit
- Label "Resultado da Competência" binds to `financial.result.current_month`.
- Label "Resultado Acumulado" binds to `financial.result.accumulated`.
- Hard Gate result.current_month mismatch: PASS.

## E. Borrowings Consumer Audit
- Total Borrowings = Current + Noncurrent certified roles.
- Hard Consumer Binding: PASS.

## F. Tax LP Consumer Audit
- tax.noncurrent renderer binds to `tax.noncurrent` fact.
- Display R$ 131.427: PASS.

## G. Suppliers LP Cross-Section Audit
- All consumers (Endividamento, Balanço, Narrativa) bind to `financial.suppliers.noncurrent`.
- Certified fact rendered correctly: PASS.

## H. Derived Registry Audit
- Interest Coverage Single Source: PASS.
- EBITDA Runtime Gate: PASS.
- EBITDA Sign Sanity Gate: PASS.

## I. Coverage Cross-Report Audit
- BEx coverage == Kanitz coverage: PASS.
- Unified fact consumption: PASS.

## J. EBITDA Certification Audit
- False certification labels removed: PASS.
- Reconciliation validation: PASS.

## K. Margin Period Context Audit
- Current month margin uses monthly facts only: PASS.
- YTD margin uses accumulated facts only: PASS.

## L. Narrative Certification Audit
- Unsupported claims removed for non-certified facts: PASS.
- Fallback narratives applied: PASS.

## M. BEx Pagination Audit
- Content safe bottom zone: 26mm (PASS).
- Truncation/Overlap check: PASS.

## N. Kanitz Regression Audit
- PL/Revenue regression: 0.
- FI N/A for PL <= 0: PASS.

## O. Final Consumer Matrix
| Role | Mar BEx | Mar Kanitz | Mai BEx | Mai Kanitz | Fact ID | Status |
|---|---|---|---|---|---|---|
| PL | -5.81M | -5.81M | -6.90M | -6.90M | equity | CERTIFIED |
| Revenue | 2.90M | 2.90M | 3.91M | 3.91M | net_revenue | CERTIFIED |
| Result Current | 435K | 435K | -324K | -324K | result.current_month | CERTIFIED |
| Result Acc | 292K | 292K | -798K | -798K | result.accumulated | CERTIFIED |
| Borrowings | 2.17M | 2.17M | 2.11M | 2.11M | borrowings.total | CERTIFIED |
| Tax LP | 131K | 131K | 131K | 131K | tax.noncurrent | CERTIFIED |
| Suppliers LP | 321K | 321K | 304K | 304K | suppliers.noncurrent| CERTIFIED |

## P. Final Homologation Decision
**BEX_KANITZ_MULTI_BALANCETE_PRODUCTION_HOMOLOGATED**
