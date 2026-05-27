# Plano — Correção dos Desvios Contábeis (Giannini + multi-layout)

Aplicar as 8 recomendações do `Analise_Tecnica_Desvios_Contabeis_Giannini.md` em ondas, do bloqueante ao estrutural. Cada onda é independente e deixa o sistema em estado consistente.

---

## Onda 1 — SSOT efetivo (resolve LG 0,1985 vs 0,5594 e EBITDA duplo)

**Problema:** UI/relatório recalculam indicadores a partir do parser ou de payload intermediário, gerando dois valores para o mesmo KPI.

**Ações:**
1. `src/services/indicatorsEngine.ts` passa a ser o **único** ponto de cálculo. Receber **somente** `BSDadosRow[]` vindo de `bs_dados` (banco) ou do retorno de `audit-bs-dados`.
2. Auditar e remover recálculos em:
   - `src/components/audit/TabGraficosAuditoria.tsx`
   - `src/components/audit/TabGraficosParecer.tsx`
   - `src/components/audit/TabKanitz.tsx`
   - Geração do Relatório Técnico (resumo executivo + memória de cálculo devem chamar a mesma função).
3. Adicionar teste de equivalência: `resumo.LG === memoria.LG` e `resumo.EBITDA === memoria.EBITDA` (snapshot por audit_id).

---

## Onda 2 — Subgrupos do ANC (resolve LG com proxy errado)

**Problema:** ANC total é usado como Realizável LP. Distorce LG, Solvência, Kanitz, ISG.

**Ações:**
1. **Migration** em `bs_dados`:
   ```
   realizavel_longo_prazo  numeric default 0
   investimentos           numeric default 0
   imobilizado_liquido     numeric default 0  -- já existe parcialmente em `imobilizado`
   intangivel              numeric default 0
   ```
2. `supabase/functions/audit-bs-dados/core.ts`: classificar ANC nos 4 subgrupos por **código + hierarquia + termos canônicos**. Atualizar `grupoResultadoDictionary.ts` com padrões textuais (Imobilizado / Intangível / Investimentos / RLP).
3. `indicatorsEngine.ts`: `LG = (AC + RLP) / (PC + PNC)`. Nunca ANC total.
4. Fallback contábil: se nenhum dos 4 for detectável, `RLP = ANC − (Imob + Intang + Invest)` com flag `rlp_inferido = true`.

---

## Onda 3 — Anti-dupla-contagem (resolve PL inflado e variantes)

**Problema:** subtotalizador declarado + filhas somando juntos no mesmo bucket.

**Ações:**
1. Em `audit-bs-dados/core.ts`, durante a varredura:
   - Marcar `subtotal_declarado=true` no grupo assim que um GT (Grupo Total) for encontrado.
   - **Descartar** todas as descendentes daquele subtotal nos buckets de agregação (mantê-las apenas como `trilha` para drill-down).
2. Reforçar `pruneParents` com regra estrutural: se `saldo(pai) ≈ Σ saldo(filhas)` (±0,5%), pai é sintético — usar pai e ignorar filhas.
3. Telemetria: log `dupla_contagem_evitada: { grupo, ref, valor_descartado }`.

---

## Onda 4 — Política de sinais centralizada

**Problema:** `abs()` aplicado em linhas individuais destrói contas redutoras.

**Ações:**
1. Criar `supabase/functions/audit-bs-dados/sinais.ts` exportando `aplicarSinalFinal(grupo, valor)`.
2. Regra: preservar sinal nativo em todas as linhas → consolidar grupo → aplicar `aplicarSinalFinal` **apenas** em `passivo (módulo)`, `receita (módulo)`, `despesas_financeiras (módulo)`, `cmv (módulo)`.
3. Remover todos os `Math.abs` de linha individual em `core.ts` e `bsDadosBuilder.ts`.

---

## Onda 5 — Classificador híbrido (50/25/15/10)

**Problema:** classificação depende excessivamente do nome.

**Ações:**
1. Novo módulo `supabase/functions/audit-bs-dados/classifier.ts` com `classify(linha)` retornando `{ grupo, score, breakdown }`.
   - 50% código (prefixo + nível)
   - 25% hierarquia (parent)
   - 15% nome (regex canônica em `grupoResultadoDictionary.ts`)
   - 10% similaridade IA (`audit_account_cache` + `contabil_dictionary.embedding`)
2. IA **sugere**, regra determinística **decide**. Persistir `score_confianca` em `metadata.trilha`.

---

## Onda 6 — Validador contábil bloqueante

**Problema:** relatórios sendo emitidos com `AT ≠ P + PL` sem trava efetiva.

**Ações:**
1. Em `core.ts`/`finalize`, após consolidação:
   - Tolerância: 0,5% verde, 0,5–2% amarelo (warn), >2% vermelho (bloqueia).
   - Em vermelho: `status='needs_review'` + não persiste indicadores; retorna diagnóstico.
2. UI: badge na `Audit` mostrando semáforo + lista das causas (top 5 contribuintes do desvio).
3. Reconciliação subtotal × filhas (mesma escala de semáforo) exibida em `MapeamentoPorGrupo.tsx`.

---

## Onda 7 — PL: prioridade ao oficial, rebalanço como exceção

**Ações:**
1. Em `core.ts`: se `sawPLTotal` → usa GT direto, **sem soma de filhas**.
2. Se ausente → `pl = ativo − passivo` + `flag_reconstrucao=true` + log crítico.
3. Manter `patrimonio_liquido_bruto` (já existe) para auditoria do original.

---

## Onda 8 — Score de confiança por grupo + bloqueios

**Ações:**
1. `audit-bs-dados` retorna `confidence_by_group: { AC, ANC, PC, PNC, PL }`.
2. UI exibe na aba BS & Dados.
3. Bloqueio automático de emissão de relatório se: dupla contagem detectada, divergência AT≠P+PL acima da tolerância, múltiplos subtotalizadores conflitantes, ou PL reconstruído sem confirmação.

---

## Detalhes técnicos

**Arquivos principais a tocar:**
- `supabase/functions/audit-bs-dados/core.ts` (Ondas 2,3,4,5,6,7,8)
- `supabase/functions/audit-bs-dados/index.ts` (resposta + flags)
- `supabase/functions/audit-bs-dados/classifier.ts` (novo — Onda 5)
- `supabase/functions/audit-bs-dados/sinais.ts` (novo — Onda 4)
- `supabase/functions/audit-pipeline-process/index.ts` (bump `PARSER_VERSION`)
- `src/services/grupoResultadoDictionary.ts` (Ondas 2,5)
- `src/services/indicatorsEngine.ts` (Ondas 1,2)
- `src/services/bsDadosBuilder.ts` (Ondas 1,4)
- `src/components/audit/TabGraficos*.tsx`, `TabKanitz.tsx`, `TabBSDados.tsx`, `MapeamentoPorGrupo.tsx` (Ondas 1,6,8)

**Migration única (Onda 2 + 8):**
```sql
ALTER TABLE public.bs_dados
  ADD COLUMN IF NOT EXISTS realizavel_longo_prazo numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS investimentos numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS intangivel numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS confidence_by_group jsonb,
  ADD COLUMN IF NOT EXISTS validation_status text NOT NULL DEFAULT 'ok'; -- ok|warn|needs_review
```

**Cache invalidation:** `PARSER_VERSION` → `2026.05.27.10` força reprocesso automático.

**Backward compatibility:** novas colunas têm default → audits antigos continuam consultáveis; o reprocesso preenche os subgrupos do ANC quando o usuário rodar nova auditoria.

---

## Sequência sugerida de execução

1. **Onda 1 (SSOT)** + **Onda 6 (validador bloqueante)** — efeito imediato, evita publicar relatórios divergentes.
2. **Onda 3 (anti-dupla)** + **Onda 7 (PL oficial)** — corrige o PL inflado de Giannini.
3. **Onda 2 (subgrupos ANC)** — corrige LG/Kanitz/ISG.
4. **Onda 4 (sinais)** + **Onda 5 (classificador híbrido)** — robustez multi-layout.
5. **Onda 8 (confiança + bloqueios)** — fecha o ciclo de governança.

Posso executar tudo em sequência num único loop, ou por ondas com sua validação entre cada uma. Recomendo **ondas 1+6+3+7 juntas** (alto impacto, baixo risco de regressão) e depois decidir sobre as demais.
