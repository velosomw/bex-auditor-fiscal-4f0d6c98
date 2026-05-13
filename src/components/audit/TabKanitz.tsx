import { useMemo, useState } from "react";
import {
  Activity, BarChart3, Target, TrendingUp, TrendingDown,
  AlertTriangle, CheckCircle2, Calculator, Shield, Layers,
  AlertOctagon, Scale, ShieldCheck, ShieldAlert, FileSearch, CalendarDays, Minus, Info
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip as RTooltip, ReferenceLine, Legend,
} from "recharts";
import type { ParsedFinancialData } from "@/services/auditAIService";
import { buildKanitzSeries, mapToLegacyClass, type KanitzResultV2 } from "@/services/kanitzCalculator";
import { buildBSDados, type BalanceteEntry, type BSDadosRow } from "@/services/bsDadosBuilder";
import {
  buildKanitzMonthlySeries, summarizeKanitzSeries, KANITZ_RATING_META,
  type KanitzMonthlyResult,
} from "@/services/kanitzMonthly";

const fmt = (n: number) => new Intl.NumberFormat("pt-BR").format(Math.round(n));
const fmtPct = (n: number) => `${(n * 100).toFixed(2)}%`;
const fmtDec = (n: number) => n.toFixed(4);

/* ── Component: FormulaInfo ── */
const FormulaInfo = ({ 
  title, 
  formula, 
  accounts 
}: { 
  title: string; 
  formula: string; 
  accounts: string[] 
}) => (
  <Popover>
    <PopoverTrigger asChild>
      <button className="p-1 hover:bg-muted rounded-full transition-colors">
        <Info className="w-3.5 h-3.5 text-muted-foreground" />
      </button>
    </PopoverTrigger>
    <PopoverContent className="w-80 p-4 space-y-3">
      <h4 className="text-sm font-bold border-b pb-1">{title}</h4>
      <div className="space-y-1">
        <p className="text-[10px] uppercase font-semibold text-muted-foreground">Fórmula:</p>
        <p className="text-xs font-mono bg-muted/50 p-2 rounded border">{formula}</p>
      </div>
      <div className="space-y-1">
        <p className="text-[10px] uppercase font-semibold text-muted-foreground">Contas/Grupos que alimentam o cálculo:</p>
        <ul className="text-[10.5px] space-y-1 list-disc pl-4 text-foreground/80">
          {accounts.map((acc, i) => <li key={i}>{acc}</li>)}
        </ul>
      </div>
    </PopoverContent>
  </Popover>
);

/* ── Kanitz — adapter para o serviço canônico (kanitzCalculator) ── */
interface KanitzResult {
  year: string;
  rpl: number;
  lg: number;
  ls: number;
  lc: number;
  ge: number;
  fi: number;
  classificacao: "solvente" | "penumbra" | "insolvente";
  riskScoreNormalized: number;
  // Camadas 5/6 do MD — preservados para a aba Validação
  blocked?: boolean;
  blockReasons?: string[];
  origem?: string;
  confianca?: number;
  v?: KanitzResultV2; // resultado canônico completo
}

/** Adapta KanitzResultV2 (canônico) para o shape antigo usado pela UI */
function toLegacy(r: KanitzResultV2): KanitzResult {
  return {
    year: r.periodo,
    rpl: r.indicators.rl,
    lg: r.indicators.lg,
    ls: r.indicators.ls,
    lc: r.indicators.lc,
    ge: r.indicators.ge,
    fi: r.k,
    classificacao: mapToLegacyClass(r.classificacao),
    riskScoreNormalized: 0,
    blocked: r.block.blocked,
    blockReasons: r.block.reasons,
    origem: r.input.origem,
    confianca: r.input.confianca,
    v: r,
  };
}

const classColors = {
  solvente: { bg: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30", icon: "🟢", label: "Solvente" },
  penumbra: { bg: "bg-yellow-500/15 text-yellow-600 border-yellow-500/30", icon: "🟡", label: "Zona de Penumbra" },
  insolvente: { bg: "bg-red-500/15 text-red-600 border-red-500/30", icon: "🔴", label: "Insolvente" },
};

/* ══════════════════════════════════════════════════════
   TAB KANITZ – TERMÔMETRO DE INSOLVÊNCIA
   ══════════════════════════════════════════════════════ */
const TabKanitz = ({
  parsedData, aiAnalysis, balanceteEntries = [], bsDadosRows: bsRowsProp,
}: {
  parsedData?: ParsedFinancialData | null;
  aiAnalysis?: any;
  balanceteEntries?: BalanceteEntry[];
  bsDadosRows?: BSDadosRow[];
}) => {
  const [subTab, setSubTab] = useState("visao-geral");

  // ── BS & Dados (mensal) — fonte canônica para o Score Kanitz Automático ──
  const bsRows = useMemo<BSDadosRow[]>(
    () => bsRowsProp ?? buildBSDados(parsedData, balanceteEntries),
    [bsRowsProp, parsedData, balanceteEntries],
  );
  const monthlySeries = useMemo(() => buildKanitzMonthlySeries(bsRows), [bsRows]);
  const monthlySummary = useMemo(() => summarizeKanitzSeries(monthlySeries), [monthlySeries]);

  // ▶ Camadas 1–5 do MD: pipeline canônico (anual — preservado para compat)
  const v2Series = buildKanitzSeries(parsedData || null, aiAnalysis);
  const kanitzResults: KanitzResult[] = v2Series.map(toLegacy);

  // Risk Score normalizado (escala min-max do FI por série, exclusivo do display)
  if (kanitzResults.length > 0) {
    const fiValues = kanitzResults.map(r => r.fi);
    const fiMin = Math.min(...fiValues);
    const fiMax = Math.max(...fiValues);
    const range = fiMax - fiMin || 1;
    kanitzResults.forEach(r => {
      r.riskScoreNormalized = Math.round(((r.fi - fiMin) / range) * 100);
    });
  }

  const latest = kanitzResults[kanitzResults.length - 1];
  const previous = kanitzResults.length > 1 ? kanitzResults[kanitzResults.length - 2] : null;
  const fiDelta = previous ? latest?.fi - previous.fi : 0;

  // Alerts
  const alerts: string[] = [];
  if (latest && previous) {
    if (Math.abs(fiDelta) > 1) alerts.push(`FI variou ${fiDelta > 0 ? "+" : ""}${fiDelta.toFixed(2)} pontos em 1 período`);
    if (previous.fi > 0 && latest.fi <= 0) alerts.push("FI cruzou a barreira de 0 — saída da zona de solvência");
    if (latest.fi < -3) alerts.push("FI abaixo de -3 — empresa na zona de insolvência");
  }

  if (kanitzResults.length === 0 && monthlySeries.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <AlertTriangle className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Nenhum dado financeiro disponível para calcular o Termômetro de Kanitz.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Scale className="w-4 h-4 text-accent" /> Kanitz — Termômetro de Insolvência
            </CardTitle>
            {latest && (
              <Badge className={`${classColors[latest.classificacao].bg} border text-xs`}>
                {classColors[latest.classificacao].icon} {classColors[latest.classificacao].label}
              </Badge>
            )}
          </div>
          <CardDescription>
            Modelo de previsão de insolvência de Stephen C. Kanitz — Fator de Insolvência (FI)
          </CardDescription>
        </CardHeader>
        {latest && (
          <CardContent>
            <div className="grid sm:grid-cols-3 gap-4">
              <div className="text-center p-4 rounded-lg bg-muted/30">
                <p className="text-xs text-muted-foreground mb-1">Fator de Insolvência (FI)</p>
                <p className={`text-4xl font-bold font-mono ${
                  latest.fi > 0 ? "text-emerald-600" : latest.fi >= -3 ? "text-yellow-600" : "text-red-600"
                }`}>{latest.fi.toFixed(2)}</p>
                {previous && (
                  <div className="flex items-center justify-center gap-1 mt-2">
                    {fiDelta > 0 ? <TrendingUp className="w-3.5 h-3.5 text-emerald-500" /> : <TrendingDown className="w-3.5 h-3.5 text-red-500" />}
                    <span className={`text-xs font-mono ${fiDelta > 0 ? "text-emerald-500" : "text-red-500"}`}>
                      {fiDelta > 0 ? "+" : ""}{fiDelta.toFixed(2)} vs {previous.year}
                    </span>
                  </div>
                )}
              </div>
              <div className="text-center p-4 rounded-lg bg-muted/30">
                <p className="text-xs text-muted-foreground mb-1">Classificação</p>
                <p className="text-2xl font-bold">{classColors[latest.classificacao].icon}</p>
                <p className={`text-sm font-semibold mt-1 ${
                  latest.classificacao === "solvente" ? "text-emerald-600" :
                  latest.classificacao === "penumbra" ? "text-yellow-600" : "text-red-600"
                }`}>{classColors[latest.classificacao].label}</p>
              </div>
              <div className="text-center p-4 rounded-lg bg-muted/30">
                <p className="text-xs text-muted-foreground mb-1">Risk Score Normalizado</p>
                <p className="text-4xl font-bold font-mono text-foreground">{latest.riskScoreNormalized}</p>
                <p className="text-[10px] text-muted-foreground mt-1">Escala EBEX (0-100)</p>
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      {/* Alerts */}
      {alerts.length > 0 && (
        <Card className="border-orange-500/30 bg-orange-500/5">
          <CardContent className="py-3">
            <div className="space-y-2">
              {alerts.map((a, i) => (
                <div key={i} className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-orange-500 shrink-0" />
                  <span className="text-xs font-medium text-orange-700">{a}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Sub-tabs */}
      <Tabs value={subTab} onValueChange={setSubTab}>
        <TabsList className="w-full flex-wrap h-auto gap-1 bg-muted/50 p-1">
          <TabsTrigger value="visao-geral" className="text-[10px]">Visão Geral</TabsTrigger>
          <TabsTrigger value="mensal" className="text-[10px]">
            <CalendarDays className="w-3 h-3 mr-1" />
            Análise Mensal {monthlySeries.length > 0 && <span className="ml-1 opacity-70">({monthlySeries.length})</span>}
          </TabsTrigger>
          <TabsTrigger value="indicadores" className="text-[10px]">Indicadores</TabsTrigger>
          <TabsTrigger value="calculo" className="text-[10px]">Cálculo do FI</TabsTrigger>
          <TabsTrigger value="classificacao" className="text-[10px]">Classificação</TabsTrigger>
          <TabsTrigger value="historico" className="text-[10px]">Histórico Evolutivo</TabsTrigger>
          <TabsTrigger value="risk-engine" className="text-[10px]">Risk Engine</TabsTrigger>
          <TabsTrigger value="validacao" className="text-[10px]">Validação</TabsTrigger>
          <TabsTrigger value="relatorio" className="text-[10px]">Relatório</TabsTrigger>
        </TabsList>

        {/* ── Análise Mensal (MD: SCORE KANITZ AUTOMÁTICO) ── */}
        <TabsContent value="mensal">
          <KanitzMensalView series={monthlySeries} summary={monthlySummary} />
        </TabsContent>

        {/* ── Visão Geral ── */}
        <TabsContent value="visao-geral">
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Metodologia Kanitz</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-xs text-muted-foreground leading-relaxed">
                  O Termômetro de Insolvência de Kanitz é um modelo preditivo desenvolvido por Stephen Charles Kanitz 
                  para avaliar a probabilidade de insolvência de empresas brasileiras. Utiliza cinco indicadores financeiros 
                  ponderados para gerar o Fator de Insolvência (FI), classificando a empresa em três zonas de risco.
                </p>
                <div className="p-4 rounded-lg bg-muted/30 border border-border/50">
                  <p className="text-xs font-semibold text-foreground mb-2">Fórmula do Fator de Insolvência (Modelo Giannini):</p>
                  <code className="block text-[11px] font-mono leading-relaxed text-foreground">
                    FI = (0,05 × RPL) + (1,65 × LG) + (3,55 × LS) − (1,06 × LC) − (0,33 × GE)
                  </code>
                  <p className="text-[10px] text-muted-foreground mt-2">
                    Onde GE = −((PC + ELP) / PL) — o grau de endividamento entra com sinal negativo.
                  </p>
                </div>
                <div className="grid sm:grid-cols-3 gap-3">
                  {[
                    { icon: "🟢", title: "Solvente", desc: "FI > 0", detail: "Empresa financeiramente saudável" },
                    { icon: "🟡", title: "Zona de Penumbra", desc: "0 ≥ FI ≥ -3", detail: "Requer atenção e monitoramento" },
                    { icon: "🔴", title: "Insolvente", desc: "FI < -3", detail: "Alto risco de insolvência" },
                  ].map(z => (
                    <div key={z.title} className="p-3 rounded-lg bg-muted/20 border border-border/30 text-center">
                      <p className="text-2xl mb-1">{z.icon}</p>
                      <p className="text-xs font-semibold text-foreground">{z.title}</p>
                      <p className="text-[10px] font-mono text-muted-foreground">{z.desc}</p>
                      <p className="text-[10px] text-muted-foreground mt-1">{z.detail}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2"><Shield className="w-4 h-4 text-accent" /> Compliance e Governança</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {[
                  "Utilizar balanço auditado como fonte primária",
                  "Registrar data-base de referência do cálculo",
                  "Versionar todos os cálculos realizados",
                  "Manter log de alterações contábeis que impactem os indicadores",
                ].map((item, i) => (
                  <div key={i} className="flex items-center gap-2 p-2 rounded-lg bg-muted/20">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                    <span className="text-xs text-foreground">{item}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── Indicadores Utilizados ── */}
        <TabsContent value="indicadores">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2"><Calculator className="w-4 h-4 text-accent" /> Indicadores Utilizados no Modelo</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-[10px]">Indicador</TableHead>
                    <TableHead className="text-[10px]">Sigla</TableHead>
                    <TableHead className="text-[10px]">Fórmula</TableHead>
                    <TableHead className="text-[10px]">Origem</TableHead>
                    <TableHead className="text-[10px]">Peso</TableHead>
                    {kanitzResults.map(r => (
                      <TableHead key={r.year} className="text-right text-[10px]">{r.year}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[
                    { name: "Rentabilidade do PL", sigla: "RPL", formula: "LL / PL", origem: "DRE + BP", peso: "0,05", key: "rpl" as const },
                    { name: "Liquidez Geral", sigla: "LG", formula: "(AC + RLP) / (PC + ELP)", origem: "BP", peso: "1,65", key: "lg" as const },
                    { name: "Liquidez Seca", sigla: "LS", formula: "(AC - EST) / PC", origem: "BP", peso: "3,55", key: "ls" as const },
                    { name: "Liquidez Corrente", sigla: "LC", formula: "AC / PC", origem: "BP", peso: "-1,06", key: "lc" as const },
                    { name: "Grau de Endividamento", sigla: "GE", formula: "−((PC + ELP) / PL)", origem: "BP", peso: "-0,33", key: "ge" as const },
                  ].map(ind => (
                    <TableRow key={ind.sigla}>
                      <TableCell className="text-xs font-medium">{ind.name}</TableCell>
                      <TableCell className="text-xs font-mono font-bold">{ind.sigla}</TableCell>
                      <TableCell className="text-[10px] font-mono text-muted-foreground">{ind.formula}</TableCell>
                      <TableCell className="text-[10px] text-muted-foreground">{ind.origem}</TableCell>
                      <TableCell className="text-xs font-mono font-bold">{ind.peso}</TableCell>
                      {kanitzResults.map(r => (
                        <TableCell key={r.year} className="text-right text-xs font-mono">
                          {fmtDec(r[ind.key])}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Cálculo do FI ── */}
        <TabsContent value="calculo">
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2"><Calculator className="w-4 h-4 text-accent" /> Memória de Cálculo do Fator de Insolvência</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-[10px]">Componente</TableHead>
                      <TableHead className="text-[10px]">Peso</TableHead>
                      {kanitzResults.map(r => (
                        <TableHead key={r.year} className="text-right text-[10px]">{r.year} (Valor)</TableHead>
                      ))}
                      {kanitzResults.map(r => (
                        <TableHead key={`w-${r.year}`} className="text-right text-[10px]">{r.year} (Ponderado)</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {[
                      { name: "RPL", peso: 0.05, key: "rpl" as const },
                      { name: "LG", peso: 1.65, key: "lg" as const },
                      { name: "LS", peso: 3.55, key: "ls" as const },
                      { name: "LC", peso: -1.06, key: "lc" as const },
                      { name: "GE", peso: -0.33, key: "ge" as const },
                    ].map(c => (
                      <TableRow key={c.name}>
                        <TableCell className="text-xs font-mono font-bold">{c.name}</TableCell>
                        <TableCell className="text-xs font-mono">{c.peso > 0 ? `+${c.peso}` : c.peso}</TableCell>
                        {kanitzResults.map(r => (
                          <TableCell key={r.year} className="text-right text-xs font-mono">{fmtDec(r[c.key])}</TableCell>
                        ))}
                        {kanitzResults.map(r => (
                          <TableCell key={`w-${r.year}`} className="text-right text-xs font-mono font-bold">
                            {(c.peso * r[c.key]).toFixed(4)}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                    <TableRow className="border-t-2 border-foreground/20">
                      <TableCell className="text-xs font-bold" colSpan={2}>FATOR DE INSOLVÊNCIA (FI)</TableCell>
                      {kanitzResults.map(r => (
                        <TableCell key={r.year} className="text-right" />
                      ))}
                      {kanitzResults.map(r => (
                        <TableCell key={`fi-${r.year}`} className={`text-right text-sm font-bold font-mono ${
                          r.fi > 0 ? "text-emerald-600" : r.fi >= -3 ? "text-yellow-600" : "text-red-600"
                        }`}>
                          {r.fi.toFixed(2)}
                        </TableCell>
                      ))}
                    </TableRow>
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── Classificação de Risco ── */}
        <TabsContent value="classificacao">
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2"><Target className="w-4 h-4 text-accent" /> Classificação por Período</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid sm:grid-cols-3 gap-4">
                  {kanitzResults.map(r => (
                    <div key={r.year} className={`p-4 rounded-lg border ${classColors[r.classificacao].bg} text-center space-y-2`}>
                      <p className="text-xs text-muted-foreground font-semibold">{r.year}</p>
                      <p className="text-3xl font-bold font-mono">{r.fi.toFixed(2)}</p>
                      <p className="text-sm font-semibold">{classColors[r.classificacao].icon} {classColors[r.classificacao].label}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Termômetro Visual */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Termômetro de Insolvência</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-6">
                  <div className="flex-1 relative h-12 rounded-full overflow-hidden bg-gradient-to-r from-red-500 via-yellow-500 to-emerald-500">
                    {kanitzResults.map((r) => {
                      // Map FI from range [-7, 7] to [0, 100]%
                      const pos = Math.max(0, Math.min(100, ((r.fi + 7) / 14) * 100));
                      return (
                        <div
                          key={r.year}
                          className="absolute top-0 bottom-0 w-1 bg-foreground rounded-full shadow-lg"
                          style={{ left: `${pos}%`, transform: "translateX(-50%)" }}
                          title={`${r.year}: FI = ${r.fi.toFixed(2)}`}
                        >
                          <div className="absolute -top-6 left-1/2 -translate-x-1/2 text-[10px] font-bold whitespace-nowrap bg-foreground text-background px-1.5 py-0.5 rounded">
                            {r.year}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div className="flex justify-between mt-2 text-[10px] text-muted-foreground">
                  <span>Insolvente (FI &lt; -3)</span>
                  <span>Penumbra (-3 ≤ FI ≤ 0)</span>
                  <span>Solvente (FI &gt; 0)</span>
                </div>
              </CardContent>
            </Card>

            {/* Risk Score */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Risk Score Normalizado (Escala EBEX)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {kanitzResults.map(r => (
                    <div key={r.year} className="space-y-1">
                      <div className="flex justify-between text-xs">
                        <span className="font-medium text-foreground">{r.year}</span>
                        <span className="font-mono font-bold">{r.riskScoreNormalized}/100</span>
                      </div>
                      <Progress value={r.riskScoreNormalized} className="h-2" />
                      <p className="text-[10px] text-muted-foreground">
                        {r.riskScoreNormalized <= 30 ? "Alto risco" : r.riskScoreNormalized <= 70 ? "Médio risco" : "Baixo risco"}
                      </p>
                    </div>
                  ))}
                </div>
                <div className="mt-4 p-3 rounded-lg bg-muted/30">
                  <p className="text-[10px] font-semibold text-foreground mb-1">Fórmula de Normalização:</p>
                  <code className="text-[10px] font-mono text-muted-foreground">
                    RiskScore = (FI - FI_min) / (FI_max - FI_min) × 100
                  </code>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── Histórico Evolutivo ── */}
        <TabsContent value="historico">
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2"><Activity className="w-4 h-4 text-accent" /> Evolução Temporal do FI</CardTitle>
              </CardHeader>
              <CardContent>
                {/* Bar chart representation */}
                <div className="flex items-end gap-4 justify-center h-48 px-4">
                  {kanitzResults.map(r => {
                    const maxAbs = Math.max(...kanitzResults.map(k => Math.abs(k.fi)), 1);
                    const height = (Math.abs(r.fi) / maxAbs) * 100;
                    const isPositive = r.fi > 0;
                    return (
                      <div key={r.year} className="flex flex-col items-center gap-1 flex-1 max-w-[100px]">
                        <span className={`text-xs font-mono font-bold ${
                          r.fi > 0 ? "text-emerald-600" : r.fi >= -3 ? "text-yellow-600" : "text-red-600"
                        }`}>{r.fi.toFixed(2)}</span>
                        <div className="w-full flex flex-col items-center" style={{ height: "120px" }}>
                          <div className="flex-1 flex items-end w-full">
                            {isPositive && (
                              <div
                                className="w-full rounded-t-md bg-emerald-500/60"
                                style={{ height: `${height}%` }}
                              />
                            )}
                          </div>
                          <div className="w-full h-[2px] bg-foreground/30" />
                          <div className="flex-1 w-full">
                            {!isPositive && (
                              <div
                                className={`w-full rounded-b-md ${r.fi >= -3 ? "bg-yellow-500/60" : "bg-red-500/60"}`}
                                style={{ height: `${height}%` }}
                              />
                            )}
                          </div>
                        </div>
                        <span className="text-xs font-semibold text-muted-foreground">{r.year}</span>
                      </div>
                    );
                  })}
                </div>
                <div className="flex justify-center gap-6 mt-4 text-[10px] text-muted-foreground">
                  <span className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-emerald-500/60" /> Solvente</span>
                  <span className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-yellow-500/60" /> Penumbra</span>
                  <span className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-red-500/60" /> Insolvente</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Tendência dos Indicadores</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-[10px]">Indicador</TableHead>
                      {kanitzResults.map(r => (
                        <TableHead key={r.year} className="text-right text-[10px]">{r.year}</TableHead>
                      ))}
                      <TableHead className="text-right text-[10px]">Tendência</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(["rpl", "lg", "ls", "lc", "ge", "fi"] as const).map(key => {
                      const label = { rpl: "RPL", lg: "LG", ls: "LS", lc: "LC", ge: "GE", fi: "FI" }[key];
                      const vals = kanitzResults.map(r => r[key]);
                      const trend = vals.length > 1 ? vals[vals.length - 1] - vals[0] : 0;
                      return (
                        <TableRow key={key}>
                          <TableCell className="text-xs font-mono font-bold">{label}</TableCell>
                          {kanitzResults.map(r => (
                            <TableCell key={r.year} className="text-right text-xs font-mono">{fmtDec(r[key])}</TableCell>
                          ))}
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              {trend > 0 ? <TrendingUp className="w-3.5 h-3.5 text-emerald-500" /> : <TrendingDown className="w-3.5 h-3.5 text-red-500" />}
                              <span className={`text-xs font-mono ${trend > 0 ? "text-emerald-500" : "text-red-500"}`}>
                                {trend > 0 ? "+" : ""}{trend.toFixed(4)}
                              </span>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── Integração com Risk Engine ── */}
        <TabsContent value="risk-engine">
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2"><Layers className="w-4 h-4 text-accent" /> Integração com Risk Engine Multiagente</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid sm:grid-cols-3 gap-3">
                  {[
                    { agent: "Agente Auditor Contábil", desc: "Valida consistência das contas e analisa distorções patrimoniais", icon: Shield, status: "ativo" },
                    { agent: "Agente Financeiro", desc: "Simula cenários de reestruturação e projeta FI futuro", icon: BarChart3, status: "ativo" },
                    { agent: "Agente de Relatórios", desc: "Gera parecer técnico estruturado — PDF e Word", icon: Target, status: "ativo" },
                  ].map(a => (
                    <Card key={a.agent} className="bg-muted/20">
                      <CardContent className="p-4 space-y-2">
                        <div className="flex items-center gap-2">
                          <a.icon className="w-4 h-4 text-accent" />
                          <span className="text-xs font-semibold text-foreground">{a.agent}</span>
                        </div>
                        <p className="text-[10px] text-muted-foreground">{a.desc}</p>
                        <Badge className="bg-emerald-500/15 text-emerald-600 text-[10px]">● {a.status}</Badge>
                      </CardContent>
                    </Card>
                  ))}
                </div>

                {latest && (
                  <Card className="bg-muted/30">
                    <CardContent className="p-4 space-y-3">
                      <p className="text-xs font-semibold text-foreground">Contribuição Kanitz → ECRS</p>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="p-3 rounded-lg bg-background">
                          <p className="text-[10px] text-muted-foreground">FI Atual</p>
                          <p className="text-lg font-bold font-mono">{latest.fi.toFixed(2)}</p>
                        </div>
                        <div className="p-3 rounded-lg bg-background">
                          <p className="text-[10px] text-muted-foreground">Risk Score Normalizado</p>
                          <p className="text-lg font-bold font-mono">{latest.riskScoreNormalized}/100</p>
                        </div>
                      </div>
                      <div className="p-3 rounded-lg bg-muted/20">
                        <p className="text-[10px] text-muted-foreground">
                          O Fator de Insolvência Kanitz contribui como variável independente no Score Consolidado ECRS, 
                          sendo ponderado junto aos scores de Auditoria (SA), Financeiro (SF) e Narrativo (SR) para 
                          determinação do risco sistêmico da entidade.
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── Validação Kanitz (MD Camadas 5/6) ── */}
        <TabsContent value="validacao">
          <div className="space-y-4">
            {/* Bloqueios */}
            {kanitzResults.some(r => r.blocked) && (
              <Card className="border-red-500/40 bg-red-500/5">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2 text-red-700">
                    <ShieldAlert className="w-4 h-4" /> Cálculo Bloqueado
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Regras críticas do MD impedem o cálculo enquanto os dados não forem corrigidos.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  {kanitzResults.filter(r => r.blocked).map(r => (
                    <div key={r.year} className="text-xs">
                      <div className="font-semibold text-red-700">{r.year}</div>
                      <ul className="list-disc list-inside ml-2 text-red-600/90">
                        {(r.blockReasons || []).map((b, i) => <li key={i}>{b}</li>)}
                      </ul>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* Breakdown técnico */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Calculator className="w-4 h-4 text-accent" /> Breakdown Técnico (Validação dos Indicadores)
                </CardTitle>
                <CardDescription className="text-xs">
                  Validação automática conforme intervalos do MD: RL ∈ [-5, +5]; LG, LS, LC ≥ 0; GE ≥ 0.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Período</TableHead>
                      <TableHead className="text-xs text-right">RL</TableHead>
                      <TableHead className="text-xs text-right">LG</TableHead>
                      <TableHead className="text-xs text-right">LS</TableHead>
                      <TableHead className="text-xs text-right">LC</TableHead>
                      <TableHead className="text-xs text-right">GE</TableHead>
                      <TableHead className="text-xs text-right">K</TableHead>
                      <TableHead className="text-xs">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {kanitzResults.map(r => {
                      const v = r.v;
                      const valStatus = (s?: string) => s && s !== "ok" ? (
                        <Badge variant="outline" className="text-[10px] bg-red-500/10 text-red-600 border-red-500/30">{s}</Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-600 border-emerald-500/30">ok</Badge>
                      );
                      return (
                        <TableRow key={r.year}>
                          <TableCell className="text-xs font-medium">{r.year}</TableCell>
                          <TableCell className="text-xs text-right font-mono">{r.rpl.toFixed(4)}</TableCell>
                          <TableCell className="text-xs text-right font-mono">{r.lg.toFixed(4)}</TableCell>
                          <TableCell className="text-xs text-right font-mono">{r.ls.toFixed(4)}</TableCell>
                          <TableCell className="text-xs text-right font-mono">{r.lc.toFixed(4)}</TableCell>
                          <TableCell className="text-xs text-right font-mono">{r.ge.toFixed(4)}</TableCell>
                          <TableCell className="text-xs text-right font-mono font-semibold">{r.fi.toFixed(4)}</TableCell>
                          <TableCell className="text-xs">
                            <div className="flex flex-wrap gap-1">
                              {valStatus(v?.validation.rl)}
                              {valStatus(v?.validation.lg)}
                              {valStatus(v?.validation.ls)}
                              {valStatus(v?.validation.lc)}
                              {valStatus(v?.validation.ge)}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
                <p className="text-[10px] text-muted-foreground mt-2 font-mono">
                  K = 0,05·RL + 1,65·LG + 3,55·LS − 1,06·LC − 0,33·GE
                </p>
              </CardContent>
            </Card>

            {/* Cross-check Excel (quando IA fornece K como referência) */}
            {kanitzResults.some(r => r.v?.kExcel !== undefined) && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <FileSearch className="w-4 h-4 text-accent" /> Cross-check (Plataforma vs Referência)
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Comparação entre o K calculado pela plataforma e o K declarado pela IA / planilha de referência.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">Período</TableHead>
                        <TableHead className="text-xs text-right">K Plataforma</TableHead>
                        <TableHead className="text-xs text-right">K Referência</TableHead>
                        <TableHead className="text-xs text-right">Diff</TableHead>
                        <TableHead className="text-xs">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {kanitzResults.filter(r => r.v?.kExcel !== undefined).map(r => {
                        const status = r.v?.diffStatus;
                        const cls =
                          status === "OK" ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/30" :
                          status === "WARNING" ? "bg-yellow-500/10 text-yellow-600 border-yellow-500/30" :
                          "bg-red-500/10 text-red-600 border-red-500/30";
                        return (
                          <TableRow key={r.year}>
                            <TableCell className="text-xs">{r.year}</TableCell>
                            <TableCell className="text-xs text-right font-mono">{r.fi.toFixed(4)}</TableCell>
                            <TableCell className="text-xs text-right font-mono">{r.v?.kExcel?.toFixed(4)}</TableCell>
                            <TableCell className="text-xs text-right font-mono">{r.v?.diff?.toFixed(4)}</TableCell>
                            <TableCell><Badge variant="outline" className={`text-[10px] ${cls}`}>{status}</Badge></TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}

            {/* Auditoria de Origem */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-accent" /> Auditoria de Origem
                </CardTitle>
                <CardDescription className="text-xs">
                  Rastreabilidade: origem dos dados (OCR / IA / manual) e nível de confiança associado.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Período</TableHead>
                      <TableHead className="text-xs">Origem</TableHead>
                      <TableHead className="text-xs text-right">Confiança</TableHead>
                      <TableHead className="text-xs text-right">AC</TableHead>
                      <TableHead className="text-xs text-right">PC</TableHead>
                      <TableHead className="text-xs text-right">ELP</TableHead>
                      <TableHead className="text-xs text-right">PL</TableHead>
                      <TableHead className="text-xs text-right">Estoques</TableHead>
                      <TableHead className="text-xs text-right">LL</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {kanitzResults.map(r => (
                      <TableRow key={r.year}>
                        <TableCell className="text-xs font-medium">{r.year}</TableCell>
                        <TableCell className="text-xs uppercase">{r.origem}</TableCell>
                        <TableCell className="text-xs text-right font-mono">{((r.confianca || 0) * 100).toFixed(0)}%</TableCell>
                        <TableCell className="text-xs text-right font-mono">{fmt(r.v?.input.ac || 0)}</TableCell>
                        <TableCell className="text-xs text-right font-mono">{fmt(r.v?.input.pc || 0)}</TableCell>
                        <TableCell className="text-xs text-right font-mono">{fmt(r.v?.input.elp || 0)}</TableCell>
                        <TableCell className="text-xs text-right font-mono">{fmt(r.v?.input.pl || 0)}</TableCell>
                        <TableCell className="text-xs text-right font-mono">{fmt(r.v?.input.estoques || 0)}</TableCell>
                        <TableCell className="text-xs text-right font-mono">{fmt(r.v?.input.lucroLiquido || 0)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── Relatório ── */}
        <TabsContent value="relatorio">
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2"><Shield className="w-4 h-4 text-accent" /> Relatório Kanitz — Termômetro de Insolvência</CardTitle>
                <CardDescription>Documento técnico com metodologia, indicadores, resultado e recomendações</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* 1. Sumário Executivo */}
                <div>
                  <h3 className="text-sm font-semibold text-foreground mb-2">1. Sumário Executivo</h3>
                  <div className="p-4 rounded-lg bg-muted/30 border border-border/50">
                    <p className="text-xs text-foreground leading-relaxed">
                      {latest && (
                        latest.classificacao === "solvente"
                          ? `A empresa apresenta Fator de Insolvência de ${latest.fi.toFixed(2)}, classificando-se como SOLVENTE segundo o modelo Kanitz. Os indicadores de liquidez e endividamento estão dentro dos parâmetros aceitáveis, indicando capacidade de honrar obrigações no curto e longo prazo.`
                          : latest.classificacao === "penumbra"
                          ? `A empresa encontra-se em ZONA DE PENUMBRA com Fator de Insolvência de ${latest.fi.toFixed(2)}. Apresenta fragilidade nos indicadores de liquidez e/ou aumento do grau de endividamento. Recomenda-se revisão da estrutura de capital e renegociação de passivos.`
                          : `A empresa está em situação de INSOLVÊNCIA com Fator de Insolvência de ${latest.fi.toFixed(2)}. Os indicadores financeiros demonstram deterioração severa da capacidade de pagamento. Recomenda-se reestruturação financeira imediata e análise de viabilidade conforme Lei 11.101/2005.`
                      )}
                    </p>
                  </div>
                </div>

                {/* 2. Metodologia */}
                <div>
                  <h3 className="text-sm font-semibold text-foreground mb-2">2. Metodologia</h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Modelo preditivo de Stephen C. Kanitz. Formula: FI = (0,05 × RPL) + (1,65 × LG) + (3,55 × LS) − (1,06 × LC) − (0,33 × GE). 
                    Classificação: FI &gt; 0 → Solvente | 0 ≥ FI ≥ -3 → Penumbra | FI &lt; -3 → Insolvente.
                  </p>
                </div>

                {/* 3. Indicadores */}
                <div>
                  <h3 className="text-sm font-semibold text-foreground mb-2">3. Indicadores Utilizados</h3>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-[10px]">Indicador</TableHead>
                        <TableHead className="text-[10px]">Fórmula</TableHead>
                        {kanitzResults.map(r => <TableHead key={r.year} className="text-right text-[10px]">{r.year}</TableHead>)}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {[
                        { name: "RPL", formula: "LL / PL", key: "rpl" as const },
                        { name: "LG", formula: "(AC + RLP) / PT", key: "lg" as const },
                        { name: "LS", formula: "(AC - EST) / PC", key: "ls" as const },
                        { name: "LC", formula: "AC / PC", key: "lc" as const },
                        { name: "GE", formula: "PT / PL", key: "ge" as const },
                      ].map(ind => (
                        <TableRow key={ind.name}>
                          <TableCell className="text-xs font-mono font-bold">{ind.name}</TableCell>
                          <TableCell className="text-[10px] font-mono text-muted-foreground">{ind.formula}</TableCell>
                          {kanitzResults.map(r => (
                            <TableCell key={r.year} className="text-right text-xs font-mono">{fmtDec(r[ind.key])}</TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                {/* 4. Resultado */}
                <div>
                  <h3 className="text-sm font-semibold text-foreground mb-2">4. Resultado do FI</h3>
                  <div className="grid sm:grid-cols-3 gap-3">
                    {kanitzResults.map(r => (
                      <div key={r.year} className={`p-4 rounded-lg border text-center ${classColors[r.classificacao].bg}`}>
                        <p className="text-xs text-muted-foreground">{r.year}</p>
                        <p className="text-2xl font-bold font-mono">{r.fi.toFixed(2)}</p>
                        <p className="text-xs font-semibold">{classColors[r.classificacao].icon} {classColors[r.classificacao].label}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 5. Recomendações */}
                <div>
                  <h3 className="text-sm font-semibold text-foreground mb-2">5. Recomendações Estratégicas</h3>
                  <div className="space-y-2">
                    {[
                      "Monitorar trimestralmente a evolução do Fator de Insolvência",
                      "Implementar controle de liquidez operacional diário",
                      "Revisar política de endividamento — reduzir concentração em curto prazo",
                      "Avaliar reestruturação patrimonial para fortalecimento do PL",
                      "Integrar resultado Kanitz ao sistema de alertas do Risk Engine ECRS",
                    ].map((rec, i) => (
                      <div key={i} className="flex items-start gap-2 p-2 rounded-lg bg-muted/20">
                        <span className="text-xs font-bold text-accent shrink-0">{i + 1}.</span>
                        <span className="text-xs text-foreground">{rec}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Base Normativa */}
                <div className="flex flex-wrap gap-1.5 pt-2">
                  {["Lei 11.101/2005", "CPC 26", "NBC TA 570", "IFRS", "Modelo Kanitz (1978)"].map(n => (
                    <Badge key={n} variant="secondary" className="text-[10px]">{n}</Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

/* ══════════════════════════════════════════════════════
   SUB-COMPONENTE — Análise Mensal (MD: Score Kanitz Automático)
   ══════════════════════════════════════════════════════ */
function KanitzMensalView({
  series, summary,
}: {
  series: KanitzMonthlyResult[];
  summary: ReturnType<typeof summarizeKanitzSeries>;
}) {
  if (series.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center">
          <CalendarDays className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">
            Nenhum mês detectado no balancete. Carregue um balancete com referência mensal para
            visualizar o Score Kanitz por mês.
          </p>
        </CardContent>
      </Card>
    );
  }

  const chartData = series.map(s => ({
    mes: s.mes,
    score: Number(s.score.toFixed(2)),
    rating: s.rating,
  }));

  const trendIcon = summary?.trend === "up"
    ? <TrendingUp className="w-4 h-4 text-emerald-500" />
    : summary?.trend === "down"
    ? <TrendingDown className="w-4 h-4 text-red-500" />
    : <Minus className="w-4 h-4 text-muted-foreground" />;

  return (
    <div className="space-y-4">
      {/* Header — Termômetro GLOBAL */}
      {summary && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-2">
                <Scale className="w-4 h-4 text-accent" /> Termômetro Global ({summary.count} {summary.count === 1 ? "mês" : "meses"})
              </CardTitle>
              <Badge
                className="text-xs border"
                style={{ backgroundColor: `${KANITZ_RATING_META[summary.globalRating].color}20`, color: KANITZ_RATING_META[summary.globalRating].color, borderColor: `${KANITZ_RATING_META[summary.globalRating].color}50` }}
              >
                {KANITZ_RATING_META[summary.globalRating].icon} {summary.globalLabel}
              </Badge>
            </div>
            <CardDescription className="text-xs">
              Score médio consolidado de todos os meses analisados (BS &amp; Dados → Kanitz Automático).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3 rounded-lg bg-muted/30 text-center">
                <p className="text-[10px] text-muted-foreground">Score Médio</p>
                <p className="text-2xl font-bold font-mono">{summary.avg.toFixed(2)}</p>
              </div>
              <div className="p-3 rounded-lg bg-muted/30 text-center">
                <p className="text-[10px] text-muted-foreground">Mín. / Máx.</p>
                <p className="text-base font-bold font-mono">
                  <span className="text-red-500">{summary.min.toFixed(2)}</span>
                  <span className="text-muted-foreground mx-1">/</span>
                  <span className="text-emerald-500">{summary.max.toFixed(2)}</span>
                </p>
              </div>
              <div className="p-3 rounded-lg bg-muted/30 text-center">
                <p className="text-[10px] text-muted-foreground">Tendência</p>
                <div className="flex items-center justify-center gap-1">
                  {trendIcon}
                  <span className="text-base font-bold font-mono">
                    {summary.delta > 0 ? "+" : ""}{summary.delta.toFixed(2)}
                  </span>
                </div>
              </div>
              <div className="p-3 rounded-lg bg-muted/30 text-center">
                <p className="text-[10px] text-muted-foreground">Último Mês</p>
                <p className="text-sm font-semibold">{summary.latest?.mes}</p>
                <p className="text-base font-bold font-mono" style={{ color: summary.latest?.color }}>
                  {summary.latest?.score.toFixed(2)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Gráfico Linha — Evolução Mensal */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Activity className="w-4 h-4 text-accent" /> Evolução Mensal do Score Kanitz
          </CardTitle>
          <CardDescription className="text-xs">
            Linhas de referência destacam as zonas: 0 (saudável → atenção), −3 (atenção → risco), −7 (risco → insolvência).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div style={{ width: "100%", height: 280 }}>
            <ResponsiveContainer>
              <LineChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="mes" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" domain={["auto", "auto"]} />
                <RTooltip
                  contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", fontSize: 12 }}
                  labelStyle={{ color: "hsl(var(--foreground))" }}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <ReferenceLine y={0} stroke="hsl(150,70%,42%)" strokeDasharray="3 3" label={{ value: "0", fontSize: 10, fill: "hsl(150,70%,42%)" }} />
                <ReferenceLine y={-3} stroke="hsl(28,92%,55%)" strokeDasharray="3 3" label={{ value: "−3", fontSize: 10, fill: "hsl(28,92%,55%)" }} />
                <ReferenceLine y={-7} stroke="hsl(0,75%,55%)" strokeDasharray="3 3" label={{ value: "−7", fontSize: 10, fill: "hsl(0,75%,55%)" }} />
                <Line
                  type="monotone"
                  dataKey="score"
                  name="Score Kanitz"
                  stroke="hsl(217,91%,50%)"
                  strokeWidth={2.5}
                  dot={{ r: 5, strokeWidth: 2 }}
                  activeDot={{ r: 7 }}
                  label={{ position: "top", fontSize: 10, fill: "hsl(var(--foreground))" }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Cards por Mês */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Score por Mês — Visibilidade Individual</CardTitle>
          <CardDescription className="text-xs">
            Cada mês recebe seu próprio Termômetro de Insolvência com classificação A → D e insight automático.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {series.map(s => (
              <div
                key={s.mesKey}
                className="p-4 rounded-lg border space-y-2"
                style={{ backgroundColor: `${s.color}10`, borderColor: `${s.color}40` }}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-foreground">{s.mes}</span>
                  <Badge
                    variant="outline"
                    className="text-[10px]"
                    style={{ color: s.color, borderColor: `${s.color}60` }}
                  >
                    {KANITZ_RATING_META[s.rating].icon} {s.rating}
                  </Badge>
                </div>
                <p className="text-3xl font-bold font-mono text-center" style={{ color: s.color }}>
                  {s.score.toFixed(2)}
                </p>
                <p className="text-[10px] text-center font-semibold uppercase tracking-wide" style={{ color: s.color }}>
                  {s.ratingLabel}
                </p>
                <p className="text-[10px] text-muted-foreground leading-snug pt-1 border-t border-border/40">
                  {s.insight}
                </p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Memória de Cálculo Mensal */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Calculator className="w-4 h-4 text-accent" /> 
            Memória de Cálculo Mensal
            <FormulaInfo 
              title="Fator de Insolvência (FI)" 
              formula="FI = 0,05·RL + 1,65·LG + 3,55·LS − 1,06·LC − 0,33·GE" 
              accounts={[
                "RL (Rentabilidade do PL): Lucro Líquido / Patrimônio Líquido",
                "LG (Liquidez Geral): (Ativo Circulante + RLP) / (Passivo Circulante + PNC)",
                "LS (Liquidez Seca): (Ativo Circulante - Estoques) / Passivo Circulante",
                "LC (Liquidez Corrente): Ativo Circulante / Passivo Circulante",
                "GE (Grau de Endividamento): (Passivo Circulante + PNC) / Patrimônio Líquido"
              ]} 
            />
          </CardTitle>
          <CardDescription className="text-xs">
            K = 0,05·RL + 1,65·LG + 3,55·LS − 1,06·LC − 0,33·GE — fórmula de Kanitz aplicada por mês.
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-[10px]">Mês</TableHead>
                <TableHead className="text-[10px] text-right">RL<br/><span className="text-muted-foreground font-normal">Rentab. PL</span></TableHead>
                <TableHead className="text-[10px] text-right">LG<br/><span className="text-muted-foreground font-normal">Liq. Geral</span></TableHead>
                <TableHead className="text-[10px] text-right">LS<br/><span className="text-muted-foreground font-normal">Liq. Seca</span></TableHead>
                <TableHead className="text-[10px] text-right">LC<br/><span className="text-muted-foreground font-normal">Liq. Corr.</span></TableHead>
                <TableHead className="text-[10px] text-right">GE<br/><span className="text-muted-foreground font-normal">Grau Endiv.</span></TableHead>
                <TableHead className="text-[10px] text-right">Score (K)</TableHead>
                <TableHead className="text-[10px]">Rating</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {series.map(s => (
                <TableRow key={s.mesKey}>
                  <TableCell className="text-xs font-medium whitespace-nowrap">{s.mes}</TableCell>
                  <TableCell className="text-xs text-right font-mono">{s.rl.toFixed(4)}</TableCell>
                  <TableCell className="text-xs text-right font-mono">{s.lg.toFixed(4)}</TableCell>
                  <TableCell className="text-xs text-right font-mono">{s.ls.toFixed(4)}</TableCell>
                  <TableCell className="text-xs text-right font-mono">{s.lc.toFixed(4)}</TableCell>
                  <TableCell className="text-xs text-right font-mono">{s.ge.toFixed(4)}</TableCell>
                  <TableCell className="text-xs text-right font-mono font-bold" style={{ color: s.color }}>
                    {s.score.toFixed(4)}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-[10px]" style={{ color: s.color, borderColor: `${s.color}60` }}>
                      {s.rating}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <p className="text-[10px] text-muted-foreground mt-3 leading-relaxed">
            <strong>Proxies aplicados (transparência):</strong> Ativo Total = Ativo Circulante (quando ANC não capturado);
            PL = Ativo Total − Dívida Total. Estes proxies tornam o score conservador frente ao Kanitz clássico — utilize
            a aba "Validação" para o cálculo anual com BP+DRE completos.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

export default TabKanitz;
