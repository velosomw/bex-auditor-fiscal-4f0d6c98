## Documento de referência gerado

`Auditoria_Revisao_Engine_Indicadores_v3.docx` — baixe e revise. Contém: diagnóstico do que está errado, tabela completa de mapeamento por grupo contábil, fórmulas oficiais da aba ÍNDICES (Fase2), fórmulas Kanitz/ISG, plano de implementação e critério de validação contra o balancete Giannini.

<presentation-artifact path="Auditoria_Revisao_Engine_Indicadores_v3.docx" mime_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document"></presentation-artifact>

## Problema identificado nos 3 arquivos

A função `REF_BY_PREFIX` em `src/services/auditAIService.ts` foi calibrada para UM plano de contas. No balancete Giannini os mesmos códigos significam coisas diferentes:

| Código | Plano hardcoded atual | Plano Giannini real |
|---|---|---|
| 111 | Caixa (correto por acaso) | Bens e Numerários (ok) |
| 211 | Empréstimos e Financiamentos | **Fornecedores** |
| 212 | Fornecedores | **Contas a Pagar** |
| 215 | (não mapeado) | **Instituições Financeiras** = empréstimos reais |
| 7 | DESPESAS operacionais | **Despesas/Receitas Financeiras** |
| 8 | DESPESAS operacionais | **Não Operacionais** |

Resultado: dívida financeira inflada, fornecedores subestimados, EBITDA e Cobertura de Juros incorretos.

## Mudanças a aplicar

**1. `src/services/auditAIService.ts` — Classificação por grupo (2 dígitos), não plano específico**

Substituir `REF_BY_PREFIX` por uma lógica em 2 camadas:

- **Camada A (autoritativa):** quando a linha do balancete tiver código curto (2-3 dígitos) e nome canônico de grupo (`Ativo Circulante`, `Passivo Não Circulante`, `Patrimônio Líquido`, etc.), usa o VALOR DECLARADO como total do grupo e pula as folhas internas para evitar dupla contagem.
- **Camada B (sub-classificação PC/PNC):** para componentes do Passivo, usa o 2º nível + regex na descrição → fornecedores / trabalhista / tributária / financeira / credores RJ.

**2. `src/services/bsDadosBuilder.ts`**

- Adicionar campo `outras_nao_operacionais` (separar grupo 8).
- Atualizar `FALLBACK_PATTERNS` para reconhecer nomes-padrão dos grupos.
- `divida_financeira` passa a vir de descrição (Empréstimos/Financiamentos/Inst. Financeiras), não do código.

**3. `src/services/indicatorsEngine.ts` — Anualizar atividade**

- IME, PMC, PMP passam de multiplicador 30 (mensal) para 360 (alinhado ÍNDICES Fase2).
- Adicionar `cicloOperacional = IME + PMC`, `cicloCaixa = CO − PMP`, `composicaoEndivLP = PNC / PT`.

**4. `src/components/audit/TabKanitz.tsx` — Termômetro real**

- Gauge vertical Recharts (faixas −7…0 vermelho / 0…+3 amarelo / +3…+7 verde) com ponteiro no FI do mês.
- Série temporal mensal do FI.
- Quando todos os meses têm PL ≤ 0, troca automaticamente para ISG como indicador primário (faixas 1,0 / 1,5).

**5. `src/components/audit/TabGraficosAuditoria.tsx` — Gráficos faltantes**

- BarChart empilhado: Endividamento por categoria por mês (Tributárias / Trabalhistas / Empr. / Fornecedores / Credores RJ / Outras) + LineChart de TOTAL sobreposto.
- LineChart ISG mensal com bandas em 1,0 e 1,5.

## Critério de aceite

Após implementar, com o balancete Giannini Ago/2025 a engine deve ler:
- Ativo Circulante = **75.575.226,58** (código 11)
- Disponível = **492.194,16** (código 111)
- Clientes = **20.604.366,18** (código 112)
- Liquidez Corrente Ago/2025 deve bater com o cálculo manual AC/PC do balancete (não mais 0,90 espúrio).

## Risco

Mudança na classificação afeta **todas** as métricas exibidas. Recomendo aplicar e validar no balancete Giannini imediatamente após (você abre a aba Indicadores e confirma os valores).

## Próximo passo

Aprovar este plano para eu executar as 5 mudanças acima em uma única rodada. Os arquivos das auditorias existentes serão reprocessados automaticamente ao abrir (não há migração de dados — tudo é recalculado em tempo de visualização).
