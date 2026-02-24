import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Upload, FileText, CheckCircle2, ArrowRight, ArrowLeft,
  Shield, MessageCircle, Send, AlertTriangle, Download, Printer,
  Calculator, TrendingUp, TrendingDown, BarChart3, PieChart, Activity,
  Target, Scale, Layers, Building2, Loader2, FileSpreadsheet,
  DollarSign, Landmark, AlertOctagon, Search, ChevronDown, ChevronUp
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AuditProvider, useAudit } from "@/contexts/AuditContext";
import PlatformLayout from "@/components/PlatformLayout";

/* ── Helpers ── */
const fmt = (n: number) => new Intl.NumberFormat("pt-BR").format(Math.round(n));
const fmtPct = (n: number) => `${(n * 100).toFixed(1)}%`;
const fmtDays = (n: number) => `${Math.round(n)} dias`;

/* ── Risk Colors ── */
const riskBadge: Record<string, { bg: string; label: string }> = {
  baixo: { bg: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30", label: "🟢 Baixo" },
  moderado: { bg: "bg-yellow-500/15 text-yellow-600 border-yellow-500/30", label: "🟡 Moderado" },
  elevado: { bg: "bg-red-500/15 text-red-600 border-red-500/30", label: "🔴 Elevado" },
  critico: { bg: "bg-gray-800/15 text-gray-800 border-gray-800/30", label: "⚫ Crítico (Risco RJ)" },
};

const severityColors: Record<string, { bg: string; label: string }> = {
  critico: { bg: "bg-red-500/15 text-red-600", label: "🔴 Crítico" },
  alto: { bg: "bg-orange-500/15 text-orange-600", label: "🟠 Alto" },
  medio: { bg: "bg-yellow-500/15 text-yellow-600", label: "🟡 Médio" },
  baixo: { bg: "bg-blue-500/15 text-blue-600", label: "🔵 Baixo" },
  observacao: { bg: "bg-gray-500/15 text-gray-500", label: "⚪ Observação" },
};

/* ══════════════════════════════════════════════════════
   PHASE 1: UPLOAD
   ══════════════════════════════════════════════════════ */
const UploadPhase = ({ onProcess }: { onProcess: () => void }) => {
  const { state, setConfig } = useAudit();
  const [dragOver, setDragOver] = useState(false);

  const handleFiles = (fileList: FileList | null) => {
    if (!fileList) return;
    const newDocs = Array.from(fileList).map((f, i) => ({
      id: `doc-${Date.now()}-${i}`,
      fileName: f.name,
      fileSize: f.size,
      type: "balanco" as const,
      parsed: false,
      tags: ["carregado" as const],
    }));
    setConfig({ files: [...state.config.files, ...newDocs] });
  };

  const removeFile = (id: string) => {
    setConfig({ files: state.config.files.filter(f => f.id !== id) });
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="text-center space-y-2">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/5 border border-primary/10 mb-4">
          <Shield className="w-4 h-4 text-primary" />
          <span className="text-xs font-semibold text-primary">Agente IA Auditor Contábil Sênior</span>
        </div>
        <h1 className="text-2xl font-bold text-foreground">Upload do Balancete</h1>
        <p className="text-muted-foreground text-sm">
          Envie o balancete mensal para análise automatizada como Auditor Fiscal Contábil especializado em Recuperação Judicial.
        </p>
      </div>

      <Card>
        <CardContent className="p-6 space-y-4">
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }}
            onClick={() => document.getElementById("file-input")?.click()}
            className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-all ${
              dragOver ? "border-accent bg-accent/5 scale-[1.01]" : "border-border hover:border-accent/60 hover:bg-muted/30"
            }`}
          >
            <input id="file-input" type="file" hidden multiple accept=".xlsx,.xls,.csv" onChange={(e) => handleFiles(e.target.files)} />
            <FileSpreadsheet className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
            <p className="text-sm font-medium text-foreground">Arraste o balancete ou clique para selecionar</p>
            <p className="text-xs text-muted-foreground mt-1">Formatos aceitos: .xlsx, .xls, .csv</p>
          </div>

          {state.config.files.length > 0 && (
            <div className="space-y-2">
              {state.config.files.map(f => (
                <div key={f.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border/50">
                  <div className="flex items-center gap-3">
                    <FileText className="w-4 h-4 text-accent" />
                    <div>
                      <p className="text-sm font-medium text-foreground">{f.fileName}</p>
                      <p className="text-xs text-muted-foreground">{(f.fileSize / 1024).toFixed(1)} KB</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge className="bg-emerald-500/10 text-emerald-600 text-[10px]">🟢 Carregado</Badge>
                    <Button variant="ghost" size="sm" onClick={() => removeFile(f.id)} className="text-muted-foreground text-xs h-7 w-7 p-0">✕</Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="bg-muted/30">
        <CardContent className="p-4">
          <p className="text-xs font-semibold text-foreground mb-2">O Agente IA irá:</p>
          <ul className="text-xs text-muted-foreground space-y-1.5">
            <li className="flex items-start gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 mt-0.5 shrink-0" /> Validar estrutura e identificar plano de contas</li>
            <li className="flex items-start gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 mt-0.5 shrink-0" /> Mapear: Ativo, Passivo, PL, Receitas, Custos, Despesas</li>
            <li className="flex items-start gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 mt-0.5 shrink-0" /> Executar testes de auditoria automatizados (CPC, IFRS, NBC TA)</li>
            <li className="flex items-start gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 mt-0.5 shrink-0" /> Identificar riscos de insolvência e indicativos de RJ</li>
            <li className="flex items-start gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 mt-0.5 shrink-0" /> Gerar documento "Fase2_AvaliaçãoEmpresas_V3" automaticamente</li>
          </ul>
        </CardContent>
      </Card>

      <Button
        onClick={onProcess}
        disabled={state.config.files.length === 0}
        className="w-full bg-accent text-accent-foreground hover:bg-accent/90 gap-2 h-12 text-base font-semibold"
      >
        Iniciar Análise <ArrowRight className="w-5 h-5" />
      </Button>
    </div>
  );
};

/* ══════════════════════════════════════════════════════
   PHASE 2: PROCESSING
   ══════════════════════════════════════════════════════ */
const processingSteps = [
  { label: "Validando estrutura do balancete...", duration: 1200 },
  { label: "Identificando plano de contas...", duration: 1000 },
  { label: "Mapeando Ativo, Passivo e PL...", duration: 1500 },
  { label: "Executando testes de consistência contábil...", duration: 1300 },
  { label: "Calculando indicadores financeiros...", duration: 1100 },
  { label: "Analisando endividamento e solvência...", duration: 1400 },
  { label: "Executando Score BEX-RJ...", duration: 1200 },
  { label: "Classificando pendências contábeis...", duration: 1000 },
  { label: "Gerando documento Fase2_AvaliaçãoEmpresas_V3...", duration: 1500 },
];

const ProcessingPhase = ({ onComplete }: { onComplete: () => void }) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const totalDuration = processingSteps.reduce((a, s) => a + s.duration, 0);
    let elapsed = 0;

    const runStep = (idx: number) => {
      if (idx >= processingSteps.length) {
        setProgress(100);
        setTimeout(onComplete, 500);
        return;
      }
      setCurrentStep(idx);
      elapsed += processingSteps[idx].duration;
      setProgress(Math.round((elapsed / totalDuration) * 100));
      setTimeout(() => runStep(idx + 1), processingSteps[idx].duration);
    };

    const timer = setTimeout(() => runStep(0), 300);
    return () => clearTimeout(timer);
  }, [onComplete]);

  return (
    <div className="max-w-lg mx-auto space-y-8 py-16">
      <div className="text-center space-y-3">
        <Loader2 className="w-12 h-12 text-accent mx-auto animate-spin" />
        <h2 className="text-xl font-bold text-foreground">Processando Análise</h2>
        <p className="text-sm text-muted-foreground">
          O Agente IA Auditor Contábil Sênior está analisando seus documentos...
        </p>
      </div>

      <div className="space-y-3">
        <Progress value={progress} className="h-2" />
        <p className="text-xs text-muted-foreground text-center">{progress}%</p>
      </div>

      <div className="space-y-2">
        {processingSteps.map((step, i) => (
          <div key={i} className={`flex items-center gap-3 p-2.5 rounded-lg transition-all ${
            i < currentStep ? "bg-emerald-500/5" :
            i === currentStep ? "bg-accent/5 border border-accent/20" :
            "opacity-40"
          }`}>
            {i < currentStep ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
            ) : i === currentStep ? (
              <Loader2 className="w-4 h-4 text-accent animate-spin shrink-0" />
            ) : (
              <div className="w-4 h-4 rounded-full border border-border shrink-0" />
            )}
            <span className="text-xs text-foreground">{step.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

/* ══════════════════════════════════════════════════════
   PHASE 3: RESULTS (TABS)
   ══════════════════════════════════════════════════════ */

/* ── Mock: Diagnóstico data ── */
const diagnosticoData = {
  riskLevel: "moderado" as const,
  resumo: "A empresa apresenta estrutura patrimonial equilibrada com PL positivo, porém com tendência de deterioração nos indicadores de liquidez e aumento expressivo do endividamento oneroso. A margem líquida caiu 60% no período, sinalizando pressão sobre a geração de caixa. O capital de giro líquido permanece positivo, mas com redução relativa frente ao crescimento do passivo circulante. Recomenda-se atenção especial à evolução do passivo oneroso e à capacidade de cobertura de juros.",
  pontosChave: [
    { item: "Patrimônio Líquido", status: "positivo", detail: "R$ 332.223.611 — PL positivo e crescente" },
    { item: "Capital de Giro Líquido", status: "atencao", detail: "R$ 52.951.349 — positivo mas sob pressão" },
    { item: "Margem Líquida", status: "atencao", detail: "13,6% → deterioração de 60% no período" },
    { item: "Endividamento Oneroso", status: "critico", detail: "R$ 155.554.694 — crescimento de 52%" },
    { item: "Cobertura de Juros", status: "atencao", detail: "6,9x — queda de 43% em relação ao ano anterior" },
  ],
};

/* ── Mock: Pendências (Análise Técnica) ── */
const pendencias = [
  { id: "p1", tipo: "Inconsistência", gravidade: "critico", conta: "3.01", problema: "Receita cresce 40% sem aumento proporcional de caixa operacional", fundamentacao: "CPC 47 / IFRS 15 — Os cinco passos de reconhecimento de receita exigem transferência efetiva de controle. A divergência entre receita e caixa operacional pode indicar reconhecimento antecipado.", risco: "Distorção material nas demonstrações", impacto: "Superavaliação do resultado em até R$ 32 milhões", recomendacao: "Revisar a política de reconhecimento de receita e reconciliar com fluxo de caixa operacional" },
  { id: "p2", tipo: "Impropriedade", gravidade: "critico", conta: "2.01.02", problema: "Fornecedores com variação AH de 583% em 2022 — possível reclassificação", fundamentacao: "CPC 26 / IAS 1 — Classificação inadequada de passivos pode distorcer indicadores de liquidez e endividamento. NBC TA 315 — Risco significativo de distorção material.", risco: "Manipulação de indicadores financeiros", impacto: "Distorção de Liquidez Corrente e Endividamento de Curto Prazo", recomendacao: "Investigar composição de fornecedores em 2022 e verificar se houve reclassificação indevida" },
  { id: "p3", tipo: "Fragilidade", gravidade: "alto", conta: "1.02.03", problema: "Imobilizado cresceu 51% sem evidência de teste de impairment", fundamentacao: "CPC 01 / IAS 36 — Teste de recuperabilidade é obrigatório quando há indicativo de perda. NBC TA 500 — Evidência de auditoria insuficiente.", risco: "Ativos superavaliados no balanço", impacto: "Potencial ajuste de R$ 115 milhões no imobilizado", recomendacao: "Implementar teste anual de recuperabilidade conforme CPC 01" },
  { id: "p4", tipo: "Omissão", gravidade: "alto", conta: "2.02.01", problema: "Empréstimos LP cresceram 57% — risco de covenant e refinanciamento", fundamentacao: "CPC 25 / IAS 37 — Provisões devem ser reconhecidas quando há obrigação presente. Lei 11.101/2005 — Risco de pedido de recuperação judicial por credores.", risco: "Risco de vencimento antecipado e inadimplência", impacto: "Exposição bancária de R$ 136 milhões em longo prazo", recomendacao: "Avaliar covenants ativos e capacidade de refinanciamento" },
  { id: "p5", tipo: "Observação", gravidade: "medio", conta: "1.01.04", problema: "Estoques cresceram 45% acima do CMV — possível obsolescência", fundamentacao: "CPC 16 / IAS 2 — Estoques devem ser avaliados pelo menor entre custo e valor realizável líquido.", risco: "Superavaliação de ativos circulantes", impacto: "Estoque excedente estimado em R$ 8,7 milhões", recomendacao: "Realizar inventário físico e teste de valor realizável líquido" },
  { id: "p6", tipo: "Observação", gravidade: "baixo", conta: "1.01.06", problema: "Tributos a recuperar cresceram 83% — verificar recuperabilidade", fundamentacao: "CPC 32 / IAS 12 — Créditos tributários devem ter expectativa provável de realização.", risco: "Créditos tributários não recuperáveis", impacto: "R$ 12,8 milhões em tributos a recuperar", recomendacao: "Avaliar expectativa de realização e documentar bases" },
];

/* ── Mock: Score RJ ── */
const scoreRJData = {
  score: 47,
  classificacao: "Atenção",
  componentes: [
    { nome: "Endividamento", peso: 0.25, valor: 44.5, nota: "Passivo total / Ativo total = 44.5%" },
    { nome: "Liquidez", peso: 0.20, valor: 55, nota: "Liquidez corrente 1.78x — aceitável mas em queda" },
    { nome: "PL Negativo", peso: 0.20, valor: 0, nota: "PL positivo — sem risco neste componente" },
    { nome: "Geração de Caixa", peso: 0.20, valor: 60, nota: "Margem operacional em deterioração" },
    { nome: "Concentração Dívida", peso: 0.15, valor: 72, nota: "Alta concentração em empréstimos LP" },
  ],
};

/* ── Tab 1: Diagnóstico Financeiro ── */
const TabDiagnostico = () => {
  const r = riskBadge[diagnosticoData.riskLevel];
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2"><Activity className="w-4 h-4 text-accent" /> Diagnóstico Financeiro</CardTitle>
            <Badge className={`${r.bg} border text-xs`}>{r.label}</Badge>
          </div>
          <CardDescription>Resumo executivo automatizado — Fase2_AvaliaçãoEmpresas_V3</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="p-4 rounded-lg bg-muted/30 border border-border/50">
            <p className="text-sm text-foreground leading-relaxed">{diagnosticoData.resumo}</p>
          </div>

          <div>
            <h4 className="text-sm font-semibold text-foreground mb-3">Pontos-Chave</h4>
            <div className="space-y-2">
              {diagnosticoData.pontosChave.map(p => (
                <div key={p.item} className="flex items-center justify-between p-3 rounded-lg bg-muted/20 border border-border/30">
                  <div className="flex items-center gap-3">
                    <div className={`w-2.5 h-2.5 rounded-full ${
                      p.status === "positivo" ? "bg-emerald-500" :
                      p.status === "atencao" ? "bg-yellow-500" : "bg-red-500"
                    }`} />
                    <span className="text-sm font-medium text-foreground">{p.item}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">{p.detail}</span>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

/* ── Tab 2: Indicadores Econômico-Financeiros ── */
const TabIndicadores = () => {
  const { state } = useAudit();
  const years = ["2021", "2022", "2023"];
  const ind = state.financialAnalysis.indicators;

  const sections = [
    {
      title: "Liquidez", icon: Activity, items: [
        { label: "Liquidez Corrente", key: "liquidezCorrente", fmt: fmtPct, formula: "AC / PC", benchmark: "> 1,5" },
        { label: "Liquidez Seca", key: "liquidezSeca", fmt: fmtPct, formula: "(AC - EST) / PC", benchmark: "> 1,0" },
        { label: "Liquidez Imediata", key: "liquidezImediata", fmt: fmtPct, formula: "Caixa / PC", benchmark: "> 0,3" },
        { label: "Liquidez Geral", key: "liquidezGeral", fmt: fmtPct, formula: "(AC + RLP) / (PC + PNC)", benchmark: "> 1,0" },
      ]
    },
    {
      title: "Endividamento", icon: PieChart, items: [
        { label: "Endividamento Total", key: "endividamentoGeral", fmt: fmtPct, formula: "PT / AT", benchmark: "< 60%" },
        { label: "Composição Endividamento", key: "composicaoEndividamento", fmt: fmtPct, formula: "PC / PT", benchmark: "< 50%" },
        { label: "Imobilização do PL", key: "imobilizacaoPL", fmt: fmtPct, formula: "Imob / PL", benchmark: "< 80%" },
        { label: "Cobertura de Juros", key: "coberturaJuros", fmt: (n: number) => `${n.toFixed(1)}x`, formula: "LAJIR / Juros", benchmark: "> 3,0x" },
      ]
    },
    {
      title: "Atividade", icon: BarChart3, items: [
        { label: "Giro do Ativo", key: "giroAtivo", fmt: (n: number) => n.toFixed(2), formula: "V / AT", benchmark: "> 0,5" },
        { label: "PMR", key: "pmr", fmt: fmtDays, formula: "DR×360 / V", benchmark: "< 60d" },
        { label: "PMP", key: "pmp", fmt: fmtDays, formula: "DP×360 / Compras", benchmark: "< 45d" },
        { label: "Idade Média Estoque", key: "idadeMediaEstoque", fmt: fmtDays, formula: "EST×360 / CMV", benchmark: "< 90d" },
      ]
    },
    {
      title: "Rentabilidade", icon: TrendingUp, items: [
        { label: "Margem Líquida", key: "margemLiquida", fmt: fmtPct, formula: "LL / V", benchmark: "> 10%" },
        { label: "Margem Operacional", key: "margemOperacional", fmt: fmtPct, formula: "LAJIR / V", benchmark: "> 15%" },
        { label: "ROE", key: "roe", fmt: fmtPct, formula: "LL / PL", benchmark: "> 15%" },
        { label: "ROA", key: "roa", fmt: fmtPct, formula: "LL / AT", benchmark: "> 5%" },
      ]
    },
  ];

  return (
    <div className="space-y-4">
      <div className="grid md:grid-cols-2 gap-4">
        {sections.map(sec => (
          <Card key={sec.title}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2"><sec.icon className="w-4 h-4 text-accent" /> {sec.title}</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-[10px]">Índice</TableHead>
                    <TableHead className="text-[10px]">Fórmula</TableHead>
                    {years.map(y => <TableHead key={y} className="text-right text-[10px]">{y}</TableHead>)}
                    <TableHead className="text-right text-[10px]">Benchmark</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sec.items.map(item => (
                    <TableRow key={item.key}>
                      <TableCell className="text-xs font-medium">{item.label}</TableCell>
                      <TableCell className="text-[10px] text-muted-foreground font-mono">{item.formula}</TableCell>
                      {years.map(y => (
                        <TableCell key={y} className="text-right text-xs font-mono">
                          {ind[y] ? item.fmt((ind[y] as any)[item.key]) : "—"}
                        </TableCell>
                      ))}
                      <TableCell className="text-right text-[10px] text-muted-foreground">{item.benchmark}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* EBITDA estimado card */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2"><Calculator className="w-4 h-4 text-accent" /> EBITDA Estimado</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4">
            {["2021", "2022", "2023"].map(y => {
              const d = state.config.entityData[y];
              if (!d) return null;
              const ebitda = d.resultadoOperacional + d.despesasFinanceiras;
              return (
                <div key={y} className="p-4 rounded-lg bg-muted/30 text-center">
                  <p className="text-xs text-muted-foreground">{y}</p>
                  <p className="text-lg font-bold font-mono text-foreground">{fmt(ebitda)}</p>
                  <p className="text-[10px] text-muted-foreground mt-1">LAJIR + Desp. Financeiras</p>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

/* ── Tab 3: Análise de Endividamento ── */
const TabEndividamento = () => {
  const { state } = useAudit();
  const d = state.config.entityData["2023"];
  if (!d) return null;

  const empCP = 18966329;
  const empLP = 136588365;
  const dividaOnerosa = empCP + empLP;
  const dividaLiquida = dividaOnerosa - d.caixaEquivalentes;
  const ptotal = d.passivoCirculante + d.passivoNaoCirculante;

  const riscos = [
    { tipo: "Risco Bancário", nivel: "alto", detail: `Dívida onerosa: R$ ${fmt(dividaOnerosa)} — ${fmtPct(dividaOnerosa / ptotal)} do passivo total` },
    { tipo: "Risco Trabalhista", nivel: "medio", detail: "Sem provisões trabalhistas evidenciadas no balancete. Verificar contingências." },
    { tipo: "Risco Fiscal", nivel: "medio", detail: `Tributos a recuperar de R$ ${fmt(12845667)} — verificar recuperabilidade.` },
  ];

  return (
    <div className="space-y-4">
      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2"><Landmark className="w-4 h-4 text-accent" /> Estrutura da Dívida</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {[
              { label: "Dívida Onerosa Total", value: dividaOnerosa },
              { label: "├─ Curto Prazo", value: empCP, sub: true },
              { label: "└─ Longo Prazo", value: empLP, sub: true },
              { label: "Caixa e Equivalentes", value: d.caixaEquivalentes },
              { label: "Dívida Líquida", value: dividaLiquida, highlight: true },
            ].map(item => (
              <div key={item.label} className={`flex justify-between p-3 rounded-lg ${item.highlight ? "bg-accent/5 border border-accent/20" : "bg-muted/30"}`}>
                <span className={`text-sm ${(item as any).sub ? "text-muted-foreground pl-4" : "text-foreground font-medium"}`}>{item.label}</span>
                <span className={`text-sm font-mono font-bold ${item.value < 0 ? "text-red-500" : "text-foreground"}`}>{fmt(item.value)}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2"><PieChart className="w-4 h-4 text-accent" /> Curto vs Longo Prazo</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-muted-foreground">Curto Prazo</span>
                  <span className="font-mono">{fmtPct(d.passivoCirculante / ptotal)}</span>
                </div>
                <Progress value={(d.passivoCirculante / ptotal) * 100} className="h-2" />
              </div>
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-muted-foreground">Longo Prazo</span>
                  <span className="font-mono">{fmtPct(d.passivoNaoCirculante / ptotal)}</span>
                </div>
                <Progress value={(d.passivoNaoCirculante / ptotal) * 100} className="h-2" />
              </div>
            </div>

            <div className="border-t border-border/50 pt-3 space-y-2">
              <p className="text-xs font-semibold text-foreground">Classificação de Risco</p>
              {riscos.map(r => (
                <div key={r.tipo} className="flex items-start gap-2 p-2 rounded bg-muted/20">
                  <Badge className={`${severityColors[r.nivel]?.bg} text-[10px] shrink-0`}>{r.nivel.toUpperCase()}</Badge>
                  <div>
                    <p className="text-xs font-medium text-foreground">{r.tipo}</p>
                    <p className="text-[10px] text-muted-foreground">{r.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

/* ── Tab 4: Análise Patrimonial ── */
const TabPatrimonial = () => {
  const { state } = useAudit();
  const years = ["2021", "2022", "2023"];

  const alertas = [
    { conta: "1.02.03 — Imobilizado", alerta: "Ativos superavaliados?", detail: `Crescimento de 51% sem teste de impairment. Valor: R$ ${fmt(342266918)}`, gravidade: "alto" },
    { conta: "1.01.04 — Estoques", alerta: "Estoques inflados?", detail: `Crescimento de 45% acima do CMV. Valor: R$ ${fmt(28446924)}`, gravidade: "medio" },
    { conta: "1.02.04 — Intangível", alerta: "Sem depreciação evidenciada?", detail: `Salto de R$ 8M para R$ 82M em 2022 (891%). Possível aquisição sem amortização.`, gravidade: "medio" },
    { conta: "1.01.03 — Contas a Receber", alerta: "Concentração?", detail: `Crescimento de 56%. Verificar aging e PECLD. Valor: R$ ${fmt(21974701)}`, gravidade: "baixo" },
  ];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><Layers className="w-4 h-4 text-accent" /> Balanço Patrimonial — Visão Analítica</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-[10px]">Conta</TableHead>
                <TableHead className="text-[10px]">Descrição</TableHead>
                {years.map(y => <TableHead key={y} className="text-right text-[10px]">{y}</TableHead>)}
                <TableHead className="text-right text-[10px]">AH 23/22</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {state.balancoRows.map(row => {
                const v22 = row.values["2022"] || 0;
                const v23 = row.values["2023"] || 0;
                const ah = v22 !== 0 ? ((v23 - v22) / Math.abs(v22)) : 0;
                const isAlert = Math.abs(ah) > 0.25 && row.conta !== "1" && row.conta !== "2";
                return (
                  <TableRow key={row.conta} className={row.hasRisk ? "bg-orange-500/5" : ""}>
                    <TableCell className="text-[10px] font-mono text-muted-foreground">{row.conta}</TableCell>
                    <TableCell className={`text-xs ${row.conta.split(".").length <= 2 ? "font-semibold" : ""}`}>{row.descricao}</TableCell>
                    {years.map(y => (
                      <TableCell key={y} className="text-right text-xs font-mono">{fmt(row.values[y] || 0)}</TableCell>
                    ))}
                    <TableCell className={`text-right text-xs font-mono ${isAlert ? "text-orange-500 font-bold" : ""}`}>
                      {ah > 0 ? "+" : ""}{fmtPct(ah)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-orange-500" /> Alertas Patrimoniais</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {alertas.map(a => (
            <div key={a.conta} className="flex items-start gap-3 p-3 rounded-lg bg-muted/20 border border-border/30">
              <Badge className={`${severityColors[a.gravidade]?.bg} text-[10px] shrink-0 mt-0.5`}>{a.gravidade.toUpperCase()}</Badge>
              <div>
                <p className="text-xs font-semibold text-foreground">{a.conta} — {a.alerta}</p>
                <p className="text-[10px] text-muted-foreground">{a.detail}</p>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
};

/* ── Tab 5: Risco de Recuperação Judicial ── */
const TabRiscoRJ = () => {
  const scoreColor = scoreRJData.score <= 30 ? "text-emerald-500" :
                     scoreRJData.score <= 60 ? "text-yellow-500" :
                     scoreRJData.score <= 80 ? "text-orange-500" : "text-red-500";

  return (
    <div className="space-y-4">
      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2"><Target className="w-4 h-4 text-accent" /> Score BEX-RJ</CardTitle>
            <CardDescription>Modelo proprietário de avaliação de risco de Recuperação Judicial</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="text-center py-6">
              <p className={`text-6xl font-bold ${scoreColor}`}>{scoreRJData.score}</p>
              <p className={`text-lg font-semibold mt-2 ${scoreColor}`}>{scoreRJData.classificacao}</p>
              <p className="text-xs text-muted-foreground mt-1">de 100 pontos</p>
            </div>

            <div className="space-y-2">
              {scoreRJData.componentes.map(c => (
                <div key={c.nome} className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-foreground font-medium">{c.nome} <span className="text-muted-foreground">({(c.peso * 100)}%)</span></span>
                    <span className="font-mono">{c.valor}/100</span>
                  </div>
                  <Progress value={c.valor} className="h-1.5" />
                  <p className="text-[10px] text-muted-foreground">{c.nota}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Fórmula do Score BEX-RJ</CardTitle>
            </CardHeader>
            <CardContent>
              <code className="block bg-muted/50 p-4 rounded-lg text-[11px] font-mono leading-relaxed">
                Score RJ ={"\n"}
                {"  "}(Endividamento × 0.25) +{"\n"}
                {"  "}(Liquidez × 0.20) +{"\n"}
                {"  "}(PL Negativo × 0.20) +{"\n"}
                {"  "}(Geração Caixa × 0.20) +{"\n"}
                {"  "}(Concentração Dívida × 0.15)
              </code>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Classificação</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {[
                { range: "0 – 30", label: "Saudável", color: "bg-emerald-500/10 text-emerald-600", active: scoreRJData.score <= 30 },
                { range: "31 – 60", label: "Atenção", color: "bg-yellow-500/10 text-yellow-600", active: scoreRJData.score > 30 && scoreRJData.score <= 60 },
                { range: "61 – 80", label: "Alto Risco", color: "bg-orange-500/10 text-orange-600", active: scoreRJData.score > 60 && scoreRJData.score <= 80 },
                { range: "81 – 100", label: "Forte Indicativo de RJ", color: "bg-red-500/10 text-red-600", active: scoreRJData.score > 80 },
              ].map(item => (
                <div key={item.range} className={`flex items-center justify-between p-3 rounded-lg bg-muted/20 ${item.active ? "ring-2 ring-accent" : ""}`}>
                  <div className="flex items-center gap-3">
                    <span className={`text-xs font-mono font-bold px-2 py-1 rounded ${item.color}`}>{item.range}</span>
                    <span className="text-sm font-medium text-foreground">{item.label}</span>
                  </div>
                  {item.active && <CheckCircle2 className="w-4 h-4 text-accent" />}
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="bg-muted/30">
            <CardContent className="p-4">
              <p className="text-xs font-semibold text-foreground mb-1">Base Normativa</p>
              <div className="flex flex-wrap gap-1.5">
                {["Lei 11.101/2005", "CPC 26", "NBC TA 570", "Princípio da Continuidade"].map(n => (
                  <Badge key={n} variant="secondary" className="text-[10px]">{n}</Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

/* ── Tab 6: Análise Técnica (Pendências) ── */
const TabAnaliseTecnica = () => {
  const [selectedId, setSelectedId] = useState(pendencias[0]?.id || "");
  const selected = pendencias.find(p => p.id === selectedId);

  return (
    <div className="grid lg:grid-cols-3 gap-4" style={{ minHeight: 500 }}>
      {/* Col 1: Lista de Pendências */}
      <Card className="lg:col-span-1">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-orange-500" /> Pendências ({pendencias.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[440px]">
            <div className="space-y-2 pr-2">
              {pendencias.map(p => (
                <button
                  key={p.id}
                  onClick={() => setSelectedId(p.id)}
                  className={`w-full text-left p-3 rounded-lg border transition-all ${
                    selectedId === p.id ? "border-accent bg-accent/5" : "border-border/50 hover:bg-muted/50"
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <Badge className={`${severityColors[p.gravidade]?.bg} text-[10px]`}>{severityColors[p.gravidade]?.label}</Badge>
                    <span className="text-[10px] text-muted-foreground">{p.tipo}</span>
                  </div>
                  <p className="text-xs font-medium text-foreground line-clamp-2">{p.problema}</p>
                  <p className="text-[10px] text-muted-foreground mt-1">Conta: {p.conta}</p>
                </button>
              ))}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Col 2-3: Detalhes */}
      <Card className="lg:col-span-2">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">📌 Ponto de Vista do Auditor IA</CardTitle>
        </CardHeader>
        <CardContent>
          {selected ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge className={`${severityColors[selected.gravidade]?.bg} text-xs`}>{severityColors[selected.gravidade]?.label}</Badge>
                <Badge variant="outline" className="text-xs">{selected.tipo}</Badge>
                <Badge variant="secondary" className="text-[10px] font-mono">Conta {selected.conta}</Badge>
              </div>

              <p className="text-sm font-medium text-foreground">{selected.problema}</p>

              <div className="space-y-3">
                <div className="p-3 rounded-lg bg-muted/30">
                  <p className="text-[10px] font-semibold text-foreground mb-1 uppercase tracking-wider">Fundamentação Técnica</p>
                  <p className="text-xs text-muted-foreground leading-relaxed">{selected.fundamentacao}</p>
                </div>

                <div className="grid sm:grid-cols-2 gap-3">
                  <div className="p-3 rounded-lg bg-red-500/5 border border-red-500/10">
                    <p className="text-[10px] font-semibold text-red-600 mb-1">Risco Envolvido</p>
                    <p className="text-xs text-foreground">{selected.risco}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-orange-500/5 border border-orange-500/10">
                    <p className="text-[10px] font-semibold text-orange-600 mb-1">Impacto no Balanço</p>
                    <p className="text-xs text-foreground">{selected.impacto}</p>
                  </div>
                </div>

                <div className="p-3 rounded-lg bg-accent/5 border border-accent/20">
                  <p className="text-[10px] font-semibold text-accent-foreground mb-1">Recomendação Corretiva</p>
                  <p className="text-xs text-foreground">{selected.recomendacao}</p>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Selecione uma pendência para ver o parecer do Auditor IA.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

/* ── Tab 7: Chat Auditor IA ── */
const TabChat = () => {
  const [messages, setMessages] = useState<Array<{ role: "bot" | "user"; text: string }>>([
    { role: "bot", text: "Sou o Agente IA Auditor Contábil Sênior, especialista em Recuperação Judicial. Posso responder sobre:\n\n• Fundamentação técnica dos achados\n• Riscos de insolvência e RJ\n• Ajustes contábeis recomendados\n• Normas CPC, IFRS, NBC TA\n• Impacto jurídico das pendências\n\nComo posso ajudar?" },
  ]);
  const [input, setInput] = useState("");

  const mockResponses: Record<string, string> = {
    "risco": "Com base na análise, o Score BEX-RJ de 47 pontos indica **zona de atenção**. Os principais fatores são:\n\n1. **Endividamento oneroso crescente** — Empréstimos LP cresceram 57%\n2. **Deterioração da margem líquida** — Queda de 60%\n3. **Concentração de dívida bancária** — R$ 155M em dívida onerosa\n\nEmbora o PL esteja positivo, a tendência de deterioração exige monitoramento contínuo. Não há indicativo imediato de RJ, mas a empresa deve implementar plano de reestruturação financeira.",
    "ajuste": "Os principais ajustes contábeis recomendados são:\n\n1. **Teste de Impairment** (CPC 01) — Imobilizado de R$ 342M sem evidência de teste\n2. **Valor Realizável do Estoque** (CPC 16) — Estoque excedente de ~R$ 8,7M\n3. **PECLD sobre Contas a Receber** (CPC 48) — Crescimento de 56% exige revisão do aging\n4. **Reclassificação de Fornecedores 2022** — Variação de 583% exige investigação\n\nImpacto estimado: Potencial redução de R$ 15-20M no ativo líquido.",
    "ressalva": "Sim, os achados identificados podem gerar **ressalva no parecer de auditoria** conforme NBC TA 705:\n\n• **Ressalva qualificada** — Ausência de teste de impairment constitui distorção material, porém não generalizada\n• **Base para ressalva** — CPC 01 exige teste anual quando há indicativos de perda\n• **Impacto** — O parecer deve incluir parágrafo de ênfase sobre continuidade (NBC TA 570)\n\nRecomendo também nota explicativa sobre a evolução do endividamento oneroso.",
  };

  const send = () => {
    if (!input.trim()) return;
    const q = input.trim();
    setInput("");
    setMessages(m => [...m, { role: "user", text: q }]);

    setTimeout(() => {
      const key = Object.keys(mockResponses).find(k => q.toLowerCase().includes(k));
      const response = key ? mockResponses[key] :
        `Análise sobre "${q}":\n\nCom base nas demonstrações financeiras analisadas e nos frameworks CPC/IFRS/NBC TA, posso informar que este ponto requer avaliação complementar considerando:\n\n• Materialidade do item\n• Impacto nos indicadores financeiros\n• Risco para continuidade operacional\n• Potencial impacto jurídico (Lei 11.101/2005)\n\nDeseja que eu aprofunde em algum desses aspectos?`;
      setMessages(m => [...m, { role: "bot", text: response }]);
    }, 800);
  };

  return (
    <Card className="flex flex-col" style={{ minHeight: 550 }}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <MessageCircle className="w-4 h-4 text-accent" /> Chat com Auditor IA Sênior
        </CardTitle>
        <CardDescription>Linguagem técnica, fundamentada e objetiva. Especialista em RJ e solvência.</CardDescription>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col">
        <ScrollArea className="flex-1 mb-4">
          <div className="space-y-3 pr-2" style={{ maxHeight: 400 }}>
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] p-3 rounded-xl text-sm leading-relaxed whitespace-pre-wrap ${
                  msg.role === "user"
                    ? "bg-accent text-accent-foreground rounded-br-sm"
                    : "bg-muted text-foreground rounded-bl-sm"
                }`}>
                  {msg.text}
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>

        <div className="space-y-2">
          <div className="flex flex-wrap gap-1.5">
            {["Por que risco moderado?", "Qual ajuste contábil?", "Isso gera ressalva?", "Pode levar a RJ?"].map(q => (
              <button key={q} onClick={() => { setInput(q); }}
                className="text-[10px] px-2 py-1 rounded-full bg-muted/50 border border-border/50 text-muted-foreground hover:bg-muted transition-colors">
                {q}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <Input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} placeholder="Pergunte ao Auditor IA..." className="text-sm" />
            <Button onClick={send} className="bg-accent text-accent-foreground hover:bg-accent/90 px-4"><Send className="w-4 h-4" /></Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

/* ══════════════════════════════════════════════════════
   RESULTS VIEW (ALL TABS)
   ══════════════════════════════════════════════════════ */
const ResultsPhase = ({ onBack }: { onBack: () => void }) => {
  const navigate = useNavigate();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Fase2_AvaliaçãoEmpresas_V3</h1>
          <p className="text-sm text-muted-foreground">Documento gerado automaticamente pelo Agente IA Auditor Contábil Sênior</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="gap-1.5"><Download className="w-4 h-4" /> Exportar</Button>
          <Button variant="outline" size="sm" className="gap-1.5"><Printer className="w-4 h-4" /> Imprimir</Button>
          <Button variant="outline" size="sm" onClick={onBack} className="gap-1.5"><ArrowLeft className="w-4 h-4" /> Nova Análise</Button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="diagnostico" className="w-full">
        <TabsList className="w-full flex-wrap h-auto gap-1 bg-muted/50 p-1.5">
          <TabsTrigger value="diagnostico" className="text-xs gap-1.5 data-[state=active]:bg-accent data-[state=active]:text-accent-foreground">
            <Activity className="w-3.5 h-3.5" /> Diagnóstico
          </TabsTrigger>
          <TabsTrigger value="indicadores" className="text-xs gap-1.5 data-[state=active]:bg-accent data-[state=active]:text-accent-foreground">
            <BarChart3 className="w-3.5 h-3.5" /> Indicadores
          </TabsTrigger>
          <TabsTrigger value="endividamento" className="text-xs gap-1.5 data-[state=active]:bg-accent data-[state=active]:text-accent-foreground">
            <Landmark className="w-3.5 h-3.5" /> Endividamento
          </TabsTrigger>
          <TabsTrigger value="patrimonial" className="text-xs gap-1.5 data-[state=active]:bg-accent data-[state=active]:text-accent-foreground">
            <Layers className="w-3.5 h-3.5" /> Patrimonial
          </TabsTrigger>
          <TabsTrigger value="risco-rj" className="text-xs gap-1.5 data-[state=active]:bg-accent data-[state=active]:text-accent-foreground">
            <AlertOctagon className="w-3.5 h-3.5" /> Risco RJ
          </TabsTrigger>
          <TabsTrigger value="analise-tecnica" className="text-xs gap-1.5 data-[state=active]:bg-accent data-[state=active]:text-accent-foreground">
            <Search className="w-3.5 h-3.5" /> Análise Técnica
          </TabsTrigger>
          <TabsTrigger value="chat" className="text-xs gap-1.5 data-[state=active]:bg-accent data-[state=active]:text-accent-foreground">
            <MessageCircle className="w-3.5 h-3.5" /> Chat IA
          </TabsTrigger>
        </TabsList>

        <TabsContent value="diagnostico"><TabDiagnostico /></TabsContent>
        <TabsContent value="indicadores"><TabIndicadores /></TabsContent>
        <TabsContent value="endividamento"><TabEndividamento /></TabsContent>
        <TabsContent value="patrimonial"><TabPatrimonial /></TabsContent>
        <TabsContent value="risco-rj"><TabRiscoRJ /></TabsContent>
        <TabsContent value="analise-tecnica"><TabAnaliseTecnica /></TabsContent>
        <TabsContent value="chat"><TabChat /></TabsContent>
      </Tabs>
    </div>
  );
};

/* ══════════════════════════════════════════════════════
   MAIN AUDIT PAGE
   ══════════════════════════════════════════════════════ */
type AuditPhase = "upload" | "processing" | "results";

const AuditContent = () => {
  const [phase, setPhase] = useState<AuditPhase>("upload");

  return (
    <PlatformLayout>
      <div className="max-w-[1400px] mx-auto p-4 md:p-6">
        {phase === "upload" && <UploadPhase onProcess={() => setPhase("processing")} />}
        {phase === "processing" && <ProcessingPhase onComplete={() => setPhase("results")} />}
        {phase === "results" && <ResultsPhase onBack={() => setPhase("upload")} />}
      </div>
    </PlatformLayout>
  );
};

const Audit = () => (
  <AuditProvider>
    <AuditContent />
  </AuditProvider>
);

export default Audit;
