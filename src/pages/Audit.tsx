import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  Upload, FileText, CheckCircle2, ArrowRight, ArrowLeft,
  Shield, MessageCircle, Send, AlertTriangle, Download, Printer,
  Calculator, TrendingUp, TrendingDown, BarChart3, PieChart, Activity,
  Target, Scale, Layers, Building2, Loader2, FileSpreadsheet,
  DollarSign, Landmark, AlertOctagon, Search, ChevronDown, ChevronUp,
  Settings, ClipboardCheck, FileSearch, BookOpen
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
import { parseSpreadsheet, analyzeFinancialData, streamAuditChat, type ParsedFinancialData } from "@/services/auditAIService";
import { toast } from "@/hooks/use-toast";

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
   TIMELINE STEPS
   ══════════════════════════════════════════════════════ */
const timelineSteps = [
  { id: 1, label: "Configuração", icon: Settings },
  { id: 2, label: "Carregamento", icon: Upload },
  { id: 3, label: "Processamento", icon: Loader2 },
  { id: 4, label: "Análise Técnica", icon: FileSearch },
  { id: 5, label: "Relatório Final", icon: BookOpen },
];

const StepTimeline = ({ currentStep }: { currentStep: number }) => (
  <div className="w-full mb-8">
    <div className="flex items-center justify-between relative">
      {/* Connecting line */}
      <div className="absolute top-5 left-0 right-0 h-[2px] bg-border z-0" />
      <div
        className="absolute top-5 left-0 h-[2px] z-[1] transition-all duration-700"
        style={{
          width: `${((Math.min(currentStep, timelineSteps.length) - 1) / (timelineSteps.length - 1)) * 100}%`,
          background: "linear-gradient(90deg, hsl(258 90% 66%), hsl(38 85% 55%))",
        }}
      />

      {timelineSteps.map((step) => {
        const isActive = step.id === currentStep;
        const isComplete = step.id < currentStep;
        const Icon = step.icon;

        return (
          <div key={step.id} className="flex flex-col items-center z-10 relative" style={{ flex: 1 }}>
            <div
              className={`w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all duration-300 ${
                isComplete
                  ? "bg-[hsl(258,90%,66%)] border-[hsl(258,90%,66%)] text-white"
                  : isActive
                  ? "bg-white border-[hsl(258,90%,66%)] text-[hsl(258,90%,66%)] shadow-lg shadow-[hsl(258,90%,66%)]/20"
                  : "bg-white border-border text-muted-foreground"
              }`}
            >
              {isComplete ? (
                <CheckCircle2 className="w-5 h-5" />
              ) : (
                <Icon className={`w-4 h-4 ${isActive && step.icon === Loader2 ? "animate-spin" : ""}`} />
              )}
            </div>
            <span
              className={`text-[11px] mt-2 font-medium text-center leading-tight ${
                isActive ? "text-[hsl(258,90%,66%)]" : isComplete ? "text-foreground" : "text-muted-foreground"
              }`}
            >
              {step.label}
            </span>
          </div>
        );
      })}
    </div>
  </div>
);

/* ══════════════════════════════════════════════════════
   PHASE 1: UPLOAD (Configuração + Carregamento)
   ══════════════════════════════════════════════════════ */
const UploadPhase = ({ onProcess, onFilesReady }: { onProcess: () => void; onFilesReady: (files: File[]) => void }) => {
  const { state, setConfig } = useAudit();
  const [dragOver, setDragOver] = useState(false);
  const [depth, setDepth] = useState<"executivo" | "tecnico">("tecnico");
  const [purpose, setPurpose] = useState<string>("externa");
  const [rawFiles, setRawFiles] = useState<File[]>([]);

  const handleFiles = (fileList: FileList | null) => {
    if (!fileList) return;
    const filesArr = Array.from(fileList);
    setRawFiles(prev => [...prev, ...filesArr]);
    const newDocs = filesArr.map((f, i) => ({
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
    const idx = state.config.files.findIndex(f => f.id === id);
    setConfig({ files: state.config.files.filter(f => f.id !== id) });
    if (idx >= 0) setRawFiles(prev => prev.filter((_, i) => i !== idx));
  };

  const handleContinue = () => {
    onFilesReady(rawFiles);
    onProcess();
  };

  const purposes = [
    { id: "externa", label: "Auditoria Externa" },
    { id: "interna", label: "Auditoria Interna" },
    { id: "fiscalizacao", label: "Fiscalização / Órgãos de Controle" },
    { id: "defesa", label: "Defesa Técnica" },
    { id: "revisao", label: "Revisão Independente" },
  ];

  const hasFiles = state.config.files.length > 0;

  return (
    <div className="space-y-6">
      <StepTimeline currentStep={hasFiles ? 2 : 1} />

      <div className="text-center space-y-2 mb-2">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[hsl(258,90%,66%)]/10 border border-[hsl(258,90%,66%)]/20 mb-2">
          <Shield className="w-4 h-4 text-[hsl(258,90%,66%)]" />
          <span className="text-xs font-semibold text-[hsl(258,90%,66%)]">Agente IA Auditor Contábil Sênior</span>
        </div>
        <h1 className="text-2xl font-bold text-foreground font-serif">
          {hasFiles ? "Carregamento" : "Configuração"}
        </h1>
        <p className="text-muted-foreground text-sm max-w-lg mx-auto">
          {hasFiles
            ? "Documento carregado com sucesso. Configure os parâmetros de análise."
            : "Faça upload do balancete e configure os parâmetros de análise."}
        </p>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-foreground">Documento para Análise</h3>

          {hasFiles ? (
            <div className="space-y-3">
              {state.config.files.map(f => (
                <div key={f.id} className="relative border-2 border-dashed border-emerald-400/50 rounded-2xl p-8 text-center bg-emerald-50/30">
                  <div className="w-14 h-14 mx-auto rounded-xl bg-emerald-500/10 flex items-center justify-center mb-3">
                    <FileSpreadsheet className="w-8 h-8 text-emerald-600" />
                  </div>
                  <p className="text-sm font-semibold text-foreground">{f.fileName}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{(f.fileSize / 1024).toFixed(2)} MB</p>
                  <div className="flex items-center justify-center gap-1.5 mt-3">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                    <span className="text-xs font-medium text-emerald-600">Documento carregado</span>
                  </div>
                  <button onClick={() => removeFile(f.id)} className="absolute top-3 right-3 w-6 h-6 rounded-full bg-muted/80 flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors text-xs">✕</button>
                </div>
              ))}
              <button onClick={() => document.getElementById("file-input")?.click()} className="w-full py-2 text-xs text-muted-foreground hover:text-foreground border border-dashed border-border rounded-xl hover:bg-muted/30 transition-colors">+ Adicionar outro documento</button>
            </div>
          ) : (
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }}
              onClick={() => document.getElementById("file-input")?.click()}
              className={`border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer transition-all ${
                dragOver ? "border-[hsl(258,90%,66%)] bg-[hsl(258,90%,66%)]/5 scale-[1.01]" : "border-border hover:border-[hsl(258,90%,66%)]/40 hover:bg-muted/30"
              }`}
            >
              <div className="w-14 h-14 mx-auto rounded-xl bg-muted/50 flex items-center justify-center mb-3">
                <FileSpreadsheet className="w-8 h-8 text-muted-foreground" />
              </div>
              <p className="text-sm font-medium text-foreground">Arraste o balancete ou clique para selecionar</p>
              <p className="text-xs text-muted-foreground mt-1">Formatos aceitos: .xlsx, .xls, .csv</p>
            </div>
          )}
          <input id="file-input" type="file" hidden multiple accept=".xlsx,.xls,.csv" onChange={(e) => handleFiles(e.target.files)} />
        </div>

        <div className="space-y-6">
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-foreground">Nível de Profundidade Técnica</h3>
            <div className="space-y-2">
              {[
                { id: "executivo", title: "Executivo", desc: "Visão sintética focada em riscos relevantes e impactos financeiros" },
                { id: "tecnico", title: "Técnico Detalhado", desc: "Análise aprofundada com identificação de inconsistências" },
                { id: "parecer", title: "Parecer Formal", desc: "Estrutura completa com linguagem normativa NBC TA" },
              ].map(opt => (
                <button key={opt.id} onClick={() => setDepth(opt.id as any)}
                  className={`w-full text-left p-4 rounded-xl border-2 transition-all ${
                    depth === opt.id ? "border-[hsl(258,90%,66%)] bg-[hsl(258,90%,66%)]/5" : "border-border hover:border-[hsl(258,90%,66%)]/30 hover:bg-muted/20"
                  }`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-foreground">{opt.title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{opt.desc}</p>
                    </div>
                    {depth === opt.id && (
                      <div className="w-5 h-5 rounded-full border-2 border-[hsl(258,90%,66%)] flex items-center justify-center shrink-0">
                        <div className="w-2.5 h-2.5 rounded-full bg-[hsl(258,90%,66%)]" />
                      </div>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-foreground">Finalidade do Trabalho</h3>
            <div className="flex flex-wrap gap-2">
              {purposes.map(p => (
                <button key={p.id} onClick={() => setPurpose(p.id)}
                  className={`px-4 py-2.5 rounded-full text-xs font-medium border transition-all ${
                    purpose === p.id ? "bg-[hsl(258,90%,66%)] text-white border-[hsl(258,90%,66%)]" : "bg-white border-border text-foreground hover:border-[hsl(258,90%,66%)]/40"
                  }`}>{p.label}</button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="flex justify-center pt-2">
        <Button onClick={handleContinue} disabled={!hasFiles}
          className="bg-[hsl(258,90%,66%)] hover:bg-[hsl(258,90%,56%)] text-white gap-2 h-12 px-10 text-sm font-semibold rounded-xl shadow-lg shadow-[hsl(258,90%,66%)]/20">
          Continuar <ArrowRight className="w-5 h-5" />
        </Button>
      </div>
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
  { label: "Gerando documento Avaliação Empresarial...", duration: 1500 },
];

const ProcessingPhase = ({ onComplete, files, onAnalysisReady }: { 
  onComplete: () => void; 
  files: File[];
  onAnalysisReady: (analysis: any, parsedData: ParsedFinancialData | null) => void;
}) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    const runRealAnalysis = async () => {
      try {
        // Step 1: Parse files
        setCurrentStep(0);
        setProgress(5);
        
        let parsedData: ParsedFinancialData | null = null;
        if (files.length > 0) {
          setCurrentStep(1);
          setProgress(15);
          parsedData = await parseSpreadsheet(files[0]);
          
          // If additional files, merge data
          for (let i = 1; i < files.length; i++) {
            const additional = await parseSpreadsheet(files[i]);
            parsedData.balanco.push(...additional.balanco);
            parsedData.dre.push(...additional.dre);
            additional.years.forEach(y => {
              if (!parsedData!.years.includes(y)) parsedData!.years.push(y);
            });
          }
          parsedData.years.sort();
        }

        // Steps 2-5: Visual progress while waiting
        setCurrentStep(2);
        setProgress(25);
        
        // Step 6: Call AI
        setCurrentStep(3);
        setProgress(35);
        
        const dataToAnalyze = parsedData || {
          balanco: [],
          dre: [],
          years: [],
        };
        
        setCurrentStep(4);
        setProgress(50);

        const analysis = await analyzeFinancialData(dataToAnalyze, {
          depth: "tecnico",
          purpose: "externa",
        });

        setCurrentStep(5);
        setProgress(70);

        // Step 7-8: Final processing
        setCurrentStep(6);
        setProgress(85);
        
        setCurrentStep(7);
        setProgress(95);
        
        setCurrentStep(8);
        setProgress(100);

        onAnalysisReady(analysis, parsedData);
        setTimeout(onComplete, 500);
      } catch (err) {
        console.error("Processing error:", err);
        setError(err instanceof Error ? err.message : "Erro ao processar análise");
        toast({
          title: "Erro no processamento",
          description: err instanceof Error ? err.message : "Erro desconhecido",
          variant: "destructive",
        });
      }
    };

    runRealAnalysis();
  }, [files, onComplete, onAnalysisReady]);

  if (error) {
    return (
      <div className="space-y-8">
        <StepTimeline currentStep={3} />
        <div className="max-w-lg mx-auto space-y-6 py-8 text-center">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-red-500/10 flex items-center justify-center">
            <AlertTriangle className="w-8 h-8 text-red-500" />
          </div>
          <h2 className="text-xl font-bold text-foreground font-serif">Erro no Processamento</h2>
          <p className="text-sm text-muted-foreground">{error}</p>
          <Button onClick={() => window.location.reload()} variant="outline">
            Tentar Novamente
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <StepTimeline currentStep={3} />
      <div className="max-w-lg mx-auto space-y-8 py-8">
        <div className="text-center space-y-3">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-[hsl(258,90%,66%)]/10 flex items-center justify-center">
            <Loader2 className="w-8 h-8 text-[hsl(258,90%,66%)] animate-spin" />
          </div>
          <h2 className="text-xl font-bold text-foreground font-serif">Processando Análise</h2>
          <p className="text-sm text-muted-foreground">
            O Agente IA Auditor Contábil Sênior está analisando seus documentos em tempo real...
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
              i === currentStep ? "bg-[hsl(258,90%,66%)]/5 border border-[hsl(258,90%,66%)]/20" :
              "opacity-40"
            }`}>
              {i < currentStep ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
              ) : i === currentStep ? (
                <Loader2 className="w-4 h-4 text-[hsl(258,90%,66%)] animate-spin shrink-0" />
              ) : (
                <div className="w-4 h-4 rounded-full border border-border shrink-0" />
              )}
              <span className="text-xs text-foreground">{step.label}</span>
            </div>
          ))}
        </div>
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

const pendencias = [
  { id: "p1", tipo: "Inconsistência", gravidade: "critico", conta: "3.01", problema: "Receita cresce 40% sem aumento proporcional de caixa operacional", fundamentacao: "CPC 47 / IFRS 15 — Os cinco passos de reconhecimento de receita exigem transferência efetiva de controle. A divergência entre receita e caixa operacional pode indicar reconhecimento antecipado.", risco: "Distorção material nas demonstrações", impacto: "Superavaliação do resultado em até R$ 32 milhões", recomendacao: "Revisar a política de reconhecimento de receita e reconciliar com fluxo de caixa operacional" },
  { id: "p2", tipo: "Impropriedade", gravidade: "critico", conta: "2.01.02", problema: "Fornecedores com variação AH de 583% em 2022 — possível reclassificação", fundamentacao: "CPC 26 / IAS 1 — Classificação inadequada de passivos pode distorcer indicadores de liquidez e endividamento. NBC TA 315 — Risco significativo de distorção material.", risco: "Manipulação de indicadores financeiros", impacto: "Distorção de Liquidez Corrente e Endividamento de Curto Prazo", recomendacao: "Investigar composição de fornecedores em 2022 e verificar se houve reclassificação indevida" },
  { id: "p3", tipo: "Fragilidade", gravidade: "alto", conta: "1.02.03", problema: "Imobilizado cresceu 51% sem evidência de teste de impairment", fundamentacao: "CPC 01 / IAS 36 — Teste de recuperabilidade é obrigatório quando há indicativo de perda. NBC TA 500 — Evidência de auditoria insuficiente.", risco: "Ativos superavaliados no balanço", impacto: "Potencial ajuste de R$ 115 milhões no imobilizado", recomendacao: "Implementar teste anual de recuperabilidade conforme CPC 01" },
  { id: "p4", tipo: "Omissão", gravidade: "alto", conta: "2.02.01", problema: "Empréstimos LP cresceram 57% — risco de covenant e refinanciamento", fundamentacao: "CPC 25 / IAS 37 — Provisões devem ser reconhecidas quando há obrigação presente. Lei 11.101/2005 — Risco de pedido de recuperação judicial por credores.", risco: "Risco de vencimento antecipado e inadimplência", impacto: "Exposição bancária de R$ 136 milhões em longo prazo", recomendacao: "Avaliar covenants ativos e capacidade de refinanciamento" },
  { id: "p5", tipo: "Observação", gravidade: "medio", conta: "1.01.04", problema: "Estoques cresceram 45% acima do CMV — possível obsolescência", fundamentacao: "CPC 16 / IAS 2 — Estoques devem ser avaliados pelo menor entre custo e valor realizável líquido.", risco: "Superavaliação de ativos circulantes", impacto: "Estoque excedente estimado em R$ 8,7 milhões", recomendacao: "Realizar inventário físico e teste de valor realizável líquido" },
  { id: "p6", tipo: "Observação", gravidade: "baixo", conta: "1.01.06", problema: "Tributos a recuperar cresceram 83% — verificar recuperabilidade", fundamentacao: "CPC 32 / IAS 12 — Créditos tributários devem ter expectativa provável de realização.", risco: "Créditos tributários não recuperáveis", impacto: "R$ 12,8 milhões em tributos a recuperar", recomendacao: "Avaliar expectativa de realização e documentar bases" },
];

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
const TabDiagnostico = ({ data }: { data?: any }) => {
  const d = data || diagnosticoData;
  const r = riskBadge[d.riskLevel] || riskBadge["moderado"];
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2"><Activity className="w-4 h-4 text-accent" /> Diagnóstico Financeiro</CardTitle>
            <Badge className={`${r.bg} border text-xs`}>{r.label}</Badge>
          </div>
          <CardDescription>Resumo executivo automatizado — Avaliação Empresarial</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="p-4 rounded-lg bg-muted/30 border border-border/50">
            <p className="text-sm text-foreground leading-relaxed">{d.resumo}</p>
          </div>
          <div>
            <h4 className="text-sm font-semibold text-foreground mb-3">Pontos-Chave</h4>
            <div className="space-y-2">
              {(d.pontosChave || []).map((p: any) => (
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

/* ── Tab 2: Análise Técnica (Pendências + Chat IA) ── */
const TabAnaliseTecnica = ({ pendenciasData, parsedData }: { pendenciasData?: any[]; parsedData?: ParsedFinancialData | null }) => {
  const activePendencias = pendenciasData || pendencias;
  const [selectedId, setSelectedId] = useState(activePendencias[0]?.id || "");
  const selected = activePendencias.find((p: any) => p.id === selectedId);
  const [chatMessages, setChatMessages] = useState<Array<{ role: "user" | "assistant"; text: string }>>([
    { role: "assistant", text: "Sou o Agente IA Auditor Contábil Sênior. Selecione uma pendência ao lado e me pergunte — respondo sobre fundamentação técnica, riscos, ajustes contábeis ou impacto jurídico." },
  ]);
  const [chatInput, setChatInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);

  const sendChat = async () => {
    if (!chatInput.trim() || isStreaming) return;
    const q = chatInput.trim();
    setChatInput("");
    setChatMessages(m => [...m, { role: "user", text: q }]);
    setIsStreaming(true);

    let assistantText = "";
    const upsertAssistant = (chunk: string) => {
      assistantText += chunk;
      setChatMessages(prev => {
        const last = prev[prev.length - 1];
        if (last?.role === "assistant" && prev.length > 1 && prev[prev.length - 2]?.role === "user") {
          return prev.map((m, i) => (i === prev.length - 1 ? { ...m, text: assistantText } : m));
        }
        return [...prev, { role: "assistant" as const, text: assistantText }];
      });
    };

    try {
      const aiMessages = chatMessages
        .filter((_, i) => i > 0) // skip initial system msg
        .map(m => ({ role: m.role as "user" | "assistant", content: m.text }));
      aiMessages.push({ role: "user", content: q });

      const context = {
        pendenciaSelecionada: selected,
        dadosFinanceiros: parsedData ? { balanco: parsedData.balanco.slice(0, 20), dre: parsedData.dre.slice(0, 10) } : null,
      };

      await streamAuditChat({
        messages: aiMessages,
        context,
        onDelta: upsertAssistant,
        onDone: () => setIsStreaming(false),
        onError: (error) => {
          setChatMessages(m => [...m, { role: "assistant", text: `⚠️ Erro: ${error}` }]);
          setIsStreaming(false);
        },
      });
    } catch (e) {
      console.error(e);
      setChatMessages(m => [...m, { role: "assistant", text: "⚠️ Erro ao conectar com o Agente IA. Tente novamente." }]);
      setIsStreaming(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid lg:grid-cols-3 gap-4" style={{ minHeight: 420 }}>
        <Card className="lg:col-span-1">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-orange-500" /> Pendências ({activePendencias.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[360px]">
              <div className="space-y-2 pr-2">
                {activePendencias.map((p: any) => (
                  <button
                    key={p.id}
                    onClick={() => setSelectedId(p.id)}
                    className={`w-full text-left p-3 rounded-lg border transition-all ${
                      selectedId === p.id ? "border-[hsl(258,90%,66%)] bg-[hsl(258,90%,66%)]/5" : "border-border/50 hover:bg-muted/50"
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

      {/* Chat IA integrado */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              <MessageCircle className="w-4 h-4 text-[hsl(258,90%,66%)]" /> Chat com Auditor IA Sênior
            </CardTitle>
            {selected && (
              <Badge variant="secondary" className="text-[10px]">Contexto: Conta {selected.conta}</Badge>
            )}
          </div>
          <CardDescription className="text-xs">Tire dúvidas sobre pendências, fundamentação técnica, riscos e ajustes contábeis.</CardDescription>
        </CardHeader>
        <CardContent>
          <ScrollArea className="mb-3" style={{ maxHeight: 250 }}>
            <div className="space-y-3 pr-2">
              {chatMessages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[85%] p-3 rounded-xl text-sm leading-relaxed whitespace-pre-wrap ${
                    msg.role === "user"
                      ? "bg-[hsl(258,90%,66%)] text-white rounded-br-sm"
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
              {["Por que classificou como crítico?", "Isso pode levar a RJ?", "Qual ajuste contábil?", "Gera ressalva no parecer?"].map(q => (
                <button key={q} onClick={() => setChatInput(q)}
                  className="text-[10px] px-2 py-1 rounded-full bg-muted/50 border border-border/50 text-muted-foreground hover:bg-muted transition-colors">
                  {q}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <Input value={chatInput} onChange={(e) => setChatInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && sendChat()} placeholder="Pergunte sobre esta pendência..." className="text-sm" disabled={isStreaming} />
              <Button onClick={sendChat} disabled={isStreaming} className="bg-[hsl(258,90%,66%)] hover:bg-[hsl(258,90%,56%)] text-white px-4">
                {isStreaming ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

    </div>
  );
};

/* ══════════════════════════════════════════════════════
   TAB: RELATÓRIO FINAL — PREVIEW (antes de gerar)
   ══════════════════════════════════════════════════════ */
const reportTopics = [
  { num: "1", title: "Capa", desc: "Logo BEX, título, empresa, CNPJ, data-base, responsável técnico e classificação de risco", icon: Shield },
  { num: "2", title: "Diagnóstico Executivo", desc: "Situação geral, classificação de risco, pontos-chave e conclusão técnica com fundamentação CPC/IFRS/NBC TA", icon: Activity },
  { num: "3", title: "Solvência", desc: "Liquidez Corrente, Seca, Geral, Solvência Total, Capital de Giro, Cobertura de Juros — com interpretação técnica", icon: Scale },
  { num: "4", title: "Análise Técnica — Pendências", desc: "Tabela consolidada com tipo, gravidade, impacto, fundamentação normativa e recomendações corretivas", icon: AlertTriangle },
  { num: "5", title: "Indicadores Econômico-Financeiros", desc: "Liquidez, Endividamento, Rentabilidade e EBITDA estimado com fórmulas e interpretação", icon: BarChart3 },
  { num: "6", title: "Endividamento", desc: "Estrutura da dívida, concentração de risco, dependência bancária e análise estratégica", icon: Landmark },
  { num: "7", title: "Balanço Patrimonial", desc: "Ativo, Passivo, PL com análise horizontal e validações de consistência", icon: Layers },
  { num: "★", title: "Score BEX de Solvência", desc: "Classificação final ponderada: Liquidez (25%), Endividamento (25%), PL (20%), Geração Caixa (15%), Pressão CP (15%)", icon: Target },
];

const TabRelatorioPreview = ({ onGerar }: { onGerar: () => void }) => (
  <div className="space-y-6">
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[hsl(258,90%,66%)]/10 flex items-center justify-center">
              <BookOpen className="w-5 h-5 text-[hsl(258,90%,66%)]" />
            </div>
            <div>
              <CardTitle className="text-base">Relatório Técnico de Avaliação Contábil e Solvência Empresarial</CardTitle>
              <CardDescription className="text-xs">Documento estruturado gerado automaticamente pelo Agente IA Auditor Contábil Sênior</CardDescription>
            </div>
          </div>
          <Button
            onClick={onGerar}
            size="lg"
            className="bg-[hsl(258,90%,66%)] hover:bg-[hsl(258,90%,56%)] text-white gap-2 h-12 px-8 text-sm font-semibold rounded-xl shadow-lg shadow-[hsl(258,90%,66%)]/30 shrink-0"
          >
            <FileText className="w-4 h-4" /> Gerar Relatório BEX
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground leading-relaxed">
          O relatório final consolida todas as análises realizadas em um documento técnico estruturado, com linguagem normativa e fundamentação contábil completa. Ao gerar, os seguintes tópicos serão incluídos:
        </p>

        <div className="grid gap-3">
          {reportTopics.map(t => {
            const Icon = t.icon;
            return (
              <div key={t.num} className="flex items-start gap-4 p-4 rounded-xl border border-border/50 bg-muted/20 hover:bg-muted/40 transition-colors">
                <div className="w-8 h-8 rounded-lg bg-[hsl(258,90%,66%)]/10 flex items-center justify-center shrink-0 mt-0.5">
                  <span className="text-xs font-bold text-[hsl(258,90%,66%)]">{t.num}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <Icon className="w-3.5 h-3.5 text-[hsl(258,90%,66%)]" />
                    <h4 className="text-sm font-semibold text-foreground">{t.title}</h4>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">{t.desc}</p>
                </div>
                <CheckCircle2 className="w-4 h-4 text-emerald-500/50 shrink-0 mt-1" />
              </div>
            );
          })}
        </div>

        <div className="flex flex-wrap gap-1.5 pt-2">
          {["NBC TA 700", "NBC TA 705", "CPC 26", "CPC 47", "IFRS 15", "Lei 11.101/2005"].map(n => (
            <Badge key={n} variant="secondary" className="text-[10px]">{n}</Badge>
          ))}
        </div>
      </CardContent>
    </Card>

  </div>
);

/* ══════════════════════════════════════════════════════
   TAB: RELATÓRIO FINAL BEX
   ══════════════════════════════════════════════════════ */
const TabRelatorioFinal = ({ onBack }: { onBack: () => void }) => {
  const { state } = useAudit();
  const navigate = useNavigate();
  const today = new Date().toLocaleDateString("pt-BR");
  const d = state.config.entityData["2023"];
  const ind = state.financialAnalysis.indicators;

  const scoreColor = scoreRJData.score <= 30 ? "text-emerald-600" :
                     scoreRJData.score <= 60 ? "text-yellow-600" :
                     scoreRJData.score <= 80 ? "text-orange-600" : "text-red-600";
  const scoreBg = scoreRJData.score <= 30 ? "bg-emerald-500/10 border-emerald-500/30" :
                  scoreRJData.score <= 60 ? "bg-yellow-500/10 border-yellow-500/30" :
                  scoreRJData.score <= 80 ? "bg-orange-500/10 border-orange-500/30" : "bg-red-500/10 border-red-500/30";
  const scoreLabel = scoreRJData.score <= 30 ? "Saudável" :
                     scoreRJData.score <= 60 ? "Atenção" :
                     scoreRJData.score <= 80 ? "Alto Risco" : "Risco Estrutural";

  const riskIcon = scoreRJData.score <= 30 ? "🟢" :
                   scoreRJData.score <= 60 ? "🟡" :
                   scoreRJData.score <= 80 ? "🔴" : "⚫";

  const empCP = 18966329;
  const empLP = 136588365;
  const dividaOnerosa = empCP + empLP;
  const ptotal = d ? d.passivoCirculante + d.passivoNaoCirculante : 0;

  const solvencyIndicators = d && ind["2023"] ? [
    { name: "Liquidez Corrente", result: fmtPct(ind["2023"].liquidezCorrente), param: "> 1,5", classification: ind["2023"].liquidezCorrente > 1.5 ? "Adequada" : ind["2023"].liquidezCorrente > 1 ? "Atenção" : "Insuficiente", comment: `AC R$ ${fmt(d.ativoCirculante)} / PC R$ ${fmt(d.passivoCirculante)}` },
    { name: "Liquidez Seca", result: fmtPct(ind["2023"].liquidezSeca), param: "> 1,0", classification: ind["2023"].liquidezSeca > 1 ? "Adequada" : "Atenção", comment: `(AC - Estoques) / PC` },
    { name: "Liquidez Geral", result: fmtPct(ind["2023"].liquidezGeral), param: "> 1,0", classification: ind["2023"].liquidezGeral > 1 ? "Adequada" : "Insuficiente", comment: `(AC + RLP) / (PC + PNC)` },
    { name: "Cobertura de Juros", result: `${ind["2023"].coberturaJuros.toFixed(1)}x`, param: "> 3,0x", classification: ind["2023"].coberturaJuros > 3 ? "Adequada" : "Atenção", comment: `LAJIR / Despesas Financeiras` },
    { name: "Capital de Giro Líquido", result: `R$ ${fmt(d.ativoCirculante - d.passivoCirculante)}`, param: "> 0", classification: d.ativoCirculante - d.passivoCirculante > 0 ? "Positivo" : "Negativo", comment: `AC - PC` },
    { name: "Solvência Total", result: fmtPct((d.ativoCirculante + d.ativoNaoCirculante) / ptotal), param: "> 1,0", classification: (d.ativoCirculante + d.ativoNaoCirculante) / ptotal > 1 ? "Solvente" : "Insolvente", comment: `AT / PT` },
  ] : [];

  const SectionTitle = ({ num, title }: { num: string; title: string }) => (
    <div className="flex items-center gap-3 py-3 border-b-2 border-[hsl(258,90%,66%)]/30 mb-4">
      <div className="w-8 h-8 rounded-lg bg-[hsl(258,90%,66%)] text-white flex items-center justify-center text-sm font-bold">{num}</div>
      <h2 className="text-lg font-bold text-foreground font-serif">{title}</h2>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Action buttons */}
      <div className="flex justify-end gap-2 print:hidden">
        <Button variant="outline" size="sm" className="gap-1.5" onClick={() => window.print()}>
          <Download className="w-4 h-4" /> Exportar
        </Button>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={() => window.print()}>
          <Printer className="w-4 h-4" /> Imprimir
        </Button>
        <Button variant="outline" size="sm" onClick={onBack} className="gap-1.5">
          <ArrowLeft className="w-4 h-4" /> Nova Análise
        </Button>
      </div>

      {/* ── CAPA ── */}
      <Card className="overflow-hidden">
        <div className="bg-gradient-to-br from-[hsl(258,90%,66%)] via-[hsl(258,80%,55%)] to-[hsl(258,70%,40%)] text-white p-8 md:p-12 text-center space-y-6">
          <div className="flex justify-center">
            <div className="w-16 h-16 rounded-2xl bg-white/20 backdrop-blur flex items-center justify-center">
              <Shield className="w-10 h-10 text-white" />
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-[0.3em] text-white/70 font-semibold">Plataforma BEX</p>
            <h1 className="text-xl md:text-2xl font-bold font-serif leading-tight">
              RELATÓRIO TÉCNICO DE AVALIAÇÃO<br />CONTÁBIL E SOLVÊNCIA EMPRESARIAL
            </h1>
          </div>
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-white/30 bg-white/10">
            <span className={`text-lg`}>{riskIcon}</span>
            <span className="text-sm font-semibold">{scoreLabel} — Score BEX: {scoreRJData.score}/100</span>
          </div>
          <div className="space-y-1 text-sm text-white/80">
            <p className="font-semibold text-white">Empresa Analisada: Empresa Demonstração S.A.</p>
            <p>CNPJ: 12.345.678/0001-90</p>
            <p>Data-base do Balancete: 31/12/2023</p>
            <p>Data de Emissão: {today}</p>
          </div>
          <div className="pt-4 border-t border-white/20 space-y-1">
            <p className="text-xs text-white/60 uppercase tracking-wider">Responsável Técnico</p>
            <p className="text-sm font-semibold">Agente IA — Auditor Contábil Sênior</p>
            <p className="text-xs text-white/70">Especialista em Recuperação Judicial e Análise Empresarial</p>
          </div>
        </div>
      </Card>

      {/* ── 1. DIAGNÓSTICO EXECUTIVO ── */}
      <Card>
        <CardContent className="pt-6 space-y-4">
          <SectionTitle num="1" title="DIAGNÓSTICO EXECUTIVO" />
          
          <div>
            <h3 className="text-sm font-semibold text-foreground mb-2">1.1 Situação Geral</h3>
            <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border ${scoreBg}`}>
              <span>{riskIcon}</span>
              <span className={`text-sm font-semibold ${scoreColor}`}>Classificação de Risco: {scoreLabel}</span>
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-foreground mb-2">1.2 Principais Pontos Identificados</h3>
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

          <div>
            <h3 className="text-sm font-semibold text-foreground mb-2">1.3 Conclusão Técnica do Auditor IA</h3>
            <div className="p-4 rounded-lg bg-muted/30 border border-border/50">
              <p className="text-sm text-foreground leading-relaxed">{diagnosticoData.resumo}</p>
              <div className="flex flex-wrap gap-1.5 mt-3">
                {["CPC 26", "CPC 47", "IFRS 15", "NBC TA 570", "Lei 11.101/2005"].map(n => (
                  <Badge key={n} variant="secondary" className="text-[10px]">{n}</Badge>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── 2. SOLVÊNCIA ── */}
      <Card>
        <CardContent className="pt-6 space-y-4">
          <SectionTitle num="2" title="SOLVÊNCIA" />

          <div>
            <h3 className="text-sm font-semibold text-foreground mb-3">2.1 Índices de Solvência</h3>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-[10px]">Indicador</TableHead>
                    <TableHead className="text-right text-[10px]">Resultado</TableHead>
                    <TableHead className="text-right text-[10px]">Parâmetro</TableHead>
                    <TableHead className="text-[10px]">Classificação</TableHead>
                    <TableHead className="text-[10px]">Comentário Técnico</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {solvencyIndicators.map(si => (
                    <TableRow key={si.name}>
                      <TableCell className="text-xs font-medium">{si.name}</TableCell>
                      <TableCell className="text-right text-xs font-mono">{si.result}</TableCell>
                      <TableCell className="text-right text-xs font-mono text-muted-foreground">{si.param}</TableCell>
                      <TableCell>
                        <Badge className={`text-[10px] ${
                          si.classification === "Adequada" || si.classification === "Positivo" || si.classification === "Solvente"
                            ? "bg-emerald-500/15 text-emerald-600"
                            : si.classification === "Atenção"
                            ? "bg-yellow-500/15 text-yellow-600"
                            : "bg-red-500/15 text-red-600"
                        }`}>{si.classification}</Badge>
                      </TableCell>
                      <TableCell className="text-[10px] text-muted-foreground">{si.comment}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-foreground mb-2">2.2 Interpretação Técnica</h3>
            <div className="space-y-3">
              {[
                { title: "Capacidade de Pagamento", text: "A empresa apresenta liquidez corrente de " + (ind["2023"] ? fmtPct(ind["2023"].liquidezCorrente) : "N/A") + ", indicando capacidade de honrar obrigações de curto prazo, porém com tendência de redução no período analisado." },
                { title: "Avaliação de Risco de Insolvência", text: "O Score BEX-RJ de " + scoreRJData.score + " pontos classifica a empresa na faixa de \"" + scoreLabel + "\". A análise multifatorial considera endividamento, liquidez, patrimônio líquido, geração de caixa e concentração de dívida." },
                { title: "Continuidade Operacional (Going Concern)", text: "Com PL positivo de R$ " + fmt(d?.patrimonioLiquido || 0) + " e capital de giro líquido positivo, a premissa de continuidade é sustentável no curto prazo, porém requer monitoramento do endividamento oneroso crescente." },
                { title: "Probabilidade Estrutural de RJ", text: scoreRJData.score <= 30 ? "Baixa probabilidade. Indicadores dentro dos parâmetros aceitáveis." : scoreRJData.score <= 60 ? "Moderada. Deterioração dos indicadores exige atenção e medidas preventivas conforme Lei 11.101/2005." : "Elevada. Recomenda-se plano de reestruturação financeira imediato." },
              ].map(item => (
                <div key={item.title} className="p-3 rounded-lg bg-muted/20 border border-border/30">
                  <p className="text-xs font-semibold text-foreground mb-1">{item.title}</p>
                  <p className="text-xs text-muted-foreground leading-relaxed">{item.text}</p>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── 3. ANÁLISE TÉCNICA — PENDÊNCIAS ── */}
      <Card>
        <CardContent className="pt-6 space-y-4">
          <SectionTitle num="3" title="ANÁLISE TÉCNICA — PENDÊNCIAS" />

          <div>
            <h3 className="text-sm font-semibold text-foreground mb-3">3.1 Tabela de Pendências</h3>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-[10px]">ID</TableHead>
                    <TableHead className="text-[10px]">Tipo</TableHead>
                    <TableHead className="text-[10px]">Conta</TableHead>
                    <TableHead className="text-[10px]">Descrição</TableHead>
                    <TableHead className="text-[10px]">Gravidade</TableHead>
                    <TableHead className="text-[10px]">Impacto</TableHead>
                    <TableHead className="text-[10px]">Recomendação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pendencias.map((p, i) => (
                    <TableRow key={p.id}>
                      <TableCell className="text-[10px] font-mono">{i + 1}</TableCell>
                      <TableCell className="text-[10px]">{p.tipo}</TableCell>
                      <TableCell className="text-[10px] font-mono">{p.conta}</TableCell>
                      <TableCell className="text-xs max-w-[200px]">{p.problema}</TableCell>
                      <TableCell><Badge className={`${severityColors[p.gravidade]?.bg} text-[10px]`}>{severityColors[p.gravidade]?.label}</Badge></TableCell>
                      <TableCell className="text-[10px]">{p.impacto}</TableCell>
                      <TableCell className="text-[10px] max-w-[180px]">{p.recomendacao}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-foreground mb-3">3.2 Comentário Técnico Detalhado</h3>
            <div className="space-y-3">
              {pendencias.map((p, i) => (
                <div key={p.id} className="p-4 rounded-lg border border-border/50 space-y-2">
                  <div className="flex items-center gap-2">
                    <Badge className={`${severityColors[p.gravidade]?.bg} text-[10px]`}>{severityColors[p.gravidade]?.label}</Badge>
                    <span className="text-xs font-semibold text-foreground">Pendência {i + 1}: {p.problema}</span>
                  </div>
                  <div className="grid sm:grid-cols-2 gap-2">
                    <div className="p-2 rounded bg-muted/30">
                      <p className="text-[10px] font-semibold text-foreground mb-0.5">Fundamentação Normativa</p>
                      <p className="text-[10px] text-muted-foreground">{p.fundamentacao}</p>
                    </div>
                    <div className="p-2 rounded bg-red-500/5">
                      <p className="text-[10px] font-semibold text-red-600 mb-0.5">Risco Econômico / Jurídico</p>
                      <p className="text-[10px] text-foreground">{p.risco}</p>
                    </div>
                  </div>
                  <div className="p-2 rounded bg-accent/5 border border-accent/20">
                    <p className="text-[10px] font-semibold text-accent-foreground mb-0.5">Recomendação Corretiva</p>
                    <p className="text-[10px] text-foreground">{p.recomendacao}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── 4. INDICADORES ECONÔMICO-FINANCEIROS ── */}
      <Card>
        <CardContent className="pt-6 space-y-4">
          <SectionTitle num="4" title="INDICADORES ECONÔMICO-FINANCEIROS" />

          {[
            { title: "4.1 Indicadores de Liquidez", items: [
              { name: "Liquidez Corrente", formula: "AC / PC", value: ind["2023"]?.liquidezCorrente, interp: "Capacidade de pagamento de obrigações de curto prazo" },
              { name: "Liquidez Seca", formula: "(AC - EST) / PC", value: ind["2023"]?.liquidezSeca, interp: "Liquidez excluindo estoques" },
              { name: "Liquidez Geral", formula: "(AC + RLP) / (PC + PNC)", value: ind["2023"]?.liquidezGeral, interp: "Capacidade de pagamento total" },
            ]},
            { title: "4.2 Indicadores de Endividamento", items: [
              { name: "Endividamento Total", formula: "PT / AT", value: ind["2023"]?.endividamentoGeral, interp: "Grau de comprometimento do ativo com terceiros" },
              { name: "Composição do Endividamento", formula: "PC / PT", value: ind["2023"]?.composicaoEndividamento, interp: "Concentração da dívida no curto prazo" },
              { name: "Imobilização do PL", formula: "Imob / PL", value: ind["2023"]?.imobilizacaoPL, interp: "Grau de imobilização do capital próprio" },
            ]},
            { title: "4.3 Indicadores de Rentabilidade", items: [
              { name: "Margem Operacional", formula: "LAJIR / Receita", value: ind["2023"]?.margemOperacional, interp: "Eficiência operacional da empresa" },
              { name: "ROA", formula: "LL / AT", value: ind["2023"]?.roa, interp: "Retorno gerado pelo ativo total" },
              { name: "ROE", formula: "LL / PL", value: ind["2023"]?.roe, interp: "Retorno ao acionista sobre capital investido" },
            ]},
          ].map(sec => (
            <div key={sec.title}>
              <h3 className="text-sm font-semibold text-foreground mb-3">{sec.title}</h3>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-[10px]">Indicador</TableHead>
                      <TableHead className="text-[10px]">Fórmula</TableHead>
                      <TableHead className="text-right text-[10px]">Resultado</TableHead>
                      <TableHead className="text-[10px]">Interpretação</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sec.items.map(item => (
                      <TableRow key={item.name}>
                        <TableCell className="text-xs font-medium">{item.name}</TableCell>
                        <TableCell className="text-[10px] font-mono text-muted-foreground">{item.formula}</TableCell>
                        <TableCell className="text-right text-xs font-mono font-bold">{item.value != null ? fmtPct(item.value) : "—"}</TableCell>
                        <TableCell className="text-[10px] text-muted-foreground">{item.interp}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          ))}

          {d && (
            <div>
              <h3 className="text-sm font-semibold text-foreground mb-2">EBITDA Estimado (2023)</h3>
              <div className="p-4 rounded-lg bg-muted/30 text-center">
                <p className="text-2xl font-bold font-mono text-foreground">R$ {fmt(d.resultadoOperacional + d.despesasFinanceiras)}</p>
                <p className="text-[10px] text-muted-foreground mt-1">LAJIR + Despesas Financeiras</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── 5. ENDIVIDAMENTO ── */}
      <Card>
        <CardContent className="pt-6 space-y-4">
          <SectionTitle num="5" title="ENDIVIDAMENTO" />

          <div>
            <h3 className="text-sm font-semibold text-foreground mb-3">5.1 Estrutura da Dívida</h3>
            <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-3">
              {[
                { label: "Empréstimos CP", value: empCP },
                { label: "Empréstimos LP", value: empLP },
                { label: "Dívida Bancária Total", value: dividaOnerosa },
                { label: "Fornecedores", value: d?.fornecedores || 0 },
                { label: "Passivo Circulante", value: d?.passivoCirculante || 0 },
                { label: "Passivo Não Circulante", value: d?.passivoNaoCirculante || 0 },
              ].map(item => (
                <div key={item.label} className="p-3 rounded-lg bg-muted/30 border border-border/30">
                  <p className="text-[10px] text-muted-foreground">{item.label}</p>
                  <p className="text-sm font-bold font-mono text-foreground">R$ {fmt(item.value)}</p>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-foreground mb-2">5.2 Concentração de Risco</h3>
            <div className="space-y-2">
              {[
                { label: "% Dívida Onerosa / Passivo Total", value: ptotal ? fmtPct(dividaOnerosa / ptotal) : "N/A", risk: dividaOnerosa / ptotal > 0.5 },
                { label: "Dependência Bancária", value: d ? fmtPct(dividaOnerosa / (d.ativoCirculante + d.ativoNaoCirculante)) : "N/A", risk: false },
                { label: "Pressão no Fluxo de Caixa (Emp CP / Caixa)", value: d ? `${(empCP / d.caixaEquivalentes).toFixed(1)}x` : "N/A", risk: d ? empCP / d.caixaEquivalentes > 1 : false },
              ].map(item => (
                <div key={item.label} className={`flex justify-between p-3 rounded-lg ${item.risk ? "bg-orange-500/5 border border-orange-500/20" : "bg-muted/20"}`}>
                  <span className="text-xs text-foreground">{item.label}</span>
                  <span className={`text-xs font-mono font-bold ${item.risk ? "text-orange-600" : "text-foreground"}`}>{item.value}</span>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-foreground mb-2">5.3 Análise Estratégica</h3>
            <div className="p-4 rounded-lg bg-muted/30 border border-border/50 space-y-2">
              <p className="text-xs text-foreground leading-relaxed">
                A estrutura de endividamento revela concentração em empréstimos de longo prazo (R$ {fmt(empLP)}), representando {ptotal ? fmtPct(empLP / ptotal) : "N/A"} do passivo total. 
                A dívida onerosa total de R$ {fmt(dividaOnerosa)} exige monitoramento contínuo da capacidade de refinanciamento e dos covenants ativos.
              </p>
              <div className="flex flex-wrap gap-1.5 pt-2">
                {["Risco de vencimento concentrado", "Capacidade de renegociação limitada", "Monitorar covenants", "Avaliar necessidade de RJ"].map(t => (
                  <Badge key={t} variant="outline" className="text-[10px]">{t}</Badge>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── 6. BALANÇO PATRIMONIAL ── */}
      <Card>
        <CardContent className="pt-6 space-y-4">
          <SectionTitle num="6" title="BALANÇO PATRIMONIAL" />

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-[10px]">Conta</TableHead>
                  <TableHead className="text-[10px]">Descrição</TableHead>
                  {["2021", "2022", "2023"].map(y => <TableHead key={y} className="text-right text-[10px]">{y}</TableHead>)}
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
                      {["2021", "2022", "2023"].map(y => (
                        <TableCell key={y} className="text-right text-xs font-mono">{fmt(row.values[y] || 0)}</TableCell>
                      ))}
                      <TableCell className={`text-right text-xs font-mono ${isAlert ? "text-orange-600 font-bold" : "text-muted-foreground"}`}>
                        {fmtPct(ah)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-foreground mb-2">Validações</h3>
            <div className="space-y-2">
              {[
                { check: "Ativo = Passivo + PL", status: true, detail: `R$ ${fmt(state.balancoRows.find(r => r.conta === "1")?.values["2023"] || 0)} = R$ ${fmt(state.balancoRows.find(r => r.conta === "2")?.values["2023"] || 0)}` },
                { check: "Passivo a Descoberto", status: (d?.patrimonioLiquido || 0) > 0, detail: d && d.patrimonioLiquido > 0 ? "Não identificado — PL positivo" : "IDENTIFICADO — PL negativo" },
                { check: "PL Negativo", status: (d?.patrimonioLiquido || 0) > 0, detail: d && d.patrimonioLiquido > 0 ? `PL positivo: R$ ${fmt(d.patrimonioLiquido)}` : "PL NEGATIVO identificado" },
                { check: "Descasamento Estrutural", status: (d?.ativoCirculante || 0) > (d?.passivoCirculante || 0), detail: "Capital de giro líquido " + ((d?.ativoCirculante || 0) > (d?.passivoCirculante || 0) ? "positivo" : "negativo") },
              ].map(v => (
                <div key={v.check} className={`flex items-center justify-between p-3 rounded-lg ${v.status ? "bg-emerald-500/5 border border-emerald-500/20" : "bg-red-500/5 border border-red-500/20"}`}>
                  <div className="flex items-center gap-2">
                    {v.status ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> : <AlertTriangle className="w-4 h-4 text-red-500" />}
                    <span className="text-xs font-medium text-foreground">{v.check}</span>
                  </div>
                  <span className="text-[10px] text-muted-foreground">{v.detail}</span>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── SCORE FINAL ── */}
      <Card>
        <CardContent className="pt-6 space-y-4">
          <SectionTitle num="★" title="CLASSIFICAÇÃO FINAL — SCORE BEX DE SOLVÊNCIA" />
          
          <div className="text-center py-6">
            <p className={`text-6xl font-bold ${scoreColor}`}>{scoreRJData.score}</p>
            <p className={`text-xl font-semibold mt-2 ${scoreColor}`}>{scoreLabel}</p>
            <p className="text-xs text-muted-foreground mt-1">Score BEX de Solvência — de 100 pontos</p>
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            {scoreRJData.componentes.map(c => (
              <div key={c.nome} className="p-3 rounded-lg bg-muted/20 space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="font-medium text-foreground">{c.nome} ({(c.peso * 100)}%)</span>
                  <span className="font-mono font-bold">{c.valor}/100</span>
                </div>
                <Progress value={c.valor} className="h-1.5" />
                <p className="text-[10px] text-muted-foreground">{c.nota}</p>
              </div>
            ))}
          </div>

          <code className="block bg-muted/50 p-4 rounded-lg text-[11px] font-mono leading-relaxed">
            Score Solvência ={"\n"}
            {"  "}(Liquidez × 0.25) +{"\n"}
            {"  "}(Endividamento × 0.25) +{"\n"}
            {"  "}(PL × 0.20) +{"\n"}
            {"  "}(Geração Caixa × 0.15) +{"\n"}
            {"  "}(Pressão CP × 0.15)
          </code>

          <div className="space-y-2">
            {[
              { range: "0 – 30", label: "Saudável", color: "bg-emerald-500/10 text-emerald-600", active: scoreRJData.score <= 30 },
              { range: "31 – 60", label: "Atenção", color: "bg-yellow-500/10 text-yellow-600", active: scoreRJData.score > 30 && scoreRJData.score <= 60 },
              { range: "61 – 80", label: "Alto Risco", color: "bg-orange-500/10 text-orange-600", active: scoreRJData.score > 60 && scoreRJData.score <= 80 },
              { range: "81 – 100", label: "Risco Estrutural", color: "bg-red-500/10 text-red-600", active: scoreRJData.score > 80 },
            ].map(item => (
              <div key={item.range} className={`flex items-center justify-between p-3 rounded-lg bg-muted/20 ${item.active ? "ring-2 ring-accent" : ""}`}>
                <div className="flex items-center gap-3">
                  <span className={`text-xs font-mono font-bold px-2 py-1 rounded ${item.color}`}>{item.range}</span>
                  <span className="text-sm font-medium text-foreground">{item.label}</span>
                </div>
                {item.active && <CheckCircle2 className="w-4 h-4 text-accent" />}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* ── ASSINATURA ── */}
      <Card className="bg-muted/20">
        <CardContent className="pt-6 text-center space-y-3">
          <div className="w-12 h-12 mx-auto rounded-xl bg-[hsl(258,90%,66%)]/10 flex items-center justify-center">
            <Shield className="w-6 h-6 text-[hsl(258,90%,66%)]" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">Documento gerado e assinado digitalmente</p>
            <p className="text-xs text-muted-foreground">Agente IA — Auditor Contábil Sênior</p>
            <p className="text-xs text-muted-foreground">Especialista em Recuperação Judicial e Análise Empresarial</p>
            <p className="text-xs text-muted-foreground mt-2">Plataforma BEX — {today}</p>
          </div>
          <div className="flex flex-wrap justify-center gap-1.5 pt-2">
            {["NBC TA 700", "NBC TA 705", "CPC 26", "Lei 11.101/2005", "IFRS"].map(n => (
              <Badge key={n} variant="secondary" className="text-[10px]">{n}</Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Action buttons bottom */}
      <div className="flex justify-center gap-3 pt-4 print:hidden">
        <Button variant="outline" className="gap-1.5" onClick={() => window.print()}>
          <Download className="w-4 h-4" /> Exportar
        </Button>
        <Button variant="outline" className="gap-1.5" onClick={() => window.print()}>
          <Printer className="w-4 h-4" /> Imprimir
        </Button>
        <Button variant="outline" onClick={onBack} className="gap-1.5">
          <ArrowLeft className="w-4 h-4" /> Nova Análise
        </Button>
      </div>
    </div>
  );
};

/* ══════════════════════════════════════════════════════
   RESULTS VIEW (ALL TABS)
   ══════════════════════════════════════════════════════ */
const ResultsPhase = ({ onBack, aiAnalysis, parsedData }: { 
  onBack: () => void; 
  aiAnalysis?: any;
  parsedData?: ParsedFinancialData | null;
}) => {
  const navigate = useNavigate();
  const [reportGenerated, setReportGenerated] = useState(false);
  const [activeTab, setActiveTab] = useState("diagnostico");

  // Use AI data if available, otherwise fall back to mock data
  const activeDiagnostico = aiAnalysis?.diagnostico || diagnosticoData;
  const activePendencias = aiAnalysis?.pendencias || pendencias;
  const activeScoreRJ = aiAnalysis?.scoreRJ || scoreRJData;

  const handleGerarRelatorio = () => {
    setReportGenerated(true);
  };

  return (
    <div className="space-y-6">
      <StepTimeline currentStep={reportGenerated ? 5 : 4} />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground font-serif">Avaliação Empresarial</h1>
          <p className="text-sm text-muted-foreground">Documento gerado automaticamente pelo Agente IA Auditor Contábil Sênior</p>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="w-full flex-wrap h-auto gap-1 bg-muted/50 p-1.5">
          <TabsTrigger value="diagnostico" className="text-xs gap-1.5 data-[state=active]:bg-[hsl(258,90%,66%)] data-[state=active]:text-white">
            <Activity className="w-3.5 h-3.5" /> Diagnóstico
          </TabsTrigger>
          <TabsTrigger value="analise-tecnica" className="text-xs gap-1.5 data-[state=active]:bg-[hsl(258,90%,66%)] data-[state=active]:text-white">
            <Search className="w-3.5 h-3.5" /> Análise Técnica
          </TabsTrigger>
          <TabsTrigger value="indicadores" className="text-xs gap-1.5 data-[state=active]:bg-[hsl(258,90%,66%)] data-[state=active]:text-white">
            <BarChart3 className="w-3.5 h-3.5" /> Indicadores
          </TabsTrigger>
          <TabsTrigger value="endividamento" className="text-xs gap-1.5 data-[state=active]:bg-[hsl(258,90%,66%)] data-[state=active]:text-white">
            <Landmark className="w-3.5 h-3.5" /> Endividamento
          </TabsTrigger>
          <TabsTrigger value="patrimonial" className="text-xs gap-1.5 data-[state=active]:bg-[hsl(258,90%,66%)] data-[state=active]:text-white">
            <Layers className="w-3.5 h-3.5" /> Patrimonial
          </TabsTrigger>
          <TabsTrigger value="risco-rj" className="text-xs gap-1.5 data-[state=active]:bg-[hsl(258,90%,66%)] data-[state=active]:text-white">
            <AlertOctagon className="w-3.5 h-3.5" /> Risco RJ
          </TabsTrigger>
          <TabsTrigger value="relatorio-final" className="text-xs gap-1.5 data-[state=active]:bg-[hsl(258,90%,66%)] data-[state=active]:text-white">
            <BookOpen className="w-3.5 h-3.5" /> Relatório Final
          </TabsTrigger>
        </TabsList>

        <TabsContent value="diagnostico"><TabDiagnostico data={activeDiagnostico} /></TabsContent>
        <TabsContent value="analise-tecnica"><TabAnaliseTecnica pendenciasData={activePendencias} parsedData={parsedData} /></TabsContent>
        <TabsContent value="indicadores"><TabIndicadores /></TabsContent>
        <TabsContent value="endividamento"><TabEndividamento /></TabsContent>
        <TabsContent value="patrimonial"><TabPatrimonial /></TabsContent>
        <TabsContent value="risco-rj"><TabRiscoRJ /></TabsContent>
        <TabsContent value="relatorio-final">
          {reportGenerated ? (
            <TabRelatorioFinal onBack={onBack} />
          ) : (
            <TabRelatorioPreview onGerar={handleGerarRelatorio} />
          )}
        </TabsContent>
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
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [aiAnalysis, setAiAnalysis] = useState<any>(null);
  const [parsedData, setParsedData] = useState<ParsedFinancialData | null>(null);

  const handleAnalysisReady = useCallback((analysis: any, parsed: ParsedFinancialData | null) => {
    setAiAnalysis(analysis);
    setParsedData(parsed);
  }, []);

  return (
    <PlatformLayout>
      <div className="max-w-[1400px] mx-auto p-4 md:p-6">
        {phase === "upload" && (
          <UploadPhase 
            onProcess={() => setPhase("processing")} 
            onFilesReady={setUploadedFiles} 
          />
        )}
        {phase === "processing" && (
          <ProcessingPhase 
            onComplete={() => setPhase("results")} 
            files={uploadedFiles}
            onAnalysisReady={handleAnalysisReady}
          />
        )}
        {phase === "results" && (
          <ResultsPhase 
            onBack={() => { setPhase("upload"); setAiAnalysis(null); setParsedData(null); }} 
            aiAnalysis={aiAnalysis}
            parsedData={parsedData}
          />
        )}
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
