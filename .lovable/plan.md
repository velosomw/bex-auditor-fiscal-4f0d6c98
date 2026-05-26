
## Diagnóstico das causas-raiz (não suposições)

Análise do código + logs confirmou **3 bugs estruturais** que precisam de fix definitivo, não bypass.

### Causa #1 — Dedup cega bloqueia evolução do parser
`supabase/functions/audit-pipeline-process/index.ts:81-91` calcula `content_hash = SHA-256(company + período + linhas)`. Não inclui versão da lógica de parsing. Resultado: qualquer ajuste em `audit-bs-dados` é **silenciosamente ignorado** para arquivos já processados. Foi exatamente o que aconteceu — `document.dedup_hit: true` matou a re-execução.

### Causa #2 — Dupla contagem do PL (motivo real do `A − (P+PL) = −550M`)
`supabase/functions/audit-bs-dados/index.ts:704-711`:
```ts
for (const [mesKey, row] of rowsByMes) {
  const b = bucketsByMes.get(mesKey)!;
  ...
  row.ativo_nao_circulante   = b.anc;   // OVERWRITE incondicional
  row.passivo_nao_circulante = b.pnc;   // OVERWRITE incondicional
  row.patrimonio_liquido     = b.pl;    // OVERWRITE incondicional
}
```
Os buckets `b.anc/pnc/pl` foram acumulados em `applyValue` (linhas 423-427) somando **todas as linhas** cujo ref pertence ao conjunto — incluindo totalizadores (ex.: `AA1`, `BB1` em `PNC_REFS`; `GG1`, `HH1` em `PL_REFS`). Quando o `pruneParents` deixa passar uma linha sintética (totalizador 2.3 "PATRIMÔNIO LÍQUIDO" + filhas 2.3.1, 2.3.2, 2.3.3), o PL é contado 2× ou 3×. No caso Giannini: `PL = 301M` com `Ativo = 181M` — fisicamente impossível, prova matemática de duplicidade.

Depois `finalize` (linha 437) **ainda sobrescreve** com `gtPL` se houver `sawPLTotal`, criando um terceiro caminho conflitante.

### Causa #3 — Ausência de diagnóstico granular do PL
Logs atuais só mostram `EQ_BREAK desvio=X%`, sem identificar quais contas/refs contribuíram para o PL inflado. Sem isso, cada arquivo novo com problema vira detective work manual.

---

## Plano de refatoração (5 fixes encadeados)

### Fix 1 — Versionar parser e invalidar cache automaticamente
**Arquivo**: `supabase/functions/audit-pipeline-process/index.ts`

```ts
const PARSER_VERSION = "2026.05.27.01"; // bump a cada mudança em audit-bs-dados

function buildContentHashSource(body: PipelineRequest): string {
  return [
    PARSER_VERSION,                  // ← NOVO: invalida cache em qualquer evolução
    body.company_id || "",
    body.documentInfo?.periodo || "",
    norm(body.balanco),
    "::dre::",
    norm(body.dre),
  ].join("\n");
}
```

Também aceitar `body.force_reprocess: boolean` que ignora dedup mesmo se hash bater. Persistir `parser_version` em `pipeline_documents` para rastreabilidade.

### Fix 2 — Eliminar dupla contagem (refatorar prioridade GT > soma de folhas)
**Arquivo**: `supabase/functions/audit-bs-dados/index.ts`

Substituir o bloco 704-711 por hierarquia explícita **GT → row (folhas via REF1_MAP) → bucket-by-prefix**, nessa ordem de prioridade, sem fallback acumulativo:

```ts
for (const [mesKey, row] of rowsByMes) {
  const b = bucketsByMes.get(mesKey)!;
  // ANC: prefere GT, depois row (já acumulado em applyValue), depois bucket
  if (!b.sawANCTotal && row.ativo_nao_circulante === 0) row.ativo_nao_circulante = b.anc;
  if (!b.sawPNCTotal && row.passivo_nao_circulante === 0) row.passivo_nao_circulante = b.pnc;
  if (!b.sawPLTotal && row.patrimonio_liquido === 0) row.patrimonio_liquido = b.pl;
}
```

E **remover o segundo branch** em `applyValue` (linhas 423-427) que duplica em `b.pnc/b.pl` quando o switch já populou a row — substituir por contador de telemetria apenas.

`finalize` mantém preferência por GT (já correta nas linhas 432-438), agora sem conflito.

### Fix 3 — Hardening do pruneParents para totalizadores do PL
**Arquivo**: `supabase/functions/audit-bs-dados/index.ts:497-560` (SYNTHETIC_DESC_PATTERNS)

Adicionar padrões específicos que estavam escapando:
```ts
/^patrim[oô]nio\s+l[ií]quido\s*(?:\(.*\))?$/i,   // "PATRIMÔNIO LÍQUIDO" puro
/^2\.?3\s/,                                       // código 2.3 ou "2.3 ..."
/^total\s+(do\s+)?(patrim|pl|passivo|ativo)/i,
/^lucros?\s+(acumulados?|.*exerc[ií]cios?)\s+anteriores?$/i, // se for totalizador acumulado
```

E adicionar regra estrutural: se uma linha com código `X.Y` (2 níveis) tem `saldo === soma(filhas X.Y.Z)`, marca como pai sintético independente da descrição.

### Fix 4 — Auto-rebalanço com diagnóstico antes de persistir
**Arquivo**: `supabase/functions/audit-bs-dados/index.ts:430-489` (`finalize`)

Se após GT/folha o desvio `|A − (P+PL)| > 1%`:
1. Log estruturado com **composição do PL**: top 5 (ref, descrição, valor).
2. Se `PL > Ativo_Total`, sinal claro de duplicidade — aplicar **fallback contábil**: `PL_derivado = Ativo − Passivo` e marcar `errors: "PL recalculado por equação contábil — original X, derivado Y"`. Preserva original em `patrimonio_liquido_bruto` (nova coluna).
3. Se `PL ≤ Ativo` mas equação ainda quebra, log de diferença e **bloqueia persistência** sinalizando `status: 'needs_review'` em vez de gravar dados inconsistentes.

### Fix 5 — UI: botão "Reprocessar (forçar)" + indicação de versão
**Arquivos**: `src/pages/Audit.tsx` (ou onde está Fase 2 / Reabrir) e o serviço client que chama `audit-pipeline-process`.

- Botão secundário "Forçar reprocessamento" que envia `force_reprocess: true`.
- Exibir badge `parser_version` no documento processado para auditoria.

---

## Banco — migration mínima

```sql
ALTER TABLE public.pipeline_documents
  ADD COLUMN IF NOT EXISTS parser_version text;

ALTER TABLE public.bs_dados
  ADD COLUMN IF NOT EXISTS patrimonio_liquido_bruto numeric;
```

---

## Aprendizado para casos futuros (escalabilidade)

Esses 3 fixes criam um **contrato testável**:
- Cada mudança no parser ⇒ bump `PARSER_VERSION` ⇒ reprocessamento automático (sem ação manual do operador).
- Validação `A = P + PL` é **bloqueante** (não só warning), evitando que dados inconsistentes virem report.
- Log estruturado de composição do PL permite que casos novos sejam diagnosticados em segundos, não horas.
- A coluna `patrimonio_liquido_bruto` guarda o valor original quando há rebalanço — base de dados para treinar/calibrar regex de `pruneParents` em planos contábeis menos comuns.

---

## Sequência de execução

1. Migration (colunas novas).
2. Edge function `audit-bs-dados`: aplicar Fix 2 + 3 + 4 e bumpar nada (essa não tem version).
3. Edge function `audit-pipeline-process`: aplicar Fix 1 (`PARSER_VERSION = "2026.05.27.01"` + `force_reprocess`).
4. Deploy automático das 2 functions.
5. UI: Fix 5 (botão + badge).
6. Usuário clica "Forçar reprocessamento" em Giannini e XPT → validação da equação contábil em ambas.

Após sua aprovação, executo na ordem acima.
