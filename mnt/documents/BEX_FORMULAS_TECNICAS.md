# Fórmulas e Regras de Cálculo Contábil BEX

Este documento técnico detalha as fórmulas matemáticas, regras de integridade e taxonomia contábil utilizadas na plataforma para a geração dos relatórios BEx e Kanitz.

## 1. Modelo de Insolvência de Kanitz (Fator de Insolvência)

O Fator de Insolvência (FI) é calculado pela fórmula canônica de Stephen Kanitz, utilizada para prever a probabilidade de falência de empresas.

**Fórmula Master:**
`K = (0,05 * RL) + (1,65 * LG) + (3,55 * LS) - (1,06 * LC) - (0,33 * GE)`

### Componentes do Kanitz:
- **Rentabilidade do PL (RL):** `Lucro Líquido / |Patrimônio Líquido|`
- **Liquidez Geral (LG):** `(Ativo Circulante + Realizável a Longo Prazo) / (Passivo Circulante + Passivo Não Circulante)`
- **Liquidez Seca (LS):** `(Ativo Circulante - Estoques) / Passivo Circulante`
- **Liquidez Corrente (LC):** `Ativo Circulante / Passivo Circulante`
- **Grau de Endividamento (GE):** `(Passivo Circulante + Passivo Não Circulante) / |Patrimônio Líquido|`

### Regras de Aplicabilidade:
- **PL <= 0:** O modelo Kanitz é marcado como **N/A (Não Aplicável)**. Isso evita distorções onde um prejuízo dividido por PL negativo geraria um indicador positivo falso.
- **ISG (Índice de Solvência Geral):** Nestes casos, o ISG assume como indicador de referência:
  - `ISG = Ativo Total / (Passivo Circulante + Passivo Não Circulante)`
  - *Referência:* > 1,5 (Solvente) | 1,0 a 1,5 (Atenção) | < 1,0 (Insolvente)

---

## 2. Indicadores Econômico-Financeiros (Engine Única)

### Indicadores de Liquidez:
- **Liquidez Corrente:** `Ativo Circulante / Passivo Circulante`
- **Liquidez Seca:** `(Ativo Circulante - Estoques) / Passivo Circulante`
- **Liquidez Imediata:** `Disponível (Caixa e Equivalentes) / Passivo Circulante`
- **Liquidez Geral:** `(AC + RLP) / (PC + PNC)`

### Estrutura e Endividamento:
- **Endividamento Total:** `(Passivo Circulante + Passivo Não Circulante) / Ativo Total`
- **Grau de Endividamento / PL:** `(Passivo Circulante + Passivo Não Circulante) / Patrimônio Líquido`
- **Composição do Endividamento:** `Passivo Circulante / (Passivo Circulante + Passivo Não Circulante)`
- **Imobilização do PL:** `Ativo Imobilizado / Patrimônio Líquido`
- **Cobertura de Juros:** `LAJIR / |Despesas Financeiras|`

### Rentabilidade e Margens:
- **Margem Líquida:** `Resultado Líquido / Receita Líquida`
- **Margem Operacional:** `LAJIR / Receita Líquida`
- **ROA (Retorno sobre Ativo):** `(Resultado Líquido / Ativo Total) * 12` (Anualizado)
- **ROE (Retorno sobre Patrimônio):** `(Resultado Líquido / Patrimônio Líquido) * 12` (Anualizado)
- **EBITDA (LAJIDA):** `LAJIR + Depreciação + Amortização`
- **LAJIR (EBIT):** `Resultado Líquido + Despesas Financeiras - Receitas Financeiras + Tributos sobre o Lucro (IRPJ/CSLL)`

### Prazos Médios (Atividade):
- **PMR (Recebimento):** `(Contas a Receber * 30) / Receita Líquida`
- **PMP (Pagamento):** `(Fornecedores * 30) / ((Receita Líquida / 12) * 0,7)` (Benchmark: 70% da receita como base de compras)
- **PME (Estoque):** `(Estoques * 30) / |CMV|`
- **Ciclo Operacional:** `PME + PMR`
- **Ciclo Financeiro:** `Ciclo Operacional - PMP`

---

## 3. Score BEX-RJ (Risco de Recuperação Judicial)

Modelo proprietário para identificar a probabilidade de necessidade de proteção judicial.

**Fórmula de Ponderação:**
`Score RJ = (Endividamento * 0,25) + (Liquidez * 0,20) + (PL Negativo * 0,20) + (Geração Caixa * 0,20) + (Concentração Dívida * 0,15)`

---

## 4. Regras de Integridade (P1 Synthetic Authority)

A plataforma opera sob a estratégia de **Autoridade Sintética Direta**:
1. **SSOT (Single Source of Truth):** Os valores dos grupos sintéticos (ex: 1.1 Ativo Circulante) extraídos diretamente do balancete são absolutos.
2. **Resolução de Conflitos:** Divergências entre a soma dos analíticos e o total do grupo sintético são tratadas como resíduo, preservando o valor do grupo pai.
3. **Equação Patrimonial:** O sistema valida rigorosamente se `Ativo = Passivo + Patrimônio Líquido`.

---

## 5. Taxonomia de Fatos Residuais

- **Dívida Financeira:** Exclui Leasings/Arrendamentos para análise de risco bancário puro.
- **Tributário LP:** Identificado estritamente pelo grupo 2.2.3 do balancete.
- **Trabalhista CP:** Composto por Salários, INSS, FGTS e Provisões (Férias/13º).
