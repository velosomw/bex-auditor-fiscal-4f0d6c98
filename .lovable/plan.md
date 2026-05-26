## Problema identificado no balancete Giannini

Analisei `Balancetes 08.2025 a 01.2026.xlsx` e confirmei os bugs:

| # | Linha | Código | Descrição | Saldo Ago/25 |
|---|---|---|---|---|
| 1 | 3 | `11` | Ativo Circulante (TOTAL) | 75.575.226,58 |
| 2 | 120 | `12` | Ativo Não Circulante (TOTAL) | 2.741.435,72 |
| 3 | 158 | `21` | Passivo Circulante (TOTAL) | -68.372.775,30 |
| 4 | 969 | `22` | Não Circulante Longo Prazo | -338.639.419,32 |
| 5 | 979 | `23` | Patrimônio Líquido (TOTAL) | +301.909.389,98 |
| 6 | n/a | `13` | **NÃO EXISTE** neste plano | — |

**Causa raiz dos erros** (encontrei no código):

1. `auditAIService.ts:449` faz `if (!isLeaf(conta)) continue;` — **descarta todas as linhas totalizadoras** na origem do parser. Só sobrevivem contas analíticas de 10 dígitos.
2. `bsDadosBuilder.ts` tenta reconstruir os totais somando as folhas via `REF1_MAP` (mapeamento por código fixo `11xxx`, `21xxx`…). Quando o plano de contas tem códigos não-padrão (ex. `22` da Giannini cobre PNC + classes que não batem o template BEX), a soma diverge do total declarado.
3. `GROUP_LABELS` lista `"13": Ativo Permanente` — esse grupo não existe na Giannini, gera ruído.
4. Receita Líquida hoje pega grupo `3` inteiro (inclui devoluções, impostos, custos), deveria ser só `31` Receita Bruta menos `32`/`33`.
5. Grupos `3–8` (DRE) são **YTD acumulado**; já existe heurística (`isAccumulated`), mas só aciona se receita for monotonicamente crescente. Para meses com receita oscilante ela falha.
6. Grupos `6` e `8` somem porque sub-classificação textual não cobre todas as variações de descrição.

---

## Estratégia — Grupos de Resultado por TERMINOLOGIA

Mudar o eixo de aprendizado de **código numérico** para **rótulo textual canônico** do plano de contas brasileiro.

### Dicionário canônico (novo arquivo `src/services/grupoResultadoDictionary.ts`)

```ts
export const GRUPOS_RESULTADO = {
  ATIVO_CIRCULANTE:     ["ativo circulante"],
  ATIVO_NAO_CIRCULANTE: ["ativo nao circulante", "ativo não circulante",
                         "realizavel a longo prazo", "ativo permanente",
                         "imobilizado", "intangivel", "investimentos"],
  PASSIVO_CIRCULANTE:   ["passivo circulante"],
  PASSIVO_NAO_CIRCULANTE:["passivo nao circulante", "passivo não circulante",
                         "exigivel a longo prazo", "nao circulante - longo prazo",
                         "não circulante longo prazo"],
  PATRIMONIO_LIQUIDO:   ["patrimonio liquido", "patrimônio líquido"],
  RECEITA_BRUTA:        ["receita bruta", "receita operacional bruta", "vendas brutas"],
  DEDUCOES_RECEITA:     ["devolucoes", "deduções da receita", "abatimentos", "impostos sobre vendas"],
  CUSTO:                ["custo das mercadorias", "custo dos produtos", "custo dos servicos",
                         "cmv", "csv", "cpv", "custo industrial"],
  DESPESAS_OPERACIONAIS:["despesas operacionais", "despesas administrativas",
                         "despesas comerciais", "despesas com pessoal", "despesas gerais"],
  DESPESAS_FINANCEIRAS: ["despesas financeiras", "receitas financeiras",
                         "resultado financeiro", "encargos financeiros"],
  NAO_OPERACIONAL:      ["nao operacional", "não operacional", "receitas nao operacionais",
                         "despesas nao operacionais", "outras receitas", "outras despesas"],
}
```

### Detecção de "Grupo de Resultado Principal" no parser

Em vez de filtrar pelo número de dígitos do código, identificar linhas onde a **descrição** bate com algum sinônimo do dicionário **E** o saldo é não-zero **E** existem contas-filhas abaixo com prefixo de código compatível. Essas linhas viram **linhas-autoridade** (saldo declarado do grupo).

Sub-grupos (ex. "Fornecedores", "Salários e Encargos Sociais", "Tributos a Recolher") são detectados pelo mesmo dicionário e usados para sub-classificar componentes de dívida — independente de prefixos numéricos.

### Mudanças concretas

**Parser** (`src/services/auditAIService.ts`)
- Remover filtro `if (!isLeaf(conta)) continue;`. Em vez disso, **marcar** cada linha: `tipo: "TOTAL_GRUPO" | "SUBTOTAL" | "ANALITICA"` usando o dicionário textual + análise de hierarquia de código (não somente comprimento).

**Builder** (`src/services/bsDadosBuilder.ts`)
- Reescrever roteamento: quando existe linha `TOTAL_GRUPO`, ela é **autoritária** (Camada A); folhas filhas alimentam apenas componentes (disponível, estoques, fornecedores, etc.), nunca o agregado pai.
- Receita Líquida = `Σ(RECEITA_BRUTA) − |Σ(DEDUCOES_RECEITA)|` (não `Σ(Grupo 3)`).
- Remover entrada `"13": Ativo Permanente` de `GROUP_LABELS` (deixar só `11/12/21/22/23` + DRE textual).
- **DRE por variação obrigatória**: para grupos `RECEITA_BRUTA`, `DEDUCOES`, `CUSTO`, `DESPESAS_*`, `NAO_OPERACIONAL`, sempre aplicar `valorMes(N) = saldo(N) − saldo(N−1)` quando há ≥2 meses do mesmo ano. Eliminar a heurística "consistentIncrease ≥ 75%" — passa a ser regra fixa.

**Indicadores** (`src/services/indicatorsEngine.ts`)
- Reconfirmar Liquidez Seca = `(AC − Estoques) / PC` e Endividamento Geral = `(PC + PNC) / AT` usando os novos agregados — os números atuais estavam errados porque AC/PC/PNC/PL vinham errados, não a fórmula.

### Telemetria de aprendizado

Adicionar log no builder: para cada Grupo de Resultado detectado, registrar `{rotulo_encontrado, codigo_observado, fonte: "dicionario_textual"|"prefixo_codigo", desvio_declarado_vs_calculado}`. Persistir em `ai_usage_logs` para alimentar futura calibração.

---

## Entregáveis

1. `src/services/grupoResultadoDictionary.ts` (novo)
2. Refatoração de `src/services/auditAIService.ts` (classificação de linhas)
3. Refatoração de `src/services/bsDadosBuilder.ts` (Grupo-First puro textual, DRE por variação, remoção `"13"`)
4. Espelhamento das mesmas regras em `supabase/functions/audit-bs-dados/index.ts` (mesma lógica server-side)
5. Mock de teste com o balancete Giannini validando: AC=75.575.226 ; PC=68.372.775 ; PNC=338.639.419 ; PL=−301.909.389 ; Receita Líquida ago/25 = `variação` correta.

---

## O que **não** muda

- Liquidez Corrente e Imediata (já corretas).
- Layout do relatório técnico A4, gráficos, persistência MD MASTER.
- Modelo Kanitz e fórmulas BEX-RJ.

---

## Decisões pendentes

1. **Reabrir auditoria Giannini automaticamente após o deploy?** (re-processar os 6 meses e gerar novo relatório). Posso disparar via `audit-bs-dados` direto ao final.
2. **Quando o plano de contas não traz linha-total (cenário raro)**, devo cair para soma das folhas (Camada B) ou marcar o grupo como `SEM_TOTAL` e bloquear o cálculo? Recomendo Camada B com flag de atenção.
3. **Validação cruzada**: anexar resultado dos 6 meses Giannini no próximo relatório técnico (formato Word) para o auditor sênior conferir antes de fechar o ciclo?
