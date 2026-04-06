import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Slider } from "@/components/ui/slider";
import { Calculator, TrendingUp, TrendingDown, AlertTriangle, Shield, BarChart3, Activity, PieChart, ArrowRight, Info, Bot, Brain, FileText, DollarSign, Gauge, SlidersHorizontal } from "lucide-react";
import { defaultEntityData, defaultFinancialAnalysis } from "@/data/auditMockData";
import PlatformLayout from "@/components/PlatformLayout";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

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

// ─── VPC Types ───────────────────────────────────────────────
interface PersonaVector {
  Rn: number; Cr: number; Sr: number; Da: number; Fl: number; Ap: number;
}

const personaLabels: Record<keyof PersonaVector, { label: string; desc: string }> = {
  Rn: { label: "Rigor Normativo (Rₙ)", desc: "Nível de aderência estrita às normas IFRS/CPC/NBC TA" },
  Cr: { label: "Conservadorismo de Risco (Cᵣ)", desc: "Tendência a classificar situações como risco mais elevado" },
  Sr: { label: "Sensibilidade a Risco (Sᵣ)", desc: "Capacidade de detectar sinais fracos de risco" },
  Da: { label: "Profundidade Analítica (Dₐ)", desc: "Extensão e detalhamento da análise técnica" },
  Fl: { label: "Formalidade Linguística (Fₗ)", desc: "Grau de tecnicidade no vocabulário e estilo do relatório" },
  Ap: { label: "Agressividade na Identificação (Aₚ)", desc: "Tendência a apontar desvios e inconsistências" },
};

const presetPersonas: { name: string; vec: PersonaVector }[] = [
  { name: "Conservador Técnico", vec: { Rn: 0.9, Cr: 0.8, Sr: 0.9, Da: 0.9, Fl: 0.8, Ap: 0.9 } },
  { name: "Executivo Estratégico", vec: { Rn: 0.6, Cr: 0.7, Sr: 0.7, Da: 0.6, Fl: 0.7, Ap: 0.6 } },
  { name: "Analítico Moderado", vec: { Rn: 0.7, Cr: 0.6, Sr: 0.6, Da: 0.8, Fl: 0.6, Ap: 0.5 } },
];

const calcScore = (v: PersonaVector) => (v.Rn + v.Cr + v.Sr + v.Da + v.Fl + v.Ap) / 6;

// ─── VPC Persona Tab ─────────────────────────────────────────
const TabPersona = () => {
  const [persona, setPersona] = useState<PersonaVector>(presetPersonas[0].vec);
  const [alpha, setAlpha] = useState(0.7);
  const [activePreset, setActivePreset] = useState(0);

  const score = calcScore(persona);

  const applyPreset = (idx: number) => {
    setActivePreset(idx);
    setPersona(presetPersonas[idx].vec);
  };

  const updateVar = (key: keyof PersonaVector, val: number) => {
    setActivePreset(-1);
    setPersona(prev => ({ ...prev, [key]: val }));
  };

  return (
    <div className="space-y-6">
      <SectionTitle icon={SlidersHorizontal} title="Vetor de Persona Configurável (VPC)" subtitle="Modelo matemático de configuração comportamental dos agentes" />

      {/* Concept */}
      <Card>
        <CardContent className="p-5 space-y-4">
          <FormulaBlock formula="P = (Rₙ, Cᵣ, Sᵣ, Dₐ, Fₗ, Aₚ)    onde cada variável ∈ [0, 1]" description="Vetor matemático que define o comportamento técnico, rigor e perfil decisório de cada agente" />
          <FormulaBlock formula="O = B + α·P" description="O = Output final | B = Resultado base do LLM | P = Vetor persona | α = Peso de influência do Gestor" />
          <FormulaBlock formula="Score_Agente = (Rₙ + Cᵣ + Sᵣ + Dₐ + Fₗ + Aₚ) / 6" description="Determina: nível de detalhamento, número de alertas, extensão do relatório, grau de criticidade" />
        </CardContent>
      </Card>

      {/* Presets */}
      <div>
        <h4 className="text-sm font-semibold text-foreground mb-3">Personas Pré-configuradas</h4>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {presetPersonas.map((p, i) => (
            <button
              key={i}
              onClick={() => applyPreset(i)}
              className={`text-left p-4 rounded-xl border transition-all ${
                activePreset === i ? "border-[hsl(258,90%,66%)] bg-[hsl(258,90%,66%)]/5 shadow-md" : "border-border bg-card hover:border-muted-foreground/30"
              }`}
            >
              <h5 className="font-semibold text-sm text-foreground">{p.name}</h5>
              <p className="text-xs text-muted-foreground mt-1">Score: {fmt(calcScore(p.vec), 2)}</p>
              <div className="flex gap-1 mt-2">
                {(Object.keys(p.vec) as (keyof PersonaVector)[]).map(k => (
                  <div key={k} className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                    <div className="h-full rounded-full bg-[hsl(258,90%,66%)]" style={{ width: `${p.vec[k] * 100}%` }} />
                  </div>
                ))}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Sliders */}
      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Gauge className="w-4 h-4 text-[hsl(258,90%,66%)]" /> Configuração do Vetor P
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            {(Object.keys(persona) as (keyof PersonaVector)[]).map(key => (
              <div key={key} className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-foreground">{personaLabels[key].label}</span>
                  <span className="text-sm font-bold font-mono text-[hsl(258,90%,66%)]">{fmt(persona[key], 2)}</span>
                </div>
                <Slider
                  value={[persona[key] * 100]}
                  onValueChange={([v]) => updateVar(key, v / 100)}
                  max={100}
                  step={1}
                  className="[&_[role=slider]]:border-[hsl(258,90%,66%)] [&_[role=slider]]:bg-card [&_span[data-orientation]]:bg-[hsl(258,90%,66%)]"
                />
                <p className="text-xs text-muted-foreground">{personaLabels[key].desc}</p>
              </div>
            ))}

            {/* Alpha */}
            <div className="pt-3 border-t border-border space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-foreground">Peso de Influência (α)</span>
                <span className="text-sm font-bold font-mono text-[hsl(38,90%,55%)]">{fmt(alpha, 2)}</span>
              </div>
              <Slider
                value={[alpha * 100]}
                onValueChange={([v]) => setAlpha(v / 100)}
                max={100}
                step={1}
                className="[&_[role=slider]]:border-[hsl(38,90%,55%)] [&_[role=slider]]:bg-card [&_span[data-orientation]]:bg-[hsl(38,90%,55%)]"
              />
              <p className="text-xs text-muted-foreground">Define o quanto o vetor persona influencia o output do LLM</p>
            </div>
          </CardContent>
        </Card>

        {/* Score & Radar Summary */}
        <div className="space-y-4">
          <Card className="bg-gradient-to-br from-[hsl(258,90%,66%)]/5 to-transparent border-[hsl(258,90%,66%)]/20">
            <CardContent className="p-5 space-y-4">
              <h4 className="text-sm font-semibold text-foreground">Score Global do Agente</h4>
              <div className="text-center py-4">
                <div className="text-5xl font-bold font-mono text-[hsl(258,90%,66%)]">{fmt(score, 3)}</div>
                <p className="text-xs text-muted-foreground mt-2">Score = (Rₙ + Cᵣ + Sᵣ + Dₐ + Fₗ + Aₚ) / 6</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {(Object.keys(persona) as (keyof PersonaVector)[]).map(key => (
                  <div key={key} className="flex items-center justify-between p-2 rounded-lg bg-background/60">
                    <span className="text-xs text-muted-foreground">{key}</span>
                    <div className="flex items-center gap-2">
                      <div className="w-16 h-1.5 rounded-full bg-muted overflow-hidden">
                        <div className="h-full rounded-full bg-[hsl(258,90%,66%)]" style={{ width: `${persona[key] * 100}%` }} />
                      </div>
                      <span className="text-xs font-bold font-mono text-foreground">{fmt(persona[key], 1)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Governance Matrix */}
          <Card>
            <CardContent className="p-5 space-y-3">
              <h4 className="text-sm font-semibold text-foreground">Matriz de Governança IA</h4>
              <FormulaBlock formula={`RiskGovernanceIndex = IRC × Score_Agente`} description="Permite comparação entre agentes, benchmark interno e controle de calibragem" />
              <div className="space-y-2 text-sm">
                <div className="flex justify-between p-2 rounded-lg bg-muted/50">
                  <span className="text-muted-foreground">Score Agente</span>
                  <span className="font-bold font-mono">{fmt(score, 3)}</span>
                </div>
                <div className="flex justify-between p-2 rounded-lg bg-muted/50">
                  <span className="text-muted-foreground">α (Influência)</span>
                  <span className="font-bold font-mono">{fmt(alpha, 2)}</span>
                </div>
                <div className="flex justify-between p-2 rounded-lg bg-[hsl(258,90%,66%)]/5 border border-[hsl(258,90%,66%)]/20">
                  <span className="font-semibold text-foreground">Impacto Efetivo (α × Score)</span>
                  <span className="font-bold font-mono text-[hsl(258,90%,66%)]">{fmt(alpha * score, 3)}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Presets Table */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Comparativo de Personas</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Persona</TableHead>
                <TableHead className="text-center">Rₙ</TableHead>
                <TableHead className="text-center">Cᵣ</TableHead>
                <TableHead className="text-center">Sᵣ</TableHead>
                <TableHead className="text-center">Dₐ</TableHead>
                <TableHead className="text-center">Fₗ</TableHead>
                <TableHead className="text-center">Aₚ</TableHead>
                <TableHead className="text-center">Score</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {presetPersonas.map((p, i) => (
                <TableRow key={i} className={activePreset === i ? "bg-[hsl(258,90%,66%)]/5" : ""}>
                  <TableCell className="font-medium">{p.name}</TableCell>
                  {(Object.keys(p.vec) as (keyof PersonaVector)[]).map(k => (
                    <TableCell key={k} className="text-center font-mono text-sm">{p.vec[k]}</TableCell>
                  ))}
                  <TableCell className="text-center font-mono text-sm font-bold text-[hsl(258,90%,66%)]">{fmt(calcScore(p.vec), 2)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

// ─── Agent-Specific Formula Tabs ─────────────────────────────
const TabAgenteAuditor = () => {
  const [persona] = useState<PersonaVector>(presetPersonas[0].vec);

  const baseWeights = [0.25, 0.20, 0.20, 0.20, 0.15];
  const adjustedWeights = baseWeights.map(w => w * (1 + persona.Cr + persona.Sr));
  const materialidadeBase = 500000;
  const materialidade = materialidadeBase * (1 - persona.Rn);

  return (
    <div className="space-y-6">
      <SectionTitle icon={Bot} title="Agente Auditor Contábil" subtitle="Framework: IFRS · CPC · NBC TA · CFC" />

      <div className="grid md:grid-cols-2 gap-6">
        {/* IRC */}
        <Card>
          <CardContent className="p-5 space-y-4">
            <h4 className="text-sm font-semibold text-foreground">Índice de Risco Contábil (IRC)</h4>
            <FormulaBlock formula="IRC = w₁·LI + w₂·AL + w₃·ROA + w₄·LC + w₅·NE" description="Pesos ajustados pela persona: wᵢ = wᵢ × (1 + Cᵣ + Sᵣ)" />
            <div className="space-y-2">
              {["LI (Liquidez Imediata)", "AL (Alavancagem)", "ROA (Retorno s/ Ativos)", "LC (Liquidez Corrente)", "NE (Inconsist. Notas)"].map((label, i) => (
                <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-muted/50 text-sm">
                  <span className="text-muted-foreground">{label}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground">Base: {fmt(baseWeights[i], 2)}</span>
                    <ArrowRight className="w-3 h-3 text-muted-foreground" />
                    <span className="font-bold font-mono text-[hsl(258,90%,66%)]">{fmt(adjustedWeights[i], 3)}</span>
                  </div>
                </div>
              ))}
            </div>
            <div className="bg-[hsl(258,90%,66%)]/5 p-3 rounded-lg border border-[hsl(258,90%,66%)]/20 text-xs text-muted-foreground">
              <strong>Efeito persona:</strong> Alta sensibilidade a risco (Sᵣ={persona.Sr}) + Conservadorismo (Cᵣ={persona.Cr}) → pesos amplificados em {fmt(1 + persona.Cr + persona.Sr, 1)}×
            </div>
          </CardContent>
        </Card>

        {/* Materialidade */}
        <Card>
          <CardContent className="p-5 space-y-4">
            <h4 className="text-sm font-semibold text-foreground">Índice de Materialidade Dinâmica</h4>
            <FormulaBlock formula="Materialidade = Base × (1 − Rₙ)" description="Auditor mais rigoroso → menor tolerância → materialidade reduzida" />
            <div className="space-y-3">
              <div className="flex justify-between p-2 rounded-lg bg-muted/50 text-sm">
                <span className="text-muted-foreground">Base</span>
                <span className="font-mono">R$ {(materialidadeBase).toLocaleString("pt-BR")}</span>
              </div>
              <div className="flex justify-between p-2 rounded-lg bg-muted/50 text-sm">
                <span className="text-muted-foreground">Rigor Normativo (Rₙ)</span>
                <span className="font-mono">{persona.Rn}</span>
              </div>
              <div className="flex justify-between p-3 rounded-lg bg-[hsl(258,90%,66%)]/5 border border-[hsl(258,90%,66%)]/20 text-sm">
                <span className="font-semibold text-foreground">Materialidade Ajustada</span>
                <span className="font-bold font-mono text-[hsl(258,90%,66%)]">R$ {materialidade.toLocaleString("pt-BR")}</span>
              </div>
            </div>
            <div className="bg-amber-500/5 p-3 rounded-lg border border-amber-500/20 text-xs text-muted-foreground">
              Rₙ = {persona.Rn} → Tolerância: {fmt((1 - persona.Rn) * 100)}% → Materialidade {persona.Rn > 0.7 ? "reduzida (alta exigência)" : "ampla (baixa exigência)"}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

const TabAgenteFinanceiro = () => {
  const [persona] = useState<PersonaVector>(presetPersonas[0].vec);

  const varBase = 2500000;
  const varAdj = varBase * (1 + persona.Sr + persona.Cr);
  const betaBase = [0.4, 0.35, 0.25];
  const betaAdj = betaBase.map(b => b * (1 + persona.Da));
  const nBaseSimulations = 10000;
  const nAdj = Math.round(nBaseSimulations * (1 + persona.Da));

  return (
    <div className="space-y-6">
      <SectionTitle icon={DollarSign} title="Agente Financeiro" subtitle="VAR · Stress Testing · Monte Carlo" />

      <div className="grid md:grid-cols-3 gap-4">
        {/* VAR */}
        <Card>
          <CardContent className="p-5 space-y-4">
            <h4 className="text-sm font-semibold text-foreground">VAR Ajustado por Persona</h4>
            <FormulaBlock formula="VAR_adj = VAR × (1 + Sᵣ + Cᵣ)" />
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">VAR Base</span><span className="font-mono">R$ {varBase.toLocaleString("pt-BR")}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Sᵣ + Cᵣ</span><span className="font-mono">{fmt(persona.Sr + persona.Cr, 1)}</span></div>
              <hr className="border-border" />
              <div className="flex justify-between p-2 rounded-lg bg-[hsl(258,90%,66%)]/5">
                <span className="font-semibold">VAR Ajustado</span>
                <span className="font-bold font-mono text-[hsl(258,90%,66%)]">R$ {varAdj.toLocaleString("pt-BR")}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Stress */}
        <Card>
          <CardContent className="p-5 space-y-4">
            <h4 className="text-sm font-semibold text-foreground">Score Stress Financeiro</h4>
            <FormulaBlock formula="SF = β₁·Endiv + β₂·Fluxo + β₃·Juros\nβᵢ = βᵢ × (1 + Dₐ)" />
            <div className="space-y-2 text-sm">
              {["Endividamento", "Fluxo de Caixa", "Juros"].map((label, i) => (
                <div key={i} className="flex justify-between p-2 rounded-lg bg-muted/50">
                  <span className="text-muted-foreground">{label}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">{fmt(betaBase[i], 2)}</span>
                    <ArrowRight className="w-3 h-3 text-muted-foreground" />
                    <span className="font-bold font-mono text-[hsl(258,90%,66%)]">{fmt(betaAdj[i], 3)}</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Monte Carlo */}
        <Card>
          <CardContent className="p-5 space-y-4">
            <h4 className="text-sm font-semibold text-foreground">Simulação Monte Carlo</h4>
            <FormulaBlock formula="N = N_base × (1 + Dₐ)" description="Agente mais técnico → mais simulações → maior precisão" />
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">N Base</span><span className="font-mono">{nBaseSimulations.toLocaleString("pt-BR")}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Dₐ</span><span className="font-mono">{persona.Da}</span></div>
              <hr className="border-border" />
              <div className="flex justify-between p-2 rounded-lg bg-[hsl(258,90%,66%)]/5">
                <span className="font-semibold">N Ajustado</span>
                <span className="font-bold font-mono text-[hsl(258,90%,66%)]">{nAdj.toLocaleString("pt-BR")}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

const TabAgenteRelatorio = () => {
  const [persona] = useState<PersonaVector>(presetPersonas[0].vec);

  const ctBase = 50;
  const gamma = 30;
  const ct = ctBase + persona.Fl * gamma;
  const irc = 0.72; // mock
  const alertLevel = irc * (persona.Ap + persona.Cr);

  return (
    <div className="space-y-6">
      <SectionTitle icon={FileText} title="Agente de Relatório" subtitle="Consolidação · Parecer · Sumário Executivo" />

      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardContent className="p-5 space-y-4">
            <h4 className="text-sm font-semibold text-foreground">Índice de Complexidade Textual</h4>
            <FormulaBlock formula="CT = Base + (Fₗ × γ)" description="Formalidade alta → vocabulário técnico elevado" />
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Base</span><span className="font-mono">{ctBase}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Fₗ (Formalidade)</span><span className="font-mono">{persona.Fl}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">γ (gamma)</span><span className="font-mono">{gamma}</span></div>
              <hr className="border-border" />
              <div className="flex justify-between p-2 rounded-lg bg-[hsl(258,90%,66%)]/5">
                <span className="font-semibold">CT Final</span>
                <span className="font-bold font-mono text-[hsl(258,90%,66%)]">{fmt(ct, 1)}</span>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">{ct > 70 ? "→ Linguagem altamente técnica com termos normativos" : ct > 55 ? "→ Linguagem técnica moderada" : "→ Linguagem simplificada/executiva"}</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5 space-y-4">
            <h4 className="text-sm font-semibold text-foreground">Intensidade de Alerta no Relatório</h4>
            <FormulaBlock formula="AlertLevel = IRC × (Aₚ + Cᵣ)" description="Persona agressiva → mais destaque visual de risco" />
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">IRC (mock)</span><span className="font-mono">{irc}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Aₚ + Cᵣ</span><span className="font-mono">{fmt(persona.Ap + persona.Cr, 1)}</span></div>
              <hr className="border-border" />
              <div className="flex justify-between p-2 rounded-lg bg-[hsl(258,90%,66%)]/5">
                <span className="font-semibold">Alert Level</span>
                <span className="font-bold font-mono text-[hsl(258,90%,66%)]">{fmt(alertLevel, 3)}</span>
              </div>
            </div>
            <div className={`p-3 rounded-lg text-xs ${alertLevel > 1 ? "bg-red-500/10 text-red-600 border border-red-500/20" : alertLevel > 0.7 ? "bg-amber-500/10 text-amber-600 border border-amber-500/20" : "bg-emerald-500/10 text-emerald-600 border border-emerald-500/20"}`}>
              {alertLevel > 1 ? "⚠ Alta intensidade — relatório com alertas visuais agressivos" : alertLevel > 0.7 ? "Moderada — relatório equilibrado com destaques de risco" : "Suave — relatório com tom neutro"}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

// ─── Risk Engine Consolidado ─────────────────────────────────
const TabRiskEngine = () => {
  const [persona, setPersona] = useState<PersonaVector>(presetPersonas[0].vec);
  const [weights, setWeights] = useState({ wA: 0.40, wF: 0.35, wR: 0.25 });
  const [lambda, setLambda] = useState(0.15);

  // Mock base scores (would come from real agent outputs)
  const mockIRC = 0.72;
  const mockInconsistencias = 0.45;
  const mockMaterialidade = 0.38;
  const mockVARAdj = 0.65;
  const mockSFStress = 0.58;
  const mockAlavancagem = 0.71;
  const mockAlertLevel = 0.62;
  const mockComplexidadeRisco = 0.55;
  const mockFreqDesvios = 0.48;

  // 2.1 Score Auditor (SA)
  const SA = (mockIRC + mockInconsistencias + mockMaterialidade) / 3;
  // 2.2 Score Financeiro (SF)
  const SF = (mockVARAdj + mockSFStress + mockAlavancagem) / 3;
  // 2.3 Score Narrativo (SR)
  const SR = (mockAlertLevel + mockComplexidadeRisco + mockFreqDesvios) / 3;

  // Normalização Min-Max (scores already 0-1 in mock)
  const scores = [SA, SF, SR];
  const sMin = Math.min(...scores);
  const sMax = Math.max(...scores);
  const normalize = (x: number) => sMax === sMin ? 0.5 : (x - sMin) / (sMax - sMin);
  const SA_norm = normalize(SA);
  const SF_norm = normalize(SF);
  const SR_norm = normalize(SR);

  // Correlação mock (calculada a partir de dados simulados)
  const rhoAF = 0.78;
  const rhoAR = 0.52;
  const rhoFR = 0.61;
  const corrFactor = (rhoAF + rhoAR + rhoFR) / 3;

  // Persona scores por agente
  const scorePersonaA = (persona.Rn + persona.Cr + persona.Sr + persona.Da + persona.Ap) / 5;
  const scorePersonaF = (persona.Rn + persona.Cr + persona.Sr + persona.Da + persona.Ap) / 5;
  const scorePersonaR = (persona.Rn + persona.Cr + persona.Sr + persona.Da + persona.Ap) / 5;

  // Pesos ajustados por persona (seção 6)
  const wA_adj = weights.wA * (1 + scorePersonaA);
  const wF_adj = weights.wF * (1 + scorePersonaF);
  const wR_adj = weights.wR * (1 + scorePersonaR);

  // ECRS (seção 5)
  const ECRS = wA_adj * SA_norm + wF_adj * SF_norm + wR_adj * SR_norm + lambda * corrFactor;

  // Normalizar ECRS para [0,1]
  const ECRSNorm = Math.min(ECRS / (wA_adj + wF_adj + wR_adj + lambda), 1);

  // Risco Sistêmico (seção 7)
  const systemicRisk = ECRSNorm * corrFactor;
  const systemicAlert = corrFactor > 0.7 && ECRSNorm > 0.75;

  // Classificação (seção 8)
  const getClassification = (score: number): { label: string; level: RiskLevel } => {
    if (score <= 0.30) return { label: "Baixo Risco", level: "Saudável" };
    if (score <= 0.60) return { label: "Risco Moderado", level: "Moderado" };
    if (score <= 0.80) return { label: "Alto Risco", level: "Alto" };
    return { label: "Risco Crítico", level: "Crítico" };
  };

  const classification = getClassification(ECRSNorm);

  // Histórico mock
  const historicalData = [
    { month: "Set", ecrs: 0.42, sa: 0.45, sf: 0.38, sr: 0.35 },
    { month: "Out", ecrs: 0.48, sa: 0.50, sf: 0.42, sr: 0.40 },
    { month: "Nov", ecrs: 0.52, sa: 0.48, sf: 0.55, sr: 0.45 },
    { month: "Dez", ecrs: 0.58, sa: 0.52, sf: 0.60, sr: 0.50 },
    { month: "Jan", ecrs: 0.55, sa: 0.50, sf: 0.58, sr: 0.48 },
    { month: "Fev", ecrs: ECRSNorm, sa: SA, sf: SF, sr: SR },
  ];

  return (
    <div className="space-y-6">
      <SectionTitle icon={Activity} title="Risk Engine Consolidado Multiagente (ECRS)" subtitle="Motor matemático central — Score estratégico auditável" />

      {/* Architecture Flow */}
      <Card>
        <CardContent className="p-5">
          <h4 className="text-sm font-semibold text-foreground mb-3">Fluxo Arquitetural</h4>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {["Inputs", "Agentes Individuais", "Normalização", "Correlação", "Motor Consolidado", "Classificação", "Alertas", "Relatório"].map((step, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className={`px-3 py-1.5 rounded-lg font-medium ${i === 4 ? "bg-[hsl(258,90%,66%)] text-white" : "bg-muted text-foreground"}`}>{step}</span>
                {i < 7 && <ArrowRight className="w-3 h-3 text-muted-foreground" />}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Scores Base dos 3 Agentes */}
      <div className="grid md:grid-cols-3 gap-4">
        {[
          { name: "Score Auditor (SA)", score: SA, norm: SA_norm, formula: "SA = (IRC + Inconsistências + Materialidade) / 3", items: [{ k: "IRC", v: mockIRC }, { k: "Inconsistências", v: mockInconsistencias }, { k: "Materialidade", v: mockMaterialidade }], color: "hsl(258,90%,66%)" },
          { name: "Score Financeiro (SF)", score: SF, norm: SF_norm, formula: "SF = (VAR_adj + SF_stress + Alavancagem) / 3", items: [{ k: "VAR Ajustado", v: mockVARAdj }, { k: "Stress Financeiro", v: mockSFStress }, { k: "Alavancagem", v: mockAlavancagem }], color: "hsl(38,90%,55%)" },
          { name: "Score Narrativo (SR)", score: SR, norm: SR_norm, formula: "SR = (AlertLevel + Complexidade + Desvios) / 3", items: [{ k: "Alert Level", v: mockAlertLevel }, { k: "Complexidade", v: mockComplexidadeRisco }, { k: "Freq. Desvios", v: mockFreqDesvios }], color: "hsl(152,70%,45%)" },
        ].map((agent, i) => (
          <Card key={i} style={{ borderTopColor: agent.color, borderTopWidth: 3 }}>
            <CardContent className="p-5 space-y-3">
              <h4 className="text-sm font-semibold text-foreground">{agent.name}</h4>
              <FormulaBlock formula={agent.formula} />
              <div className="space-y-1.5">
                {agent.items.map((item, j) => (
                  <div key={j} className="flex justify-between text-sm p-1.5 rounded bg-muted/50">
                    <span className="text-muted-foreground">{item.k}</span>
                    <span className="font-mono font-bold" style={{ color: agent.color }}>{fmt(item.v, 3)}</span>
                  </div>
                ))}
              </div>
              <div className="pt-2 border-t border-border space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Score Base</span>
                  <span className="font-bold font-mono">{fmt(agent.score, 4)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Score Normalizado</span>
                  <span className="font-bold font-mono" style={{ color: agent.color }}>{fmt(agent.norm, 4)}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Normalização */}
      <Card>
        <CardContent className="p-5 space-y-3">
          <h4 className="text-sm font-semibold text-foreground">Normalização Min-Max</h4>
          <FormulaBlock formula="Score_norm = (X − X_min) / (X_max − X_min)" description="Todos os scores normalizados para [0, 1] antes da consolidação" />
          <div className="grid grid-cols-3 gap-3">
            {[{ label: "SA", raw: SA, norm: SA_norm }, { label: "SF", raw: SF, norm: SF_norm }, { label: "SR", raw: SR, norm: SR_norm }].map((s, i) => (
              <div key={i} className="text-center p-3 rounded-lg bg-muted/50">
                <p className="text-xs text-muted-foreground">{s.label}: {fmt(s.raw, 3)}</p>
                <ArrowRight className="w-3 h-3 text-muted-foreground mx-auto my-1" />
                <p className="font-bold font-mono text-[hsl(258,90%,66%)]">{fmt(s.norm, 4)}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Matriz de Correlação + Motor Consolidado */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Correlation Matrix */}
        <Card>
          <CardContent className="p-5 space-y-4">
            <h4 className="text-sm font-semibold text-foreground">Matriz de Correlação entre Riscos</h4>
            <div className="overflow-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="p-2 text-left text-muted-foreground"></th>
                    <th className="p-2 text-center font-semibold">Auditor (A)</th>
                    <th className="p-2 text-center font-semibold">Financeiro (F)</th>
                    <th className="p-2 text-center font-semibold">Relatório (R)</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    { label: "Auditor (A)", vals: [1, rhoAF, rhoAR] },
                    { label: "Financeiro (F)", vals: [rhoAF, 1, rhoFR] },
                    { label: "Relatório (R)", vals: [rhoAR, rhoFR, 1] },
                  ].map((row, i) => (
                    <tr key={i} className="border-b border-border last:border-0">
                      <td className="p-2 font-semibold text-foreground">{row.label}</td>
                      {row.vals.map((v, j) => (
                        <td key={j} className="p-2 text-center">
                          <span className={`font-mono font-bold px-2 py-1 rounded ${v === 1 ? "bg-muted text-foreground" : v > 0.7 ? "bg-red-500/10 text-red-600" : v > 0.5 ? "bg-amber-500/10 text-amber-600" : "bg-emerald-500/10 text-emerald-600"}`}>
                            {fmt(v, 2)}
                          </span>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex justify-between text-sm p-3 rounded-lg bg-[hsl(258,90%,66%)]/5 border border-[hsl(258,90%,66%)]/20">
              <span className="font-semibold text-foreground">CorrFactor (ρ̄)</span>
              <span className="font-bold font-mono text-[hsl(258,90%,66%)]">{fmt(corrFactor, 4)}</span>
            </div>
            {rhoAF > 0.7 && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 flex items-center gap-2 text-xs">
                <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
                <span className="text-red-600 font-medium">ρ_AF = {fmt(rhoAF, 2)} {">"} 0.7 → Alta correlação Auditor-Financeiro → Risco sistêmico potencial</span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ECRS Consolidado */}
        <Card className="bg-gradient-to-br from-[hsl(258,90%,66%)]/5 to-transparent border-[hsl(258,90%,66%)]/20">
          <CardContent className="p-5 space-y-4">
            <h4 className="text-sm font-semibold text-foreground">EBEX Consolidated Risk Score (ECRS)</h4>
            <FormulaBlock formula="ECRS = w_A·SA + w_F·SF + w_R·SR + λ·CorrFactor" description="w_i^adj = w_i × (1 + ScorePersona_i)" />

            {/* Pesos configuráveis */}
            <div className="space-y-3">
              {[
                { label: "Peso Auditor (w_A)", key: "wA" as const, base: weights.wA, adj: wA_adj },
                { label: "Peso Financeiro (w_F)", key: "wF" as const, base: weights.wF, adj: wF_adj },
                { label: "Peso Relatório (w_R)", key: "wR" as const, base: weights.wR, adj: wR_adj },
              ].map((w) => (
                <div key={w.key} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">{w.label}</span>
                    <span className="font-mono">
                      {fmt(w.base, 2)} <ArrowRight className="w-2.5 h-2.5 inline text-muted-foreground mx-1" /> <span className="font-bold text-[hsl(258,90%,66%)]">{fmt(w.adj, 3)}</span>
                    </span>
                  </div>
                  <Slider
                    value={[w.base * 100]}
                    onValueChange={([v]) => setWeights(prev => ({ ...prev, [w.key]: v / 100 }))}
                    max={100} step={1}
                    className="[&_[role=slider]]:border-[hsl(258,90%,66%)] [&_[role=slider]]:bg-card [&_span[data-orientation]]:bg-[hsl(258,90%,66%)]"
                  />
                </div>
              ))}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Lambda (λ) — Amplificação Sistêmica</span>
                  <span className="font-mono font-bold text-[hsl(38,90%,55%)]">{fmt(lambda, 2)}</span>
                </div>
                <Slider
                  value={[lambda * 100]}
                  onValueChange={([v]) => setLambda(v / 100)}
                  max={50} step={1}
                  className="[&_[role=slider]]:border-[hsl(38,90%,55%)] [&_[role=slider]]:bg-card [&_span[data-orientation]]:bg-[hsl(38,90%,55%)]"
                />
              </div>
            </div>

            {/* Score Final */}
            <div className="text-center p-4 rounded-xl border border-[hsl(258,90%,66%)]/30 bg-background/80">
              <p className="text-xs text-muted-foreground mb-1">ECRS Consolidado</p>
              <div className="text-5xl font-bold font-mono text-[hsl(258,90%,66%)]">{fmt(ECRSNorm, 4)}</div>
              <div className="mt-2">{getRiskBadge(classification.level)}</div>
              <p className="text-sm font-semibold text-foreground mt-1">{classification.label}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Risco Sistêmico + Classificação */}
      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardContent className="p-5 space-y-4">
            <h4 className="text-sm font-semibold text-foreground">Detecção de Risco Sistêmico</h4>
            <FormulaBlock formula="SystemicRisk = ECRS × ρ̄" description="Gatilho: ρ̄ > 0.7 AND ECRS > 0.75 → Alerta Crítico" />
            <div className="space-y-2 text-sm">
              <div className="flex justify-between p-2 rounded-lg bg-muted/50">
                <span className="text-muted-foreground">ECRS</span>
                <span className="font-mono font-bold">{fmt(ECRSNorm, 4)}</span>
              </div>
              <div className="flex justify-between p-2 rounded-lg bg-muted/50">
                <span className="text-muted-foreground">ρ̄ (Correlação Média)</span>
                <span className="font-mono font-bold">{fmt(corrFactor, 4)}</span>
              </div>
              <div className="flex justify-between p-3 rounded-lg bg-[hsl(258,90%,66%)]/5 border border-[hsl(258,90%,66%)]/20">
                <span className="font-semibold text-foreground">Systemic Risk</span>
                <span className="font-bold font-mono text-[hsl(258,90%,66%)]">{fmt(systemicRisk, 4)}</span>
              </div>
            </div>
            {systemicAlert ? (
              <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-red-500 shrink-0" />
                <div>
                  <p className="text-sm font-bold text-red-600">⚠ ALERTA CRÍTICO — Risco Sistêmico Detectado</p>
                  <p className="text-xs text-red-500 mt-0.5">Correlação e ECRS acima dos limites — revisão urgente recomendada</p>
                </div>
              </div>
            ) : (
              <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-3 flex items-center gap-2">
                <Shield className="w-4 h-4 text-emerald-500 shrink-0" />
                <span className="text-xs text-emerald-600 font-medium">Sem alerta sistêmico ativo. Indicadores dentro dos limites aceitáveis.</span>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5 space-y-4">
            <h4 className="text-sm font-semibold text-foreground">Tabela de Classificação Final</h4>
            <div className="overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Faixa</TableHead>
                    <TableHead>Classificação</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[
                    { range: "0 – 0.30", label: "Baixo Risco", level: "Saudável" as RiskLevel },
                    { range: "0.31 – 0.60", label: "Risco Moderado", level: "Moderado" as RiskLevel },
                    { range: "0.61 – 0.80", label: "Alto Risco", level: "Alto" as RiskLevel },
                    { range: "0.81 – 1.00", label: "Risco Crítico", level: "Crítico" as RiskLevel },
                  ].map((row) => {
                    const isActive = classification.label === row.label;
                    return (
                      <TableRow key={row.range} className={isActive ? "bg-[hsl(258,90%,66%)]/5" : ""}>
                        <TableCell className="font-mono text-sm">{row.range}</TableCell>
                        <TableCell className="font-medium">{row.label}</TableCell>
                        <TableCell className="text-center">
                          {isActive ? <Badge className="bg-[hsl(258,90%,66%)] text-white">← Atual</Badge> : getRiskBadge(row.level)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Ajuste por Persona */}
      <Card>
        <CardContent className="p-5 space-y-4">
          <h4 className="text-sm font-semibold text-foreground">Ajuste por Persona (VPC)</h4>
          <FormulaBlock formula="w_i^adj = w_i × (1 + ScorePersona_i)\nScorePersona = (Rₙ + Cᵣ + Sᵣ + Dₐ + Aₚ) / 5" description="O vetor persona amplifica os pesos proporcionalmente ao perfil do agente" />
          <div className="grid md:grid-cols-3 gap-4">
            {[
              { name: "Auditor", scoreP: scorePersonaA, wBase: weights.wA, wAdj: wA_adj },
              { name: "Financeiro", scoreP: scorePersonaF, wBase: weights.wF, wAdj: wF_adj },
              { name: "Relatório", scoreP: scorePersonaR, wBase: weights.wR, wAdj: wR_adj },
            ].map((a, i) => (
              <div key={i} className="p-4 rounded-xl bg-muted/50 space-y-2">
                <p className="text-sm font-semibold text-foreground">{a.name}</p>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">ScorePersona</span>
                  <span className="font-mono font-bold">{fmt(a.scoreP, 3)}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Peso Base</span>
                  <span className="font-mono">{fmt(a.wBase, 2)}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Peso Ajustado</span>
                  <span className="font-mono font-bold text-[hsl(258,90%,66%)]">{fmt(a.wAdj, 3)}</span>
                </div>
                <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
                  <div className="h-full rounded-full bg-[hsl(258,90%,66%)]" style={{ width: `${Math.min(a.wAdj * 100, 100)}%` }} />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Histórico Temporal */}
      <Card>
        <CardContent className="p-5 space-y-4">
          <h4 className="text-sm font-semibold text-foreground">Histórico Temporal ECRS</h4>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={historicalData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(214,20%,88%)" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="hsl(215,12%,50%)" />
              <YAxis domain={[0, 1]} tick={{ fontSize: 11 }} stroke="hsl(215,12%,50%)" />
              <Tooltip />
              <Line type="monotone" dataKey="ecrs" stroke="hsl(258,90%,66%)" strokeWidth={2.5} dot={{ fill: "hsl(258,90%,66%)", r: 4 }} name="ECRS" />
              <Line type="monotone" dataKey="sa" stroke="hsl(200,90%,50%)" strokeWidth={1.5} strokeDasharray="4 2" dot={false} name="SA" />
              <Line type="monotone" dataKey="sf" stroke="hsl(38,90%,55%)" strokeWidth={1.5} strokeDasharray="4 2" dot={false} name="SF" />
              <Line type="monotone" dataKey="sr" stroke="hsl(152,70%,45%)" strokeWidth={1.5} strokeDasharray="4 2" dot={false} name="SR" />
            </LineChart>
          </ResponsiveContainer>
          <div className="flex justify-center gap-6">
            {[
              { label: "ECRS", color: "hsl(258,90%,66%)" },
              { label: "SA (Auditor)", color: "hsl(200,90%,50%)" },
              { label: "SF (Financeiro)", color: "hsl(38,90%,55%)" },
              { label: "SR (Relatório)", color: "hsl(152,70%,45%)" },
            ].map((l, i) => (
              <div key={i} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="w-3 h-1 rounded-full" style={{ background: l.color }} />
                {l.label}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Governança */}
      <Card className="bg-gradient-to-r from-[hsl(258,90%,66%)]/5 to-transparent border-[hsl(258,90%,66%)]/20">
        <CardContent className="p-5">
          <div className="flex items-start gap-3">
            <Shield className="w-5 h-5 text-[hsl(258,90%,66%)] shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-foreground mb-1">Governança & Auditoria do Risk Engine</p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Cada cálculo registra: <strong>versão do modelo</strong>, <strong>versão do persona</strong>, <strong>pesos utilizados</strong>,
                <strong> timestamp</strong> e <strong>fonte dos dados</strong>. O Risk Governance Index (RGI = IRC × Score_Agente)
                permite comparação entre agentes, benchmark interno e controle de calibragem contínuo.
                Rastreabilidade completa via logs estruturados em BigQuery Analytics.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

// ─── Main Page ───────────────────────────────────────────────
const ModeloMatematico = () => {
  const [selectedYear, setSelectedYear] = useState("2023");
  const years = Object.keys(defaultEntityData).sort();
  const d = defaultEntityData[selectedYear];
  const ind = defaultFinancialAnalysis.indicators[selectedYear];

  const at = d.ativoCirculante + d.ativoNaoCirculante;
  const pt = d.passivoCirculante + d.passivoNaoCirculante;

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

  const lg = ind.liquidezGeral;
  const roa = ind.roa;
  const eg = ind.endividamentoGeral;
  const insolvencyScore = lg * 0.4 + roa * 0.3 - eg * 0.3;
  const insolvencyClass = insolvencyScore < 0 ? "Insolvência" : insolvencyScore <= 1 ? "Atenção" : "Solidez";

  // Modelo Kanitz — Planilha Giannini
  const x1 = d.patrimonioLiquido ? d.lucroLiquido / d.patrimonioLiquido : 0;  // RPL
  const x2 = pt ? (d.ativoCirculante + (d.ativoNaoCirculante * 0.1)) / pt : 0; // LG
  const x3 = d.passivoCirculante ? (d.ativoCirculante - d.estoques) / d.passivoCirculante : 0; // LS
  const x4 = d.passivoCirculante ? d.ativoCirculante / d.passivoCirculante : 0; // LC
  const x5 = d.patrimonioLiquido ? -((d.passivoCirculante + d.passivoNaoCirculante) / d.patrimonioLiquido) : 0; // GE (negativo)
  const kanitz = 0.05 * x1 + 1.65 * x2 + 3.55 * x3 - 1.06 * x4 - 0.33 * x5;

  const ptAdj = pt + d.duplicatasDescontadas;
  const egAdj = at ? ptAdj / at : 0;
  const plAdj = at - ptAdj;

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
            <p className="text-sm text-muted-foreground">Índices Financeiros & Sistema de Persona — Plataforma de Auditoria IA v3.0</p>
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
        <Tabs defaultValue="persona" className="space-y-4">
          <TabsList className="bg-muted/50 flex-wrap h-auto gap-1 p-1">
            <TabsTrigger value="persona" className="text-xs gap-1"><SlidersHorizontal className="w-3 h-3" /> Persona (VPC)</TabsTrigger>
            <TabsTrigger value="agente-auditor" className="text-xs gap-1"><Bot className="w-3 h-3" /> Agente Auditor</TabsTrigger>
            <TabsTrigger value="agente-financeiro" className="text-xs gap-1"><DollarSign className="w-3 h-3" /> Agente Financeiro</TabsTrigger>
            <TabsTrigger value="agente-relatorio" className="text-xs gap-1"><FileText className="w-3 h-3" /> Agente Relatório</TabsTrigger>
            <TabsTrigger value="liquidez" className="text-xs">Liquidez</TabsTrigger>
            <TabsTrigger value="estrutura" className="text-xs">Estrutura de Capital</TabsTrigger>
            <TabsTrigger value="atividade" className="text-xs">Atividade</TabsTrigger>
            <TabsTrigger value="rentabilidade" className="text-xs">Rentabilidade</TabsTrigger>
            <TabsTrigger value="ah" className="text-xs">AH</TabsTrigger>
            <TabsTrigger value="av" className="text-xs">AV</TabsTrigger>
            <TabsTrigger value="insolvencia" className="text-xs">Insolvência</TabsTrigger>
            <TabsTrigger value="solvencia" className="text-xs">Solvência</TabsTrigger>
            <TabsTrigger value="matriz" className="text-xs">Matriz de Risco</TabsTrigger>
            <TabsTrigger value="risk-engine" className="text-xs gap-1"><Activity className="w-3 h-3" /> Risk Engine</TabsTrigger>
          </TabsList>

          {/* PERSONA */}
          <TabsContent value="persona"><TabPersona /></TabsContent>
          <TabsContent value="agente-auditor"><TabAgenteAuditor /></TabsContent>
          <TabsContent value="agente-financeiro"><TabAgenteFinanceiro /></TabsContent>
          <TabsContent value="agente-relatorio"><TabAgenteRelatorio /></TabsContent>
          <TabsContent value="risk-engine"><TabRiskEngine /></TabsContent>

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
                      O VPC (Vetor de Persona Configurável) permite ao Gestor calibrar o comportamento de cada agente com rastreabilidade matemática.
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
