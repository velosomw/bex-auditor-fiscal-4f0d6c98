# MD-PORT-15 — Golden Tests and Homologation Matrix

## 1. Objetivo
Definir o protocolo de testes de regressão ("golden tests") para as competências de Março, Abril e Maio/2026, as tolerâncias numéricas oficiais, a matriz PASS/FAIL por fato e por indicador, os casos negativos obrigatórios, e o protocolo de evidência a produzir em cada rodada de homologação — de forma que qualquer porte da plataforma possa ser validado contra o comportamento certificado atual.

## 2. Escopo
- Golden facts hardcoded no código-fonte (`src/services/auditAIService.ts`) para Março/2026.
- Tolerâncias oficiais: R$ 0,01 (fatos monetários), R$ 1,01 (EBITDA), 0,01 (índices adimensionais).
- Matriz de execução PASS/FAIL por fato certificado e por indicador calculado.
- Casos negativos: PL ≤ 0 (Kanitz N/A), dívida sem leasing, tributário LP (código 2.2.3).
- Protocolo de evidência (o que capturar, onde armazenar, como versionar).

## 3. Pré-requisitos
- Datasets de teste reais (ou fixtures equivalentes) para as competências Março/2026, Abril/2026 e Maio/2026 da mesma empresa de referência.
- Acesso ao pipeline determinístico completo: `buildBSDados` → `indicatorsEngine` → `canonicalFinancialSnapshotService` → `CanonicalReportDataset`.
- Ambiente com as edge functions `audit-analyze`/`audit-chat` publicadas (para golden tests que envolvem narrativa de IA, não apenas fatos).

## 4. Golden Facts oficiais — Março/2026
Extraídos literalmente do prompt hardcoded em `auditAIService.ts` (linhas 979 e 1047), usados como âncora de regressão em DOIS pontos independentes do código (análise assíncrona e chat), o que reforça que são valores **certificados e não triviais de divergir silenciosamente**:
```
PL R$ 61.992.771,89
Receita R$ 77.856.316,94
Resultado R$ 1.040.966,90
Ativo Total R$ 331.984.602,00
```
Esses 4 valores compõem o **golden test mínimo obrigatório de Março/2026**: qualquer execução do pipeline determinístico para essa competência/empresa de referência DEVE produzir esses 4 números (dentro da tolerância de R$ 0,01 — ver §5), e qualquer narrativa gerada por IA para essa competência DEVE citá-los sem divergência.

## 5. Tolerâncias oficiais
| Categoria de fato | Tolerância | Justificativa |
|---|---|---|
| Fatos monetários certificados (PL, Receita, Resultado, Ativo Total, Passivo, componentes de dívida) | **R$ 0,01** | Arredondamento de centavos aceitável por conversão de tipos numéricos (float→decimal), nunca diferença de regra de cálculo. |
| EBITDA (LAJIDA certificado) | **R$ 1,01** | EBITDA é uma métrica reconstruída (`LAJIR + D&A`), sujeita a maior variância de arredondamento acumulado entre múltiplos componentes reconstruídos residualmente; tolerância intencionalmente maior que fatos primários. |
| Índices adimensionais (Liquidez Corrente, Seca, Geral, Imediata, ISG, Fator de Insolvência Kanitz) | **0,01** | Consistente com a precisão de exibição de 2 casas decimais usada em toda a UI (`fmtDec`, `toFixed(2)`/`toFixed(4)` para FI). |

Regra de aplicação: a tolerância é sempre **valor absoluto**, não percentual — `|valor_calculado - valor_esperado| <= tolerância`. Nenhum teste deve usar tolerância relativa (%) para essas categorias, pois valores próximos de zero (ex.: resultado líquido baixo) tornariam a tolerância percentual inutilmente permissiva ou restritiva.

## 6. Procedimento de execução dos golden tests
### 6.1 Preparação
1. Isolar o dataset de origem (arquivo de balancete/DRE) da competência sob teste em um diretório de fixtures versionado (ex.: `test/fixtures/golden/2026-03/`, `2026-04/`, `2026-05/`).
2. Registrar o hash do arquivo de origem (`source_file_hash`, ver MD-PORT-12 §10) antes de qualquer processamento, para garantir reprodutibilidade byte-a-byte.
3. Limpar qualquer cache L0 (`audit_account_cache`) associado à combinação `companyId + periodo` sob teste, forçando reprocessamento completo.

### 6.2 Execução
1. Rodar o pipeline determinístico completo (parsing → `buildBSDados` → `indicatorsEngine` → snapshot certificado) SEM chamar a IA generativa — captura de `facts`/`ratios`/`kanitz` do `CanonicalReportDataset`.
2. Comparar cada fato numérico contra a matriz de referência da competência (§4 para Março/2026; para Abril/Maio, usar os valores certificados correspondentes registrados no dataset de fixtures — devem ser mantidos atualizados junto ao time de produto).
3. Rodar o pipeline completo COM a IA generativa (`analyzeFinancialData`) e capturar a narrativa; verificar que todo valor monetário citado no texto corresponde a um fato já validado no passo 2 (ver MD-PORT-12, Critério de Homologação 1).
4. Renderizar o relatório completo (BEx + Kanitz) e exportar em PDF (ver MD-PORT-14) — capturar como evidência visual.

### 6.3 Encadeamento entre competências (Mar→Abr→Mai)
Os três meses devem ser testados tanto **isoladamente** quanto **em série multi-mês** (via `mergeMultiMonth`/`pickMonths` do módulo `auditMonthDetector`), pois o motor de gráficos e a narrativa de tendência dependem de histórico comparativo (`history: Record<string, IndicatorRow>`). Regra de teste: processar Março isolado deve produzir os mesmos fatos de Março que processar Março+Abril+Maio em lote — nenhuma leitura de mês deve ser afetada pela presença de meses adjacentes no mesmo lote (nenhum "vazamento" de coluna entre competências no parser).

## 7. Matriz PASS/FAIL — por fato certificado
| Fato | Competência | Valor esperado | Tolerância | Critério PASS |
|---|---|---|---|---|
| Patrimônio Líquido | Mar/2026 | R$ 61.992.771,89 | R$ 0,01 | `\|calculado - esperado\| <= 0,01` |
| Receita Líquida | Mar/2026 | R$ 77.856.316,94 | R$ 0,01 | idem |
| Resultado Líquido | Mar/2026 | R$ 1.040.966,90 | R$ 0,01 | idem |
| Ativo Total | Mar/2026 | R$ 331.984.602,00 | R$ 0,01 | idem |
| Patrimônio Líquido | Abr/2026 | (registrar valor certificado no fixture de Abril) | R$ 0,01 | idem |
| Receita Líquida | Abr/2026 | (idem) | R$ 0,01 | idem |
| Resultado Líquido | Abr/2026 | (idem) | R$ 0,01 | idem |
| Ativo Total | Abr/2026 | (idem) | R$ 0,01 | idem |
| Patrimônio Líquido | Mai/2026 | (registrar valor certificado no fixture de Maio) | R$ 0,01 | idem |
| Receita Líquida | Mai/2026 | (idem) | R$ 0,01 | idem |
| Resultado Líquido | Mai/2026 | (idem) | R$ 0,01 | idem |
| Ativo Total | Mai/2026 | (idem) | R$ 0,01 | idem |

Nota metodológica: apenas Março/2026 tem valores "soberanos" hardcoded no código-fonte atual (§4) — Abril e Maio devem ter seus valores certificados registrados e versionados junto ao dataset de fixtures de teste (não há, no código atual, uma segunda âncora hardcoded para esses meses); a ausência desses valores explícitos no repositório é uma lacuna a resolver no processo de homologação, não uma omissão deste documento.

## 8. Matriz PASS/FAIL — por indicador calculado
| Indicador | Fórmula (fonte: `ReportFormulas.tsx`) | Tolerância | Observação de PASS |
|---|---|---|---|
| Liquidez Corrente | `AC / PC` | 0,01 | Comparar com 2 casas decimais renderizadas na UI. |
| Liquidez Seca | `(AC - Estoques) / PC` | 0,01 | idem |
| Endividamento Total | `(PC + PNC) / Ativo Total` | 0,01 | idem |
| Imobilização do PL | `Ativo Imobilizado / PL` | 0,01 | Se PL ≤ 0, resultado deve ser `N/A`, não um número (ver §9). |
| LAJIR (EBIT Certified) | `Resultado Líquido + Desp. Fin. - Rec. Fin. + Tributos sobre Lucro` | R$ 0,01 | Reconstrução residual — validar contra balancete consolidado (SSOT). |
| EBITDA (LAJIDA) | `LAJIR + Depreciação + Amortização` | **R$ 1,01** | Só é "CERTIFIED"/"AVAILABLE" quando D&A é identificável; caso contrário, PASS exige `null`/gap no gráfico (nunca 0). |
| Cobertura de Juros | `LAJIR / \|Despesas Financeiras\|` | 0,01 | Indefinido (N/A) se despesas financeiras forem zero. |
| Fator de Insolvência Kanitz (FI) | `(0,05×RL) + (1,65×LG) + (3,55×LS) - (1,06×LC) - (0,33×GE)` | 0,01 | `N/A` obrigatório se PL ≤ 0 (ver §9, caso negativo 1). |
| ISG (Índice de Solvência Geral) | `Ativo Total / (PC + PNC)` | 0,01 | Substitui Kanitz quando PL ≤ 0; faixas: `>1,5` Solvente, `1,0–1,5` Atenção, `<1,0` Insolvente. |

## 9. Casos negativos obrigatórios
### 9.1 PL ≤ 0 → Kanitz deve retornar N/A, não um número espúrio
Regra fonte (`ReportFormulas.tsx`): *"Se PL ≤ 0, K = N/A. O modelo é substituído pelo ISG (Índice de Solvência Geral) para evitar falsos positivos por inversão matemática."*
Teste: construir um fixture com PL negativo (passivo total > ativo total) e verificar:
- `latestKanitz.fi` deve ser `null`/não finito.
- `latestKanitz.kanitzAplicavel` deve ser `false`.
- O helper `fiFmt(fi, aplicavel)` deve retornar a string literal `"N/A"` — **nunca** `"0.0000"` nem `"NaN"`.
- O relatório deve exibir o ISG como métrica substituta, com a faixa de classificação correta (`>1,5` Solvente / `1,0-1,5` Atenção / `<1,0` Insolvente).

### 9.2 Dívida sem leasing
Cenário: balancete sem nenhuma conta classificável como leasing/arrendamento (regex `/emprestim|financiament|instituic[oõ]es?\s+financ|deb[eê]ntures?|leasing|arrendament/` de `classifyPCByDescription`/`classifyPNCByDescription` em `auditAIService.ts`, bucket `AA`/`QQ`) não deve ser encontrado.
Teste: verificar que:
- O bucket `AA` (Passivo Circulante — Empréstimos/Financiamentos/Leasing) e `QQ` (Passivo Não Circulante — idem) permanecem em `0`, não em `null`/`undefined` (ausência de leasing é um FATO — zero legítimo —, distinto de ausência de dado, que seria `null`).
- O gráfico de "Evolução do Endividamento" (MD-PORT-13 §12) deve exibir a barra `EMPR. E FINANCIAMENTOS` com valor `0`, sem quebrar o empilhamento das demais categorias.
- Nenhuma narrativa de IA deve mencionar "dívida de leasing" ou "arrendamento mercantil" para essa competência (regra de não-invenção, MD-PORT-12 §7 regra 5).

### 9.3 Tributário de Longo Prazo — código 2.2.3
Cenário: conta contábil com código no padrão `2.2.3xx` (Passivo Não Circulante, subgrupo tributário — bucket `RR` via `classifyPNCByDescription`, regex `/tribut|imposto|parcelament|refis/`).
Teste: verificar que:
- Uma conta com código `2.2.301` e descrição "Parcelamento REFIS" é classificada corretamente no bucket `RR` (Passivo Não Circulante — Tributário), **não** no bucket `PP` (Fornecedores LP) nem `QQ` (Financeiro LP).
- O valor dessa conta compõe corretamente `passivo_nao_circulante` no fato agregado, e é refletido no indicador de Endividamento Total (`(PC + PNC) / Ativo Total`) dentro da tolerância de 0,01.
- Regra de prioridade: se a mesma conta também casar com o regex de leasing por erro de descrição ambígua, a ordem de checagem em `classifyPNCByDescription` (RJ → leasing/financiamento → tributário → fornecedores → resíduo `DD1`) deve ser respeitada exatamente como no código-fonte — recuperação judicial (`CC1`) tem prioridade máxima, tributário (`RR`) é checado após financeiro (`QQ`).

## 10. Protocolo de evidência
Para cada rodada de homologação (por competência e por versão do código sob teste), produzir e arquivar:
1. **Hash do dataset de origem** (`source_file_hash`) e `runtime_trace_id`/`canonical_snapshot_id` gerados.
2. **Tabela de fatos calculados vs. esperados** (formato CSV/Markdown), com colunas: `fato`, `valor_calculado`, `valor_esperado`, `diferença_absoluta`, `tolerância`, `PASS/FAIL`.
3. **Tabela de indicadores calculados vs. esperados**, mesmo formato, incluindo a coluna extra `N/A_esperado` (booleano) para os casos onde o indicador deve ser `N/A` (ex.: Kanitz com PL ≤ 0).
4. **PDF exportado** do relatório completo (BEx + Kanitz) da competência sob teste, gerado pelo pipeline real (`exportPdf`, ver MD-PORT-14), como evidência visual imutável.
5. **Log da narrativa de IA gerada** (texto completo retornado por `analyzeFinancialData`), com marcação de quais frases citam quais `fact_ids_used`.
6. **Registro de versão**: hash de commit/branch do código sob teste, data/hora da execução, e nome do executor/responsável pela homologação.
7. Todos os artefatos devem ser armazenados em um diretório versionado por competência e por rodada (ex.: `homologacao/2026-03/rodada-01/`), nunca sobrescrevendo evidências de rodadas anteriores — permitindo auditoria histórica de regressões.

## 11. Checklist de Implementação
- [ ] Fixtures de Março/2026, Abril/2026 e Maio/2026 versionados e com hash registrado.
- [ ] Golden facts de Março/2026 (PL, Receita, Resultado, Ativo Total) codificados nos testes automatizados com a tolerância exata de R$ 0,01.
- [ ] Tolerância de R$ 1,01 aplicada especificamente ao EBITDA, nunca aos demais fatos monetários.
- [ ] Tolerância de 0,01 aplicada a todos os índices adimensionais (liquidez, endividamento, ISG, FI).
- [ ] Caso negativo PL≤0 cobrindo `fiFmt` retornando literalmente `"N/A"`.
- [ ] Caso negativo "dívida sem leasing" cobrindo bucket `AA`/`QQ` = `0` (não `null`).
- [ ] Caso negativo "tributário LP 2.2.3" cobrindo classificação correta no bucket `RR`, respeitando a ordem de prioridade de `classifyPNCByDescription`.
- [ ] Protocolo de evidência com os 6 artefatos obrigatórios (§10) gerado a cada rodada.
- [ ] Testes multi-mês (Mar+Abr+Mai em lote) validados contra os mesmos fatos dos testes isolados por mês.

## 12. Critérios de Homologação
1. **100% dos golden facts de Março/2026 dentro da tolerância** de R$ 0,01, em toda execução do pipeline determinístico, isolada ou em lote multi-mês.
2. **EBITDA dentro de R$ 1,01** em todas as competências onde `ebitdaStatus` seja `CERTIFIED`/`AVAILABLE`; nas demais, EBITDA deve ser `null`, nunca um número aproximado.
3. **Todos os índices adimensionais dentro de 0,01** de tolerância em relação ao valor de referência calculado manualmente (planilha de conferência independente do motor de produção).
4. **Kanitz nunca numérico com PL ≤ 0** — 100% dos cenários de teste com PL negativo/zero devem resultar em `fiFmt` = `"N/A"` e substituição por ISG.
5. **Nenhuma narrativa de IA inventa leasing inexistente** — para o fixture "dívida sem leasing", buscar por termos "leasing"/"arrendamento" no texto gerado deve retornar zero ocorrências.
6. **Classificação tributária LP correta** — 100% das contas de teste com código `2.2.3xx` devem cair no bucket `RR`, nunca em `PP`/`QQ`/`DD1`.
7. **Reprodutibilidade**: reexecutar a mesma rodada de homologação (mesmo fixture, mesmo commit) duas vezes deve produzir exatamente os mesmos fatos numéricos (diferença zero, não apenas dentro de tolerância) — tolerância é para divergência entre implementações/versões, não para não-determinismo dentro da mesma versão.
8. **Evidência completa arquivada**: toda rodada de homologação relatada como "aprovada" deve ter os 7 artefatos do protocolo de evidência (§10) disponíveis para auditoria posterior.
