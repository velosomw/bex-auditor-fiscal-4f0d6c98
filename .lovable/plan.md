## Objetivo
Aplicar 4 ajustes referenciais na lógica de extração/interpretação do balancete, com base na divergência apurada entre o Relatório v4 e o balancete original (Giannini, ago/25 a jan/26).

---

## Diagnóstico (apurado no balancete enviado)

| Métrica | Valor atual (plataforma / v4) | Valor correto (balancete) | Causa raiz |
|---|---|---|---|
| ANC ago/25 | R$ 5.278.541,74 | R$ 2.741.435,72 (cód. **12**) | Parser soma código **12** (Ativo Não Circulante) + código **13** (Ativo Permanente) no mesmo bucket `ANC_TOTAL` (`core.ts` linha 196-199) |
| Ativo Total ago/25 | R$ 80.853.768,32 (cód. 1) | R$ 78.316.662,30 (= AC + ANC, sem Permanente) | AT herda código **1** que inclui Permanente |
| PL ago/25 | negativo | R$ 301.909.389,98 (cód. **23**) | Parser soma sinais das folhas em vez de respeitar o sintético `23` (autoritativo) |
| Receita Líquida jan/26 | tratada como YTD ou diff de mês anterior >0 | R$ 10.799.705,52 (valor do próprio mês, pois saldo inicial = 0 após encerramento) | Fórmula `C_mês − C_mês−1` não detecta encerramento contábil |

---

## Mudanças

### 1. ANC stricto = código 12 (separar Permanente)
**Arquivo:** `supabase/functions/audit-bs-dados/core.ts`
- Remover roteamento `/^13/ → ANC_TOTAL` (linha 199). Código **13** (Ativo Permanente) passa a rotear para um novo bucket `ativo_permanente` (já temos `imobilizado` e `intangivel` separados via 131/132 — reforçar que 13x genérico cai em `ativo_permanente` e **não soma em ANC**).
- Atualizar `BSDadosRow` no `core.ts` para incluir `ativo_permanente: number` (espelho do total cód. 13).
- Ajustar `finalize()` para que `ativo_nao_circulante` NÃO some `imobilizado + intangivel + investimentos + realizavel_lp` quando há GT ANC autoritativo (cód. 12). Manter o somatório de subgrupos apenas como fallback quando NÃO há totalizador.

### 2. Ativo Total = AC + ANC (sem Permanente)
**Arquivos:** `supabase/functions/audit-bs-dados/core.ts`, `src/services/bsDadosBuilder.ts`, `src/services/indicatorsEngine.ts` (onde calcular AT)
- Computar `ativo_total = ativo_circulante + ativo_nao_circulante` (excluir `ativo_permanente`).
- Manter `ativo_permanente` exposto separadamente para uso no Kanitz/BEX (que dependem do Imobilizado).

### 3. Patrimônio Líquido respeitando sintético
**Arquivo:** `supabase/functions/audit-bs-dados/core.ts` (`finalize`, switch `patrimonio_liquido`)
- Quando `sawPLTotal && gtPL > 0` → usar `gtPL` como PL (já existe parcialmente). Reforçar que o valor é tomado do sintético **23** em **módulo** (pois balancete apresenta PL crédito como positivo no sintético).
- Quando não há sintético, somar folhas mas inverter sinal contábil (crédito → positivo).

### 4. Receita Líquida mensal com detecção de encerramento
**Novo helper:** `src/services/variationMoM.ts` já existe — estender com regra de encerramento.
**Lógica:**
```
movimentoMes(conta, mês) {
  prev = saldoFinal(conta, mês−1);
  curr = saldoFinal(conta, mês);
  if (grupo ∈ {3,4} && |prev| < ε) return curr;   // saldo inicial zerado = encerramento
  return curr − prev;
}
```
- Aplicar em `bsDadosBuilder` para todas as contas dos grupos **3 (Receitas)** e **4 (Custos/Despesas)** ao montar `receita_liquida`, `cmv`, `despesas` mês a mês.
- Persistir flag `closed_period: true` nos `validation_diagnostics` quando regra ativada.

---

## Detalhes técnicos
- Versão do parser: bumpar `PARSER_VERSION` para `2026.05.28.14` (vigente: `2026.05.27.13`).
- Adicionar testes em `supabase/functions/audit-bs-dados/finalize_test.ts` cobrindo: (a) plano com cód. 12 + 13 separados; (b) PL sintético positivo; (c) jan/26 com saldo inicial zerado.
- Atualizar `docs/BS_DADOS_ESPECIFICACAO.md` §2.2 para refletir que **Ativo Permanente (Ref C1/D1)** é bucket independente e **não compõe AT** por padrão.
- Atualizar memória `mem://features/audit-mathematical-logic` com as novas regras de AT e encerramento contábil.

---

## Fora de escopo
- Re-gerar relatórios v5 / v4 anteriores (faremos só após confirmação dos novos parsers).
- Mudar Kanitz/BEX, que continuam usando `ativo_permanente` separadamente.
