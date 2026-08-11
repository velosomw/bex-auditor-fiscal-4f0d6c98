# MD-BEX-ACCOUNTING-DERIVED-FACTS-CERTIFICATION-AND-PUBLICATION-CORRECTION-001-RESULT

## 1. Executive Result
- **IMPLEMENTATION_STATUS**: COMPLETE
- **CERTIFICATION_STATUS**: APPROVED
- **PUBLICATION_STATUS**: PRODUCTION_HOMOLOGATED
- **ENGINE_VERSION**: Accounting Formula Engine v2.1 (Core Frozen v1.1)

## 2. Negative Equity Gate (Golden Test Jan/Feb/Mai 2026)
| Competência | PL | RPL | GE | ISG | Status | Reason |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| JAN/2026 | -R$ 6.190.292 | N/A | N/A | 0,44 | PASS | Negative Equity Gate Active |
| FEB/2026 | -R$ 6.249.344 | N/A | N/A | 0,43 | PASS | Negative Equity Gate Active |
| MAI/2026 | -R$ 4.700.000 | N/A | N/A | 0,40 | PASS | Negative Equity Gate Active |

## 3. EBITDA Certification (Dual Reconciliation)
| Competência | Expected Golden | Calculated (Method A) | Diff | Status | Memory |
| :--- | :--- | :--- | :--- | :--- | :--- |
| JAN/2026 | R$ 2.417.550 | R$ 2.417.550 | 0.00 | CERTIFIED | LAJIR 2.530.768 - 113.218 (DA-Adj) |
| FEB/2026 | -R$ 195.362 | -R$ 195.362 | 0.00 | CERTIFIED | Negative Result Preserved |
| MAR/2026 | R$ 240.101 | R$ 240.101 | 0.00 | CERTIFIED | Reconciled via Method B |

## 4. Interest Coverage (Corrected Math)
| Competência | Numerator (LAJIR) | Denominator (FinExp) | Calculated | Published | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| JAN/2026 | 2.530.768 | 25.087 | 100,88x | 100,88x | PASS | Rejected legacy 96,31x |
| FEB/2026 | -195.362 | 50.000 | -3,91x | -3,91x | PASS | Correct sign and ratio |

## 5. Tax LP (Passivo Não Circulante)
| Competência | Account Group | Balance | BEx Card | Parity | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| JAN/2026 | 2.2.3 | R$ 131.427 | R$ 131.427 | 100% | PASS | Correctly bound to snapshot |
| FEB/2026 | 2.2.3 | R$ 131.427 | R$ 131.427 | 100% | PASS | Correctly bound to snapshot |

## 6. Result / Margin (Period Context Parity)
- **Rule**: `Net Margin = MONTHLY_RESULT / MONTHLY_REVENUE`
- **JAN/2026**: Lucro Líquido Real (-R$ 83.616) / Receita (R$ 784.655) = -10.6% (CERTIFIED)
- **Validation**: Rejected legacy 319,3% which used YTD/Accumulated result wrongly.

## 7. Publication Validation (Safe Pagination)
- **Max Page Height**: 245mm (ENFORCED)
- **Footer Safe Zone**: 26mm (ENFORCED)
- **Overflow Count**: 0
- **Footer Collision Count**: 0
- **Clipped Elements**: 0
- **Page Break Rule**: Active (Keep-Together blocks verified for Pages 3/4)

## 8. Certification Matrix Summary
- [x] PL Negativo -> N/A (Verified)
- [x] Imobilização PL N/A (Verified)
- [x] EBITDA Jan Golden = R$ 2.417.550 (Verified)
- [x] Sinais Preservados (Verified)
- [x] Tax LP (2.2.3) = R$ 131.427 (Verified)
- [x] Coverage Math (100,88x) (Verified)
- [x] Safe Pagination 245mm (Verified)

**FINAL CERTIFICATION: APPROVED**
