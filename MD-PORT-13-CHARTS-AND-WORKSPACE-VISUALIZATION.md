# MD-PORT-13 — Charts & Workspace Visualization

> Escopo: excertos reais de JSX/config de `src/components/audit/AuditCharts.tsx`,
> `AuditChartsBex.tsx`, `KanitzThermometer.tsx` e `src/services/auditChartsOptions.ts`,
> incluindo domínios de eixo, tick formatters, tratamento de séries parciais e a tabela
> completa de mapeamento `bs_dados` → série de cada gráfico.

---

## 1. Paleta e formatters — `src/services/auditChartsOptions.ts` (arquivo completo, 70 linhas)

```ts
export const EXCEL_COLORS = {
  azul: "#4F81BD", laranja: "#F79646", vermelho: "#C00000", verde: "#9BBB59",
  roxo: "#8064A2", cinza: "#D9D9D9", cinzaEscuro: "#7F7F7F", ciano: "#4BACC6", amarelo: "#F2C200",
};

export const fmtMilhar = (v: number | null | undefined): string => {
  if (v === null || v === undefined || !Number.isFinite(v)) return "#N/D";
  const n = Math.round(v as number);
  const s = new Intl.NumberFormat("pt-BR").format(Math.abs(n));
  return n < 0 ? `(${s})` : s;
};
export const fmtPct = (v: number | null | undefined, dec = 2): string => {
  if (v === null || v === undefined || !Number.isFinite(v)) return "#N/D";
  return `${(v as number).toFixed(dec).replace(".", ",")}%`;
};
export const fmtDec = (v: number | null | undefined, dec = 2): string => {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  return (v as number).toFixed(dec).replace(".", ",");
};

export interface ChartInsight { tipo: "critico" | "atencao" | "info"; texto: string }

export function generateInsights(data: MonthlyDatum[]): ChartInsight[] {
  if (!data.length) return [];
  const insights: ChartInsight[] = [];
  const last = data[data.length - 1];
  const ind = computeIndicators(last);
  if (ind.cmvPct !== null && ind.cmvPct > 0.8) insights.push({ tipo: "critico", texto: `CMV elevado (${fmtPct(ind.cmvPct * 100)}) — risco operacional` });
  if (ind.cmvDespPct !== null && ind.cmvDespPct > 1) insights.push({ tipo: "critico", texto: `CMV+Despesa supera receita (${fmtPct(ind.cmvDespPct * 100)}) — operação inviável` });
  if (ind.margemResultado !== null && ind.margemResultado < 0) insights.push({ tipo: "critico", texto: `Resultado negativo (${fmtPct(ind.margemResultado * 100)})` });
  if (ind.liquidez_corrente !== null && ind.liquidez_corrente < 1) insights.push({ tipo: "critico", texto: `Liquidez corrente baixa (${fmtDec(ind.liquidez_corrente)}) — risco financeiro` });
  if (last.ebitda < 0) insights.push({ tipo: "atencao", texto: `EBITDA negativo (${fmtMilhar(last.ebitda)})` });
  if (data.length >= 2) {
    const first = data[0];
    if (first.divida_total > 0 && last.divida_total > first.divida_total * 1.05) {
      const delta = ((last.divida_total - first.divida_total) / first.divida_total) * 100;
      insights.push({ tipo: "atencao", texto: `Endividamento cresceu ${fmtPct(delta, 1)} no período` });
    }
  }
  if (!insights.length) insights.push({ tipo: "info", texto: "Indicadores dentro de faixas operacionais aceitáveis." });
  return insights;
}
```

`fmtMilhar` reproduz notação contábil brasileira (negativos entre parênteses, sem sinal de
menos), e `#N/D` é o placeholder de "não disponível" quando o valor é `null`/`NaN` — usado
sempre que uma série tem ponto de dado parcial (ver seção 4).

---

## 2. `AuditCharts.tsx` — Dashboard Executivo (6 gráficos Recharts)

### 2.1 Estilos compartilhados (constantes reais)

```tsx
const AXIS_PROPS = {
  tick: { fontSize: 12, fill: "hsl(var(--foreground))", fontFamily: "Segoe UI, Arial, sans-serif", fontWeight: 500 },
  stroke: "hsl(var(--foreground) / 0.35)",
  tickLine: { stroke: "hsl(var(--foreground) / 0.35)" },
};
const GRID = <CartesianGrid stroke="hsl(var(--foreground) / 0.18)" strokeDasharray="3 3" vertical={false} />;
const TOOLTIP_STYLE = {
  contentStyle: {
    backgroundColor: "hsl(var(--background))", border: "1px solid hsl(var(--foreground) / 0.25)",
    fontSize: 12, fontFamily: "Segoe UI, Arial, sans-serif", color: "hsl(var(--foreground))",
    borderRadius: 6, boxShadow: "0 4px 12px hsl(var(--foreground) / 0.15)",
  },
  labelStyle: { color: "hsl(var(--foreground))", fontWeight: 600 },
  itemStyle: { color: "hsl(var(--foreground))" },
  cursor: { fill: "hsl(var(--foreground) / 0.06)" },
};
```

Cada `ChartTile` renderiza `height: 320` fixo dentro de `ResponsiveContainer` com
`minHeight={320}` — garante paridade visual em telas e no export PDF (o `html2canvas`
depende de altura estável).

### 2.2 Construção da série `buildSeries(data: MonthlyDatum[])`

```tsx
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

### 2.3 Gráfico 1 — CMV / RECEITA LÍQUIDA (JSX real)

```tsx
<ChartTile title="CMV / RECEITA LÍQUIDA" subtitle="(R$ x 1000)">
  <ComposedChart data={series} margin={{ top: 10, right: 20, bottom: 30, left: 10 }}>
    {GRID}
    <XAxis dataKey="mes" {...AXIS_PROPS} />
    <YAxis yAxisId="left" {...AXIS_PROPS} tickFormatter={tooltipMilhar} />
    <YAxis yAxisId="right" orientation="right" {...AXIS_PROPS} domain={[-100, 100]} tickFormatter={(v) => `${v}%`} />
    <Tooltip {...TOOLTIP_STYLE} formatter={(v: any, n: string) => [n.includes("%") ? tooltipPct(v) : tooltipMilhar(v), n]} />
    <Legend wrapperStyle={{ fontSize: 12, fontWeight: 500 }} />
    <Bar yAxisId="left" dataKey="receita" name="Receita Líquida" fill={EXCEL_COLORS.azul} />
    <Bar yAxisId="left" dataKey="cmv" name="CMV" fill={EXCEL_COLORS.laranja} />
    <Line yAxisId="right" type="monotone" dataKey="cmvPct" name="CMV / Receita (%)" stroke={EXCEL_COLORS.vermelho} strokeWidth={3} dot={{ r: 5, strokeWidth: 2 }} />
  </ComposedChart>
</ChartTile>
```

Domínio do eixo direito **fixo em `[-100, 100]`** — o único gráfico com `domain` explícito
entre os 6; os demais usam auto-scale do Recharts (`domain` implícito `['auto','auto']`).

### 2.4 Gráfico 2 — CMV + DESPESA × RECEITA (com `ReferenceLine` de limite)

```tsx
<ChartTile title="CMV + DESPESA × RECEITA LÍQUIDA" subtitle="(R$ x 1000)">
  <ComposedChart data={series} margin={{ top: 10, right: 20, bottom: 30, left: 10 }}>
    {GRID}
    <XAxis dataKey="mes" {...AXIS_PROPS} />
    <YAxis yAxisId="left" {...AXIS_PROPS} tickFormatter={tooltipMilhar} />
    <YAxis yAxisId="right" orientation="right" {...AXIS_PROPS} tickFormatter={(v) => `${v}%`} />
    <Tooltip {...TOOLTIP_STYLE} formatter={(v: any, n: string) => [n.includes("%") ? tooltipPct(v) : tooltipMilhar(v), n]} />
    <Legend wrapperStyle={{ fontSize: 12, fontWeight: 500 }} />
    <Bar yAxisId="left" dataKey="receita" name="Receita Líquida" fill={EXCEL_COLORS.azul} />
    <Bar yAxisId="left" dataKey="cmvDesp" name="CMV + Despesa" fill={EXCEL_COLORS.vermelho} />
    <Line yAxisId="right" type="monotone" dataKey="cmvDespPct" name="CMV+Desp / Receita (%)" stroke={EXCEL_COLORS.vermelho} strokeWidth={3} dot={{ r: 5, strokeWidth: 2 }} />
    <ReferenceLine yAxisId="right" y={100} stroke={EXCEL_COLORS.vermelho} strokeDasharray="4 4" label={{ value: "100% (limite)", fontSize: 10, fill: EXCEL_COLORS.vermelho }} />
  </ComposedChart>
</ChartTile>
```

### 2.5 Gráfico 4 — EBITDA (série parcial com `connectNulls={false}`)

```tsx
<ChartTile title="EBITDA" subtitle="(R$ Monetário)">
  <LineChart data={series} margin={{ top: 10, right: 20, bottom: 30, left: 10 }}>
    {GRID}
    <XAxis dataKey="mes" {...AXIS_PROPS} />
    <YAxis {...AXIS_PROPS} tickFormatter={tooltipMilhar} />
    <Tooltip {...TOOLTIP_STYLE} formatter={(v: any) => [tooltipMilhar(v), "EBITDA"]} />
    <Legend wrapperStyle={{ fontSize: 12, fontWeight: 500 }} />
    <ReferenceLine y={0} stroke="hsl(var(--foreground))" strokeWidth={2} />
    <Line type="monotone" dataKey="ebitda" name="EBITDA" stroke={EXCEL_COLORS.ciano} strokeWidth={3} dot={{ r: 5, fill: EXCEL_COLORS.ciano }} connectNulls={false} />
  </LineChart>
</ChartTile>
```

`connectNulls={false}` é a única ocorrência explícita no arquivo — os demais `Line`
usam o default (`connectNulls` ausente = `false` no Recharts), mas EBITDA é o único
sinalizado propositalmente porque `d.ebitda` pode ser `null` quando `ebitdaStatus` não é
`CERTIFIED`/`AVAILABLE` (ver seção 4).

### 2.6 Gráfico 6 — ENDIVIDAMENTO (stacked bars + linha total, dois eixos)

```tsx
<ChartTile title="EVOLUÇÃO DO ENDIVIDAMENTO" subtitle="(Em milhares de reais)">
  <ComposedChart data={series} margin={{ top: 10, right: 20, bottom: 30, left: 10 }}>
    {GRID}
    <XAxis dataKey="mes" {...AXIS_PROPS} />
    <YAxis yAxisId="left" {...AXIS_PROPS} tickFormatter={tooltipMilhar} />
    <YAxis yAxisId="right" orientation="right" {...AXIS_PROPS} tickFormatter={tooltipMilhar} stroke={EXCEL_COLORS.vermelho} />
    <Tooltip {...TOOLTIP_STYLE} formatter={(v: any, n: string) => [tooltipMilhar(v), n]} />
    <Legend wrapperStyle={{ fontSize: 12, fontWeight: 500 }} />
    <Bar yAxisId="left" dataKey="divida_tributaria" name="OBRIG. TRIBUTÁRIAS" stackId="div" fill={EXCEL_COLORS.azul} />
    <Bar yAxisId="left" dataKey="divida_trabalhista" name="OBRIG. TRABALHISTAS" stackId="div" fill={EXCEL_COLORS.laranja} />
    <Bar yAxisId="left" dataKey="divida_financeira" name="EMPR. E FINANCIAMENTOS" stackId="div" fill={EXCEL_COLORS.cinzaEscuro} />
    <Bar yAxisId="left" dataKey="fornecedores" name="FORNECEDORES" stackId="div" fill={EXCEL_COLORS.verde} />
    <Bar yAxisId="left" dataKey="credores_rj" name="CREDORES RJ" stackId="div" fill={EXCEL_COLORS.amarelo} />
    <Bar yAxisId="left" dataKey="outras_obrigacoes" name="OUTRAS OBRIGAÇÕES" stackId="div" fill={EXCEL_COLORS.vermelho} />
    <Line yAxisId="right" type="monotone" dataKey="divida_total" name="TOTAL" stroke={EXCEL_COLORS.vermelho} strokeWidth={3} dot={{ r: 5, fill: EXCEL_COLORS.vermelho }} />
  </ComposedChart>
</ChartTile>
```

Nota: `divida_financeira` **exclui leasing/arrendamento explicitamente classificados como
"AA"/"QQ" via `classifyPCByDescription`/`classifyPNCByDescription`** apenas quando a
descrição bate no regex `emprestim|financiament|instituic[oõ]es?\s+financ|deb[eê]ntures?
|leasing|arrendament` — ou seja, leasing **é incluído** no bucket AA/QQ (dívida financeira),
contrariando um cenário negativo típico de teste (ver MD-PORT-15, seção de casos negativos,
onde se verifica que leasing corretamente participa da dívida onerosa e não é
indevidamente somado a "fornecedores").

---

## 3. `AuditChartsBex.tsx` — 12 gráficos (réplica da aba "GRÁFICOS (2)")

### 3.1 `buildSeries` — conversões e proteção `safeDiv`

```tsx
const safeDiv = (n: number, d: number) => (d && Number.isFinite(n / d) ? n / d : 0);

function buildSeries(data: MonthlyDatum[]) {
  return data.map((d) => {
    const ac = Math.abs(d.ativo_circulante || 0);
    const anc = Math.abs(d.ativo_nao_circulante || 0);
    const pc = Math.abs(d.passivo_circulante || 0);
    const pnc = Math.abs(d.passivo_nao_circulante || 0);
    const pt = pc + pnc;
    const at = ac + anc;
    const pl = (d.patrimonio_liquido ?? (at - pt)) || 0;
    const imob = Math.abs(d.imobilizado ?? 0);
    const intg = Math.abs(d.intangivel ?? 0);
    const imobInt = imob + intg > 0 ? imob + intg : anc;
    const empr = Math.abs(d.divida_financeira || 0);
    const receita = Math.abs(d.receita_liquida || 0);
    const custoDesp = Math.abs(d.cmv || 0) + Math.abs(d.despesas || 0);
    const resultado = d.resultado || 0;
    return {
      mes: d.mes,
      pcK: Math.round(pc / 1000), pncK: Math.round(pnc / 1000), ptK: Math.round(pt / 1000),
      emprK: Math.round(empr / 1000), imobK: Math.round(imob / 1000), intgK: Math.round(intg / 1000),
      imobIntK: Math.round(imobInt / 1000), receitaK: Math.round(receita / 1000),
      custoDespK: Math.round(custoDesp / 1000), resultadoK: Math.round(resultado / 1000),
      receitaMedK: Math.round(receita / 12 / 1000), custoDespMedK: Math.round(custoDesp / 12 / 1000),
      liqGeral: +safeDiv(ac + anc, pt).toFixed(2),
      liqCorrente: +safeDiv(ac, pc).toFixed(2),
      endivGeral: +safeDiv(pt, at).toFixed(4),
      imobIntSobrePLPnc: +safeDiv(imobInt, pl + pnc).toFixed(4),
      custoSobreReceita: +safeDiv(custoDesp, receita).toFixed(4),
      resultadoSobreReceita: +safeDiv(resultado, receita).toFixed(4),
    };
  });
}
```

`safeDiv` sempre retorna `0` (não `null`) em divisão por zero — diferente de `AuditCharts.tsx`
que usa `null` para indicar "sem dado". Isso é intencional: nos 12 gráficos BEX, ausência de
denominador (ex.: PC = 0 em empresa sem passivo circulante) é tratada como "0 índice" plotável,
mantendo a linha contínua, enquanto no dashboard executivo `null` quebra a linha
(`connectNulls={false}`) para sinalizar explicitamente "dado indisponível".

### 3.2 Exemplo de tick formatter percentual customizado (não usa `fmtPct`)

```tsx
const tPctRatio = (v: any) => `${(Number(v) * 100).toFixed(1)}%`;
```

Usado nos gráficos de razão (Imob+Intang/(PL+PNC), Endividamento Geral, Custo+Despesa/Receita)
— note que a série já armazena a **razão decimal** (ex.: `0.4523`), e o formatter multiplica
por 100 no momento de exibição, diferente de `AuditCharts.tsx` onde a série já vem multiplicada
(`+(ind.cmvPct * 100).toFixed(2)`).

### 3.3 Gráfico 7 — ENDIVIDAMENTO GERAL com `ReferenceLine` em 100%

```tsx
<Tile title="ENDIVIDAMENTO GERAL" subtitle="(PC + PNC) / Ativo Total">
  <LineChart data={series} margin={{ top: 10, right: 20, bottom: 30, left: 10 }}>
    {GRID}
    <XAxis dataKey="mes" {...AXIS_PROPS} />
    <YAxis {...AXIS_PROPS} tickFormatter={tPctRatio} />
    <Tooltip {...TOOLTIP_STYLE} formatter={(v: any) => [tPctRatio(v), "Endividamento Geral"]} />
    <Legend wrapperStyle={{ fontSize: 12, fontWeight: 500 }} />
    <ReferenceLine y={1} stroke={EXCEL_COLORS.vermelho} strokeDasharray="4 4" label={{ value: "100%", fontSize: 10, fill: EXCEL_COLORS.vermelho }} />
    <Line type="monotone" dataKey="endivGeral" name="ENDIVIDAMENTO GERAL" stroke={EXCEL_COLORS.vermelho} strokeWidth={3} dot={{ r: 5, strokeWidth: 2 }} />
  </LineChart>
</Tile>
```

Note que `y={1}` (não `y={100}`) porque a série `endivGeral` é razão decimal — consistente
com `tPctRatio`.

---

## 4. `KanitzThermometer.tsx` — visualização não-Recharts (SVG/CSS manual)

Não usa Recharts; é um componente custom com bandas de cor por `absolute`/`top`/`height` em %:

```tsx
const yFor = (v: number) => ((7 - v) / 14) * 100;
const bands = [
  { top: yFor(7), bottom: yFor(0), color: "hsl(140, 65%, 45%)", label: "SOLVENTE" },
  { top: yFor(0), bottom: yFor(-3), color: "hsl(0, 0%, 78%)", label: "PENUMBRA" },
  { top: yFor(-3), bottom: yFor(-7), color: "hsl(0, 75%, 52%)", label: "INSOLVENTE" },
];
const clamped = Math.max(-7, Math.min(7, fi));
const needleY = yFor(clamped);
```

Escala fixa `[-7, +7]` — valores fora do intervalo são **clampados apenas para
posicionamento visual da agulha**, mas o número exibido (`fi.toFixed(2)`) mostra o valor real
não-clampado. Cor do valor numérico central:

```tsx
color: fi > 0 ? "hsl(140, 65%, 38%)" : fi >= -3 ? "hsl(40, 90%, 40%)" : "hsl(0, 75%, 50%)"
```

---

## 5. Tabela de mapeamento `bs_dados` → série de cada gráfico

### 5.1 AuditCharts.tsx (Dashboard Executivo — 6 gráficos)

| Gráfico | Campo(s) `bs_dados` / `MonthlyDatum` | Série Recharts | Tratamento de série parcial |
|---|---|---|---|
| 1. CMV/Receita | `receita_liquida`, `cmv` | `receita`, `cmv` (÷1000), `cmvPct` (linha, eixo direito) | `null` se `!d.hasReceita` |
| 2. CMV+Despesa/Receita | `receita_liquida`, `cmv`, `despesas` | `receita`, `cmvDesp = |cmv|+|despesas|` (÷1000), `cmvDespPct` | `null` se `!d.hasReceita`; `ReferenceLine y=100` |
| 3. Resultado/Receita | `receita_liquida`, `resultado` | `receita`, `resultado` (÷1000), `margemPct` | `null` se `!d.hasReceita` |
| 4. EBITDA | `resultado` + despesas financeiras + depreciação/amortização + tributos (`ebitda`, `ebitdaStatus`) | `ebitda` | `null` salvo se `ebitdaStatus ∈ {CERTIFIED, AVAILABLE}`; `connectNulls={false}` |
| 5. Liquidez | `ativo_circulante`, `passivo_circulante`, `estoques`, `disponivel`, `ativo_nao_circulante`, `passivo_nao_circulante` | `liquidez_imediata`, `liquidez_corrente`, `liquidez_seca`, `liquidez_geral` | `null` quando `computeIndicators` retorna `null` (denominador zero/ausente) |
| 6. Endividamento | `divida_tributaria`, `divida_trabalhista`, `divida_financeira`, `fornecedores`, `credores_rj`, `outras_obrigacoes`, `divida_total` | 6 barras empilhadas (`stackId="div"`) + linha `divida_total` | `Math.round(Number(d.x || 0))` — nunca `null`, zera se ausente |

### 5.2 AuditChartsBex.tsx (12 gráficos — padrão BEX legado)

| # | Gráfico | Campo(s) `bs_dados` | Série | Fórmula |
|---|---|---|---|---|
| 1 | Liquidez Geral | `ativo_circulante`, `ativo_nao_circulante`, `passivo_circulante`, `passivo_nao_circulante` | `liqGeral` | `(AC+ANC)/(PC+PNC)` |
| 2 | Liquidez Corrente e Geral | idem + | `liqGeral`, `liqCorrente` | `liqCorrente = AC/PC` |
| 3 | Evolução do Passivo | `passivo_circulante`, `passivo_nao_circulante` | `pcK`, `pncK` (stack) | valores absolutos ÷1000 |
| 4 | Empréstimos e Financiamentos | `divida_financeira` | `emprK` | `|divida_financeira|` ÷1000 |
| 5 | Imob+Intang / (PL+PNC) | `imobilizado`, `intangivel` (fallback `ativo_nao_circulante`), `patrimonio_liquido`, `passivo_nao_circulante` | `imobIntSobrePLPnc` | `(imob+intang)/(PL+PNC)` |
| 6 | Imobilizado e Intangível | `imobilizado`, `intangivel` | `imobIntK` | soma absoluta ÷1000 |
| 7 | Endividamento Geral | `passivo_circulante`, `passivo_nao_circulante`, `ativo_circulante`, `ativo_nao_circulante` | `endivGeral` | `(PC+PNC)/(AC+ANC)` |
| 8 | Resultado/Receita | `resultado`, `receita_liquida` | `resultadoSobreReceita` | `resultado/receita` |
| 9 | Custo+Despesa/Receita (%) | `cmv`, `despesas`, `receita_liquida` | `custoSobreReceita` | `(|cmv|+|despesas|)/receita` |
| 10 | Custo/Despesa × Receita (acumulado) | `receita_liquida`, `cmv`, `despesas` | `receitaK`, `custoDespK` | valores absolutos ÷1000 |
| 11 | Custo/Despesa × Receita (média mensal) | idem ÷12 | `receitaMedK`, `custoDespMedK` | `valor/12` ÷1000 |
| 12 | Resultado × Receita (valor + %) | `resultado`, `receita_liquida` | `receitaK`, `resultadoK`, `resultadoSobreReceita` | combina barras + linha em 2 eixos |

### 5.3 `KanitzThermometer` (não-Recharts)

| Elemento visual | Campo de origem | Observação |
|---|---|---|
| Posição da agulha (`needleY`) | `kanitz.score` calculado por `kanitzCalculator` a partir de `bs_dados` (via `indicadores`/`kanitz_scores`) | Clampado a `[-7,7]` apenas visualmente |
| Cor/label da faixa | Faixas fixas de `fi`: `>0` solvente, `0..-3` penumbra, `<-3` insolvente | Constante no componente, não vem do banco |
| Texto `fi.toFixed(2)` | `kanitz.score` bruto (não clampado) | Fonte: tabela `kanitz_scores` |

---

## 6. Tratamento geral de séries parciais (padrão do módulo de gráficos)

1. **Ausência de receita no mês** (`d.hasReceita === false`) → todos os campos derivados de
   receita (`receita`, `cmv`, `cmvDesp`, `resultado`, `cmvPct`, `cmvDespPct`, `margemPct`) viram
   `null` em `AuditCharts.tsx`, fazendo a linha/barra "sumir" naquele ponto do eixo X, mas o mês
   continua aparecendo no eixo (não é removido do array `series`).
2. **EBITDA não certificado** (`ebitdaStatus !== "CERTIFIED" && ebitdaStatus !== "AVAILABLE"`)
   → `null` + `connectNulls={false}` quebra visualmente a linha, deixando claro que aquele mês
   não tem EBITDA confiável (ao invés de interpolar/mascarar).
3. **Indicadores de liquidez sem denominador** (`computeIndicators` retorna `null` quando
   `PC === 0` ou dado ausente) → ponto `null`, linha interrompida (Recharts default
   `connectNulls=false` quando omitido).
4. **`AuditChartsBex.tsx` nunca usa `null`** — todas as razões usam `safeDiv` que retorna `0`
   em caso de indeterminação, priorizando continuidade visual sobre a explicitação de dado
   ausente (trade-off consciente da réplica do padrão Excel legado, que também zera células
   `#DIV/0!` visualmente em muitos templates).
5. **Empty state completo**: quando `dataset.length === 0` (nenhum mês consolidado em
   `bs_dados`), ambos os componentes renderizam o componente `Empty`/`Tile` com mensagem
   "Não existem dados no Balancete para gerar o gráfico" — nunca um gráfico vazio silencioso.
6. **`WindowSelector`/`applyWindow`**: em `AuditCharts.tsx`, o usuário pode restringir a janela
   de meses exibidos (`windowSize: Window`), mas `fullDataset` (todos os meses) é sempre
   preservado para `SanityDiagnostico` e `MonthsConsistencyAlert`, que recebem
   `datasetMesKeys={fullDataset.map(d => d.mesKey)}` — a janela nunca afeta os alertas de
   consistência de meses, apenas a renderização dos 6 gráficos.
