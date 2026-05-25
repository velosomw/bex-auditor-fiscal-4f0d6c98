## Objetivo

Chegar em **Liquidez Corrente Ago/2025 = 1,11** (= 75.575.226,58 / 68.372.775,30) com **auditoria explicável**: para cada número exibido, conseguimos mostrar (a) **origem** (quais linhas do balancete entraram), (b) **composição** (folhas vs subtotal de grupo), (c) **trilha da fórmula** (numerador, denominador, faixa, classificação).

## Por que hoje dá ~0,9 (e não 1,11)

Causas-raiz, em ordem de impacto:

1. **Dupla contagem AC/PC** — `bsDadosBuilder` soma tanto a linha sintética do grupo (cód 11, 21) quanto as analíticas filhas (111, 112, 211...). Já mitigado parcialmente pela lógica Grupo-First, mas falta **registrar e expor** quais folhas foram "consumidas".
2. **Sinal do Passivo** — Giannini traz PC com saldo credor negativo. Algumas linhas escapam do `abs()` quando o ref1 é resolvido por regex em vez do código de grupo.
3. **Mapeamento por nome de conta no Giannini** — código 211 = Fornecedores (não Empréstimos como no padrão BEX). O `REF1_MAP` por letras (AA/BB/CC) não se aplica; o roteador por código de grupo é quem decide.
4. **Falta de trilha** — nenhuma UI mostra qual camada (A=total declarado, B=drill-down 3 dígitos, C=regex) classificou cada linha. Sem isso, divergências passam invisíveis.

## Estratégia: Auditoria Explicável em 3 camadas

### Camada 1 — Classificador determinístico (Grupo-First com trilha)

Em `bsDadosBuilder.ts` e na edge function `audit-bs-dados`:

```text
Para cada linha do balancete:
  ├── Camada A: código tem 1-2 dígitos E é GROUP_TOTAL_CODE?
  │     → usa valor declarado (com abs() se grupo 2X)
  │     → marca todas as filhas como "consumidas-por-pai"
  │     → registra trilha: { camada: "A", origem: "subtotal declarado grupo XX" }
  │
  ├── Camada B: código tem 3+ dígitos E pai (2 dígitos) está presente?
  │     → NÃO soma no agregado (pai já contou)
  │     → alimenta apenas drill-down (disponivel, estoques, fornecedores...)
  │     → registra trilha: { camada: "B", origem: "drill-down de grupo XX" }
  │
  └── Camada C: nenhum totalizador de grupo encontrado
        → fallback regex por nome canônico (Fornecedores, Empréstimos...)
        → soma no agregado
        → registra trilha: { camada: "C", origem: "regex sobre descrição" }
```

**Regras de sinal (não mudam, mas ficam explícitas na trilha):**
- Ativo: preserva sinal nativo (redutoras negativas reduzem o agregado)
- Passivo + PL: `abs()` aplicado no **agregado final do grupo**, nunca por linha (evita inflar quando há contas redutoras de passivo)
- Receita (grupo 3): `abs()` no agregado
- CMV/Despesas (4,5,6): `-abs()`
- Resultado: preserva sinal nativo

### Camada 2 — Validação trifásica com semáforo

Substitui tolerância fixa de 1%. Para cada grupo de 2 dígitos:

| Faixa | Cor | Ação |
|---|---|---|
| desvio ≤ 1% | verde | OK — soma das folhas ≈ subtotal declarado |
| 1% < desvio ≤ 3% | amarelo | Alerta — divergência de arredondamento ou conta órfã |
| desvio > 3% | vermelho | Erro de extração — bloqueia geração de indicadores até revisão |

Equação contábil (Ativo = Passivo + PL) usa as mesmas 3 faixas.

### Camada 3 — Trilha visível na UI

Novo painel **"Mapeamento por Grupo"** em `SanityDiagnostico.tsx`, expandindo o diagnóstico atual:

```text
┌─ Ago/2025 ────────────────────────────────────────────────┐
│ Grupo 11 Ativo Circulante                                 │
│   Declarado (linha 11):     R$ 75.575.226,58              │
│   Soma das folhas (111+112+113+...): R$ 75.575.226,58     │
│   Divergência: 0,00% ✅                                    │
│   Camada usada: A (subtotal autoritativo)                  │
│   Drill-down ativo: 111→Disponível, 112→Clientes, 113→... │
│                                                            │
│ Grupo 21 Passivo Circulante                               │
│   Declarado (linha 21): R$ 68.372.775,30 (módulo)         │
│   Soma das folhas:      R$ 68.372.775,30                  │
│   Divergência: 0,00% ✅                                    │
│   Camada: A                                                │
│                                                            │
│ Equação: AT (80,8M) ≈ PT+PL (80,8M) ✅                    │
└────────────────────────────────────────────────────────────┘
```

E em cada indicador (card Liquidez Corrente):

```text
Liquidez Corrente = 1,11
  ├── Numerador: AC = R$ 75.575.226,58
  │     └── origem: linha "11 ATIVO CIRCULANTE" (Camada A)
  ├── Denominador: PC = R$ 68.372.775,30
  │     └── origem: linha "21 PASSIVO CIRCULANTE" (Camada A, abs aplicado)
  ├── Fórmula: AC / PC
  └── Classificação: > 1,0 = Saudável
```

## O que muda em código

| Arquivo | Mudança |
|---|---|
| `src/services/bsDadosBuilder.ts` | Adicionar `trilha: ClassificationTrail[]` em `BSDadosRow`; finalizar Grupo-First com `parentGTPresent`; expor `classifyByGroup()` para uso externo |
| `src/services/auditAIService.ts` | Trocar `REF_BY_PREFIX` por `classifyByGroup()`; cada linha passa a carregar `{camada, motivo}` |
| `src/services/indicatorsEngine.ts` | Adicionar `_origem` em cada indicador (qual campo BS Dados alimentou); incluir grupo 5 no CMV; separar grupo 7 (DespFin) de grupo 6 (DespOp) |
| `supabase/functions/audit-bs-dados/index.ts` | Replicar Grupo-First server-side; gravar trilha em `bs_dados.metadata` |
| `src/components/audit/SanityDiagnostico.tsx` | Novo painel "Mapeamento por Grupo" com semáforo 1%/3%/>3% por grupo e por mês |
| `src/components/audit/TabBSDados.tsx` (ou onde indicadores são exibidos) | Tooltip "Memória de cálculo" com numerador, denominador, origem e fórmula |

## Critério de aceite (balancete Giannini Ago/2025)

| Item | Esperado |
|---|---|
| AC (grupo 11) | 75.575.226,58 |
| PC (grupo 21) | 68.372.775,30 |
| Disponível (111) | 492.194,16 |
| Clientes (112) | 20.604.366,18 |
| Estoque (113) | 46.786.497,61 |
| **Liquidez Corrente** | **1,11** |
| Liquidez Seca | 0,42 |
| Liquidez Imediata | 0,007 |
| Liquidez Geral | ~0,20 |
| Equação AT ≈ PT+PL | desvio < 1% |
| Trilha visível para cada indicador | sim (camada A/B/C + origem) |

## Risco e mitigação

- **Risco:** mudança de classificador altera TODOS os indicadores. **Mitigação:** painel "Mapeamento por Grupo" entra na mesma release — qualquer divergência fica visível antes de virar relatório.
- **Sem backfill** das auditorias antigas. Reabrir a auditoria Giannini reprocessa via edge function.

## Execução (1 rodada)

1. `bsDadosBuilder.ts` — fechar Grupo-First + trilha
2. `audit-bs-dados/index.ts` — replicar server-side + gravar trilha
3. `indicatorsEngine.ts` — adicionar `_origem` por indicador
4. `auditAIService.ts` — usar `classifyByGroup()`
5. `SanityDiagnostico.tsx` — painel "Mapeamento por Grupo" com semáforo trifásico
6. Tooltip "Memória de cálculo" nos cards de indicadores

Aprove para eu executar as 6 mudanças. Depois você reabre a auditoria Giannini e validamos os números ao vivo.
