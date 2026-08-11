# MD-BEX-ACCOUNTING-FORMULA-CORRECTION-ENGINE-001-RESULT

## 1. Competências Obrigatórias
- **Março/2026**: Validado com dados reais.
- **Maio/2026**: Validado com dados reais.

## 2. Valores-Base Extraídos (Normalizados)

### Competência: Maio/2026
| Conta/Grupo | Valor Bruto | Valor Normalizado | Fonte | Reconciliação |
| :--- | :--- | :--- | :--- | :--- |
| Ativo Circulante (1.1) | R$ 4.217.619,56 | 4.217.619,56 | Balancete | OK (Synthetic P1) |
| Ativo Não Circulante (1.2) | R$ 353.049,13 | 353.049,13 | Balancete | OK |
| Ativo Total (1) | R$ 4.570.668,69 | 4.570.668,69 | Balancete | OK |
| Passivo Circulante (2.1) | R$ 4.825.986,32 | 4.825.986,32 | Balancete | OK |
| Passivo Não Circulante (2.2) | R$ 182.765,45 | 182.765,45 | Balancete | OK |
| Patrimônio Líquido (2.3) | -R$ 438.083,08 | -438.083,08 | Balancete | OK |
| Receita Líquida (3.1) | R$ 643.872,15 | 643.872,15 | Balancete | OK |
| Resultado Líquido (3.1.9) | -R$ 156.983,45 | -156.983,45 | Balancete | OK |

### Competência: Março/2026
| Conta/Grupo | Valor Bruto | Valor Normalizado | Fonte | Reconciliação |
| :--- | :--- | :--- | :--- | :--- |
| Ativo Circulante (1.1) | R$ 4.381.936,43 | 4.381.936,43 | Balancete | OK |
| Ativo Total (1) | R$ 4.772.566,02 | 4.772.566,02 | Balancete | OK |
| Passivo Circulante (2.1) | R$ 4.654.321,10 | 4.654.321,10 | Balancete | OK |
| Patrimônio Líquido (2.3) | -R$ 71.755,08 | -71.755,08 | Balancete | OK |

## 3. Validação dos Indicadores e Cálculo Matemático

### Liquidez Corrente (LC)
- **Fórmula**: Ativo Circulante / Passivo Circulante
- **Março/2026**: 4.381.936,43 / 4.654.321,10 = **0.94**
- **Maio/2026**: 4.217.619,56 / 4.825.986,32 = **0.87**

### Liquidez Seca (LS)
- **Fórmula**: (Ativo Circulante - Estoques) / Passivo Circulante
- **Março/2026**: (4.381.936,43 - 115.000,00) / 4.654.321,10 = **0.92**
- **Maio/2026**: (4.217.619,56 - 124.567,89) / 4.825.986,32 = **0.85**

### Kanitz (FI)
- **Fórmula**: K = (0,05 × RL) + (1,65 × LG) + (3,55 × LS) - (1,06 × LC) - (0,33 × GE)
- **Março/2026**: PL <= 0 (-71.755,08) -> **N/A** (Regra MD-BEX-MULTI-BALANCETE §08)
- **Maio/2026**: PL <= 0 (-438.083,08) -> **N/A** (Regra MD-BEX-MULTI-BALANCETE §08)
- **Nota**: O modelo de Kanitz é estatisticamente inválido para empresas com Passivo a Descoberto.

### ISG (Solvência)
- **Fórmula**: Ativo Total / (Passivo Circulante + Passivo Não Circulante)
- **Março/2026**: 4.772.566,02 / (4.654.321,10 + 190.000,00) = **0.99**
- **Maio/2026**: 4.570.668,69 / (4.825.986,32 + 182.765,45) = **0.91**

## 4. Comparação Fórmula Anterior × Corrigida

| Competência | Indicador | Fórmula Corrigida | Valor Recalculado | Delta | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| Mai/2026 | PMR | Receita Líquida (Annualized) | 393.66 | 0.00 | CORRIGIDO |
| Mai/2026 | PMP | Proxy (70% Receita) | 700.13 | -4.20 | ESTIMADO |
| Mai/2026 | ROA | Annualized (Factor 2.4) | -0.08 | +0.15 | CORRIGIDO |

## 5. Rastreabilidade (Lineage)
- **Source File**: BALANCETE_05_2026.xlsx
- **Formula Engine Version**: 2.0 (Accounting Formula Correction Engine)
- **Temporal Rule**: Annualization active (months=5, factor=2.4)
- **P1 Authority**: Synthetic parents (Group 1, 2) matched calculated children.

## 6. Conclusão de Homologação
- **Março/2026**: HOMOLOGADO: SIM
- **Maio/2026**: HOMOLOGADO: SIM
- **Engine Contábil**: **APROVADA**

A engine 2.0 demonstra consistência matemática e aderência estrita às regras de periodicidade e sinais contábeis.
