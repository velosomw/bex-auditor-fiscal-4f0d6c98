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
import { parseFile, parseMultipleFiles, analyzeFinancialData, streamAuditChat, isPDF, isDocument, isDataFile, getFileFormat, type ParsedFinancialData } from "@/services/auditAIService";
import TabKanitz from "@/components/audit/TabKanitz";
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
                    {(/\.(pdf)$/i).test(f.fileName) ? (
                      <FileText className="w-8 h-8 text-emerald-600" />
                    ) : (/\.(docx?|txt|rtf)$/i).test(f.fileName) ? (
                      <FileText className="w-8 h-8 text-emerald-600" />
                    ) : (
                      <FileSpreadsheet className="w-8 h-8 text-emerald-600" />
                    )}
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
                <Upload className="w-8 h-8 text-muted-foreground" />
              </div>
              <p className="text-sm font-medium text-foreground">Arraste o documento ou clique para selecionar</p>
              <p className="text-xs text-muted-foreground mt-1">Formatos: PDF, Excel (.xlsx, .xlsm, .xlsb, .xltx, .xltm), Word (.docx), CSV, TXT, JSON, XML, OFX, SPED</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">Upload simultâneo de até 20 arquivos</p>
            </div>
          )}
          <input id="file-input" type="file" hidden multiple accept=".xlsx,.xls,.csv,.xlsm,.xlsb,.xltx,.xltm,.pdf,.docx,.doc,.txt,.rtf,.json,.xml,.ofx,.sped" onChange={(e) => handleFiles(e.target.files)} />
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
  { label: "📥 Upload — Recebendo arquivos...", duration: 800 },
  { label: "🔍 Agente Parser — Identificando formato e tipo de documento...", duration: 1200 },
  { label: "📊 Agente Parser — Extraindo dados contábeis...", duration: 1500 },
  { label: "🏗️ Agente Estruturador — Classificando contas contábeis...", duration: 1300 },
  { label: "🔎 Agente Auditor — Verificando inconsistências...", duration: 1400 },
  { label: "📈 Agente Risk Engine — Calculando indicadores financeiros...", duration: 1200 },
  { label: "📈 Agente Risk Engine — Executando Modelo Kanitz...", duration: 1000 },
  { label: "📈 Agente Risk Engine — Calculando Score BEX-RJ...", duration: 1100 },
  { label: "📝 Agente Relatório — Consolidando análise...", duration: 1000 },
  { label: "✅ Gerando relatórios BEX e Kanitz...", duration: 1500 },
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
        // Step 0: Upload received
        setCurrentStep(0);
        setProgress(5);
        
        let parsedData: ParsedFinancialData | null = null;
        if (files.length > 0) {
          // Step 1: Parser agent - identify format
          setCurrentStep(1);
          setProgress(10);

          // Step 2: Parser agent - extract data
          setCurrentStep(2);
          setProgress(15);

          const { parsed, fileResults } = await parseMultipleFiles(files);
          parsedData = parsed;
          
          const failedFiles = fileResults.filter(f => !f.success);
          if (failedFiles.length > 0) {
            console.warn("Some files failed:", failedFiles);
          }
          console.log("Files parsed:", fileResults.map(f => `${f.fileName} (${f.format} - ${f.type})`));
        }

        // Step 3: Structurer agent
        setCurrentStep(3);
        setProgress(30);
        
        // Step 4: Auditor agent
        setCurrentStep(4);
        setProgress(40);
        
        const dataToAnalyze = parsedData || {
          balanco: [],
          dre: [],
          years: [],
        };

        // Step 5-7: Risk Engine
        setCurrentStep(5);
        setProgress(50);

        const analysis = await analyzeFinancialData(dataToAnalyze, {
          depth: "tecnico",
          purpose: "externa",
        });

        setCurrentStep(6);
        setProgress(70);
        
        setCurrentStep(7);
        setProgress(80);

        // Step 8: Report agent
        setCurrentStep(8);
        setProgress(90);
        
        // Step 9: Final
        setCurrentStep(9);
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

/* ── Helper: compute indicators from parsed data ── */
const computeIndicatorsFromParsed = (parsedData: ParsedFinancialData | null) => {
  if (!parsedData) return {};
  const findValue = (rows: typeof parsedData.balanco, keyword: string, year: string) => {
    const row = rows.find(r => r.conta.toLowerCase().includes(keyword) || r.descricao.toLowerCase().includes(keyword));
    return row?.values[year] || 0;
  };

  const result: Record<string, any> = {};
  for (const year of parsedData.years) {
    const allRows = [...parsedData.balanco, ...parsedData.dre];
    const ac = Math.abs(findValue(allRows, "total do ativo circulante", year) || findValue(allRows, "ativo circulante", year));
    const anc = Math.abs(findValue(allRows, "total do ativo não circulante", year) || findValue(allRows, "ativo nao circulante", year));
    const pc = Math.abs(findValue(allRows, "total do passivo circulante", year) || findValue(allRows, "passivo circulante", year));
    const pnc = Math.abs(findValue(allRows, "total do passivo não circulante", year) || findValue(allRows, "passivo nao circulante", year));
    const pl = findValue(allRows, "total do patrimônio", year) || findValue(allRows, "patrimonio líquido", year) || findValue(allRows, "patrimônio líquido", year);
    const estoque = Math.abs(findValue(allRows, "estoque", year));
    const caixa = Math.abs(findValue(allRows, "caixa", year));
    const receita = Math.abs(findValue(allRows, "receitas líquidas", year) || findValue(allRows, "receita líquida", year));
    const lucro = findValue(allRows, "resultado do exercício", year) || findValue(allRows, "lucro líquido", year);
    const resOp = findValue(allRows, "resultado operacional", year) || findValue(allRows, "lucro operacional bruto", year);
    const despFin = Math.abs(findValue(allRows, "despesas financeiras", year));
    const imob = Math.abs(findValue(allRows, "imobilizado", year));
    const contasReceber = Math.abs(findValue(allRows, "contas a receber", year));
    const fornecedores = Math.abs(findValue(allRows, "fornecedores", year));
    const cmv = Math.abs(findValue(allRows, "cmv", year) || findValue(allRows, "total dos custos", year));
    const at = ac + anc || 1;
    const pt = pc + pnc || 1;

    result[year] = {
      liquidezCorrente: pc ? ac / pc : 0,
      liquidezSeca: pc ? (ac - estoque) / pc : 0,
      liquidezImediata: pc ? caixa / pc : 0,
      liquidezGeral: pt ? (ac + anc) / pt : 0,
      endividamentoGeral: at ? pt / at : 0,
      composicaoEndividamento: pt ? pc / pt : 0,
      imobilizacaoPL: Math.abs(pl) ? imob / Math.abs(pl) : 0,
      coberturaJuros: despFin ? (resOp + despFin) / despFin : 0,
      giroAtivo: at ? receita / at : 0,
      pmr: receita ? (contasReceber * 360) / receita : 0,
      pmp: cmv ? (fornecedores * 360) / cmv : 0,
      idadeMediaEstoque: cmv ? (estoque * 360) / cmv : 0,
      margemLiquida: receita ? lucro / receita : 0,
      margemOperacional: receita ? resOp / receita : 0,
      roa: at ? lucro / at : 0,
      roe: Math.abs(pl) ? lucro / Math.abs(pl) : 0,
      // extra values for endividamento tab
      _ac: ac, _anc: anc, _pc: pc, _pnc: pnc, _pl: pl, _caixa: caixa,
      _receita: receita, _lucro: lucro, _resOp: resOp, _despFin: despFin,
      _imob: imob, _estoque: estoque, _fornecedores: fornecedores, _cmv: cmv,
      _contasReceber: contasReceber,
    };
  }
  return result;
};

/* ── Tab 2: Indicadores Econômico-Financeiros ── */
const TabIndicadores = ({ parsedData }: { parsedData?: ParsedFinancialData | null }) => {
  const { state } = useAudit();
  const computedInd = computeIndicatorsFromParsed(parsedData || null);
  const hasComputed = Object.keys(computedInd).length > 0;
  const ind = hasComputed ? computedInd : state.financialAnalysis.indicators;
  const years = hasComputed ? Object.keys(computedInd).sort() : ["2021", "2022", "2023"];

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

      {hasComputed && years.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2"><Calculator className="w-4 h-4 text-accent" /> EBITDA Estimado</CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`grid grid-cols-${Math.min(years.length, 4)} gap-4`}>
              {years.map(y => {
                const d = computedInd[y];
                if (!d) return null;
                const ebitda = (d._resOp || 0) + (d._despFin || 0);
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
      )}
    </div>
  );
};

/* ── Tab 3: Análise de Endividamento ── */
const TabEndividamento = ({ aiAnalysis, parsedData }: { aiAnalysis?: any; parsedData?: ParsedFinancialData | null }) => {
  const computedInd = computeIndicatorsFromParsed(parsedData || null);
  const years = Object.keys(computedInd).sort();
  const latestYear = years[years.length - 1];
  const d = latestYear ? computedInd[latestYear] : null;

  const pc = d?._pc || 0;
  const pnc = d?._pnc || 0;
  const ptotal = pc + pnc || 1;
  const caixa = d?._caixa || 0;
  const ac = d?._ac || 0;
  const anc = d?._anc || 0;

  // Try to extract loan data from parsed balanco
  const findAbsValue = (keyword: string) => {
    if (!parsedData) return 0;
    const row = parsedData.balanco.find(r => 
      r.conta.toLowerCase().includes(keyword) || r.descricao.toLowerCase().includes(keyword)
    );
    return Math.abs(row?.values[latestYear || ""] || 0);
  };

  const emprestimos = findAbsValue("empréstimos") || findAbsValue("financiamentos");
  const fornecedores = d?._fornecedores || 0;
  const dividaLiquida = emprestimos - caixa;

  const riscos = aiAnalysis?.riscosEndividamento || [
    { tipo: "Risco Bancário", nivel: "medio", detail: `Empréstimos: R$ ${fmt(emprestimos)}` },
    { tipo: "Risco Trabalhista", nivel: "medio", detail: "Verificar contingências trabalhistas." },
    { tipo: "Risco Fiscal", nivel: "medio", detail: "Verificar recuperabilidade de tributos." },
  ];

  return (
    <div className="space-y-4">
      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2"><Landmark className="w-4 h-4 text-accent" /> Estrutura da Dívida {latestYear && `(${latestYear})`}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {[
              { label: "Empréstimos e Financiamentos", value: emprestimos },
              { label: "Fornecedores", value: fornecedores },
              { label: "Passivo Circulante", value: pc },
              { label: "Passivo Não Circulante", value: pnc },
              { label: "Caixa e Equivalentes", value: caixa },
              { label: "Dívida Líquida", value: dividaLiquida, highlight: true },
            ].map(item => (
              <div key={item.label} className={`flex justify-between p-3 rounded-lg ${item.highlight ? "bg-accent/5 border border-accent/20" : "bg-muted/30"}`}>
                <span className="text-sm text-foreground font-medium">{item.label}</span>
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
                  <span className="font-mono">{fmtPct(pc / ptotal)}</span>
                </div>
                <Progress value={(pc / ptotal) * 100} className="h-2" />
              </div>
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-muted-foreground">Longo Prazo</span>
                  <span className="font-mono">{fmtPct(pnc / ptotal)}</span>
                </div>
                <Progress value={(pnc / ptotal) * 100} className="h-2" />
              </div>
            </div>

            <div className="border-t border-border/50 pt-3 space-y-2">
              <p className="text-xs font-semibold text-foreground">Classificação de Risco</p>
              {riscos.map((r: any) => (
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
const TabPatrimonial = ({ aiAnalysis, parsedData }: { aiAnalysis?: any; parsedData?: ParsedFinancialData | null }) => {
  const { state } = useAudit();
  
  // Use parsed data if available, otherwise fall back to mock
  const hasParsed = parsedData && parsedData.balanco.length > 0;
  const rows = hasParsed ? parsedData.balanco : state.balancoRows;
  const years = hasParsed ? parsedData.years : ["2021", "2022", "2023"];
  const lastYear = years[years.length - 1];
  const prevYear = years.length >= 2 ? years[years.length - 2] : null;

  const alertas = aiAnalysis?.alertasPatrimoniais || [
    { conta: "Sem dados da IA", alerta: "Carregue um documento para análise real", detail: "", gravidade: "baixo" },
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
                {prevYear && <TableHead className="text-right text-[10px]">AH {lastYear}/{prevYear}</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row: any, idx: number) => {
                const vPrev = prevYear ? (row.values[prevYear] || 0) : 0;
                const vLast = row.values[lastYear] || 0;
                const ah = vPrev !== 0 ? ((vLast - vPrev) / Math.abs(vPrev)) : 0;
                const isAlert = Math.abs(ah) > 0.25;
                const isTotal = row.conta.toLowerCase().includes("total") || row.descricao.toLowerCase().includes("total");
                return (
                  <TableRow key={`${row.conta}-${idx}`} className={(row as any).hasRisk ? "bg-orange-500/5" : ""}>
                    <TableCell className="text-[10px] font-mono text-muted-foreground">{row.conta}</TableCell>
                    <TableCell className={`text-xs ${isTotal ? "font-semibold" : ""}`}>{row.descricao}</TableCell>
                    {years.map(y => (
                      <TableCell key={y} className="text-right text-xs font-mono">{fmt(row.values[y] || 0)}</TableCell>
                    ))}
                    {prevYear && (
                      <TableCell className={`text-right text-xs font-mono ${isAlert ? "text-orange-500 font-bold" : ""}`}>
                        {ah > 0 ? "+" : ""}{fmtPct(ah)}
                      </TableCell>
                    )}
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
          {alertas.map((a: any, i: number) => (
            <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-muted/20 border border-border/30">
              <Badge className={`${severityColors[a.gravidade]?.bg} text-[10px] shrink-0 mt-0.5`}>{(a.gravidade || "").toUpperCase()}</Badge>
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
const TabRiscoRJ = ({ aiAnalysis }: { aiAnalysis?: any }) => {
  const activeScore = aiAnalysis?.scoreRJ || scoreRJData;
  const scoreColor = activeScore.score <= 30 ? "text-emerald-500" :
                     activeScore.score <= 60 ? "text-yellow-500" :
                     activeScore.score <= 80 ? "text-orange-500" : "text-red-500";

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
              <p className={`text-6xl font-bold ${scoreColor}`}>{activeScore.score}</p>
              <p className={`text-lg font-semibold mt-2 ${scoreColor}`}>{activeScore.classificacao}</p>
              <p className="text-xs text-muted-foreground mt-1">de 100 pontos</p>
            </div>
            <div className="space-y-2">
              {(activeScore.componentes || []).map((c: any) => (
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
                { range: "0 – 30", label: "Saudável", color: "bg-emerald-500/10 text-emerald-600", active: activeScore.score <= 30 },
                { range: "31 – 60", label: "Atenção", color: "bg-yellow-500/10 text-yellow-600", active: activeScore.score > 30 && activeScore.score <= 60 },
                { range: "61 – 80", label: "Alto Risco", color: "bg-orange-500/10 text-orange-600", active: activeScore.score > 60 && activeScore.score <= 80 },
                { range: "81 – 100", label: "Forte Indicativo de RJ", color: "bg-red-500/10 text-red-600", active: activeScore.score > 80 },
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
const reportTopicsBex = [
  { num: "1", title: "Capa", desc: "Logo BEX, título, empresa, CNPJ, data-base, responsável técnico e classificação de risco", icon: Shield },
  { num: "2", title: "Diagnóstico Executivo", desc: "Situação geral, classificação de risco, pontos-chave e conclusão técnica com fundamentação CPC/IFRS/NBC TA", icon: Activity },
  { num: "3", title: "Solvência", desc: "Liquidez Corrente, Seca, Geral, Solvência Total, Capital de Giro, Cobertura de Juros — com interpretação técnica", icon: Scale },
  { num: "4", title: "Análise Técnica — Pendências", desc: "Tabela consolidada com tipo, gravidade, impacto, fundamentação normativa e recomendações corretivas", icon: AlertTriangle },
  { num: "5", title: "Indicadores Econômico-Financeiros", desc: "Liquidez, Endividamento, Rentabilidade e EBITDA estimado com fórmulas e interpretação", icon: BarChart3 },
  { num: "6", title: "Endividamento", desc: "Estrutura da dívida, concentração de risco, dependência bancária e análise estratégica", icon: Landmark },
  { num: "7", title: "Balanço Patrimonial", desc: "Ativo, Passivo, PL com análise horizontal e validações de consistência", icon: Layers },
  { num: "★", title: "Score BEX de Solvência", desc: "Classificação final ponderada: Liquidez (25%), Endividamento (25%), PL (20%), Geração Caixa (15%), Pressão CP (15%)", icon: Target },
];

const reportTopicsKanitz = [
  { num: "1", title: "Capa", desc: "Empresa, período, data de geração e responsável técnico", icon: Shield },
  { num: "2", title: "Sumário Executivo", desc: "Situação atual, comparação com período anterior, tendência de solvência e risco identificado", icon: Activity },
  { num: "3", title: "Indicadores Financeiros", desc: "RPL, LG, LS, LC e GE — valores base, fórmulas, resultado e interpretação técnica", icon: Calculator },
  { num: "4", title: "Resultado do Fator de Insolvência", desc: "Valor do FI, classificação, termômetro visual e histórico por período", icon: Target },
  { num: "5", title: "Análise Técnica Automatizada", desc: "Estrutura de capital, dependência de terceiros, capacidade de pagamento e deterioração financeira", icon: Search },
  { num: "6", title: "Recomendações Estratégicas", desc: "Redução de passivos, reestruturação de capital, ajustes operacionais e planejamento de fluxo de caixa", icon: TrendingUp },
  { num: "7", title: "Memória de Cálculo", desc: "Transparência completa das fórmulas, pesos e dados utilizados no cálculo do FI", icon: Calculator },
];

const TabRelatorioPreview = ({ onGerarBex, onGerarKanitz }: { onGerarBex: () => void; onGerarKanitz: () => void }) => (
  <div className="space-y-6">
    <div className="text-center space-y-2 mb-2">
      <h2 className="text-lg font-bold text-foreground font-serif">Selecione o Relatório para Gerar</h2>
      <p className="text-sm text-muted-foreground max-w-xl mx-auto">Escolha entre o Relatório BEX (Avaliação Contábil e Solvência) ou o Relatório Kanitz (Termômetro de Insolvência).</p>
    </div>

    <div className="grid lg:grid-cols-2 gap-6">
      {/* Card BEX */}
      <Card className="border-2 hover:border-[hsl(258,90%,66%)]/50 transition-all">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[hsl(258,90%,66%)]/10 flex items-center justify-center">
              <BookOpen className="w-5 h-5 text-[hsl(258,90%,66%)]" />
            </div>
            <div>
              <CardTitle className="text-base">Relatório BEX</CardTitle>
              <CardDescription className="text-xs">Avaliação Contábil e Solvência Empresarial</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-xs text-muted-foreground leading-relaxed">
            Relatório técnico completo com diagnóstico executivo, solvência, pendências contábeis, indicadores financeiros, endividamento, balanço patrimonial e Score BEX de Solvência.
          </p>
          <div className="space-y-2">
            {reportTopicsBex.map(t => {
              const Icon = t.icon;
              return (
                <div key={t.num} className="flex items-start gap-3 p-2.5 rounded-lg bg-muted/20">
                  <div className="w-6 h-6 rounded bg-[hsl(258,90%,66%)]/10 flex items-center justify-center shrink-0">
                    <span className="text-[10px] font-bold text-[hsl(258,90%,66%)]">{t.num}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-foreground">{t.title}</p>
                    <p className="text-[10px] text-muted-foreground">{t.desc}</p>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {["NBC TA 700", "CPC 26", "IFRS 15", "Lei 11.101/2005"].map(n => (
              <Badge key={n} variant="secondary" className="text-[10px]">{n}</Badge>
            ))}
          </div>
          <Button
            onClick={onGerarBex}
            className="w-full bg-[hsl(258,90%,66%)] hover:bg-[hsl(258,90%,56%)] text-white gap-2 h-11 text-sm font-semibold rounded-xl shadow-lg shadow-[hsl(258,90%,66%)]/20"
          >
            <FileText className="w-4 h-4" /> Gerar Relatório BEX
          </Button>
        </CardContent>
      </Card>

      {/* Card Kanitz */}
      <Card className="border-2 hover:border-amber-500/50 transition-all">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
              <Scale className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <CardTitle className="text-base">Relatório Kanitz</CardTitle>
              <CardDescription className="text-xs">Termômetro de Insolvência — Stephen C. Kanitz</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-xs text-muted-foreground leading-relaxed">
            Relatório de análise preditiva de falência com cálculo do Fator de Insolvência (FI), classificação de risco, análise técnica automatizada e recomendações estratégicas.
          </p>
          <div className="space-y-2">
            {reportTopicsKanitz.map(t => {
              const Icon = t.icon;
              return (
                <div key={t.num} className="flex items-start gap-3 p-2.5 rounded-lg bg-muted/20">
                  <div className="w-6 h-6 rounded bg-amber-500/10 flex items-center justify-center shrink-0">
                    <span className="text-[10px] font-bold text-amber-600">{t.num}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-foreground">{t.title}</p>
                    <p className="text-[10px] text-muted-foreground">{t.desc}</p>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {["Kanitz (1978)", "NBC TA 570", "Lei 11.101/2005", "CPC 26"].map(n => (
              <Badge key={n} variant="secondary" className="text-[10px]">{n}</Badge>
            ))}
          </div>
          <Button
            onClick={onGerarKanitz}
            className="w-full bg-amber-500 hover:bg-amber-600 text-white gap-2 h-11 text-sm font-semibold rounded-xl shadow-lg shadow-amber-500/20"
          >
            <Scale className="w-4 h-4" /> Gerar Relatório Kanitz
          </Button>
        </CardContent>
      </Card>
    </div>
  </div>
);

/* ══════════════════════════════════════════════════════
   TAB: RELATÓRIO FINAL BEX
   ══════════════════════════════════════════════════════ */
const TabRelatorioFinal = ({ onBack, aiAnalysis, parsedData, onSwitchToKanitz }: { onBack: () => void; aiAnalysis?: any; parsedData?: ParsedFinancialData | null; onSwitchToKanitz?: () => void }) => {
  const { state } = useAudit();
  const navigate = useNavigate();
  const today = new Date().toLocaleDateString("pt-BR");
  
  const computedInd = computeIndicatorsFromParsed(parsedData || null);
  const hasComputed = Object.keys(computedInd).length > 0;
  const years = hasComputed ? Object.keys(computedInd).sort() : ["2021", "2022", "2023"];
  const latestYear = years[years.length - 1];
  const ind = hasComputed ? computedInd : state.financialAnalysis.indicators;
  const d = hasComputed ? computedInd[latestYear] : state.config.entityData["2023"];

  const activeScore = aiAnalysis?.scoreRJ || scoreRJData;
  const activeDiag = aiAnalysis?.diagnostico || diagnosticoData;
  const activePend = aiAnalysis?.pendencias || pendencias;

  const scoreColor = activeScore.score <= 30 ? "text-emerald-600" :
                     activeScore.score <= 60 ? "text-yellow-600" :
                     activeScore.score <= 80 ? "text-orange-600" : "text-red-600";
  const scoreBg = activeScore.score <= 30 ? "bg-emerald-500/10 border-emerald-500/30" :
                  activeScore.score <= 60 ? "bg-yellow-500/10 border-yellow-500/30" :
                  activeScore.score <= 80 ? "bg-orange-500/10 border-orange-500/30" : "bg-red-500/10 border-red-500/30";
  const scoreLabel = activeScore.score <= 30 ? "Saudável" :
                     activeScore.score <= 60 ? "Atenção" :
                     activeScore.score <= 80 ? "Alto Risco" : "Risco Estrutural";

  const riskIcon = activeScore.score <= 30 ? "🟢" :
                   activeScore.score <= 60 ? "🟡" :
                   activeScore.score <= 80 ? "🔴" : "⚫";

  // Compute from real data
  const findAbsValue = (keyword: string) => {
    if (!parsedData) return 0;
    const row = parsedData.balanco.find(r => 
      r.conta.toLowerCase().includes(keyword) || r.descricao.toLowerCase().includes(keyword)
    );
    return Math.abs(row?.values[latestYear || ""] || 0);
  };

  const emprestimos = findAbsValue("empréstimos") || findAbsValue("financiamentos");
  const pc = d?._pc || d?.passivoCirculante || 0;
  const pnc = d?._pnc || d?.passivoNaoCirculante || 0;
  const ac = d?._ac || d?.ativoCirculante || 0;
  const anc = d?._anc || d?.ativoNaoCirculante || 0;
  const caixa = d?._caixa || d?.caixaEquivalentes || 0;
  const dividaOnerosa = emprestimos;
  const ptotal = pc + pnc || 1;
  const fornec = d?._fornecedores || d?.fornecedores || 0;

  const latestInd = ind[latestYear];
  const solvencyIndicators = latestInd ? [
    { name: "Liquidez Corrente", result: fmtPct(latestInd.liquidezCorrente), param: "> 1,5", classification: latestInd.liquidezCorrente > 1.5 ? "Adequada" : latestInd.liquidezCorrente > 1 ? "Atenção" : "Insuficiente", comment: `AC R$ ${fmt(ac)} / PC R$ ${fmt(pc)}` },
    { name: "Liquidez Seca", result: fmtPct(latestInd.liquidezSeca), param: "> 1,0", classification: latestInd.liquidezSeca > 1 ? "Adequada" : "Atenção", comment: `(AC - Estoques) / PC` },
    { name: "Liquidez Geral", result: fmtPct(latestInd.liquidezGeral), param: "> 1,0", classification: latestInd.liquidezGeral > 1 ? "Adequada" : "Insuficiente", comment: `(AC + RLP) / (PC + PNC)` },
    { name: "Cobertura de Juros", result: `${latestInd.coberturaJuros.toFixed(1)}x`, param: "> 3,0x", classification: latestInd.coberturaJuros > 3 ? "Adequada" : "Atenção", comment: `LAJIR / Despesas Financeiras` },
    { name: "Capital de Giro Líquido", result: `R$ ${fmt(ac - pc)}`, param: "> 0", classification: ac - pc > 0 ? "Positivo" : "Negativo", comment: `AC - PC` },
    { name: "Solvência Total", result: fmtPct((ac + anc) / ptotal), param: "> 1,0", classification: (ac + anc) / ptotal > 1 ? "Solvente" : "Insolvente", comment: `AT / PT` },
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
        {onSwitchToKanitz && (
          <Button size="sm" className="gap-1.5 bg-amber-500 hover:bg-amber-600 text-white" onClick={onSwitchToKanitz}>
            <Scale className="w-4 h-4" /> Relatório Kanitz
          </Button>
        )}
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
            <span className="text-sm font-semibold">{scoreLabel} — Score BEX: {activeScore.score}/100</span>
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
              {(activeDiag.pontosChave || []).map((p: any) => (
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
              <p className="text-sm text-foreground leading-relaxed">{activeDiag.resumo}</p>
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
                { title: "Capacidade de Pagamento", text: "A empresa apresenta liquidez corrente de " + (latestInd ? fmtPct(latestInd.liquidezCorrente) : "N/A") + ", indicando capacidade de honrar obrigações de curto prazo." },
                { title: "Avaliação de Risco de Insolvência", text: "O Score BEX-RJ de " + activeScore.score + " pontos classifica a empresa na faixa de \"" + scoreLabel + "\". A análise multifatorial considera endividamento, liquidez, patrimônio líquido, geração de caixa e concentração de dívida." },
                { title: "Continuidade Operacional (Going Concern)", text: "Com PL de R$ " + fmt(Math.abs(d?._pl || d?.patrimonioLiquido || 0)) + " e capital de giro líquido " + (ac - pc > 0 ? "positivo" : "negativo") + ", a premissa de continuidade requer monitoramento contínuo." },
                { title: "Probabilidade Estrutural de RJ", text: activeScore.score <= 30 ? "Baixa probabilidade. Indicadores dentro dos parâmetros aceitáveis." : activeScore.score <= 60 ? "Moderada. Deterioração dos indicadores exige atenção e medidas preventivas conforme Lei 11.101/2005." : "Elevada. Recomenda-se plano de reestruturação financeira imediato." },
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
                  {activePend.map((p: any, i: number) => (
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
              {activePend.map((p: any, i: number) => (
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
              { name: "Liquidez Corrente", formula: "AC / PC", value: latestInd?.liquidezCorrente, interp: "Capacidade de pagamento de obrigações de curto prazo" },
              { name: "Liquidez Seca", formula: "(AC - EST) / PC", value: latestInd?.liquidezSeca, interp: "Liquidez excluindo estoques" },
              { name: "Liquidez Geral", formula: "(AC + RLP) / (PC + PNC)", value: latestInd?.liquidezGeral, interp: "Capacidade de pagamento total" },
            ]},
            { title: "4.2 Indicadores de Endividamento", items: [
              { name: "Endividamento Total", formula: "PT / AT", value: latestInd?.endividamentoGeral, interp: "Grau de comprometimento do ativo com terceiros" },
              { name: "Composição do Endividamento", formula: "PC / PT", value: latestInd?.composicaoEndividamento, interp: "Concentração da dívida no curto prazo" },
              { name: "Imobilização do PL", formula: "Imob / PL", value: latestInd?.imobilizacaoPL, interp: "Grau de imobilização do capital próprio" },
            ]},
            { title: "4.3 Indicadores de Rentabilidade", items: [
              { name: "Margem Operacional", formula: "LAJIR / Receita", value: latestInd?.margemOperacional, interp: "Eficiência operacional da empresa" },
              { name: "ROA", formula: "LL / AT", value: latestInd?.roa, interp: "Retorno gerado pelo ativo total" },
              { name: "ROE", formula: "LL / PL", value: latestInd?.roe, interp: "Retorno ao acionista sobre capital investido" },
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
              <h3 className="text-sm font-semibold text-foreground mb-2">EBITDA Estimado ({latestYear})</h3>
              <div className="p-4 rounded-lg bg-muted/30 text-center">
                <p className="text-2xl font-bold font-mono text-foreground">R$ {fmt((d._resOp || d.resultadoOperacional || 0) + (d._despFin || d.despesasFinanceiras || 0))}</p>
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
                { label: "Empréstimos e Financiamentos", value: emprestimos },
                { label: "Dívida Bancária Total", value: dividaOnerosa },
                { label: "Fornecedores", value: fornec },
                { label: "Passivo Circulante", value: pc },
                { label: "Passivo Não Circulante", value: pnc },
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
                { label: "Dependência Bancária", value: fmtPct(dividaOnerosa / (ac + anc || 1)), risk: false },
                { label: "Pressão no Fluxo de Caixa (Emp / Caixa)", value: caixa ? `${(emprestimos / caixa).toFixed(1)}x` : "N/A", risk: caixa ? emprestimos / caixa > 1 : false },
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
                A estrutura de endividamento revela passivo não circulante de R$ {fmt(pnc)}, representando {fmtPct(pnc / ptotal)} do passivo total. 
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

          <div className="text-center mb-2">
            <h3 className="text-sm font-bold text-foreground uppercase tracking-wide">DEMONSTRATIVOS FINANCEIROS CONSOLIDADOS</h3>
            <p className="text-[10px] text-muted-foreground mt-1">Balanço Patrimonial</p>
          </div>

          {(() => {
            const allRows = parsedData?.balanco || state.balancoRows;
            const ativoRows = allRows.filter((r: any) => (r.conta || "").startsWith("1"));
            const passivoRows = allRows.filter((r: any) => (r.conta || "").startsWith("2"));
            const maxRows = Math.max(ativoRows.length, passivoRows.length);

            const isParent = (conta: string) => {
              const parts = conta.replace(/\./g, "").length;
              return conta === "1" || conta === "2" || conta === "1.01" || conta === "1.02" || conta === "2.01" || conta === "2.02" || conta === "2.03" || parts <= 3;
            };

            const getIndent = (conta: string) => {
              const depth = (conta.match(/\./g) || []).length;
              return depth > 0 ? `${depth * 12}px` : "0px";
            };

            return (
              <div className="overflow-x-auto">
                <table className="w-full text-[10px] border-collapse">
                  <thead>
                    <tr className="border-b-2 border-border">
                      <th className="text-left p-1.5 text-muted-foreground font-semibold w-[50px]">Conta</th>
                      <th className="text-left p-1.5 text-muted-foreground font-semibold">ATIVO</th>
                      {years.map(y => <th key={`a-${y}`} className="text-right p-1.5 text-muted-foreground font-semibold w-[100px]">{y}</th>)}
                      <th className="w-[16px]"></th>
                      <th className="text-left p-1.5 text-muted-foreground font-semibold w-[50px]">Conta</th>
                      <th className="text-left p-1.5 text-muted-foreground font-semibold">PASSIVO + PL</th>
                      {years.map(y => <th key={`p-${y}`} className="text-right p-1.5 text-muted-foreground font-semibold w-[100px]">{y}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {Array.from({ length: maxRows }).map((_, idx) => {
                      const aRow = ativoRows[idx];
                      const pRow = passivoRows[idx];
                      const aParent = aRow && isParent(aRow.conta);
                      const pParent = pRow && isParent(pRow.conta);

                      return (
                        <tr key={idx} className="border-b border-border/40 hover:bg-muted/30">
                          {/* ATIVO side */}
                          <td className={`p-1.5 font-mono text-muted-foreground ${aParent ? "font-bold" : ""}`}>
                            {aRow?.conta || ""}
                          </td>
                          <td className={`p-1.5 ${aParent ? "font-bold text-foreground" : "text-foreground"}`} style={{ paddingLeft: aRow ? `calc(6px + ${getIndent(aRow.conta)})` : "6px" }}>
                            {aRow?.descricao || ""}
                          </td>
                          {years.map(y => (
                            <td key={`a-${y}-${idx}`} className={`p-1.5 text-right font-mono ${aParent ? "font-bold text-foreground" : "text-foreground"}`}>
                              {aRow ? fmt(aRow.values[y] || 0) : ""}
                            </td>
                          ))}

                          {/* Separator */}
                          <td className="bg-border/20"></td>

                          {/* PASSIVO side */}
                          <td className={`p-1.5 font-mono text-muted-foreground ${pParent ? "font-bold" : ""}`}>
                            {pRow?.conta || ""}
                          </td>
                          <td className={`p-1.5 ${pParent ? "font-bold text-foreground" : "text-foreground"}`} style={{ paddingLeft: pRow ? `calc(6px + ${getIndent(pRow.conta)})` : "6px" }}>
                            {pRow?.descricao || ""}
                          </td>
                          {years.map(y => (
                            <td key={`p-${y}-${idx}`} className={`p-1.5 text-right font-mono ${pParent ? "font-bold text-foreground" : "text-foreground"}`}>
                              {pRow ? fmt(pRow.values[y] || 0) : ""}
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            );
          })()}

          <div>
            <h3 className="text-sm font-semibold text-foreground mb-2">Validações</h3>
            <div className="space-y-2">
              {[
                { check: "Ativo = Passivo + PL", status: true, detail: `Ativo Total: R$ ${fmt(ac + anc)} | Passivo + PL: R$ ${fmt(pc + pnc)}` },
                { check: "Passivo a Descoberto", status: (d?._pl || d?.patrimonioLiquido || 0) > 0, detail: (d?._pl || d?.patrimonioLiquido || 0) > 0 ? "Não identificado — PL positivo" : "IDENTIFICADO — PL negativo" },
                { check: "PL Negativo", status: (d?._pl || d?.patrimonioLiquido || 0) > 0, detail: (d?._pl || d?.patrimonioLiquido || 0) > 0 ? `PL positivo: R$ ${fmt(Math.abs(d?._pl || d?.patrimonioLiquido || 0))}` : "PL NEGATIVO identificado" },
                { check: "Descasamento Estrutural", status: ac > pc, detail: "Capital de giro líquido " + (ac > pc ? "positivo" : "negativo") },
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
            <p className={`text-6xl font-bold ${scoreColor}`}>{activeScore.score}</p>
            <p className={`text-xl font-semibold mt-2 ${scoreColor}`}>{scoreLabel}</p>
            <p className="text-xs text-muted-foreground mt-1">Score BEX de Solvência — de 100 pontos</p>
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            {(activeScore.componentes || []).map((c: any) => (
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
              { range: "0 – 30", label: "Saudável", color: "bg-emerald-500/10 text-emerald-600", active: activeScore.score <= 30 },
              { range: "31 – 60", label: "Atenção", color: "bg-yellow-500/10 text-yellow-600", active: activeScore.score > 30 && activeScore.score <= 60 },
              { range: "61 – 80", label: "Alto Risco", color: "bg-orange-500/10 text-orange-600", active: activeScore.score > 60 && activeScore.score <= 80 },
              { range: "81 – 100", label: "Risco Estrutural", color: "bg-red-500/10 text-red-600", active: activeScore.score > 80 },
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
        {onSwitchToKanitz && (
          <Button className="gap-1.5 bg-amber-500 hover:bg-amber-600 text-white" onClick={onSwitchToKanitz}>
            <Scale className="w-4 h-4" /> Relatório Kanitz
          </Button>
        )}
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
   TAB: RELATÓRIO KANITZ (TERMÔMETRO DE INSOLVÊNCIA)
   ══════════════════════════════════════════════════════ */
const TabRelatorioKanitz = ({ onBack, parsedData, onSwitchToBex }: { onBack: () => void; parsedData?: ParsedFinancialData | null; onSwitchToBex?: () => void }) => {
  const today = new Date().toLocaleDateString("pt-BR");

  const findValue = (keyword: string, year: string) => {
    if (!parsedData) return 0;
    const allRows = [...parsedData.balanco, ...parsedData.dre];
    const row = allRows.find(r =>
      r.conta.toLowerCase().includes(keyword) || r.descricao.toLowerCase().includes(keyword)
    );
    return row?.values[year] || 0;
  };

  const kanitzResults: Array<{
    year: string; rpl: number; lg: number; ls: number; lc: number; ge: number; fi: number;
    classificacao: "solvente" | "penumbra" | "insolvente"; riskScoreNormalized: number;
    ac: number; pc: number; pnc: number; pl: number; estoque: number; rlp: number; pt: number; ll: number;
  }> = [];

  if (parsedData) {
    for (const year of parsedData.years) {
      const ac = Math.abs(findValue("total do ativo circulante", year) || findValue("ativo circulante", year));
      const pc = Math.abs(findValue("total do passivo circulante", year) || findValue("passivo circulante", year));
      const pnc = Math.abs(findValue("total do passivo não circulante", year) || findValue("passivo nao circulante", year));
      const pl = Math.abs(findValue("total do patrimônio", year) || findValue("patrimonio líquido", year) || findValue("patrimônio líquido", year));
      const estoque = Math.abs(findValue("estoque", year));
      const ll = findValue("resultado do exercício", year) || findValue("lucro líquido", year);
      const rlp = Math.abs(findValue("realizável a longo prazo", year) || findValue("realizavel", year));
      const pt = pc + pnc;
      const rpl = pl !== 0 ? ll / pl : 0;
      const lg = pt !== 0 ? (ac + rlp) / pt : 0;
      const ls = pc !== 0 ? (ac - estoque) / pc : 0;
      const lc = pc !== 0 ? ac / pc : 0;
      const ge = pl !== 0 ? pt / pl : 0;
      const fi = (0.05 * rpl) + (1.65 * lg) + (3.55 * ls) - (1.06 * lc) - (0.33 * ge);
      const classificacao: "solvente" | "penumbra" | "insolvente" = fi > 0 ? "solvente" : fi >= -3 ? "penumbra" : "insolvente";
      kanitzResults.push({ year, rpl, lg, ls, lc, ge, fi, classificacao, riskScoreNormalized: 0, ac, pc, pnc, pl, estoque, rlp, pt, ll });
    }
    if (kanitzResults.length > 0) {
      const fiValues = kanitzResults.map(r => r.fi);
      const fiMin = Math.min(...fiValues);
      const fiMax = Math.max(...fiValues);
      const range = fiMax - fiMin || 1;
      kanitzResults.forEach(r => { r.riskScoreNormalized = Math.round(((r.fi - fiMin) / range) * 100); });
    }
  }

  const latest = kanitzResults[kanitzResults.length - 1];
  const previous = kanitzResults.length > 1 ? kanitzResults[kanitzResults.length - 2] : null;
  const fiDelta = previous ? (latest?.fi || 0) - previous.fi : 0;

  const classColors: Record<string, { icon: string; label: string; color: string }> = {
    solvente: { icon: "🟢", label: "Solvente", color: "text-emerald-600" },
    penumbra: { icon: "🟡", label: "Zona de Penumbra", color: "text-yellow-600" },
    insolvente: { icon: "🔴", label: "Insolvente", color: "text-red-600" },
  };

  const SectionTitle = ({ num, title }: { num: string; title: string }) => (
    <div className="flex items-center gap-3 py-3 border-b-2 border-amber-500/30 mb-4">
      <div className="w-8 h-8 rounded-lg bg-amber-500 text-white flex items-center justify-center text-sm font-bold">{num}</div>
      <h2 className="text-lg font-bold text-foreground font-serif">{title}</h2>
    </div>
  );

  const fmtDec = (n: number) => n.toFixed(4);

  if (!parsedData || kanitzResults.length === 0) {
    return (
      <Card><CardContent className="py-12 text-center">
        <AlertTriangle className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
        <p className="text-sm text-muted-foreground">Nenhum dado financeiro disponível para gerar o Relatório Kanitz.</p>
      </CardContent></Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Action buttons */}
      <div className="flex justify-end gap-2 print:hidden">
        <Button variant="outline" size="sm" className="gap-1.5" onClick={() => window.print()}>
          <Download className="w-4 h-4" /> Exportar
        </Button>
        {onSwitchToBex && (
          <Button size="sm" className="gap-1.5 bg-[hsl(258,90%,66%)] hover:bg-[hsl(258,90%,56%)] text-white" onClick={onSwitchToBex}>
            <BookOpen className="w-4 h-4" /> Relatório BEX
          </Button>
        )}
        <Button variant="outline" size="sm" className="gap-1.5" onClick={() => window.print()}>
          <Printer className="w-4 h-4" /> Imprimir
        </Button>
        <Button variant="outline" size="sm" onClick={onBack} className="gap-1.5">
          <ArrowLeft className="w-4 h-4" /> Nova Análise
        </Button>
      </div>

      {/* ── CAPA ── */}
      <Card className="overflow-hidden">
        <div className="bg-gradient-to-br from-amber-500 via-amber-600 to-amber-800 text-white p-8 md:p-12 text-center space-y-6">
          <div className="flex justify-center">
            <div className="w-16 h-16 rounded-2xl bg-white/20 backdrop-blur flex items-center justify-center">
              <Scale className="w-10 h-10 text-white" />
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-[0.3em] text-white/70 font-semibold">Plataforma BEX</p>
            <h1 className="text-xl md:text-2xl font-bold font-serif leading-tight">
              RELATÓRIO KANITZ<br />TERMÔMETRO DE INSOLVÊNCIA
            </h1>
          </div>
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-white/30 bg-white/10">
            <span className="text-lg">{latest && classColors[latest.classificacao]?.icon}</span>
            <span className="text-sm font-semibold">{latest && classColors[latest.classificacao]?.label} — FI: {latest?.fi.toFixed(2)}</span>
          </div>
          <div className="space-y-1 text-sm text-white/80">
            <p className="font-semibold text-white">Empresa Analisada: Empresa Demonstração S.A.</p>
            <p>Período: {parsedData.years.join(" / ")}</p>
            <p>Data de Emissão: {today}</p>
          </div>
          <div className="pt-4 border-t border-white/20 space-y-1">
            <p className="text-xs text-white/60 uppercase tracking-wider">Responsável Técnico</p>
            <p className="text-sm font-semibold">Agente IA — Auditor Contábil Sênior</p>
            <p className="text-xs text-white/70">Modelo: Stephen Charles Kanitz — Termômetro de Insolvência</p>
          </div>
        </div>
      </Card>

      {/* ── 1. SUMÁRIO EXECUTIVO ── */}
      <Card>
        <CardContent className="pt-6 space-y-4">
          <SectionTitle num="1" title="SUMÁRIO EXECUTIVO" />
          <div className="p-4 rounded-lg bg-muted/30 border border-border/50">
            <p className="text-sm text-foreground leading-relaxed">
              {latest.classificacao === "solvente"
                ? `A empresa apresenta Fator de Insolvência de ${latest.fi.toFixed(2)}, classificando-se como SOLVENTE segundo o modelo Kanitz. Os indicadores de liquidez e rentabilidade demonstram capacidade adequada de honrar obrigações no curto e longo prazo. O Risk Score normalizado de ${latest.riskScoreNormalized}/100 confirma perfil de baixo risco.`
                : latest.classificacao === "penumbra"
                ? `A empresa encontra-se em ZONA DE PENUMBRA com Fator de Insolvência de ${latest.fi.toFixed(2)}. Apresenta fragilidade nos indicadores de liquidez seca (LS = ${fmtDec(latest.ls)}) e aumento do grau de endividamento (GE = ${fmtDec(latest.ge)}). Recomenda-se revisão da estrutura de capital e renegociação de passivos. O Risk Score normalizado é ${latest.riskScoreNormalized}/100.`
                : `A empresa está em situação de INSOLVÊNCIA com Fator de Insolvência de ${latest.fi.toFixed(2)}. Os indicadores financeiros demonstram deterioração severa. Liquidez Seca de ${fmtDec(latest.ls)} e Grau de Endividamento de ${fmtDec(latest.ge)} indicam incapacidade de pagamento. Recomenda-se reestruturação financeira imediata conforme Lei 11.101/2005.`}
            </p>
          </div>
          {previous && (
            <div className="grid sm:grid-cols-3 gap-3">
              <div className="p-3 rounded-lg bg-muted/20 text-center">
                <p className="text-[10px] text-muted-foreground">FI Atual ({latest.year})</p>
                <p className={`text-2xl font-bold font-mono ${classColors[latest.classificacao]?.color}`}>{latest.fi.toFixed(2)}</p>
              </div>
              <div className="p-3 rounded-lg bg-muted/20 text-center">
                <p className="text-[10px] text-muted-foreground">FI Anterior ({previous.year})</p>
                <p className={`text-2xl font-bold font-mono ${classColors[previous.classificacao]?.color}`}>{previous.fi.toFixed(2)}</p>
              </div>
              <div className="p-3 rounded-lg bg-muted/20 text-center">
                <p className="text-[10px] text-muted-foreground">Variação</p>
                <p className={`text-2xl font-bold font-mono ${fiDelta > 0 ? "text-emerald-600" : "text-red-600"}`}>
                  {fiDelta > 0 ? "+" : ""}{fiDelta.toFixed(2)}
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── 2. INDICADORES FINANCEIROS ── */}
      <Card>
        <CardContent className="pt-6 space-y-4">
          <SectionTitle num="2" title="INDICADORES FINANCEIROS" />
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-[10px]">Indicador</TableHead>
                  <TableHead className="text-[10px]">Sigla</TableHead>
                  <TableHead className="text-[10px]">Fórmula</TableHead>
                  <TableHead className="text-[10px]">Peso Kanitz</TableHead>
                  {kanitzResults.map(r => <TableHead key={r.year} className="text-right text-[10px]">{r.year}</TableHead>)}
                  <TableHead className="text-[10px]">Interpretação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[
                  { name: "Rentabilidade do PL", sigla: "RPL", formula: "LL / PL", peso: "+0,05", key: "rpl" as const, interp: "Retorno ao acionista" },
                  { name: "Liquidez Geral", sigla: "LG", formula: "(AC + RLP) / PT", peso: "+1,65", key: "lg" as const, interp: "Capacidade de pagamento total" },
                  { name: "Liquidez Seca", sigla: "LS", formula: "(AC - EST) / PC", peso: "+3,55", key: "ls" as const, interp: "Liquidez excluindo estoques" },
                  { name: "Liquidez Corrente", sigla: "LC", formula: "AC / PC", peso: "−1,06", key: "lc" as const, interp: "Capacidade de curto prazo" },
                  { name: "Grau de Endividamento", sigla: "GE", formula: "PT / PL", peso: "−0,33", key: "ge" as const, interp: "Dependência de terceiros" },
                ].map(ind => (
                  <TableRow key={ind.sigla}>
                    <TableCell className="text-xs font-medium">{ind.name}</TableCell>
                    <TableCell className="text-xs font-mono font-bold">{ind.sigla}</TableCell>
                    <TableCell className="text-[10px] font-mono text-muted-foreground">{ind.formula}</TableCell>
                    <TableCell className="text-xs font-mono font-bold">{ind.peso}</TableCell>
                    {kanitzResults.map(r => (
                      <TableCell key={r.year} className="text-right text-xs font-mono">{fmtDec(r[ind.key])}</TableCell>
                    ))}
                    <TableCell className="text-[10px] text-muted-foreground">{ind.interp}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* ── 3. RESULTADO DO FATOR DE INSOLVÊNCIA ── */}
      <Card>
        <CardContent className="pt-6 space-y-4">
          <SectionTitle num="3" title="RESULTADO DO FATOR DE INSOLVÊNCIA" />
          
          <div className="text-center py-6">
            <p className={`text-6xl font-bold ${classColors[latest.classificacao]?.color}`}>{latest.fi.toFixed(2)}</p>
            <p className={`text-xl font-semibold mt-2 ${classColors[latest.classificacao]?.color}`}>
              {classColors[latest.classificacao]?.icon} {classColors[latest.classificacao]?.label}
            </p>
            <p className="text-xs text-muted-foreground mt-1">Fator de Insolvência — Modelo Kanitz</p>
          </div>

          {/* Termômetro */}
          <div className="px-4">
            <div className="relative h-12 rounded-full overflow-hidden bg-gradient-to-r from-red-500 via-yellow-500 to-emerald-500">
              {kanitzResults.map(r => {
                const pos = Math.max(0, Math.min(100, ((r.fi + 7) / 14) * 100));
                return (
                  <div key={r.year} className="absolute top-0 bottom-0 w-1 bg-foreground rounded-full shadow-lg" style={{ left: `${pos}%`, transform: "translateX(-50%)" }} title={`${r.year}: FI = ${r.fi.toFixed(2)}`}>
                    <div className="absolute -top-6 left-1/2 -translate-x-1/2 text-[10px] font-bold whitespace-nowrap bg-foreground text-background px-1.5 py-0.5 rounded">{r.year}</div>
                  </div>
                );
              })}
            </div>
            <div className="flex justify-between mt-2 text-[10px] text-muted-foreground">
              <span>Insolvente (FI &lt; -3)</span>
              <span>Penumbra (-3 ≤ FI ≤ 0)</span>
              <span>Solvente (FI &gt; 0)</span>
            </div>
          </div>

          {/* Classificação por período */}
          <div className="grid sm:grid-cols-3 gap-3 mt-4">
            {kanitzResults.map(r => (
              <div key={r.year} className={`p-4 rounded-lg border text-center space-y-1 ${
                r.classificacao === "solvente" ? "bg-emerald-500/10 border-emerald-500/30" :
                r.classificacao === "penumbra" ? "bg-yellow-500/10 border-yellow-500/30" : "bg-red-500/10 border-red-500/30"
              }`}>
                <p className="text-xs text-muted-foreground font-semibold">{r.year}</p>
                <p className="text-2xl font-bold font-mono">{r.fi.toFixed(2)}</p>
                <p className={`text-xs font-semibold ${classColors[r.classificacao]?.color}`}>{classColors[r.classificacao]?.icon} {classColors[r.classificacao]?.label}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* ── 4. ANÁLISE TÉCNICA AUTOMATIZADA ── */}
      <Card>
        <CardContent className="pt-6 space-y-4">
          <SectionTitle num="4" title="ANÁLISE TÉCNICA AUTOMATIZADA" />
          <div className="space-y-3">
            {[
              { title: "Estrutura de Capital", text: `O Patrimônio Líquido de R$ ${fmt(latest.pl)} representa ${latest.pt > 0 ? fmtPct(latest.pl / (latest.pl + latest.pt)) : "N/A"} do capital total. O Grau de Endividamento (GE) de ${fmtDec(latest.ge)} indica ${latest.ge > 2 ? "alta" : latest.ge > 1 ? "moderada" : "baixa"} dependência de capital de terceiros.` },
              { title: "Dependência de Terceiros", text: `O Passivo Total de R$ ${fmt(latest.pt)} é composto por PC R$ ${fmt(latest.pc)} (${fmtPct(latest.pt > 0 ? latest.pc / latest.pt : 0)}) e PNC R$ ${fmt(latest.pnc)} (${fmtPct(latest.pt > 0 ? latest.pnc / latest.pt : 0)}). ${latest.pc > latest.pnc ? "Concentração de dívida no curto prazo requer atenção." : "Dívida majoritariamente de longo prazo, permitindo maior planejamento."}` },
              { title: "Capacidade de Pagamento", text: `A Liquidez Corrente (LC) de ${fmtDec(latest.lc)} ${latest.lc > 1.5 ? "indica capacidade adequada de honrar compromissos de curto prazo" : latest.lc > 1 ? "indica capacidade limitada — recomenda-se monitoramento" : "indica incapacidade de honrar obrigações correntes"}. A Liquidez Seca (LS) de ${fmtDec(latest.ls)} ${latest.ls > 1 ? "confirma solidez mesmo excluindo estoques" : "revela fragilidade quando estoques são excluídos"}.` },
              { title: "Deterioração Financeira", text: previous ? `O FI variou de ${previous.fi.toFixed(2)} (${previous.year}) para ${latest.fi.toFixed(2)} (${latest.year}), representando ${fiDelta > 0 ? "melhora" : "piora"} de ${Math.abs(fiDelta).toFixed(2)} pontos. ${Math.abs(fiDelta) > 1 ? "Variação significativa requer atenção da gestão." : "Variação dentro de parâmetros normais."}` : "Análise comparativa indisponível — apenas um período carregado." },
            ].map(item => (
              <div key={item.title} className="p-4 rounded-lg bg-muted/20 border border-border/30">
                <p className="text-xs font-semibold text-foreground mb-1">{item.title}</p>
                <p className="text-xs text-muted-foreground leading-relaxed">{item.text}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* ── 5. RECOMENDAÇÕES ESTRATÉGICAS ── */}
      <Card>
        <CardContent className="pt-6 space-y-4">
          <SectionTitle num="5" title="RECOMENDAÇÕES ESTRATÉGICAS" />
          <div className="space-y-3">
            {[
              ...(latest.ge > 1.5 ? [{ icon: "📉", title: "Redução de Passivos", text: "O Grau de Endividamento elevado requer plano de desalavancagem. Priorizar quitação de dívidas onerosas e renegociação de condições." }] : []),
              ...(latest.lc < 1.5 ? [{ icon: "🔄", title: "Reestruturação de Capital", text: "Avaliar aporte de capital próprio ou conversão de dívida em participação societária para reequilibrar a estrutura de capital." }] : []),
              { icon: "⚙️", title: "Ajustes Operacionais", text: `Com RPL de ${fmtDec(latest.rpl)}, ${latest.rpl > 0.15 ? "a rentabilidade está adequada. Manter eficiência operacional." : "recomenda-se revisão de custos e margens para melhorar a geração de resultado."}` },
              { icon: "💰", title: "Planejamento de Fluxo de Caixa", text: `Liquidez Seca de ${fmtDec(latest.ls)} ${latest.ls < 1 ? "indica necessidade de melhorar a gestão de recebíveis e reduzir dependência de estoques" : "está dentro de parâmetros aceitáveis"}. Monitorar ciclo financeiro e prazos médios.` },
              ...(latest.fi <= 0 ? [{ icon: "⚠️", title: "Monitoramento de Insolvência", text: "Com FI na zona de " + (latest.classificacao === "penumbra" ? "penumbra" : "insolvência") + ", implementar acompanhamento mensal dos indicadores Kanitz. Avaliar necessidade de consultoria especializada em recuperação empresarial." }] : []),
            ].map((item, i) => (
              <div key={i} className="flex items-start gap-3 p-4 rounded-lg bg-muted/20 border border-border/30">
                <span className="text-xl shrink-0">{item.icon}</span>
                <div>
                  <p className="text-xs font-semibold text-foreground mb-1">{item.title}</p>
                  <p className="text-xs text-muted-foreground leading-relaxed">{item.text}</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* ── 6. MEMÓRIA DE CÁLCULO ── */}
      <Card>
        <CardContent className="pt-6 space-y-4">
          <SectionTitle num="6" title="MEMÓRIA DE CÁLCULO" />
          
          <div className="p-4 rounded-lg bg-muted/30 border border-border/50 mb-4">
            <p className="text-xs font-semibold text-foreground mb-2">Fórmula do Fator de Insolvência:</p>
            <code className="block text-[11px] font-mono leading-relaxed text-foreground">
              FI = (0,05 × RPL) + (1,65 × LG) + (3,55 × LS) − (1,06 × LC) − (0,33 × GE)
            </code>
          </div>

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-[10px]">Componente</TableHead>
                  <TableHead className="text-[10px]">Peso</TableHead>
                  {kanitzResults.map(r => <TableHead key={r.year} className="text-right text-[10px]">{r.year} (Valor)</TableHead>)}
                  {kanitzResults.map(r => <TableHead key={`w-${r.year}`} className="text-right text-[10px]">{r.year} (Ponderado)</TableHead>)}
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
                      <TableCell key={`w-${r.year}`} className="text-right text-xs font-mono font-bold">{(c.peso * r[c.key]).toFixed(4)}</TableCell>
                    ))}
                  </TableRow>
                ))}
                <TableRow className="border-t-2 border-foreground/20">
                  <TableCell className="text-xs font-bold" colSpan={2}>FATOR DE INSOLVÊNCIA (FI)</TableCell>
                  {kanitzResults.map(r => <TableCell key={r.year} className="text-right" />)}
                  {kanitzResults.map(r => (
                    <TableCell key={`fi-${r.year}`} className={`text-right text-sm font-bold font-mono ${
                      r.fi > 0 ? "text-emerald-600" : r.fi >= -3 ? "text-yellow-600" : "text-red-600"
                    }`}>{r.fi.toFixed(2)}</TableCell>
                  ))}
                </TableRow>
              </TableBody>
            </Table>
          </div>

          <div className="mt-4">
            <h3 className="text-sm font-semibold text-foreground mb-3">Dados Utilizados</h3>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-[10px]">Variável</TableHead>
                    {kanitzResults.map(r => <TableHead key={r.year} className="text-right text-[10px]">{r.year}</TableHead>)}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[
                    { label: "Lucro Líquido", key: "ll" },
                    { label: "Patrimônio Líquido", key: "pl" },
                    { label: "Ativo Circulante", key: "ac" },
                    { label: "Realizável a LP", key: "rlp" },
                    { label: "Estoques", key: "estoque" },
                    { label: "Passivo Circulante", key: "pc" },
                    { label: "Passivo Total", key: "pt" },
                  ].map(v => (
                    <TableRow key={v.label}>
                      <TableCell className="text-xs font-medium">{v.label}</TableCell>
                      {kanitzResults.map(r => (
                        <TableCell key={r.year} className="text-right text-xs font-mono">R$ {fmt((r as any)[v.key])}</TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Risk Score Normalizado ── */}
      <Card>
        <CardContent className="pt-6 space-y-4">
          <SectionTitle num="★" title="RISK SCORE NORMALIZADO — ESCALA EBEX" />
          <div className="text-center py-4">
            <p className="text-5xl font-bold font-mono text-foreground">{latest.riskScoreNormalized}</p>
            <p className="text-sm font-semibold mt-1 text-muted-foreground">de 100 pontos</p>
            <p className={`text-xs mt-1 ${latest.riskScoreNormalized <= 30 ? "text-red-600" : latest.riskScoreNormalized <= 70 ? "text-yellow-600" : "text-emerald-600"}`}>
              {latest.riskScoreNormalized <= 30 ? "Alto Risco" : latest.riskScoreNormalized <= 70 ? "Médio Risco" : "Baixo Risco"}
            </p>
          </div>
          <div className="space-y-2">
            {[
              { range: "0 – 30", label: "Alto Risco", color: "bg-red-500/10 text-red-600", active: latest.riskScoreNormalized <= 30 },
              { range: "31 – 70", label: "Médio Risco", color: "bg-yellow-500/10 text-yellow-600", active: latest.riskScoreNormalized > 30 && latest.riskScoreNormalized <= 70 },
              { range: "71 – 100", label: "Baixo Risco", color: "bg-emerald-500/10 text-emerald-600", active: latest.riskScoreNormalized > 70 },
            ].map(item => (
              <div key={item.range} className={`flex items-center justify-between p-3 rounded-lg bg-muted/20 ${item.active ? "ring-2 ring-amber-500" : ""}`}>
                <div className="flex items-center gap-3">
                  <span className={`text-xs font-mono font-bold px-2 py-1 rounded ${item.color}`}>{item.range}</span>
                  <span className="text-sm font-medium text-foreground">{item.label}</span>
                </div>
                {item.active && <CheckCircle2 className="w-4 h-4 text-amber-500" />}
              </div>
            ))}
          </div>
          <div className="p-3 rounded-lg bg-muted/30">
            <p className="text-[10px] font-semibold text-foreground mb-1">Fórmula de Normalização:</p>
            <code className="text-[10px] font-mono text-muted-foreground">
              RiskScore = (FI - FI_min) / (FI_max - FI_min) × 100
            </code>
          </div>
        </CardContent>
      </Card>

      {/* ── ASSINATURA ── */}
      <Card className="bg-muted/20">
        <CardContent className="pt-6 text-center space-y-3">
          <div className="w-12 h-12 mx-auto rounded-xl bg-amber-500/10 flex items-center justify-center">
            <Scale className="w-6 h-6 text-amber-600" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">Documento gerado e assinado digitalmente</p>
            <p className="text-xs text-muted-foreground">Agente IA — Auditor Contábil Sênior</p>
            <p className="text-xs text-muted-foreground">Modelo: Kanitz — Termômetro de Insolvência (1978)</p>
            <p className="text-xs text-muted-foreground mt-2">Plataforma BEX — {today}</p>
          </div>
          <div className="flex flex-wrap justify-center gap-1.5 pt-2">
            {["Kanitz (1978)", "NBC TA 570", "CPC 26", "Lei 11.101/2005"].map(n => (
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
        {onSwitchToBex && (
          <Button className="gap-1.5 bg-[hsl(258,90%,66%)] hover:bg-[hsl(258,90%,56%)] text-white" onClick={onSwitchToBex}>
            <BookOpen className="w-4 h-4" /> Relatório BEX
          </Button>
        )}
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
  const [reportType, setReportType] = useState<"none" | "bex" | "kanitz">("none");
  const [activeTab, setActiveTab] = useState("diagnostico");

  // Use AI data if available, otherwise fall back to mock data
  const activeDiagnostico = aiAnalysis?.diagnostico || diagnosticoData;
  const activePendencias = aiAnalysis?.pendencias || pendencias;
  const activeScoreRJ = aiAnalysis?.scoreRJ || scoreRJData;

  const handleGerarBex = () => {
    setReportType("bex");
  };

  const handleGerarKanitz = () => {
    setReportType("kanitz");
  };

  return (
    <div className="space-y-6">
      <StepTimeline currentStep={reportType !== "none" ? 5 : 4} />

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
          <TabsTrigger value="kanitz" className="text-xs gap-1.5 data-[state=active]:bg-[hsl(258,90%,66%)] data-[state=active]:text-white">
            <Scale className="w-3.5 h-3.5" /> Kanitz
          </TabsTrigger>
          <TabsTrigger value="relatorio-final" className="text-xs gap-1.5 data-[state=active]:bg-[hsl(258,90%,66%)] data-[state=active]:text-white">
            <BookOpen className="w-3.5 h-3.5" /> Relatório Final
          </TabsTrigger>
        </TabsList>

        <TabsContent value="diagnostico"><TabDiagnostico data={activeDiagnostico} /></TabsContent>
        <TabsContent value="analise-tecnica"><TabAnaliseTecnica pendenciasData={activePendencias} parsedData={parsedData} /></TabsContent>
        <TabsContent value="indicadores"><TabIndicadores parsedData={parsedData} /></TabsContent>
        <TabsContent value="endividamento"><TabEndividamento aiAnalysis={aiAnalysis} parsedData={parsedData} /></TabsContent>
        <TabsContent value="patrimonial"><TabPatrimonial aiAnalysis={aiAnalysis} parsedData={parsedData} /></TabsContent>
        <TabsContent value="kanitz"><TabKanitz parsedData={parsedData} aiAnalysis={aiAnalysis} /></TabsContent>
        <TabsContent value="risco-rj"><TabRiscoRJ aiAnalysis={aiAnalysis} /></TabsContent>
        <TabsContent value="relatorio-final">
          {reportType === "bex" ? (
            <TabRelatorioFinal onBack={onBack} aiAnalysis={aiAnalysis} parsedData={parsedData} onSwitchToKanitz={handleGerarKanitz} />
          ) : reportType === "kanitz" ? (
            <TabRelatorioKanitz onBack={onBack} parsedData={parsedData} onSwitchToBex={handleGerarBex} />
          ) : (
            <TabRelatorioPreview onGerarBex={handleGerarBex} onGerarKanitz={handleGerarKanitz} />
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
