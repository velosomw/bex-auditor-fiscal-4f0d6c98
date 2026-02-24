import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Calculator, TrendingUp, TrendingDown, AlertTriangle, Shield, BarChart3, Activity, PieChart, ArrowRight, Info } from "lucide-react";
import { defaultEntityData, defaultFinancialAnalysis } from "@/data/auditMockData";
import PlatformLayout from "@/components/PlatformLayout";

const fmt = (v: number, dec = 2) => v.toLocaleString("pt-BR", { minimumFractionDigits: dec, maximumFractionDigits: dec });
const fmtPct = (v: number) => fmt(v * 100) + "%";
const fmtMoney = (v: number) => "R$ " + (v / 1_000_000).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + " mi";

type RiskLevel = "Saudável" | "Moderado" | "Alto" | "Crítico";

function getRiskBadge(level: RiskLevel) {
  const colors: Record<RiskLevel, string> = {
    Saudável: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
    Moderado: "bg-amber-500/10 text-amber-600 border-amber-500/20",
    Alto: "bg-orange-500/10 text-orange-600 border-orange-500/20",
    Crítico: "bg-red-500/10 text-red-600 border-red-500/20",
  };
  return <Badge variant="outline" className={colors[level]}>{level}</Badge>;
}

function interpretLC(v: number): { text: string; risk: RiskLevel } {
  if (v >= 1.5) return { text: "Confortável", risk: "Saudável" };
  if (v >= 1.0) return { text: "Atenção", risk: "Moderado" };
  return { text: "Risco de curto prazo", risk: "Crítico" };
}

function interpretEG(v: number): { text: string; risk: RiskLevel } {
  if (v > 0.85) return { text: "Risco estrutural crítico", risk: "Crítico" };
  if (v > 0.80) return { text: "Alto risco estrutural", risk: "Alto" };
  if (v > 0.60) return { text: "Moderado", risk: "Moderado" };
  return { text: "Saudável", risk: "Saudável" };
}

const FormulaBlock = ({ formula, description }: { formula: string; description?: string }) => (
  <div className="bg-muted/60 border border-border/50 rounded-lg p-4 font-mono text-sm">
    <div className="text-foreground whitespace-pre-wrap">{formula}</div>
    {description && <p className="text-xs text-muted-foreground mt-2 font-sans">{description}</p>}
  </div>
);

const SectionTitle = ({ icon: Icon, title, subtitle }: { icon: any; title: string; subtitle?: string }) => (
  <div className="flex items-center gap-3 mb-4">
    <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
      <Icon className="w-5 h-5 text-primary" />
    </div>
    <div>
      <h3 className="text-lg font-bold text-foreground">{title}</h3>
      {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
    </div>
  </div>
);

const ModeloMatematico = () => {
  const [selectedYear, setSelectedYear] = useState("2023");
  const years = Object.keys(defaultEntityData).sort();
  const d = defaultEntityData[selectedYear];
  const ind = defaultFinancialAnalysis.indicators[selectedYear];

  const at = d.ativoCirculante + d.ativoNaoCirculante;
  const pt = d.passivoCirculante + d.passivoNaoCirculante;

  // AH calculations (base = first year)
  const baseYear = years[0];
  const dBase = defaultEntityData[baseYear];
  const atBase = dBase.ativoCirculante + dBase.ativoNaoCirculante;
  const ptBase = dBase.passivoCirculante + dBase.passivoNaoCirculante;

  const ahItems = [
    { label: "Receita Líquida", base: dBase.receitaLiquida, current: d.receitaLiquida },
    { label: "Lucro Líquido", base: dBase.lucroLiquido, current: d.lucroLiquido },
    { label: "Ativo Total", base: atBase, current: at },
    { label: "Passivo Total", base: ptBase, current: pt },
    { label: "Patrimônio Líquido", base: dBase.patrimonioLiquido, current: d.patrimonioLiquido },
  ].map((i) => ({ ...i, variation: i.base ? (i.current - i.base) / i.base : 0 }));

  // AV calculations
  const avBalanco = [
    { label: "Ativo Circulante", value: d.ativoCirculante },
    { label: "Ativo Não Circulante", value: d.ativoNaoCirculante },
    { label: "Passivo Circulante", value: d.passivoCirculante },
    { label: "Passivo Não Circulante", value: d.passivoNaoCirculante },
    { label: "Patrimônio Líquido", value: d.patrimonioLiquido },
  ].map((i) => ({ ...i, pct: at ? i.value / at : 0 }));

  const avDre = [
    { label: "CMV", value: d.custoMercadoriasVendidas },
    { label: "Resultado Operacional", value: d.resultadoOperacional },
    { label: "Lucro Líquido", value: d.lucroLiquido },
  ].map((i) => ({ ...i, pct: d.receitaLiquida ? i.value / d.receitaLiquida : 0 }));

  // Insolvency
  const lg = ind.liquidezGeral;
  const roa = ind.roa;
  const eg = ind.endividamentoGeral;
  const insolvencyScore = lg * 0.4 + roa * 0.3 - eg * 0.3;
  const insolvencyClass = insolvencyScore < 0 ? "Insolvência" : insolvencyScore <= 1 ? "Atenção" : "Solidez";

  // Extended Kanitz
  const cg = d.ativoCirculante - d.passivoCirculante;
  const x1 = at ? cg / at : 0;
  const x2 = at ? d.lucroLiquido / at : 0;
  const x3 = d.patrimonioLiquido ? d.lucroLiquido / d.patrimonioLiquido : 0;
  const x4 = at ? pt / at : 0;
  const x5 = at ? d.receitaLiquida / at : 0;
  const kanitz = 0.05 * x1 + 1.65 * x2 + 3.55 * x3 - 1.06 * x4 - 0.33 * x5;

  // Solvency
  const ptAdj = pt + d.duplicatasDescontadas;
  const egAdj = at ? ptAdj / at : 0;
  const plAdj = at - ptAdj;

  // Risk matrix
  const liquidezStatus = ind.liquidezCorrente < 1 ? "Baixa" : ind.liquidezCorrente < 1.5 ? "Média" : "Alta";
  const endivStatus = eg > 0.80 ? "Alta" : eg > 0.60 ? "Média" : "Baixa";
  const rentStatus = ind.margemLiquida < 0 ? "Negativa" : ind.margemLiquida < 0.05 ? "Baixa" : "Positiva";
  let riskClassification: RiskLevel = "Saudável";
  if (liquidezStatus === "Baixa" && endivStatus === "Alta" && rentStatus === "Negativa") riskClassification = "Crítico";
  else if (endivStatus === "Alta" && rentStatus === "Baixa") riskClassification = "Alto";
  else if (endivStatus === "Média" || liquidezStatus === "Média") riskClassification = "Moderado";

  return (
    <PlatformLayout>
      <div className="max-w-[1400px] mx-auto p-4 md:p-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <Calculator className="w-6 h-6 text-primary" />
              Modelo Matemático Detalhado
            </h1>
            <p className="text-sm text-muted-foreground">Índices Financeiros — Plataforma de Auditoria IA v3.0</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Ano:</span>
            {years.map((y) => (
              <button
                key={y}
                onClick={() => setSelectedYear(y)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  selectedYear === y
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                }`}
              >
                {y}
              </button>
            ))}
          </div>
        </div>

        {/* Variables summary */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Info className="w-4 h-4 text-primary" />
              Variáveis Base — Inputs do Modelo ({selectedYear})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <h4 className="text-sm font-semibold text-foreground mb-3">Estrutura Patrimonial</h4>
                <div className="space-y-1.5 text-sm">
                  {[
                    { sym: "AC", label: "Ativo Circulante", val: d.ativoCirculante },
                    { sym: "ANC", label: "Ativo Não Circulante", val: d.ativoNaoCirculante },
                    { sym: "AT", label: "Ativo Total", val: at },
                    { sym: "PC", label: "Passivo Circulante", val: d.passivoCirculante },
                    { sym: "PNC", label: "Passivo Não Circulante", val: d.passivoNaoCirculante },
                    { sym: "PT", label: "Passivo Total", val: pt },
                    { sym: "PL", label: "Patrimônio Líquido", val: d.patrimonioLiquido },
                    { sym: "DD", label: "Duplicatas Descontadas", val: d.duplicatasDescontadas },
                  ].map((v) => (
                    <div key={v.sym} className="flex items-center justify-between py-1 px-2 rounded hover:bg-muted/50">
                      <span className="flex items-center gap-2">
                        <code className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded font-bold">{v.sym}</code>
                        <span className="text-muted-foreground">{v.label}</span>
                      </span>
                      <span className="font-medium text-foreground">{fmtMoney(v.val)}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-3">
                  <FormulaBlock formula="AT = AC + ANC    |    PT = PC + PNC    |    AT = PT + PL" />
                </div>
              </div>
              <div>
                <h4 className="text-sm font-semibold text-foreground mb-3">Resultado</h4>
                <div className="space-y-1.5 text-sm">
                  {[
                    { sym: "RL", label: "Receita Líquida", val: d.receitaLiquida },
                    { sym: "LO", label: "Lucro Operacional", val: d.resultadoOperacional },
                    { sym: "LL", label: "Lucro Líquido", val: d.lucroLiquido },
                    { sym: "CV", label: "Custo das Vendas", val: d.custoMercadoriasVendidas },
                    { sym: "DF", label: "Despesas Financeiras", val: d.despesasFinanceiras },
                  ].map((v) => (
                    <div key={v.sym} className="flex items-center justify-between py-1 px-2 rounded hover:bg-muted/50">
                      <span className="flex items-center gap-2">
                        <code className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded font-bold">{v.sym}</code>
                        <span className="text-muted-foreground">{v.label}</span>
                      </span>
                      <span className="font-medium text-foreground">{fmtMoney(v.val)}</span>
                    </div>
                  ))}
                </div>
                <h4 className="text-sm font-semibold text-foreground mt-5 mb-3">Atividade</h4>
                <div className="space-y-1.5 text-sm">
                  {[
                    { sym: "EST", label: "Estoques", val: d.estoques },
                    { sym: "CR", label: "Contas a Receber", val: d.contasReceber },
                    { sym: "FORN", label: "Fornecedores", val: d.fornecedores },
                  ].map((v) => (
                    <div key={v.sym} className="flex items-center justify-between py-1 px-2 rounded hover:bg-muted/50">
                      <span className="flex items-center gap-2">
                        <code className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded font-bold">{v.sym}</code>
                        <span className="text-muted-foreground">{v.label}</span>
                      </span>
                      <span className="font-medium text-foreground">{fmtMoney(v.val)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Tabs */}
        <Tabs defaultValue="liquidez" className="space-y-4">
          <TabsList className="bg-muted/50 flex-wrap h-auto gap-1 p-1">
            <TabsTrigger value="liquidez" className="text-xs">Liquidez</TabsTrigger>
            <TabsTrigger value="estrutura" className="text-xs">Estrutura de Capital</TabsTrigger>
            <TabsTrigger value="atividade" className="text-xs">Atividade</TabsTrigger>
            <TabsTrigger value="rentabilidade" className="text-xs">Rentabilidade</TabsTrigger>
            <TabsTrigger value="ah" className="text-xs">AH</TabsTrigger>
            <TabsTrigger value="av" className="text-xs">AV</TabsTrigger>
            <TabsTrigger value="insolvencia" className="text-xs">Insolvência</TabsTrigger>
            <TabsTrigger value="solvencia" className="text-xs">Solvência</TabsTrigger>
            <TabsTrigger value="matriz" className="text-xs">Matriz de Risco</TabsTrigger>
          </TabsList>

          {/* LIQUIDEZ */}
          <TabsContent value="liquidez" className="space-y-4">
            <SectionTitle icon={Activity} title="Indicadores de Liquidez" subtitle="Capacidade de pagamento" />
            <div className="grid md:grid-cols-2 gap-4">
              {[
                {
                  name: "Liquidez Corrente (LC)", formula: "LC = AC / PC",
                  calc: `LC = ${fmtMoney(d.ativoCirculante)} / ${fmtMoney(d.passivoCirculante)}`,
                  value: ind.liquidezCorrente,
                  interp: interpretLC(ind.liquidezCorrente),
                  rules: "≥ 1,5 → Confortável  |  1,0–1,5 → Atenção  |  < 1,0 → Risco",
                },
                {
                  name: "Liquidez Seca (LS)", formula: "LS = (AC − Estoques) / PC",
                  calc: `LS = (${fmtMoney(d.ativoCirculante)} − ${fmtMoney(d.estoques)}) / ${fmtMoney(d.passivoCirculante)}`,
                  value: ind.liquidezSeca,
                  interp: { text: ind.liquidezSeca >= 1 ? "Adequada" : "Atenção", risk: (ind.liquidezSeca >= 1 ? "Saudável" : "Moderado") as RiskLevel },
                  rules: "Remove estoques por menor liquidez imediata",
                },
                {
                  name: "Liquidez Geral (LG)", formula: "LG = (AC + ANC Realizável) / (PC + PNC)",
                  calc: `LG = ${fmt(lg, 4)}`,
                  value: lg,
                  interp: { text: lg >= 1 ? "Solvência global" : "Atenção", risk: (lg >= 1 ? "Saudável" : "Alto") as RiskLevel },
                  rules: "Avalia solvência global da empresa",
                },
                {
                  name: "Liquidez Imediata", formula: "LI = Caixa / PC",
                  calc: `LI = ${fmtMoney(d.caixaEquivalentes)} / ${fmtMoney(d.passivoCirculante)}`,
                  value: ind.liquidezImediata,
                  interp: { text: ind.liquidezImediata >= 0.3 ? "Adequada" : "Baixa", risk: (ind.liquidezImediata >= 0.3 ? "Saudável" : "Moderado") as RiskLevel },
                  rules: "Disponibilidade imediata de caixa",
                },
              ].map((item) => (
                <Card key={item.name}>
                  <CardContent className="p-5 space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-semibold text-foreground">{item.name}</h4>
                      {getRiskBadge(item.interp.risk)}
                    </div>
                    <FormulaBlock formula={item.formula} description={item.rules} />
                    <div className="bg-primary/5 rounded-lg p-3 border border-primary/10">
                      <p className="text-xs text-muted-foreground mb-1">Cálculo aplicado ({selectedYear}):</p>
                      <p className="text-sm font-mono text-foreground">{item.calc}</p>
                      <p className="text-2xl font-bold text-primary mt-2">{fmt(item.value, 4)}</p>
                      <p className="text-xs text-muted-foreground mt-1">{item.interp.text}</p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          {/* ESTRUTURA DE CAPITAL */}
          <TabsContent value="estrutura" className="space-y-4">
            <SectionTitle icon={Shield} title="Indicadores de Estrutura de Capital" subtitle="Composição de financiamento" />
            <div className="grid md:grid-cols-3 gap-4">
              {[
                {
                  name: "Endividamento Geral (EG)", formula: "EG = PT / AT",
                  calc: `EG = ${fmtMoney(pt)} / ${fmtMoney(at)}`,
                  value: eg, isPct: true,
                  interp: interpretEG(eg),
                  trigger: "EG > 0,80 → Alto risco estrutural (Gatilho IA)",
                },
                {
                  name: "Composição Endividamento (CE)", formula: "CE = PC / PT",
                  calc: `CE = ${fmtMoney(d.passivoCirculante)} / ${fmtMoney(pt)}`,
                  value: ind.composicaoEndividamento, isPct: true,
                  interp: { text: ind.composicaoEndividamento > 0.6 ? "Alta pressão de curto prazo" : "Equilibrado", risk: (ind.composicaoEndividamento > 0.6 ? "Alto" : "Saudável") as RiskLevel },
                  trigger: "Quanto maior, maior pressão de curto prazo",
                },
                {
                  name: "Imobilização do PL (IPL)", formula: "IPL = ANC / PL",
                  calc: `IPL = ${fmtMoney(d.ativoNaoCirculante)} / ${fmtMoney(d.patrimonioLiquido)}`,
                  value: ind.imobilizacaoPL, isPct: false,
                  interp: { text: ind.imobilizacaoPL > 1 ? "PL insuficiente" : "Adequado", risk: (ind.imobilizacaoPL > 1 ? "Alto" : "Saudável") as RiskLevel },
                  trigger: "IPL > 1 → PL insuficiente para financiar ativo permanente",
                },
              ].map((item) => (
                <Card key={item.name}>
                  <CardContent className="p-5 space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-semibold text-foreground">{item.name}</h4>
                      {getRiskBadge(item.interp.risk)}
                    </div>
                    <FormulaBlock formula={item.formula} description={item.trigger} />
                    <div className="bg-primary/5 rounded-lg p-3 border border-primary/10">
                      <p className="text-xs text-muted-foreground mb-1">Cálculo ({selectedYear}):</p>
                      <p className="text-sm font-mono text-foreground">{item.calc}</p>
                      <p className="text-2xl font-bold text-primary mt-2">{item.isPct ? fmtPct(item.value) : fmt(item.value, 4)}</p>
                      <p className="text-xs text-muted-foreground mt-1">{item.interp.text}</p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          {/* ATIVIDADE */}
          <TabsContent value="atividade" className="space-y-4">
            <SectionTitle icon={BarChart3} title="Indicadores de Atividade" subtitle="Eficiência operacional" />
            <div className="grid md:grid-cols-3 gap-4">
              {[
                { name: "Giro do Ativo (GA)", formula: "GA = RL / AT", value: ind.giroAtivo, unit: "x", calc: `${fmtMoney(d.receitaLiquida)} / ${fmtMoney(at)}` },
                { name: "PMR (dias)", formula: "PMR = (Clientes / RL) × 360", value: ind.pmr, unit: " dias", calc: `(${fmtMoney(d.contasReceber)} / ${fmtMoney(d.receitaLiquida)}) × 360` },
                { name: "PMP (dias)", formula: "PMP = (Fornecedores / CV) × 360", value: ind.pmp, unit: " dias", calc: `(${fmtMoney(d.fornecedores)} / ${fmtMoney(d.custoMercadoriasVendidas)}) × 360` },
                { name: "Idade Média Estoque", formula: "IME = (Estoques / CMV) × 360", value: ind.idadeMediaEstoque, unit: " dias", calc: `(${fmtMoney(d.estoques)} / ${fmtMoney(d.custoMercadoriasVendidas)}) × 360` },
                { name: "Ciclo Operacional", formula: "CO = IME + PMR", value: ind.cicloOperacional, unit: " dias", calc: `${fmt(ind.idadeMediaEstoque)} + ${fmt(ind.pmr)}` },
                { name: "Ciclo de Caixa", formula: "CC = CO − PMP", value: ind.cicloCaixa, unit: " dias", calc: `${fmt(ind.cicloOperacional)} − ${fmt(ind.pmp)}` },
              ].map((item) => (
                <Card key={item.name}>
                  <CardContent className="p-5 space-y-3">
                    <h4 className="text-sm font-semibold text-foreground">{item.name}</h4>
                    <FormulaBlock formula={item.formula} />
                    <div className="bg-primary/5 rounded-lg p-3 border border-primary/10">
                      <p className="text-xs text-muted-foreground mb-1">{item.calc}</p>
                      <p className="text-2xl font-bold text-primary">{fmt(item.value)}{item.unit}</p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          {/* RENTABILIDADE */}
          <TabsContent value="rentabilidade" className="space-y-4">
            <SectionTitle icon={TrendingUp} title="Indicadores de Rentabilidade" subtitle="Retorno e margens" />
            <div className="grid md:grid-cols-3 gap-4">
              {[
                { name: "Margem Líquida (ML)", formula: "ML = LL / RL", value: ind.margemLiquida, calc: `${fmtMoney(d.lucroLiquido)} / ${fmtMoney(d.receitaLiquida)}` },
                { name: "Margem Operacional", formula: "MO = LO / RL", value: ind.margemOperacional, calc: `${fmtMoney(d.resultadoOperacional)} / ${fmtMoney(d.receitaLiquida)}` },
                { name: "ROA (Return on Assets)", formula: "ROA = LL / AT", value: ind.roa, calc: `${fmtMoney(d.lucroLiquido)} / ${fmtMoney(at)}` },
                { name: "ROE (Return on Equity)", formula: "ROE = LL / PL", value: ind.roe, calc: `${fmtMoney(d.lucroLiquido)} / ${fmtMoney(d.patrimonioLiquido)}`, warning: d.patrimonioLiquido < 0 ? "⚠ PL < 0 → ROE inválido → risco estrutural" : undefined },
                { name: "Cobertura de Juros", formula: "CJ = LO / DF", value: ind.coberturaJuros, calc: `${fmtMoney(d.resultadoOperacional)} / ${fmtMoney(d.despesasFinanceiras)}` },
              ].map((item) => (
                <Card key={item.name}>
                  <CardContent className="p-5 space-y-3">
                    <h4 className="text-sm font-semibold text-foreground">{item.name}</h4>
                    <FormulaBlock formula={item.formula} />
                    <div className="bg-primary/5 rounded-lg p-3 border border-primary/10">
                      <p className="text-xs text-muted-foreground mb-1">{item.calc}</p>
                      <p className="text-2xl font-bold text-primary">{fmtPct(item.value)}</p>
                      {item.warning && <p className="text-xs text-destructive mt-1">{item.warning}</p>}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          {/* AH */}
          <TabsContent value="ah" className="space-y-4">
            <SectionTitle icon={TrendingUp} title="Análise Horizontal (AH)" subtitle={`Base: ${baseYear} → Atual: ${selectedYear}`} />
            <FormulaBlock formula="AH = (Valor Ano Atual − Valor Ano Base) / Valor Ano Base" description="Gatilhos: Crescimento > 30% → Expansão agressiva | Queda > 25% → Alerta estrutural" />
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Conta</TableHead>
                      <TableHead className="text-right">Base ({baseYear})</TableHead>
                      <TableHead className="text-right">Atual ({selectedYear})</TableHead>
                      <TableHead className="text-right">Variação</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {ahItems.map((i) => (
                      <TableRow key={i.label}>
                        <TableCell className="font-medium">{i.label}</TableCell>
                        <TableCell className="text-right font-mono text-sm">{fmtMoney(i.base)}</TableCell>
                        <TableCell className="text-right font-mono text-sm">{fmtMoney(i.current)}</TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          <span className={i.variation > 0 ? "text-emerald-600" : "text-destructive"}>
                            {i.variation > 0 ? "+" : ""}{fmtPct(i.variation)}
                          </span>
                        </TableCell>
                        <TableCell>
                          {Math.abs(i.variation) > 0.30 ? (
                            <Badge variant="destructive" className="text-xs">
                              <AlertTriangle className="w-3 h-3 mr-1" />
                              {i.variation > 0.30 ? "Expansão" : "Alerta"}
                            </Badge>
                          ) : Math.abs(i.variation) > 0.25 ? (
                            <Badge variant="secondary" className="text-xs">Atenção</Badge>
                          ) : (
                            <Badge variant="outline" className="text-xs">Normal</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* AV */}
          <TabsContent value="av" className="space-y-4">
            <SectionTitle icon={PieChart} title="Análise Vertical (AV)" subtitle={`Ano: ${selectedYear}`} />
            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-3">
                <FormulaBlock formula="AV (Balanço) = Conta / Ativo Total" description="Detecta concentração excessiva e mudanças estruturais" />
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm">Balanço</CardTitle></CardHeader>
                  <CardContent className="p-0">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Conta</TableHead>
                          <TableHead className="text-right">Valor</TableHead>
                          <TableHead className="text-right">% AT</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {avBalanco.map((i) => (
                          <TableRow key={i.label}>
                            <TableCell className="font-medium text-sm">{i.label}</TableCell>
                            <TableCell className="text-right font-mono text-sm">{fmtMoney(i.value)}</TableCell>
                            <TableCell className="text-right font-mono text-sm font-bold">{fmtPct(i.pct)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </div>
              <div className="space-y-3">
                <FormulaBlock formula="AV (DRE) = Conta / Receita Líquida" description="Detecta distorções e dependência de capital de terceiros" />
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm">DRE</CardTitle></CardHeader>
                  <CardContent className="p-0">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Conta</TableHead>
                          <TableHead className="text-right">Valor</TableHead>
                          <TableHead className="text-right">% RL</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {avDre.map((i) => (
                          <TableRow key={i.label}>
                            <TableCell className="font-medium text-sm">{i.label}</TableCell>
                            <TableCell className="text-right font-mono text-sm">{fmtMoney(i.value)}</TableCell>
                            <TableCell className="text-right font-mono text-sm font-bold">{fmtPct(Math.abs(i.pct))}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>

          {/* INSOLVÊNCIA */}
          <TabsContent value="insolvencia" className="space-y-4">
            <SectionTitle icon={AlertTriangle} title="Índice de Insolvência" subtitle="Modelo Híbrido V3 + Kanitz Estendido" />
            <div className="grid md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <h4 className="text-sm font-semibold text-foreground">Modelo Proposto (Simplificado)</h4>
                <FormulaBlock formula="Score = (LG × 0,4) + (ROA × 0,3) − (EG × 0,3)" />
                <Card>
                  <CardContent className="p-5 space-y-3">
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between"><span className="text-muted-foreground">LG × 0,4</span><span className="font-mono">{fmt(lg, 4)} × 0,4 = {fmt(lg * 0.4, 4)}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">ROA × 0,3</span><span className="font-mono">{fmt(roa, 4)} × 0,3 = {fmt(roa * 0.3, 4)}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">EG × 0,3</span><span className="font-mono">{fmt(eg, 4)} × 0,3 = {fmt(eg * 0.3, 4)}</span></div>
                      <hr className="border-border" />
                      <div className="flex justify-between items-center">
                        <span className="font-semibold">Score</span>
                        <span className="text-2xl font-bold text-primary">{fmt(insolvencyScore, 3)}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <ArrowRight className="w-4 h-4 text-muted-foreground" />
                      {getRiskBadge(insolvencyClass === "Solidez" ? "Saudável" : insolvencyClass === "Atenção" ? "Moderado" : "Crítico")}
                      <span className="text-sm text-foreground font-medium">{insolvencyClass}</span>
                    </div>
                    <div className="text-xs text-muted-foreground space-y-1 mt-2">
                      <p>{"< 0 → Insolvência"}</p>
                      <p>{"0 – 1 → Atenção"}</p>
                      <p>{"> 1 → Solidez"}</p>
                    </div>
                  </CardContent>
                </Card>
              </div>
              <div className="space-y-4">
                <h4 className="text-sm font-semibold text-foreground">Versão Estendida (Kanitz Avançado)</h4>
                <FormulaBlock formula="I = 0,05·X1 + 1,65·X2 + 3,55·X3 − 1,06·X4 − 0,33·X5" description="X1 = CG/AT | X2 = LL/AT | X3 = LL/PL | X4 = PT/AT | X5 = RL/AT" />
                <Card>
                  <CardContent className="p-5 space-y-3">
                    <div className="space-y-2 text-sm">
                      {[
                        { label: "X1 (CG/AT)", val: x1, coef: 0.05 },
                        { label: "X2 (LL/AT)", val: x2, coef: 1.65 },
                        { label: "X3 (LL/PL)", val: x3, coef: 3.55 },
                        { label: "X4 (PT/AT)", val: x4, coef: -1.06 },
                        { label: "X5 (RL/AT)", val: x5, coef: -0.33 },
                      ].map((x) => (
                        <div key={x.label} className="flex justify-between">
                          <span className="text-muted-foreground">{x.label}</span>
                          <span className="font-mono">{fmt(x.val, 4)} × {x.coef} = {fmt(x.val * x.coef, 4)}</span>
                        </div>
                      ))}
                      <hr className="border-border" />
                      <div className="flex justify-between items-center">
                        <span className="font-semibold">Índice Kanitz</span>
                        <span className="text-2xl font-bold text-primary">{fmt(kanitz, 3)}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>

          {/* SOLVÊNCIA */}
          <TabsContent value="solvencia" className="space-y-4">
            <SectionTitle icon={Shield} title="Solvência Ajustada" subtitle="Com duplicatas descontadas" />
            <div className="grid md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <FormulaBlock formula={`PT ajustado = PT + DD\nEG ajustado = (PT + DD) / AT\nPL ajustado = AT − PT ajustado`} description="Se PL ajustado < 0 → Empresa tecnicamente insolvente" />
                <Card>
                  <CardContent className="p-5 space-y-4">
                    <h4 className="text-sm font-semibold text-foreground">Cálculos ({selectedYear})</h4>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between"><span className="text-muted-foreground">PT original</span><span className="font-mono">{fmtMoney(pt)}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Duplicatas Descontadas (DD)</span><span className="font-mono">{fmtMoney(d.duplicatasDescontadas)}</span></div>
                      <hr className="border-border" />
                      <div className="flex justify-between"><span className="font-semibold">PT ajustado</span><span className="font-mono font-bold">{fmtMoney(ptAdj)}</span></div>
                      <div className="flex justify-between"><span className="font-semibold">EG ajustado</span><span className="font-mono font-bold">{fmtPct(egAdj)}</span></div>
                      <div className="flex justify-between"><span className="font-semibold">PL ajustado</span><span className={`font-mono font-bold ${plAdj < 0 ? "text-destructive" : "text-emerald-600"}`}>{fmtMoney(plAdj)}</span></div>
                    </div>
                    {plAdj < 0 && (
                      <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3 flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-destructive shrink-0" />
                        <p className="text-xs text-destructive font-medium">Empresa tecnicamente insolvente (PL ajustado {"<"} 0)</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
              <div className="space-y-4">
                <h4 className="text-sm font-semibold text-foreground">Comparativo EG Original vs Ajustado</h4>
                <Card>
                  <CardContent className="p-5 space-y-4">
                    <div className="flex items-center gap-4">
                      <div className="flex-1 text-center p-4 rounded-lg bg-muted/50">
                        <p className="text-xs text-muted-foreground mb-1">EG Original</p>
                        <p className="text-2xl font-bold text-foreground">{fmtPct(eg)}</p>
                      </div>
                      <ArrowRight className="w-5 h-5 text-muted-foreground shrink-0" />
                      <div className="flex-1 text-center p-4 rounded-lg bg-muted/50">
                        <p className="text-xs text-muted-foreground mb-1">EG Ajustado</p>
                        <p className="text-2xl font-bold text-primary">{fmtPct(egAdj)}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="flex-1 text-center p-4 rounded-lg bg-muted/50">
                        <p className="text-xs text-muted-foreground mb-1">PL Original</p>
                        <p className="text-2xl font-bold text-foreground">{fmtMoney(d.patrimonioLiquido)}</p>
                      </div>
                      <ArrowRight className="w-5 h-5 text-muted-foreground shrink-0" />
                      <div className="flex-1 text-center p-4 rounded-lg bg-muted/50">
                        <p className="text-xs text-muted-foreground mb-1">PL Ajustado</p>
                        <p className={`text-2xl font-bold ${plAdj < 0 ? "text-destructive" : "text-emerald-600"}`}>{fmtMoney(plAdj)}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>

          {/* MATRIZ DE RISCO */}
          <TabsContent value="matriz" className="space-y-4">
            <SectionTitle icon={AlertTriangle} title="Matriz de Risco Financeiro IA" subtitle="Classificação automática por combinação de indicadores" />
            <div className="grid md:grid-cols-2 gap-6">
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">Matriz de Referência</CardTitle></CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Liquidez</TableHead>
                        <TableHead>Endividamento</TableHead>
                        <TableHead>Rentabilidade</TableHead>
                        <TableHead>Classificação</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {[
                        { l: "Baixa", e: "Alta", r: "Negativa", c: "Crítico" as RiskLevel },
                        { l: "Média", e: "Alta", r: "Baixa", c: "Alto" as RiskLevel },
                        { l: "Alta", e: "Média", r: "Positiva", c: "Moderado" as RiskLevel },
                        { l: "Alta", e: "Baixa", r: "Alta", c: "Saudável" as RiskLevel },
                      ].map((row, i) => (
                        <TableRow key={i}>
                          <TableCell className="text-sm">{row.l}</TableCell>
                          <TableCell className="text-sm">{row.e}</TableCell>
                          <TableCell className="text-sm">{row.r}</TableCell>
                          <TableCell>{getRiskBadge(row.c)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
              <Card className="bg-gradient-to-br from-primary/5 to-transparent">
                <CardHeader className="pb-2"><CardTitle className="text-sm">Classificação Atual ({selectedYear})</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-3 text-sm">
                    <div className="flex items-center justify-between p-2 rounded-lg bg-background/60">
                      <span className="text-muted-foreground">Liquidez</span>
                      <Badge variant="outline">{liquidezStatus} (LC = {fmt(ind.liquidezCorrente)})</Badge>
                    </div>
                    <div className="flex items-center justify-between p-2 rounded-lg bg-background/60">
                      <span className="text-muted-foreground">Endividamento</span>
                      <Badge variant="outline">{endivStatus} (EG = {fmtPct(eg)})</Badge>
                    </div>
                    <div className="flex items-center justify-between p-2 rounded-lg bg-background/60">
                      <span className="text-muted-foreground">Rentabilidade</span>
                      <Badge variant="outline">{rentStatus} (ML = {fmtPct(ind.margemLiquida)})</Badge>
                    </div>
                  </div>
                  <div className="text-center p-4 rounded-lg border border-primary/20 bg-primary/5">
                    <p className="text-xs text-muted-foreground mb-2">Classificação Final</p>
                    <div className="flex items-center justify-center gap-2">
                      {getRiskBadge(riskClassification)}
                      <span className="text-lg font-bold text-foreground">{riskClassification}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Exceptions & Standards */}
            <div className="grid md:grid-cols-2 gap-4">
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">Tratamento de Exceções</CardTitle></CardHeader>
                <CardContent>
                  <div className="space-y-2 text-sm">
                    {[
                      { sit: "Divisão por zero", action: "Retornar null + flag técnico" },
                      { sit: "PL negativo", action: "Forçar alerta estrutural" },
                      { sit: "Receita zero", action: "Suspender indicadores de margem" },
                    ].map((e) => (
                      <div key={e.sit} className="flex items-center gap-3 p-2 rounded-lg bg-muted/50">
                        <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
                        <div>
                          <p className="font-medium text-foreground">{e.sit}</p>
                          <p className="text-xs text-muted-foreground">{e.action}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">Padronização Numérica</CardTitle></CardHeader>
                <CardContent>
                  <div className="space-y-2 text-sm">
                    {[
                      { type: "Percentuais", rule: "2 casas decimais" },
                      { type: "Valores absolutos", rule: "Separador milhar (pt-BR)" },
                      { type: "Score insolvência", rule: "3 casas decimais" },
                    ].map((r) => (
                      <div key={r.type} className="flex items-center justify-between p-2 rounded-lg bg-muted/50">
                        <span className="font-medium text-foreground">{r.type}</span>
                        <code className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded">{r.rule}</code>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Governance */}
            <Card className="bg-gradient-to-r from-primary/5 to-transparent border-primary/20">
              <CardContent className="p-5">
                <div className="flex items-start gap-3">
                  <Shield className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-foreground mb-1">Governança 3.0 — Integração com Motor IA</p>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      Os índices calculados alimentam diretamente as 4 camadas do Motor IA: <strong>Camada 2</strong> — Classificação de Risco,{" "}
                      <strong>Camada 3</strong> — Materialidade, <strong>Camada 4</strong> — Parecer. Rastreabilidade via NBC TA 200, 315, 320, 500, 705 e Lei 6.404/76.
                      Logs de simulação, histórico de ajustes e versão de cálculo de índices são mantidos para auditoria completa.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </PlatformLayout>
  );
};

export default ModeloMatematico;
