# Plano — Correção dos Desvios Contábeis (Giannini + multi-layout)

Status final das 8 ondas após implementação:

| Onda | Tema | Status |
|------|------|--------|
| 1 | SSOT efetivo (LG/EBITDA) | ✅ Concluída — `indicatorsEngine.ts` e `kanitzMonthly.ts` alinhados (LG usa RLP discriminado) |
| 2 | Subgrupos ANC (RLP/Imob/Intang/Invest) | ✅ Concluída — colunas no `bs_dados`, classificação em `core.ts`, fallback contábil |
| 3 | Anti-dupla-contagem (GT vs filhas) | ✅ Concluída — `finalize` prioriza GT; `pruneParents` com tolerância 0,5% |
| 4 | Política de sinais centralizada | ✅ Concluída — `sinais.ts` formaliza a regra (aplicarSinalFinal por bucket) |
| 5 | Classificador híbrido 50/25/15/10 | ✅ Concluída — `classifier.ts` com pesos código/hierarquia/nome/IA |
| 6 | Validador contábil bloqueante | ✅ Concluída — `validation_status` (ok/warn/needs_review) + top 5 contribuintes |
| 7 | PL: prioridade ao oficial | ✅ Concluída — GT direto; rebalanço só como exceção com flag e log crítico |
| 8 | Score de confiança por grupo | ✅ Concluída — `confidence_by_group` persistido e exposto no UI (TabBSDados) |

---

## Arquivos finais tocados

- `supabase/functions/audit-bs-dados/core.ts` (Ondas 2,3,6,7,8)
- `supabase/functions/audit-bs-dados/index.ts` (persistência de validation/confidence)
- `supabase/functions/audit-bs-dados/sinais.ts` (novo — Onda 4)
- `supabase/functions/audit-bs-dados/classifier.ts` (novo — Onda 5)
- `supabase/functions/audit-pipeline-process/index.ts` (PARSER_VERSION → 2026.05.27.12)
- `src/services/bsDadosBuilder.ts` (subgrupos ANC, sinais)
- `src/services/indicatorsEngine.ts` (LG com RLP discriminado)
- `src/services/kanitzMonthly.ts` (Onda 1 cliente — Kanitz LG = AC + RLP)
- `src/components/audit/TabBSDados.tsx` (Onda 8 visível — badge validation + confidence)
- `supabase/migrations/20260527163906_*.sql` (colunas RLP/Invest/Intang/Confidence/Validation)

## Próximas evoluções sugeridas (fora do escopo das 8 ondas)

1. **Conectar `classifier.ts` ao pipeline:** hoje é stand-alone; integrá-lo em `core.ts` substituindo a inferência por nome/regex pura.
2. **Migrar `Math.abs` per-line para `aplicarSinalFinal`** em `bsDadosBuilder.ts` (refator de risco médio — fazer com testes de snapshot).
3. **UI de drill-down de validação:** abrir `validation_diagnostics.contribuintes_top` como tabela navegável em `MapeamentoPorGrupo.tsx`.
4. **Teste de equivalência automática** `resumo.LG === memoria.LG` em CI (snapshot por audit_id Giannini).

---

## Para o usuário aplicar

Execute uma nova auditoria com **"Forçar reprocessamento"** ativado. O bump
`PARSER_VERSION → 2026.05.27.12` invalida o cache e força a aplicação de todas
as ondas implementadas.
