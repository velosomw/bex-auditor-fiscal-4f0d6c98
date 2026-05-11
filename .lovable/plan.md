# Pipeline Balancete Multi-Mês — Implementação V2

## Objetivo
Adequar o projeto ao MD anexado: suportar **balancete com múltiplos meses em 1 arquivo** ou **múltiplos arquivos**, consolidando tudo via Single Source of Truth (SSOT) `balancete_consolidado`, derivando BS, DRE e os 6 gráficos de auditoria pixel-perfect Excel BEX.

## Diagnóstico do estado atual

Já existe no projeto:
- `balancete_consolidado` (SSOT) com `ref_capital`, `saldo_atual`, `mes_referencia`
- `balancetes`, `balancete_lines`, `bs_dados`, `indicadores`, `kanitz_scores`
- `bsDadosBuilder.ts`, `auditChartsOptions.ts`, `bsDadosToMonthlyDatum.ts`, `auditMonthDetector.ts`
- Edge `audit-bs-dados`, `audit-pipeline-process`, `audit-analyze`
- `AuditCharts`, `TabBSDados`

Faltam (vs MD):
1. **Multi-mês em 1 arquivo** — hoje cada arquivo recebe 1 mês via `userMonthOverride`. Quando o XLSX tem N colunas mensais (cenário B do MD), cada coluna deveria virar um período distinto.
2. **Adapter `consolidadoToParsed`** lendo direto do `balancete_consolidado` por `codigo > conta` e `saldo > valor`.
3. **Hook `useConsolidadoBS`** que alimenta TabBSDados + AuditCharts a partir do SSOT (hoje vem de `parsedData` em memória).
4. **DRE derivada por prefixo** (4xx/5xx) — hoje só temos balanço.
5. **Mapa REF1 ampliado** — 47 chaves BEx no `bsDadosBuilder` (atualmente parcial).
6. **Reconciliação A=P+PL** com tolerância 0,5% UI exibida.
7. **Janela 3M/6M/12M client-side** preservando SSOT.
8. **Insights automáticos** (CMV>70%, queda receita MoM>10%, liquidez<1).

## Escopo desta entrega (4 fases)

### Fase 1 — Parser multi-mês (1 arquivo, N colunas)
- Atualizar `audit-pipeline-process` para detectar **colunas mensais** em XLSX BEX (`JAN/24`, `01/2024`, `Saldo Atual MM/AAAA`) e emitir 1 entrada `balancete_data` por (conta × coluna-mês).
- `auditMonthDetector` ganha `extractColumnMonths(headers)` para retornar lista ordenada de chaves YYYY-MM presentes no XLSX.
- Quando o usuário NÃO informar `userMonthOverride` e existir >1 coluna mensal detectada, manter todas (cenário B do MD).

### Fase 2 — SSOT consolidado lendo `balancete_consolidado`
- Novo `src/services/bsDados/consolidadoAdapter.ts`: `consolidadoToParsed(rows)` agrupando por **`codigo > conta`**, sinal `saldo > valor`, retorna `ParsedFinancialData` + `BalanceteEntry[]` derivado de `mes_referencia`.
- Novo `src/hooks/useConsolidadoBS.ts`: SELECT de `balancete_consolidado` por `audit_id` ou `company_id`, retorna `{ parsed, entries, loading }`.
- Atualizar `AuditCharts` e `TabBSDados` para opcionalmente consumir do hook (fallback para props atual).

### Fase 3 — DRE derivada + REF1 completo
- Ampliar `REF1_MAP` em `bsDadosBuilder` para as 47 chaves do MD (A..O, P..J1, AA..II1, PP..FF1, GG1, HH1, Resultado).
- Adicionar classificação **DRE por prefixo de código** (`41 receita_bruta`, `42 deducoes`, `51 cmv`, `52/53 despesas`, `54 depreciacao`, `55 amortizacao`, `56 financeiro`, `57 impostos`) com fallback regex.
- Persistir `dre_consolidada` (campos do MD) em `bs_dados` (já temos `cmv`, `despesas`, `receita_liquida`, `resultado` — adequado).

### Fase 4 — UX: equilíbrio, janela e insights
- Badge **A = P + PL** em `TabBSDados` (verde se ≤0,5%, vermelho caso contrário).
- Selector **3M / 6M / 12M** client-side em `AuditCharts` e `TabBSDados`.
- `InsightsCard` reutilizando `generateInsights()` (hoje já no AuditCharts; extrair card).

## Arquivos a criar/editar

```text
NOVOS
  src/services/bsDados/consolidadoAdapter.ts
  src/hooks/useConsolidadoBS.ts
  src/components/audit/WindowSelector.tsx
  src/components/audit/EquilibrioBadge.tsx

EDITADOS
  supabase/functions/audit-pipeline-process/index.ts   (multi-coluna mensal)
  src/services/auditMonthDetector.ts                   (extractColumnMonths)
  src/services/bsDadosBuilder.ts                       (REF1 47 chaves + DRE prefix)
  src/components/audit/AuditCharts.tsx                 (window selector + hook opcional)
  src/components/audit/TabBSDados.tsx                  (badge equilíbrio + janela)
```

## Fora de escopo (não criar agora)
- Tabelas novas `chart_of_accounts`, `lancamentos`, `balancete_runs`, `balancete_validacoes`, `balancete_bs`, `balancete_dre` — o projeto já usa um schema diferente (`balancete_consolidado` + `bs_dados` + `indicadores`) que cobre o mesmo papel. Migrar para o schema do MD seria refatoração maior; **proponho manter o schema atual** e adicionar apenas o que falta (DRE pode ir em `bs_dados` já que ele tem campos DRE).
- Seed completo de COA (XPT_BR_PADRAO_V1) — manter mapeamento via `account_mapping` e dicionário existente.

## Validação
Após implementar, testar com:
1. 1 XLSX com 6 meses → deve gerar 6 linhas em BS & Dados e 6 pontos nos gráficos.
2. 3 PDFs de meses distintos → deve consolidar 3 linhas.
3. Verificar `Ativo = Passivo + PL` (tolerância 0,5%) com badge.

Confirma que sigo com este escopo (Fases 1–4 sem migrar o schema para `lancamentos`/`chart_of_accounts`)?
