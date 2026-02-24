import { useState } from "react";
import {
  Activity, BarChart3, Target, TrendingUp, TrendingDown,
  AlertTriangle, CheckCircle2, Calculator, Shield, Layers,
  AlertOctagon, Scale
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import type { ParsedFinancialData } from "@/services/auditAIService";

const fmt = (n: number) => new Intl.NumberFormat("pt-BR").format(Math.round(n));
const fmtPct = (n: number) => `${(n * 100).toFixed(2)}%`;
const fmtDec = (n: number) => n.toFixed(4);

/* ── Kanitz Computation ── */
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
}

const computeKanitz = (parsedData: ParsedFinancialData | null): KanitzResult[] => {
  if (!parsedData) return [];

  const findValue = (keyword: string, year: string) => {
    const allRows = [...parsedData.balanco, ...parsedData.dre];
    const row = allRows.find(r =>
      r.conta.toLowerCase().includes(keyword) || r.descricao.toLowerCase().includes(keyword)
    );
    return row?.values[year] || 0;
  };

  const results: KanitzResult[] = [];

  for (const year of parsedData.years) {
    const ac = Math.abs(findValue("total do ativo circulante", year) || findValue("ativo circulante", year));
    const anc = Math.abs(findValue("total do ativo não circulante", year) || findValue("ativo nao circulante", year));
    const pc = Math.abs(findValue("total do passivo circulante", year) || findValue("passivo circulante", year));
    const pnc = Math.abs(findValue("total do passivo não circulante", year) || findValue("passivo nao circulante", year));
    const pl = Math.abs(findValue("total do patrimônio", year) || findValue("patrimonio líquido", year) || findValue("patrimônio líquido", year));
    const estoque = Math.abs(findValue("estoque", year));
    const lucroLiquido = findValue("resultado do exercício", year) || findValue("lucro líquido", year);
    const rlp = Math.abs(findValue("realizável a longo prazo", year) || findValue("realizavel", year));

    const pt = pc + pnc;

    // Indicadores
    const rpl = pl !== 0 ? lucroLiquido / pl : 0;             // Rentabilidade do PL
    const lg = pt !== 0 ? (ac + rlp) / pt : 0;                 // Liquidez Geral
    const ls = pc !== 0 ? (ac - estoque) / pc : 0;             // Liquidez Seca
    const lc = pc !== 0 ? ac / pc : 0;                          // Liquidez Corrente
    const ge = pl !== 0 ? pt / pl : 0;                          // Grau de Endividamento

    // Fator de Insolvência
    const fi = (0.05 * rpl) + (1.65 * lg) + (3.55 * ls) - (1.06 * lc) - (0.33 * ge);

    // Classificação
    const classificacao: KanitzResult["classificacao"] =
      fi > 0 ? "solvente" : fi >= -3 ? "penumbra" : "insolvente";

    results.push({ year, rpl, lg, ls, lc, ge, fi, classificacao, riskScoreNormalized: 0 });
  }

  // Normalizar Risk Score (Min-Max)
  if (results.length > 0) {
    const fiValues = results.map(r => r.fi);
    const fiMin = Math.min(...fiValues);
    const fiMax = Math.max(...fiValues);
    const range = fiMax - fiMin || 1;
    results.forEach(r => {
      r.riskScoreNormalized = Math.round(((r.fi - fiMin) / range) * 100);
    });
  }

  return results;
};

const classColors = {
  solvente: { bg: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30", icon: "🟢", label: "Solvente" },
  penumbra: { bg: "bg-yellow-500/15 text-yellow-600 border-yellow-500/30", icon: "🟡", label: "Zona de Penumbra" },
  insolvente: { bg: "bg-red-500/15 text-red-600 border-red-500/30", icon: "🔴", label: "Insolvente" },
};

/* ══════════════════════════════════════════════════════
   TAB KANITZ – TERMÔMETRO DE INSOLVÊNCIA
   ══════════════════════════════════════════════════════ */
const TabKanitz = ({ parsedData, aiAnalysis }: { parsedData?: ParsedFinancialData | null; aiAnalysis?: any }) => {
  const [subTab, setSubTab] = useState("visao-geral");
  const kanitzResults = computeKanitz(parsedData || null);
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

  if (!parsedData || kanitzResults.length === 0) {
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
          <TabsTrigger value="indicadores" className="text-[10px]">Indicadores</TabsTrigger>
          <TabsTrigger value="calculo" className="text-[10px]">Cálculo do FI</TabsTrigger>
          <TabsTrigger value="classificacao" className="text-[10px]">Classificação</TabsTrigger>
          <TabsTrigger value="historico" className="text-[10px]">Histórico Evolutivo</TabsTrigger>
          <TabsTrigger value="risk-engine" className="text-[10px]">Risk Engine</TabsTrigger>
          <TabsTrigger value="relatorio" className="text-[10px]">Relatório</TabsTrigger>
        </TabsList>

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
                  <p className="text-xs font-semibold text-foreground mb-2">Fórmula do Fator de Insolvência:</p>
                  <code className="block text-[11px] font-mono leading-relaxed text-foreground">
                    FI = (0,05 × RPL) + (1,65 × LG) + (3,55 × LS) − (1,06 × LC) − (0,33 × GE)
                  </code>
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
                    { name: "Liquidez Geral", sigla: "LG", formula: "(AC + RLP) / PT", origem: "BP", peso: "1,65", key: "lg" as const },
                    { name: "Liquidez Seca", sigla: "LS", formula: "(AC - EST) / PC", origem: "BP", peso: "3,55", key: "ls" as const },
                    { name: "Liquidez Corrente", sigla: "LC", formula: "AC / PC", origem: "BP", peso: "-1,06", key: "lc" as const },
                    { name: "Grau de Endividamento", sigla: "GE", formula: "PT / PL", origem: "BP", peso: "-0,33", key: "ge" as const },
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

export default TabKanitz;
