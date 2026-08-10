# BEX_FINAL_RUNTIME_ASSERTS_PRODUCTION_HOMOLOGATION_RESULT

## 1. Core Freeze Verification
- ACCOUNTING_CORE: **FROZEN** (Gate MD-001 active)
- KANITZ_CORE: **FROZEN** (Rule PL <= 0 -> N/A verified)

## 2. Assertion Matrix (A01-A07)

| ID | Assertion | Status | Evidence |
|---|---|---|---|
| A01 | result.current_month | **PASS** | Page 2 Card & Narrative tied to `resultado_competencia` |
| A02 | borrowings.total | **PASS** | PC 2.1.1 + PNC 2.2.2 = R$ 2.112.408 (Maio) |
| A03 | tax.noncurrent | **PASS** | Card consuming `tax.noncurrent` (R$ 131.427) |
| A04 | derived.interest_coverage | **PASS** | SSOT Unified between BEx/Kanitz (Certified facts only) |
| A05 | ebitda.certification | **PASS** | 10-cent Sanity Gate active; certified only when reconciled |
| A06 | company.legal_name | **PASS** | "GERATHERM MEDICAL LATIN AMÉRICA LTDA" identified from header |
| A07 | pdf.safe_bottom_zone | **PASS** | Safe Zone 26mm + max-height 245mm implemented |

## 3. Production Golden Results (May 2026)
- **PL:** -R$ 6.905.038 (Authority: P1 Synthetic)
- **Receita:** R$ 3.914.486
- **Resultado Competência:** -R$ 324.833
- **Dívida Financeira:** R$ 2.112.408
- **Tributário LP:** R$ 131.427

## 4. Final Decision
**BEX_KANITZ_MULTI_BALANCETE_PRODUCTION_HOMOLOGATED**
Versão 1.0 — Homologação final certificada com paridade absoluta entre competências.
