import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { fetchGestorIaIndicators, type GestorIaIndicators } from "@/services/gestorIaIndicatorsService";
import { Loader2 } from "lucide-react";
import PlatformLayout from "@/components/PlatformLayout";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import {
  LayoutGrid, Plug, BookOpen, Bot, ShieldCheck, ScrollText,
  TrendingUp, AlertTriangle, Clock, DollarSign, RefreshCw,
  Plus, Download, Settings, CheckCircle2, XCircle, Pause,
  FileText, Upload, Search, Trash2, Edit, Brain, BarChart3,
  Activity, Zap, Database, Globe, Webhook, CreditCard, Scale,
  MessageSquare, Thermometer, Cpu, Eye, Send, SlidersHorizontal, Gauge
} from "lucide-react";
import TabReportLimits from "@/components/gestor/TabReportLimits";
import AIProvidersConfig from "@/components/gestor/AIProvidersConfig";
import TabOrphanDocuments from "@/components/gestor/TabOrphanDocuments";
import TabExecutionTime from "@/components/gestor/TabExecutionTime";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, Legend } from "recharts";

// ─── Mock Data (somente para abas ainda não conectadas) ─────
const integrations = [
  { name: "BigQuery", type: "Data Warehouse", status: "active", icon: Database },
  { name: "API Contábil", type: "ERP", status: "active", icon: Globe },
  { name: "Webhooks", type: "Notificações", status: "active", icon: Webhook },
  { name: "API Financeira", type: "Banking", status: "inactive", icon: CreditCard },
  { name: "Upload SFTP", type: "Arquivos", status: "paused", icon: Upload },
];

const knowledgeItems = [
  { title: "IFRS 16 - Arrendamentos", category: "Normas IFRS", date: "2024-12-15" },
  { title: "NBC TA 700 - Formação de Opinião", category: "NBC TA", date: "2024-12-10" },
  { title: "CPC 47 - Receita de Contrato", category: "CPC", date: "2024-11-28" },
  { title: "Manual de Auditoria Interna", category: "Docs Internos", date: "2024-11-20" },
  { title: "Lei 11.101/2005 - Recuperação Judicial", category: "Legislação", date: "2024-11-15" },
];

const agents = [
  { name: "Agente Auditor Contábil", type: "Auditoria", model: "Gemini 2.5 Pro", temp: 0.3, status: "active", tokens: "128K" },
  { name: "Agente Financeiro", type: "Financeiro", model: "GPT OSS", temp: 0.2, status: "active", tokens: "64K" },
  { name: "Agente de Relatório", type: "Relatório", model: "Gemini 2.5 Flash", temp: 0.4, status: "paused", tokens: "32K" },
];

const logs = [
  { agent: "Auditor Contábil", user: "admin@bex.com", action: "Análise de Balanço", confidence: 94.2, time: "há 5 min" },
  { agent: "Financeiro", user: "analista@bex.com", action: "Projeção Fluxo de Caixa", confidence: 88.7, time: "há 12 min" },
  { agent: "Auditor Contábil", user: "admin@bex.com", action: "Score BEX-RJ", confidence: 91.5, time: "há 28 min" },
  { agent: "Relatório", user: "gestor@bex.com", action: "Geração Parecer", confidence: 85.3, time: "há 1h" },
];

// ─── Sub-components ──────────────────────────────────────────

const StatusBadge = ({ status }: { status: string }) => {
  const styles: Record<string, string> = {
    active: "bg-[hsl(152,70%,45%)]/10 text-[hsl(152,70%,45%)]",
    inactive: "bg-[hsl(0,70%,55%)]/10 text-[hsl(0,70%,55%)]",
    paused: "bg-[hsl(38,90%,55%)]/10 text-[hsl(38,90%,55%)]",
  };
  const labels: Record<string, string> = { active: "Ativo", inactive: "Inativo", paused: "Pausado" };
  return <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${styles[status]}`}>{labels[status]}</span>;
};

// ─── Tab: Visão Geral (dados reais) ──────────────────────────
const TabVisaoGeral = () => {
  const [data, setData] = useState<GestorIaIndicators | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    fetchGestorIaIndicators(12)
      .then(d => { if (alive) setData(d); })
      .catch(err => { console.error("[GestorIA] indicadores:", err); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  if (loading || !data) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const { kpis, trend, riskDistribution, auditTypes, context } = data;

  const kpiCards = [
    {
      label: "Documentos Auditados", value: String(kpis.documentosAuditados),
      sub: "Total processado (12m)",
      change: `${kpis.documentosVariacao >= 0 ? "+" : ""}${kpis.documentosVariacao}%`,
      positive: kpis.documentosVariacao >= 0, icon: FileText, color: "hsl(258,90%,66%)",
    },
    {
      label: "Auditorias Realizadas", value: String(kpis.auditoriasRealizadas),
      sub: `${kpis.auditoriasConcluidas} concluídas`,
      change: `${kpis.auditoriasVariacao >= 0 ? "+" : ""}${kpis.auditoriasVariacao}%`,
      positive: kpis.auditoriasVariacao >= 0, icon: CheckCircle2, color: "hsl(152,70%,45%)",
    },
    {
      label: "Conformidade Geral", value: `${kpis.conformidadeGeral}%`,
      sub: "Média ponderada",
      change: `${kpis.conformidadeVariacao >= 0 ? "+" : ""}${kpis.conformidadeVariacao}%`,
      positive: kpis.conformidadeVariacao >= 0, icon: ShieldCheck, color: "hsl(152,70%,45%)",
    },
    {
      label: "Riscos Identificados", value: String(kpis.riscosIdentificados),
      sub: `${kpis.riscosCriticos} críticos`,
      change: `${kpis.riscosVariacao >= 0 ? "+" : ""}${kpis.riscosVariacao}%`,
      positive: kpis.riscosVariacao <= 0, icon: AlertTriangle, color: "hsl(38,90%,55%)",
    },
  ];

  const contextBlocks = [
    {
      title: "Conformidade & Indicadores", sub: "Qualidade contábil e normas aplicadas",
      icon: Scale, color: "hsl(152,70%,45%)",
      items: [
        { k: "Conformidade Geral", v: `${context.conformidade.geral}%` },
        { k: "Normas Aplicadas",   v: String(context.conformidade.total) },
        { k: "Com Desvios",        v: String(context.conformidade.comDesvios) },
      ],
    },
    {
      title: "Riscos & Tendências", sub: "Análise de pontos críticos",
      icon: AlertTriangle, color: "hsl(38,90%,55%)",
      items: [
        { k: "Pontos de Auditoria", v: String(context.riscos.pontos) },
        { k: "Riscos Altos",        v: String(context.riscos.altos) },
        { k: "Riscos Críticos",     v: String(context.riscos.criticos) },
      ],
    },
    {
      title: "Parecer & Alertas", sub: "Modificações potenciais",
      icon: Edit, color: "hsl(0,70%,55%)",
      items: [
        { k: "Pontos Ressalva", v: String(context.parecer.ressalva) },
        { k: "Pontos Ênfase",   v: String(context.parecer.enfase) },
        { k: "Modificação",     v: String(context.parecer.modificacao) },
      ],
    },
    {
      title: "Ajustes & Correções", sub: "Ações sugeridas pela IA",
      icon: Zap, color: "hsl(258,90%,66%)",
      items: [
        { k: "Correções Sugeridas", v: String(context.ajustes.sugeridas) },
        { k: "Impacto Financeiro",  v: String(context.ajustes.impacto) },
        { k: "Apenas Divulgação",   v: String(context.ajustes.divulgacao) },
      ],
    },
  ];

  return (
    <div className="space-y-8">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpiCards.map((kpi, i) => (
          <div key={i} className="relative bg-card rounded-xl border border-border p-5 overflow-hidden">
            <div className="absolute top-3 right-3 opacity-10">
              <kpi.icon className="w-16 h-16" style={{ color: kpi.color }} />
            </div>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: `${kpi.color}15` }}>
                <kpi.icon className="w-5 h-5" style={{ color: kpi.color }} />
              </div>
              <span className={`text-xs font-bold flex items-center gap-1 ${kpi.positive ? "text-[hsl(152,70%,45%)]" : "text-[hsl(0,70%,55%)]"}`}>
                <TrendingUp className={`w-3 h-3 ${!kpi.positive ? "rotate-180" : ""}`} /> {kpi.change}
              </span>
            </div>
            <div className="text-3xl font-bold font-sans text-foreground">{kpi.value}</div>
            <div className="text-sm font-semibold text-foreground mt-1">{kpi.label}</div>
            <div className="text-xs text-muted-foreground">{kpi.sub}</div>
          </div>
        ))}
      </div>

      {/* Charts Row */}
      <div>
        <h3 className="text-lg font-bold font-serif text-foreground mb-4 flex items-center gap-2">
          <span className="w-1 h-5 rounded-full bg-[hsl(258,90%,66%)]" /> Visão Geral
          <span className="ml-2 text-[10px] font-medium px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-700 border border-emerald-500/30">
            Dados reais · 12m
          </span>
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Trend Chart */}
          <div className="bg-card rounded-xl border border-border p-5">
            <div className="flex items-center gap-2 mb-4 text-sm font-semibold text-foreground">
              <TrendingUp className="w-4 h-4 text-[hsl(258,90%,66%)]" /> Tendência de Conformidade
            </div>
            <ResponsiveContainer width="100%" height={160}>
              <LineChart data={trend}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(214,20%,88%)" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="hsl(215,12%,50%)" />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} stroke="hsl(215,12%,50%)" />
                <Tooltip />
                <Line type="monotone" dataKey="value" stroke="hsl(258,90%,66%)" strokeWidth={2} dot={{ fill: "hsl(258,90%,66%)", r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Pie Chart */}
          <div className="bg-card rounded-xl border border-border p-5">
            <div className="flex items-center gap-2 mb-4 text-sm font-semibold text-foreground">
              <Activity className="w-4 h-4 text-[hsl(38,90%,55%)]" /> Distribuição de Riscos
            </div>
            <ResponsiveContainer width="100%" height={160}>
              <PieChart>
                <Pie data={riskDistribution} cx="50%" cy="50%" innerRadius={40} outerRadius={65} dataKey="value" paddingAngle={3}>
                  {riskDistribution.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex flex-wrap justify-center gap-3 mt-2">
              {riskDistribution.map((r, i) => (
                <div key={i} className="flex items-center gap-1.5 text-xs">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ background: r.color }} /> {r.name} ({r.value}%)
                </div>
              ))}
            </div>
          </div>

          {/* Bar Chart */}
          <div className="bg-card rounded-xl border border-border p-5">
            <div className="flex items-center gap-2 mb-4 text-sm font-semibold text-foreground">
              <BarChart3 className="w-4 h-4 text-[hsl(258,90%,66%)]" /> Auditorias por Tipo
            </div>
            {auditTypes.length === 0 ? (
              <div className="h-[160px] flex items-center justify-center text-xs text-muted-foreground">
                Nenhuma auditoria registrada no período.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={auditTypes} layout="vertical">
                  <XAxis type="number" tick={{ fontSize: 11 }} stroke="hsl(215,12%,50%)" allowDecimals={false} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} stroke="hsl(215,12%,50%)" width={70} />
                  <Tooltip />
                  <Bar dataKey="value" fill="hsl(258,90%,66%)" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* Context Blocks */}
      <div>
        <h3 className="text-lg font-bold font-serif text-foreground mb-4 flex items-center gap-2">
          <span className="w-1 h-5 rounded-full bg-[hsl(38,90%,55%)]" /> Blocos de Contexto
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {contextBlocks.map((block, i) => (
            <div key={i} className="bg-card rounded-xl border border-border p-5" style={{ borderTopColor: block.color, borderTopWidth: 3 }}>
              <div className="w-10 h-10 rounded-lg flex items-center justify-center mb-3" style={{ background: `${block.color}15` }}>
                <block.icon className="w-5 h-5" style={{ color: block.color }} />
              </div>
              <h4 className="font-semibold text-sm text-foreground">{block.title}</h4>
              <p className="text-xs text-muted-foreground mb-3">{block.sub}</p>
              <div className="space-y-2">
                {block.items.map((item, j) => (
                  <div key={j} className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{item.k}</span>
                    <span className="font-bold" style={{ color: block.color }}>{item.v}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// ─── Tab: Integrações ────────────────────────────────────────
const TabIntegracoes = () => (
  <div className="space-y-6">
    <div className="flex items-center justify-between">
      <p className="text-sm text-muted-foreground">Gerencie conexões com ERPs, APIs financeiras, BigQuery e webhooks.</p>
      <Button size="sm" className="bg-[hsl(258,90%,66%)] hover:bg-[hsl(258,80%,55%)] text-white gap-1.5">
        <Plus className="w-3.5 h-3.5" /> Nova Integração
      </Button>
    </div>
    <div className="grid gap-3">
      {integrations.map((integ, i) => (
        <div key={i} className="bg-card rounded-xl border border-border p-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-lg bg-[hsl(258,90%,66%)]/10 flex items-center justify-center">
              <integ.icon className="w-5 h-5 text-[hsl(258,90%,66%)]" />
            </div>
            <div>
              <h4 className="font-semibold text-sm text-foreground">{integ.name}</h4>
              <p className="text-xs text-muted-foreground">{integ.type}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <StatusBadge status={integ.status} />
            <Button variant="ghost" size="icon" className="h-8 w-8"><Settings className="w-4 h-4" /></Button>
          </div>
        </div>
      ))}
    </div>
  </div>
);

// ─── Tab: Base de Conhecimento ───────────────────────────────
const TabBaseConhecimento = () => (
  <div className="space-y-6">
    <div className="flex items-center justify-between gap-4 flex-wrap">
      <div className="flex items-center gap-2 bg-card border border-border rounded-lg px-3 py-2 flex-1 max-w-md">
        <Search className="w-4 h-4 text-muted-foreground" />
        <input placeholder="Buscar documentos..." className="bg-transparent text-sm outline-none flex-1 text-foreground placeholder:text-muted-foreground" />
      </div>
      <Button size="sm" className="bg-[hsl(258,90%,66%)] hover:bg-[hsl(258,80%,55%)] text-white gap-1.5">
        <Upload className="w-3.5 h-3.5" /> Upload Documento
      </Button>
    </div>
    <div className="grid gap-3">
      {knowledgeItems.map((item, i) => (
        <div key={i} className="bg-card rounded-xl border border-border p-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-lg bg-[hsl(38,90%,55%)]/10 flex items-center justify-center">
              <BookOpen className="w-5 h-5 text-[hsl(38,90%,55%)]" />
            </div>
            <div>
              <h4 className="font-semibold text-sm text-foreground">{item.title}</h4>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-xs px-2 py-0.5 rounded-full bg-[hsl(258,90%,66%)]/10 text-[hsl(258,90%,66%)] font-medium">{item.category}</span>
                <span className="text-xs text-muted-foreground">{item.date}</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-8 w-8"><Eye className="w-4 h-4" /></Button>
            <Button variant="ghost" size="icon" className="h-8 w-8"><Trash2 className="w-4 h-4" /></Button>
          </div>
        </div>
      ))}
    </div>
  </div>
);

// ─── Tab: Gestão de Agentes ──────────────────────────────────
const personaVarLabels = [
  { key: "Rn", label: "Rigor Normativo (Rₙ)" },
  { key: "Cr", label: "Conservadorismo (Cᵣ)" },
  { key: "Sr", label: "Sensibilidade Risco (Sᵣ)" },
  { key: "Da", label: "Profundidade Analítica (Dₐ)" },
  { key: "Fl", label: "Formalidade (Fₗ)" },
  { key: "Ap", label: "Agressividade (Aₚ)" },
];

const defaultPersonas: Record<string, number[]> = {
  "Agente Auditor Contábil": [0.9, 0.8, 0.9, 0.9, 0.8, 0.9],
  "Agente Financeiro": [0.7, 0.7, 0.8, 0.8, 0.6, 0.6],
  "Agente de Relatório": [0.6, 0.5, 0.5, 0.6, 0.9, 0.5],
};

const TabAgentes = () => {
  const [expandedAgent, setExpandedAgent] = useState<number | null>(null);
  const [personas, setPersonas] = useState<Record<string, number[]>>(defaultPersonas);

  const updatePersonaVar = (agentName: string, idx: number, val: number) => {
    setPersonas(prev => ({
      ...prev,
      [agentName]: prev[agentName].map((v, i) => i === idx ? val : v),
    }));
  };

  const getScore = (vals: number[]) => vals.reduce((a, b) => a + b, 0) / vals.length;

  return (
    <div className="space-y-6">
      <Tabs defaultValue="apis" className="w-full">
        <TabsList className="bg-muted/50 p-1 h-auto">
          <TabsTrigger value="apis" className="gap-1.5 data-[state=active]:bg-[hsl(258,90%,66%)] data-[state=active]:text-white text-xs">
            <Plug className="w-3.5 h-3.5" /> APIs & Provedores
          </TabsTrigger>
          <TabsTrigger value="agents" className="gap-1.5 data-[state=active]:bg-[hsl(258,90%,66%)] data-[state=active]:text-white text-xs">
            <Bot className="w-3.5 h-3.5" /> Persona dos Agentes
          </TabsTrigger>
        </TabsList>

        <TabsContent value="apis" className="mt-5">
          <AIProvidersConfig />
        </TabsContent>

        <TabsContent value="agents" className="mt-5 space-y-6">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">Configure modelos, persona e parâmetros dos agentes de IA.</p>
            <a href="/modelo-matematico" className="text-xs font-medium text-[hsl(258,90%,66%)] hover:underline flex items-center gap-1">
              <Brain className="w-3.5 h-3.5" /> Ver Modelo Matemático Completo →
            </a>
          </div>
      <div className="grid gap-4">
        {agents.map((agent, i) => {
          const isExpanded = expandedAgent === i;
          const pVals = personas[agent.name] || [0.5, 0.5, 0.5, 0.5, 0.5, 0.5];
          const score = getScore(pVals);

          return (
            <div key={i} className="bg-card rounded-xl border border-border overflow-hidden">
              {/* Agent Header */}
              <div className="p-5">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-[hsl(258,90%,66%)]/10 flex items-center justify-center">
                      <Bot className="w-5 h-5 text-[hsl(258,90%,66%)]" />
                    </div>
                    <div>
                      <h4 className="font-semibold text-foreground">{agent.name}</h4>
                      <p className="text-xs text-muted-foreground">{agent.type}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right mr-2">
                      <p className="text-xs text-muted-foreground">Score VPC</p>
                      <p className="text-lg font-bold font-mono text-[hsl(258,90%,66%)]">{score.toFixed(2)}</p>
                    </div>
                    <StatusBadge status={agent.status} />
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5 text-xs"
                      onClick={() => setExpandedAgent(isExpanded ? null : i)}
                    >
                      <SlidersHorizontal className="w-3 h-3" /> {isExpanded ? "Fechar" : "Persona"}
                    </Button>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div className="flex items-center gap-2 text-sm">
                    <Cpu className="w-4 h-4 text-muted-foreground" />
                    <span className="text-muted-foreground">Modelo:</span>
                    <span className="font-semibold text-foreground">{agent.model}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <Thermometer className="w-4 h-4 text-muted-foreground" />
                    <span className="text-muted-foreground">Temp:</span>
                    <span className="font-semibold text-foreground">{agent.temp}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <MessageSquare className="w-4 h-4 text-muted-foreground" />
                    <span className="text-muted-foreground">Tokens:</span>
                    <span className="font-semibold text-foreground">{agent.tokens}</span>
                  </div>
                </div>
                {/* Mini bar preview */}
                {!isExpanded && (
                  <div className="flex gap-1 mt-3">
                    {pVals.map((v, j) => (
                      <div key={j} className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden" title={personaVarLabels[j].label}>
                        <div className="h-full rounded-full bg-[hsl(258,90%,66%)]" style={{ width: `${v * 100}%` }} />
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Expanded Persona Sliders */}
              {isExpanded && (
                <div className="border-t border-border bg-muted/20 p-5 space-y-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Brain className="w-4 h-4 text-[hsl(258,90%,66%)]" />
                    <h5 className="text-sm font-semibold text-foreground">Vetor de Persona Configurável (VPC)</h5>
                  </div>
                  <div className="grid md:grid-cols-2 gap-x-8 gap-y-4">
                    {personaVarLabels.map((pv, j) => (
                      <div key={pv.key} className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium text-foreground">{pv.label}</span>
                          <span className="text-xs font-bold font-mono text-[hsl(258,90%,66%)]">{pVals[j].toFixed(2)}</span>
                        </div>
                        <input
                          type="range"
                          min={0}
                          max={100}
                          value={pVals[j] * 100}
                          onChange={(e) => updatePersonaVar(agent.name, j, Number(e.target.value) / 100)}
                          className="w-full h-1.5 rounded-full appearance-none bg-muted cursor-pointer accent-[hsl(258,90%,66%)]"
                        />
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center justify-between pt-3 border-t border-border">
                    <div className="flex items-center gap-4">
                      <div className="text-xs text-muted-foreground">
                        Score Global: <span className="font-bold font-mono text-[hsl(258,90%,66%)]">{score.toFixed(3)}</span>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Fórmula: <code className="bg-muted px-1.5 py-0.5 rounded text-foreground">Score = Σ(Vars) / 6</code>
                      </div>
                    </div>
                    <Button size="sm" className="bg-[hsl(258,90%,66%)] hover:bg-[hsl(258,80%,55%)] text-white gap-1.5 text-xs">
                      <CheckCircle2 className="w-3 h-3" /> Salvar Persona
                    </Button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

// ─── Tab: Governança ─────────────────────────────────────────
const TabGovernanca = () => (
  <div className="space-y-6">
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {[
        { label: "Score de Confiabilidade", value: "94.2%", icon: ShieldCheck, color: "hsl(152,70%,45%)" },
        { label: "Taxa de Alucinação", value: "1.8%", icon: AlertTriangle, color: "hsl(38,90%,55%)" },
        { label: "Validações Cruzadas", value: "342", icon: CheckCircle2, color: "hsl(258,90%,66%)" },
        { label: "Tempo Médio Resposta", value: "2.4s", icon: Clock, color: "hsl(200,90%,50%)" },
      ].map((m, i) => (
        <div key={i} className="bg-card rounded-xl border border-border p-5">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center mb-3" style={{ background: `${m.color}15` }}>
            <m.icon className="w-4.5 h-4.5" style={{ color: m.color }} />
          </div>
          <div className="text-2xl font-bold font-sans text-foreground">{m.value}</div>
          <div className="text-xs text-muted-foreground mt-1">{m.label}</div>
        </div>
      ))}
    </div>
    <div className="bg-card rounded-xl border border-border p-5">
      <h4 className="font-semibold text-foreground mb-3">Políticas de Segurança</h4>
      <div className="space-y-3">
        {[
          { label: "Criptografia AES-256", active: true },
          { label: "TLS 1.3", active: true },
          { label: "Segregação Multi-tenant", active: true },
          { label: "Backup Automático", active: true },
          { label: "Controle por tenant_id", active: true },
        ].map((p, i) => (
          <div key={i} className="flex items-center gap-3 text-sm">
            <CheckCircle2 className="w-4 h-4 text-[hsl(152,70%,45%)]" />
            <span className="text-foreground">{p.label}</span>
          </div>
        ))}
      </div>
    </div>
  </div>
);

// ─── Tab: Logs & Auditoria ───────────────────────────────────

interface ManagedUser {
  id: number;
  name: string;
  email: string;
  role: string;
  status: string;
  lastAccess: string;
}

const initialUsers: ManagedUser[] = [
  { id: 1, name: "Admin BEX", email: "admin@bex.com", role: "auditor_chefe", status: "active", lastAccess: "há 5 min" },
  { id: 2, name: "Analista Financeiro", email: "analista@bex.com", role: "usuario", status: "active", lastAccess: "há 12 min" },
  { id: 3, name: "Gestor IA", email: "gestor@bex.com", role: "gestor_ia", status: "active", lastAccess: "há 28 min" },
  { id: 4, name: "Empresa ABC", email: "contato@empresaabc.com", role: "empresa", status: "inactive", lastAccess: "há 3 dias" },
];

const roleLabels: Record<string, string> = {
  auditor_chefe: "Auditor Chefe",
  usuario: "Usuário",
  empresa: "Empresa",
  gestor_ia: "Gestor IA",
};

const TabLogs = () => {
  const [users, setUsers] = useState<ManagedUser[]>(initialUsers);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<ManagedUser | null>(null);
  const [formName, setFormName] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formPassword, setFormPassword] = useState("");
  const [formRole, setFormRole] = useState("usuario");
  const [formStatus, setFormStatus] = useState("active");

  const openCreate = () => {
    setEditingUser(null);
    setFormName("");
    setFormEmail("");
    setFormPassword("");
    setFormRole("usuario");
    setFormStatus("active");
    setDialogOpen(true);
  };

  const openEdit = (user: ManagedUser) => {
    setEditingUser(user);
    setFormName(user.name);
    setFormEmail(user.email);
    setFormPassword("");
    setFormRole(user.role);
    setFormStatus(user.status);
    setDialogOpen(true);
  };

  const handleSave = () => {
    if (!formName || !formEmail) {
      toast.error("Preencha nome e e-mail.");
      return;
    }
    if (!editingUser && !formPassword) {
      toast.error("Defina uma senha para o novo usuário.");
      return;
    }

    if (editingUser) {
      setUsers(prev => prev.map(u => u.id === editingUser.id ? { ...u, name: formName, email: formEmail, role: formRole, status: formStatus } : u));
      toast.success("Usuário atualizado com sucesso!");
    } else {
      const newUser: ManagedUser = {
        id: Date.now(),
        name: formName,
        email: formEmail,
        role: formRole,
        status: formStatus,
        lastAccess: "nunca",
      };
      setUsers(prev => [...prev, newUser]);
      toast.success("Novo acesso criado com sucesso!");
    }
    setDialogOpen(false);
  };

  const toggleStatus = (id: number) => {
    setUsers(prev => prev.map(u => u.id === id ? { ...u, status: u.status === "active" ? "inactive" : "active" } : u));
    toast.success("Status atualizado.");
  };

  return (
    <div className="space-y-6">
      {/* User Management Section */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-bold font-serif text-foreground flex items-center gap-2">
              <span className="w-1 h-5 rounded-full bg-[hsl(258,90%,66%)]" /> Gestão de Acessos
            </h3>
            <p className="text-sm text-muted-foreground">Crie, edite e gerencie logins e perfis de acesso à plataforma.</p>
          </div>
          <Button size="sm" className="bg-[hsl(258,90%,66%)] hover:bg-[hsl(258,80%,55%)] text-white gap-1.5" onClick={openCreate}>
            <Plus className="w-3.5 h-3.5" /> Novo Acesso
          </Button>
        </div>

        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Nome</th>
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground">E-mail</th>
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Perfil</th>
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Status</th>
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Último Acesso</th>
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Ações</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3 font-medium text-foreground">{user.name}</td>
                  <td className="px-4 py-3 text-muted-foreground">{user.email}</td>
                  <td className="px-4 py-3">
                    <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-[hsl(258,90%,66%)]/10 text-[hsl(258,90%,66%)]">
                      {roleLabels[user.role] || user.role}
                    </span>
                  </td>
                  <td className="px-4 py-3"><StatusBadge status={user.status} /></td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">{user.lastAccess}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(user)} title="Editar">
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => toggleStatus(user.id)} title={user.status === "active" ? "Desativar" : "Ativar"}>
                        {user.status === "active" ? <Pause className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Logs Section */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold font-serif text-foreground flex items-center gap-2">
            <span className="w-1 h-5 rounded-full bg-[hsl(38,90%,55%)]" /> Logs de Atividade
          </h3>
          <Button variant="outline" size="sm" className="gap-1.5 text-xs">
            <Download className="w-3.5 h-3.5" /> Exportar Logs
          </Button>
        </div>
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Agente</th>
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Usuário</th>
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Ação</th>
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Confiança</th>
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Tempo</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log, i) => (
                <tr key={i} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3 font-medium text-foreground">{log.agent}</td>
                  <td className="px-4 py-3 text-muted-foreground">{log.user}</td>
                  <td className="px-4 py-3 text-foreground">{log.action}</td>
                  <td className="px-4 py-3">
                    <span className={`font-semibold ${log.confidence >= 90 ? "text-[hsl(152,70%,45%)]" : "text-[hsl(38,90%,55%)]"}`}>
                      {log.confidence}%
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">{log.time}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-card border-border max-w-md">
          <DialogHeader>
            <DialogTitle className="text-foreground">{editingUser ? "Editar Acesso" : "Criar Novo Acesso"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-sm text-muted-foreground">Nome</Label>
              <Input value={formName} onChange={e => setFormName(e.target.value)} placeholder="Nome completo" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm text-muted-foreground">E-mail</Label>
              <Input type="email" value={formEmail} onChange={e => setFormEmail(e.target.value)} placeholder="email@exemplo.com" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm text-muted-foreground">{editingUser ? "Nova Senha (deixe vazio para manter)" : "Senha"}</Label>
              <Input type="password" value={formPassword} onChange={e => setFormPassword(e.target.value)} placeholder="••••••••" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm text-muted-foreground">Perfil de Acesso</Label>
              <Select value={formRole} onValueChange={setFormRole}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="auditor_chefe">Auditor Chefe</SelectItem>
                  <SelectItem value="usuario">Usuário</SelectItem>
                  <SelectItem value="empresa">Empresa</SelectItem>
                  <SelectItem value="gestor_ia">Gestor IA</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm text-muted-foreground">Status</Label>
              <Select value={formStatus} onValueChange={setFormStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Ativo</SelectItem>
                  <SelectItem value="inactive">Inativo</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button className="bg-[hsl(258,90%,66%)] hover:bg-[hsl(258,80%,55%)] text-white" onClick={handleSave}>
              {editingUser ? "Salvar Alterações" : "Criar Acesso"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
const TabRiskEngineDash = () => {
  // Mock consolidated scores
  const SA = 0.517;
  const SF = 0.647;
  const SR = 0.550;
  const ECRS = 0.624;
  const systemicRisk = 0.398;
  const corrFactor = 0.637;

  const radarData = [
    { subject: "Risco Contábil", A: SA * 100, fullMark: 100 },
    { subject: "Risco Financeiro", A: SF * 100, fullMark: 100 },
    { subject: "Risco Narrativo", A: SR * 100, fullMark: 100 },
    { subject: "Correlação", A: corrFactor * 100, fullMark: 100 },
    { subject: "Sistêmico", A: systemicRisk * 100, fullMark: 100 },
    { subject: "ECRS", A: ECRS * 100, fullMark: 100 },
  ];

  const historicalECRS = [
    { month: "Set", ecrs: 0.42, threshold: 0.75 },
    { month: "Out", ecrs: 0.48, threshold: 0.75 },
    { month: "Nov", ecrs: 0.52, threshold: 0.75 },
    { month: "Dez", ecrs: 0.58, threshold: 0.75 },
    { month: "Jan", ecrs: 0.55, threshold: 0.75 },
    { month: "Fev", ecrs: ECRS, threshold: 0.75 },
  ];

  const getClassColor = (score: number) => {
    if (score <= 0.30) return "hsl(152,70%,45%)";
    if (score <= 0.60) return "hsl(38,90%,55%)";
    if (score <= 0.80) return "hsl(258,90%,66%)";
    return "hsl(0,70%,55%)";
  };

  const getClassLabel = (score: number) => {
    if (score <= 0.30) return "Baixo Risco";
    if (score <= 0.60) return "Risco Moderado";
    if (score <= 0.80) return "Alto Risco";
    return "Risco Crítico";
  };

  return (
    <div className="space-y-6">
      {/* KPI Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "ECRS Consolidado", value: ECRS.toFixed(3), color: getClassColor(ECRS), sub: getClassLabel(ECRS), icon: Activity },
          { label: "Score Auditor (SA)", value: SA.toFixed(3), color: "hsl(258,90%,66%)", sub: "Contábil", icon: Bot },
          { label: "Score Financeiro (SF)", value: SF.toFixed(3), color: "hsl(38,90%,55%)", sub: "Financeiro", icon: DollarSign },
          { label: "Risco Sistêmico", value: systemicRisk.toFixed(3), color: systemicRisk > 0.5 ? "hsl(0,70%,55%)" : "hsl(152,70%,45%)", sub: systemicRisk > 0.5 ? "Alerta" : "Controlado", icon: AlertTriangle },
        ].map((kpi, i) => (
          <div key={i} className="bg-card rounded-xl border border-border p-5 relative overflow-hidden">
            <div className="absolute top-3 right-3 opacity-10">
              <kpi.icon className="w-12 h-12" style={{ color: kpi.color }} />
            </div>
            <div className="w-9 h-9 rounded-lg flex items-center justify-center mb-3" style={{ background: `${kpi.color}15` }}>
              <kpi.icon className="w-4.5 h-4.5" style={{ color: kpi.color }} />
            </div>
            <div className="text-2xl font-bold font-mono" style={{ color: kpi.color }}>{kpi.value}</div>
            <div className="text-sm font-semibold text-foreground mt-1">{kpi.label}</div>
            <div className="text-xs text-muted-foreground">{kpi.sub}</div>
          </div>
        ))}
      </div>

      {/* Radar + Trend */}
      <div className="grid md:grid-cols-2 gap-4">
        <div className="bg-card rounded-xl border border-border p-5">
          <div className="flex items-center gap-2 mb-4 text-sm font-semibold text-foreground">
            <Activity className="w-4 h-4 text-[hsl(258,90%,66%)]" /> Radar dos 3 Agentes
          </div>
          <ResponsiveContainer width="100%" height={240}>
            <RadarChart data={radarData}>
              <PolarGrid stroke="hsl(214,20%,88%)" />
              <PolarAngleAxis dataKey="subject" tick={{ fontSize: 10 }} stroke="hsl(215,12%,50%)" />
              <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fontSize: 9 }} stroke="hsl(215,12%,50%)" />
              <Radar name="Risk" dataKey="A" stroke="hsl(258,90%,66%)" fill="hsl(258,90%,66%)" fillOpacity={0.2} strokeWidth={2} />
            </RadarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-card rounded-xl border border-border p-5">
          <div className="flex items-center gap-2 mb-4 text-sm font-semibold text-foreground">
            <TrendingUp className="w-4 h-4 text-[hsl(258,90%,66%)]" /> Histórico ECRS
          </div>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={historicalECRS}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(214,20%,88%)" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="hsl(215,12%,50%)" />
              <YAxis domain={[0, 1]} tick={{ fontSize: 11 }} stroke="hsl(215,12%,50%)" />
              <Tooltip />
              <Line type="monotone" dataKey="ecrs" stroke="hsl(258,90%,66%)" strokeWidth={2.5} dot={{ fill: "hsl(258,90%,66%)", r: 4 }} name="ECRS" />
              <Line type="monotone" dataKey="threshold" stroke="hsl(0,70%,55%)" strokeWidth={1} strokeDasharray="6 3" dot={false} name="Limiar Crítico" />
            </LineChart>
          </ResponsiveContainer>
          <div className="flex justify-center gap-6 mt-2">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="w-3 h-1 rounded-full bg-[hsl(258,90%,66%)]" /> ECRS
            </div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="w-3 h-1 rounded-full bg-[hsl(0,70%,55%)]" /> Limiar Crítico (0.75)
            </div>
          </div>
        </div>
      </div>

      {/* Correlation Matrix */}
      <div className="bg-card rounded-xl border border-border p-5">
        <div className="flex items-center gap-2 mb-4 text-sm font-semibold text-foreground">
          <BarChart3 className="w-4 h-4 text-[hsl(258,90%,66%)]" /> Matriz de Correlação Dinâmica
        </div>
        <div className="grid md:grid-cols-2 gap-6">
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="p-2.5 text-left text-muted-foreground"></th>
                  <th className="p-2.5 text-center font-semibold text-foreground">Auditor</th>
                  <th className="p-2.5 text-center font-semibold text-foreground">Financeiro</th>
                  <th className="p-2.5 text-center font-semibold text-foreground">Relatório</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { label: "Auditor", vals: [1, 0.78, 0.52] },
                  { label: "Financeiro", vals: [0.78, 1, 0.61] },
                  { label: "Relatório", vals: [0.52, 0.61, 1] },
                ].map((row, i) => (
                  <tr key={i} className="border-b border-border last:border-0">
                    <td className="p-2.5 font-semibold text-foreground">{row.label}</td>
                    {row.vals.map((v, j) => (
                      <td key={j} className="p-2.5 text-center">
                        <span className={`font-mono font-bold text-sm px-2 py-1 rounded ${v === 1 ? "bg-muted text-foreground" : v > 0.7 ? "bg-red-500/10 text-red-600" : v > 0.5 ? "bg-amber-500/10 text-amber-600" : "bg-emerald-500/10 text-emerald-600"}`}>
                          {v.toFixed(2)}
                        </span>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="space-y-3">
            <div className="p-3 rounded-lg bg-muted/50 flex justify-between text-sm">
              <span className="text-muted-foreground">CorrFactor (ρ̄)</span>
              <span className="font-bold font-mono text-[hsl(258,90%,66%)]">{corrFactor.toFixed(4)}</span>
            </div>
            <div className="p-3 rounded-lg bg-muted/50 flex justify-between text-sm">
              <span className="text-muted-foreground">ρ_AF (Auditor-Financeiro)</span>
              <span className="font-bold font-mono text-red-600">0.78 ⚠</span>
            </div>
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 flex items-center gap-2 text-xs">
              <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
              <span className="text-red-600 font-medium">Alta correlação Auditor-Financeiro: risco sistêmico potencial</span>
            </div>
            <a href="/modelo-matematico" className="text-xs font-medium text-[hsl(258,90%,66%)] hover:underline flex items-center gap-1 mt-2">
              <Brain className="w-3.5 h-3.5" /> Abrir Risk Engine Detalhado →
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── Main Page ───────────────────────────────────────────────
const GestorIA = () => {
  const navigate = useNavigate();
  return (
    <PlatformLayout>
      <div className="max-w-[1600px] mx-auto px-4 md:px-6 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold font-serif text-foreground">Dashboard de Contábil IA</h1>
            <p className="text-sm text-muted-foreground">Visão consolidada com inteligência artificial</p>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => navigate("/gestor-ia/agentes")}>
              <Bot className="w-3.5 h-3.5" /> Gestão de Agentes
            </Button>
            <Button size="sm" className="bg-[hsl(258,90%,66%)] hover:bg-[hsl(258,80%,55%)] text-white gap-1.5" onClick={() => navigate("/usuarios")}>
              <Plus className="w-3.5 h-3.5" /> Cadastrar Usuário
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5">
              <RefreshCw className="w-3.5 h-3.5" /> Atualizar Dados
            </Button>
          </div>
        </div>

        {/* Filters Bar */}
        <div className="bg-card rounded-xl border border-border p-3 mb-5 flex flex-wrap gap-2">
          {["Todos os períodos", "Todas as entidades", "Todos os tipos", "Todos os níveis", "Todas as áreas"].map((f, i) => (
            <button key={i} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs text-muted-foreground hover:border-[hsl(258,90%,66%)] hover:text-foreground transition-colors">
              {f} <span className="text-[10px]">▾</span>
            </button>
          ))}
        </div>


        {/* Tabs */}
        <Tabs defaultValue="visao-geral">
          <TabsList className="bg-card border border-border h-auto p-1 flex-wrap">
            <TabsTrigger value="visao-geral" className="gap-1.5 data-[state=active]:bg-[hsl(258,90%,66%)] data-[state=active]:text-white text-xs">
              <LayoutGrid className="w-3.5 h-3.5" /> Visão Geral
            </TabsTrigger>
            <TabsTrigger value="base-conhecimento" className="gap-1.5 data-[state=active]:bg-[hsl(258,90%,66%)] data-[state=active]:text-white text-xs">
              <BookOpen className="w-3.5 h-3.5" /> Base de Conhecimento
            </TabsTrigger>
            <TabsTrigger value="governanca" className="gap-1.5 data-[state=active]:bg-[hsl(258,90%,66%)] data-[state=active]:text-white text-xs">
              <ShieldCheck className="w-3.5 h-3.5" /> Governança
            </TabsTrigger>
            <TabsTrigger value="logs" className="gap-1.5 data-[state=active]:bg-[hsl(258,90%,66%)] data-[state=active]:text-white text-xs">
              <ScrollText className="w-3.5 h-3.5" /> Logs & Auditoria
            </TabsTrigger>
            <TabsTrigger value="risk-engine" className="gap-1.5 data-[state=active]:bg-[hsl(258,90%,66%)] data-[state=active]:text-white text-xs">
              <Activity className="w-3.5 h-3.5" /> Risk Engine
            </TabsTrigger>
            <TabsTrigger value="limites" className="gap-1.5 data-[state=active]:bg-[hsl(258,90%,66%)] data-[state=active]:text-white text-xs">
              <Gauge className="w-3.5 h-3.5" /> Limite de Relatórios
            </TabsTrigger>
            <TabsTrigger value="orfaos" className="gap-1.5 data-[state=active]:bg-[hsl(258,90%,66%)] data-[state=active]:text-white text-xs">
              <FileText className="w-3.5 h-3.5" /> Documentos Órfãos
            </TabsTrigger>
            <TabsTrigger value="exec-time" className="gap-1.5 data-[state=active]:bg-[hsl(258,90%,66%)] data-[state=active]:text-white text-xs">
              <Clock className="w-3.5 h-3.5" /> Tempo de execução
            </TabsTrigger>
          </TabsList>

          <TabsContent value="visao-geral"><TabVisaoGeral /></TabsContent>
          <TabsContent value="base-conhecimento"><TabBaseConhecimento /></TabsContent>
          <TabsContent value="governanca"><TabGovernanca /></TabsContent>
          <TabsContent value="logs"><TabLogs /></TabsContent>
          <TabsContent value="risk-engine"><TabRiskEngineDash /></TabsContent>
          <TabsContent value="limites"><TabReportLimits /></TabsContent>
          <TabsContent value="orfaos"><TabOrphanDocuments /></TabsContent>
          <TabsContent value="exec-time"><TabExecutionTime /></TabsContent>
        </Tabs>
      </div>
    </PlatformLayout>
  );
};

export default GestorIA;
