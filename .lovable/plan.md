## Diagnóstico confirmado

Validei contra os dois documentos:

**1. Fase2 — aba ÍNDICES** define as fórmulas oficiais BEX. Elas já estão corretas em `src/services/indicatorsEngine.ts`. Nada a mexer nas fórmulas.

**2. Balancete Giannini (08/2025–01/2026)** revela o problema real: o plano de contas usa códigos **estruturais por grupo** (não específicos por conta). Os grupos de 2 dígitos são autoritativos e o balancete já traz os subtotais:

| Cód | Grupo | Ago/2025 |
|---|---|---|
| 11 | Ativo Circulante | 75.575.226,58 |
| 12 | Ativo Não Circulante | 2.741.435,72 |
| 13 | Ativo Permanente | 2.537.106,02 |
| 21 | Passivo Circulante | −68.372.775,30 |
| 22 | Não Circulante LP | −338.639.419,32 |
| 23 | Patrimônio Líquido | 301.909.389,98 |
| 31+32+33 | Receita Líquida | (resultado das 3 linhas) |
| 4 | Custo das Vendas/Serviços (CMV) | 33.092.841,63 |
| 5 | Custo Industrial | — |
| 6 | Despesas Operacionais | 19.068.652,21 |
| 7 | Despesas/Receitas Financeiras | 27.010.961,60 |
| 8 | Despesas/Receitas Não Operacionais | 11.396,64 |

**Liquidez Corrente real Ago/2025** = 75.575.226,58 / 68.372.775,30 = **1,1053**
**O pipeline atual mostra 0,9** porque:
- `REF_BY_PREFIX` mapeia código 211 → "Empréstimos" (no Giannini 211 = Fornecedores e 215 = Instituições Financeiras)
- Soma folhas em vez de usar o subtotal declarado do grupo → dupla contagem e classificação errada
- Trata receita/CMV pelo sinal sem considerar que receita (grupo 3) pode vir negativa por convenção credora

## O que vou mudar

### 1. `src/services/bsDadosBuilder.ts` — novo classificador "Grupo-First"

Substituir a lógica atual por um pipeline em 3 camadas, **nessa ordem**:

**Camada A (autoritativa) — Subtotais declarados por grupo**

Quando a linha tem código de 1–2 dígitos E nome canônico de grupo, usa o **valor declarado** e marca as folhas internas como "já consumidas" (não soma novamente):

```text
Cód  Grupo                              → Campo SSOT
1X   Ativo Circulante (11)              → ativo_circulante = |valor|
1X   Ativo Não Circulante (12+13)       → ativo_nao_circulante = |valor|
2X   Passivo Circulante (21)            → passivo_circulante = |valor|
2X   Passivo Não Circulante (22)        → passivo_nao_circulante = |valor|
2X   Patrimônio Líquido (23)            → patrimonio_liquido = |valor|
3X   Receita Bruta (31)                 → soma p/ receita
3X   Devoluções (32) + Impostos (33)    → subtrai p/ receita_liquida
4X   Custo Vendas/Serviços (CMV)        → cmv = -|valor|
5X   Custo Industrial                   → cmv += -|valor|  (entra no CMV)
6X   Despesas Operacionais              → despesas = -|valor|
7X   Despesas/Receitas Financeiras      → despesas_financeiras (separa do op.)
8X   Não Operacionais                   → outras_nao_operacionais (separado)
```

**Camada B (sub-classificação) — 3 dígitos para drill-down**

Para alimentar gráfico de endividamento e EBITDA:
```text
111      → disponivel (Caixa/Bancos/Aplicações curto)
112      → contas_receber
113      → estoques
115      → tributos_a_recuperar
131      → imobilizado
211      → fornecedores
213      → divida_trabalhista
214      → divida_tributaria
215, 221 → divida_financeira (Inst. Financeiras + Empréstimos LP)
21*+name~/RJ|Recuperação/ → credores_rj
711      → componente despFin (já agregado por 7 na Camada A)
```

**Camada C (fallback regex)** — só quando NÃO há subtotal declarado para o grupo. Usa nome canônico (Fornecedores, Empréstimos, Instituições Financeiras, Salários, Tributos, etc.).

### 2. `src/services/auditAIService.ts`

Substituir `REF_BY_PREFIX` hardcoded por chamada à nova função `classifyByGroup(conta, descricao)` exportada do `bsDadosBuilder`. Ref1 passa a ser derivado do grupo de 2 dígitos + sub-componente.

### 3. `supabase/functions/audit-bs-dados/index.ts`

Replicar o classificador Grupo-First no servidor (mesma lógica, em TS Deno). Hoje a edge function tem fallback IA — quando o grupo de 2 dígitos está declarado, **não chama IA**, usa o subtotal direto. Reduz custo e elimina ruído.

### 4. `src/services/indicatorsEngine.ts`

Sem mudanças nas fórmulas. Adicionar apenas:
- Inclusão de **Custo Industrial (grupo 5)** dentro do CMV para PMP/IME
- Separação de **Despesas Financeiras (grupo 7)** vs **Despesas Operacionais (grupo 6)** para Margem Operacional e Cobertura de Juros corretas

### 5. `src/components/audit/SanityDiagnostico.tsx`

Painel de transparência ganha uma seção **"Mapeamento por Grupo"** mostrando para cada mês:
- Grupo (11/21/22/23/3/4/5/6/7/8) → valor declarado vs valor calculado a partir das folhas
- Alerta visual quando divergência >5% (sinaliza folhas órfãs ou plano não-padrão)

## Critério de aceite

Com o balancete Giannini Ago/2025 carregado:
- AC = 75.575.226,58 ✓
- PC = 68.372.775,30 ✓
- Disponível (111) = 492.194,16 ✓
- Clientes (112) = 20.604.366,18 ✓
- Estoque (113) = 46.786.497,61 ✓
- **Liquidez Corrente = 1,11** (não mais 0,9)
- **Liquidez Seca** = (75.575.226,58 − 46.786.497,61) / 68.372.775,30 = **0,42**
- **Liquidez Imediata** = 492.194,16 / 68.372.775,30 = **0,007**
- **Liquidez Geral** = (75.575.226,58 + 2.741.435,72 + 2.537.106,02) / (68.372.775,30 + 338.639.419,32) ≈ **0,20**
- Ativo Total ≈ Passivo Total + PL (com tolerância ±1%)
- Endividamento, Atividade (PMR/PMP/IME × 360), Margens, ROE, EBITDA recalculados a partir da nova base

## Risco

Mudança afeta TODAS as métricas exibidas. Por isso o painel "Mapeamento por Grupo" entra junto — você consegue auditar visualmente em qualquer balancete novo se o classificador acertou.

**Sem backfill** das auditorias antigas (como você definiu antes). Quando abrir a auditoria Giannini de novo, a edge function reprocessa e grava os números corretos.

## Próximo passo

Aprove para eu executar as 5 mudanças em uma única rodada. Em seguida você reabre a auditoria Giannini e validamos os números acima ao vivo.
