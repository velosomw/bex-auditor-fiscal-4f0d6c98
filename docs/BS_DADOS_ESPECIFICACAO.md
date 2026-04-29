# BS & Dados — Especificação Funcional (Single Source of Truth)

> Replica a aba **"Dados para Gráficos"** do template BEX (`01.BASE_RELATÓRIO_xi_teste_2-2.XLSM`).  
> Esta é a base única que alimenta:
> - Aba **"BS & Dados"** da auditoria
> - Aba **"Gráficos de Auditoria"** (CMV/RL, CMV+Despesa/RL, Resultado/RL, EBITDA, Liquidez, Endividamento)
> - Cálculo Kanitz, BEX-RJ, BEX Solvência
> - Relatório BEX final (PDF/Word)

---

## 1. Origem dos dados

### 1.1 Cenários suportados

| Cenário | Descrição | Origem dos meses |
|---|---|---|
| **A** | 1 balancete com 1 mês | Mês atribuído pelo usuário no upload |
| **B** | 1 balancete com múltiplos meses (planilha BEX) | Cada coluna do balancete = um mês |
| **C** | 2 ou 3 balancetes mensais distintos | Mês atribuído pelo usuário em cada arquivo |

### 1.2 Coluna de saldo
Sempre o **Saldo Atual** do balancete (após movimentação do período).

---

## 2. Agrupamento por **Ref 1 (Ref Capital)**

A aba **BS** da planilha define uma chave `Ref Capital` para cada conta do balanço. Toda conta do balancete é mapeada para uma das chaves abaixo, e a soma do saldo atual por chave compõe a linha mensal de BS & Dados.

### 2.1 Ativo Circulante
| Ref | Conta |
|---|---|
| A | Caixa e Equivalentes de Caixa |
| B | Aplicações Financeiras |
| C | Contas a receber de clientes |
| D | Estoque |
| E | Adiantamento a Fornecedor |
| F | Partes Relacionadas |
| G | Impostos a recuperar |
| H | Juros a Apropriar |
| I | Outros Créditos |
| J | Adiantamento a Funcionários |
| K | Depósitos judiciais |
| L | Tributos diferidos |
| M | Investimentos Temporários |
| N | Consórcio |
| O | Seguros a Apropriar |

### 2.2 Ativo Não Circulante
| Ref | Conta |
|---|---|
| P | Contas a receber (LP) |
| Q | Depósitos judiciais (LP) |
| R | Impostos a recuperar (LP) |
| S | Partes Relacionadas (A.N.C) |
| T | Empréstimos (LP) |
| U | Bens destinados a Venda |
| V | Realizável a Longo Prazo |
| W | Impostos Diferidos (LP) |
| X | Adiantamentos (LP) |
| Y | Indenizações e reversibilidade contratuais (LP) |
| Z | Ativos Financeiros (LP) |
| A1 | Outros Créditos (LP) |
| B1 | Investimentos |
| C1 | Imobilizado Líquido |
| D1 | Intangível |
| E1..J1 | Demais ANC |

### 2.3 Passivo Circulante
| Ref | Conta |
|---|---|
| AA | Empréstimos e Financiamentos |
| BB | Fornecedores |
| CC | Obrigações Trabalhistas |
| DD | Obrigações Tributárias |
| EE | Contas a pagar |
| FF | Provisões |
| GG | Adiantamento de Clientes |
| HH | Outras Obrigações |
| II | Credores RJ |
| JJ | Partes Relacionadas (P.C.) |
| KK | Dividendos a pagar |
| LL | Recuperação Judicial |
| MM | Contas de Compensação Passiva |
| NN | Taxas e Contribuições a pagar |
| OO | Adiantamento de Câmbio |
| II1 | Obrigações tributárias Parceladas |

### 2.4 Passivo Não Circulante
| Ref | Conta |
|---|---|
| PP | Fornecedores (LP) |
| QQ | Empréstimos e financiamentos (LP) |
| RR | Obrigações tributárias Parceladas (LP) |
| SS | Provisões para contingências |
| TT | Partes Relacionadas (P.N.C.) |
| UU..FF1 | Demais PNC |

### 2.5 Patrimônio Líquido
| Ref | Conta |
|---|---|
| GG1 | Capital Social |
| HH1 | Lucro/Prejuízo Acumulado |
| Resultado | Resultado do exercício |

---

## 3. Estrutura mensal consolidada

Cada linha de BS & Dados representa **um mês** e contém os agregados:

```
mesKey: "YYYY-MM"        ex.: "2024-03"
mes:    "Março 2024"

— DRE —
receita_liquida          (positivo)
cmv                      (negativo)
despesas                 (negativo)
resultado                (sinal natural)

— BALANÇO —
ativo_circulante         (Σ A..O)
passivo_circulante       (Σ AA..II1)
estoques                 (Ref D)
disponivel               (Ref A + B)

— ENDIVIDAMENTO (módulo) —
divida_tributaria        (DD + II1 + RR)
divida_trabalhista       (CC)
divida_financeira        (AA + QQ)
fornecedores             (BB + PP)
credores_rj              (II + LL + CC1)
divida_total             = Σ acima
```

---

## 4. Fórmulas dos Gráficos de Auditoria

> Todas baseadas nas linhas mensais de BS & Dados.

### 4.1 CMV / RECEITA LÍQUIDA (%)
```
% = |CMV| / Receita Líquida
```

### 4.2 CMV + DESPESA / RECEITA LÍQUIDA (%)
```
% = (|CMV| + |Despesas|) / Receita Líquida
```

### 4.3 RESULTADO / RECEITA LÍQUIDA (%)
```
% = Resultado / Receita Líquida   (mantém sinal)
```

### 4.4 EBITDA
```
EBITDA = Resultado + |Despesas Financeiras| + |Depreciação| + |Amortização| + |Tributos sobre lucro|
```

### 4.5 LIQUIDEZ
- **Imediata** = Disponível / Passivo Circulante
- **Corrente** = Ativo Circulante / Passivo Circulante
- **Seca**     = (Ativo Circulante − Estoques) / Passivo Circulante

### 4.6 ENDIVIDAMENTO
- **Endividamento Geral** = (Passivo Circulante + Passivo Não Circulante) / Patrimônio Líquido
- **Composição Endividamento** = Passivo Circulante / (PC + PNC)

---

## 5. Validações obrigatórias

Por linha mensal:
- ❌ **Receita líquida zerada** → alerta "ausente"
- ❌ **CMV positivo** → alerta "sinal invertido"
- ❌ **Mês duplicado** entre balancetes → alerta "consolidar"
- ❌ **Ativo ≠ Passivo + PL** (tolerância ±1%) → alerta "balanço não fecha"

---

## 6. Pipeline de fluxo

```
Upload (1..3 balancetes)
   │  + mês atribuído pelo usuário (campo "Mês de Referência")
   ▼
Pipeline IA (audit-pipeline-process)
   │  → balancete_data (conta_original, valor, categoria)
   ▼
auditAIService.analyzeFinancialData
   │  → ParsedFinancialData { years, dre[], balanco[] }
   ▼
bsDadosBuilder.buildBSDados(parsed, entries)
   │  → BSDadosRow[] (1 linha por mês)
   ▼
   ├──► TabBSDados (tabela consolidada)
   ├──► AuditCharts (6 gráficos pixel-perfect)
   ├──► kanitzCalculator
   └──► Relatório BEX (PDF/Word)
```
