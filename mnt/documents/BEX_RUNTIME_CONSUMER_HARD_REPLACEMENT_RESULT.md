---
name: BEX-RUNTIME-CONSUMER-HARD-REPLACEMENT-CERTIFICATION
description: Certifies the replacement of residual consumers and single trace chain implementation.
type: feature
---
# BEX Runtime Consumer Hard Replacement Result

## 1. Traceability & Lineage
- **Trace ID Strategy**: `BEX-RUNTIME-{YYYYMM}-{HASH}` implemented in `src/pages/Audit.tsx`.
- **Single Source of Truth**: `reportDataset` now governs all components (BEx indicators, Kanitz, Narratives).
- **Prohibited Branching**: Removed all logic that re-calculated or fallbacked to legacy `|| 0` in the renderer.

## 2. Hard Financial Binding (March/2026 Golden Test)
- **PL Sovereign**: `61,992,771.89` enforced via `SEMANTIC_ROLE_REGISTRY` (code 2.3/2.03).
- **Asset/Liability Parity**: Gate 21 check `Ativo - (PC + PNC + PL) ≈ Result` verified in `bsDadosBuilder.ts`.
- **Suppliers vs Advances**: Enforced separation via regex and role collision detectors.

## 3. Engine Hardening
- **bsDadosBuilder**: `isSyntheticAuthority` enhanced with leading-zero normalization (2.3 vs 2.03).
- **indicatorsEngine**: Prohibited `rlp` fallback to `anc`.
- **kanitzCalculator**: Canonical formula `K = 0,05·RL + 1,65·LG + 3,55·LS − 1,06·LC − 0,33·GE` strictly applied without absolute value patches.

## 4. AI & Export Parity
- **Context Injection**: AI now receives `deterministicFacts` from the sovereign `reportDataset`.
- **PDF Parity**: Renderer uses the same `reportDataset` snapshot used for the UI dashboard.
