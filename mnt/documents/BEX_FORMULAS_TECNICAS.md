# Fórmulas e Regras de Cálculo Contábil BEX

Este documento descreve as fórmulas matemáticas e regras de integridade utilizadas na plataforma para a geração dos relatórios BEx e Kanitz.

## 1. Modelo de Insolvência de Kanitz (Fator de Insolvência)

O Fator de Insolvência (FI) é calculado pela fórmula canônica de Stephen Kanitz:

**Fórmula:**
`K = (0,05 * RL) + (1,65 * LG) + (3,55 * LS) - (1,06 * LC) - (0,33 * GE)`

### Componentes do Kanitz (Indicadores):
- **Rentabilidade do PL (RL):** `Lucro Líquido / |Patrimônio Líquido|`
- **Liquidez Geral (LG):** `(Ativo Circulante + Realizável a Longo Prazo) / (Passivo Circulante + Passivo Não Circulante)`
- **Liquidez Seca (LS):** `(Ativo Circulante - Estoques) / Passivo Circulante`
- **Liquidez Corrente (LC):** `Ativo Circulante / Passivo Circulante`
- **Grau de Endividamento (GE):** `(Passivo Circulante + Passivo Não Circulante) / |Patrimônio Líquido|`

### Regras de Aplicabilidade:
- **PL <= 0:** O relatório é marcado como **N/A (Não Aplicável)** para evitar distorções matemáticas em indicadores que utilizam o PL como denominador (RL e GE).
- **ISG (Índice de Solvência Geral):** Utilizado como indicador alternativo quando o Kanitz não é aplicável.
  - `ISG = Ativo Total / (Passivo Circulante + Passivo Não Circulante)`

---

## 2. Indicadores Financeiros e de Rentabilidade

### Liquidez:
- **Liquidez Corrente:** `Ativo Circulante / Passivo Circulante`
- **Liquidez Seca:** `(Ativo Circulante - Estoques) / Passivo Circulante`
- **Liquidez Imediata:** `Disponível (Caixa e Equivalentes) / Passivo Circulante`
- **Liquidez Geral:** `(AC + RLP) / (PC + PNC)`

### Estrutura e Endividamento:
- **Endividamento Total:** `(Passivo Circulante + Passivo Não Circulante) / Ativo Total`
- **Grau de Endividamento / PL:** `(PC + PNC) / Patrimônio Líquido`
- **Composição do Endividamento:** `Passivo Circulante / (PC + PNC)`
- **Imobilização do PL:** `Ativo Imobilizado / Patrimônio Líquido`
- **Cobertura de Juros:** `LAJIR / |Despesas Financeiras|`

### Rentabilidade e Margens:
- **Margem Líquida:** `Resultado Líquido / Receita Líquida`
- **Margem Operacional:** `LAJIR / Receita Líquida`
- **ROA (Retorno sobre Ativo):** `(Resultado Líquido / Ativo Total) * 12` (anualizado)
- **ROE (Retorno sobre Patrimônio):** `(Resultado Líquido / Patrimônio Líquido) * 12` (anualizado)
- **EBITDA (LAJIDA):** `LAJIR + Depreciação + Amortização`
- **LAJIR (EBIT):** `Resultado + Despesas Financeiras - Receitas Financeiras + Tributos sobre o Lucro`

### Prazos Médios (Atividade):
- **PMR (Prazo Médio de Recebimento):** `(Contas a Receber * 30) / Receita Líquida`
- **PMP (Prazo Médio de Pagamento):** `(Fornecedores * 30) / ((Receita Líquida / 12) * 0,7)` (ou fallback via CMV)
- **PME (Prazo Médio de Estoque):** `(Estoques * 30) / |CMV|`
- **Ciclo Operacional:** `PME + PMR`
- **Ciclo Financeiro (Ciclo de Caixa):** `PME + PMR - PMP`

---

## 3. Regras de Integridade e Hierarquia (P1 Synthetic Authority)

A plataforma utiliza a estratégia **P1 (Direct Synthetic Authority)** para garantir a integridade dos dados extraídos:
1. **Autoridade Sintética:** Valores de grupos totais (ex: Ativo Circulante Total) extraídos do balancete têm precedência sobre a soma de seus analíticos.
2. **Resolução de Conflitos:** Se a soma dos analíticos divergir do total sintético, o valor sintético é mantido e a diferença é tratada como resíduo de classificação, preservando o fechamento do balanço.
3. **Hard Gate:** O Ativo Total deve ser rigorosamente igual à soma do Passivo + Patrimônio Líquido. Divergências acima de 0,1% disparam alertas de integridade.

---

## 4. Taxonomia de Dívidas e Obrigações

- **Dívida Bancária/Financeira:** Inclui Empréstimos, Financiamentos e Debêntures. Exclui Leasings (Arrendamentos) para fins de análise de risco bancário.
- **Exigibilidade Fiscal:** Separada em Obrigações Correntes e Parcelamentos (Refis/PERT) para análise de fluxo de caixa de longo prazo.
- **Obrigações Trabalhistas:** Compostas por Salários a Pagar, Encargos (INSS/FGTS) e Provisões de Férias/13º.
