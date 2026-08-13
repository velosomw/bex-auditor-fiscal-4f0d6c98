# MD-PORT-13 — Charts and Workspace Visualization (Recharts)

## 1. Objetivo
Especificar, com as configurações Recharts reais de `src/components/audit/AuditCharts.tsx`, `src/services/auditChartsOptions.ts` e `src/services/balanceteChartsParser.ts`, cada gráfico do dashboard executivo e do painel de workspace, incluindo eixos, domínios, formatadores, paleta, tratamento de séries parciais e o mapeamento `bs_dados → série`.

## 2. Escopo
- Paleta `EXCEL_COLORS` e formatadores (`fmtMilhar`, `fmtPct`, `fmtDec`).
- 6 gráficos de `AuditCharts.tsx`: CMV/Receita, CMV+Despesa/Receita, Resultado/Receita, EBITDA, Índices de Liquidez, Evolução do Endividamento (com OBRIG. TRIBUTÁRIAS).
- Parser fixo de abas Excel (`balanceteChartsParser.ts`) para Fluxo de Caixa Parcial/Previsto x Realizado.
- Tratamento de dados parciais (série incompleta) e insights automáticos determinísticos.

## 3. Pré-requisitos
- `recharts` instalado (import: `ComposedChart, BarChart, LineChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine, ResponsiveContainer`).
- Dataset `MonthlyDatum[]` construído por `buildMonthlyDataset`/`bsDadosToMonthlyDataset` (a partir de `BSDadosRow[]` via `buildBSDados`).
- Variáveis CSS HSL do tema (`hsl(var(--foreground))`, `hsl(var(--background))`) disponíveis no runtime (consumo direto de tokens Tailwind/shadcn).

## 4. Paleta e formatadores (`auditChartsOptions.ts`)
```ts
export const EXCEL_COLORS = {
  azul: "#4F81BD", laranja: "#F79646", vermelho: "#C00000", verde: "#9BBB59",
  roxo: "#8064A2", cinza: "#D9D9D9", cinzaEscuro: "#7F7F7F", ciano: "#4BACC6", amarelo: "#F2C200",
};
```
Formatadores decimais (padrão 0.00, vírgula decimal pt-BR):
```ts
export const fmtMilhar = (v) => { if (v==null||!Number.isFinite(v)) return "#N/D"; const n=Math.round(v); const s=new Intl.NumberFormat("pt-BR").format(Math.abs(n)); return n<0?`(${s})`:s; };
export const fmtPct = (v, dec=2) => { if (v==null||!Number.isFinite(v)) return "#N/D"; return `${v.toFixed(dec).replace(".", ",")}%`; };
export const fmtDec = (v, dec=2) => { if (v==null||!Number.isFinite(v)) return "—"; return v.toFixed(dec).replace(".", ","); };
```
Regra de indicadores em decimal `0.00`: todos os índices de liquidez são arredondados para **2 casas decimais** antes de entrar no dataset da série (`+ind.liquidez_corrente.toFixed(2)`), e exibidos no tooltip via `fmtDec` (vírgula decimal). `fmtMilhar` retorna `#N/D` (nunca `0` nem `NaN`) para valores ausentes — replicar esse sentinel literal.

## 5. Estilo comum de eixos/grade/tooltip
```ts
const AXIS_PROPS = {
  tick: { fontSize: 12, fill: "hsl(var(--foreground))", fontFamily: "Segoe UI, Arial, sans-serif", fontWeight: 500 },
  stroke: "hsl(var(--foreground) / 0.35)",
  tickLine: { stroke: "hsl(var(--foreground) / 0.35)" },
};
const GRID = <CartesianGrid stroke="hsl(var(--foreground) / 0.18)" strokeDasharray="3 3" vertical={false} />;
const TOOLTIP_STYLE = {
  contentStyle: { backgroundColor: "hsl(var(--background))", border: "1px solid hsl(var(--foreground) / 0.25)", fontSize: 12, fontFamily: "Segoe UI, Arial, sans-serif", color: "hsl(var(--foreground))", borderRadius: 6, boxShadow: "0 4px 12px hsl(var(--foreground) / 0.15)" },
  labelStyle: { color: "hsl(var(--foreground))", fontWeight: 600 },
  itemStyle: { color: "hsl(var(--foreground))" },
  cursor: { fill: "hsl(var(--foreground) / 0.06)" },
};
```
Wrapper de tile padronizado (`ChartTile`): `Card` com `height: 320, minHeight: 320` para o `ResponsiveContainer`, título centralizado uppercase (`text-[13px] font-bold ... uppercase tracking-wide`), subtítulo opcional (`text-[11px]`).

## 6. Construção de série (`buildSeries`)
```ts
function buildSeries(data: MonthlyDatum[]) {
  return data.map(d => {
    const ind = computeIndicators(d);
    return {
      mes: d.mes,
      receita: d.hasReceita ? Math.round(d.receita_liquida / 1000) : null,
      cmv: d.hasReceita ? Math.round(d.cmv / 1000) : null,
      cmvDesp: d.hasReceita ? Math.round((Math.abs(d.cmv) + Math.abs(d.despesas)) / 1000) : null,
      resultado: d.hasReceita ? Math.round(d.resultado / 1000) : null,
      ebitda: d.ebitdaStatus === "CERTIFIED" || (d.ebitdaStatus as any) === "AVAILABLE" ? Math.round(d.ebitda) : null,
      cmvPct: d.hasReceita && ind.cmvPct !== null ? +(ind.cmvPct * 100).toFixed(2) : null,
      cmvDespPct: d.hasReceita && ind.cmvDespPct !== null ? +(ind.cmvDespPct * 100).toFixed(2) : null,
      margemPct: d.hasReceita && ind.margemResultado !== null ? +(ind.margemResultado * 100).toFixed(2) : null,
      liquidez_imediata: ind.liquidez_imediata !== null ? +ind.liquidez_imediata.toFixed(2) : null,
      liquidez_corrente: ind.liquidez_corrente !== null ? +ind.liquidez_corrente.toFixed(2) : null,
      liquidez_seca: ind.liquidez_seca !== null ? +ind.liquidez_seca.toFixed(2) : null,
      liquidez_geral: ind.liquidez_geral !== null ? +ind.liquidez_geral.toFixed(2) : null,
      divida_tributaria: Math.round(Number(d.divida_tributaria || 0)),
      divida_trabalhista: Math.round(Number(d.divida_trabalhista || 0)),
      divida_financeira: Math.round(Number(d.divida_financeira || 0)),
      fornecedores: Math.round(Number(d.fornecedores || 0)),
      credores_rj: Math.round(Number(d.credores_rj || 0)),
      outras_obrigacoes: Math.round(Number(d.outras_obrigacoes || 0)),
      divida_total: Math.round(d.divida_total),
    };
  });
}
```
Regra de dados parciais: quando `d.hasReceita === false` (mês sem DRE completo), TODOS os campos derivados de receita (`receita`, `cmv`, `cmvDesp`, `resultado`, `cmvPct`, `cmvDespPct`, `margemPct`) são explicitamente `null` — **nunca `0`** — para que o Recharts trate o ponto como ausente/gap na linha (com `connectNulls={false}` no gráfico de EBITDA), evitando que uma série parcial pareça "queda a zero" no gráfico.

## 7. Gráfico 1 — CMV / Receita Líquida
`ComposedChart`, unidade R$ x 1000. Dois eixos Y: `left` (barras, `tickFormatter=tooltipMilhar`), `right` (linha %, `domain={[-100, 100]}`, `tickFormatter={(v) => `${v}%`}`).
```tsx
<Bar yAxisId="left" dataKey="receita" name="Receita Líquida" fill={EXCEL_COLORS.azul} />
<Bar yAxisId="left" dataKey="cmv" name="CMV" fill={EXCEL_COLORS.laranja} />
<Line yAxisId="right" type="monotone" dataKey="cmvPct" name="CMV / Receita (%)" stroke={EXCEL_COLORS.vermelho} strokeWidth={3} dot={{ r: 5, strokeWidth: 2 }} />
```
Tooltip formatter roteia por nome da série: `formatter={(v, n) => [n.includes("%") ? tooltipPct(v) : tooltipMilhar(v), n]}`.

## 8. Gráfico 2 — CMV + Despesa × Receita Líquida
Mesmo padrão do gráfico 1, mas eixo `right` **sem domínio fixo** (`tickFormatter={(v) => `${v}%`}` sem `domain`), e inclui `ReferenceLine` de limite 100%:
```tsx
<Bar yAxisId="left" dataKey="receita" name="Receita Líquida" fill={EXCEL_COLORS.azul} />
<Bar yAxisId="left" dataKey="cmvDesp" name="CMV + Despesa" fill={EXCEL_COLORS.vermelho} />
<Line yAxisId="right" type="monotone" dataKey="cmvDespPct" name="CMV+Desp / Receita (%)" stroke={EXCEL_COLORS.vermelho} strokeWidth={3} dot={{ r: 5, strokeWidth: 2 }} />
<ReferenceLine yAxisId="right" y={100} stroke={EXCEL_COLORS.vermelho} strokeDasharray="4 4" label={{ value: "100% (limite)", fontSize: 10, fill: EXCEL_COLORS.vermelho }} />
```

## 9. Gráfico 3 — Resultado / Receita Líquida
```tsx
<Bar yAxisId="left" dataKey="receita" name="Receita Líquida" fill={EXCEL_COLORS.azul} />
<Bar yAxisId="left" dataKey="resultado" name="Lucro/Prejuízo Líquido" fill={EXCEL_COLORS.laranja} />
<Line yAxisId="right" type="monotone" dataKey="margemPct" name="Resultado / Receita (%)" stroke={EXCEL_COLORS.verde} strokeWidth={3} dot={{ r: 5, strokeWidth: 2 }} />
```

## 10. Gráfico 4 — EBITDA
`LineChart` monetário absoluto (não em milhares). `ReferenceLine y={0}` para marcar o zero visualmente. `connectNulls={false}` — pontos ausentes (EBITDA não certificado) quebram a linha em vez de interpolar:
```tsx
<ReferenceLine y={0} stroke="hsl(var(--foreground))" strokeWidth={2} />
<Line type="monotone" dataKey="ebitda" name="EBITDA" stroke={EXCEL_COLORS.ciano} strokeWidth={3} dot={{ r: 5, fill: EXCEL_COLORS.ciano }} connectNulls={false} />
```
Gate de certificação: `ebitda` só é numérico quando `d.ebitdaStatus === "CERTIFIED" || d.ebitdaStatus === "AVAILABLE"`; qualquer outro status resulta em `null`.

## 11. Gráfico 5 — Índices de Liquidez (0.00)
`LineChart` com 4 linhas simultâneas, todas em escala decimal (2 casas), `tickFormatter=tooltipDec`:
```tsx
<Line type="monotone" dataKey="liquidez_imediata" name="LIQUIDEZ IMEDIATA" stroke={EXCEL_COLORS.azul} strokeWidth={3} dot={{ r: 4, strokeWidth: 2 }} />
<Line type="monotone" dataKey="liquidez_corrente" name="LIQUIDEZ CORRENTE" stroke={EXCEL_COLORS.vermelho} strokeWidth={3} dot={{ r: 4, strokeWidth: 2 }} />
<Line type="monotone" dataKey="liquidez_seca" name="LIQUIDEZ SECA" stroke={EXCEL_COLORS.verde} strokeWidth={3} dot={{ r: 4, strokeWidth: 2 }} />
<Line type="monotone" dataKey="liquidez_geral" name="LIQUIDEZ GERAL" stroke={EXCEL_COLORS.roxo} strokeWidth={3} dot={{ r: 4, strokeWidth: 2 }} />
```

## 12. Gráfico 6 — Evolução do Endividamento (com OBRIG. TRIBUTÁRIAS)
`ComposedChart` de barras empilhadas (`stackId="div"`) + linha de total em eixo secundário:
```tsx
<Bar yAxisId="left" dataKey="divida_tributaria" name="OBRIG. TRIBUTÁRIAS" stackId="div" fill={EXCEL_COLORS.azul} />
<Bar yAxisId="left" dataKey="divida_trabalhista" name="OBRIG. TRABALHISTAS" stackId="div" fill={EXCEL_COLORS.laranja} />
<Bar yAxisId="left" dataKey="divida_financeira" name="EMPR. E FINANCIAMENTOS" stackId="div" fill={EXCEL_COLORS.cinzaEscuro} />
<Bar yAxisId="left" dataKey="fornecedores" name="FORNECEDORES" stackId="div" fill={EXCEL_COLORS.verde} />
<Bar yAxisId="left" dataKey="credores_rj" name="CREDORES RJ" stackId="div" fill={EXCEL_COLORS.amarelo} />
<Bar yAxisId="left" dataKey="outras_obrigacoes" name="OUTRAS OBRIGAÇÕES" stackId="div" fill={EXCEL_COLORS.vermelho} />
<Line yAxisId="right" type="monotone" dataKey="divida_total" name="TOTAL" stroke={EXCEL_COLORS.vermelho} strokeWidth={3} dot={{ r: 5, fill: EXCEL_COLORS.vermelho }} />
```
A ordem de empilhamento (`stackId="div"`) e a ordem das barras **devem ser preservadas exatamente** (tributária → trabalhista → financeira → fornecedores → credores RJ → outras) — essa ordem reflete a hierarquia de prioridade de credores em recuperação judicial (Lei 11.101/2005), relevante para leitura visual jurídica do gráfico.

## 13. Insights automáticos (determinísticos, `generateInsights`)
```ts
if (ind.cmvPct !== null && ind.cmvPct > 0.8) insights.push({ tipo: "critico", texto: `CMV elevado (${fmtPct(ind.cmvPct * 100)}) — risco operacional` });
if (ind.cmvDespPct !== null && ind.cmvDespPct > 1) insights.push({ tipo: "critico", texto: `CMV+Despesa supera receita (${fmtPct(ind.cmvDespPct * 100)}) — operação inviável` });
if (ind.margemResultado !== null && ind.margemResultado < 0) insights.push({ tipo: "critico", texto: `Resultado negativo (${fmtPct(ind.margemResultado * 100)})` });
if (ind.liquidez_corrente !== null && ind.liquidez_corrente < 1) insights.push({ tipo: "critico", texto: `Liquidez corrente baixa (${fmtDec(ind.liquidez_corrente)}) — risco financeiro` });
if (last.ebitda < 0) insights.push({ tipo: "atencao", texto: `EBITDA negativo (${fmtMilhar(last.ebitda)})` });
if (data.length >= 2) { /* dívida cresceu >5% no período → "atencao" */ }
if (!insights.length) insights.push({ tipo: "info", texto: "Indicadores dentro de faixas operacionais aceitáveis." });
```
Esses insights alimentam badges na UI (`bg-[hsl(0,75%,55%)]/10` para crítico, `bg-[hsl(34,95%,55%)]/10` para atenção, `bg-muted` para info) — puramente client-side, sem chamada de IA (ver MD-PORT-12 §12).

## 14. Mapeamento `bs_dados → série`
O dataset de entrada dos gráficos é `MonthlyDatum[]`, obtido preferencialmente de `bsDadosToMonthlyDataset(buildBSDados(parsedData, entries))`, com fallback para `buildMonthlyDataset(parsedData)` quando `bs_dados` está vazio:
```ts
const fullDataset = useMemo(() => {
  const bs = buildBSDados(parsedData ?? null, entries);
  if (bs.length) return bsDadosToMonthlyDataset(bs);
  return buildMonthlyDataset(parsedData ?? null);
}, [parsedData, entries]);
```
Campos de `BSDadosRow` mapeados para os campos de série usados nos 6 gráficos: `ativo_circulante`/`passivo_circulante` → liquidez; `receita_liquida`/`resultado_liquido` → gráficos 1-3; `divida_tributaria`/`divida_trabalhista`/`divida_financeira`/`fornecedores`/`credores_rj`/`outras_obrigacoes` → gráfico 6; `ebitda`/`ebitdaStatus` → gráfico 4.

## 15. Janela de período (`WindowSelector`)
`windowSize` (`Window`, valor default `"ALL"`) filtra `fullDataset` via `applyWindow(fullDataset, windowSize)` antes de `buildSeries`, permitindo restringir a exibição a últimos N meses sem afetar o cálculo dos insights (que usam `fullDataset` completo, não a janela filtrada) — isso é intencional: os insights automáticos sempre avaliam a série completa disponível, independentemente do zoom visual escolhido pelo usuário.

## 16. Parser fixo de abas do template Excel (`balanceteChartsParser.ts`)
Usado quando o usuário envia o arquivo `.xlsm`/`.xlsx` no template oficial BEx (não um balancete genérico). **Indexação por posição, nunca por nome de coluna** — regra crítica documentada no cabeçalho do arquivo:
```
* Regras críticas (ver MD seção 5 e 7):
*   - Indexação por POSIÇÃO, não por nome.
*   - NÃO reordenar, NÃO inferir, NÃO normalizar valores.
*   - Datas normalizadas para "Mmm/AA" pt-BR.
*   - Valores nulos / #N/A → null (mantemos os pontos para Recharts).
```
### 16.1 Aba "Dados para Graficos" (Balanço)
Layout fixo: linha 3 (índice 2) = header de meses, colunas D..O (índices 3..14); linhas 4..13 (índices 3..12) = categorias na coluna C (índice 2), valores nas mesmas colunas de meses. Série só é incluída se tiver ao menos 1 valor numérico (`valores.some(v => v !== null)`).

### 16.2 Aba "Folha"
Header de meses na linha 2 (índice 1), em colunas alternadas (`c += 2`, ex. B, D, F...). Linha 3 (índice 2) = nº de funcionários; linha 11 (índice 10) = folha de pagamento; linha 12 (índice 11) = contratados PJ.

### 16.3 Aba "FCP - 6 meses" (Fluxo de Caixa Parcial)
Linha 2 (índice 1) = "SALDO ACUMULADO", valores em colunas F..L (índices 5..11); linha 6 (índice 5) = header de meses nessas mesmas colunas; linha 21 (índice 20) = `TOTAL_ANO` → fluxo mensal. Resultado: `{ meses, saldoAcumulado, fluxoMensal }` — nomeado explicitamente "Fluxo de Caixa Parcial" (6 meses), tratado como série **intrinsecamente parcial** — nunca deve ser extrapolado/preenchido para 12 meses.

### 16.4 Aba "Fluxo de Caixa - Prev x Realiz"
Linha 3 (índice 2) = meses, cada mês ocupando 2 colunas (Previsto/Realizado, `c += 2`); linhas fixas: 5 (Operacional Entradas), 6 (Não Operacional Entradas), 10 (Operacional Saídas), 11 (Não Operacional Saídas). Cada categoria só é incluída no resultado se houver ao menos 1 valor numérico em previsto OU realizado (`opEnt.previsto.some(isNum) || opEnt.realizado.some(isNum)`).

### 16.5 Fallback — derivação a partir de dados extraídos por IA
Quando o arquivo não é o template fixo (PDF, CSV, balancete genérico), `deriveChartsFromParsedData` reconstrói uma série mínima de "Balanço — Evolução Mensal" usando `ACCOUNT_PATTERNS` (regex sobre descrição/código de conta): Caixa e Equivalentes, Estoque, Clientes a Receber, Ativo Circulante, Ativo Total, Fornecedores, Passivo Circulante, Patrimônio Líquido. Apenas a **primeira conta que casar** cada padrão é usada (`find`, não `filter`) — evitando duplicidade de séries por múltiplas contas análogas.

`resolveBalanceteCharts(files, parsed)` tenta primeiro o template fixo (`parseBalanceteChartsFromFiles`); se `hasData` for `false`, cai no fallback (`deriveChartsFromParsedData`).

## 17. Checklist de Implementação
- [ ] Paleta `EXCEL_COLORS` replicada com os 9 códigos hex exatos.
- [ ] `fmtMilhar`/`fmtPct`/`fmtDec` com sentinelas `#N/D`/`—` (nunca `0`/`NaN`) e vírgula decimal pt-BR.
- [ ] `AXIS_PROPS`/`GRID`/`TOOLTIP_STYLE` usando tokens `hsl(var(--foreground))`/`hsl(var(--background))`.
- [ ] 6 gráficos com `dataKey`, `name`, `fill`/`stroke`, `stackId` idênticos aos listados em §7-§12.
- [ ] Campos derivados de receita `null` (não `0`) quando `hasReceita === false`.
- [ ] EBITDA com `connectNulls={false}` e gate de status `CERTIFIED`/`AVAILABLE`.
- [ ] Índices de liquidez arredondados a 2 casas decimais antes de plotar.
- [ ] Ordem de empilhamento do gráfico de endividamento preservada (tributária→trabalhista→financeira→fornecedores→credores RJ→outras).
- [ ] Parser de abas fixas com indexação por posição (nunca por nome de coluna).
- [ ] Fallback via `ACCOUNT_PATTERNS` usando `find` (primeira conta), não `filter`.

## 18. Critérios de Homologação
1. **Séries parciais não distorcem visualmente**: para um mês sem DRE, o gráfico de Receita/CMV/Resultado deve mostrar gap (linha quebrada/barra ausente), nunca uma barra em zero.
2. **Formatação 0.00**: todo tooltip de índice de liquidez deve exibir exatamente 2 casas decimais com vírgula (`1,23`, nunca `1.23` ou `1.2`).
3. **Paridade de cores**: comparar pixel a pixel (ou via inspeção de `fill`/`stroke` computado) que cada série usa a cor exata de `EXCEL_COLORS` especificada.
4. **Fluxo de caixa parcial rotulado como parcial**: a aba "FCP - 6 meses" nunca deve ser exibida como se cobrisse 12 meses.
5. **Fallback correto**: ao subir um PDF genérico (fora do template `.xlsm`), o gráfico de Balanço deve aparecer com as séries derivadas via `ACCOUNT_PATTERNS`, sem erro.
6. **Indexação posicional**: alterar o nome de uma coluna no Excel (mantendo a posição) não deve quebrar o parser fixo — apenas alterar a posição deve.
