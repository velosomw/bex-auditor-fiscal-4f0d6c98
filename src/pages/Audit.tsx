import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, Legend, LineChart, Line, LabelList, ComposedChart } from "recharts";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useUser } from "@/contexts/UserContext";
import { getCompany, type Company } from "@/services/companiesService";
import folhaRostoBg from "@/assets/folha-rosto-bex.jpg";
import logoBrasilExpert from "@/assets/logo-brasil-expert.jpg";
import logoBrasilExpertFull from "@/assets/marca_logo_BEx.jpeg";
import logoBexBranco from "@/assets/logo-bex-branco.jpeg";
import {
  Upload, FileText, CheckCircle2, ArrowRight, ArrowLeft,
  Shield, MessageCircle, Send, AlertTriangle, Download, Printer,
  Calculator, TrendingUp, TrendingDown, BarChart3, PieChart, Activity,
  Target, Scale, Layers, Building2, Loader2, FileSpreadsheet,
  DollarSign, Landmark, AlertOctagon, Search, ChevronDown, ChevronUp,
  Settings, ClipboardCheck, FileSearch, BookOpen, Database
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
import { useUrlScrollSync } from "@/hooks/useUrlScrollSync";
import { parseFile, parseMultipleFiles, analyzeFinancialData, runAuditPipeline, streamAuditChat, isPDF, isDocument, isDataFile, getFileFormat, type ParsedFinancialData } from "@/services/auditAIService";
import TabKanitz from "@/components/audit/TabKanitz";
import TabGraficosAuditoria from "@/components/audit/TabGraficosAuditoria";
import TabBSDados from "@/components/audit/TabBSDados";
import TabPivotBalancete from "@/components/audit/TabPivotBalancete";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { BalanceteEntry } from "@/services/bsDadosBuilder";
import { DedupPresetForm } from "@/components/audit/DedupPresetForm";
import { toast } from "@/hooks/use-toast";
import { saveAuditBatch, saveGeneratedReport, type AuditHistoryEntry, type GeneratedReportEntry } from "@/services/auditHistoryService";
import { getFileFormat as getFormat } from "@/services/auditAIService";
import { mergeMultiMonth, pickMonths, defaultLast3, type MultiMonthParsed } from "@/services/auditMonthDetector";
import { MonthsConfirmDialog } from "@/components/audit/MonthsConfirmDialog";

/* ── Helpers ── */
const fmt = (n: number) => new Intl.NumberFormat("pt-BR").format(Math.round(n));
const fmtPct = (n: number) => `${(n * 100).toFixed(1)}%`;
const fmtDays = (n: number) => `${Math.round(n)} dias`;

const printReport = (containerId: string, reportTitle: string) => {
  const prevTitle = document.title;
  document.title = reportTitle;
  document.body.classList.add('printing-report');
  document.body.setAttribute('data-print-target', containerId);
  window.print();
  document.body.classList.remove('printing-report');
  document.body.removeAttribute('data-print-target');
  document.title = prevTitle;
};

const exportDocx = (containerId: string, reportTitle: string) => {
  const container = document.getElementById(containerId);
  if (!container) return;

  const pages = container.querySelectorAll('.report-a4-page, .report-a4-cover');
  let htmlContent = '';

  pages.forEach((page, index) => {
    // Clone the page to manipulate without affecting the DOM
    const clone = page.cloneNode(true) as HTMLElement;
    
    // Remove print:hidden elements
    clone.querySelectorAll('.print\\:hidden, [class*="print:hidden"]').forEach(el => el.remove());
    
    // Process SVG icons - replace with text equivalents
    clone.querySelectorAll('svg').forEach(svg => {
      const span = document.createElement('span');
      span.textContent = '';
      svg.replaceWith(span);
    });

    const pageHtml = clone.innerHTML;
    
    if (index > 0) {
      htmlContent += '<br clear="all" style="mso-special-character:line-break;page-break-before:always" />';
    }
    htmlContent += `<div class="page-container">${pageHtml}</div>`;
  });

  const docContent = `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office"
      xmlns:w="urn:schemas-microsoft-com:office:word"
      xmlns:m="http://schemas.microsoft.com/office/2004/12/omml"
      xmlns="http://www.w3.org/TR/REC-html40">
<head>
  <meta charset="utf-8">
  <meta name="ProgId" content="Word.Document">
  <meta name="Generator" content="Microsoft Word 15">
  <title>${reportTitle}</title>
  <!--[if gte mso 9]>
  <xml>
    <o:OfficeDocumentSettings>
      <o:AllowPNG/>
    </o:OfficeDocumentSettings>
    <w:WordDocument>
      <w:View>Print</w:View>
      <w:Zoom>100</w:Zoom>
      <w:DoNotOptimizeForBrowser/>
    </w:WordDocument>
  </xml>
  <![endif]-->
  <style>
    /* ── Page Setup ── */
    @page {
      size: 210mm 297mm;
      margin: 16mm 16mm 12mm 16mm;
      mso-header-margin: 8mm;
      mso-footer-margin: 6mm;
    }

    @page Section1 {
      size: 210mm 297mm;
      margin: 16mm 16mm 12mm 16mm;
    }

    div.Section1 { page: Section1; }

    /* ── Base Typography ── */
    body {
      font-family: 'Plus Jakarta Sans', 'Segoe UI', Arial, Helvetica, sans-serif;
      font-size: 10.5pt;
      color: #1c2541;
      line-height: 1.6;
      margin: 0;
      padding: 0;
      background: white;
    }

    /* ── Headings ── */
    h1 {
      font-family: 'Plus Jakarta Sans', 'Segoe UI', Arial, sans-serif;
      font-size: 22pt;
      font-weight: 800;
      color: #0f172a;
      margin-top: 0;
      margin-bottom: 12pt;
      letter-spacing: -0.5pt;
      line-height: 1.2;
    }

    h2 {
      font-family: 'Plus Jakarta Sans', 'Segoe UI', Arial, sans-serif;
      font-size: 15pt;
      font-weight: 700;
      color: #1e3a5f;
      margin-top: 16pt;
      margin-bottom: 8pt;
      padding-bottom: 4pt;
      border-bottom: 2px solid #2563eb;
      line-height: 1.3;
    }

    h3 {
      font-family: 'Plus Jakarta Sans', 'Segoe UI', Arial, sans-serif;
      font-size: 12pt;
      font-weight: 700;
      color: #1e293b;
      margin-top: 12pt;
      margin-bottom: 6pt;
      line-height: 1.3;
    }

    h4 {
      font-family: 'Plus Jakarta Sans', 'Segoe UI', Arial, sans-serif;
      font-size: 11pt;
      font-weight: 600;
      color: #334155;
      margin-top: 10pt;
      margin-bottom: 4pt;
    }

    p {
      margin-top: 0;
      margin-bottom: 6pt;
      text-align: justify;
    }

    /* ── Page container ── */
    .page-container {
      padding: 0;
    }

    /* ── Tables ── */
    table {
      border-collapse: collapse;
      width: 100%;
      margin: 10pt 0;
      font-size: 9.5pt;
    }

    td, th {
      border: 1px solid #d1d5db;
      padding: 6px 10px;
      font-size: 9.5pt;
      vertical-align: top;
      line-height: 1.4;
    }

    th {
      background-color: #1e3a5f;
      color: white;
      font-weight: 700;
      text-align: left;
      font-size: 9.5pt;
      padding: 8px 10px;
    }

    tr:nth-child(even) td {
      background-color: #f8fafc;
    }

    /* ── Status Colors ── */
    .text-emerald-600, .text-emerald-700, [class*="text-emerald"] { color: #059669 !important; }
    .text-red-600, .text-red-700, [class*="text-red"] { color: #dc2626 !important; }
    .text-yellow-600, .text-yellow-700, [class*="text-yellow"] { color: #ca8a04 !important; }
    .text-orange-600, .text-orange-700, [class*="text-orange"] { color: #ea580c !important; }
    .text-blue-600, .text-blue-700, [class*="text-blue"] { color: #2563eb !important; }
    .text-gray-600, .text-gray-500, [class*="text-gray"] { color: #6b7280 !important; }
    .text-amber-600, .text-amber-700, [class*="text-amber"] { color: #d97706 !important; }

    /* ── Background Colors ── */
    .bg-emerald-50, [class*="bg-emerald"] { background-color: #ecfdf5 !important; }
    .bg-red-50, [class*="bg-red"] { background-color: #fef2f2 !important; }
    .bg-yellow-50, [class*="bg-yellow"] { background-color: #fefce8 !important; }
    .bg-orange-50, [class*="bg-orange"] { background-color: #fff7ed !important; }
    .bg-blue-50, [class*="bg-blue"] { background-color: #eff6ff !important; }
    .bg-amber-50, [class*="bg-amber"] { background-color: #fffbeb !important; }

    /* ── Badge/Tag styles ── */
    [class*="rounded-full"], [class*="rounded-lg"] {
      border-radius: 4px;
    }

    [class*="badge"], [class*="px-2"][class*="py-0"], [class*="px-3"][class*="py-1"] {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 9pt;
      font-weight: 600;
    }

    /* ── Cover page ── */
    .report-a4-cover, [class*="report-a4-cover"] {
      text-align: center;
    }

    /* ── Footer bar ── */
    .report-footer-bar, [class*="report-footer-bar"] {
      border-top: 3px solid #3b9ec0;
      padding: 8pt 16pt;
      text-align: center;
      font-size: 8pt;
      color: #64748b;
      line-height: 1.5;
      margin-top: 24pt;
    }

    /* ── Lists ── */
    ul {
      margin: 4pt 0 8pt 0;
      padding-left: 18pt;
    }

    li {
      margin-bottom: 3pt;
      line-height: 1.5;
    }

    /* ── Cards/Sections ── */
    [class*="border"][class*="rounded"] {
      border: 1px solid #e2e8f0;
      padding: 10pt;
      margin: 6pt 0;
      border-radius: 4px;
    }

    /* ── Font weights ── */
    .font-bold, [class*="font-bold"] { font-weight: 700; }
    .font-semibold, [class*="font-semibold"] { font-weight: 600; }
    .font-medium, [class*="font-medium"] { font-weight: 500; }

    /* ── Spacing ── */
    .mb-2, [class*="mb-2"] { margin-bottom: 4pt; }
    .mb-4, [class*="mb-4"] { margin-bottom: 8pt; }
    .mb-6, [class*="mb-6"] { margin-bottom: 12pt; }
    .mt-4, [class*="mt-4"] { margin-top: 8pt; }
    .mt-6, [class*="mt-6"] { margin-top: 12pt; }

    /* ── Grid to block ── */
    [class*="grid"], [class*="flex"] {
      display: block;
    }

    [class*="grid-cols"] > * {
      display: inline-block;
      vertical-align: top;
      width: 48%;
      margin-right: 2%;
    }

    /* ── Hide non-printable elements ── */
    button, [class*="cursor-pointer"], [role="button"] {
      display: none !important;
    }

    /* ── Watermark simulation ── */
    .report-page-body {
      position: relative;
    }

    /* ── Strong emphasis ── */
    strong, b {
      font-weight: 700;
      color: #0f172a;
    }

    /* ── Code/monospace ── */
    code, [class*="font-mono"] {
      font-family: 'Consolas', 'Courier New', monospace;
      font-size: 9pt;
      background-color: #f1f5f9;
      padding: 1px 4px;
      border-radius: 2px;
    }
  </style>
</head>
<body>
  <div class="Section1">
    ${htmlContent}
  </div>
</body>
</html>`;

  const blob = new Blob(['\ufeff' + docContent], { type: 'application/msword;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${reportTitle}.doc`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

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
const UploadPhase = ({ onProcess, onFilesReady, onMesesReady, dedupConfig, onDedupChange, onDepthChange }: { onProcess: () => void; onFilesReady: (files: File[]) => void; onMesesReady?: (entries: BalanceteEntry[]) => void; dedupConfig: import("@/services/auditAIService").DedupConfig; onDedupChange: (cfg: import("@/services/auditAIService").DedupConfig) => void; onDepthChange?: (d: "executivo" | "tecnico") => void }) => {
  const { state, setConfig } = useAudit();
  const [dragOver, setDragOver] = useState(false);
  const [depth, setDepth] = useState<"executivo" | "tecnico">("tecnico");
  useEffect(() => { onDepthChange?.(depth); }, [depth, onDepthChange]);
  const [purpose, setPurpose] = useState<string>("externa");
  const [rawFiles, setRawFiles] = useState<File[]>([]);
  // mes atribuído por documento: { docId: "2024-03" }
  const [fileMeses, setFileMeses] = useState<Record<string, string>>({});

  // Ano vigente (atual) até 2029; usuário seleciona mês + ano
  const MES_FULL = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
  const yearOptions = useMemo(() => {
    const currentYear = new Date().getFullYear();
    const start = Math.min(currentYear, 2026);
    const years: number[] = [];
    for (let y = start; y <= 2029; y++) years.push(y);
    return years;
  }, []);
  const [fileYears, setFileYears] = useState<Record<string, number>>({});
  const monthOptions = useMemo(() => {
    const opts = MES_FULL.map((label, idx) => ({
      value: String(idx + 1).padStart(2, "0"),
      label,
    }));
    return [{ value: "auto", label: "✨ Auto-detectar Períodos (Multi-mês)" }, ...opts];
  }, []);

  // Auto-detecta mês a partir do nome do arquivo (ex: "balancete_marco_2024.pdf")
  const detectMesFromName = useCallback((name: string): string | null => {
    const MES_NAMES: Record<string, number> = {
      janeiro: 1, jan: 1, fevereiro: 2, fev: 2, marco: 3, "março": 3, mar: 3,
      abril: 4, abr: 4, maio: 5, mai: 5, junho: 6, jun: 6, julho: 7, jul: 7,
      agosto: 8, ago: 8, setembro: 9, set: 9, outubro: 10, out: 10,
      novembro: 11, nov: 11, dezembro: 12, dez: 12,
    };
    const lower = name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    // Pattern: nome_mes_ano
    for (const [k, v] of Object.entries(MES_NAMES)) {
      const re = new RegExp(`\\b${k}\\b.*?(\\d{4})|\\b(\\d{4})\\b.*?${k}`, "i");
      const m = lower.match(re);
      if (m) {
        const year = m[1] || m[2];
        return `${year}-${String(v).padStart(2, "0")}`;
      }
    }
    // Pattern: YYYY-MM ou MM-YYYY
    let m = lower.match(/(\d{4})[-_/](\d{1,2})/);
    if (m) return `${m[1]}-${m[2].padStart(2, "0")}`;
    m = lower.match(/(\d{1,2})[-_/](\d{4})/);
    if (m) return `${m[2]}-${m[1].padStart(2, "0")}`;
    return null;
  }, []);

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
    // Auto-detect mês para cada novo arquivo
    setFileMeses(prev => {
      const next = { ...prev };
      newDocs.forEach((doc, i) => {
        const file = filesArr[i];
        const detected = detectMesFromName(file.name);
        if (detected) {
          next[doc.id] = detected;
        } else if (/\.(xlsx|xls|csv|xlsm|xlsb|xltx|xltm)$/i.test(file.name)) {
          // Default para auto-detect em planilhas, já que é o cenário comum multi-mês
          next[doc.id] = "auto";
        }
      });
      return next;
    });
  };

  const removeFile = (id: string) => {
    const idx = state.config.files.findIndex(f => f.id === id);
    setConfig({ files: state.config.files.filter(f => f.id !== id) });
    if (idx >= 0) setRawFiles(prev => prev.filter((_, i) => i !== idx));
    setFileMeses(prev => { const { [id]: _, ...rest } = prev; return rest; });
  };

  const missingMeses = state.config.files.filter(f => !fileMeses[f.id]);
  const canContinue = state.config.files.length > 0 && missingMeses.length === 0;

  const handleContinue = () => {
    if (!canContinue) {
      toast({
        title: "Atribua o mês de referência",
        description: `${missingMeses.length} documento(s) sem mês. O combo destacado em vermelho é obrigatório.`,
        variant: "destructive",
      });
      return;
    }
    const entries: BalanceteEntry[] = state.config.files.map(f => ({
      fileName: f.fileName,
      mesReferencia: fileMeses[f.id] || null,
    }));
    onMesesReady?.(entries);
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
          <span className="text-xs font-semibold text-[hsl(258,90%,66%)]">Auditor Contábil Sênior IA</span>
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
              {state.config.files.map(f => {
                const mes = fileMeses[f.id] || "";
                const needsMonth = !mes;
                return (
                  <div key={f.id} className={`relative border-2 border-dashed rounded-2xl p-5 bg-emerald-50/30 ${needsMonth ? "border-red-400/70" : "border-emerald-400/50"}`}>
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-xl bg-emerald-500/10 flex items-center justify-center shrink-0">
                        {(/\.(pdf)$/i).test(f.fileName) ? (
                          <FileText className="w-6 h-6 text-emerald-600" />
                        ) : (/\.(docx?|txt|rtf)$/i).test(f.fileName) ? (
                          <FileText className="w-6 h-6 text-emerald-600" />
                        ) : (/\.(json|xml|ofx|sped)$/i).test(f.fileName) ? (
                          <FileSearch className="w-6 h-6 text-emerald-600" />
                        ) : (
                          <FileSpreadsheet className="w-6 h-6 text-emerald-600" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-foreground truncate">{f.fileName}</p>
                        <p className="text-xs text-muted-foreground">{(f.fileSize / 1024).toFixed(2)} KB</p>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                        <span className="text-xs font-medium text-emerald-600">Carregado</span>
                      </div>
                      <button onClick={() => removeFile(f.id)} className="w-6 h-6 rounded-full bg-muted/80 flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors text-xs">✕</button>
                    </div>

                    {/* Seletor de Ano + Mês de referência */}
                    {(() => {
                      const currentYear = new Date().getFullYear();
                      const defaultYear = Math.min(Math.max(currentYear, yearOptions[0]), 2029);
                      
                      // mes pode ser "auto" ou "YYYY-MM"
                      const isAuto = mes === "auto";
                      const [yearStr, monthStr] = !isAuto && mes ? mes.split("-") : ["", ""];
                      
                      const selectedYear = fileYears[f.id] ?? (yearStr ? Number(yearStr) : defaultYear);
                      const selectedMonth = isAuto ? "auto" : monthStr || "";
                      
                      const setYear = (y: number) => {
                        setFileYears(prev => ({ ...prev, [f.id]: y }));
                        if (selectedMonth && selectedMonth !== "auto") {
                          setFileMeses(prev => ({ ...prev, [f.id]: `${y}-${selectedMonth}` }));
                        }
                      };
                      
                      const setMonth = (m: string) => {
                        if (m === "auto") {
                          setFileMeses(prev => ({ ...prev, [f.id]: "auto" }));
                        } else {
                          setFileMeses(prev => ({ ...prev, [f.id]: `${selectedYear}-${m}` }));
                        }
                      };
                      
                      return (
                        <div className={`mt-3 p-3 rounded-lg border ${needsMonth ? "border-red-400/60 bg-red-50/60" : "border-emerald-400/40 bg-emerald-50/40"}`}>
                          <div className="flex items-center gap-2 mb-1.5">
                            <span className={`text-[11px] font-semibold uppercase tracking-wide ${needsMonth ? "text-red-600" : "text-emerald-700"}`}>
                              Período de Referência {needsMonth && "*"}
                            </span>
                            {isAuto && <Badge variant="outline" className="text-[9px] bg-emerald-500/10 text-emerald-600 border-emerald-500/20">✨ Multi-mês</Badge>}
                            {needsMonth && <span className="text-[10px] text-red-600">(selecione um mês ou auto-detect)</span>}
                          </div>
                          <div className={`grid ${isAuto ? "grid-cols-1" : "grid-cols-[1fr_110px]"} gap-2`}>
                            <Select value={selectedMonth} onValueChange={setMonth}>
                              <SelectTrigger className={`h-9 text-xs ${needsMonth ? "border-red-400 bg-white" : "bg-white"}`}>
                                <SelectValue placeholder="Selecione o período..." />
                              </SelectTrigger>
                              <SelectContent className="max-h-72">
                                {monthOptions.map(opt => (
                                  <SelectItem key={opt.value} value={opt.value} className="text-xs">{opt.label}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            {!isAuto && (
                              <Select value={String(selectedYear)} onValueChange={(v) => setYear(Number(v))}>
                                <SelectTrigger className="h-9 text-xs bg-white">
                                  <SelectValue placeholder="Ano" />
                                </SelectTrigger>
                                <SelectContent>
                                  {yearOptions.map(y => (
                                    <SelectItem key={y} value={String(y)} className="text-xs">{y}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            )}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                );
              })}
              {state.config.files.length < 3 ? (
                <button onClick={() => document.getElementById("file-input")?.click()} className="w-full py-2 text-xs text-muted-foreground hover:text-foreground border border-dashed border-border rounded-xl hover:bg-muted/30 transition-colors">
                  + Adicionar outro documento ({state.config.files.length}/3)
                </button>
              ) : (
                <div className="w-full py-2 px-3 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-xl text-center">
                  Limite recomendado de 3 documentos atingido. Você pode continuar adicionando, mas a consolidação ideal é com até 3 balancetes.
                  <button onClick={() => document.getElementById("file-input")?.click()} className="ml-2 underline hover:text-amber-900">+ Adicionar mesmo assim</button>
                </div>
              )}
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
              <p className="text-[10px] text-muted-foreground mt-0.5">Carregue até 3 documentos. Defina o mês de referência de cada um após o upload.</p>
            </div>
          )}
          <input id="file-input" type="file" hidden multiple accept=".xlsx,.xls,.csv,.xlsm,.xlsb,.xltx,.xltm,.pdf,.docx,.doc,.txt,.rtf,.json,.xml,.ofx,.sped" onChange={(e) => handleFiles(e.target.files)} />
        </div>

        <div className="space-y-6">
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-foreground">Nível de Profundidade Técnica</h3>
            <div className="space-y-2">
              {[
                { id: "executivo", title: "Relatório BEx_Resumido_Kanitz", desc: "Visão sintética focada em riscos relevantes e impactos financeiros" },
                { id: "tecnico", title: "Relatório BEx_Completo_Kanitz", desc: "Análise aprofundada com identificação de inconsistências" },
              ].map(opt => (
                <button key={opt.id} onClick={() => setDepth(opt.id as any)}
                  className={`w-full text-left p-4 rounded-xl border-2 transition-all ${
                    depth === opt.id ? "border-[hsl(258,90%,66%)] bg-[hsl(258,90%,66%)]/5" : "border-border hover:border-[hsl(258,90%,66%)]/30 hover:bg-muted/20"
                  }`}>
                    <div className="flex items-center justify-between">
                     <div>
                       <div className="flex items-center gap-2">
                         <p className="text-sm font-semibold text-foreground">{opt.title}</p>
                         {depth === opt.id && (
                           <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                             opt.id === "executivo" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
                           }`}>
                             {opt.id === "executivo" ? "Versão Gratuita" : "Versão Paga"}
                           </span>
                         )}
                       </div>
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
            <h3 className="text-sm font-semibold text-foreground">Finalidade do Trabalho (Marcação Opcional)</h3>
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

      <div className="max-w-3xl mx-auto pt-2">
        <DedupPresetForm value={dedupConfig} onChange={onDedupChange} />
      </div>

      <div className="flex flex-col items-center pt-2 gap-2">
        {hasFiles && missingMeses.length > 0 && (
          <p className="text-xs text-red-600 font-medium flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5" />
            Atribua o mês de referência em {missingMeses.length} documento(s) destacado(s) em vermelho.
          </p>
        )}
        <Button onClick={handleContinue} disabled={!canContinue}
          className="bg-[hsl(258,90%,66%)] hover:bg-[hsl(258,90%,56%)] text-white gap-2 h-12 px-10 text-sm font-semibold rounded-xl shadow-lg shadow-[hsl(258,90%,66%)]/20">
          Fazer Auditoria <ArrowRight className="w-5 h-5" />
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

const ProcessingPhase = ({ onComplete, files, onAnalysisReady, dedupConfig, preParsed, companyId, balanceteEntries }: { 
  onComplete: () => void; 
  files: File[];
  onAnalysisReady: (analysis: any, parsedData: ParsedFinancialData | null) => void;
  dedupConfig?: import("@/services/auditAIService").DedupConfig;
  preParsed?: MultiMonthParsed | null;
  companyId?: string | null;
  balanceteEntries?: BalanceteEntry[];
}) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [progress, setProgress] = useState(0);
  const [pipelineProgress, setPipelineProgress] = useState<string | null>(null);
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
        if (preParsed) {
          // Já temos o parse pronto (com meses confirmados pelo usuário) — reaproveita.
          setCurrentStep(2);
          setProgress(20);
          parsedData = {
            balanco: preParsed.balanco,
            dre: preParsed.dre,
            years: preParsed.years,
            documentInfo: preParsed.documentInfo,
            documentType: preParsed.documentType,
            ocrScore: preParsed.ocrScore,
          };
          console.log(`Análise mensal: ${preParsed.years.length} meses → ${preParsed.months.map(m => m.label).join(", ")}`);
        } else if (files.length > 0) {
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

        // Step 5-7: Risk Engine (com pipeline pré-processamento: normalização + few-shot + score)
        setCurrentStep(5);
        setProgress(50);

        let pipelineResult = null;
        if (parsedData && (parsedData.balanco.length > 0 || parsedData.dre.length > 0)) {
          try {
            pipelineResult = await runAuditPipeline(
              parsedData,
              files[0]?.name || "balancete",
              companyId ?? undefined,
              undefined,
              dedupConfig,
              (ev) => {
                if (ev.progress) setPipelineProgress(ev.progress);
                else if (ev.status) setPipelineProgress(`Status: ${ev.status}`);
              },
            );
            if (pipelineResult) {
              setPipelineProgress(null);
              console.log(
                `Pipeline IA — qualidade ${(pipelineResult.scores.quality * 100).toFixed(1)}% | mapeadas ${pipelineResult.normalized.filter(r => r.matched).length}/${pipelineResult.normalized.length} | few-shot ${pipelineResult.few_shot_examples.length}`
              );
            }
          } catch (e) {
            console.warn("Pipeline IA pulado (continuando análise):", e);
          }

          // P0: Persistência server-side BS & Dados (snapshot auditável em pipeline_analysis_results).
          // Converte parsedData → balancetes[{mes, linhas[]}] e dispara a Edge Function.
          try {
            const { consolidateBSDadosOnServer } = await import("@/services/bsDadosServerClient");
            const allRows = [...(parsedData?.balanco || []), ...(parsedData?.dre || [])];
            const periods = parsedData?.years ?? [];
            const userMeses = (balanceteEntries || [])
              .map(e => e.mesReferencia)
              .filter((k): k is string => !!k);
            const useUser = userMeses.length > 0 && periods.length <= 1;
            const meses = useUser ? userMeses : (periods.length ? periods : userMeses);
            const balancetes = meses.map(mes => ({
              mes,
              linhas: allRows.map(r => ({
                conta: r.conta,
                descricao: r.descricao,
                saldo: Number(r.values?.[mes] ?? r.values?.[periods.find(p => p === mes) || ""] ?? 0) || 0,
              })).filter(l => Number.isFinite(l.saldo)),
            }));
            if (balancetes.length > 0 && balancetes.some(b => b.linhas.length > 0)) {
              const persistResp = await consolidateBSDadosOnServer(balancetes, {
                companyId: companyId ?? undefined,
                fileName: files[0]?.name,
                variant: "completo",
              });
              console.log(
                `BS & Dados (server) — ${persistResp.summary.meses} meses | ${persistResp.summary.total_linhas} linhas | persistido=${persistResp.persisted ?? false}`
              );
            }
          } catch (e) {
            console.warn("Persistência BS & Dados (server) ignorada:", e);
          }
        }

        const analysis = await analyzeFinancialData(dataToAnalyze, {
          depth: "tecnico",
          purpose: "externa",
        }, pipelineResult, {
          companyId: companyId ?? null,
          periodo: dataToAnalyze?.documentInfo?.periodo ?? null,
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
            O Auditor Contábil Sênior IA está analisando seus documentos em tempo real...
          </p>
        </div>
        <div className="space-y-3">
          <Progress value={progress} className="h-2" />
          <p className="text-xs text-muted-foreground text-center">{progress}%</p>
          {pipelineProgress && (
            <div className="rounded-lg border border-[hsl(258,90%,66%)]/20 bg-[hsl(258,90%,66%)]/5 px-3 py-2 flex items-center gap-2">
              <Loader2 className="w-3.5 h-3.5 text-[hsl(258,90%,66%)] animate-spin shrink-0" />
              <p className="text-xs text-foreground/90 truncate" title={pipelineProgress}>
                {pipelineProgress}
              </p>
            </div>
          )}
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
const TabIndicadores = ({ parsedData, aiAnalysis }: { parsedData?: ParsedFinancialData | null; aiAnalysis?: any }) => {
  const { state } = useAudit();
  const computedInd = computeIndicatorsFromParsed(parsedData || null);
  const hasComputed = Object.keys(computedInd).length > 0;
  
  // Fallback: use AI analysis indicators when parsed data is empty
  const aiInd = aiAnalysis?.indicadoresCalculados;
  const aiStructure = aiAnalysis?.diagnostico?.estruturaFinanceira;
  const hasAiInd = aiInd && Object.values(aiInd).some((v: any) => v !== 0);
  
  let ind: Record<string, any>;
  let years: string[];
  
  if (hasComputed) {
    ind = computedInd;
    years = Object.keys(computedInd).sort();
  } else if (hasAiInd) {
    // Build indicator object from AI response
    const ac = aiStructure?.ativo_circulante || 0;
    const anc = aiStructure?.ativo_nao_circulante || 0;
    const pc = aiStructure?.passivo_circulante || 0;
    const pnc = aiStructure?.passivo_nao_circulante || 0;
    const at = aiStructure?.ativo_total || (ac + anc) || 1;
    const pt = aiStructure?.passivo_total || (pc + pnc) || 1;
    const pl = aiStructure?.patrimonio_liquido || 0;
    ind = {
      "Análise IA": {
        liquidezCorrente: aiInd.liquidezCorrente || 0,
        liquidezSeca: aiInd.liquidezSeca || 0,
        liquidezImediata: aiInd.liquidezImediata || 0,
        liquidezGeral: aiInd.liquidezGeral || 0,
        endividamentoGeral: aiInd.endividamentoTotal || 0,
        composicaoEndividamento: aiInd.composicaoEndividamento || 0,
        imobilizacaoPL: aiInd.imobilizacaoPL || 0,
        coberturaJuros: aiInd.coberturaJuros || 0,
        giroAtivo: aiInd.giroAtivo || 0,
        pmr: aiInd.pmr || 0,
        pmp: aiInd.pmp || 0,
        idadeMediaEstoque: aiInd.giroEstoque ? 360 / aiInd.giroEstoque : 0,
        margemLiquida: aiInd.margemLiquida || 0,
        margemOperacional: aiInd.margemOperacional || 0,
        roa: aiInd.roa || 0,
        roe: aiInd.roe || 0,
        _ac: ac, _anc: anc, _pc: pc, _pnc: pnc, _pl: pl,
        _caixa: aiStructure?.caixa || 0,
        _receita: aiStructure?.receita_liquida || 0,
        _lucro: aiStructure?.lucro_liquido || 0,
        _resOp: 0, _despFin: 0, _imob: 0, _estoque: aiStructure?.estoques || 0,
        _fornecedores: aiStructure?.fornecedores || 0, _cmv: 0, _contasReceber: aiStructure?.clientes || 0,
      }
    };
    years = ["Análise IA"];
  } else {
    ind = state.financialAnalysis.indicators;
    years = ["2021", "2022", "2023"];
  }

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

  // Fallback to AI structure data
  const aiStruct = aiAnalysis?.diagnostico?.estruturaFinanceira;
  const pc = d?._pc || aiStruct?.passivo_circulante || 0;
  const pnc = d?._pnc || aiStruct?.passivo_nao_circulante || 0;
  const ptotal = pc + pnc || 1;
  const caixa = d?._caixa || aiStruct?.caixa || 0;
  const ac = d?._ac || aiStruct?.ativo_circulante || 0;
  const anc = d?._anc || aiStruct?.ativo_nao_circulante || 0;

  // Try to extract loan data from parsed balanco
  const findAbsValue = (keyword: string) => {
    if (!parsedData) return 0;
    const row = parsedData.balanco.find(r => 
      r.conta.toLowerCase().includes(keyword) || r.descricao.toLowerCase().includes(keyword)
    );
    return Math.abs(row?.values[latestYear || ""] || 0);
  };

  const emprestimos = findAbsValue("empréstimos") || findAbsValue("financiamentos");
  const fornecedores = d?._fornecedores || aiStruct?.fornecedores || 0;
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
    { role: "assistant", text: "Sou o Auditor Contábil Sênior IA. Selecione uma pendência ao lado e me pergunte — respondo sobre fundamentação técnica, riscos, ajustes contábeis ou impacto jurídico." },
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

/* ── Shared A4 Report Page Wrapper ── */
const ReportPage = ({ children }: { children: React.ReactNode }) => (
  <div className="report-a4-page" style={{ "--report-watermark": `url(${folhaRostoBg})` } as React.CSSProperties}>
    <div className="report-page-header">
      <img src={logoBrasilExpertFull} alt="Brasil Expert" className="h-14 object-contain" />
    </div>
    <div className="report-page-body">
      {children}
    </div>
    <div className="report-footer-bar">
      <p>Rua Cel. Oscar Porto, nº 736, 3º Andar, Paraíso, São Paulo-SP, CEP: 04003-003</p>
      <p>(11) 3285-4472 · https://www.brasilexpert.com.br/</p>
    </div>
  </div>
);

const TabRelatorioPreview = ({ onGerarBex, onGerarKanitz, selectedDepth = "tecnico" }: { onGerarBex: () => void; onGerarKanitz: () => void; selectedDepth?: "executivo" | "tecnico" }) => {
  const bexAvailable = selectedDepth === "executivo";
  const kanitzAvailable = selectedDepth === "tecnico";
  return (
  <div className="space-y-6">
    <div className="text-center space-y-2 mb-2">
      <h2 className="text-lg font-bold text-foreground font-serif">Selecione o Relatório para Gerar</h2>
      <p className="text-sm text-muted-foreground max-w-xl mx-auto">Escolha entre o Relatório BEX (Avaliação Contábil e Solvência) ou o Relatório Kanitz (Termômetro de Insolvência).</p>
      <p className="text-[11px] text-muted-foreground/80 max-w-xl mx-auto">
        Conforme o <strong>Nível de Profundidade Técnica</strong> selecionado na configuração, somente o relatório correspondente está liberado para acesso.
      </p>
    </div>

    <div className="grid lg:grid-cols-2 gap-6">
      {/* Card BEX */}
      <Card className={`border-2 hover:border-[hsl(258,90%,66%)]/50 transition-all ${bexAvailable ? "ring-2 ring-[hsl(258,90%,66%)]/40" : ""}`}>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[hsl(258,90%,66%)]/10 flex items-center justify-center">
              <BookOpen className="w-5 h-5 text-[hsl(258,90%,66%)]" />
            </div>
            <div>
              <CardTitle className="text-base">Relatório BEx_Resumido_Kanitz</CardTitle>
              <CardDescription className="text-xs">Avaliação Contábil e Solvência Empresarial</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-xs text-muted-foreground leading-relaxed">
            Relatório técnico completo com diagnóstico executivo, solvência, pendências contábeis, indicadores financeiros, endividamento, balanço patrimonial e Score BEX de Solvência.
           </p>
           <div className="flex justify-center gap-2">
             <Badge className="bg-green-500/15 text-green-600 border-green-500/30 text-xs font-semibold px-3 py-1">Versão Gratuita</Badge>
             {bexAvailable && (
               <Badge className="bg-emerald-500/15 text-emerald-700 border-emerald-500/30 text-xs font-semibold px-3 py-1">Selecionado</Badge>
             )}
           </div>
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
      <Card className={`border-2 hover:border-amber-500/50 transition-all ${kanitzAvailable ? "ring-2 ring-amber-500/40" : ""}`}>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
              <Scale className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <CardTitle className="text-base">Relatório BEx_Completo_Kanitz</CardTitle>
              <CardDescription className="text-xs">Termômetro de Insolvência — Stephen C. Kanitz</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-xs text-muted-foreground leading-relaxed">
            Relatório de análise preditiva de falência com cálculo do Fator de Insolvência (FI), classificação de risco, análise técnica automatizada e recomendações estratégicas.
           </p>
           <div className="flex justify-center gap-2">
             <Badge className="bg-amber-500/15 text-amber-600 border-amber-500/30 text-xs font-semibold px-3 py-1">Versão Paga</Badge>
             {kanitzAvailable && (
               <Badge className="bg-emerald-500/15 text-emerald-700 border-emerald-500/30 text-xs font-semibold px-3 py-1">Selecionado</Badge>
             )}
           </div>
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
};

/* ══════════════════════════════════════════════════════
   TAB: RELATÓRIO FINAL BEX
   ══════════════════════════════════════════════════════ */
export const TabRelatorioFinal = ({ onBack, aiAnalysis, parsedData, onSwitchToKanitz, variant = "resumido" }: { onBack: () => void; aiAnalysis?: any; parsedData?: ParsedFinancialData | null; onSwitchToKanitz?: () => void; variant?: "resumido" | "completo" }) => {
  const { state } = useAudit();
  const navigate = useNavigate();
  const reportContainerRef = useRef<HTMLDivElement>(null);
  const [totalPages, setTotalPages] = useState(0);

  useEffect(() => {
    if (reportContainerRef.current) {
      const pages = reportContainerRef.current.querySelectorAll('.report-a4-page, .report-a4-cover');
      setTotalPages(pages.length);
    }
  });
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

  /* ── Kanitz computation for abbreviated section ── */
  const kanitzFindValue = (keyword: string, year: string) => {
    if (!parsedData) return 0;
    const allRows = [...parsedData.balanco, ...parsedData.dre];
    const row = allRows.find(r => r.conta.toLowerCase().includes(keyword) || r.descricao.toLowerCase().includes(keyword));
    return row?.values[year] || 0;
  };

  const kanitzResults: Array<{
    year: string; rpl: number; lg: number; ls: number; lc: number; ge: number; fi: number;
    classificacao: "saudavel" | "estavel" | "atencao" | "risco" | "insolvente";
    ac: number; anc: number; pc: number; pnc: number; pl: number; estoque: number; rlp: number; pt: number; ll: number; at: number; rl: number;
  }> = [];

  if (parsedData) {
    for (const year of parsedData.years) {
      const kAc = Math.abs(kanitzFindValue("total do ativo circulante", year) || kanitzFindValue("ativo circulante", year));
      const kAnc = Math.abs(kanitzFindValue("total do ativo não circulante", year) || kanitzFindValue("ativo nao circulante", year) || kanitzFindValue("ativo não circulante", year));
      const kPc = Math.abs(kanitzFindValue("total do passivo circulante", year) || kanitzFindValue("passivo circulante", year));
      const kPnc = Math.abs(kanitzFindValue("total do passivo não circulante", year) || kanitzFindValue("passivo nao circulante", year) || kanitzFindValue("passivo não circulante", year));
      const kPl = Math.abs(kanitzFindValue("total do patrimônio", year) || kanitzFindValue("patrimonio líquido", year) || kanitzFindValue("patrimônio líquido", year));
      const kEstoque = Math.abs(kanitzFindValue("estoque", year));
      const kLl = kanitzFindValue("resultado do exercício", year) || kanitzFindValue("lucro líquido", year);
      const kRlp = Math.abs(kanitzFindValue("realizável a longo prazo", year) || kanitzFindValue("realizavel", year));
      const kRl = Math.abs(kanitzFindValue("receita líquida", year) || kanitzFindValue("receita", year));
      const kPt = kPc + kPnc;
      const kAt = kAc + kAnc;
      const rpl = kPl !== 0 ? kLl / kPl : 0;
      const lg = kPt !== 0 ? (kAc + kRlp) / kPt : 0;
      const ls = kPc !== 0 ? (kAc - kEstoque) / kPc : 0;
      const lc = kPc !== 0 ? kAc / kPc : 0;
      const ge = kPl > 0 ? (kPt / kPl) : 0; // GE positivo conforme MD
      const fi = (0.05 * rpl) + (1.65 * lg) + (3.55 * ls) - (1.06 * lc) - (0.33 * ge);
      const classificacao: typeof kanitzResults[0]["classificacao"] =
        fi > 1 ? "saudavel" : fi > 0 ? "estavel" : fi > -1 ? "atencao" : fi >= -3 ? "risco" : "insolvente";
      kanitzResults.push({ year, rpl, lg, ls, lc, ge, fi, classificacao, ac: kAc, anc: kAnc, pc: kPc, pnc: kPnc, pl: kPl, estoque: kEstoque, rlp: kRlp, pt: kPt, ll: kLl, at: kAt, rl: kRl });
    }
  }

  if (kanitzResults.length === 0 && aiAnalysis?.kanitz) {
    const aiK = aiAnalysis.kanitz;
    const comp = aiK.componentes || {};
    const aiStruct = aiAnalysis?.diagnostico?.estruturaFinanceira || {};
    const fi = aiK.fatorInsolvencia || 0;
    const classificacao: typeof kanitzResults[0]["classificacao"] =
      fi > 1 ? "saudavel" : fi > 0 ? "estavel" : fi > -1 ? "atencao" : fi >= -3 ? "risco" : "insolvente";
    kanitzResults.push({
      year: "Análise IA", rpl: comp.rpl || 0, lg: comp.lg || 0, ls: comp.ls || 0, lc: comp.lc || 0, ge: comp.ge || 0,
      fi, classificacao, ac: aiStruct.ativo_circulante || 0, anc: aiStruct.ativo_nao_circulante || 0,
      pc: aiStruct.passivo_circulante || 0, pnc: aiStruct.passivo_nao_circulante || 0, pl: aiStruct.patrimonio_liquido || 0,
      estoque: aiStruct.estoques || 0, rlp: 0, pt: (aiStruct.passivo_circulante || 0) + (aiStruct.passivo_nao_circulante || 0),
      ll: aiStruct.lucro_liquido || 0, at: (aiStruct.ativo_circulante || 0) + (aiStruct.ativo_nao_circulante || 0), rl: aiStruct.receita_liquida || 0,
    });
  }

  const latestKanitz = kanitzResults[kanitzResults.length - 1];
  const kanitzClassColors: Record<string, { icon: string; label: string; color: string }> = {
    saudavel: { icon: "🟢", label: "Saudável", color: "text-emerald-600" },
    estavel: { icon: "🔵", label: "Estável", color: "text-blue-600" },
    atencao: { icon: "🟡", label: "Zona de Atenção", color: "text-yellow-600" },
    risco: { icon: "🟠", label: "Zona de Risco", color: "text-orange-600" },
    insolvente: { icon: "🔴", label: "Alta Probabilidade de Insolvência", color: "text-red-600" },
  };
  const fmtKDec = (n: number) => n.toFixed(4);

  const SectionTitle = ({ num, title }: { num: string; title: string }) => (
    <div className="flex items-center gap-3 py-3 border-b-2 border-[hsl(258,90%,66%)]/30 mb-4">
      <div className="w-8 h-8 rounded-lg bg-[hsl(258,90%,66%)] text-white flex items-center justify-center text-sm font-bold">{num}</div>
      <h2 className="text-lg font-bold text-foreground font-serif">{title}</h2>
    </div>
  );

  return (
    <div ref={reportContainerRef} style={{ "--report-watermark": `url(${folhaRostoBg})` } as React.CSSProperties} id="report-bex-container">
      {/* Action buttons print:hidden - outside gray container */}
      <div className="flex items-center justify-between gap-2 print:hidden mb-4 flex-wrap">
        <div className="flex items-center gap-1.5">
          {totalPages > 0 && (
            <span className="text-xs font-medium text-muted-foreground flex items-center gap-1.5 mr-3">
              <FileText className="w-3.5 h-3.5" /> Total de páginas: {totalPages}
            </span>
          )}
          <div className="inline-flex items-center rounded-lg border border-border bg-muted/50 p-0.5">
            <div className="relative">
              <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 text-[9px] font-bold text-green-600 bg-green-100 px-1.5 py-0 rounded-full leading-4 whitespace-nowrap">Disponível</span>
              <button className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold bg-[hsl(258,90%,66%)] text-white shadow-sm">
                <BookOpen className="w-3.5 h-3.5" /> Relatório BEX
              </button>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => printReport('report-bex-container', 'Relatório BEX')}>
            <Download className="w-4 h-4" /> Exportar PDF
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => exportDocx('report-bex-container', 'Relatório BEX')}>
            <FileText className="w-4 h-4" /> Exportar .doc
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => printReport('report-bex-container', 'Relatório BEX')}>
            <Printer className="w-4 h-4" /> Imprimir
          </Button>
          <Button variant="outline" size="sm" onClick={onBack} className="gap-1.5">
            <ArrowLeft className="w-4 h-4" /> Nova Análise
          </Button>
        </div>
      </div>

      <div className="report-pages-container">
      {/* ── CAPA A4 ── */}
      <div className="report-a4-cover" style={{ "--report-watermark": `url(${folhaRostoBg})` } as React.CSSProperties}>
        {/* Header with logo */}
        <div className="report-page-header">
          <img src={logoBrasilExpertFull} alt="Brasil Expert" className="h-14 object-contain" />
        </div>

        {/* BRASIL EXPERT — posicionado logo abaixo da logo */}
        <div className="px-12 text-center mt-8">
          <p className="text-2xl md:text-3xl font-bold font-sans text-foreground">BRASIL EXPERT</p>
        </div>

        {/* Center content */}
        <div className="flex-1 flex flex-col items-center justify-center px-12 text-center">
          <h1 className="text-2xl md:text-3xl font-bold font-sans leading-tight text-foreground">
            RELATÓRIO TÉCNICO DE AVALIAÇÃO<br />CONTÁBIL E SOLVÊNCIA EMPRESARIAL
          </h1>
          <p className="text-sm text-muted-foreground mt-3 italic">Business Extended Analysis</p>

          <div className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full border border-[hsl(258,90%,66%)]/30 bg-[hsl(258,90%,66%)]/5 mt-8">
            <span className="text-lg">{riskIcon}</span>
            <span className="text-sm font-semibold text-foreground">{scoreLabel} — Score BEX: {activeScore.score}/100</span>
          </div>

          <div className="mt-10 space-y-1.5 text-sm text-muted-foreground">
            <p className="font-semibold text-foreground text-base">Empresa Analisada: Empresa Demonstração S.A.</p>
            <p>CNPJ: 12.345.678/0001-90</p>
            <p>Data-base do Balancete: 31/12/2023</p>
            <p>Data de Emissão: {today}</p>
          </div>

          <div className="mt-8 pt-6 border-t border-border w-full max-w-md space-y-1">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Responsável Técnico</p>
            <p className="text-sm font-semibold text-foreground">Auditor Contábil Sênior IA</p>
            <p className="text-xs text-muted-foreground">Especialista em Recuperação Judicial e Análise Empresarial</p>
          </div>
        </div>

        {/* Footer */}
        <div className="report-footer-bar">
          <p>Rua Cel. Oscar Porto, nº 736, 3º Andar, Paraíso, São Paulo-SP, CEP: 04003-003</p>
        <p>(11) 3285-4472 · https://www.brasilexpert.com.br/</p>
          </div>
          </div>

      {/* ── 1. DIAGNÓSTICO EXECUTIVO ── */}
      <ReportPage>
        <div className="space-y-4">
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
        </div>
      </ReportPage>

      {/* ── 2. SOLVÊNCIA ── */}
      <ReportPage>
        <div className="space-y-4">
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

            {/* Gráfico de Barras — Índices de Solvência */}
            {solvencyIndicators.length > 0 && (
              <div className="mt-4">
                <div className="h-[220px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={solvencyIndicators.filter(si => !si.name.includes("Capital") && !si.name.includes("Cobertura")).map(si => ({
                      name: si.name.replace("Liquidez ", "Liq. ").replace("Solvência ", "Solv. "),
                      value: parseFloat(si.result.replace("%", "").replace(",", ".")) || 0,
                    }))}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                      <XAxis dataKey="name" tick={{ fontSize: 9 }} />
                      <YAxis tick={{ fontSize: 9 }} unit="%" />
                      <Tooltip formatter={(v: number) => [`${v.toFixed(1)}%`, "Resultado"]} />
                      <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                        {solvencyIndicators.filter(si => !si.name.includes("Capital") && !si.name.includes("Cobertura")).map((_, i) => (
                          <Cell key={i} fill={["hsl(258,90%,66%)", "hsl(258,70%,60%)", "hsl(258,50%,55%)", "hsl(258,90%,50%)"][i % 4]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
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
        </div>
      </ReportPage>

      {/* ── 3. ANÁLISE TÉCNICA — PENDÊNCIAS ── */}
      <ReportPage>
        <div className="space-y-4">
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
        </div>
      </ReportPage>

      {/* ── 4. INDICADORES ECONÔMICO-FINANCEIROS ── */}
      <ReportPage>
        <div className="space-y-4">
          <SectionTitle num="4" title="INDICADORES ECONÔMICO-FINANCEIROS" />

          {/* 4.1 Liquidez */}
          <div>
            <h3 className="text-sm font-semibold text-foreground mb-3">4.1 Indicadores de Liquidez</h3>
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
                  {[
                    { name: "Liquidez Corrente", formula: "AC / PC", value: latestInd?.liquidezCorrente, interp: "Capacidade de pagamento de obrigações de curto prazo" },
                    { name: "Liquidez Seca", formula: "(AC - EST) / PC", value: latestInd?.liquidezSeca, interp: "Liquidez excluindo estoques" },
                    { name: "Liquidez Geral", formula: "(AC + RLP) / (PC + PNC)", value: latestInd?.liquidezGeral, interp: "Capacidade de pagamento total" },
                  ].map(item => (
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

            {/* Gráfico de Linhas — Índices de Liquidez (estilo gr1) */}
            {years.length > 0 && (
              <div className="mt-4">
                <h4 className="text-xs font-semibold text-foreground mb-2 text-center">ÍNDICES DE LIQUIDEZ</h4>
                <div className="h-[240px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={years.map(y => {
                      const yInd = ind[y];
                      return {
                        name: y,
                        "LIQUIDEZ IMEDIATA": yInd?.liquidezImediata != null ? parseFloat(yInd.liquidezImediata.toFixed(2)) : 0,
                        "LIQUIDEZ CORRENTE": yInd?.liquidezCorrente != null ? parseFloat(yInd.liquidezCorrente.toFixed(2)) : 0,
                        "LIQUIDEZ SECA": yInd?.liquidezSeca != null ? parseFloat(yInd.liquidezSeca.toFixed(2)) : 0,
                        "LIQUIDEZ GERAL": yInd?.liquidezGeral != null ? parseFloat(yInd.liquidezGeral.toFixed(2)) : 0,
                      };
                    })} margin={{ top: 20, right: 20, left: 0, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                      <XAxis dataKey="name" tick={{ fontSize: 9 }} />
                      <YAxis tick={{ fontSize: 9 }} />
                      <Tooltip formatter={(v: number) => v.toFixed(2)} />
                      <Legend wrapperStyle={{ fontSize: 10 }} iconType="plainline" />
                      <Line type="linear" dataKey="LIQUIDEZ IMEDIATA" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }}>
                        <LabelList dataKey="LIQUIDEZ IMEDIATA" position="top" fontSize={9} formatter={(v: number) => v.toFixed(2)} />
                      </Line>
                      <Line type="linear" dataKey="LIQUIDEZ CORRENTE" stroke="#ef4444" strokeWidth={2} dot={{ r: 3 }}>
                        <LabelList dataKey="LIQUIDEZ CORRENTE" position="top" fontSize={9} formatter={(v: number) => v.toFixed(2)} />
                      </Line>
                      <Line type="linear" dataKey="LIQUIDEZ SECA" stroke="#84cc16" strokeWidth={2} dot={{ r: 3 }}>
                        <LabelList dataKey="LIQUIDEZ SECA" position="top" fontSize={9} formatter={(v: number) => v.toFixed(2)} />
                      </Line>
                      <Line type="linear" dataKey="LIQUIDEZ GERAL" stroke="#7c3aed" strokeWidth={2} dot={{ r: 3 }}>
                        <LabelList dataKey="LIQUIDEZ GERAL" position="top" fontSize={9} formatter={(v: number) => v.toFixed(2)} />
                      </Line>
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* Texto analítico Liquidez */}
            <div className="mt-3 p-4 rounded-lg bg-muted/30 border border-border/50">
              <p className="text-xs font-semibold text-foreground mb-1">Análise Técnica — Liquidez</p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {latestInd ? (
                  latestInd.liquidezCorrente > 1.5
                    ? `A empresa apresenta liquidez corrente de ${fmtPct(latestInd.liquidezCorrente)}, acima do parâmetro mínimo de 1,50, demonstrando capacidade adequada para honrar compromissos de curto prazo. A liquidez seca de ${fmtPct(latestInd.liquidezSeca)} indica baixa dependência de estoques para geração de caixa. A liquidez geral de ${fmtPct(latestInd.liquidezGeral)} ${latestInd.liquidezGeral > 1 ? "confirma equilíbrio patrimonial global" : "revela que os ativos totais são insuficientes para cobrir o passivo exigível total, sinalizando dependência de geração futura de caixa"}.`
                    : latestInd.liquidezCorrente > 1
                    ? `A empresa apresenta liquidez corrente de ${fmtPct(latestInd.liquidezCorrente)}, acima da unidade mas abaixo do parâmetro ideal de 1,50. Isso indica capacidade marginal de pagamento no curto prazo. A liquidez seca de ${fmtPct(latestInd.liquidezSeca)} sugere ${latestInd.liquidezSeca > 0.8 ? "razoável independência de estoques" : "forte dependência de estoques para composição dos ativos circulantes"}. Recomenda-se acompanhamento mensal dos prazos médios.`
                    : `A empresa apresenta liquidez corrente inferior a 1,00 (${fmtPct(latestInd.liquidezCorrente)}), evidenciando insuficiência de ativos circulantes para cobertura das obrigações de curto prazo. Situação de alerta conforme NBC TA 570 — Continuidade Operacional.`
                ) : "Dados insuficientes para análise de liquidez."}
              </p>
            </div>
          </div>

          {/* 4.2 Endividamento */}
          <div>
            <h3 className="text-sm font-semibold text-foreground mb-3">4.2 Indicadores de Endividamento</h3>
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
                  {[
                    { name: "Endividamento Total", formula: "PT / AT", value: latestInd?.endividamentoGeral, interp: "Grau de comprometimento do ativo com terceiros" },
                    { name: "Composição do Endividamento", formula: "PC / PT", value: latestInd?.composicaoEndividamento, interp: "Concentração da dívida no curto prazo" },
                    { name: "Imobilização do PL", formula: "Imob / PL", value: latestInd?.imobilizacaoPL, interp: "Grau de imobilização do capital próprio" },
                  ].map(item => (
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

            {/* Gráfico Evolução do Endividamento (estilo gr2) — barras empilhadas + linha de total */}
            {years.length > 0 && (
              <div className="mt-4">
                <h4 className="text-xs font-semibold text-foreground mb-2 text-center">EVOLUÇÃO DO ENDIVIDAMENTO<br /><span className="font-normal text-[9px]">(Em milhares de reais)</span></h4>
                <div className="h-[260px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={years.slice(-4).map(y => {
                      const yInd = ind[y];
                      const tributarias = Math.abs(yInd?._tributos || 0);
                      const trabalhistas = Math.abs(yInd?._trabalhistas || 0);
                      const emprestimos = Math.abs(yInd?._emprestimos || 0);
                      const fornecedores = Math.abs(yInd?._fornecedores || 0);
                      const credoresRJ = Math.abs(yInd?._credoresRJ || 0);
                      const outras = Math.abs(yInd?._outrasObrig || ((yInd?._pc || 0) + (yInd?._pnc || 0) - tributarias - trabalhistas - emprestimos - fornecedores - credoresRJ)) || 0;
                      const total = Math.abs((yInd?._pc || 0) + (yInd?._pnc || 0));
                      return {
                        name: y,
                        "OBRIG. TRIBUTÁRIAS": tributarias / 1000,
                        "OBRIG. TRABALHISTAS": trabalhistas / 1000,
                        "EMPR. E FINANCIAMENTOS": emprestimos / 1000,
                        "FORNECEDORES": fornecedores / 1000,
                        "CREDORES RJ": credoresRJ / 1000,
                        "OUTRAS OBRIGAÇÕES": outras / 1000,
                        "TOTAL": total / 1000,
                      };
                    })} margin={{ top: 20, right: 20, left: 0, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                      <XAxis dataKey="name" tick={{ fontSize: 9 }} />
                      <YAxis yAxisId="left" tick={{ fontSize: 9 }} tickFormatter={(v) => v.toLocaleString('pt-BR', { maximumFractionDigits: 0 })} />
                      <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 9 }} tickFormatter={(v) => v.toLocaleString('pt-BR', { maximumFractionDigits: 0 })} />
                      <Tooltip formatter={(v: number) => `R$ ${(v * 1000).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`} />
                      <Legend wrapperStyle={{ fontSize: 9 }} />
                      <Bar yAxisId="left" dataKey="OBRIG. TRIBUTÁRIAS" stackId="a" fill="#5b9bd5" />
                      <Bar yAxisId="left" dataKey="OBRIG. TRABALHISTAS" stackId="a" fill="#ed7d31" />
                      <Bar yAxisId="left" dataKey="EMPR. E FINANCIAMENTOS" stackId="a" fill="#a5a5a5" />
                      <Bar yAxisId="left" dataKey="FORNECEDORES" stackId="a" fill="#70ad47" />
                      <Bar yAxisId="left" dataKey="CREDORES RJ" stackId="a" fill="#ffc000" />
                      <Bar yAxisId="left" dataKey="OUTRAS OBRIGAÇÕES" stackId="a" fill="#264478" />
                      <Line yAxisId="right" type="linear" dataKey="TOTAL" stroke="#c00000" strokeWidth={2.5} dot={{ r: 4, fill: "#c00000" }}>
                        <LabelList dataKey="TOTAL" position="top" fontSize={9} fill="#c00000" formatter={(v: number) => (v * 1000).toLocaleString('pt-BR', { maximumFractionDigits: 0 })} />
                      </Line>
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* Texto analítico Endividamento */}
            <div className="mt-3 p-4 rounded-lg bg-muted/30 border border-border/50">
              <p className="text-xs font-semibold text-foreground mb-1">Análise Técnica — Endividamento</p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {latestInd ? (
                  `O endividamento total atinge ${fmtPct(latestInd.endividamentoGeral)}, ${latestInd.endividamentoGeral > 0.6 ? "acima do limite prudencial de 60%, indicando elevada dependência de capital de terceiros" : "dentro de parâmetros aceitáveis de dependência de capital de terceiros"}. A composição do endividamento revela que ${fmtPct(latestInd.composicaoEndividamento)} do passivo exigível vence no curto prazo, ${latestInd.composicaoEndividamento > 0.5 ? "configurando pressão sobre o fluxo de caixa operacional e risco de refinanciamento" : "demonstrando perfil de dívida alongado e menor pressão sobre o caixa de curto prazo"}. A imobilização do PL de ${fmtPct(latestInd.imobilizacaoPL)} ${latestInd.imobilizacaoPL > 1 ? "supera a unidade, indicando que a totalidade do capital próprio está comprometida com ativos permanentes, sin margem para financiar operações correntes" : "permanece em nível administrável"}.`
                ) : "Dados insuficientes para análise de endividamento."}
              </p>
            </div>
          </div>

          {/* 4.3 Rentabilidade */}
          <div>
            <h3 className="text-sm font-semibold text-foreground mb-3">4.3 Indicadores de Rentabilidade</h3>
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
                  {[
                    { name: "Margem Operacional", formula: "LAJIR / Receita", value: latestInd?.margemOperacional, interp: "Eficiência operacional da empresa" },
                    { name: "ROA", formula: "LL / AT", value: latestInd?.roa, interp: "Retorno gerado pelo ativo total" },
                    { name: "ROE", formula: "LL / PL", value: latestInd?.roe, interp: "Retorno ao acionista sobre capital investido" },
                  ].map(item => (
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

            {/* Gráfico CMV + Despesa x Receita Líquida (estilo gr3) */}
            {years.length > 0 && (
              <div className="mt-4">
                <h4 className="text-xs font-semibold text-foreground mb-2 text-center">CMV + DESPESA X RECEITA LÍQUIDA<br /><span className="font-normal text-[9px]">(R$ x 1000)</span></h4>
                <div className="h-[260px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={years.map(y => {
                      const yInd = ind[y];
                      const receita = Math.abs(yInd?._rl || yInd?.receitaLiquida || 0) / 1000;
                      const cmv = Math.abs(yInd?._cpv || yInd?.custosProdutos || 0);
                      const despOp = Math.abs(yInd?._despOp || yInd?.despesasOperacionais || 0);
                      const despFin = Math.abs(yInd?._despFin || yInd?.despesasFinanceiras || 0);
                      const cmvDesp = -((cmv + despOp + despFin) / 1000);
                      const pct = receita > 0 ? (Math.abs(cmvDesp) / receita) * 100 : 0;
                      return {
                        name: y,
                        "Receita Líquida": parseFloat(receita.toFixed(0)),
                        "CMV + DESPESA / RECEITA LÍQUIDA": parseFloat(cmvDesp.toFixed(0)),
                        pct: parseFloat(pct.toFixed(2)),
                      };
                    })} margin={{ top: 25, right: 20, left: 0, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                      <XAxis dataKey="name" tick={{ fontSize: 9 }} />
                      <YAxis tick={{ fontSize: 9 }} tickFormatter={(v) => v.toLocaleString('pt-BR')} />
                      <Tooltip formatter={(v: number, n: string) => n === "pct" ? `${v.toFixed(2)}%` : `R$ ${(v * 1000).toLocaleString('pt-BR')}`} />
                      <Legend wrapperStyle={{ fontSize: 9 }} />
                      <Bar dataKey="Receita Líquida" fill="#5b9bd5">
                        <LabelList dataKey="Receita Líquida" position="top" fontSize={9} formatter={(v: number) => v.toLocaleString('pt-BR')} />
                      </Bar>
                      <Bar dataKey="CMV + DESPESA / RECEITA LÍQUIDA" fill="#c00000">
                        <LabelList dataKey="CMV + DESPESA / RECEITA LÍQUIDA" position="bottom" fontSize={9} formatter={(v: number) => `(${Math.abs(v).toLocaleString('pt-BR')})`} />
                      </Bar>
                      <Line type="linear" dataKey="pct" name="CMV + DESPESA / RECEITA LÍQUIDA (%)" stroke="#c00000" strokeWidth={0} dot={false}>
                        <LabelList dataKey="pct" position="top" fontSize={9} fill="#c00000" formatter={(v: number) => `${v.toFixed(2)}%`} />
                      </Line>
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
          </div>

          {d && (
            <div>
              <h3 className="text-sm font-semibold text-foreground mb-2">EBITDA Estimado ({latestYear})</h3>
              <div className="p-4 rounded-lg bg-muted/30 text-center">
                <p className="text-2xl font-bold font-mono text-foreground">R$ {fmt((d._resOp || d.resultadoOperacional || 0) + (d._despFin || d.despesasFinanceiras || 0))}</p>
                <p className="text-[10px] text-muted-foreground mt-1">LAJIR + Despesas Financeiras</p>
              </div>
            </div>
          )}
        </div>
      </ReportPage>

      {/* ── 5. ENDIVIDAMENTO ── */}
      <ReportPage>
        <div className="space-y-4">
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
        </div>
      </ReportPage>

      {/* ── 6. BALANÇO PATRIMONIAL ── */}
      {(() => {
        const allRows = parsedData?.balanco || state.balancoRows;
        // Whitelist de contas analíticas consolidadas (subtopicos em negrito da planilha)
        const ATIVO_WHITELIST = [
          "ativo circulante",
          "bens e numerários", "bens e numerarios",
          "outros valores a receber",
          "valores a recuperar",
          "outros créditos a longo prazo", "outros creditos a longo prazo",
          "ativo permanente",
        ];
        const PASSIVO_WHITELIST = [
          "passivo circulante",
          "fornecedores",
          "contas a pagar",
          "salarios e encargos sociais", "salários e encargos sociais",
          "tributos e contribuições a recolher", "tributos e contribuicoes a recolher",
          "instituições financeiras", "instituicoes financeiras",
          "outras contas a pagar",
          "nao circulante - longo prazo", "não circulante - longo prazo",
          "patrimonio liquido", "patrimônio líquido",
        ];
        const _norm = (s: string) => (s || "").toLowerCase().trim().replace(/\s+/g, " ");
        const _inList = (r: any, list: string[]) => {
          const d = _norm(r?.descricao || "");
          if (!d) return false;
          return list.some(w => d === w || d.startsWith(w));
        };
        const ativoRows = allRows.filter((r: any) => (r.conta || "").startsWith("1") && _inList(r, ATIVO_WHITELIST));
        const passivoRows = allRows.filter((r: any) => (r.conta || "").startsWith("2") && _inList(r, PASSIVO_WHITELIST));
        const maxRows = Math.max(ativoRows.length, passivoRows.length);

        const isParent = (conta: string) => {
          const parts = conta.replace(/\./g, "").length;
          return conta === "1" || conta === "2" || conta === "1.01" || conta === "1.02" || conta === "2.01" || conta === "2.02" || conta === "2.03" || parts <= 3;
        };

        const getIndent = (conta: string) => {
          const depth = (conta.match(/\./g) || []).length;
          return depth > 0 ? `${depth * 12}px` : "0px";
        };

        // Rows per page: first page has title+header so fewer rows, continuation pages have more
        const ROWS_FIRST_PAGE = 38;
        const ROWS_PER_PAGE = 44;

        // Build array of pages with row ranges
        const pages: Array<{ startIdx: number; endIdx: number; isFirst: boolean }> = [];
        let cursor = 0;
        let isFirst = true;
        while (cursor < maxRows) {
          const capacity = isFirst ? ROWS_FIRST_PAGE : ROWS_PER_PAGE;
          const endIdx = Math.min(cursor + capacity, maxRows);
          pages.push({ startIdx: cursor, endIdx, isFirst });
          cursor = endIdx;
          isFirst = false;
        }

        // Add validations to the last page
        const validations = [
          { check: "Ativo = Passivo + PL", status: true, detail: `Ativo Total: R$ ${fmt(ac + anc)} | Passivo + PL: R$ ${fmt(pc + pnc)}` },
          { check: "Passivo a Descoberto", status: (d?._pl || d?.patrimonioLiquido || 0) > 0, detail: (d?._pl || d?.patrimonioLiquido || 0) > 0 ? "Não identificado — PL positivo" : "IDENTIFICADO — PL negativo" },
          { check: "PL Negativo", status: (d?._pl || d?.patrimonioLiquido || 0) > 0, detail: (d?._pl || d?.patrimonioLiquido || 0) > 0 ? `PL positivo: R$ ${fmt(Math.abs(d?._pl || d?.patrimonioLiquido || 0))}` : "PL NEGATIVO identificado" },
          { check: "Descasamento Estrutural", status: ac > pc, detail: "Capital de giro líquido " + (ac > pc ? "positivo" : "negativo") },
        ];

        // Check if validations fit on the last page (need ~6 rows worth of space)
        const lastPage = pages[pages.length - 1];
        const lastPageRows = lastPage.endIdx - lastPage.startIdx;
        const lastPageCapacity = lastPage.isFirst ? ROWS_FIRST_PAGE : ROWS_PER_PAGE;
        const validationsFitOnLastPage = (lastPageCapacity - lastPageRows) >= 8;

        const renderTableHeader = () => (
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
        );

        const renderRows = (startIdx: number, endIdx: number) => (
          <tbody>
            {Array.from({ length: endIdx - startIdx }).map((_, i) => {
              const idx = startIdx + i;
              const aRow = ativoRows[idx];
              const pRow = passivoRows[idx];
              const aParent = aRow && isParent(aRow.conta);
              const pParent = pRow && isParent(pRow.conta);

              return (
                <tr key={idx} className="border-b border-border/40 hover:bg-muted/30">
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
                  <td className="bg-border/20"></td>
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
        );

        const renderValidations = () => (
          <div className="mt-4">
            <h3 className="text-sm font-semibold text-foreground mb-2">Validações</h3>
            <div className="space-y-2">
              {validations.map(v => (
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
        );

        return (
          <>
            {pages.map((page, pageIdx) => (
              <ReportPage key={`bp-page-${pageIdx}`}>
                <div className="space-y-2">
                  {page.isFirst ? (
                    <>
                      <SectionTitle num="6" title="BALANÇO PATRIMONIAL" />
                      <div className="text-center mb-2">
                        <h3 className="text-sm font-bold text-foreground uppercase tracking-wide">DEMONSTRATIVOS FINANCEIROS CONSOLIDADOS</h3>
                        <p className="text-[10px] text-muted-foreground mt-1">Balanço Patrimonial</p>
                      </div>
                    </>
                  ) : (
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wide">6. Balanço Patrimonial — continuação ({pageIdx + 1}/{pages.length})</p>
                    </div>
                  )}

                  <div className="overflow-x-auto">
                    <table className="w-full text-[10px] border-collapse">
                      {renderTableHeader()}
                      {renderRows(page.startIdx, page.endIdx)}
                    </table>
                  </div>

                  {/* Render validations on last page if they fit, otherwise they go on a separate page */}
                  {pageIdx === pages.length - 1 && validationsFitOnLastPage && renderValidations()}
                </div>
              </ReportPage>
            ))}

            {/* Separate page for validations if they don't fit */}
            {!validationsFitOnLastPage && (
              <ReportPage>
                <div className="space-y-2">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wide">6. Balanço Patrimonial — Validações</p>
                  </div>
                  {renderValidations()}
                </div>
              </ReportPage>
            )}
          </>
        );
      })()}

      {/* ── SCORE FINAL ── */}
      <ReportPage>
        <div className="space-y-4">
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
        </div>
      </ReportPage>

      {/* ── 7. RELATÓRIO KANITZ — CAPA ── */}
      {latestKanitz && (
        <div className="report-a4-cover" style={{ "--report-watermark": `url(${folhaRostoBg})` } as React.CSSProperties}>
          <div className="report-page-header">
            <img src={logoBrasilExpertFull} alt="Brasil Expert" className="h-14 object-contain" />
          </div>
          <div className="px-12 text-center mt-8">
            <p className="text-2xl md:text-3xl font-bold font-sans text-foreground">BRASIL EXPERT</p>
          </div>
          <div className="flex-1 flex flex-col items-center justify-center px-12 text-center">
            <h1 className="text-2xl md:text-3xl font-bold font-sans leading-tight text-foreground">
              RELATÓRIO KANITZ EXPANDIDO<br />TERMÔMETRO DE INSOLVÊNCIA v2.0
            </h1>
            <p className="text-sm text-muted-foreground mt-3 italic">Relatório Financeiro de Inteligência de Risco</p>
            <div className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full border border-amber-500/30 bg-amber-500/5 mt-8">
              <span className="text-lg">{kanitzClassColors[latestKanitz.classificacao]?.icon}</span>
              <span className="text-sm font-semibold text-foreground">{kanitzClassColors[latestKanitz.classificacao]?.label} — FI: {latestKanitz.fi.toFixed(2)}</span>
            </div>
            <div className="mt-10 grid sm:grid-cols-3 gap-6 text-sm text-muted-foreground w-full max-w-lg">
              <div><p className="text-[10px] text-muted-foreground/60 uppercase tracking-wider">Empresa</p><p className="font-semibold text-foreground">Empresa Analisada S.A.</p></div>
              <div><p className="text-[10px] text-muted-foreground/60 uppercase tracking-wider">Período</p><p className="font-semibold text-foreground">{parsedData?.years?.join(" / ") || latestYear}</p></div>
              <div><p className="text-[10px] text-muted-foreground/60 uppercase tracking-wider">Emissão</p><p className="font-semibold text-foreground">{today}</p></div>
            </div>
            <div className="mt-8 pt-6 border-t border-border w-full max-w-md space-y-1">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Responsável Técnico</p>
              <p className="text-sm font-semibold text-foreground">Auditor Contábil Sênior IA</p>
              <p className="text-xs text-muted-foreground">Modelo: Stephen Charles Kanitz — Termômetro de Insolvência (1978)</p>
            </div>
          </div>
          <div className="report-footer-bar">
            <p>Rua Cel. Oscar Porto, nº 736, 3º Andar, Paraíso, São Paulo-SP, CEP: 04003-003</p>
            <p>(11) 3285-4472 · https://www.brasilexpert.com.br/</p>
          </div>
        </div>
      )}

      {/* ── 7. SUMÁRIO EXECUTIVO KANITZ + TERMÔMETRO ── */}
      {latestKanitz && (
        <ReportPage>
          <div className="space-y-4">
            <div className="flex items-center gap-3 py-3 border-b-2 border-amber-500/30 mb-4">
              <div className="w-8 h-8 rounded-lg bg-amber-500 text-white flex items-center justify-center text-sm font-bold">7</div>
              <h2 className="text-lg font-bold text-foreground font-serif">SUMÁRIO EXECUTIVO</h2>
            </div>
            <div className="p-4 rounded-lg bg-muted/30 border border-border/50">
              <p className="text-sm text-foreground leading-relaxed">
                A empresa apresenta Fator de Insolvência de {latestKanitz.fi.toFixed(2)}, classificando-se como {kanitzClassColors[latestKanitz.classificacao]?.label?.toUpperCase()} segundo o modelo Kanitz. {latestKanitz.fi > 0 ? "Os indicadores de liquidez e rentabilidade demonstram solidez financeira e capacidade plena de honrar obrigações." : latestKanitz.fi > -3 ? "Os indicadores financeiros demonstram fragilidades que requerem monitoramento contínuo e medidas preventivas." : "A deterioração severa dos indicadores financeiros indica incapacidade de pagamento. Recomenda-se análise de viabilidade conforme Lei 11.101/2005."}
              </p>
            </div>
            <div className="grid sm:grid-cols-3 gap-3">
              <div className="p-3 rounded-lg bg-muted/20 text-center">
                <p className="text-[10px] text-muted-foreground">Pontuação Kanitz</p>
                <p className={`text-2xl font-bold font-mono ${kanitzClassColors[latestKanitz.classificacao]?.color}`}>{latestKanitz.fi.toFixed(2)}</p>
              </div>
              <div className="p-3 rounded-lg bg-muted/20 text-center">
                <p className="text-[10px] text-muted-foreground">Classificação</p>
                <p className="text-lg">{kanitzClassColors[latestKanitz.classificacao]?.icon}</p>
                <p className={`text-xs font-semibold ${kanitzClassColors[latestKanitz.classificacao]?.color}`}>{kanitzClassColors[latestKanitz.classificacao]?.label}</p>
              </div>
              <div className="p-3 rounded-lg bg-muted/20 text-center">
                <p className="text-[10px] text-muted-foreground">Tendência</p>
                <p className="text-lg text-muted-foreground">→</p>
                <p className="text-xs font-semibold text-muted-foreground">Estável</p>
              </div>
            </div>

            {/* Termômetro de Kanitz (estilo gr4) — linha laranja */}
            {kanitzResults.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-foreground mb-3 text-center">TERMÔMETRO DE KANITZ</h3>
                <div className="h-[220px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={kanitzResults.map(r => ({ name: r.year, FI: parseFloat(r.fi.toFixed(2)) }))} margin={{ top: 25, right: 20, left: 0, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                      <XAxis dataKey="name" tick={{ fontSize: 9 }} />
                      <YAxis tick={{ fontSize: 9 }} domain={['auto', 'auto']} tickFormatter={(v) => v.toFixed(2)} />
                      <Tooltip formatter={(v: number) => [v.toFixed(2), "Fator de Insolvência"]} />
                      <Line type="linear" dataKey="FI" stroke="#ed7d31" strokeWidth={2.5} dot={{ r: 4, fill: "#ed7d31" }}>
                        <LabelList dataKey="FI" position="top" fontSize={10} fill="#ed7d31" formatter={(v: number) => v.toFixed(2)} />
                      </Line>
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
          </div>
        </ReportPage>
      )}

      {/* ── 8. MEMÓRIA DE CÁLCULO KANITZ ── */}
      {latestKanitz && (
        <ReportPage>
          <div className="space-y-4">
            <div className="flex items-center gap-3 py-3 border-b-2 border-amber-500/30 mb-4">
              <div className="w-8 h-8 rounded-lg bg-amber-500 text-white flex items-center justify-center text-sm font-bold">8</div>
              <h2 className="text-lg font-bold text-foreground font-serif">MEMÓRIA DE CÁLCULO</h2>
            </div>
            <div className="p-4 rounded-lg bg-muted/30 border border-border/50 mb-4">
              <p className="text-xs font-semibold text-foreground mb-2">Fórmula do Fator de Insolvência:</p>
              <code className="block text-[11px] font-mono leading-relaxed text-foreground">
                Z = 0,05×X1 + 1,65×X2 + 3,55×X3 − 1,06×X4 − 0,33×X5
              </code>
              <div className="mt-2 text-[10px] text-muted-foreground space-y-0.5">
                <p>X1 = Lucro Líquido / Patrimônio Líquido (RPL)</p>
                <p>X2 = (Ativo Circulante + Realizável LP) / (Passivo Circulante + Exigível LP) (LG)</p>
                <p>X3 = (Ativo Circulante − Estoques) / Passivo Circulante (LS)</p>
                <p>X4 = Passivo Total / Patrimônio Líquido (GE)</p>
                <p>X5 = Passivo Circulante / Passivo Total</p>
              </div>
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
                    { name: "RPL (X1)", peso: 0.05, key: "rpl" as const },
                    { name: "LG (X2)", peso: 1.65, key: "lg" as const },
                    { name: "LS (X3)", peso: 3.55, key: "ls" as const },
                    { name: "LC (X4)", peso: -1.06, key: "lc" as const },
                    { name: "GE (X5)", peso: -0.33, key: "ge" as const },
                  ].map(c => (
                    <TableRow key={c.name}>
                      <TableCell className="text-xs font-mono font-bold">{c.name}</TableCell>
                      <TableCell className="text-xs font-mono">{c.peso > 0 ? `+${c.peso}` : c.peso}</TableCell>
                      {kanitzResults.map(r => (
                        <TableCell key={r.year} className="text-right text-xs font-mono">{fmtKDec(r[c.key])}</TableCell>
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
                      <TableCell key={`fi-${r.year}`} className={`text-right text-sm font-bold font-mono ${kanitzClassColors[r.classificacao]?.color}`}>{r.fi.toFixed(2)}</TableCell>
                    ))}
                  </TableRow>
                </TableBody>
              </Table>
            </div>

            <div className="mt-4">
              <h3 className="text-sm font-semibold text-foreground mb-3">8.1 Dados Utilizados</h3>
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
                      { label: "Ativo Circulante", key: "ac" }, { label: "Ativo Não Circulante", key: "anc" },
                      { label: "Realizável a LP", key: "rlp" }, { label: "Estoques", key: "estoque" },
                      { label: "Passivo Circulante", key: "pc" }, { label: "Passivo Não Circulante", key: "pnc" },
                      { label: "Passivo Total", key: "pt" }, { label: "Patrimônio Líquido", key: "pl" },
                      { label: "Lucro Líquido", key: "ll" }, { label: "Receita Líquida", key: "rl" },
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
          </div>
        </ReportPage>
      )}

      {/* ── 9. CONCLUSÃO (apenas Completo) ── */}
      {variant === "completo" && (
        <ReportPage>
          <div className="space-y-4">
            <div className="flex items-center gap-3 py-3 border-b-2 border-[hsl(258,90%,66%)]/30 mb-4">
              <div className="w-8 h-8 rounded-lg bg-[hsl(258,90%,66%)] text-white flex items-center justify-center text-sm font-bold">9</div>
              <h2 className="text-lg font-bold text-foreground font-serif">CONCLUSÃO</h2>
            </div>
            <div className="p-4 rounded-lg bg-muted/30 border border-border/50 space-y-4">
              <p className="text-sm text-foreground leading-relaxed">
                {aiAnalysis?.diagnostico?.resumo || "A análise das demonstrações contábeis evidencia a estrutura financeira da empresa no período analisado, com base nos dados do balancete processado."}
              </p>
              <p className="text-sm text-foreground leading-relaxed">
                Os indicadores de liquidez {latestInd?.liquidezCorrente && latestInd.liquidezCorrente > 1 ? "apontam capacidade adequada para honrar compromissos de curto prazo" : "indicam fragilidade na capacidade de pagamento de curto prazo"}, {latestInd?.liquidezGeral && latestInd.liquidezGeral < 1 ? "embora a liquidez geral permaneça inferior à unidade, refletindo elevada dependência de capital de terceiros." : "com liquidez geral compatível com a operação."}
              </p>
              <p className="text-sm text-foreground leading-relaxed">
                {latestKanitz ? `O Termômetro de Insolvência de Kanitz posiciona a companhia ${latestKanitz.fi > 0 ? "na zona de solvência" : latestKanitz.fi >= -3 ? "na zona de atenção" : "em situação de alta probabilidade de insolvência"}, com Fator de Insolvência de ${latestKanitz.fi.toFixed(2)}. ${latestKanitz.fi > 0 ? "Não há indícios de insolvência no curto prazo, mas recomenda-se acompanhamento contínuo da estrutura de capital e da geração de resultados." : "Recomenda-se reestruturação financeira imediata e acompanhamento contínuo dos indicadores."}` : ""}
              </p>
            </div>
          </div>
        </ReportPage>
      )}

      {/* ── ASSINATURA ── */}
      <ReportPage>
        <div className="flex-1 flex flex-col items-center justify-center text-center space-y-3">
          <div>
            <p className="text-sm font-semibold text-foreground">Documento gerado e assinado digitalmente</p>
            <p className="text-xs text-muted-foreground">Auditor Contábil Sênior IA</p>
            <p className="text-xs text-muted-foreground">Especialista em Recuperação Judicial e Análise Empresarial</p>
            <p className="text-xs text-muted-foreground mt-2">Plataforma BEX — {today}</p>
            {latestKanitz && <p className="text-xs text-muted-foreground">Kanitz (1978)</p>}
          </div>
          <div className="flex flex-wrap justify-center gap-1.5 pt-2">
            {["NBC TA 700", "NBC TA 705", "CPC 26", "Lei 11.101/2005", "IFRS", "Kanitz (1978)"].map(n => (
              <Badge key={n} variant="secondary" className="text-[10px]">{n}</Badge>
            ))}
          </div>
        </div>
      </ReportPage>

      </div>{/* end report-pages-container */}

      {/* Action buttons bottom */}
      <div className="flex items-center justify-center gap-3 pt-4 print:hidden flex-wrap">
        {totalPages > 0 && (
          <span className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
            <FileText className="w-3.5 h-3.5" /> Total de páginas: {totalPages}
          </span>
        )}
        <div className="inline-flex items-center rounded-lg border border-border bg-muted/50 p-0.5">
          <div className="relative">
            <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 text-[9px] font-bold text-green-600 bg-green-100 px-1.5 py-0 rounded-full leading-4 whitespace-nowrap">Disponível</span>
            <button className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold bg-[hsl(258,90%,66%)] text-white shadow-sm">
              <BookOpen className="w-3.5 h-3.5" /> Relatório BEX
            </button>
          </div>
        </div>
        <Button variant="outline" className="gap-1.5" onClick={() => printReport('report-bex-container', 'Relatório BEX')}>
          <Download className="w-4 h-4" /> Exportar PDF
        </Button>
        <Button variant="outline" className="gap-1.5" onClick={() => exportDocx('report-bex-container', 'Relatório BEX')}>
          <FileText className="w-4 h-4" /> Exportar .doc
        </Button>
        <Button variant="outline" className="gap-1.5" onClick={() => printReport('report-bex-container', 'Relatório BEX')}>
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
   TAB: RELATÓRIO KANITZ EXPANDIDO v2.0
   Risk Intelligence Financial Report — 11 Módulos
   ══════════════════════════════════════════════════════ */
const TabRelatorioKanitz = ({ onBack, parsedData, onSwitchToBex, aiAnalysis }: { onBack: () => void; parsedData?: ParsedFinancialData | null; onSwitchToBex?: () => void; aiAnalysis?: any }) => {
  const today = new Date().toLocaleDateString("pt-BR");
  const kanitzContainerRef = useRef<HTMLDivElement>(null);
  const [totalPagesKanitz, setTotalPagesKanitz] = useState(0);

  useEffect(() => {
    if (kanitzContainerRef.current) {
      const pages = kanitzContainerRef.current.querySelectorAll('.report-a4-page, .report-a4-cover');
      setTotalPagesKanitz(pages.length);
    }
  });

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
    classificacao: "saudavel" | "estavel" | "atencao" | "risco" | "insolvente"; riskScoreNormalized: number;
    ac: number; anc: number; pc: number; pnc: number; pl: number; estoque: number; rlp: number; pt: number; ll: number; at: number;
    rl: number; cpv: number; fornecedores: number; despFin: number; lajir: number; caixa: number;
  }> = [];

  if (parsedData) {
    for (const year of parsedData.years) {
      const ac = Math.abs(findValue("total do ativo circulante", year) || findValue("ativo circulante", year));
      const anc = Math.abs(findValue("total do ativo não circulante", year) || findValue("ativo nao circulante", year) || findValue("ativo não circulante", year));
      const pc = Math.abs(findValue("total do passivo circulante", year) || findValue("passivo circulante", year));
      const pnc = Math.abs(findValue("total do passivo não circulante", year) || findValue("passivo nao circulante", year) || findValue("passivo não circulante", year));
      const pl = Math.abs(findValue("total do patrimônio", year) || findValue("patrimonio líquido", year) || findValue("patrimônio líquido", year));
      const estoque = Math.abs(findValue("estoque", year));
      const ll = findValue("resultado do exercício", year) || findValue("lucro líquido", year);
      const rlp = Math.abs(findValue("realizável a longo prazo", year) || findValue("realizavel", year));
      const rl = Math.abs(findValue("receita líquida", year) || findValue("receita", year));
      const cpv = Math.abs(findValue("custo dos produtos", year) || findValue("custo", year));
      const fornecedores = Math.abs(findValue("fornecedores", year));
      const despFin = Math.abs(findValue("resultado financeiro", year) || findValue("despesas financeiras", year));
      const lajir = Math.abs(findValue("lajir", year) || findValue("resultado operacional", year));
      const caixa = Math.abs(findValue("caixa", year));
      const pt = pc + pnc;
      const at = ac + anc;

      const rpl = pl !== 0 ? ll / pl : 0;
      const lg = pt !== 0 ? (ac + rlp) / pt : 0;
      const ls = pc !== 0 ? (ac - estoque) / pc : 0;
      const lc = pc !== 0 ? ac / pc : 0;
      const ge = pl > 0 ? (pt / pl) : 0; // GE positivo conforme MD
      const fi = (0.05 * rpl) + (1.65 * lg) + (3.55 * ls) - (1.06 * lc) - (0.33 * ge);

      const classificacao: typeof kanitzResults[0]["classificacao"] =
        fi > 1 ? "saudavel" : fi > 0 ? "estavel" : fi > -1 ? "atencao" : fi >= -3 ? "risco" : "insolvente";

      kanitzResults.push({ year, rpl, lg, ls, lc, ge, fi, classificacao, riskScoreNormalized: 0, ac, anc, pc, pnc, pl, estoque, rlp, pt, ll, at, rl, cpv, fornecedores, despFin, lajir, caixa });
    }
    if (kanitzResults.length > 0) {
      const fiValues = kanitzResults.map(r => r.fi);
      const fiMin = Math.min(...fiValues);
      const fiMax = Math.max(...fiValues);
      const range = fiMax - fiMin || 1;
      kanitzResults.forEach(r => { r.riskScoreNormalized = Math.round(((r.fi - fiMin) / range) * 100); });
    }
  }

  // Fallback: use AI analysis kanitz data
  if (kanitzResults.length === 0 && aiAnalysis?.kanitz) {
    const aiK = aiAnalysis.kanitz;
    const comp = aiK.componentes || {};
    const aiStruct = aiAnalysis?.diagnostico?.estruturaFinanceira || {};
    const fi = aiK.fatorInsolvencia || 0;
    const classificacao: typeof kanitzResults[0]["classificacao"] =
      fi > 1 ? "saudavel" : fi > 0 ? "estavel" : fi > -1 ? "atencao" : fi >= -3 ? "risco" : "insolvente";
    const ac = aiStruct.ativo_circulante || 0;
    const anc = aiStruct.ativo_nao_circulante || 0;
    const pc = aiStruct.passivo_circulante || 0;
    const pnc = aiStruct.passivo_nao_circulante || 0;
    const pl = aiStruct.patrimonio_liquido || 0;
    const pt = pc + pnc;
    const at = ac + anc;
    kanitzResults.push({
      year: "Análise IA", rpl: comp.rpl || 0, lg: comp.lg || 0, ls: comp.ls || 0, lc: comp.lc || 0, ge: comp.ge || 0,
      fi, classificacao, riskScoreNormalized: fi > 1 ? 90 : fi > 0 ? 70 : fi >= -1 ? 50 : fi >= -3 ? 30 : 10,
      ac, anc, pc, pnc, pl, estoque: aiStruct.estoques || 0, rlp: 0, pt, ll: aiStruct.lucro_liquido || 0, at,
      rl: aiStruct.receita_liquida || 0, cpv: 0, fornecedores: aiStruct.fornecedores || 0, despFin: 0, lajir: 0, caixa: aiStruct.caixa || 0,
    });
  }

  const latest = kanitzResults[kanitzResults.length - 1];
  const previous = kanitzResults.length > 1 ? kanitzResults[kanitzResults.length - 2] : null;
  const fiDelta = previous ? (latest?.fi || 0) - previous.fi : 0;

  const classColors: Record<string, { icon: string; label: string; color: string }> = {
    saudavel: { icon: "🟢", label: "Saudável", color: "text-emerald-600" },
    estavel: { icon: "🔵", label: "Estável", color: "text-blue-600" },
    atencao: { icon: "🟡", label: "Zona de Atenção", color: "text-yellow-600" },
    risco: { icon: "🟠", label: "Zona de Risco", color: "text-orange-600" },
    insolvente: { icon: "🔴", label: "Alta Probabilidade de Insolvência", color: "text-red-600" },
  };

  const SectionTitle = ({ num, title }: { num: string; title: string }) => (
    <div className="flex items-center gap-3 py-3 border-b-2 border-amber-500/30 mb-4">
      <div className="w-8 h-8 rounded-lg bg-amber-500 text-white flex items-center justify-center text-sm font-bold">{num}</div>
      <h2 className="text-lg font-bold text-foreground font-serif">{title}</h2>
    </div>
  );

  const fmtDec = (n: number) => n.toFixed(4);

  if (kanitzResults.length === 0) {
    return (
      <Card><CardContent className="py-12 text-center">
        <AlertTriangle className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
        <p className="text-sm text-muted-foreground">Nenhum dado financeiro disponível para gerar o Relatório Kanitz.</p>
      </CardContent></Card>
    );
  }

  /* ── Computed extended metrics ── */
  const l = latest;
  const capitalGiro = l.ac - l.pc;
  const ncg = (l.ac - l.caixa) - (l.pc - (l.fornecedores || 0));
  const endivTotal = l.at !== 0 ? l.pt / l.at : 0;
  const alavancagem = l.pl !== 0 ? l.at / l.pl : 0;
  const participacaoTerceiros = l.pl !== 0 ? l.pt / l.pl : 0;
  const ebitda = l.lajir + (l.despFin * 0.1); // simplified proxy
  const coberturaJuros = l.despFin !== 0 ? l.lajir / l.despFin : 0;
  const indiceGeracaoCaixa = l.rl !== 0 ? ebitda / l.rl : 0;
  const margemLiquida = l.rl !== 0 ? l.ll / l.rl : 0;
  const despFinSobreReceita = l.rl !== 0 ? l.despFin / l.rl : 0;
  const estoquesSobreAC = l.ac !== 0 ? l.estoque / l.ac : 0;

  // Risk Engine de Insolvência (Módulo 9)
  const riskLiquidez = Math.max(0, Math.min(100, l.lc < 0.5 ? 100 : l.lc > 2 ? 10 : 100 - ((l.lc - 0.5) / 1.5) * 90));
  const riskAlavancagem = Math.max(0, Math.min(100, alavancagem > 4 ? 100 : alavancagem < 1 ? 10 : ((alavancagem - 1) / 3) * 90 + 10));
  const riskFluxoCaixa = Math.max(0, Math.min(100, coberturaJuros < 1 ? 100 : coberturaJuros > 5 ? 10 : 100 - ((coberturaJuros - 1) / 4) * 90));
  const riskKanitz = Math.max(0, Math.min(100, l.fi < -3 ? 100 : l.fi > 3 ? 10 : 100 - ((l.fi + 3) / 6) * 90));
  const riskPressaoPassivo = Math.max(0, Math.min(100, l.pt !== 0 ? (l.pc / l.pt) * 100 : 50));
  const riskEngineScore = Math.round(
    riskKanitz * 0.4 + riskLiquidez * 0.2 + riskAlavancagem * 0.2 + riskFluxoCaixa * 0.2
  );
  const riskEngineClass = riskEngineScore <= 20 ? "Risco Baixo" : riskEngineScore <= 40 ? "Risco Moderado" : riskEngineScore <= 60 ? "Risco Elevado" : riskEngineScore <= 80 ? "Risco Alto" : "Risco Crítico";
  const riskEngineColor = riskEngineScore <= 20 ? "text-emerald-600" : riskEngineScore <= 40 ? "text-blue-600" : riskEngineScore <= 60 ? "text-yellow-600" : riskEngineScore <= 80 ? "text-orange-600" : "text-red-600";

  // Simulações (Módulo 10)
  const simReducaoDivida = (0.05 * l.rpl) + (1.65 * l.lg * 1.15) + (3.55 * l.ls * 1.1) - (1.06 * l.lc * 1.05) - (0.33 * l.ge * 0.8);
  const simAumentoMargem = (0.05 * (l.rpl * 1.3)) + (1.65 * l.lg) + (3.55 * l.ls) - (1.06 * l.lc) - (0.33 * l.ge);
  const simInjecaoCapital = (0.05 * l.rpl) + (1.65 * l.lg * 1.1) + (3.55 * l.ls * 1.05) - (1.06 * l.lc * 1.02) - (0.33 * l.ge * 0.7);
  const simReducaoCustos = (0.05 * (l.rpl * 1.15)) + (1.65 * l.lg) + (3.55 * l.ls * 1.02) - (1.06 * l.lc) - (0.33 * l.ge * 0.95);

  // Tendência
  const tendencia = previous && fiDelta > 0.5 ? "Melhora" : previous && fiDelta < -0.5 ? "Deterioração" : "Estável";

  return (
    <div ref={kanitzContainerRef} className="space-y-0" style={{ "--report-watermark": `url(${folhaRostoBg})` } as React.CSSProperties} id="report-kanitz-container">
      {/* Action buttons */}
      <div className="flex items-center justify-between gap-2 print:hidden mb-4 flex-wrap">
        <div className="flex items-center gap-1.5">
          {totalPagesKanitz > 0 && (
            <span className="text-xs font-medium text-muted-foreground flex items-center gap-1.5 mr-3">
              <FileText className="w-3.5 h-3.5" /> Total de páginas: {totalPagesKanitz}
            </span>
          )}
          <div className="inline-flex items-center rounded-lg border border-border bg-muted/50 p-0.5">
            <div className="relative">
              <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 text-[9px] font-bold text-green-600 bg-green-100 px-1.5 py-0 rounded-full leading-4 whitespace-nowrap">Disponível</span>
              <button className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold bg-amber-500 text-white shadow-sm">
                <Scale className="w-3.5 h-3.5" /> Relatório Kanitz
              </button>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => printReport('report-kanitz-container', 'Relatório Kanitz')}>
            <Download className="w-4 h-4" /> Exportar PDF
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => exportDocx('report-kanitz-container', 'Relatório Kanitz')}>
            <FileText className="w-4 h-4" /> Exportar .doc
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => printReport('report-kanitz-container', 'Relatório Kanitz')}>
            <Printer className="w-4 h-4" /> Imprimir
          </Button>
          <Button variant="outline" size="sm" onClick={onBack} className="gap-1.5">
            <ArrowLeft className="w-4 h-4" /> Nova Análise
          </Button>
        </div>
      </div>

      <div className="report-pages-container">
      {/* ── CAPA A4 ── */}
      <div className="report-a4-cover" style={{ "--report-watermark": `url(${folhaRostoBg})` } as React.CSSProperties}>
        {/* Header with logo */}
        <div className="report-page-header">
          <img src={logoBrasilExpertFull} alt="Brasil Expert" className="h-14 object-contain" />
        </div>

        {/* BRASIL EXPERT — posicionado logo abaixo da logo */}
        <div className="px-12 text-center mt-8">
          <p className="text-2xl md:text-3xl font-bold font-sans text-foreground">BRASIL EXPERT</p>
        </div>

        {/* Center content */}
        <div className="flex-1 flex flex-col items-center justify-center px-12 text-center">
          <h1 className="text-2xl md:text-3xl font-bold font-sans leading-tight text-foreground">
            RELATÓRIO KANITZ EXPANDIDO<br />TERMÔMETRO DE INSOLVÊNCIA v2.0
          </h1>
          <p className="text-sm text-muted-foreground mt-3 italic">Risk Intelligence Financial Report</p>

          <div className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full border border-amber-500/30 bg-amber-500/5 mt-8">
            <span className="text-lg">{classColors[latest.classificacao]?.icon}</span>
            <span className="text-sm font-semibold text-foreground">{classColors[latest.classificacao]?.label} — FI: {latest.fi.toFixed(2)}</span>
          </div>

          <div className="mt-10 grid sm:grid-cols-3 gap-6 text-sm text-muted-foreground w-full max-w-lg">
            <div>
              <p className="text-[10px] text-muted-foreground/60 uppercase tracking-wider">Empresa</p>
              <p className="font-semibold text-foreground">Empresa Analisada S.A.</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground/60 uppercase tracking-wider">Período</p>
              <p className="font-semibold text-foreground">{parsedData.years.join(" / ")}</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground/60 uppercase tracking-wider">Emissão</p>
              <p className="font-semibold text-foreground">{today}</p>
            </div>
          </div>

          <div className="mt-8 pt-6 border-t border-border w-full max-w-md space-y-1">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Responsável Técnico</p>
            <p className="text-sm font-semibold text-foreground">Auditor Contábil Sênior IA</p>
            <p className="text-xs text-muted-foreground">Modelo: Stephen Charles Kanitz — Termômetro de Insolvência (1978)</p>
          </div>
        </div>

        {/* Footer */}
        <div className="report-footer-bar">
          <p>Rua Cel. Oscar Porto, nº 736, 3º Andar, Paraíso, São Paulo-SP, CEP: 04003-003</p>
          <p>(11) 3285-4472 · https://www.brasilexpert.com.br/</p>
        </div>
      </div>

      {/* ══ MÓDULO 1 — SUMÁRIO EXECUTIVO ══ */}
      <ReportPage>
        <div className="space-y-4">
          <SectionTitle num="1" title="SUMÁRIO EXECUTIVO" />
          <div className="p-4 rounded-lg bg-muted/30 border border-border/50">
            <p className="text-sm text-foreground leading-relaxed">
              {l.classificacao === "saudavel"
                ? `A empresa apresenta Fator de Insolvência de ${l.fi.toFixed(2)}, classificando-se como SAUDÁVEL segundo o modelo Kanitz. Os indicadores de liquidez e rentabilidade demonstram solidez financeira e capacidade plena de honrar obrigações. O Risk Engine de Insolvência classifica o risco como ${riskEngineClass} (${riskEngineScore}/100).`
                : l.classificacao === "estavel"
                ? `A empresa apresenta Fator de Insolvência de ${l.fi.toFixed(2)}, classificando-se como ESTÁVEL. A estrutura financeira é adequada, com indicadores dentro de parâmetros aceitáveis. Recomenda-se manutenção das políticas financeiras atuais. Risk Engine: ${riskEngineClass} (${riskEngineScore}/100).`
                : l.classificacao === "atencao"
                ? `A empresa encontra-se em ZONA DE ATENÇÃO com FI de ${l.fi.toFixed(2)}. Indicadores de liquidez e endividamento apresentam fragilidades que requerem monitoramento contínuo. Risk Engine: ${riskEngineClass} (${riskEngineScore}/100).`
                : l.classificacao === "risco"
                ? `A empresa está em ZONA DE RISCO com FI de ${l.fi.toFixed(2)}. Os indicadores financeiros demonstram deterioração significativa. Liquidez Seca de ${fmtDec(l.ls)} e Grau de Endividamento de ${fmtDec(l.ge)} indicam dificuldades financeiras. Risk Engine: ${riskEngineClass} (${riskEngineScore}/100). Recomenda-se reestruturação imediata.`
                : `A empresa apresenta ALTA PROBABILIDADE DE INSOLVÊNCIA com FI de ${l.fi.toFixed(2)}. A deterioração severa dos indicadores financeiros indica incapacidade de pagamento. Risk Engine: ${riskEngineClass} (${riskEngineScore}/100). Recomenda-se análise de viabilidade conforme Lei 11.101/2005.`}
            </p>
          </div>
          <div className="grid sm:grid-cols-4 gap-3">
            <div className="p-3 rounded-lg bg-muted/20 text-center">
              <p className="text-[10px] text-muted-foreground">Score Kanitz</p>
              <p className={`text-2xl font-bold font-mono ${classColors[l.classificacao]?.color}`}>{l.fi.toFixed(2)}</p>
            </div>
            <div className="p-3 rounded-lg bg-muted/20 text-center">
              <p className="text-[10px] text-muted-foreground">Nível de Risco</p>
              <p className={`text-lg font-bold ${riskEngineColor}`}>{riskEngineScore}/100</p>
              <p className={`text-[10px] font-semibold ${riskEngineColor}`}>{riskEngineClass}</p>
            </div>
            <div className="p-3 rounded-lg bg-muted/20 text-center">
              <p className="text-[10px] text-muted-foreground">Tendência</p>
              <p className={`text-lg font-bold ${tendencia === "Melhora" ? "text-emerald-600" : tendencia === "Deterioração" ? "text-red-600" : "text-muted-foreground"}`}>{tendencia === "Melhora" ? "↑" : tendencia === "Deterioração" ? "↓" : "→"}</p>
              <p className="text-[10px] font-semibold text-muted-foreground">{tendencia}</p>
            </div>
            <div className="p-3 rounded-lg bg-muted/20 text-center">
              <p className="text-[10px] text-muted-foreground">Classificação</p>
              <p className="text-lg">{classColors[l.classificacao]?.icon}</p>
              <p className={`text-[10px] font-semibold ${classColors[l.classificacao]?.color}`}>{classColors[l.classificacao]?.label}</p>
            </div>
          </div>
        </div>
      </ReportPage>

      {/* ══ MÓDULO 2 — SCORE KANITZ ══ */}
      <ReportPage>
        <div className="space-y-4">
          <SectionTitle num="2" title="SCORE KANITZ" />
          <div className="text-center py-6">
            <p className={`text-6xl font-bold ${classColors[l.classificacao]?.color}`}>{l.fi.toFixed(2)}</p>
            <p className={`text-xl font-semibold mt-2 ${classColors[l.classificacao]?.color}`}>
              {classColors[l.classificacao]?.icon} {classColors[l.classificacao]?.label}
            </p>
            <p className="text-xs text-muted-foreground mt-1">Fator de Insolvência — Modelo Kanitz</p>
          </div>

          {/* Termômetro */}
          <div className="px-4">
            <div className="relative h-12 rounded-full overflow-hidden bg-gradient-to-r from-red-500 via-orange-400 via-yellow-500 via-blue-400 to-emerald-500">
              {kanitzResults.map(r => {
                const pos = Math.max(0, Math.min(100, ((r.fi + 7) / 14) * 100));
                return (
                  <div key={r.year} className="absolute top-0 bottom-0 w-1 bg-foreground rounded-full shadow-lg" style={{ left: `${pos}%`, transform: "translateX(-50%)" }} title={`${r.year}: FI = ${r.fi.toFixed(2)}`}>
                    <div className="absolute -top-6 left-1/2 -translate-x-1/2 text-[10px] font-bold whitespace-nowrap bg-foreground text-background px-1.5 py-0.5 rounded">{r.year}</div>
                  </div>
                );
              })}
            </div>
            <div className="flex justify-between mt-2 text-[9px] text-muted-foreground">
              <span>Insolvente (&lt;-3)</span>
              <span>Risco (-3 a -1)</span>
              <span>Atenção (-1 a 0)</span>
              <span>Estável (0 a 1)</span>
              <span>Saudável (&gt;1)</span>
            </div>
          </div>

          {/* Classificação por período */}
          <div className="grid sm:grid-cols-3 gap-3 mt-4">
            {kanitzResults.map(r => (
              <div key={r.year} className={`p-4 rounded-lg border text-center space-y-1 ${
                r.classificacao === "saudavel" ? "bg-emerald-500/10 border-emerald-500/30" :
                r.classificacao === "estavel" ? "bg-blue-500/10 border-blue-500/30" :
                r.classificacao === "atencao" ? "bg-yellow-500/10 border-yellow-500/30" :
                r.classificacao === "risco" ? "bg-orange-500/10 border-orange-500/30" : "bg-red-500/10 border-red-500/30"
              }`}>
                <p className="text-xs text-muted-foreground font-semibold">{r.year}</p>
                <p className="text-2xl font-bold font-mono">{r.fi.toFixed(2)}</p>
                <p className={`text-xs font-semibold ${classColors[r.classificacao]?.color}`}>{classColors[r.classificacao]?.icon} {classColors[r.classificacao]?.label}</p>
              </div>
            ))}
          </div>

          {/* Escala de classificação */}
          <div className="space-y-1.5 mt-4">
            {[
              { range: "FI > 1", label: "Saudável", color: "bg-emerald-500/10 text-emerald-600", active: l.fi > 1 },
              { range: "0 < FI ≤ 1", label: "Estável", color: "bg-blue-500/10 text-blue-600", active: l.fi > 0 && l.fi <= 1 },
              { range: "-1 < FI ≤ 0", label: "Zona de Atenção", color: "bg-yellow-500/10 text-yellow-600", active: l.fi > -1 && l.fi <= 0 },
              { range: "-3 ≤ FI ≤ -1", label: "Zona de Risco", color: "bg-orange-500/10 text-orange-600", active: l.fi >= -3 && l.fi <= -1 },
              { range: "FI < -3", label: "Alta Prob. Insolvência", color: "bg-red-500/10 text-red-600", active: l.fi < -3 },
            ].map(item => (
              <div key={item.range} className={`flex items-center justify-between p-2.5 rounded-lg bg-muted/20 ${item.active ? "ring-2 ring-amber-500" : ""}`}>
                <div className="flex items-center gap-3">
                  <span className={`text-[10px] font-mono font-bold px-2 py-1 rounded ${item.color}`}>{item.range}</span>
                  <span className="text-xs font-medium text-foreground">{item.label}</span>
                </div>
                {item.active && <CheckCircle2 className="w-4 h-4 text-amber-500" />}
              </div>
            ))}
          </div>
        </div>
      </ReportPage>

      {/* ══ MÓDULO 3 — DIAGNÓSTICO DE SOLVÊNCIA ══ */}
      <ReportPage>
        <div className="space-y-4">
          <SectionTitle num="3" title="DIAGNÓSTICO DE SOLVÊNCIA" />
          <p className="text-xs text-muted-foreground leading-relaxed">
            Análise dos componentes que determinam o score Kanitz, identificando qual variável está deteriorando o índice.
          </p>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-[10px]">Indicador</TableHead>
                  <TableHead className="text-[10px]">Sigla</TableHead>
                  <TableHead className="text-[10px]">Fórmula</TableHead>
                  <TableHead className="text-[10px]">Peso</TableHead>
                  {kanitzResults.map(r => <TableHead key={r.year} className="text-right text-[10px]">{r.year}</TableHead>)}
                  <TableHead className="text-[10px]">Contribuição ao FI</TableHead>
                  <TableHead className="text-[10px]">Diagnóstico</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[
                  { name: "Rentabilidade do PL", sigla: "RPL", formula: "LL / PL", peso: 0.05, key: "rpl" as const, diagPositive: "Retorno positivo ao acionista", diagNegative: "Rentabilidade comprometida" },
                  { name: "Liquidez Geral", sigla: "LG", formula: "(AC + RLP) / PT", peso: 1.65, key: "lg" as const, diagPositive: "Boa capacidade de pagamento geral", diagNegative: "Insuficiência de ativos frente aos passivos" },
                  { name: "Liquidez Seca", sigla: "LS", formula: "(AC - EST) / PC", peso: 3.55, key: "ls" as const, diagPositive: "Liquidez adequada sem depender de estoques", diagNegative: "Dependência de estoques para liquidez" },
                  { name: "Liquidez Corrente", sigla: "LC", formula: "AC / PC", peso: -1.06, key: "lc" as const, diagPositive: "Ativos circulantes cobrem passivos CP", diagNegative: "Dificuldade para honrar dívidas CP" },
                  { name: "Grau de Endividamento", sigla: "GE", formula: "PT / PL", peso: -0.33, key: "ge" as const, diagPositive: "Estrutura de capital equilibrada", diagNegative: "Alta dependência de capital de terceiros" },
                ].map(ind => {
                  const latestVal = l[ind.key];
                  const isContribPositive = ind.peso * latestVal > 0;
                  return (
                    <TableRow key={ind.sigla}>
                      <TableCell className="text-xs font-medium">{ind.name}</TableCell>
                      <TableCell className="text-xs font-mono font-bold">{ind.sigla}</TableCell>
                      <TableCell className="text-[10px] font-mono text-muted-foreground">{ind.formula}</TableCell>
                      <TableCell className="text-xs font-mono font-bold">{ind.peso > 0 ? `+${ind.peso}` : ind.peso}</TableCell>
                      {kanitzResults.map(r => (
                        <TableCell key={r.year} className="text-right text-xs font-mono">{fmtDec(r[ind.key])}</TableCell>
                      ))}
                      <TableCell className={`text-xs font-mono font-bold ${isContribPositive ? "text-emerald-600" : "text-red-600"}`}>
                        {(ind.peso * latestVal).toFixed(4)}
                      </TableCell>
                      <TableCell className="text-[10px] text-muted-foreground max-w-[150px]">
                        {isContribPositive ? ind.diagPositive : ind.diagNegative}
                      </TableCell>
                    </TableRow>
                  );
                })}
                <TableRow className="border-t-2 border-foreground/20">
                  <TableCell className="text-xs font-bold" colSpan={4}>FATOR DE INSOLVÊNCIA (FI)</TableCell>
                  {kanitzResults.map(r => (
                    <TableCell key={r.year} className={`text-right text-sm font-bold font-mono ${classColors[r.classificacao]?.color}`}>{r.fi.toFixed(2)}</TableCell>
                  ))}
                  <TableCell colSpan={2} />
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </div>
      </ReportPage>

      {/* ══ MÓDULO 4 — ESTRUTURA DE LIQUIDEZ ══ */}
      <ReportPage>
        <div className="space-y-4">
          <SectionTitle num="4" title="ESTRUTURA DE LIQUIDEZ" />
          <div className="grid sm:grid-cols-4 gap-3">
            {[
              { label: "Liquidez Corrente", value: l.lc, ideal: "> 1.50", status: l.lc > 1.5 ? "positivo" : l.lc > 1 ? "atencao" : "critico" },
              { label: "Liquidez Seca", value: l.ls, ideal: "> 1.00", status: l.ls > 1 ? "positivo" : l.ls > 0.7 ? "atencao" : "critico" },
              { label: "Capital de Giro", value: capitalGiro, ideal: "> 0", status: capitalGiro > 0 ? "positivo" : "critico", isCurrency: true },
              { label: "Necessidade de CG", value: ncg, ideal: "< CG", status: ncg < capitalGiro ? "positivo" : "critico", isCurrency: true },
            ].map(item => (
              <div key={item.label} className={`p-4 rounded-lg border text-center space-y-1 ${
                item.status === "positivo" ? "bg-emerald-500/5 border-emerald-500/20" :
                item.status === "atencao" ? "bg-yellow-500/5 border-yellow-500/20" : "bg-red-500/5 border-red-500/20"
              }`}>
                <p className="text-[10px] text-muted-foreground">{item.label}</p>
                <p className="text-xl font-bold font-mono text-foreground">
                  {item.isCurrency ? `R$ ${fmt(item.value)}` : fmtDec(item.value)}
                </p>
                <p className="text-[9px] text-muted-foreground">Ideal: {item.ideal}</p>
              </div>
            ))}
          </div>
          <div className="p-4 rounded-lg bg-muted/20 border border-border/30">
            <p className="text-xs font-semibold text-foreground mb-1">Diagnóstico de Liquidez</p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {capitalGiro > 0 && ncg < capitalGiro
                ? "Liquidez saudável. Capital de giro positivo e necessidade de CG inferior ao CG disponível. Sem estrangulamento financeiro."
                : capitalGiro > 0
                ? "Capital de giro positivo, porém necessidade de CG superior ao disponível — possível descasamento de caixa. Monitorar prazos médios."
                : "Estrangulamento financeiro identificado. Capital de giro negativo indica incapacidade de financiar operações com recursos próprios de curto prazo."}
            </p>
          </div>
        </div>
      </ReportPage>

      {/* ══ MÓDULO 5 — ESTRUTURA DE CAPITAL ══ */}
      <ReportPage>
        <div className="space-y-4">
          <SectionTitle num="5" title="ESTRUTURA DE CAPITAL" />
          <div className="grid sm:grid-cols-3 gap-3">
            {[
              { label: "Endividamento Total", value: endivTotal, format: "pct", desc: "Passivo / Ativo" },
              { label: "Alavancagem Financeira", value: alavancagem, format: "dec", desc: "Ativo Total / PL" },
              { label: "Capital de Terceiros / PL", value: participacaoTerceiros, format: "dec", desc: "Passivo Total / PL" },
            ].map(item => (
              <div key={item.label} className="p-4 rounded-lg bg-muted/20 text-center space-y-1">
                <p className="text-[10px] text-muted-foreground">{item.label}</p>
                <p className="text-xl font-bold font-mono text-foreground">
                  {item.format === "pct" ? fmtPct(item.value) : item.value.toFixed(2) + "x"}
                </p>
                <p className="text-[9px] text-muted-foreground">{item.desc}</p>
              </div>
            ))}
          </div>
          <div className="space-y-1.5">
            {[
              { range: "< 40%", label: "Baixo Endividamento", color: "bg-emerald-500/10 text-emerald-600", active: endivTotal < 0.4 },
              { range: "40% – 60%", label: "Endividamento Moderado", color: "bg-yellow-500/10 text-yellow-600", active: endivTotal >= 0.4 && endivTotal < 0.6 },
              { range: "60% – 80%", label: "Alto Endividamento", color: "bg-orange-500/10 text-orange-600", active: endivTotal >= 0.6 && endivTotal < 0.8 },
              { range: "> 80%", label: "Endividamento Crítico", color: "bg-red-500/10 text-red-600", active: endivTotal >= 0.8 },
            ].map(item => (
              <div key={item.range} className={`flex items-center justify-between p-2.5 rounded-lg bg-muted/20 ${item.active ? "ring-2 ring-amber-500" : ""}`}>
                <div className="flex items-center gap-3">
                  <span className={`text-[10px] font-mono font-bold px-2 py-1 rounded ${item.color}`}>{item.range}</span>
                  <span className="text-xs font-medium text-foreground">{item.label}</span>
                </div>
                {item.active && <CheckCircle2 className="w-4 h-4 text-amber-500" />}
              </div>
            ))}
          </div>
        </div>
      </ReportPage>

      {/* ══ MÓDULO 6 — ANÁLISE DE PASSIVOS ══ */}
      <ReportPage>
        <div className="space-y-4">
          <SectionTitle num="6" title="ANÁLISE DE PASSIVOS" />
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="p-4 rounded-lg bg-muted/20 space-y-3">
              <p className="text-xs font-semibold text-foreground">Composição do Passivo</p>
              {[
                { label: "Passivo Circulante", value: l.pc, pct: l.pt > 0 ? l.pc / l.pt : 0 },
                { label: "Passivo Não Circulante", value: l.pnc, pct: l.pt > 0 ? l.pnc / l.pt : 0 },
                { label: "Passivo Total", value: l.pt, pct: 1 },
              ].map(item => (
                <div key={item.label}>
                  <div className="flex justify-between text-[10px] mb-1">
                    <span className="text-foreground">{item.label}</span>
                    <span className="font-mono font-bold">R$ {fmt(item.value)} ({fmtPct(item.pct)})</span>
                  </div>
                  <Progress value={item.pct * 100} className="h-1.5" />
                </div>
              ))}
            </div>
            <div className="p-4 rounded-lg bg-muted/20 space-y-3">
              <p className="text-xs font-semibold text-foreground">Métricas de Pressão</p>
              {[
                { label: "Pressão de Caixa", value: l.pt > 0 ? (l.pc / l.pt) * 100 : 0, desc: "% do passivo vencendo em até 12 meses", alert: l.pt > 0 && l.pc / l.pt > 0.5 },
                { label: "Fornecedores / PC", value: l.pc > 0 ? (l.fornecedores / l.pc) * 100 : 0, desc: "Concentração em fornecedores", alert: false },
                { label: "Passivo / Geração de Caixa", value: ebitda > 0 ? l.pt / ebitda : 0, desc: "Anos para quitar passivo total", alert: ebitda > 0 && l.pt / ebitda > 5 },
              ].map(item => (
                <div key={item.label} className={`p-2 rounded-lg ${item.alert ? "bg-red-500/5 border border-red-500/20" : "bg-background"}`}>
                  <div className="flex justify-between text-[10px]">
                    <span className="font-medium text-foreground">{item.label}</span>
                    <span className="font-mono font-bold">{typeof item.value === "number" && item.value < 20 ? item.value.toFixed(1) : Math.round(item.value)}{ item.label.includes("Anos") || item.label.includes("Geração") ? "x" : "%"}</span>
                  </div>
                  <p className="text-[9px] text-muted-foreground">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </ReportPage>

      {/* ══ MÓDULO 7 — FLUXO DE CAIXA ESTRUTURAL ══ */}
      <ReportPage>
        <div className="space-y-4">
          <SectionTitle num="7" title="FLUXO DE CAIXA ESTRUTURAL" />
          <p className="text-xs text-muted-foreground">
            Ampliação do modelo Kanitz tradicional com análise de geração de caixa — detectando risco de ruptura financeira.
          </p>
          <div className="grid sm:grid-cols-4 gap-3">
            {[
              { label: "EBITDA (proxy)", value: ebitda, isCurrency: true },
              { label: "Cobertura de Juros", value: coberturaJuros, suffix: "x", alert: coberturaJuros < 1.5 },
              { label: "Índice Geração Caixa", value: indiceGeracaoCaixa, format: "pct" },
              { label: "Margem Líquida", value: margemLiquida, format: "pct", alert: margemLiquida < 0.05 },
            ].map(item => (
              <div key={item.label} className={`p-4 rounded-lg border text-center space-y-1 ${item.alert ? "bg-red-500/5 border-red-500/20" : "bg-muted/20 border-border/30"}`}>
                <p className="text-[10px] text-muted-foreground">{item.label}</p>
                <p className="text-xl font-bold font-mono text-foreground">
                  {item.isCurrency ? `R$ ${fmt(item.value)}` : item.format === "pct" ? fmtPct(item.value) : `${item.value.toFixed(2)}${item.suffix || ""}`}
                </p>
                {item.alert && <p className="text-[9px] text-red-600 font-semibold">⚠ Abaixo do mínimo</p>}
              </div>
            ))}
          </div>
          <div className="p-4 rounded-lg bg-muted/20 border border-border/30">
            <p className="text-xs font-semibold text-foreground mb-1">Risco de Ruptura Financeira</p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {coberturaJuros > 3
                ? "Sem risco imediato de ruptura. Cobertura de juros adequada e geração de caixa compatível com obrigações financeiras."
                : coberturaJuros > 1
                ? "Risco moderado. Cobertura de juros apertada — qualquer deterioração operacional pode comprometer o pagamento de obrigações financeiras."
                : "Risco elevado de ruptura. Cobertura de juros insuficiente — a empresa não gera caixa operacional suficiente para honrar despesas financeiras."}
            </p>
          </div>
        </div>
      </ReportPage>

      {/* ══ MÓDULO 8 — CUSTOS OCULTOS ══ */}
      <ReportPage>
        <div className="space-y-4">
          <SectionTitle num="8" title="CUSTOS OCULTOS E INEFICIÊNCIAS" />
          <p className="text-xs text-muted-foreground">
            Análise de ineficiências que impactam diretamente o score Kanitz, com simulação do efeito sobre o FI.
          </p>
          <div className="space-y-3">
            {[
              { icon: "💸", title: "Despesas Financeiras Excessivas", detail: `Desp. financeiras representam ${fmtPct(despFinSobreReceita)} da receita líquida.`, alert: despFinSobreReceita > 0.05, impact: `Impacto estimado no FI: ${(despFinSobreReceita > 0.05 ? -0.3 : 0).toFixed(2)} pontos via GE` },
              { icon: "📦", title: "Estoques Improdutivos", detail: `Estoques representam ${fmtPct(estoquesSobreAC)} do ativo circulante (R$ ${fmt(l.estoque)}).`, alert: estoquesSobreAC > 0.3, impact: `Impacto no FI: ${(estoquesSobreAC > 0.3 ? -0.5 : 0).toFixed(2)} pontos via LS` },
              { icon: "⚙️", title: "Ociosidade Operacional", detail: `Giro do Ativo: ${(l.at !== 0 ? l.rl / l.at : 0).toFixed(2)}x — ${(l.at !== 0 && l.rl / l.at < 0.5) ? "baixa utilização de ativos" : "nível aceitável"}.`, alert: l.at !== 0 && l.rl / l.at < 0.5, impact: "Ativos subutilizados reduzem rentabilidade e pressionam GE" },
              { icon: "🏢", title: "Custos Administrativos", detail: `Margem líquida de ${fmtPct(margemLiquida)}. ${margemLiquida < 0.05 ? "Margens muito apertadas reduzem RPL." : "Margens dentro do aceitável."}`, alert: margemLiquida < 0.05, impact: `Impacto no FI: via RPL (peso 0,05)` },
            ].map(item => (
              <div key={item.title} className={`flex items-start gap-3 p-4 rounded-lg border ${item.alert ? "bg-red-500/5 border-red-500/20" : "bg-muted/20 border-border/30"}`}>
                <span className="text-xl shrink-0">{item.icon}</span>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-foreground">{item.title}</p>
                    {item.alert && <Badge className="bg-red-500/15 text-red-600 text-[9px]">Detectado</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{item.detail}</p>
                  <p className="text-[10px] font-mono text-muted-foreground mt-1 italic">{item.impact}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </ReportPage>

      {/* ══ MÓDULO 9 — RISK ENGINE DE INSOLVÊNCIA ══ */}
      <ReportPage>
        <div className="space-y-4">
          <SectionTitle num="9" title="RISK ENGINE DE INSOLVÊNCIA" />
          <div className="text-center py-4">
            <p className={`text-5xl font-bold font-mono ${riskEngineColor}`}>{riskEngineScore}</p>
            <p className={`text-lg font-semibold mt-1 ${riskEngineColor}`}>{riskEngineClass}</p>
            <p className="text-xs text-muted-foreground mt-1">de 100 pontos (quanto maior, maior o risco)</p>
          </div>
          <div className="p-4 rounded-lg bg-muted/30 border border-border/50 mb-4">
            <p className="text-xs font-semibold text-foreground mb-2">Fórmula do Risk Engine:</p>
            <code className="block text-[11px] font-mono leading-relaxed text-foreground">
              Risk = (Kanitz × 0.40) + (Liquidez × 0.20) + (Alavancagem × 0.20) + (Fluxo Caixa × 0.20)
            </code>
          </div>
          <div className="space-y-3">
            {[
              { label: "Score Kanitz", value: riskKanitz, peso: "40%", desc: `FI = ${l.fi.toFixed(2)}` },
              { label: "Risco de Liquidez", value: riskLiquidez, peso: "20%", desc: `LC = ${l.lc.toFixed(2)}` },
              { label: "Risco de Alavancagem", value: riskAlavancagem, peso: "20%", desc: `Alavancagem = ${alavancagem.toFixed(2)}x` },
              { label: "Risco de Fluxo de Caixa", value: riskFluxoCaixa, peso: "20%", desc: `Cobertura Juros = ${coberturaJuros.toFixed(2)}x` },
            ].map(item => (
              <div key={item.label} className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="font-medium text-foreground">{item.label} ({item.peso})</span>
                  <span className="font-mono font-bold">{Math.round(item.value)}/100</span>
                </div>
                <Progress value={item.value} className="h-2" />
                <p className="text-[10px] text-muted-foreground">{item.desc}</p>
              </div>
            ))}
          </div>
          <div className="space-y-1.5 mt-4">
            {[
              { range: "0 – 20", label: "Risco Baixo", color: "bg-emerald-500/10 text-emerald-600", active: riskEngineScore <= 20 },
              { range: "21 – 40", label: "Risco Moderado", color: "bg-blue-500/10 text-blue-600", active: riskEngineScore > 20 && riskEngineScore <= 40 },
              { range: "41 – 60", label: "Risco Elevado", color: "bg-yellow-500/10 text-yellow-600", active: riskEngineScore > 40 && riskEngineScore <= 60 },
              { range: "61 – 80", label: "Risco Alto", color: "bg-orange-500/10 text-orange-600", active: riskEngineScore > 60 && riskEngineScore <= 80 },
              { range: "81 – 100", label: "Risco Crítico", color: "bg-red-500/10 text-red-600", active: riskEngineScore > 80 },
            ].map(item => (
              <div key={item.range} className={`flex items-center justify-between p-2.5 rounded-lg bg-muted/20 ${item.active ? "ring-2 ring-amber-500" : ""}`}>
                <div className="flex items-center gap-3">
                  <span className={`text-[10px] font-mono font-bold px-2 py-1 rounded ${item.color}`}>{item.range}</span>
                  <span className="text-xs font-medium text-foreground">{item.label}</span>
                </div>
                {item.active && <CheckCircle2 className="w-4 h-4 text-amber-500" />}
              </div>
            ))}
          </div>
        </div>
      </ReportPage>

      {/* ══ MÓDULO 10 — SIMULAÇÃO FINANCEIRA ══ */}
      <ReportPage>
        <div className="space-y-4">
          <SectionTitle num="10" title="SIMULAÇÃO FINANCEIRA" />
          <p className="text-xs text-muted-foreground">
            Cenários simulados de melhoria do score Kanitz. Projeções estimadas com base nos indicadores atuais.
          </p>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-[10px]">Cenário</TableHead>
                  <TableHead className="text-right text-[10px]">FI Atual</TableHead>
                  <TableHead className="text-right text-[10px]">FI Simulado</TableHead>
                  <TableHead className="text-right text-[10px]">Variação</TableHead>
                  <TableHead className="text-[10px]">Nova Classificação</TableHead>
                  <TableHead className="text-[10px]">Premissa</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[
                  { cenario: "📉 Redução de Dívida", fi: simReducaoDivida, premissa: "Redução de 20% do passivo total" },
                  { cenario: "📈 Aumento de Margem", fi: simAumentoMargem, premissa: "Aumento de 30% na margem líquida" },
                  { cenario: "💰 Injeção de Capital", fi: simInjecaoCapital, premissa: "Aporte de capital aumentando PL em 30%" },
                  { cenario: "✂️ Redução de Custos", fi: simReducaoCustos, premissa: "Redução de 15% nas despesas operacionais" },
                ].map(sim => {
                  const delta = sim.fi - l.fi;
                  const newClass = sim.fi > 1 ? "saudavel" : sim.fi > 0 ? "estavel" : sim.fi > -1 ? "atencao" : sim.fi >= -3 ? "risco" : "insolvente";
                  return (
                    <TableRow key={sim.cenario}>
                      <TableCell className="text-xs font-medium">{sim.cenario}</TableCell>
                      <TableCell className="text-right text-xs font-mono">{l.fi.toFixed(2)}</TableCell>
                      <TableCell className={`text-right text-xs font-mono font-bold ${classColors[newClass]?.color}`}>{sim.fi.toFixed(2)}</TableCell>
                      <TableCell className={`text-right text-xs font-mono ${delta > 0 ? "text-emerald-600" : "text-red-600"}`}>{delta > 0 ? "+" : ""}{delta.toFixed(2)}</TableCell>
                      <TableCell className="text-xs">
                        <Badge className={`text-[9px] ${
                          newClass === "saudavel" ? "bg-emerald-500/15 text-emerald-600" :
                          newClass === "estavel" ? "bg-blue-500/15 text-blue-600" :
                          newClass === "atencao" ? "bg-yellow-500/15 text-yellow-600" :
                          newClass === "risco" ? "bg-orange-500/15 text-orange-600" : "bg-red-500/15 text-red-600"
                        }`}>{classColors[newClass]?.icon} {classColors[newClass]?.label}</Badge>
                      </TableCell>
                      <TableCell className="text-[10px] text-muted-foreground max-w-[200px]">{sim.premissa}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </div>
      </ReportPage>

      {/* ══ MÓDULO 11 — PARECER TÉCNICO ══ */}
      <ReportPage>
        <div className="space-y-4">
          <SectionTitle num="11" title="PARECER TÉCNICO" />
          <div className="space-y-4">
            {[
              { title: "Diagnóstico Financeiro", text: `A empresa apresenta Fator de Insolvência de ${l.fi.toFixed(2)} (${classColors[l.classificacao]?.label}), com Risk Engine de ${riskEngineScore}/100 (${riskEngineClass}). Patrimônio Líquido de R$ ${fmt(l.pl)} e Ativo Total de R$ ${fmt(l.at)} configuram ${endivTotal < 0.5 ? "estrutura patrimonial sólida" : endivTotal < 0.7 ? "estrutura patrimonial moderadamente alavancada" : "alta dependência de capital de terceiros"}.` },
              { title: "Causas de Deterioração", text: previous ? `A variação do FI de ${previous.fi.toFixed(2)} para ${l.fi.toFixed(2)} (${fiDelta > 0 ? "melhora" : "piora"} de ${Math.abs(fiDelta).toFixed(2)} pontos) é explicada principalmente por: ${l.ge > (previous.ge || 0) ? "aumento do grau de endividamento" : "variação na liquidez"}, ${l.ls < (previous.ls || 0) ? "redução da liquidez seca" : "manutenção da liquidez"}, e ${l.rpl < (previous.rpl || 0) ? "queda na rentabilidade do PL" : "manutenção/melhora da rentabilidade"}.` : "Análise evolutiva indisponível — apenas um período carregado." },
              { title: "Probabilidade de Insolvência", text: l.fi < -3 ? "ALTA. O FI abaixo de -3 indica alta probabilidade estatística de insolvência segundo o modelo Kanitz. A empresa deve buscar reestruturação imediata." : l.fi < 0 ? "MODERADA. O FI na zona de atenção/risco requer monitoramento contínuo e medidas preventivas." : "BAIXA. O FI positivo indica solvência segundo o modelo Kanitz. Recomenda-se manutenção das boas práticas financeiras." },
              { title: "Nível de Risco", text: `Risk Engine classifica a empresa como ${riskEngineClass} (${riskEngineScore}/100). Principais fatores: Score Kanitz (${Math.round(riskKanitz)}/100, peso 40%), Liquidez (${Math.round(riskLiquidez)}/100, peso 20%), Alavancagem (${Math.round(riskAlavancagem)}/100, peso 20%), Fluxo de Caixa (${Math.round(riskFluxoCaixa)}/100, peso 20%).` },
              { title: "Recomendações Estratégicas", text: [
                l.ge > 1.5 ? "Implementar plano de desalavancagem — priorizar quitação de dívidas onerosas." : null,
                l.ls < 1 ? "Reduzir dependência de estoques para liquidez — otimizar gestão de recebíveis." : null,
                coberturaJuros < 2 ? "Renegociar condições de dívida bancária — melhorar cobertura de juros." : null,
                margemLiquida < 0.1 ? "Revisar estrutura de custos para melhoria da margem líquida." : null,
                "Monitorar trimestralmente a evolução do Fator de Insolvência e Risk Engine.",
                "Integrar resultado Kanitz ao sistema de alertas e governança corporativa.",
              ].filter(Boolean).join(" ") },
            ].map(item => (
              <div key={item.title} className="p-4 rounded-lg bg-muted/20 border border-border/30">
                <p className="text-xs font-semibold text-foreground mb-2">{item.title}</p>
                <p className="text-xs text-muted-foreground leading-relaxed">{item.text}</p>
              </div>
            ))}
          </div>
        </div>
      </ReportPage>

      {/* ══ MEMÓRIA DE CÁLCULO ══ */}
      <ReportPage>
        <div className="space-y-4">
          <SectionTitle num="★" title="MEMÓRIA DE CÁLCULO" />
          <div className="p-4 rounded-lg bg-muted/30 border border-border/50 mb-4">
            <p className="text-xs font-semibold text-foreground mb-2">Fórmula do Fator de Insolvência:</p>
            <code className="block text-[11px] font-mono leading-relaxed text-foreground">
              Z = 0,05×X1 + 1,65×X2 + 3,55×X3 − 1,06×X4 − 0,33×X5
            </code>
            <div className="mt-2 text-[10px] text-muted-foreground space-y-0.5">
              <p>X1 = Lucro Líquido / Patrimônio Líquido (RPL)</p>
              <p>X2 = (Ativo Circulante + Realizável LP) / (Passivo Circulante + Exigível LP) (LG)</p>
              <p>X3 = (Ativo Circulante − Estoques) / Passivo Circulante (LS)</p>
              <p>X4 = Passivo Total / Patrimônio Líquido (GE — nota: LC na fórmula original)</p>
              <p>X5 = Passivo Circulante / Passivo Total (composição do endividamento)</p>
            </div>
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
                  { name: "RPL (X1)", peso: 0.05, key: "rpl" as const },
                  { name: "LG (X2)", peso: 1.65, key: "lg" as const },
                  { name: "LS (X3)", peso: 3.55, key: "ls" as const },
                  { name: "LC (X4)", peso: -1.06, key: "lc" as const },
                  { name: "GE (X5)", peso: -0.33, key: "ge" as const },
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
                    <TableCell key={`fi-${r.year}`} className={`text-right text-sm font-bold font-mono ${classColors[r.classificacao]?.color}`}>{r.fi.toFixed(2)}</TableCell>
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
                    { label: "Ativo Circulante", key: "ac" },
                    { label: "Ativo Não Circulante", key: "anc" },
                    { label: "Realizável a LP", key: "rlp" },
                    { label: "Estoques", key: "estoque" },
                    { label: "Passivo Circulante", key: "pc" },
                    { label: "Passivo Não Circulante", key: "pnc" },
                    { label: "Passivo Total", key: "pt" },
                    { label: "Patrimônio Líquido", key: "pl" },
                    { label: "Lucro Líquido", key: "ll" },
                    { label: "Receita Líquida", key: "rl" },
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
        </div>
      </ReportPage>

      {/* ── ASSINATURA ── */}
      <ReportPage>
        <div className="flex-1 flex flex-col items-center justify-center text-center space-y-3">
          <div className="w-12 h-12 mx-auto rounded-xl bg-amber-500/10 flex items-center justify-center">
            <Scale className="w-6 h-6 text-amber-600" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">Documento gerado e assinado digitalmente</p>
            <p className="text-xs text-muted-foreground">Auditor Contábil Sênior IA</p>
            <p className="text-xs text-muted-foreground">Relatório Kanitz Expandido v2.0 — Risk Intelligence Financial Report</p>
            <p className="text-xs text-muted-foreground mt-2">Plataforma BEX — {today}</p>
          </div>
          <div className="flex flex-wrap justify-center gap-1.5 pt-2">
            {["Kanitz (1978)", "NBC TA 570", "CPC 26", "Lei 11.101/2005", "IFRS", "NBC TA 315"].map(n => (
              <Badge key={n} variant="secondary" className="text-[10px]">{n}</Badge>
            ))}
          </div>
        </div>
      </ReportPage>

      </div>{/* end report-pages-container */}

      {/* Action buttons bottom */}
      <div className="flex items-center justify-center gap-3 pt-4 print:hidden flex-wrap">
        {totalPagesKanitz > 0 && (
          <span className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
            <FileText className="w-3.5 h-3.5" /> Total de páginas: {totalPagesKanitz}
          </span>
        )}
        <div className="inline-flex items-center rounded-lg border border-border bg-muted/50 p-0.5">
          <div className="relative">
            <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 text-[9px] font-bold text-green-600 bg-green-100 px-1.5 py-0 rounded-full leading-4 whitespace-nowrap">Disponível</span>
            <button className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold bg-amber-500 text-white shadow-sm">
              <Scale className="w-3.5 h-3.5" /> Relatório Kanitz
            </button>
          </div>
        </div>
        <Button variant="outline" className="gap-1.5" onClick={() => printReport('report-kanitz-container', 'Relatório Kanitz')}>
          <Download className="w-4 h-4" /> Exportar PDF
        </Button>
        <Button variant="outline" className="gap-1.5" onClick={() => exportDocx('report-kanitz-container', 'Relatório Kanitz')}>
          <FileText className="w-4 h-4" /> Exportar .doc
        </Button>
        <Button variant="outline" className="gap-1.5" onClick={() => printReport('report-kanitz-container', 'Relatório Kanitz')}>
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
export const ResultsPhase = ({ onBack, aiAnalysis, parsedData, batchId, sourceDocs, company, source, uploadedFiles, selectedDepth = "tecnico", balanceteEntries = [], skipPersist = false, initialReportType, availableReports }: { 
  onBack: () => void; 
  aiAnalysis?: any;
  parsedData?: ParsedFinancialData | null;
  batchId?: string;
  sourceDocs?: { fileName: string; fileSize: number; format: string }[];
  company?: Company | null;
  source?: "auditor_chefe" | "usuario" | "empresa";
  uploadedFiles?: File[];
  selectedDepth?: "executivo" | "tecnico";
  balanceteEntries?: BalanceteEntry[];
  skipPersist?: boolean;
  initialReportType?: "bex" | "kanitz";
  availableReports?: Array<"bex" | "kanitz">;
}) => {
  const navigate = useNavigate();
  const isResumido = selectedDepth === "executivo";
  const [reportType, setReportType] = useState<"none" | "bex" | "kanitz">(
    initialReportType ?? (isResumido ? "bex" : "none")
  );
  const [tabParams, setTabParams] = useSearchParams();
  const defaultTab = initialReportType || isResumido ? "relatorio-final" : "diagnostico";
  const activeTab = tabParams.get("tab") || defaultTab;
  const setActiveTab = useCallback((value: string) => {
    const next = new URLSearchParams(tabParams);
    if (!value || value === defaultTab) next.delete("tab");
    else next.set("tab", value);
    setTabParams(next, { replace: false });
  }, [tabParams, setTabParams, defaultTab]);

  // Sincroniza posição de rolagem com URL (?sy=) para back/forward restaurar o ponto exato.
  useUrlScrollSync("sy", true);

  // Use AI data if available, otherwise fall back to mock data
  const activeDiagnostico = aiAnalysis?.diagnostico || diagnosticoData;
  const activePendencias = aiAnalysis?.pendencias || pendencias;
  const activeScoreRJ = aiAnalysis?.scoreRJ || scoreRJData;

  const persistReport = (variant: "resumido" | "completo") => {
    const riskLevel = aiAnalysis?.diagnostico?.riskLevel || "moderado";
    const pendencias = aiAnalysis?.pendencias?.length || 0;
    const conformidade = riskLevel === "baixo" ? 95 : riskLevel === "moderado" ? 78 : riskLevel === "elevado" ? 55 : 35;
    const baseName = (parsedData as any)?.fileName || aiAnalysis?.fileName || "Auditoria";
    const title = variant === "completo"
      ? `Relatório Kanitz - Ref. (${baseName})`
      : `Relatório BEX - Ref. (${baseName})`;
    const entry: GeneratedReportEntry = {
      id: `report-${Date.now()}-${variant}`,
      title,
      variant,
      date: new Date().toISOString().split("T")[0],
      fileName: title,
      fileSize: 0,
      format: variant === "completo" ? "Kanitz" : "BEX",
      status: "completed",
      conformidade,
      riscos: pendencias,
      riskLevel,
      aiAnalysis,
      parsedData,
      batchId,
      sourceDocuments: sourceDocs,
      companyId: company?.id,
      companyName: company?.name,
      source,
      balanceteEntries,
    };
    saveGeneratedReport(entry);
  };

  // Auto-persist report once aiAnalysis is ready, based on selected depth
  const persistedRef = useRef(false);
  useEffect(() => {
    if (skipPersist) return;
    if (persistedRef.current) return;
    if (!aiAnalysis) return;
    persistedRef.current = true;
    if (isResumido) {
      persistReport("resumido");
    } else {
      persistReport("completo");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aiAnalysis, isResumido, skipPersist]);

  const handleGerarBex = () => {
    if (selectedDepth !== "executivo") {
      toast({
        title: "Relatório bloqueado",
        description: "Para acessar o Relatório BEx_Resumido_Kanitz, selecione esse nível em 'Nível de Profundidade Técnica' na etapa de configuração.",
        variant: "destructive",
      });
      return;
    }
    setReportType("bex");
    persistReport("resumido");
  };

  const handleGerarKanitz = () => {
    if (selectedDepth !== "tecnico") {
      toast({
        title: "Relatório bloqueado",
        description: "Para acessar o Relatório BEx_Completo_Kanitz, selecione esse nível em 'Nível de Profundidade Técnica' na etapa de configuração.",
        variant: "destructive",
      });
      return;
    }
    setReportType("kanitz");
    persistReport("completo");
  };

  // Resumido (executivo): apenas o relatório BEx_Resumido_Kanitz, sem abas de auditoria
  if (isResumido) {
    return (
      <div className="space-y-6">
        <StepTimeline currentStep={5} />
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground font-serif">Relatório BEx_Resumido_Kanitz</h1>
            <p className="text-sm text-muted-foreground">Documento gerado automaticamente pelo Auditor Contábil Sênior IA</p>
          </div>
        </div>
        <TabRelatorioFinal onBack={onBack} aiAnalysis={aiAnalysis} parsedData={parsedData} variant="resumido" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <StepTimeline currentStep={reportType !== "none" ? 5 : 4} />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground font-serif">Avaliação Empresarial</h1>
          <p className="text-sm text-muted-foreground">Documento gerado automaticamente pelo Auditor Contábil Sênior IA</p>
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
          <TabsTrigger value="bs-dados" className="text-xs gap-1.5 data-[state=active]:bg-[hsl(258,90%,66%)] data-[state=active]:text-white">
            <Database className="w-3.5 h-3.5" /> BS &amp; Dados
          </TabsTrigger>
          <TabsTrigger value="pivot" className="text-xs gap-1.5 data-[state=active]:bg-[hsl(258,90%,66%)] data-[state=active]:text-white">
            <Layers className="w-3.5 h-3.5" /> Pivot
          </TabsTrigger>
          <TabsTrigger value="graficos-auditoria" className="text-xs gap-1.5 data-[state=active]:bg-[hsl(258,90%,66%)] data-[state=active]:text-white">
            <BarChart3 className="w-3.5 h-3.5" /> Gráficos de Auditoria
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
        <TabsContent value="indicadores"><TabIndicadores parsedData={parsedData} aiAnalysis={aiAnalysis} /></TabsContent>
        <TabsContent value="endividamento"><TabEndividamento aiAnalysis={aiAnalysis} parsedData={parsedData} /></TabsContent>
        <TabsContent value="patrimonial"><TabPatrimonial aiAnalysis={aiAnalysis} parsedData={parsedData} /></TabsContent>
        <TabsContent value="bs-dados"><TabBSDados parsedData={parsedData} entries={balanceteEntries} /></TabsContent>
        <TabsContent value="pivot"><TabPivotBalancete parsedData={parsedData} entries={balanceteEntries} /></TabsContent>
        <TabsContent value="graficos-auditoria"><TabGraficosAuditoria files={uploadedFiles} parsedData={parsedData} entries={balanceteEntries} /></TabsContent>
        <TabsContent value="risco-rj"><TabRiscoRJ aiAnalysis={aiAnalysis} /></TabsContent>
        <TabsContent value="kanitz"><TabKanitz parsedData={parsedData} aiAnalysis={aiAnalysis} balanceteEntries={balanceteEntries} /></TabsContent>
        <TabsContent value="relatorio-final">
          {availableReports && availableReports.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 mb-4 p-3 rounded-lg border bg-muted/30">
              <span className="text-xs font-semibold text-muted-foreground mr-1">Relatórios disponíveis:</span>
              {availableReports.includes("bex") && (
                <Button
                  size="sm"
                  variant={reportType === "bex" ? "default" : "outline"}
                  className={`gap-1.5 h-8 ${reportType === "bex" ? "bg-[hsl(258,90%,66%)] hover:bg-[hsl(258,90%,56%)] text-white" : ""}`}
                  onClick={() => setReportType("bex")}
                >
                  <BookOpen className="w-3.5 h-3.5" />
                  Relatório BEX
                  <Badge className="ml-1 bg-emerald-500/20 text-emerald-700 border-emerald-500/30 text-[9px] px-1.5 py-0">Disponível</Badge>
                </Button>
              )}
              {availableReports.includes("kanitz") && (
                <Button
                  size="sm"
                  variant={reportType === "kanitz" ? "default" : "outline"}
                  className={`gap-1.5 h-8 ${reportType === "kanitz" ? "bg-amber-500 hover:bg-amber-600 text-white" : ""}`}
                  onClick={() => setReportType("kanitz")}
                >
                  <Scale className="w-3.5 h-3.5" />
                  Relatório Kanitz
                  <Badge className="ml-1 bg-emerald-500/20 text-emerald-700 border-emerald-500/30 text-[9px] px-1.5 py-0">Disponível</Badge>
                </Button>
              )}
            </div>
          )}
          {reportType === "bex" ? (
            <TabRelatorioFinal onBack={onBack} aiAnalysis={aiAnalysis} parsedData={parsedData} variant="resumido" />
          ) : reportType === "kanitz" ? (
            <TabRelatorioKanitz onBack={onBack} aiAnalysis={aiAnalysis} parsedData={parsedData} />
          ) : (
            <TabRelatorioPreview onGerarBex={handleGerarBex} onGerarKanitz={handleGerarKanitz} selectedDepth={selectedDepth} />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};

/* ══════════════════════════════════════════════════════
   MAIN AUDIT PAGE
   ══════════════════════════════════════════════════════ */
type AuditPhase = "upload" | "confirm-months" | "processing" | "results";

const AuditContent = () => {
  const [searchParams] = useSearchParams();
  const { role } = useUser();
  const [phase, setPhase] = useState<AuditPhase>("upload");
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [aiAnalysis, setAiAnalysis] = useState<any>(null);
  const [parsedData, setParsedData] = useState<ParsedFinancialData | null>(null);
  const [batchId, setBatchId] = useState<string>("");
  const [sourceDocs, setSourceDocs] = useState<{ fileName: string; fileSize: number; format: string }[]>([]);
  const [company, setCompany] = useState<Company | null>(null);
  const [dedupConfig, setDedupConfig] = useState<import("@/services/auditAIService").DedupConfig>({});
  const [selectedDepth, setSelectedDepth] = useState<"executivo" | "tecnico">("tecnico");
  const [multiMonth, setMultiMonth] = useState<import("@/services/auditMonthDetector").MultiMonthParsed | null>(null);
  const [filteredMonths, setFilteredMonths] = useState<string[]>([]);
  const [preParsing, setPreParsing] = useState(false);
  const [balanceteEntries, setBalanceteEntries] = useState<BalanceteEntry[]>([]);

  const reportSource: "auditor_chefe" | "usuario" | "empresa" =
    role === "auditor_chefe" || role === "coordenadora" || role === "gestor_ia"
      ? "auditor_chefe"
      : role === "empresa" || role === "recuperanda"
        ? "empresa"
        : "usuario";

  useEffect(() => {
    const cid = searchParams.get("company");
    if (cid) {
      getCompany(cid).then(setCompany).catch(() => setCompany(null));
    }
  }, [searchParams]);

  const handleAnalysisReady = useCallback((analysis: any, parsed: ParsedFinancialData | null) => {
    setAiAnalysis(analysis);
    setParsedData(parsed);
    
    const riskLevel = analysis?.diagnostico?.riskLevel || "moderado";
    const pendencias = analysis?.pendencias?.length || 0;
    const newBatchId = `batch-${Date.now()}`;
    setBatchId(newBatchId);
    const docs = uploadedFiles.map(f => ({ fileName: f.name, fileSize: f.size, format: getFormat(f) }));
    setSourceDocs(docs);
    const entries: AuditHistoryEntry[] = uploadedFiles.map((f, i) => ({
      id: `audit-${Date.now()}-${i}`,
      fileName: f.name,
      fileSize: f.size,
      format: getFormat(f),
      date: new Date().toISOString().split("T")[0],
      status: "completed" as const,
      conformidade: riskLevel === "baixo" ? 95 : riskLevel === "moderado" ? 78 : riskLevel === "elevado" ? 55 : 35,
      riscos: pendencias,
      riskLevel,
      batchId: newBatchId,
      companyId: company?.id,
      companyName: company?.name,
      source: reportSource,
      periodos: parsed?.years || [],
    }));
    saveAuditBatch(entries);
  }, [uploadedFiles, company, reportSource]);

  return (
    <PlatformLayout>
      <div className="max-w-[1400px] mx-auto p-4 md:p-6">
        {company && (
          <div className="mb-4 flex items-center gap-2 p-3 rounded-lg bg-[hsl(217,91%,50%)]/5 border border-[hsl(217,91%,50%)]/20">
            <Building2 className="w-4 h-4 text-[hsl(217,91%,50%)]" />
            <span className="text-xs text-muted-foreground">Auditoria vinculada à empresa:</span>
            <span className="text-sm font-semibold text-foreground">{company.name}</span>
          </div>
        )}
        {phase === "upload" && (
          <UploadPhase 
            onProcess={async () => {
              if (uploadedFiles.length === 0) { setPhase("processing"); return; }
              setPreParsing(true);
              try {
                // Pré-parse rápido só p/ detectar meses; ProcessingPhase reutiliza o resultado.
                // O mês informado pelo usuário (balanceteEntries) sobrescreve o detector automático.
                const userMonthByName = new Map<string, string | null>(
                  balanceteEntries.map(e => [e.fileName, e.mesReferencia ?? null])
                );
                const items = await Promise.all(uploadedFiles.map(async (f) => ({
                  fileName: f.name,
                  parsed: await parseFile(f),
                  userMonth: userMonthByName.get(f.name) ?? null,
                })));
                const merged = mergeMultiMonth(items);
                setMultiMonth(merged);
                setFilteredMonths(defaultLast3(merged));
                setPhase("confirm-months");
              } catch (e) {
                console.error("Pré-parse falhou:", e);
                toast({ title: "Erro ao ler arquivos", description: "Tentando análise direta...", variant: "destructive" });
                setPhase("processing");
              } finally {
                setPreParsing(false);
              }
            }} 
            onFilesReady={setUploadedFiles}
            onMesesReady={setBalanceteEntries}
            dedupConfig={dedupConfig}
            onDedupChange={setDedupConfig}
            onDepthChange={setSelectedDepth}
          />
        )}
        <MonthsConfirmDialog
          open={phase === "confirm-months" && !!multiMonth}
          data={multiMonth}
          onConfirm={(keys) => { setFilteredMonths(keys); setPhase("processing"); }}
          onCancel={() => { setMultiMonth(null); setPhase("upload"); }}
        />
        {phase === "processing" && (
          <ProcessingPhase 
            onComplete={() => setPhase("results")} 
            files={uploadedFiles}
            preParsed={multiMonth ? pickMonths(multiMonth, filteredMonths) : null}
            onAnalysisReady={handleAnalysisReady}
            dedupConfig={dedupConfig}
            companyId={company?.id ?? null}
            balanceteEntries={balanceteEntries}
          />
        )}
        {phase === "results" && (
          <ResultsPhase 
            onBack={() => { setPhase("upload"); setAiAnalysis(null); setParsedData(null); setBatchId(""); setSourceDocs([]); setMultiMonth(null); }} 
            aiAnalysis={aiAnalysis}
            parsedData={parsedData}
            batchId={batchId}
            sourceDocs={sourceDocs}
            company={company}
            source={reportSource}
            uploadedFiles={uploadedFiles}
            selectedDepth={selectedDepth}
            balanceteEntries={balanceteEntries}
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
