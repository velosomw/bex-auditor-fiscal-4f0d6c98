---
name: BEX_RUNTIME_CONSUMER_HARD_REPLACEMENT_RESULT_V2
description: Certificação final de binding financeiro, paridade BEx/Kanitz e Golden Test Março/2026 v2
type: feature
---
# BEX RUNTIME CONSUMER HARD REPLACEMENT RESULT V2

## 1. Golden Test March/2026 (Certificado)
- **Ativo Total:** R$ 331.984.602,00 (Soberano)
- **Ativo Circulante:** R$ 140.315.806,53
- **Estoques:** R$ 53.918.619,00
- **Realizável LP:** R$ 144.871.952,11
- **Passivo Circulante:** R$ 242.227.927,02
- **Passivo Não Circulante:** R$ 26.722.936,19
- **Patrimônio Líquido:** R$ 61.992.771,89
- **Receita Líquida:** R$ 77.856.316,94
- **Resultado do Período:** R$ 1.040.966,90
- **Fornecedores CP:** R$ 56.531.503,61

## 2. Indicadores Derivados (Paridade Canônica)
- **Liquidez Corrente (LC):** 0,5793
- **Liquidez Seca (LS):** 0,3567
- **Liquidez Geral (LG):** 1,0604
- **Solvência Total (ISG):** 1,2344
- **Endividamento Total:** 81,01%
- **Fator Kanitz (FI):** ≈ 0,971 (Solvente)

## 3. Remediações Estruturais Aplicadas
- **P1 Synthetic Authority:** Hard-coded mappings para códigos 1, 1.1, 2.1, 2.3, 3, etc.
- **Wrong Column Protection:** Bloqueio de colisão de papéis semânticos.
- **Sign Inversion Remediation:** GE e FI Kanitz agora utilizam Math.abs(PL) no denominador para evitar inversão de sinal em PL negativo.
- **Narrative Purge:** Remoção completa de referências numéricas ao Score BEx legado.
- **Trace ID Enforcement:** `BEX-RUNTIME-` trace ID em todos os snapshots de relatório.

## 4. Conclusão da Auditoria de Runtime
O binding financeiro foi restabelecido. Os consumidores residuais que injetavam valores incorretos (como PL de 464M ou AC de 21k) foram fisicamente substituídos pelo `reportDataset` soberano.
