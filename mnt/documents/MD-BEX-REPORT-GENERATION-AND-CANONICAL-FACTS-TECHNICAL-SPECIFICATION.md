# MD-BEX-REPORT-GENERATION-AND-CANONICAL-FACTS-TECHNICAL-SPECIFICATION
Updated: 2026-08-13

## 1. Visão Geral do Pipeline de Geração
O processo de geração do Relatório BEx (Brasil Expert) segue um pipeline determinístico de 5 estágios. O erro "Fatos canônicos não encontrados" geralmente ocorre quando há uma quebra no Estágio 3 (Snapshoting) ou falha na normalização de contas no Estágio 2.

**Fluxo de Dados:**
`BALANCETE (XLSX/PDF) → PARSER (AI) → NORMALIZAÇÃO (P1 AUTHORITY) → SNAPSHOT CERTIFICADO → RENDERER (A4)`

## 2. Estágio 1: Extração e Detecção (AI/Parser)
- **Serviço:** `src/services/auditAIService.ts` e `src/services/auditMonthDetector.ts`
- **Função:** Converte arquivos brutos em `ParsedFinancialData`.
- **Month Detection:** Identifica as competências (meses) no arquivo. Se falhar, o relatório não consegue ser indexado.

## 3. Estágio 2: Motor de Resolução P1 (Authority Resolver)
Este é o núcleo técnico onde a maioria dos erros de "Fatos Não Encontrados" reside.
- **Serviço:** `src/services/p1SyntheticResolver.ts`
- **Lógica P1:** O motor reconstrói a árvore de contas (`AccountNode`).
- **Autoridade Sintética:**
  - **P1:** Conta sintética explícita (ex: "1.1" para Ativo Circulante).
  - **P2:** Soma dos filhos imediatos.
  - **P3:** Soma das folhas analíticas.
- **Dicionário de Roles:** Mapeia `CanonicalRole` (ex: `ativo_circulante`) para regex e códigos (ex: `1.1`, `1.01`).
- **Falha Típica:** Se o balancete não seguir uma estrutura decimal mínima (ex: contas sem pontos ou sem hierarquia), o motor não consegue somar os filhos e retorna `NOT_AVAILABLE`.

## 4. Estágio 3: Snapshot Financeiro Certificado (SSOT)
- **Serviço:** `src/services/canonicalFinancialSnapshotService.ts`
- **Contrato:** `CertifiedFinancialSnapshot`
- **Imutabilidade:** O snapshot é congelado (`Object.freeze`). Se um fato essencial (Ativo, Passivo ou PL) não for encontrado pelo Resolver P1, o status do snapshot é marcado como `FAILED`.
- **Fatos Residuais:** Resolvidos pelo `residualFactsResolver.ts` (EBITDA, Dívida Tributária LP, etc).

## 5. Estágio 4: Fatos Canônicos e Vínculos (Binding)
Para o relatório BEx ser gerado, os seguintes fatos são OBRIGATÓRIOS:
- `ativo_circulante`
- `passivo_circulante`
- `patrimonio_liquido`
- `receita_liquida` (para margens)

**Vínculo Crítico de Tributos LP (Tax LP):**
O campo `tax_noncurrent` é vinculado estritamente ao grupo sintético `2.2.3` no `bsDadosBuilder.ts` e no `residualFactsResolver.ts`. Se este grupo não existir no balancete, o valor será zero/NA.

## 6. Estágio 5: Renderer e Exportação (PDF/Safe Pagination)
- **Componente:** `src/pages/Audit.tsx`
- **Geometria Hard Gate:**
  - **Altura Máxima:** 245mm (excesso gera overflow quebra o PDF).
  - **Safe Zone:** 26mm no rodapé.
- **Exportação:** Usa `html2canvas` + `jsPDF`.
- **Sanitização:** O clone do DOM para o PDF remove botões e normaliza cores para HEX/RGBA (Vite/Rollup bugs).

## 7. Troubleshooting: "Fatos Canônicos Não Encontrados"
1. **Verificar Normalização:** Abra o console e verifique se `normalizeAccountCode` está gerando strings como "1.1.01". Se gerar "" ou strings sem números, o balancete é incompatível.
2. **Verificar Hierarquia:** O Resolver P1 exige que os pais contenham o prefixo dos filhos (ex: "1.1" é pai de "1.1.01").
3. **Integrity Gates:** Verifique `latestRow.integrity_gates` no `canonicalFinancialSnapshotService.ts`. Se o Ativo total divergir da soma AC+ANC por mais de 0.1%, o fato pode ser rejeitado.
4. **Log de Trace:** Procure por `BEX-RUNTIME-TRACE` no console para identificar IDs de processamento e falhas de bind.

## 8. Fórmulas de Cálculo (Engine v2.1)
- **ISG:** `AT / (PC + PNC)`
- **EBITDA:** `LAJIR + Depreciação + Amortização` (Com Dual Reconciliation Gate).
- **Margens:** Calculadas em `residualFactsResolver.ts` com base na Receita Líquida Certificada.
- **PL Negativo:** Ativa o gate `NOT_APPLICABLE` para indicadores de rentabilidade e Kanitz.
