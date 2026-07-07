## Escopo

Refazer a análise gerada pela IA no **Relatório Kanitz Expandido** (`TabRelatorioKanitz`, em `src/pages/Audit.tsx`), corrigindo cálculos, contexto e narrativa quando o Patrimônio Líquido é negativo (caso Giannini), removendo o módulo Risk Engine e alinhando todos os textos ao motor de cálculo contábil.

## Correções técnicas (motor de cálculo)

1. **Preservar sinal do PL** — remover `Math.abs()` de Patrimônio Líquido e Lucro Líquido em `kanitzResults` (linhas 3638-3640). Com PL negativo o Kanitz é **inválido** (RPL vira falso positivo).
2. **Novo indicador — Índice de Solvência Geral (ISG)** = `AT / PT`. Calculado sempre; usado como *substituto oficial* quando `PL ≤ 0`. Faixas: > 1,5 saudável · 1,0-1,5 atenção · < 1,0 insolvência técnica.
3. **Flag `kanitzAplicavel`** por período (= `pl > 0`). Quando falsa: FI mostrado apenas como referência com badge "**Não aplicável — PL negativo**" e a narrativa passa a usar ISG.
4. **Meses ausentes (01/2026)** — verificar `parsedData.years`; garantir ordenação cronológica e inclusão de todos os períodos retornados pelo motor mensal (`kanitzMonthly`). Corrigir filtragem que descarta o mês mais recente.
5. **Rentabilidade zerada** — quando PL ≤ 0, exibir "N/A (PL negativo)" ao invés de `0`. Quando PL > 0 e LL = 0, exibir 0 real.
6. **LG / LS** — recomputar por período usando os totais oficiais do motor (`ac + rlp` sobre `pc + pnc`; e `(ac − estoque)/pc`). Corrigir busca de "realizável a longo prazo" para não colidir com "realizável".
7. **Endividamento Geral** — usar fórmula do motor: `PT / AT` (não `PT/PL`). Sincronizar valor exibido com o do mês selecionado (janeiro/2026: 5,00 no motor).
8. **Alavancagem / Capital de Terceiros / PL** — retornar `N/A` quando PL ≤ 0 (evita "0,00x" falso).
9. **PNC ausente** — buscar por `total do passivo não circulante`, `passivo nao/não circulante` e `exigível a longo prazo` (ampliar variações). Registrar origem do valor em tooltip.
10. **EBITDA / Cobertura de juros / Geração de caixa / Margem líquida** — trocar proxy simplificado por chamada ao motor (`indicatorsEngine`), garantindo coerência com o BEX.
11. **Custos ocultos** — reler percentuais do motor mensal (`bs_dados`): `despFin/RL`, `estoque/AC`, `giro = RL/AT`. Substituir cálculos locais.

## Ajustes de narrativa (11 seções)

| # | Seção | Ação |
|---|---|---|
| 1 | Sumário Executivo | Quando `!kanitzAplicavel`: texto explica que Kanitz distorce com PL negativo e passa a usar ISG. Cita valores absolutos de PL, AT, PT. |
| 2 | Score Kanitz | Renderiza card "**Kanitz não aplicável**" + card ISG destacado. Escala e termômetro exibidos como referência. |
| 3 | Diagnóstico de Solvência | Adiciona linha 01/2026; RPL como "N/A" quando PL < 0; LG/LS/GE corrigidos; nova linha ISG. |
| 4 | Estrutura de Liquidez | Mostra origem: `CG = AC − PC (valores)`; `NCG = (AC − Caixa) − (PC − Fornecedores) (valores)`. |
| 5 | Estrutura de Capital | Endividamento Total = `PT/AT` alinhado ao mês; se PL ≤ 0 alavancagem e KT/PL exibem "N/A — PL negativo" com explicação. |
| 6 | Análise de Passivos | Puxa PNC do motor; recalcula "Pressão", "Passivo/EBITDA" com valores corrigidos. |
| 7 | Fluxo de Caixa Estrutural | EBITDA, cobertura de juros, geração de caixa e margem líquida vindos do motor; nota se fonte é DRE ou proxy. |
| 8 | Custos Ocultos | Reescrever texto: cita % correto do mês (34,89% desp.fin/RL; 11% estoque/AC); explica fórmula do "Giro do Ativo" e "Margem Líquida" logo abaixo do card. |
| 9 | Risk Engine | **Remover** módulo completo (JSX + variáveis `riskLiquidez/riskAlavancagem/riskFluxoCaixa/riskEngineScore/Class/Color`). Renumerar 10→9 e 11→10. |
| 10→9 | Simulação Financeira | Recalcular quatro cenários usando premissas Kanitz reais aplicadas aos componentes (não multiplicação heurística). Se PL ≤ 0 os cenários usam ISG projetado. Mostrar fórmula da simulação em cada linha. |
| 11→10 | Parecer Técnico | Reescrever cinco parágrafos com o novo contexto (PL negativo, ISG, causas, probabilidade, recomendações). Remover menções ao Risk Engine. |

## Arquivos afetados

- `src/pages/Audit.tsx` — bloco `TabRelatorioKanitz` (linhas ~3600-4500). Alterações localizadas: cálculos (~3625-3760), remoção do módulo 9 (~4218-4268), renumeração dos módulos 10 e 11, reescrita textual das seções 1, 2, 4, 5, 6, 7, 8, 10 (novo), 11 (novo).
- Nenhum outro arquivo alterado (motor `indicatorsEngine.ts` e `kanitzCalculator.ts` já preservam o sinal do PL — apenas o consumo local em Audit.tsx precisa parar de aplicar `Math.abs`).

## Fora de escopo

- Alterações no Relatório BEX (não solicitado).
- Mudanças no pipeline de extração/OCR.
- Alterações em Cloud/DB/edge functions.

## Validação

1. Build TypeScript sem erros.
2. Abrir preview em `/user/report/<id>` do relatório Giannini: confirmar sumário e Score exibindo "Kanitz não aplicável — PL negativo" e ISG destacado.
3. Verificar mês 01/2026 presente na tabela do Módulo 3.
4. Endividamento Total no Módulo 5 = valor do mês (5,00).
5. Percentuais no Módulo 8 batem com o BS mensal.
6. Módulo 9 (Risk Engine) removido; numeração final 1-10.