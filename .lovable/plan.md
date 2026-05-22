## Diagnóstico do problema (causa-raiz)

Após auditar o código, identifiquei **uma causa-raiz comum** para quase todas as divergências relatadas:

**`computeIndicatorsFromBSRows` em `src/pages/Audit.tsx` (linhas 1320–1365) é incompleto.** A função consome `BSDadosRow` (SSOT) mas:

- Não tem `ativo_nao_circulante`, `passivo_nao_circulante` nem `patrimonio_liquido` no input (a `BSDadosRow` atual não os carrega).
- Liquidez Geral usa fallback `AC/PC` (linha 1340 — proxy errado).
- Liquidez Seca está correta, mas o `estoques` pode estar duplicando (componente ∈ AC).
- Endividamento Total usa `pt = divida_total` (componentes) ÷ `at = AC` apenas — totalmente incorreto.
- Atividade (PMR, Giro): `_contasReceber = 0` hardcoded → PMR sempre 0.
- Rentabilidade: `margemOperacional = margemLiquida` (sem LAJIR separado).
- EBITDA: `_resOp = lucro` e `_despFin = 0` → reduz a `lucro` apenas.
- ROE: usa PL derivado errado (`AC − dívida_total`).
- A aba Endividamento usa esses mesmos campos → "Estrutura da Dívida" e "Dívida Líquida" herdam o erro.
- A aba Pivot exclui PL e Resultado porque `REF1_MAP` em `bsDadosBuilder.ts` (linhas 71–74) ignora `GG1`/`HH1` propositalmente.
- DRE no `BSDadosRow` acumula CMV e Despesas via SOMA mensal (ok para receita/cmv mês a mês), mas quando o balancete entrega valores **acumulados YTD**, o que vai pro relatório é o acumulado — divergente do esperado (variação mensal).
- Kanitz consome `computeIndicators` que depende de PL e ANC corretos — herda os mesmos buracos. Não existe ISG implementado.

## Estratégia de correção

Reconstruir a engine de indicadores **inteiramente a partir do SSOT (BS & Dados)**, estendendo a `BSDadosRow` para carregar os campos faltantes que o template BEX já tem na origem. Manter o builder atual como ponto único de extração → engine derivada idempotente → todas as abas leem da mesma engine.

```text
Balancete → bsDadosBuilder (SSOT) ──┐
                                    ├─→ engine indicadores (NOVA, completa)
                                    │     ├─→ TabIndicadores
                                    │     ├─→ TabEndividamento
                                    │     ├─→ TabPatrimonial
                                    │     ├─→ TabBSDados
                                    │     ├─→ TabPivot (com PL+Resultado)
                                    │     ├─→ TabGráficos
                                    │     └─→ TabKanitz (com ISG)
                                    └─→ memória de cálculo (UI explicativa)
```

## Etapas

### 1. Estender `BSDadosRow` (`src/services/bsDadosBuilder.ts`)

Adicionar campos do template BEX que faltam:

- `ativo_nao_circulante` (Σ Refs P..J1)
- `passivo_nao_circulante` (Σ Refs PP..FF1)
- `patrimonio_liquido` (Σ Refs GG1 + HH1 + resultado acumulado)
- `imobilizado` (Refs C1 + D1)
- `contas_receber` (Ref C)
- `despesas_financeiras` (separado de despesas operacionais via regex)
- `depreciacao` / `amortizacao` (via regex no DRE)
- `cmv_mensal` / `despesas_mensal` / `receita_mensal` — variação mês a mês quando o balancete entrega YTD acumulado

Detecção YTD-vs-mensal: comparar receita do mês N com mês N-1 ordenado cronologicamente. Se monotônica crescente e razão estável → YTD; deltar contra mês anterior.

### 2. Atualizar `REF1_MAP` para incluir PL e ANC

- Mapear `GG1`, `HH1` → `patrimonio_liquido`
- Mapear `P..J1` → `ativo_nao_circulante`
- Mapear `PP..FF1` (exceto já mapeados como dívida) → `passivo_nao_circulante`
- Não duplicar: contas já mapeadas a `divida_financeira`/`fornecedores`/etc continuam só lá; PNC recebe apenas as não-classificadas como componente de dívida específica.

### 3. Criar `src/services/indicatorsEngine.ts` (novo)

Engine única que consome `BSDadosRow[]` e produz `IndicatorRow` por mês:

```text
Liquidez:
  liquidezCorrente   = AC / PC
  liquidezSeca       = (AC − Estoques) / PC
  liquidezImediata   = Disponível / PC
  liquidezGeral      = (AC + ANC_realizavel) / (PC + PNC)
                      [usa ANC total como proxy se RLP não separado]

Endividamento:
  endividamentoGeral       = (PC + PNC) / (AC + ANC)
  composicaoEndividamento  = PC / (PC + PNC)
  imobilizacaoPL           = Imobilizado / PL  (se PL>0; senão N/A)
  coberturaJuros           = (Resultado + |DespFin|) / |DespFin|

Atividade:
  giroAtivo            = Receita / (AC + ANC)
  pmr                  = (ContasReceber × 30) / ReceitaMensal   [mensal!]
  pmp                  = (Fornecedores × 30) / CMVMensal
  idadeMediaEstoque    = (Estoques × 30) / CMVMensal

Rentabilidade:
  margemLiquida        = Resultado / Receita
  margemOperacional    = (Resultado + |DespFin|) / Receita     [proxy LAJIR]
  roa                  = Resultado / (AC + ANC)
  roe                  = Resultado / PL                          [N/A se PL≤0]

EBITDA:
  ebitda = LAJIR + Depreciação + Amortização
         = (Resultado + |DespFin|) + |Depreciação| + |Amortização|
```

PMR/PMP/idade-estoque passam a usar 30 (mensal) e a base mensal da DRE — não mais 360 sobre receita acumulada.

### 4. Refatorar `src/pages/Audit.tsx`

- Apagar `computeIndicatorsFromBSRows` e `computeIndicatorsFromParsed` (linhas 1265–1365).
- Substituir por `useIndicators(bsRows)` que delega à engine nova.
- `TabIndicadores`, `TabEndividamento` e card "EBITDA Estimado" passam a ler dessa engine.
- "Estrutura da Dívida" e "Dívida Líquida" reescritas com valores da SSOT + tooltip de origem.
- "Curto vs Longo Prazo" recalculado com PC e PNC reais; tooltip exibe origem.
- Em cada quadro adicionar `FormulaInfo` com fórmula + contas usadas (já existe o componente).

### 5. Corrigir variação mensal na DRE (BS & Dados)

No `bsDadosBuilder.ts`:

- Após consolidar todos os meses, detectar se DRE é YTD (regra: monotônica crescente entre meses consecutivos no mesmo ano) e converter para mensal: `mes_N = ytd_N − ytd_(N-1)` (com `mes_1 = ytd_1`).
- Aplicar para `receita_liquida`, `cmv`, `despesas`, `despesas_financeiras`, `depreciacao`, `amortizacao`. Manter `resultado` derivado depois da conversão.
- O quadro "Demonstração de Resultado e Performance" da `TabBSDados` passa a exibir variação mensal coerente.

### 6. Pivot — incluir PL e Resultado (`TabPivotBalancete.tsx`)

Atualmente filtra só Refs A..O / AA..II1. Atualizar a montagem das linhas para incluir:

- PL: Refs `GG1`, `HH1`
- Resultado: linhas com `RESULTADO` ou regex de "resultado do exercício"

Adicionar coluna "Grupo" (Ativo / Passivo / PL / Resultado) para ficar legível.

### 7. Kanitz + ISG (`src/services/kanitzCalculator.ts` + `TabKanitz.tsx`)

- Indicadores X1..X5 do Kanitz passam a usar PL, ANC, PNC reais do SSOT (corrige todos os Xi).
- Adicionar **ISG (Índice de Solvência Geral)**:
  - Fórmula: `ISG = AtivoTotal / (PC + PNC)` (ativo total ÷ capital de terceiros)
  - Faixas: `>1.5 Solvente | 1.0–1.5 Atenção | <1.0 Insolvente`
  - Exibido quando PL ≤ 0 (situação da empresa) e/ou sempre como quadro complementar.
- Novo card "Insolvência Geral (ISG)" na aba Kanitz com fórmula, valor, faixa e alerta visual.

### 8. Gráficos de Auditoria

Sem mudança de lógica — os 6 gráficos já leem de `MonthlyDatum` via `bsDadosToMonthlyDatum`. Atualizar esse adapter para propagar os novos campos (ANC, PNC, PL, despFin, deprec/amort) ao `MonthlyDatum`, e os gráficos voltam a bater (Liquidez Geral, Endividamento, EBITDA, Resultado/RL).

## Detalhes técnicos

**Arquivos modificados:**

- `src/services/bsDadosBuilder.ts` — novos campos + REF1_MAP atualizado + detecção YTD→mensal
- `src/services/indicatorsEngine.ts` — **novo**, engine única
- `src/services/bsDadosToMonthlyDatum.ts` — propagar novos campos
- `src/services/kanitzCalculator.ts` — usar PL/ANC/PNC reais + função `computeISG`
- `src/pages/Audit.tsx` — `TabIndicadores`, `TabEndividamento` consomem engine nova; remover funções duplicadas
- `src/components/audit/TabBSDados.tsx` — exibir DRE em variação mensal
- `src/components/audit/TabKanitz.tsx` — novo card ISG
- `src/components/audit/TabPivotBalancete.tsx` — incluir PL e Resultado + coluna Grupo

**Sem alteração:**

- `src/components/audit/AuditCharts.tsx` / `TabGraficosAuditoria.tsx` — leem do dataset; correção propaga
- `src/contexts/AuditContext.tsx`
- Estrutura de banco — tudo derivado em runtime

**Validações automáticas a manter:**

- Ativo = Passivo + PL (tolerância 0,5%)
- Receita ≠ 0; CMV ≤ 0
- Mês duplicado: soma + alerta

## Entrega

Implementação em **uma rodada** após aprovação. Cada aba do Diagnóstico exibirá `FormulaInfo` com a fórmula exata e as contas (ou Refs) usadas, para auditoria visual.

## Pendência

Não recebi a fórmula/faixas oficiais do ISG. Vou usar a definição clássica `ISG = AT / (PC + PNC)` com cortes 1.5 / 1.0. Se preferir outra, me passe antes que eu codifique.
