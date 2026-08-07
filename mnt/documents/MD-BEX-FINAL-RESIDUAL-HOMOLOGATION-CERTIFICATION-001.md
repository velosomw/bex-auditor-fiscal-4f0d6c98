# MD-BEX-FINAL-RESIDUAL-HOMOLOGATION-AND-PUBLICATION-CERTIFICATION-001

## 1. Escopo protegido
Núcleo P1 (Synthetic Authority), Integrity Gates, snapshot certificado e demais itens já homologados
NÃO foram alterados. As correções abaixo são exclusivamente residuais.

## 2. Pendências antigas (Receita / Estoque)
- `filterStalePendencias` (residualFactsResolver) invalida pendências cujo fato já está certificado
  no snapshot (Receita > 0, Estoques > 0) e remove diagnósticos internos de pipeline.
- Aplicado em BEx (`activePend`) e na fase de resultados (`activePendencias`).

## 3. Taxonomia de dívidas
- **Tributária**: obrigações CP + parcelamentos CP + obrigações LP → Exposição Tributária Total.
- **Trabalhista**: folha, INSS, FGTS, férias/13º e rescisões (curto prazo).
- **Empréstimos**: Borrowing Semantic Gate — apenas contas patrimoniais do passivo.
  Sem saldo patrimonial ⇒ NOT_AVAILABLE (nunca despesa financeira como dívida).
- Indicadores derivados (dívida onerosa, dependência bancária, pressão de caixa) publicam
  "N/A" quando empréstimos não são certificáveis.

## 4. EBITDA e Cobertura de Juros
- Proibido publicar Resultado do Período como EBITDA.
- EBITDA só é publicado com LAJIR + Depreciação/Amortização certificados; caso contrário
  `ebitdaStatus = NOT_AVAILABLE` com justificativa no relatório.
- Cobertura de Juros exibe "N/D" quando LAJIR/despesas financeiras não são certificáveis.

## 5. Despesas financeiras
- Mapeadas do grupo de resultado com valor contábil e valor de análise (módulo) distintos.

## 6. Fechamento contábil
- `detectBalanceClosure` distingue RESULT_INSIDE_EQUITY e RESULT_OUTSIDE_EQUITY.
- A validação publicada passa a ser "Ativo = Passivo + PL" ou "Ativo = Passivo + PL + Resultado",
  conforme o modo detectado, com mensagem e status reais.

## 7. Metadados
- Empresa, CNPJ, data-base e arquivo de origem vêm do snapshot/upload; sem dados de demonstração.

## 8. Paginação e memória Kanitz
- Regras de impressão `.break-inside-avoid` para blocos editoriais, cards de pendência e títulos.
- Memória de cálculo dividida em Tabela A (valores) e Tabela B (contribuição ponderada + FI + ISG),
  com `table-layout: fixed`, fonte mínima 8.5pt e `word-break: normal`.
- FI publica "N/A" quando o modelo não é aplicável (PL ≤ 0).

**Status**: HOMOLOGADO — correções persistentes para qualquer balancete futuro.
