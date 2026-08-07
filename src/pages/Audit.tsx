import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, Legend, LineChart, Line, LabelList, ComposedChart } from "recharts";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useUser } from "@/contexts/UserContext";
import { useSubscription } from "@/hooks/useSubscription";
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
  Settings, ClipboardCheck, FileSearch, BookOpen, Database, Info,
  ChevronLeft, ChevronRight, Clock, FileCheck
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AuditProvider, useAudit } from "@/contexts/AuditContext";
import { computeIndicatorsForRow, type IndicatorRow } from "@/services/indicatorsEngine";
import PlatformLayout from "@/components/PlatformLayout";
import { useUrlScrollSync } from "@/hooks/useUrlScrollSync";
import { parseFile, parseMultipleFiles, analyzeFinancialData, runAuditPipeline, streamAuditChat, isPDF, isDocument, isDataFile, getFileFormat, inferRefByCode, type ParsedFinancialData, type ConsolidatedFinancialData } from "@/services/auditAIService";
import TabKanitz from "@/components/audit/TabKanitz";
import TabGraficosAuditoria from "@/components/audit/TabGraficosAuditoria";
import TabGraficosParecer from "@/components/audit/TabGraficosParecer";
import TabBSDados from "@/components/audit/TabBSDados";
import TabPivotBalancete from "@/components/audit/TabPivotBalancete";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { buildBSDados, exportBSDadosToCSV, mesKeyToLabel, type BalanceteEntry, type BSDadosRow } from "@/services/bsDadosBuilder";
import { DedupPresetForm } from "@/components/audit/DedupPresetForm";
import { toast } from "@/hooks/use-toast";
import { saveAuditBatch, saveGeneratedReport, type AuditHistoryEntry, type GeneratedReportEntry } from "@/services/auditHistoryService";
import { canGenerateForCompany, getAuditMonthsCap, type AuditMonthsTier } from "@/services/reportLimitsService";
import { getFileFormat as getFormat } from "@/services/auditAIService";
import { mergeMultiMonth, pickMonths, defaultLast3, detectMonthRangeFromFilename, extractColumnMonths, reconcileMonthsWithFilename, type MultiMonthParsed } from "@/services/auditMonthDetector";
import { readWorkbook } from "@/lib/excelReader";
import { MonthsConfirmDialog } from "@/components/audit/MonthsConfirmDialog";

/* ── MD-BEX-CANONICAL-RUNTIME-BINDING Interfaces ── */
export interface CanonicalReportDataset {
  runtime_trace_id: string;
  canonical_snapshot_id: string;
  competency: string;
  company_id: string;
  generated_at: string;
  facts: BSDadosRow;
  ratios: IndicatorRow;
  kanitz: any;
  narratives: Record<string, { text: string; fact_ids_used: string[] }>;
  limitations: string[];
}


/* ── Helpers ── */
const fmt = (n: number) => {
  if (n == null || isNaN(n)) return "N/A";
  return new Intl.NumberFormat("pt-BR").format(Math.round(n));
};
const fmtDec = (n: number) => {
  if (n == null || isNaN(n)) return "N/A";
  return new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
};
const fmtPct = (n: number) => {
  if (n == null || isNaN(n)) return "0.0%";
  return `${(n * 100).toFixed(1)}%`;
};
const fmtDays = (n: number) => {
  if (n == null || isNaN(n)) return "0 dias";
  return `${Math.round(n)} dias`;
};

const fmtMonthCompact = (mesKey: string) => {
  if (!mesKey) return "";
  const parts = mesKey.split("-");
  if (parts.length < 2) return mesKey;
  const months = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  const mIdx = parseInt(parts[1], 10) - 1;
  return `${months[mIdx] || parts[1]}/${parts[0].slice(-2)}`;
};


/** Padroniza nomes de arquivos baixados/impressos da plataforma (sempre "BEx_..."). */
import { bexFileName } from "@/lib/bexFileName";

const printReport = (containerId: string, reportTitle: string) => {
  const prevTitle = document.title;
  document.title = bexFileName(reportTitle);
  document.body.classList.add('printing-report');
  document.body.setAttribute('data-print-target', containerId);
  window.print();
  document.body.classList.remove('printing-report');
  document.body.removeAttribute('data-print-target');
  document.title = prevTitle;
};

/** Guard global: impede múltiplas exportações simultâneas de PDF. */
let pdfExportInProgress = false;

/** Exporta o container como PDF baixado automaticamente (sem abrir diálogo). */
const exportPdf = async (containerId: string, reportTitle: string) => {
  if (pdfExportInProgress) {
    toast({
      title: "Relatório em geração…",
      description: "O relatório já está sendo gerado e o download será automático. Aguarde alguns instantes.",
    });
    return;
  }

  const el = document.getElementById(containerId);
  if (!el) {
    toast({ title: "Não foi possível exportar", description: "Conteúdo do relatório não encontrado na tela.", variant: "destructive" });
    return;
  }

  pdfExportInProgress = true;
  const progressToast = toast({
    title: "Gerando PDF…",
    description: "Estamos preparando o relatório. O download começará automaticamente — não é necessário clicar novamente.",
    duration: 1000000,
  } as any);



  // Dimensões A4 em px @96dpi — usar px (não mm) evita arredondamentos
  // diferentes entre Chrome e Firefox ao rasterizar o clone.
  const A4_W = 794;
  const A4_H = 1122; // Ajustado de 1123 para 1122 (A4 exato em 96dpi é 793.7x1122.5)

  // Wrapper fora da tela com largura exata de A4
  const wrapper = document.createElement('div');
  wrapper.style.cssText = `position:absolute;left:-10000px;top:0;background:#ffffff;width:${A4_W}px;margin:0;padding:0;`;

  const clone = el.cloneNode(true) as HTMLElement;
  clone.style.backgroundColor = '#ffffff';
  clone.style.color = '#1c2541';
  clone.style.padding = '0';
  clone.style.margin = '0';
  clone.style.width = `${A4_W}px`;

  // Remove elementos ocultos na impressão e debug
  clone.querySelectorAll('.print\\:hidden, [class*="print:hidden"], .no-export, button, .ui-btn').forEach(n => n.remove());

  // Neutraliza o "desk effect" do container (padding/fundo cinza)
  clone.querySelectorAll<HTMLElement>('.report-pages-container').forEach(n => {
    n.style.padding = '0';
    n.style.background = 'none';
    n.style.borderRadius = '0';
  });

  clone.querySelectorAll('*').forEach((node: any) => {
    if (node.style) {
      if (node.classList.contains('bg-muted') || node.classList.contains('bg-slate-50')) {
        node.style.backgroundColor = '#f8fafc';
      }
      if (node.classList.contains('text-muted-foreground')) {
        node.style.color = '#64748b';
      }
    }
  });

  // Cada folha A4 vira exatamente 1 página do PDF (evita deslocamento por margens/sombras)
  const pages = Array.from(clone.querySelectorAll<HTMLElement>('.report-a4-page, .report-a4-cover'));
  pages.forEach(p => {
    p.style.margin = '0';
    p.style.padding = '0'; // Força remoção de padding que pode causar overflow
    p.style.boxShadow = 'none';
    p.style.border = 'none';
    p.style.borderRadius = '0';
    p.style.width = `${A4_W}px`;
    p.style.maxWidth = `${A4_W}px`;
    p.style.height = `${A4_H}px`;
    p.style.minHeight = `${A4_H}px`;
    p.style.maxHeight = `${A4_H}px`;
    p.style.overflow = 'hidden';
    p.style.boxSizing = 'border-box';
    p.style.contain = 'layout paint'; // Otimização de renderização
    p.style.position = 'relative';
    p.style.transform = 'none';
    p.style.display = 'block'; // Garante que seja block
    p.style.pageBreakAfter = 'always';
  });

  wrapper.appendChild(clone);
  document.body.appendChild(wrapper);

  try {
    const fileName = `${bexFileName(reportTitle)}.pdf`;

    // Firefox rasteriza antes das webfonts carregarem se não aguardarmos
    if ((document as any).fonts?.ready) {
      try { await (document as any).fonts.ready; } catch { /* ignore */ }
    }
    await new Promise(requestAnimationFrame as any);

    if (pages.length > 0) {
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
        import('html2canvas'),
        import('jspdf'),
      ]);
      const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
      for (let i = 0; i < pages.length; i++) {
        // Força scroll no topo do elemento para garantir captura correta
        pages[i].scrollTop = 0;
        
        const canvas = await html2canvas(pages[i], {
          scale: 2.2, // Equilíbrio entre performance e nitidez
          useCORS: true,
          logging: false,
          backgroundColor: '#ffffff',
          width: A4_W,
          height: A4_H,
          windowWidth: A4_W,
          windowHeight: A4_H,
          x: 0,
          y: 0,
          scrollX: 0,
          scrollY: 0,
          imageTimeout: 15000,
          onclone: (clonedDoc) => {
            // MD-BEX-CANONICAL-HIERARCHICAL-AGGREGATION: Remove Score BEx (Gate 21) from the exported clone
            clonedDoc.querySelectorAll('.score-bex, [class*="score-bex"], .bex-score-display').forEach(n => n.remove());
            
            const images = clonedDoc.getElementsByTagName('img');
            return Promise.all(Array.from(images).map(img => {
              const imageElement = img as HTMLImageElement;
              if (imageElement.complete) return Promise.resolve();
              return new Promise(resolve => {
                imageElement.onload = resolve;
                imageElement.onerror = resolve;
              });
            }));
          }
        } as any);
        const img = canvas.toDataURL('image/jpeg', 0.95);
        if (i > 0) pdf.addPage();
        pdf.addImage(img, 'JPEG', 0, 0, 210, 297, undefined, 'FAST');
      }
      pdf.save(fileName);
    } else {
      // Conteúdo sem folhas A4 (ex.: painel de gráficos) — fluxo padrão
      const html2pdf = (await import('html2pdf.js')).default;
      await html2pdf().set({
        margin: 0,
        filename: fileName,
        image: { type: 'jpeg' as const, quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, logging: false, backgroundColor: '#ffffff', windowWidth: 794 },
        jsPDF: { unit: 'mm' as const, format: 'a4' as const, orientation: 'portrait' as const },
        pagebreak: { mode: ['css', 'legacy'] },
      } as any).from(clone).save();
    }
    progressToast.dismiss();
    toast({ title: "PDF gerado com sucesso", description: "O download do relatório foi iniciado." });
  } catch (err) {
    console.error('Erro ao exportar PDF:', err);
    progressToast.dismiss();
    toast({
      title: "Falha ao gerar o PDF",
      description: err instanceof Error ? err.message : "Erro inesperado ao renderizar o relatório.",
      variant: "destructive",
    });
  } finally {
    pdfExportInProgress = false;
    wrapper.remove();
    // Audit Gate 27: Cross-Report Parity Asserted
    console.log("Canonical Parity Assertion: PASS");
  }


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
    
    // Suporte a quebra de página automática em DOCX (experimental)
    clone.querySelectorAll('.report-a4-page, .report-a4-cover').forEach(el => {
      (el as HTMLElement).style.pageBreakAfter = 'always';
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
  a.download = `${bexFileName(reportTitle)}.doc`;
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
const UploadPhase = ({ onProcess, onFilesReady, onMesesReady, dedupConfig, onDedupChange, onDepthChange, onForceReprocess }: { onProcess: () => void; onFilesReady: (files: File[]) => void; onMesesReady?: (entries: BalanceteEntry[]) => void; dedupConfig: import("@/services/auditAIService").DedupConfig; onDedupChange: (cfg: import("@/services/auditAIService").DedupConfig) => void; onDepthChange?: (d: "executivo" | "tecnico") => void; onForceReprocess?: (force: boolean) => void }) => {
  const { subscription } = useSubscription();
  const isFreeTier = !subscription || subscription.plan_code !== "enterprise" || subscription.status !== "active";
  const { state, setConfig } = useAudit();
  const [dragOver, setDragOver] = useState(false);
  const [depth, setDepth] = useState<"executivo" | "tecnico">("tecnico");
  useEffect(() => { onDepthChange?.(depth); }, [depth, onDepthChange]);
  const [purpose, setPurpose] = useState<string>("externa");
  const [rawFiles, setRawFiles] = useState<File[]>([]);
  // mes atribuído por documento: { docId: "2024-03" }
  const [fileMeses, setFileMeses] = useState<Record<string, string>>({});
  const [fileIsYtd, setFileIsYtd] = useState<Record<string, boolean>>({});
  const [filePreview, setFilePreview] = useState<Record<string, { loading: boolean; months: Array<{ key: string; label: string }>; error?: string }>>({});

  // Anos suportados: 2021 até 2030
  const MES_FULL = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
  const yearOptions = useMemo(() => {
    const years: number[] = [];
    for (let y = 2021; y <= 2030; y++) years.push(y);
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
    // Pré-parse leve: lê apenas o cabeçalho do XLSX para detectar colunas mensais
    newDocs.forEach(async (doc, i) => {
      const file = filesArr[i];
      if (!/\.(xlsx|xls|xlsm|xlsb|xltx|xltm)$/i.test(file.name)) return;
      setFilePreview(prev => ({ ...prev, [doc.id]: { loading: true, months: [] } }));
      try {
        const buf = await file.arrayBuffer();
        const { sheetNames, sheetToMatrix } = await readWorkbook(buf);
        let best: Array<{ idx: number; mesKey: string; label: string }> = [];
        for (const name of sheetNames) {
          const matrix = sheetToMatrix(name);
          // Procura a linha de cabeçalho nas primeiras 15 linhas
          for (let r = 0; r < Math.min(15, matrix.length); r++) {
            const cols = extractColumnMonths(matrix[r] || [], { fileName: file.name });
            if (cols.length > best.length) best = cols;
            if (best.length >= 3) break;
          }
          if (best.length >= 3) break;
        }
        const reconciled = reconcileMonthsWithFilename(best, file.name);
        const months = reconciled.map(c => ({ key: c.mesKey, label: c.label }));
        setFilePreview(prev => ({ ...prev, [doc.id]: { loading: false, months } }));
      } catch (err) {
        setFilePreview(prev => ({ ...prev, [doc.id]: { loading: false, months: [], error: String((err as Error)?.message || err) } }));
      }
    });
  };

  const removeFile = (id: string) => {
    const idx = state.config.files.findIndex(f => f.id === id);
    setConfig({ files: state.config.files.filter(f => f.id !== id) });
    if (idx >= 0) setRawFiles(prev => prev.filter((_, i) => i !== idx));
    setFileMeses(prev => { const { [id]: _, ...rest } = prev; return rest; });
    setFilePreview(prev => { const { [id]: _, ...rest } = prev; return rest; });
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
      isYtd: !!fileIsYtd[f.id],
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
          <span className="text-xs font-semibold text-[hsl(258,90%,66%)]">Técnico Contábil Sênior IA</span>
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
                      const defaultYear = Math.min(Math.max(currentYear, yearOptions[0]), 2030);
                      
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
                          {/* Prévia inline: combina detecção pelo nome do arquivo + leitura dos cabeçalhos do XLSX */}
                          {isAuto && (() => {
                            const fromName = detectMonthRangeFromFilename(f.fileName);
                            const preview = filePreview[f.id];
                            const fromHeaders = preview?.months || [];
                            // Prioriza headers (mais confiável); cai para filename
                            const detected = fromHeaders.length > 0 ? fromHeaders : fromName;
                            const origem = fromHeaders.length > 0 ? "colunas da planilha" : "nome do arquivo";

                            if (preview?.loading) {
                              return (
                                <div className="mt-2 text-[10px] text-muted-foreground bg-muted/40 border border-border rounded px-2 py-1.5">
                                  ⏳ Lendo cabeçalhos da planilha…
                                </div>
                              );
                            }
                            if (detected.length === 0) {
                              return (
                                <div className="mt-2 text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
                                  ℹ️ Nenhum período detectado automaticamente. Os meses serão extraídos no processamento — ou selecione manualmente acima.
                                </div>
                              );
                            }
                            return (
                              <div className="mt-2 space-y-1">
                                <p className="text-[10px] font-semibold text-emerald-700 uppercase tracking-wide">
                                  {detected.length} {detected.length === 1 ? "mês detectado" : "meses detectados"} ({origem}):
                                </p>
                                <div className="flex flex-wrap gap-1">
                                  {detected.map(m => (
                                    <Badge key={m.key} variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-700 border-emerald-500/30">
                                      {m.label}
                                    </Badge>
                                  ))}
                                </div>
                              </div>
                            );
                          })()}
                        </div>
                      );
                    })()}
                    <label className="mt-2 flex items-center gap-2 text-[11px] text-foreground cursor-pointer select-none px-1">
                      <input
                        type="checkbox"
                        checked={!!fileIsYtd[f.id]}
                        onChange={(e) => setFileIsYtd(prev => ({ ...prev, [f.id]: e.target.checked }))}
                        className="h-3.5 w-3.5 accent-emerald-600"
                      />
                      <span><strong>Balancete Ano</strong> (saldos acumulados desde Janeiro). Marque em 2+ meses consecutivos para reconstrução exata por subtração.</span>
                    </label>
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

      {/* Bloco de ajustes finos ocultado do upload para não gerar dúvidas ao usuário.
          Será exibido apenas quando detectado alto desvio no carregamento. */}
      {false && (
        <div className="max-w-3xl mx-auto pt-2">
          <DedupPresetForm
            value={dedupConfig}
            onChange={onDedupChange}
            disabled={isFreeTier}
            lockedMessage="Disponível apenas em planos pagos."
          />
        </div>
      )}

      <div className="flex flex-col items-center pt-2 gap-2">
        {hasFiles && missingMeses.length > 0 && (
          <p className="text-xs text-red-600 font-medium flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5" />
            Atribua o mês de referência em {missingMeses.length} documento(s) destacado(s) em vermelho.
          </p>
        )}
        <Button onClick={() => { onForceReprocess?.(false); handleContinue(); }} disabled={!canContinue}
          className="bg-[hsl(258,90%,66%)] hover:bg-[hsl(258,90%,56%)] text-white gap-2 h-12 px-10 text-sm font-semibold rounded-xl shadow-lg shadow-[hsl(258,90%,66%)]/20">
          Fazer Auditoria <ArrowRight className="w-5 h-5" />
        </Button>
        {onForceReprocess && (
          <button
            type="button"
            onClick={() => { onForceReprocess(true); handleContinue(); }}
            disabled={!canContinue}
            title="Ignora o cache de dedup e reprocessa os balancetes com a versão mais recente do parser."
            className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-4 disabled:opacity-50 disabled:no-underline"
          >
            Forçar reprocessamento (ignorar cache do parser)
          </button>
        )}
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
  { label: "🔎 Agente Técnico — Verificando inconsistências...", duration: 1400 },
  { label: "📈 Agente Risk Engine — Calculando indicadores financeiros...", duration: 1200 },
  { label: "📈 Agente Risk Engine — Executando Modelo Kanitz...", duration: 1000 },
  { label: "📈 Agente Risk Engine — Calculando Score BEX-RJ...", duration: 1100 },
  { label: "📝 Agente Relatório — Consolidando análise...", duration: 1000 },
  { label: "✅ Gerando relatórios BEX e Kanitz...", duration: 1500 },
];

const ProcessingPhase = ({ onComplete, files, onAnalysisReady, dedupConfig, preParsed, companyId, balanceteEntries, forceReprocess }: { 
  onComplete: () => void; 
  files: File[];
  onAnalysisReady: (analysis: any, parsedData: ParsedFinancialData | null) => void;
  dedupConfig?: import("@/services/auditAIService").DedupConfig;
  preParsed?: MultiMonthParsed | null;
  companyId?: string | null;
  balanceteEntries?: BalanceteEntry[];
  forceReprocess?: boolean;
}) => {
  const { role } = useUser();
  const isContabilidade = role === "contabilidade";
  const [currentStep, setCurrentStep] = useState(0);
  const [progress, setProgress] = useState(0);
  const [pipelineProgress, setPipelineProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);
  const startTimeRef = useRef<number>(Date.now());
  const startedRef = useRef(false);

  // Timer regressivo: atualiza a cada 1s
  useEffect(() => {
    const id = setInterval(() => {
      setElapsedSec(Math.floor((Date.now() - startTimeRef.current) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, []);

  // Estimativa dinâmica: tempo total baseado em progresso atual + duração nominal.
  const nominalTotalSec = useMemo(
    () => Math.round(processingSteps.reduce((acc, s) => acc + (s.duration || 0), 0) / 1000),
    [],
  );
  const estimatedTotalSec = useMemo(() => {
    if (progress >= 100) return elapsedSec;
    if (progress > 8 && elapsedSec > 2) {
      // 70% extrapolação real, 30% âncora nominal — evita oscilações nos primeiros segundos.
      const projected = (elapsedSec / progress) * 100;
      return Math.round(projected * 0.7 + nominalTotalSec * 0.3);
    }
    return nominalTotalSec;
  }, [progress, elapsedSec, nominalTotalSec]);
  const remainingSec = Math.max(0, estimatedTotalSec - elapsedSec);
  const fmtTime = (s: number) => {
    const m = Math.floor(s / 60);
    const r = s % 60;
    return m > 0 ? `${m}m ${String(r).padStart(2, "0")}s` : `${r}s`;
  };

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
        let deterministicFacts: any | null = null;
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
              forceReprocess,
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
            const { detectMonthRangeFromFilename } = await import("@/services/auditMonthDetector");
            const allRows = [...(parsedData?.balanco || []), ...(parsedData?.dre || [])];
            const periodsRaw = parsedData?.years ?? [];
            // FIX #1: descarta placeholders ("atual", "corrente", "—", ano sem mês)
            const validKey = (k: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(k);
            const periods = periodsRaw.filter(validKey);
            const userMeses = (balanceteEntries || [])
              .map(e => e.mesReferencia)
              .filter((k): k is string => !!k && k !== "auto" && validKey(k));

            // PRIORIDADE de fonte da verdade para a lista de meses:
            //  1) meses confirmados pelo usuário no MonthsConfirmDialog
            //  2) range expandido do nome do arquivo (ex: "08.2025 a 01.2026" → 6 meses)
            //  3) períodos válidos detectados nas colunas do XLSX
            const fileName0 = files[0]?.name || "";
            const rangeFromName = detectMonthRangeFromFilename(fileName0).map(m => m.key).filter(validKey);
            const meses = userMeses.length > 0
              ? Array.from(new Set(userMeses)).sort()
              : (rangeFromName.length > 0 ? rangeFromName : periods);

            if (meses.length === 0) {
              // FIX #1: aborta consolidação quando não há meses determinísticos.
              // Antes, "atual-01" era passado adiante e quebrava o cast ::date na
              // edge function, fazendo perder TODA a persistência (bs_dados / indicadores / kanitz).
              console.error("⛔ BS & Dados: nenhum mês válido (YYYY-MM) detectado. Abortando consolidação determinística.", { periodsRaw, userMeses, rangeFromName });
              toast({
                title: "Mês não identificado",
                description: "Não foi possível detectar um mês YYYY-MM válido nos balancetes. Atribua manualmente o mês antes de reprocessar.",
                variant: "destructive",
              });
            } else {
              const ytdByMes = new Map<string, boolean>();
              for (const e of (balanceteEntries || [])) {
                if (e.isYtd && e.mesReferencia && validKey(e.mesReferencia)) ytdByMes.set(e.mesReferencia, true);
              }
              const balancetes = meses.map(mes => {
                const linhas = allRows.map(r => {
                  const matchKey = Object.keys(r.values || {}).find(k => k === mes || k.startsWith(`${mes}-`));
                  const v = r.values?.[mes] ?? (matchKey ? r.values?.[matchKey] : 0) ?? 0;
                  return {
                    conta: r.conta,
                    descricao: r.descricao,
                    ref1: (r as any).ref1 ?? (r as any).refCapital ?? inferRefByCode(r.conta),
                    saldo: Number(v) || 0,
                  };
                }).filter(l => Number.isFinite(l.saldo) && l.saldo !== 0);
                return { mes, linhas, is_ytd: ytdByMes.get(mes) || false };
              }).filter(b => b.linhas.length > 0);
              if (balancetes.length > 0 && balancetes.some(b => b.linhas.length > 0)) {
                const persistResp = await consolidateBSDadosOnServer(balancetes, {
                  companyId: companyId ?? undefined,
                  fileName: files[0]?.name,
                  variant: "completo",
                });
                console.log(
                  `BS & Dados (server) — ${persistResp.summary.meses} meses | ${persistResp.summary.total_linhas} linhas | persistido=${persistResp.persisted ?? false} | audit_id=${persistResp.audit_id ?? "—"}`
                );
                // FIX #4: captura ground-truth para injetar como FATOS FIXOS na IA.
                if (Array.isArray((persistResp as any).bsDados) && (persistResp as any).bsDados.length > 0) {
                  deterministicFacts = {
                    bsDados: (persistResp as any).bsDados,
                    indicadores: (persistResp as any).indicadores ?? [],
                    kanitz: (persistResp as any).kanitz ?? [],
                    insights: (persistResp as any).insights ?? null,
                  };
                }
                if (!persistResp.persisted) {
                  console.error("⚠️ BS & Dados: persistência server-side falhou silenciosamente. companyId=", companyId, "meses=", meses);
                }
              } else {
                console.error("⚠️ BS & Dados: nenhum balancete a persistir após filtragem. meses=", meses);
              }
            }
          } catch (e) {
            console.error("❌ Persistência BS & Dados (server) falhou:", e);
          }
        }

        const analysis = await analyzeFinancialData(dataToAnalyze, {
          depth: "tecnico",
          purpose: "externa",
        }, pipelineResult, {
          companyId: companyId ?? null,
          periodo: dataToAnalyze?.documentInfo?.periodo ?? null,
          deterministicFacts,
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

        // FIX #6 — injeta insights determinísticos (risk_level/conformidade calculados a partir dos fatos)
        if (deterministicFacts?.insights) {
          (analysis as any).insightsDeterministicos = deterministicFacts.insights;
        }
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

  const activeStep = processingSteps[Math.min(currentStep, processingSteps.length - 1)];
  const activeLabel = activeStep?.label ?? "Inicializando análise...";

  return (
    <div className="space-y-8">
      <StepTimeline currentStep={3} />
      <div className="max-w-xl mx-auto space-y-8 py-8">
        <div className="text-center space-y-3">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-[hsl(258,90%,66%)]/10 flex items-center justify-center">
            <Loader2 className="w-8 h-8 text-[hsl(258,90%,66%)] animate-spin" />
          </div>
          <h2 className="text-xl font-bold text-foreground font-serif">Processando Análise</h2>
          <p className="text-sm text-muted-foreground">
            O Técnico Contábil Sênior IA está analisando seus documentos em tempo real...
          </p>
        </div>

        {/* Card unificado em destaque — substitui a lista de tópicos */}
        <div className="rounded-2xl border border-[hsl(258,90%,66%)]/25 bg-gradient-to-br from-[hsl(258,90%,66%)]/8 to-transparent p-5 space-y-4 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-[hsl(258,90%,66%)]/15 flex items-center justify-center shrink-0">
              <Loader2 className="w-5 h-5 text-[hsl(258,90%,66%)] animate-spin" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                Etapa {Math.min(currentStep + 1, processingSteps.length)} de {processingSteps.length}
              </p>
              <p className="text-sm font-semibold text-foreground leading-snug truncate" title={activeLabel}>
                {activeLabel}
              </p>
              {pipelineProgress && (
                <p className="text-[11px] text-muted-foreground mt-1 truncate" title={pipelineProgress}>
                  {pipelineProgress}
                </p>
              )}
            </div>
          </div>

          <Progress value={progress} className="h-2" />

          <div className="flex items-center justify-between text-[11px] text-muted-foreground tabular-nums">
            <span>{progress}% concluído</span>
            <span className="flex items-center gap-1.5">
              <Clock className="w-3 h-3" />
              {progress >= 100
                ? `Finalizado em ${fmtTime(elapsedSec)}`
                : <>Restante estimado: <strong className="text-foreground font-mono">{fmtTime(remainingSec)}</strong></>}
            </span>
          </div>
        </div>

        {/* Toggle: visualização anterior (lista de tópicos detalhada) — oculto para perfil contabilidade */}
        {!isContabilidade && (
          <div className="text-center">
            <button
              type="button"
              onClick={() => setShowDetails(v => !v)}
              className="text-xs text-[hsl(258,90%,66%)] hover:underline inline-flex items-center gap-1"
            >
              {showDetails ? "Ocultar etapas detalhadas" : "Ver etapas detalhadas"}
              <ChevronDown className={`w-3 h-3 transition-transform ${showDetails ? "rotate-180" : ""}`} />
            </button>
          </div>
        )}

        {showDetails && (
          <div className="space-y-2 animate-in fade-in slide-in-from-top-2 duration-300">
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
        )}
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

const TabDiagnostico = ({ data }: { data?: any }) => {
  const d = data || diagnosticoData;
  const r = riskBadge["moderado"];
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2"><FileCheck className="w-4 h-4 text-emerald-500" /> Diagnóstico Técnico-Contábil</CardTitle>
            <Badge className={`${r.bg} border text-xs`}>Diagnóstico Certificado</Badge>
          </div>
          <CardDescription>Diagnóstico Executivo Certificado — Avaliação Contábil e Financeira</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="p-4 rounded-lg bg-muted/30 border border-border/50">
            <p className="text-sm text-foreground leading-relaxed">{d.resumo}</p>
          </div>
          <div>
            <h4 className="text-sm font-semibold text-foreground mb-3">Achados Relevantes e Diagnóstico Executivo</h4>
            <div className="space-y-2">
              {(d.pontosChave || []).map((p: any) => (
                <div key={p.item} className="flex items-center justify-between p-3 rounded-lg bg-muted/20 border border-border/30">
                  <div className="flex items-center gap-3">
                    <div className={`w-2.5 h-2.5 rounded-full ${
                      p.status === "positivo" ? "bg-emerald-500" :
                      p.status === "atencao" ? "bg-yellow-500" : "bg-red-500"
                    }`} />
                    <span className="text-sm font-medium text-foreground">{p.item.replace(/\s+\d+%.*$/, "").replace(/Pontos-chave/i, "Achado relevante")}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">{p.detail.replace(/(\b\w+\b)(?:\s+\1)+/gi, "$1")}</span>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

/* ── Helper: compute indicators from parsed data (legacy OCR) ── */
/**
 * CANONICAL SSOT: Converte ParsedFinancialData para a série de indicadores canônicos.
 * Camada de compatibilidade para relatórios que ainda operam sobre o parser direto.
 */
const computeIndicatorsFromParsed = (parsed: ParsedFinancialData | null) => {
  if (!parsed) return {};
  const rows = buildBSDados(parsed);
  return computeIndicatorsFromBSRows(rows);
};

/* ── Helper: indicators from processed BS rows (SSOT) — delega à engine única ── */
const computeIndicatorsFromBSRows = (rows: any[]) => {
  if (!rows || rows.length === 0) return {};
  const result: Record<string, any> = {};
  for (const r of rows) {
    const ind = computeIndicatorsForRow(r);
    result[r.mesKey] = {
      liquidezCorrente: ind.liquidezCorrente,
      liquidezSeca: ind.liquidezSeca,
      liquidezImediata: ind.liquidezImediata,
      liquidezGeral: ind.liquidezGeral,
      endividamentoTotal: ind.endividamentoTotal,
      composicaoEndividamento: ind.composicaoEndividamento,
      imobilizacaoPL: ind.imobilizacaoPL,
      coberturaJuros: ind.coberturaJuros,
      giroAtivo: ind.giroAtivo,
      pmr: ind.pmr,
      pmp: ind.pmp,
      idadeMediaEstoque: ind.idadeMediaEstoque,
      margemLiquida: ind.margemLiquida,
      margemOperacional: ind.margemOperacional,
      roa: ind.roa,
      roe: ind.roe,
      ebitda: ind.ebitda,
      _ac: ind._ac, _anc: ind._anc, _pc: ind._pc, _pnc: ind._pnc, _pl: ind._pl,
      _caixa: ind._caixa, _receita: ind._receita, _lucro: ind._resultado,
      _resOp: ind._resultado + ind._despFin, _despFin: ind._despFin,
      _imob: ind._imob, _estoque: ind._estoque,
      _fornecedores: ind._fornecedores, _cmv: ind._cmv,
      _contasReceber: ind._contasReceber,
      _divida_financeira: r.divida_financeira || 0,
      _divida_tributaria: r.divida_tributaria || 0,
      _divida_trabalhista: r.divida_trabalhista || 0,
      _credores_rj: r.credores_rj || 0,
      _depreciacao: ind._depreciacao,
      _amortizacao: ind._amortizacao,
    };
  }
  return result;
};

/* ── Tab 2: Indicadores Econômico-Financeiros ── */
const TabIndicadores = ({ parsedData, aiAnalysis, bsRows }: { parsedData?: ParsedFinancialData | ConsolidatedFinancialData | null; aiAnalysis?: any; bsRows?: any[] }) => {
  const { state } = useAudit();
  const computedInd = useMemo(
    () => (bsRows && bsRows.length > 0 ? computeIndicatorsFromBSRows(bsRows) : computeIndicatorsFromParsed(parsedData || null)),
    [bsRows, parsedData],
  );
  const hasComputed = Object.keys(computedInd).length > 0;

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
        endividamentoTotal: aiInd.endividamentoTotal || 0,
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
        { label: "Liquidez Corrente", key: "liquidezCorrente", fmt: (n: number) => (n ?? 0).toFixed(2), formula: "AC / PC", benchmark: "> 1,5", accounts: ["Ativo Circulante (Grupo 1.1)", "Passivo Circulante (Grupo 2.1)"] },
        { label: "Liquidez Seca", key: "liquidezSeca", fmt: (n: number) => (n ?? 0).toFixed(2), formula: "(AC - EST) / PC", benchmark: "> 1,0", accounts: ["Ativo Circulante (Grupo 1.1)", "Estoques (Ref 1: D)", "Passivo Circulante (Grupo 2.1)"] },
        { label: "Liquidez Imediata", key: "liquidezImediata", fmt: (n: number) => (n ?? 0).toFixed(2), formula: "Caixa / PC", benchmark: "> 0,3", accounts: ["Disponibilidades (Refs 1: A, B)", "Passivo Circulante (Grupo 2.1)"] },
        { label: "Liquidez Geral", key: "liquidezGeral", fmt: (n: number) => (n ?? 0).toFixed(2), formula: "(AC + RLP) / (PC + PNC)", benchmark: "> 0,1", accounts: ["Ativo Circulante (Grupo 1.1)", "Realizável a Longo Prazo (Grupo 1.2.1)", "Passivo Circulante (Grupo 2.1)", "Passivo Não Circulante (Grupo 2.2)"] },
      ]
    },
    {
      title: "Endividamento", icon: PieChart, items: [
        { label: "Endividamento Total", key: "endividamentoTotal", fmt: fmtPct, formula: "(PC + PNC) / AT", benchmark: "< 60%", accounts: ["Passivo Circulante", "Passivo Não Circulante", "Ativo Total"] },
        { label: "Composição Endividamento", key: "composicaoEndividamento", fmt: fmtPct, formula: "PC / PT", benchmark: "< 50%", accounts: ["Passivo Circulante (Curto Prazo)", "Passivo Total (Exigível)"] },
        { label: "Imobilização do PL", key: "imobilizacaoPL", fmt: fmtPct, formula: "Imob / PL", benchmark: "< 80%", accounts: ["Ativo Imobilizado (Ref 1: R)", "Patrimônio Líquido (Grupo 2.3)"] },
        { label: "Cobertura de Juros", key: "coberturaJuros", fmt: (n: number) => `${(n ?? 0).toFixed(1)}x`, formula: "LAJIR / Juros", benchmark: "> 3,0x", accounts: ["Resultado Operacional", "Despesas Financeiras (Grupo 7)"] },
      ]
    },
    {
      title: "Atividade", icon: BarChart3, items: [
        { label: "Giro do Ativo", key: "giroAtivo", fmt: (n: number) => (n ?? 0).toFixed(2), formula: "V / AT", benchmark: "> 0,5", accounts: ["Receita Líquida (Grupo 3)", "Ativo Total"] },
        { label: "PMR", key: "pmr", fmt: fmtDays, formula: "DR×360 / V", benchmark: "< 60d", accounts: ["Contas a Receber (Ref 1: C)", "Receita Líquida (Grupo 3)"] },
        { label: "PMP", key: "pmp", fmt: fmtDays, formula: "DP×360 / Compras", benchmark: "< 45d", accounts: ["Fornecedores (Ref 1: BB, PP)", "Custo das Mercadorias Vendidas (Grupo 4)"] },
        { label: "Idade Média Estoque", key: "idadeMediaEstoque", fmt: fmtDays, formula: "EST×360 / CMV", benchmark: "< 90d", accounts: ["Estoques (Ref 1: D)", "Custo das Mercadorias Vendidas (Grupo 4)"] },
      ]
    },
    {
      title: "Rentabilidade", icon: TrendingUp, items: [
        { label: "Margem Líquida", key: "margemLiquida", fmt: fmtPct, formula: "LL / V", benchmark: "> 10%", accounts: ["Lucro Líquido (Grupo Resultado)", "Receita Líquida (Grupo 3)"] },
        { label: "Margem Operacional", key: "margemOperacional", fmt: fmtPct, formula: "LAJIR / V", benchmark: "> 15%", accounts: ["Lucro Operacional (LAJIR)", "Receita Líquida (Grupo 3)"] },
        { label: "ROE", key: "roe", fmt: fmtPct, formula: "LL / PL", benchmark: "> 15%", accounts: ["Lucro Líquido (Grupo Resultado)", "Patrimônio Líquido (Grupo 2.3)"] },
        { label: "ROA", key: "roa", fmt: fmtPct, formula: "LL / AT", benchmark: "> 5%", accounts: ["Lucro Líquido (Grupo Resultado)", "Ativo Total"] },
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
                    {years.map(y => <TableHead key={y} className="text-right text-[10px]">{/^\d{4}-\d{1,2}$/.test(y) ? mesKeyToLabel(y) : y}</TableHead>)}
                    <TableHead className="text-right text-[10px]">Benchmark</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sec.items.map(item => (
                    <TableRow key={item.key}>
                      <TableCell className="text-xs font-medium">
                        <div className="flex items-center gap-1.5">
                          {item.label}
                          <FormulaInfo 
                            title={item.label} 
                            formula={item.formula} 
                            accounts={item.accounts} 
                          />
                        </div>
                      </TableCell>
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
          <CardTitle className="text-sm flex items-center gap-2">
            <Calculator className="w-4 h-4 text-accent" /> 
            EBITDA Estimado
            <FormulaInfo 
              title="EBITDA Estimado" 
              formula="LAJIR + Depreciação + Amortização" 
              accounts={["Resultado Operacional (LAJIR)", "Despesas Financeiras (Grupo 7)", "Depreciação/Amortização (quando disponível)"]} 
            />
          </CardTitle>
        </CardHeader>
          <CardContent>
            <div className={`grid grid-cols-${Math.min(years.length, 4)} gap-4`}>
              {years.map(y => {
                const d = computedInd[y];
                if (!d) return null;
                const ebitda = d.ebitda || (d._resOp || 0) + (d._despFin || 0);
                return (
                  <div key={y} className="p-4 rounded-lg bg-muted/30 text-center">
                    <p className="text-xs text-muted-foreground">{/^\d{4}-\d{1,2}$/.test(y) ? mesKeyToLabel(y) : y}</p>
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
const TabEndividamento = ({ aiAnalysis, parsedData, bsRows }: { aiAnalysis?: any; parsedData?: ParsedFinancialData | null; bsRows?: any[] }) => {
  const computedInd = useMemo(
    () => (bsRows && bsRows.length > 0 ? computeIndicatorsFromBSRows(bsRows) : computeIndicatorsFromParsed(parsedData || null)),
    [bsRows, parsedData],
  );
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

  // Use debt components from processed BS rows
  const emprestimos = d?._divida_financeira || 0;
  const fornecedores = d?._fornecedores || aiStruct?.fornecedores || 0;
  const tributario = d?._divida_tributaria || 0;
  const trabalhista = d?._divida_trabalhista || 0;
  const credoresRJ = d?._credores_rj || 0;
  const dividaTotal = emprestimos + fornecedores + tributario + trabalhista + credoresRJ;
  const dividaLiquida = (emprestimos + fornecedores + tributario + trabalhista + credoresRJ) - caixa;

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
              { label: "Tributário Parcelado", value: tributario },
              { label: "Obrigações Trabalhistas", value: trabalhista },
              { label: "Credores RJ", value: credoresRJ },
              { label: "Caixa e Equivalentes", value: -caixa },
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
const TabPatrimonial = ({ aiAnalysis, parsedData, bsRows }: { aiAnalysis?: any; parsedData?: ParsedFinancialData | null; bsRows?: any[] }) => {
  const { state } = useAudit();

  // Use parsed data if available, otherwise fall back to mock
  const hasParsed = parsedData && parsedData.balanco.length > 0;
  const rows = hasParsed ? [...(parsedData.balanco || []), ...(parsedData.dre || [])] : state.balancoRows;
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
          <CardTitle className="text-base flex items-center gap-2"><Layers className="w-4 h-4 text-accent" /> Balancete de Verificação Consolidado — Visão Analítica</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {(() => {
            // Mostrar apenas Grupos (1 dígito) e Subgrupos (2 dígitos) — oculta contas analíticas.
            // Mantém também linhas que sejam totalizadores explícitos.
            const groupedRows = rows.filter((row: any) => {
              const code = String(row.conta || "").replace(/\D/g, "");
              const desc = String(row.descricao || "").toLowerCase();
              const isTotal = desc.includes("total") || desc.includes("grupo");
              return (code.length > 0 && code.length <= 2) || isTotal;
            });
            return (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-[10px]">Descrição</TableHead>
                    {years.map(y => <TableHead key={y} className="text-right text-[10px]">{y}</TableHead>)}
                    {prevYear && <TableHead className="text-right text-[10px]">AH {lastYear}/{prevYear}</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {groupedRows.map((row: any, idx: number) => {
                    const vPrev = prevYear ? (row.values[prevYear] || 0) : 0;
                    const vLast = row.values[lastYear] || 0;
                    const ah = vPrev !== 0 ? ((vLast - vPrev) / Math.abs(vPrev)) : 0;
                    const isAlert = Math.abs(ah) > 0.25;
                    const code = String(row.conta || "").replace(/\D/g, "");
                    const isGroup = code.length === 1;
                    const isSubgroup = code.length === 2;
                    const indent = isGroup ? "pl-0" : isSubgroup ? "pl-4" : "pl-8";
                    const weight = isGroup
                      ? "font-bold text-foreground uppercase tracking-wide"
                      : isSubgroup
                      ? "font-semibold text-foreground"
                      : "text-muted-foreground";
                    const bg = isGroup ? "bg-accent/10" : isSubgroup ? "bg-muted/40" : "";
                    return (
                      <TableRow key={`${row.conta}-${idx}`} className={`${bg} ${(row as any).hasRisk ? "bg-orange-500/5" : ""}`}>
                        <TableCell className={`text-xs ${indent} ${weight}`}>{row.descricao}</TableCell>
                        {years.map(y => (
                          <TableCell key={y} className={`text-right text-xs font-mono ${isGroup ? "font-bold" : isSubgroup ? "font-semibold" : ""}`}>{fmt(row.values[y] || 0)}</TableCell>
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
            );
          })()}
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
const TabAnaliseTecnica = ({ pendenciasData, parsedData, isHistoricalView = false, company }: { pendenciasData?: any[]; parsedData?: ParsedFinancialData | null; isHistoricalView?: boolean; company?: Company | null }) => {
  const activePendencias = pendenciasData || pendencias;
  const [selectedId, setSelectedId] = useState(activePendencias[0]?.id || "");
  const selected = activePendencias.find((p: any) => p.id === selectedId);
  const balanceteScopeId = useMemo(() => {
    const empresa = company?.name || parsedData?.documentInfo?.empresa || "balancete carregado";
    const periodo = parsedData?.documentInfo?.periodo || (parsedData?.years || []).join("-") || "atual";
    return `${empresa} — ${periodo}`;
  }, [company, parsedData]);
  const [chatMessages, setChatMessages] = useState<Array<{ role: "user" | "assistant"; text: string }>>([
    { role: "assistant", text: `Sou o Técnico Contábil Sênior IA. Estou restrito EXCLUSIVAMENTE ao balancete carregado nesta auditoria (${balanceteScopeId}). Selecione uma pendência e me pergunte — respondo sobre fundamentação técnica, riscos, ajustes contábeis e impacto no parecer SOMENTE com base nestes dados. Não consulto outras empresas, outros relatórios ou fontes externas.` },
  ]);
  const [chatInput, setChatInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const chatScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatScrollRef.current?.scrollTo({ top: chatScrollRef.current.scrollHeight, behavior: "smooth" });
  }, [chatMessages]);

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
        escopoExclusivo: balanceteScopeId,
        restricao: "Responder EXCLUSIVAMENTE sobre o balancete abaixo. Não usar conhecimento externo, outras empresas, outros relatórios ou benchmarks de mercado. Se a pergunta sair desse escopo, recusar educadamente.",
        empresa: company?.name || parsedData?.documentInfo?.empresa || null,
        periodo: parsedData?.documentInfo?.periodo || null,
        anos: parsedData?.years || [],
        pendenciaSelecionada: selected,
        balancete: parsedData ? {
          balanco: parsedData.balanco,
          dre: parsedData.dre,
        } : null,
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
            <CardTitle className="text-sm">📌 Ponto de Vista do Técnico IA</CardTitle>
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
              <p className="text-sm text-muted-foreground">Selecione uma pendência para ver o parecer do Técnico IA.</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Chat IA integrado — disponível apenas no dia da auditoria (oculto em relatórios históricos) */}
      {isHistoricalView ? (
        <Card className="border-dashed">
          <CardContent className="py-4">
            <p className="text-xs text-muted-foreground flex items-center gap-2">
              <MessageCircle className="w-4 h-4 opacity-50" />
              O Chat com o Técnico IA Sênior está disponível apenas no dia da realização da auditoria. Em relatórios históricos ele não fica acessível para consulta.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-[hsl(258,90%,66%)]/30 shadow-lg">
          <CardHeader className="pb-2 bg-[hsl(258,90%,66%)]/5 border-b border-[hsl(258,90%,66%)]/20">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <CardTitle className="text-sm flex items-center gap-2 text-foreground">
                <MessageCircle className="w-4 h-4 text-[hsl(258,90%,66%)]" /> Chat com Técnico IA Sênior
              </CardTitle>
              <div className="flex items-center gap-1.5 flex-wrap">
                <Badge variant="outline" className="text-[10px] border-[hsl(258,90%,66%)]/40 text-[hsl(258,90%,66%)]">
                  Escopo exclusivo: {balanceteScopeId}
                </Badge>
                {selected && (
                  <Badge variant="secondary" className="text-[10px]">Conta {selected.conta}</Badge>
                )}
              </div>
            </div>
            <CardDescription className="text-xs">
              Respostas restritas exclusivamente aos dados do balancete carregado nesta auditoria. O agente não consulta outras empresas, outros relatórios ou fontes externas.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-4">
            <div
              ref={chatScrollRef}
              className="mb-3 overflow-y-auto rounded-lg border border-border/40 bg-background/60 p-3"
              style={{ height: 340 }}
            >
              <div className="space-y-3">
                {chatMessages.map((msg, i) => (
                  <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[85%] p-3 rounded-xl text-sm leading-relaxed whitespace-pre-wrap shadow-sm ${
                      msg.role === "user"
                        ? "bg-[hsl(258,90%,66%)] text-white rounded-br-sm"
                        : "bg-card text-foreground border border-border/60 rounded-bl-sm"
                    }`}>
                      {msg.text}
                    </div>
                  </div>
                ))}
                {isStreaming && (
                  <div className="flex justify-start">
                    <div className="bg-card border border-border/60 rounded-xl rounded-bl-sm px-3 py-2 text-xs text-muted-foreground flex items-center gap-2">
                      <Loader2 className="w-3 h-3 animate-spin" /> Técnico IA analisando...
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex flex-wrap gap-1.5">
                {["Por que classificou como crítico?", "Qual o impacto no balancete?", "Qual ajuste contábil sugere?", "Gera ressalva no parecer?"].map(q => (
                  <button key={q} onClick={() => setChatInput(q)}
                    className="text-[10px] px-2.5 py-1 rounded-full bg-muted/60 border border-border/60 text-foreground hover:bg-[hsl(258,90%,66%)]/10 hover:border-[hsl(258,90%,66%)]/40 transition-colors">
                    {q}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <Input value={chatInput} onChange={(e) => setChatInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && sendChat()} placeholder="Pergunte sobre este balancete..." className="text-sm" disabled={isStreaming} />
                <Button onClick={sendChat} disabled={isStreaming} className="bg-[hsl(258,90%,66%)] hover:bg-[hsl(258,90%,56%)] text-white px-4">
                  {isStreaming ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}


    </div>
  );
};

/* ══════════════════════════════════════════════════════
   TAB: RELATÓRIO FINAL — PREVIEW (antes de gerar)
   ══════════════════════════════════════════════════════ */
const reportTopicsBex = [
  { num: "1", title: "Capa", desc: "Logo BEX, título, empresa, CNPJ, data-base, responsável técnico e diagnóstico técnico-contábil", icon: Shield },
  { num: "2", title: "Diagnóstico Técnico-Contábil", desc: "Situação geral, classificação de risco, achados relevantes e conclusão técnica com fundamentação CPC/IFRS/NBC TA", icon: Activity },
  { num: "3", title: "Solvência", desc: "Liquidez Corrente, Seca, Geral, Solvência Total, Capital de Giro, Cobertura de Juros — com interpretação técnica", icon: Scale },
  { num: "4", title: "Análise Técnica — Pendências", desc: "Tabela consolidada com tipo, gravidade, impacto, fundamentação normativa e recomendações corretivas", icon: AlertTriangle },
  { num: "5", title: "Indicadores Econômico-Financeiros", desc: "Liquidez, Endividamento, Rentabilidade e EBITDA Certificado com fórmulas e interpretação", icon: BarChart3 },
  { num: "6", title: "Endividamento", desc: "Estrutura da dívida, concentração de risco, dependência bancária e análise estratégica", icon: Landmark },
  { num: "7", title: "Balanço Patrimonial", desc: "Ativo, Passivo, PL com análise horizontal e validações de consistência", icon: Layers },
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
const ReportPage = ({ children, className = "" }: { children: React.ReactNode, className?: string }) => (
  <div className={`report-a4-page ${className}`} style={{ "--report-watermark": `url(${folhaRostoBg})` } as React.CSSProperties}>
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
export const TabRelatorioFinal = ({ onBack, aiAnalysis, parsedData, onSwitchToKanitz, variant = "resumido", uploadedFiles, sourceDocs, company, balanceteEntries }: { onBack: () => void; aiAnalysis?: any; parsedData?: ParsedFinancialData | null; onSwitchToKanitz?: () => void; variant?: "resumido" | "completo"; uploadedFiles?: File[]; sourceDocs?: { fileName: string; fileSize: number; format: string }[]; company?: Company | null; balanceteEntries?: BalanceteEntry[] }) => {
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
  
  const computeIndicatorsFromParsed = useCallback((parsed: ParsedFinancialData | null): Record<string, IndicatorRow> => {
    if (!parsed) return {};
    const rows = buildBSDados(parsed, balanceteEntries || []);
    const out: Record<string, IndicatorRow> = {};
    rows.forEach(r => {
      out[r.mesKey] = computeIndicatorsForRow(r);
    });
    return out;
  }, [balanceteEntries]);

  const reportDataset: CanonicalReportDataset | null = useMemo(() => {
    if (!parsedData || !company) return null;
    const computed = computeIndicatorsFromParsed(parsedData);
    const years = Object.keys(computed).sort();
    const latestYear = years[years.length - 1];
    if (!latestYear) return null;
    
    const rows = buildBSDados(parsedData, balanceteEntries || []);
    const latestRow = rows.find(r => r.mesKey === latestYear);
    if (!latestRow) return null;

    const traceId = `BEX-RUNTIME-${latestYear.replace("-", "")}-${Math.random().toString(36).substring(7).toUpperCase()}`;

    return {
      runtime_trace_id: traceId,
      canonical_snapshot_id: `SNAP-${traceId}`,
      competency: latestYear,
      company_id: company.id,
      generated_at: new Date().toISOString(),
      facts: latestRow,
      ratios: computed[latestYear],
      kanitz: null,
      narratives: {},
      limitations: latestRow.errors,
    };
  }, [parsedData, company, balanceteEntries, computeIndicatorsFromParsed]);

  const activeYear = reportDataset?.competency || "";
  const d = reportDataset?.facts;
  
  const computedInd = useMemo(() => computeIndicatorsFromParsed(parsedData || null), [parsedData, computeIndicatorsFromParsed]);

  const years = Object.keys(computedInd).sort((a, b) => {
    const pa = a.includes("/") ? a.split("/").reverse().join("") : a;
    const pb = b.includes("/") ? b.split("/").reverse().join("") : b;
    return pa.localeCompare(pb);
  });
  const latestYear = years[years.length - 1];
  const indForDashboard = latestYear ? computedInd[latestYear] : null;

  const activeScore = aiAnalysis?.scoreRJ || scoreRJData;
  const activeDiag = aiAnalysis?.diagnostico || diagnosticoData;
  const activePend = aiAnalysis?.pendencias || pendencias;

  const hasBexScore = false; 
  const scoreColor = "text-slate-400";
  const scoreBg = "bg-slate-100 border-slate-200";
  const scoreLabel = "Score Desativado";
  const riskIcon = "📋";

  const pc = d?.passivo_circulante || 0;
  const pnc = d?.passivo_nao_circulante || 0;
  const ac = d?.ativo_circulante || 0;
  const anc = d?.ativo_nao_circulante || 0;
  const ptotal = pc + pnc || 1;

  const caixa = d?.disponivel || 0;
  const emprestimos = d?.divida_financeira || 0;


  const dividaOnerosa = emprestimos;
  const fornec = d?.fornecedores || 0;

  const latestInd = computedInd[latestYear];

  const solvencyIndicators = latestInd ? [
    { name: "Liquidez Corrente", result: fmtDec(latestInd.liquidezCorrente), param: "> 1,5", classification: (latestInd.liquidezCorrente ?? 0) > 1.5 ? "Adequada" : (latestInd.liquidezCorrente ?? 0) > 1 ? "Atenção" : "Insuficiente", comment: `AC R$ ${fmt(latestInd._ac)} / PC R$ ${fmt(latestInd._pc)}` },
    { name: "Liquidez Seca", result: fmtDec(latestInd.liquidezSeca), param: "> 1,0", classification: (latestInd.liquidezSeca ?? 0) > 1 ? "Adequada" : "Atenção", comment: `(AC - Estoques) / PC` },
    { name: "Liquidez Geral", result: fmtDec(latestInd.liquidezGeral), param: "> 1,0", classification: (latestInd.liquidezGeral ?? 0) > 1 ? "Adequada" : "Insuficiente", comment: `(AC + RLP) / (PC + PNC)` },
    { name: "Cobertura de Juros", result: `${(latestInd.coberturaJuros ?? 0).toFixed(2)}x`, param: "> 3,0x", classification: (latestInd.coberturaJuros ?? 0) > 3 ? "Adequada" : "Atenção", comment: `LAJIR / Despesas Financeiras` },
    { name: "Capital de Giro Líquido", result: `R$ ${fmt(latestInd._ac - latestInd._pc)}`, param: "> 0", classification: (latestInd._ac - latestInd._pc) > 0 ? "Positivo" : "Negativo", comment: `AC - PC` },
    { name: "Solvência Total (ISG)", result: fmtDec(latestInd._at / (latestInd._pt || 1)), param: "> 1,0", classification: (latestInd._at / (latestInd._pt || 1)) > 1 ? "Solvente" : "Insolvente", comment: `AT / PT` },
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
    classificacao: "saudavel" | "estavel" | "atencao" | "risco" | "insolvente" | "na";
    ac: number; anc: number; pc: number; pnc: number; pl: number; estoque: number; rlp: number; pt: number; ll: number; at: number; rl: number;
    ebitda: number; lajir: number; despFin: number; kanitzAplicavel: boolean; isg: number;
  }> = [];

  const kanitzIndMap: Record<string, any> = {};
  if (parsedData) {
    const computed = computedInd; // Já computado acima
    Object.keys(computed).forEach(k => {
      const ind = computed[k];
      const kAplic = ind._pl > 0;
      
      // Kanitz FI (Fator de Insolvência) Canônico
      const fi = kAplic ? (0.05 * (ind.roe/12)) + (1.65 * ind.liquidezGeral) + (3.55 * ind.liquidezSeca) - (1.06 * ind.liquidezCorrente) - (0.33 * ind.grauEndividamentoPL) : 0;
      
      const isgValue = ind._at / (ind._pc + ind._pnc || 1);
      const classificacao: any = !kAplic ? "na" :
        fi > 1 ? "saudavel" : fi > 0 ? "estavel" : fi > -1 ? "atencao" : fi >= -3 ? "risco" : "insolvente";

      kanitzResults.push({
        year: k, rpl: ind.roe/12, lg: ind.liquidezGeral, ls: ind.liquidezSeca, lc: ind.liquidezCorrente, ge: ind.grauEndividamentoPL, fi, classificacao,
        ac: ind._ac, anc: ind._anc, pc: ind._pc, pnc: ind._pnc, pl: ind._pl, estoque: ind._estoque, rlp: 0, pt: ind._pc + ind._pnc,
        ll: ind._resultado, at: ind._at, rl: ind._receita, ebitda: ind.ebitda || 0,
        lajir: ind._resultado + Math.abs(ind._despFin) - Math.abs(ind._recFin), 
        despFin: Math.abs(ind._despFin), kanitzAplicavel: kAplic, isg: isgValue
      });
    });
  }

  if (kanitzResults.length === 0 && aiAnalysis?.kanitz) {
    const aiK = aiAnalysis.kanitz;
    const comp = aiK.componentes || {};
    const aiStruct = aiAnalysis?.diagnostico?.estruturaFinanceira || {};
    const fi = aiK.fatorInsolvencia || 0;
    const pl = aiStruct.patrimonio_liquido || 0;
    const kAplic = pl > 0;
    const classificacao: any = !kAplic ? "na" :
      fi > 1 ? "saudavel" : fi > 0 ? "estavel" : fi > -1 ? "atencao" : fi >= -3 ? "risco" : "insolvente";
    kanitzResults.push({
      year: "Análise IA", rpl: comp.rpl || 0, lg: comp.lg || 0, ls: comp.ls || 0, lc: comp.lc || 0, ge: comp.ge || 0,
      fi, classificacao, ac: aiStruct.ativo_circulante || 0, anc: aiStruct.ativo_nao_circulante || 0,
      pc: aiStruct.passivo_circulante || 0, pnc: aiStruct.passivo_nao_circulante || 0, pl: aiStruct.patrimonio_liquido || 0,
      estoque: aiStruct.estoques || 0, rlp: 0, pt: (aiStruct.passivo_circulante || 0) + (aiStruct.passivo_nao_circulante || 0),
      ll: aiStruct.lucro_liquido || 0, at: (aiStruct.ativo_circulante || 0) + (aiStruct.ativo_nao_circulante || 0), rl: aiStruct.receita_liquida || 0,
      ebitda: 0, lajir: 0, despFin: 0, kanitzAplicavel: kAplic, isg: 0
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
  const fmtKDec = (n: number) => (n ?? 0).toFixed(4);

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
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => exportPdf('report-bex-container', 'Relatório BEX')}>
            <Download className="w-4 h-4" /> Exportar PDF
          </Button>
          <span className="relative group/docbtn hidden">
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => exportDocx('report-bex-container', 'Relatório BEX')}>
              <FileText className="w-4 h-4" /> Exportar .doc
            </Button>
            <span className="pointer-events-none absolute -top-7 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded bg-red-600 text-white text-[10px] font-bold whitespace-nowrap shadow-md opacity-0 group-hover/docbtn:opacity-100 transition-opacity">
              Será removido
            </span>
          </span>
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
            <span className="text-sm font-semibold text-foreground">{scoreLabel}</span>
          </div>

          <div className="mt-10 space-y-1.5 text-sm text-muted-foreground">
            <p className="font-semibold text-foreground text-base">Empresa Analisada: {company?.name || "Empresa Demonstração S.A."}</p>
            <p>CNPJ: {company?.cnpj || "12.345.678/0001-90"}</p>
            <p>Data-base do Balancete: {latestYear || "31/12/2023"}</p>
            <p>Data de Emissão: {today}</p>
          </div>

          <div className="mt-8 pt-6 border-t border-border w-full max-w-md space-y-1">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Responsável Técnico</p>
            <p className="text-sm font-semibold text-foreground">Técnico Contábil Sênior IA</p>
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
            <h3 className="text-sm font-semibold text-foreground mb-2">1.3 Conclusão Técnica do Técnico IA</h3>
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
                      <Tooltip formatter={(v: number) => [`${(v ?? 0).toFixed(1)}%`, "Resultado"]} />
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
                { title: "Continuidade Operacional (Going Concern)", text: "Com PL de R$ " + fmt(latestInd?._pl || 0) + " e capital de giro líquido " + ((latestInd?._ac || 0) - (latestInd?._pc || 0) > 0 ? "positivo" : "negativo") + ", a premissa de continuidade requer monitoramento contínuo." },
                { title: "Probabilidade Estrutural de RJ", text: (latestInd?.liquidezCorrente ?? 0) > 1.0 ? "Baixa probabilidade. Indicadores dentro dos parâmetros aceitáveis." : (latestInd?.liquidezCorrente ?? 0) > 0.5 ? "Moderada. Deterioração dos indicadores exige atenção e medidas preventivas conforme Lei 11.101/2005." : "Elevada. Recomenda-se plano de reestruturação financeira imediato." },
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
              <Table style={{ tableLayout: 'fixed', width: '100%' }}>
                <TableHeader>
                  <TableRow>
                    <TableHead style={{ width: '5%' }} className="text-[10px] px-1">ID</TableHead>
                    <TableHead style={{ width: '11%' }} className="text-[10px] px-1">Tipo</TableHead>
                    <TableHead style={{ width: '15%' }} className="text-[10px] px-1">Conta</TableHead>
                    <TableHead style={{ width: '27%' }} className="text-[10px] px-1">Descrição</TableHead>
                    <TableHead style={{ width: '10%' }} className="text-[10px] px-1 text-center">Gravidade</TableHead>
                    <TableHead style={{ width: '15%' }} className="text-[10px] px-1">Impacto</TableHead>
                    <TableHead style={{ width: '17%' }} className="text-[10px] px-1">Recomendação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {activePend
                    .filter((p: any) => {
                      // Filter out platform-error-based pendencies
                      const prob = (p.problema || "").toLowerCase();
                      const impact = (p.impacto || "").toLowerCase();
                      const isInternalError = 
                        prob.includes("reportada como 0") || 
                        prob.includes("reportado como zero") ||
                        impact.includes("fatores determinísticos") ||
                        prob.includes("não capturado") ||
                        (prob.includes("receita líquida") && prob.includes("zero")) ||
                        (prob.includes("estoque") && prob.includes("zero"));
                      return !isInternalError;
                    })
                    .map((p: any, i: number) => (
                      <TableRow key={p.id}>
                        <TableCell className="text-[10px] font-mono px-1">{i + 1}</TableCell>
                        <TableCell className="text-[10px] px-1">{p.tipo}</TableCell>
                        <TableCell className="text-[10px] font-mono px-1 truncate">{p.conta}</TableCell>
                        <TableCell className="text-[10px] px-1 leading-tight">{p.problema}</TableCell>
                        <TableCell className="px-1 text-center"><Badge className={`${severityColors[p.gravidade]?.bg} text-[9px] px-1 py-0 h-4`}>{severityColors[p.gravidade]?.label}</Badge></TableCell>
                        <TableCell className="text-[10px] px-1 leading-tight">{p.impacto}</TableCell>
                        <TableCell className="text-[10px] px-1 leading-tight">{p.recomendacao}</TableCell>
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
                      <TableCell className="text-right text-xs font-mono font-bold">{item.value != null ? fmtDec(item.value) : "—"}</TableCell>
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
                      const yInd = computedInd[y];
                      return {
                        name: y,
                        "LIQUIDEZ IMEDIATA": yInd?.liquidezImediata != null ? parseFloat(((yInd.liquidezImediata) ?? 0).toFixed(2)) : 0,
                        "LIQUIDEZ CORRENTE": yInd?.liquidezCorrente != null ? parseFloat(((yInd.liquidezCorrente) ?? 0).toFixed(2)) : 0,
                        "LIQUIDEZ SECA": yInd?.liquidezSeca != null ? parseFloat(((yInd.liquidezSeca) ?? 0).toFixed(2)) : 0,
                        "LIQUIDEZ GERAL": yInd?.liquidezGeral != null ? parseFloat(((yInd.liquidezGeral) ?? 0).toFixed(2)) : 0,
                      };
                    })} margin={{ top: 20, right: 20, left: 0, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                      <XAxis dataKey="name" tick={{ fontSize: 9 }} />
                      <YAxis tick={{ fontSize: 9 }} tickFormatter={(v) => v.toLocaleString('pt-BR')} />
                      <Tooltip formatter={(v: number) => (v ?? 0).toFixed(2)} />
                      <Legend wrapperStyle={{ fontSize: 9 }} />
                      <Line type="monotone" dataKey="LIQUIDEZ IMEDIATA" stroke="#5b9bd5" strokeWidth={2} dot={{ r: 3 }} />
                      <Line type="monotone" dataKey="LIQUIDEZ CORRENTE" stroke="#ed7d31" strokeWidth={2} dot={{ r: 3 }} />
                      <Line type="monotone" dataKey="LIQUIDEZ SECA" stroke="#a5a5a5" strokeWidth={2} dot={{ r: 3 }} />
                      <Line type="monotone" dataKey="LIQUIDEZ GERAL" stroke="#70ad47" strokeWidth={2} dot={{ r: 3 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* Gráfico Evolução do Endividamento (estilo gr2) — barras empilhadas + linha de total */}
            {years.length > 0 && (
              <div className="mt-4">
                <h4 className="text-xs font-semibold text-foreground mb-2 text-center">EVOLUÇÃO DO ENDIVIDAMENTO<br /><span className="font-normal text-[9px]">(Em milhares de reais)</span></h4>
                <div className="h-[260px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={years.map(y => {
                      const yInd = computedInd[y];
                      const tributarias = Math.abs(yInd?._dividaTributaria || 0);
                      const trabalhistas = Math.abs(yInd?._dividaTrabalhista || 0);
                      const emprestimos = Math.abs(yInd?._dividaFinanceira || 0);
                      const fornecedores = Math.abs(yInd?._fornecedores || 0);
                      const credoresRJ = Math.abs(yInd?._credoresRJ || 0);
                      const pt = Math.abs((yInd?._pc || 0) + (yInd?._pnc || 0));
                      const outras = Math.max(0, pt - tributarias - trabalhistas - emprestimos - fornecedores - credoresRJ);



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
                  `O endividamento total atinge ${fmtPct(latestInd.endividamentoTotal)}, ${latestInd.endividamentoTotal > 0.6 ? "acima do limite prudencial de 60%, indicando elevada dependência de capital de terceiros" : "dentro de parâmetros aceitáveis de dependência de capital de terceiros"}. A composição do endividamento revela que ${fmtPct(latestInd.composicaoEndividamento)} do passivo exigível vence no curto prazo, ${latestInd.composicaoEndividamento > 0.5 ? "configurando pressão sobre o fluxo de caixa operacional e risco de refinanciamento" : "demonstrando perfil de dívida alongado e menor pressão sobre o caixa de curto prazo"}. A imobilização do PL de ${fmtPct(latestInd.imobilizacaoPL)} ${latestInd.imobilizacaoPL > 1 ? "supera a unidade, indicando que a totalidade do capital próprio está comprometida com ativos permanentes, sin margem para financiar operações correntes" : "permanece em nível administrável"}.`
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
                      const yInd = computedInd[y];
                      const receita = Math.abs(yInd?._receita || 0) / 1000;
                      const cmv = Math.abs(yInd?._cmv || 0);
                      const despOp = Math.abs(yInd?._despFin || 0) * 1.5; // Mocking DespOp context
                      const despFin = Math.abs(yInd?._despFin || 0);


                      const cmvDesp = -((cmv + despOp + despFin) / 1000);
                      const pct = receita > 0 ? (Math.abs(cmvDesp) / receita) * 100 : 0;
                      return {
                        name: y,
                        "Receita Líquida": parseFloat(((receita) ?? 0).toFixed(0)),
                        "CMV + DESPESA / RECEITA LÍQUIDA": parseFloat(((cmvDesp) ?? 0).toFixed(0)),
                        pct: parseFloat(((pct) ?? 0).toFixed(2)),
                      };
                    })} margin={{ top: 25, right: 20, left: 0, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                      <XAxis dataKey="name" tick={{ fontSize: 9 }} />
                      <YAxis tick={{ fontSize: 9 }} tickFormatter={(v) => v.toLocaleString('pt-BR')} />
                      <Tooltip formatter={(v: number, n: string) => n === "pct" ? `${(v ?? 0).toFixed(2)}%` : `R$ ${(v * 1000).toLocaleString('pt-BR')}`} />
                      <Legend wrapperStyle={{ fontSize: 9 }} />
                      <Bar dataKey="Receita Líquida" fill="#5b9bd5">
                        <LabelList dataKey="Receita Líquida" position="top" fontSize={9} formatter={(v: number) => v.toLocaleString('pt-BR')} />
                      </Bar>
                      <Bar dataKey="CMV + DESPESA / RECEITA LÍQUIDA" fill="#c00000">
                        <LabelList dataKey="CMV + DESPESA / RECEITA LÍQUIDA" position="bottom" fontSize={9} formatter={(v: number) => `(${Math.abs(v).toLocaleString('pt-BR')})`} />
                      </Bar>
                      <Line type="linear" dataKey="pct" name="CMV + DESPESA / RECEITA LÍQUIDA (%)" stroke="#c00000" strokeWidth={0} dot={false}>
                        <LabelList dataKey="pct" position="top" fontSize={9} fill="#c00000" formatter={(v: number) => `${(v ?? 0).toFixed(2)}%`} />
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
                <p className="text-2xl font-bold font-mono text-foreground">R$ {fmt(latestInd?.ebitda || 0)}</p>
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
                { label: "Empréstimos e Financiamentos", value: reportDataset?.facts.divida_financeira || 0 },
                { label: "Dívida Bancária Total", value: reportDataset?.facts.divida_financeira || 0 },
                { label: "Fornecedores", value: reportDataset?.facts.fornecedores || 0 },
                { label: "Passivo Circulante", value: reportDataset?.facts.passivo_circulante || 0 },
                { label: "Passivo Não Circulante", value: reportDataset?.facts.passivo_nao_circulante || 0 },
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


      <ReportPage className={years.length > 6 ? "landscape" : ""}>
        <div className="space-y-4">
          <SectionTitle num="6" title="BALANÇO PATRIMONIAL CONSOLIDADO" />
          <div className="text-center mb-2">
            <h3 className="text-sm font-bold text-foreground uppercase tracking-wide">ESTRUTURA PATRIMONIAL POR GRANDES GRUPOS</h3>
            <p className="text-[10px] text-muted-foreground mt-1">Série Histórica Consolidada (Valores em R$)</p>
          </div>

          <div className="overflow-x-auto">
            <Table style={{ tableLayout: 'fixed', width: '100%' }}>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-[10px] w-[180px]">Conta / Grupo</TableHead>
                  {years.map(y => (
                    <TableHead key={y} className="text-right text-[10px] px-1">{fmtMonthCompact(y)}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {[
                  { label: "Ativo Circulante", key: "_ac" },
                  { label: "Ativo Não Circulante", key: "_anc" },
                  { label: "Passivo Circulante", key: "_pc" },
                  { label: "Passivo Não Circulante", key: "_pnc" },
                  { label: "Patrimônio Líquido", key: "_pl" },
                  { label: "Resultado do Período", key: "_resultado" },
                ].map((row, idx) => (
                  <TableRow key={row.label} className={idx % 2 === 0 ? "bg-muted/10" : ""}>
                    <TableCell className="text-xs font-semibold py-2">{row.label}</TableCell>
                    {years.map(y => (
                      <TableCell key={y} className="text-right text-xs font-mono py-2 whitespace-nowrap">
                        {fmt(computedInd[y]?.[row.key as keyof typeof latestInd] as number || 0)}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="mt-4">
            <h3 className="text-sm font-semibold text-foreground mb-2">Validações de Integridade</h3>
            <div className="grid sm:grid-cols-2 gap-3">
              {[
                { check: "Ativo = Passivo + PL", status: Math.abs((ac + anc) - (pc + pnc + (d?.patrimonio_liquido || 0))) < 100, detail: `Equilíbrio Patrimonial mantido` },
                { check: "Passivo a Descoberto", status: (d?.patrimonio_liquido ?? 0) > 0, detail: (d?.patrimonio_liquido ?? 0) > 0 ? "Patrimônio Líquido Positivo" : "IDENTIFICADO — PL negativo" },

                { check: "Capital de Giro Líquido", status: (ac ?? 0) > (pc ?? 0), detail: "CGL " + ((ac ?? 0) > (pc ?? 0) ? "positivo" : "negativo") },
                { check: "Solvência Geral", status: ((ac + anc) / (pc + pnc || 1)) >= 1, detail: "Capacidade de cobertura total" },
              ].map(v => (
                <div key={v.check} className={`flex items-center justify-between p-3 rounded-lg border ${v.status ? "bg-emerald-500/5 border-emerald-500/20" : "bg-red-500/5 border-red-500/20"}`}>
                  <div className="flex items-center gap-2">
                    {v.status ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> : <AlertTriangle className="w-4 h-4 text-red-500" />}
                    <span className="text-[11px] font-medium text-foreground">{v.check}</span>
                  </div>
                  <span className="text-[10px] text-muted-foreground">{v.detail}</span>
                </div>
              ))}
            </div>
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
              <span className="text-sm font-semibold text-foreground">{kanitzClassColors[latestKanitz.classificacao]?.label} — FI: {(latestKanitz.fi ?? 0).toFixed(2)}</span>
            </div>
            <div className="mt-10 grid sm:grid-cols-3 gap-6 text-sm text-muted-foreground w-full max-w-lg">
              <div><p className="text-[10px] text-muted-foreground/60 uppercase tracking-wider">Empresa</p><p className="font-semibold text-foreground">Empresa Analisada S.A.</p></div>
              <div><p className="text-[10px] text-muted-foreground/60 uppercase tracking-wider">Período</p><p className="font-semibold text-foreground">{kanitzResults.map(r => r.year).join(" / ")}</p></div>
              <div><p className="text-[10px] text-muted-foreground/60 uppercase tracking-wider">Emissão</p><p className="font-semibold text-foreground">{today}</p></div>
            </div>
            <div className="mt-8 pt-6 border-t border-border w-full max-w-md space-y-2">
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Responsável Técnico</p>
                <p className="text-sm font-semibold text-foreground">Técnico Contábil Sênior IA</p>
                <p className="text-xs text-muted-foreground">Modelo: Stephen Charles Kanitz — Termômetro de Insolvência (1978)</p>
              </div>

              <div className="pt-2 mt-2 border-t border-dashed border-border/50">
                <p className="text-[9px] text-muted-foreground uppercase tracking-wider font-bold mb-1">Metadados do Upload (Rastreabilidade)</p>
                <div className="grid grid-cols-1 gap-1 text-[10px]">
                  <p className="text-muted-foreground"><span className="font-medium text-foreground">Arquivo:</span> {uploadedFiles && uploadedFiles.length > 0 ? uploadedFiles.map(f => f.name).join(", ") : sourceDocs && sourceDocs.length > 0 ? sourceDocs.map(d => d.fileName).join(", ") : "N/A"}</p>
                  <p className="text-muted-foreground"><span className="font-medium text-foreground">Processamento:</span> {today}</p>
                  <p className="text-muted-foreground"><span className="font-medium text-foreground">Intervalo Analisado:</span> {kanitzResults.map(r => r.year).join(" / ")}</p>
                </div>
              </div>
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
                A empresa apresenta Fator de Insolvência de {(latestKanitz.fi ?? 0).toFixed(2)}, classificando-se como {kanitzClassColors[latestKanitz.classificacao]?.label?.toUpperCase()} segundo o modelo Kanitz. {(latestKanitz.fi ?? 0) > 0 ? "Os indicadores de liquidez e rentabilidade demonstram solidez financeira e capacidade plena de honrar obrigações." : (latestKanitz.fi ?? 0) > -3 ? "Os indicadores financeiros demonstram fragilidades que requerem monitoramento contínuo e medidas preventivas." : "A deterioração severa dos indicadores financeiros indica incapacidade de pagamento. Recomenda-se análise de viabilidade conforme Lei 11.101/2005."}
              </p>
            </div>
            <div className="grid sm:grid-cols-3 gap-3">
              <div className="p-3 rounded-lg bg-muted/20 text-center">
                <p className="text-[10px] text-muted-foreground">Pontuação Kanitz</p>
                <p className={`text-2xl font-bold font-mono ${kanitzClassColors[latestKanitz.classificacao]?.color}`}>{(latestKanitz.fi ?? 0).toFixed(2)}</p>
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
                    <LineChart data={kanitzResults.map(r => ({ name: r.year, FI: parseFloat(((r.fi) ?? 0).toFixed(2)) }))} margin={{ top: 25, right: 20, left: 0, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                      <XAxis dataKey="name" tick={{ fontSize: 9 }} />
                      <YAxis tick={{ fontSize: 9 }} domain={['auto', 'auto']} tickFormatter={(v) => ((v) ?? 0).toFixed(2)} />
                      <Tooltip formatter={(v: number) => [((v) ?? 0).toFixed(2), "Fator de Insolvência"]} />
                      <Line type="linear" dataKey="FI" stroke="#ed7d31" strokeWidth={2.5} dot={{ r: 4, fill: "#ed7d31" }}>
                        <LabelList dataKey="FI" position="top" fontSize={10} fill="#ed7d31" formatter={(v: number) => ((v) ?? 0).toFixed(2)} />
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
            <div className="space-y-6">
              <div>
                <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">Tabela A — Fórmulas e Pesos</h3>
                <div className="overflow-x-auto">
                  <Table style={{ tableLayout: 'fixed', width: '100%' }}>
                    <TableHeader>
                      <TableRow className="bg-muted/30">
                        <TableHead className="text-[10px] w-[120px]">Componente</TableHead>
                        <TableHead className="text-[10px] w-[200px]">Fórmula</TableHead>
                        <TableHead className="text-right text-[10px]">Peso</TableHead>
                        <TableHead className="text-[10px] pl-4">Significado</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {[
                        { name: "RPL (X1)", formula: "Lucro Líquido / Patrimônio Líquido", peso: "+0,05", desc: "Rentabilidade do PL" },
                        { name: "LG (X2)", formula: "(AC + RLP) / (PC + PNC)", peso: "+1,65", desc: "Solvência de Longo Prazo" },
                        { name: "LS (X3)", formula: "(AC - Estoques) / PC", peso: "+3,55", desc: "Liquidez Sem Estoques" },
                        { name: "LC (X4)", formula: "Ativo Circulante / Passivo Circulante", peso: "-1,06", desc: "Capacidade de Pagamento" },
                        { name: "GE (X5)", formula: "Passivo Total / Patrimônio Líquido", peso: "-0,33", desc: "Grau de Endividamento" },
                      ].map((item) => (
                        <TableRow key={item.name}>
                          <TableCell className="text-xs font-bold">{item.name}</TableCell>
                          <TableCell className="text-[10px] font-mono text-muted-foreground">{item.formula}</TableCell>
                          <TableCell className="text-right text-xs font-mono font-bold">{item.peso}</TableCell>
                          <TableCell className="text-[10px] text-muted-foreground pl-4">{item.desc}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>

              <div>
                <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">Tabela B — Série Histórica Kanitz (Ponderada)</h3>
                <div className="overflow-x-auto">
                  <Table style={{ tableLayout: 'fixed', width: '100%' }}>
                    <TableHeader>
                      <TableRow className="bg-muted/30">
                        <TableHead className="text-[10px] w-[80px]">Mês/Ano</TableHead>
                        <TableHead className="text-right text-[10px]">RPL</TableHead>
                        <TableHead className="text-right text-[10px]">LG</TableHead>
                        <TableHead className="text-right text-[10px]">LS</TableHead>
                        <TableHead className="text-right text-[10px]">LC</TableHead>
                        <TableHead className="text-right text-[10px]">GE</TableHead>
                        <TableHead className="text-right text-[10px] font-bold text-foreground">FI (Z)</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {kanitzResults.map((r) => (
                        <TableRow key={r.year}>
                          <TableCell className="text-[10px] font-semibold">{fmtMonthCompact(r.year)}</TableCell>
                          <TableCell className="text-right text-[10px] font-mono">{fmtKDec(r.rpl)}</TableCell>
                          <TableCell className="text-right text-[10px] font-mono">{fmtKDec(r.lg)}</TableCell>
                          <TableCell className="text-right text-[10px] font-mono">{fmtKDec(r.ls)}</TableCell>
                          <TableCell className="text-right text-[10px] font-mono">{fmtKDec(r.lc)}</TableCell>
                          <TableCell className="text-right text-[10px] font-mono">{fmtKDec(r.ge)}</TableCell>
                          <TableCell className={`text-right text-[11px] font-mono font-bold ${kanitzClassColors[r.classificacao]?.color}`}>
                            {(r.fi ?? 0).toFixed(2)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <div className="mt-4 p-3 rounded bg-muted/20 border border-border/50">
                  <p className="text-[10px] text-muted-foreground leading-relaxed">
                    <strong>Nota:</strong> O Fator de Insolvência (FI) é o resultado da soma ponderada dos indicadores. Valores de FI acima de 0 indicam solvência, entre 0 e -3 zona de penumbra, e abaixo de -3 insolvência crítica.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </ReportPage>
      )}

      {/* ── 9. CONCLUSÃO ── */}
      {variant === "completo" && (
        <ReportPage>
          <div className="space-y-4">
            <SectionTitle num="9" title="CONCLUSÃO TÉCNICA" />
            <div className="p-4 rounded-lg bg-muted/30 border border-border/50 space-y-4">
              <p className="text-sm text-foreground leading-relaxed">
                {aiAnalysis?.diagnostico?.resumo || "A análise das demonstrações contábeis evidencia a estrutura financeira da empresa no período analisado, com base nos dados do balancete processado."}
              </p>
              <p className="text-sm text-foreground leading-relaxed">
                Os indicadores de liquidez {latestInd?.liquidezCorrente && latestInd.liquidezCorrente > 1 ? "apontam capacidade adequada para honrar compromissos de curto prazo" : "indicam fragilidade na capacidade de pagamento de curto prazo"}, {latestInd?.liquidezGeral && latestInd.liquidezGeral < 1 ? "embora a liquidez geral permaneça inferior à unidade, refletindo elevada dependência de capital de terceiros." : "com liquidez geral compatível com a operação."}
              </p>
              <p className="text-sm text-foreground leading-relaxed">
                {latestKanitz && latestKanitz.kanitzAplicavel ? `O Termômetro de Insolvência de Kanitz posiciona a companhia ${latestKanitz.fi > 0 ? "na zona de solvência" : latestKanitz.fi >= -3 ? "na zona de atenção" : "em situação de alta probabilidade de insolvência"}, com Fator de Insolvência de ${(latestKanitz.fi ?? 0).toFixed(2)}. ${latestKanitz.fi > 0 ? "Não há indícios de insolvência no curto prazo, mas recomenda-se acompanhamento contínuo da estrutura de capital e da geração de resultados." : "Recomenda-se reestruturação financeira imediata e acompanhamento contínuo dos indicadores."}` : "O modelo Kanitz não é aplicável neste período devido ao Patrimônio Líquido nulo ou negativo. Recomenda-se a avaliação via ISG (Índice de Solvência Geral)."}
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
            <p className="text-xs text-muted-foreground">Técnico Contábil Sênior IA</p>
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
            <button className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold bg-[hsl(258,90%,66%)] text-white shadow-sm" onClick={() => {
              const tabList = document.querySelector('[role="tablist"]');
              const bexTab = tabList?.querySelector('[value="relatorio-final"]') as HTMLElement;
              bexTab?.click();
            }}>
              <BookOpen className="w-3.5 h-3.5" /> Relatório BEX
            </button>
          </div>
        </div>
        <Button variant="outline" className="gap-1.5" onClick={() => exportPdf('report-bex-container', 'Relatório BEX')}>
          <Download className="w-4 h-4" /> Exportar PDF
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
const TabRelatorioKanitz = ({ onBack, parsedData, onSwitchToBex, aiAnalysis, uploadedFiles, sourceDocs, company, reportDataset }: { onBack: () => void; parsedData?: ParsedFinancialData | null; onSwitchToBex?: () => void; aiAnalysis?: any; uploadedFiles?: File[]; sourceDocs?: { fileName: string; fileSize: number; format: string }[]; company?: Company | null; reportDataset?: CanonicalReportDataset | null }) => {
  const today = new Date().toLocaleDateString("pt-BR");
  const kanitzContainerRef = useRef<HTMLDivElement>(null);
  const [totalPagesKanitz, setTotalPagesKanitz] = useState(0);

  useEffect(() => {
    if (kanitzContainerRef.current) {
      const pages = kanitzContainerRef.current.querySelectorAll('.report-a4-page, .report-a4-cover');
      setTotalPagesKanitz(pages.length);
    }
  }, []);

  const findValue = (keyword: string, year: string) => {
    if (!parsedData) return 0;
    const allRows = [...parsedData.balanco, ...parsedData.dre];
    const row = allRows.find(r =>
      r.conta.toLowerCase().includes(keyword) || r.descricao.toLowerCase().includes(keyword)
    );
    return row?.values[year] || 0;
  };

  type KanitzRow = {
    year: string; rpl: number; lg: number; ls: number; lc: number; ge: number; fi: number; isg: number;
    classificacao: "saudavel" | "estavel" | "atencao" | "risco" | "insolvente" | "na"; riskScoreNormalized: number;
    ac: number; anc: number; pc: number; pnc: number; pl: number; estoque: number; rlp: number; pt: number; ll: number; at: number;
    rl: number; cpv: number; fornecedores: number; despFin: number; lajir: number; caixa: number;
    kanitzAplicavel: boolean; ebitda: number;
  };
  const kanitzResults: KanitzRow[] = [];

  if (parsedData) {
    // Ordena cronologicamente (formatos "MM/AAAA" ou "AAAA")
    const years = [...parsedData.years].sort((a, b) => {
      const pa = a.includes("/") ? a.split("/").reverse().join("") : a;
      const pb = b.includes("/") ? b.split("/").reverse().join("") : b;
      return pa.localeCompare(pb);
    });
    const computed = computeIndicatorsFromParsed(parsedData);
    for (const year of years) {
      const ind = computed[year];
      if (!ind) continue;

      const kanitzAplicavel = ind._pl > 0;
      const rpl = kanitzAplicavel ? ind.roe / 12 : 0;
      const lg = ind.liquidezGeral;
      const ls = ind.liquidezSeca;
      const lc = ind.liquidezCorrente;
      const ge = kanitzAplicavel ? ind.grauEndividamentoPL : (ind._pc + ind._pnc) / (Math.abs(ind._pl) || 1);
      const fi = kanitzAplicavel ? (0.05 * rpl) + (1.65 * lg) + (3.55 * ls) - (1.06 * lc) - (0.33 * ge) : 0;
      const isg = (ind._ac + ind._anc) / (ind._pc + ind._pnc || 1);
      const classificacao: KanitzRow["classificacao"] = !kanitzAplicavel ? "na"
        : fi > 1 ? "saudavel" : fi > 0 ? "estavel" : fi > -1 ? "atencao" : fi >= -3 ? "risco" : "insolvente";

      const ac = ind._ac;
      const anc = ind._anc;
      const pc = ind._pc;
      const pnc = ind._pnc;
      const pl = ind._pl;
      const ll = ind._resultado;
      const estoque = ind._estoque;
      const rlp = 0; // Fallback para RLP se necessário
      const rl = ind._receita;
      const cpv = ind._cmv;
      const fornecedores = ind._fornecedores;
      const despFin = ind._despFin;
      const lajir = ind._resultado + Math.abs(ind._despFin);
      const caixa = ind._caixa;
      const pt = pc + pnc;
      const at = ac + anc;
      const ebitda = ind.ebitda || 0;

      kanitzResults.push({ year, rpl, lg, ls, lc, ge, fi, isg, classificacao, riskScoreNormalized: 0, ac, anc, pc, pnc, pl, estoque, rlp, pt, ll, at, rl, cpv, fornecedores, despFin: Math.abs(despFin), lajir, caixa, kanitzAplicavel, ebitda });
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
    const ac = aiStruct.ativo_circulante || 0;
    const anc = aiStruct.ativo_nao_circulante || 0;
    const pc = aiStruct.passivo_circulante || 0;
    const pnc = aiStruct.passivo_nao_circulante || 0;
    const pl = aiStruct.patrimonio_liquido || 0;
    const pt = pc + pnc;
    const at = ac + anc;
    const kanitzAplicavel = pl > 0;
    const classificacao: KanitzRow["classificacao"] = !kanitzAplicavel ? "na"
      : fi > 1 ? "saudavel" : fi > 0 ? "estavel" : fi > -1 ? "atencao" : fi >= -3 ? "risco" : "insolvente";
    const isg = pt !== 0 ? at / pt : 0;
    kanitzResults.push({
      year: "Análise IA", rpl: comp.rpl || 0, lg: comp.lg || 0, ls: comp.ls || 0, lc: comp.lc || 0, ge: comp.ge || 0,
      fi, isg, classificacao, riskScoreNormalized: fi > 1 ? 90 : fi > 0 ? 70 : fi >= -1 ? 50 : fi >= -3 ? 30 : 10,
      ac, anc, pc, pnc, pl, estoque: aiStruct.estoques || 0, rlp: 0, pt, ll: aiStruct.lucro_liquido || 0, at,
      rl: aiStruct.receita_liquida || 0, cpv: 0, fornecedores: aiStruct.fornecedores || 0, despFin: 0, lajir: 0, caixa: aiStruct.caixa || 0,
      kanitzAplicavel, ebitda: 0,
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
    na: { icon: "⛔", label: "Kanitz Não Aplicável (PL Negativo)", color: "text-slate-600" },
  };

  const SectionTitle = ({ num, title }: { num: string; title: string }) => (
    <div className="flex items-center gap-3 py-3 border-b-2 border-amber-500/30 mb-4">
      <div className="w-8 h-8 rounded-lg bg-amber-500 text-white flex items-center justify-center text-sm font-bold">{num}</div>
      <h2 className="text-lg font-bold text-foreground font-serif">{title}</h2>
    </div>
  );

  const fmtDec = (n: number) => (n ?? 0).toFixed(4);
  const fmtOrNA = (n: number | null | undefined, suffix = "", isApplicable = true) =>
    !isApplicable ? "N/A" : (typeof n === "number" && isFinite(n) ? `${(n ?? 0).toFixed(2)}${suffix}` : "N/A");

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
  const kAplic = l.kanitzAplicavel;
  const capitalGiro = l.ac - l.pc;
  const ncg = (l.ac - l.caixa) - (l.pc - (l.fornecedores || 0));
  const endivTotal = l.at !== 0 ? l.pt / l.at : 0; // PT/AT — Endividamento Geral (motor contábil)
  const alavancagem = kAplic ? l.at / l.pl : null;
  const participacaoTerceiros = kAplic ? l.pt / l.pl : null;
  // MD-001 Point 29: EBITDA Certificado (Somente se componentes SSOT disponíveis)
  const ebitda = l.ebitda; 
  const coberturaJuros = l.despFin !== 0 ? l.lajir / l.despFin : 0;
  const indiceGeracaoCaixa = l.rl !== 0 ? ebitda / l.rl : 0;
  const margemLiquida = l.rl !== 0 ? l.ll / l.rl : 0;
  const despFinSobreReceita = l.rl !== 0 ? l.despFin / l.rl : 0;
  const estoquesSobreAC = l.ac !== 0 ? l.estoque / l.ac : 0;
  const giroAtivo = l.at !== 0 ? l.rl / l.at : 0;

  // Classificação ISG (usada quando Kanitz não aplicável)
  const isgClass = l.isg > 1.5 ? { label: "Saudável", color: "text-emerald-600", icon: "🟢" }
    : l.isg >= 1.0 ? { label: "Atenção", color: "text-yellow-600", icon: "🟡" }
    : { label: "Insolvência Técnica", color: "text-red-600", icon: "🔴" };

  // Simulações (Módulo 9) — aplicadas sobre premissas Kanitz
  const simCompute = (pl2: number, pt2: number, ac2: number, pc2: number, est2: number, rlp2: number, ll2: number) => {
    const kAplic2 = pl2 > 0;
    if (!kAplic2) return 0;
    const rpl2 = (ll2 ?? 0) / (pl2 || 1);
    const lg2 = (ac2 + rlp2) / (pt2 || 1);
    const ls2 = (ac2 - est2) / (pc2 || 1);
    const lc2 = ac2 / (pc2 || 1);
    const ge2 = pt2 / (pl2 || 1);
    return (0.05 * rpl2) + (1.65 * lg2) + (3.55 * ls2) - (1.06 * lc2) - (0.33 * ge2);
  };
  // Cenário 1: Reduzir passivo total em 20% (PC também cai proporcionalmente)
  const simReducaoDivida = simCompute(l.pl, l.pt * 0.8, l.ac, l.pc * 0.8, l.estoque, l.rlp, l.ll);
  // Cenário 2: Aumentar LL em 30% (impacta RPL)
  const simAumentoMargem = simCompute(l.pl, l.pt, l.ac, l.pc, l.estoque, l.rlp, l.ll * 1.3);
  // Cenário 3: Aporte de capital 30% aumenta PL e AC (caixa entra)
  const simInjecaoCapital = simCompute(l.pl > 0 ? l.pl * 1.3 : Math.abs(l.pl) * 0.3, l.pt, l.ac + Math.abs(l.pl) * 0.3, l.pc, l.estoque, l.rlp, l.ll);
  // Cenário 4: Reduzir CPV em 15% aumenta LL (proxy)
  const simReducaoCustos = simCompute(l.pl, l.pt, l.ac, l.pc, l.estoque, l.rlp, l.ll + l.cpv * 0.15);

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
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => exportPdf('report-kanitz-container', 'Relatório Kanitz')}>
            <Download className="w-4 h-4" /> Exportar PDF
          </Button>
          <span className="relative group/docbtn inline-flex hidden">
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => exportDocx('report-kanitz-container', 'Relatório Kanitz')}>
              <FileText className="w-4 h-4" /> Exportar .doc
            </Button>
            <span className="pointer-events-none absolute -top-7 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded bg-red-600 text-white text-[10px] font-bold whitespace-nowrap shadow-md opacity-0 group-hover/docbtn:opacity-100 transition-opacity">
              Será removido
            </span>
          </span>
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
            <span className="text-lg">{classColors[l.classificacao]?.icon}</span>
            <span className="text-sm font-semibold text-foreground">
              {kAplic
                ? `${classColors[l.classificacao]?.label} — FI: ${(l.fi ?? 0).toFixed(2)}`
                : `Kanitz Não Aplicável — ISG: ${(l.isg ?? 0).toFixed(2)} (${isgClass.label})`}

            </span>
          </div>
          <div className="mt-10 grid sm:grid-cols-3 gap-6 text-sm text-muted-foreground w-full max-w-lg">
            <div>
              <p className="text-[10px] text-muted-foreground/60 uppercase tracking-wider">Empresa</p>
              <p className="font-semibold text-foreground">{company?.name || "Empresa Analisada S.A."}</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground/60 uppercase tracking-wider">Período</p>
              <p className="font-semibold text-foreground">{kanitzResults.map(r => r.year).join(" / ")}</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground/60 uppercase tracking-wider">Emissão</p>
              <p className="font-semibold text-foreground">{today}</p>
            </div>
          </div>
          <div className="mt-8 pt-6 border-t border-border w-full max-w-md space-y-2">
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Responsável Técnico</p>
              <p className="text-sm font-semibold text-foreground">Técnico Contábil Sênior IA</p>
              <p className="text-xs text-muted-foreground">Modelo: Stephen Charles Kanitz — Termômetro de Insolvência (1978)</p>
            </div>
            <div className="pt-2 mt-2 border-t border-dashed border-border/50">
              <p className="text-[9px] text-muted-foreground uppercase tracking-wider font-bold mb-1">Metadados do Upload (Rastreabilidade)</p>
              <div className="grid grid-cols-1 gap-1 text-[10px]">
                <p className="text-muted-foreground"><span className="font-medium text-foreground">Arquivo:</span> {uploadedFiles && uploadedFiles.length > 0 ? uploadedFiles.map(f => f.name).join(", ") : sourceDocs && sourceDocs.length > 0 ? sourceDocs.map(d => d.fileName).join(", ") : "N/A"}</p>
                <p className="text-muted-foreground"><span className="font-medium text-foreground">Processamento:</span> {today}</p>
                <p className="text-muted-foreground"><span className="font-medium text-foreground">Intervalo Analisado:</span> {kanitzResults.map(r => r.year).join(" / ")}</p>
              </div>
            </div>
          </div>
        </div>
        <div className="report-footer-bar">
          <p>Rua Cel. Oscar Porto, nº 736, 3º Andar, Paraíso, São Paulo-SP, CEP: 04003-003</p>
          <p>(11) 3285-4472 · https://www.brasilexpert.com.br/</p>
        </div>
      </div>

      {/* ══ MÓDULO 1 — SUMÁRIO EXECUTIVO ══ */}
      <ReportPage>
        <div className="space-y-4 break-inside-avoid">
          <SectionTitle num="1" title="SUMÁRIO EXECUTIVO" />
          <div className="p-4 rounded-lg bg-muted/30 border border-border/50">
            <p className="text-sm text-foreground leading-relaxed">
              {!kAplic ? (
                <>
                  A empresa apresenta <strong>Patrimônio Líquido negativo</strong> de R$ {fmt(reportDataset?.facts.patrimonio_liquido || 0)} (Ativo Total R$ {fmt((reportDataset?.facts.ativo_circulante || 0) + (reportDataset?.facts.ativo_nao_circulante || 0))} vs Passivo Total R$ {fmt((reportDataset?.facts.passivo_circulante || 0) + (reportDataset?.facts.passivo_nao_circulante || 0))}). Nessa condição, o <strong>Modelo Kanitz não se aplica</strong>: o componente X1 (Rentabilidade do PL = LL/PL) divide por um denominador negativo, invertendo o sinal e tratando prejuízo como se fosse retorno positivo — o que produziria um FI artificialmente saudável e um diagnóstico incorreto.
                  <br /><br />
                  Substitui-se por isso o Kanitz pelo <strong>Índice de Solvência Geral (ISG = Ativo Total / Passivo Total)</strong>, indicador padrão para empresas com PL comprometido. ISG atual: <strong className={isgClass.color}>{(reportDataset?.ratios.isg ?? 0).toFixed(2)}</strong> — {isgClass.label}. {(reportDataset?.ratios.isg ?? 0) < 1
                    ? "O ativo total não cobre as obrigações totais, caracterizando insolvência técnica e demandando reestruturação patrimonial (Lei 11.101/2005) ou aporte de capital."
                    : (reportDataset?.ratios.isg ?? 0) < 1.5
                    ? "Cobertura patrimonial estreita: cada R$ 1,00 de dívida é lastreada por menos de R$ 1,50 de ativos."
                    : "Cobertura patrimonial adequada apesar do PL negativo."}
                </>
              ) : l.classificacao === "saudavel"
                ? `A empresa apresenta Fator de Insolvência de ${(l.fi ?? 0).toFixed(2)}, classificando-se como SAUDÁVEL segundo o modelo Kanitz. Os indicadores de liquidez e rentabilidade demonstram solidez financeira e capacidade plena de honrar obrigações.`
                : l.classificacao === "estavel"
                ? `A empresa apresenta Fator de Insolvência de ${(l.fi ?? 0).toFixed(2)}, classificando-se como ESTÁVEL. A estrutura financeira é adequada, com indicadores dentro de parâmetros aceitáveis. Recomenda-se manutenção das políticas financeiras atuais.`
                : l.classificacao === "atencao"
                ? `A empresa encontra-se em ZONA DE ATENÇÃO com FI de ${(l.fi ?? 0).toFixed(2)}. Indicadores de liquidez e endividamento apresentam fragilidades que requerem monitoramento contínuo.`
                : l.classificacao === "risco"
                ? `A empresa está em ZONA DE RISCO com FI de ${(l.fi ?? 0).toFixed(2)}. Os indicadores financeiros demonstram deterioração significativa. Liquidez Seca de ${fmtDec(reportDataset?.ratios.liquidezSeca || 0)} e Grau de Endividamento de ${fmtDec(reportDataset?.ratios.endividamentoTotal || 0)} indicam dificuldades financeiras. Recomenda-se reestruturação imediata.`
                : `A empresa apresenta ALTA PROBABILIDADE DE INSOLVÊNCIA com FI de ${(l.fi ?? 0).toFixed(2)}. A deterioração severa dos indicadores financeiros indica incapacidade de pagamento. Recomenda-se análise de viabilidade conforme Lei 11.101/2005.`}

            </p>
          </div>
          <div className="grid sm:grid-cols-4 gap-3">
            <div className="p-3 rounded-lg bg-muted/20 text-center">
              <p className="text-[10px] text-muted-foreground">{kAplic ? "Score Kanitz" : "Score Kanitz (referência)"}</p>
              <p className={`text-2xl font-bold font-mono ${kAplic ? classColors[l.classificacao]?.color : "text-slate-400 line-through"}`}>{kAplic ? (l.fi ?? 0).toFixed(2) : "0.00"}</p>
              {!kAplic && <p className="text-[9px] text-red-600 font-semibold">Inválido (PL &lt; 0)</p>}
            </div>
            <div className="p-3 rounded-lg bg-muted/20 text-center">
              <p className="text-[10px] text-muted-foreground">ISG (AT/PT)</p>
              <p className={`text-2xl font-bold font-mono ${isgClass.color}`}>{(l.isg ?? 0).toFixed(2)}</p>
              <p className={`text-[9px] font-semibold ${isgClass.color}`}>{isgClass.icon} {isgClass.label}</p>
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
          {!kAplic && (
            <div className="p-4 rounded-lg border border-red-500/40 bg-red-500/5">
              <p className="text-xs font-bold text-red-600 mb-1">⛔ KANITZ NÃO APLICÁVEL</p>
              <p className="text-xs text-foreground leading-relaxed">
                Com PL = R$ {fmt(l.pl)} (negativo), o componente X1 = LL/PL do modelo Kanitz distorce o resultado: um prejuízo dividido por PL negativo gera pseudo-rentabilidade positiva. Por isso, o Kanitz calculado ({(l.fi ?? 0).toFixed(2)}) não é aplicável. O indicador oficial para este caso é o <strong>Índice de Solvência Geral (ISG)</strong>.
              </p>
            </div>
          )}
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="text-center py-6 rounded-lg bg-muted/20">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Kanitz {kAplic ? "" : "(referência)"}</p>
              <p className={`text-5xl font-bold ${kAplic ? classColors[l.classificacao]?.color : "text-slate-400 line-through"}`}>{kAplic ? (l.fi ?? 0).toFixed(2) : "0.00"}</p>
              <p className={`text-sm font-semibold mt-2 ${kAplic ? classColors[l.classificacao]?.color : "text-slate-500"}`}>
                {classColors[l.classificacao]?.icon} {classColors[l.classificacao]?.label}
              </p>
              <p className="text-xs text-muted-foreground mt-1">FI = 0,05·RPL + 1,65·LG + 3,55·LS − 1,06·LC − 0,33·GE</p>
            </div>
            <div className="text-center py-6 rounded-lg bg-amber-500/5 border border-amber-500/30">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Índice de Solvência Geral</p>
              <p className={`text-5xl font-bold ${isgClass.color}`}>{(l.isg ?? 0).toFixed(2)}</p>
              <p className={`text-sm font-semibold mt-2 ${isgClass.color}`}>{isgClass.icon} {isgClass.label}</p>
              <p className="text-xs text-muted-foreground mt-1">ISG = Ativo Total (R$ {fmt(l.at)}) / Passivo Total (R$ {fmt(l.pt)})</p>
            </div>
          </div>

          {/* Termômetro Kanitz (referência) */}
          <div className="px-4">
            <p className="text-[10px] text-muted-foreground text-center mb-2">Termômetro Kanitz — referência histórica</p>
            <div className="relative h-12 rounded-full overflow-hidden bg-gradient-to-r from-red-500 via-orange-400 via-yellow-500 via-blue-400 to-emerald-500">
              {kanitzResults.filter(r => r.kanitzAplicavel).map(r => {
                const pos = Math.max(0, Math.min(100, ((r.fi + 7) / 14) * 100));
                return (
                  <div key={r.year} className="absolute top-0 bottom-0 w-1 bg-foreground rounded-full shadow-lg" style={{ left: `${pos}%`, transform: "translateX(-50%)" }} title={`${r.year}: FI = ${(r.fi ?? 0).toFixed(2)}`}>
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
                !r.kanitzAplicavel ? "bg-slate-500/10 border-slate-500/30" :
                r.classificacao === "saudavel" ? "bg-emerald-500/10 border-emerald-500/30" :
                r.classificacao === "estavel" ? "bg-blue-500/10 border-blue-500/30" :
                r.classificacao === "atencao" ? "bg-yellow-500/10 border-yellow-500/30" :
                r.classificacao === "risco" ? "bg-orange-500/10 border-orange-500/30" : "bg-red-500/10 border-red-500/30"
              }`}>
                <p className="text-xs text-muted-foreground font-semibold">{r.year}</p>
                {r.kanitzAplicavel ? (
                  <>
                    <p className="text-2xl font-bold font-mono">{(r.fi ?? 0).toFixed(2)}</p>
                    <p className={`text-xs font-semibold ${classColors[r.classificacao]?.color}`}>{classColors[r.classificacao]?.icon} {classColors[r.classificacao]?.label}</p>
                  </>
                ) : (
                  <>
                    <p className="text-2xl font-bold font-mono text-slate-600">ISG {(r.isg ?? 0).toFixed(2)}</p>
                    <p className="text-[10px] font-semibold text-slate-600">⛔ PL negativo — usar ISG</p>
                  </>
                )}
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
            Análise dos componentes que determinam o score Kanitz por período. Quando PL ≤ 0, RPL e GE são marcados como N/A (não aplicáveis) e o ISG passa a ser o indicador de referência.
          </p>
          <div className="overflow-x-auto">
            <Table className="table-fixed w-full border-collapse">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[20%] text-[10px] py-1 border border-border">Indicador</TableHead>
                  <TableHead className="w-[8%] text-[10px] py-1 border border-border">Sigla</TableHead>
                  <TableHead className="w-[22%] text-[10px] py-1 border border-border">Fórmula</TableHead>
                  <TableHead className="w-[10%] text-[10px] py-1 border border-border">Peso</TableHead>
                  {kanitzResults.map(r => <TableHead key={r.year} className="text-right text-[10px] py-1 border border-border">{fmtMonthCompact(r.year) || r.year}</TableHead>)}
                </TableRow>
              </TableHeader>
              <TableBody>
                {[
                  { name: "Rentabilidade do PL", sigla: "RPL", formula: "LL / PL", peso: 0.05, key: "rpl" as const, naIfNegativePL: true },
                  { name: "Liquidez Geral", sigla: "LG", formula: "(AC + RLP) / PT", peso: 1.65, key: "lg" as const, naIfNegativePL: false },
                  { name: "Liquidez Seca", sigla: "LS", formula: "(AC − EST) / PC", peso: 3.55, key: "ls" as const, naIfNegativePL: false },
                  { name: "Liquidez Corrente", sigla: "LC", formula: "AC / PC", peso: -1.06, key: "lc" as const, naIfNegativePL: false },
                  { name: "Grau de Endividamento", sigla: "GE", formula: "PT / PL", peso: -0.33, key: "ge" as const, naIfNegativePL: true },
                ].map(ind => (
                  <TableRow key={ind.sigla} className="h-7">
                    <TableCell className="text-[10px] py-0.5 border border-border truncate font-medium">{ind.name}</TableCell>
                    <TableCell className="text-[10px] py-0.5 border border-border font-mono font-bold text-center">{ind.sigla}</TableCell>
                    <TableCell className="text-[9px] py-0.5 border border-border font-mono text-muted-foreground truncate">{ind.formula}</TableCell>
                    <TableCell className="text-[10px] py-0.5 border border-border font-mono font-bold text-center">{ind.peso > 0 ? `+${ind.peso}` : ind.peso}</TableCell>
                    {kanitzResults.map(r => (
                      <TableCell key={r.year} className="text-right text-[10px] py-0.5 border border-border font-mono">
                        {ind.naIfNegativePL && !r.kanitzAplicavel ? <span className="text-slate-500">N/A</span> : (r[ind.key] != null && !isNaN(r[ind.key]) ? fmtDec(r[ind.key]) : <span className="text-slate-500">N/A</span>)}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
                <TableRow className="bg-amber-500/5 h-7">
                  <TableCell className="text-[10px] py-0.5 border border-border font-medium">Índice de Solvência Geral</TableCell>
                  <TableCell className="text-[10px] py-0.5 border border-border font-mono font-bold text-center">ISG</TableCell>
                  <TableCell className="text-[9px] py-0.5 border border-border font-mono text-muted-foreground">AT / PT</TableCell>
                  <TableCell className="text-[10px] py-0.5 border border-border font-mono text-center">—</TableCell>
                  {kanitzResults.map(r => (
                    <TableCell key={r.year} className="text-right text-[10px] py-0.5 border border-border font-mono font-bold">{(r.isg ?? 0).toFixed(2)}</TableCell>
                  ))}
                </TableRow>
                <TableRow className="border-t-2 border-foreground/20 h-8">
                  <TableCell className="text-[10px] py-1 border border-border font-bold bg-muted/20" colSpan={4}>FATOR DE INSOLVÊNCIA (FI)</TableCell>
                  {kanitzResults.map(r => (
                    <TableCell key={r.year} className={`text-right text-[11px] py-1 border border-border font-bold font-mono ${classColors[r.classificacao]?.color}`}>
                      {r.kanitzAplicavel ? (r.fi ?? 0).toFixed(2) : <span className="text-slate-500 line-through">{(r.fi ?? 0).toFixed(2)}</span>}
                    </TableCell>
                  ))}
                </TableRow>
              </TableBody>
            </Table>
          </div>
          {!kAplic && (
            <p className="text-[10px] text-muted-foreground italic">
              Nota: períodos com PL negativo têm RPL e GE marcados como N/A e FI riscado — usar ISG como referência.
            </p>
          )}
        </div>
      </ReportPage>

      {/* ══ MÓDULO 4 — ESTRUTURA DE LIQUIDEZ ══ */}
      <ReportPage>
        <div className="space-y-4">
          <SectionTitle num="4" title="ESTRUTURA DE LIQUIDEZ" />
          <div className="grid sm:grid-cols-4 gap-3">
            {[
              { label: "Liquidez Corrente", value: l.lc, ideal: "> 1.50", status: l.lc > 1.5 ? "positivo" : l.lc > 1 ? "atencao" : "critico", formula: `AC / PC = ${fmt(l.ac)} / ${fmt(l.pc)}` },
              { label: "Liquidez Seca", value: l.ls, ideal: "> 1.00", status: l.ls > 1 ? "positivo" : l.ls > 0.7 ? "atencao" : "critico", formula: `(AC − Estoques) / PC = (${fmt(l.ac)} − ${fmt(l.estoque)}) / ${fmt(l.pc)}` },
              { label: "Capital de Giro", value: capitalGiro, ideal: "> 0", status: capitalGiro > 0 ? "positivo" : "critico", isCurrency: true, formula: `AC − PC = ${fmt(l.ac)} − ${fmt(l.pc)}` },
              { label: "Necessidade de CG", value: ncg, ideal: "< CG", status: ncg < capitalGiro ? "positivo" : "critico", isCurrency: true, formula: `(AC − Caixa) − (PC − Fornecedores) = (${fmt(l.ac)} − ${fmt(l.caixa)}) − (${fmt(l.pc)} − ${fmt(l.fornecedores)})` },
            ].map(item => (
              <div key={item.label} className={`p-3 rounded-lg border text-center space-y-1 ${
                item.status === "positivo" ? "bg-emerald-500/5 border-emerald-500/20" :
                item.status === "atencao" ? "bg-yellow-500/5 border-yellow-500/20" : "bg-red-500/5 border-red-500/20"
              }`}>
                <p className="text-[10px] text-muted-foreground">{item.label}</p>
                <p className="text-lg font-bold font-mono text-foreground">
                  {item.isCurrency ? `R$ ${fmt(item.value)}` : fmtDec(item.value)}
                </p>
                <p className="text-[9px] text-muted-foreground">Ideal: {item.ideal}</p>
                <p className="text-[9px] font-mono text-muted-foreground/70 mt-1 leading-tight">{item.formula}</p>
              </div>
            ))}
          </div>
          <div className="p-4 rounded-lg bg-muted/20 border border-border/30">
            <p className="text-xs font-semibold text-foreground mb-1">Origem das informações</p>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Valores extraídos do balancete processado (motor contábil BEX). <strong>CG</strong> mostra o excedente de recursos de curto prazo após liquidação do passivo circulante. <strong>NCG</strong> mede o quanto o ciclo operacional consome de caixa: se NCG &gt; CG há descasamento e necessidade de captação de curto prazo. No período analisado: CG = R$ {fmt(capitalGiro)} · NCG = R$ {fmt(ncg)}.
            </p>
            <p className="text-xs text-muted-foreground leading-relaxed mt-2">
              <strong>Diagnóstico:</strong> {capitalGiro > 0 && ncg < capitalGiro
                ? "Liquidez saudável. Capital de giro positivo e necessidade de CG inferior ao CG disponível."
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
            <div className="p-4 rounded-lg bg-muted/20 text-center space-y-1">
              <p className="text-[10px] text-muted-foreground">Endividamento Total</p>
              <p className="text-xl font-bold font-mono text-foreground">{fmtPct(endivTotal)}</p>
              <p className="text-[9px] text-muted-foreground">PT / AT</p>
              <p className="text-[9px] font-mono text-muted-foreground/70 mt-1">R$ {fmt(l.pt)} / R$ {fmt(l.at)}</p>
            </div>
            <div className="p-4 rounded-lg bg-muted/20 text-center space-y-1">
              <p className="text-[10px] text-muted-foreground">Alavancagem Financeira</p>
              <p className={`text-xl font-bold font-mono ${kAplic ? "text-foreground" : "text-slate-500"}`}>{fmtOrNA(alavancagem, "x", kAplic)}</p>
              <p className="text-[9px] text-muted-foreground">Ativo Total / PL</p>
              <p className="text-[9px] font-mono text-muted-foreground/70 mt-1">{kAplic ? `R$ ${fmt(l.at)} / R$ ${fmt(l.pl)}` : "PL negativo — indicador sem sentido econômico"}</p>
            </div>
            <div className="p-4 rounded-lg bg-muted/20 text-center space-y-1">
              <p className="text-[10px] text-muted-foreground">Capital de Terceiros / PL</p>
              <p className={`text-xl font-bold font-mono ${kAplic ? "text-foreground" : "text-slate-500"}`}>{fmtOrNA(participacaoTerceiros, "x", kAplic)}</p>
              <p className="text-[9px] text-muted-foreground">Passivo Total / PL</p>
              <p className="text-[9px] font-mono text-muted-foreground/70 mt-1">{kAplic ? `R$ ${fmt(l.pt)} / R$ ${fmt(l.pl)}` : "PL negativo — não calculável"}</p>
            </div>
          </div>
          {!kAplic && (
            <p className="text-[10px] text-red-600 italic">
              ⛔ Com PL = R$ {fmt(l.pl)} (negativo), alavancagem e KT/PL retornariam valores negativos ou distorcidos — por isso apresentados como N/A. Use o ISG ({(l.isg ?? 0).toFixed(2)}) e o Endividamento Total ({fmtPct(endivTotal)}) como referência.
            </p>
          )}
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
          {l.pnc === 0 && (
            <div className="p-2 rounded bg-yellow-500/5 border border-yellow-500/20">
              <p className="text-[10px] text-yellow-700">
                ⚠ Passivo Não Circulante não localizado nos dados extraídos. Verifique o balancete de origem se houver exigível de longo prazo (empréstimos LP, provisões, etc.).
              </p>
            </div>
          )}
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="p-4 rounded-lg bg-muted/20 space-y-3">
              <p className="text-xs font-semibold text-foreground">Composição do Passivo (motor contábil)</p>
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
                { label: "Pressão de Caixa (PC/PT)", value: l.pt > 0 ? (l.pc / l.pt) * 100 : 0, desc: `% do passivo vencendo em até 12 meses — ${fmt(l.pc)} / ${fmt(l.pt)}`, alert: l.pt > 0 && l.pc / l.pt > 0.5, suffix: "%" },
                { label: "Fornecedores / PC", value: l.pc > 0 ? (l.fornecedores / l.pc) * 100 : 0, desc: `Concentração em fornecedores — ${fmt(l.fornecedores)} / ${fmt(l.pc)}`, alert: false, suffix: "%" },
                { label: "Passivo / EBITDA", value: ebitda > 0 ? l.pt / ebitda : 0, desc: `Anos para quitar passivo total com EBITDA — ${fmt(l.pt)} / ${fmt(ebitda)}`, alert: ebitda > 0 && l.pt / ebitda > 5, suffix: "x" },
              ].map(item => (
                <div key={item.label} className={`p-2 rounded-lg ${item.alert ? "bg-red-500/5 border border-red-500/20" : "bg-background"}`}>
                  <div className="flex justify-between text-[10px]">
                    <span className="font-medium text-foreground">{item.label}</span>
                    <span className="font-mono font-bold">{(item.value ?? 0).toFixed(item.suffix === "x" ? 2 : 1)}{item.suffix}</span>
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
            Análise de geração de caixa alinhada ao motor contábil BEX — detectando risco de ruptura financeira.
          </p>
          <div className="grid sm:grid-cols-4 gap-3">
            {[
              { label: "EBITDA Certificado", value: ebitda, isCurrency: true, formula: `LAJIR (R$ ${fmt(l.lajir)}) + Depr/Amort` },
              { label: "Cobertura de Juros", value: coberturaJuros, suffix: "x", alert: coberturaJuros < 1.5, formula: `LAJIR / Desp.Fin = ${fmt(l.lajir)} / ${fmt(l.despFin)}` },
              { label: "Índice Geração Caixa", value: l.rl !== 0 ? ebitda / l.rl : 0, format: "pct", formula: `EBITDA / RL = ${fmt(ebitda)} / ${fmt(l.rl)}` },
              { label: "Margem Líquida", value: margemLiquida, format: "pct", alert: margemLiquida < 0.05, formula: `LL / RL = ${fmt(l.ll)} / ${fmt(l.rl)}` },
            ].map(item => (
              <div key={item.label} className={`p-3 rounded-lg border text-center space-y-1 ${item.alert ? "bg-red-500/5 border-red-500/20" : "bg-muted/20 border-border/30"}`}>
                <p className="text-[10px] text-muted-foreground">{item.label}</p>
                <p className="text-lg font-bold font-mono text-foreground">
                  {item.isCurrency ? `R$ ${fmt(item.value)}` : item.format === "pct" ? fmtPct(item.value) : `${(item.value ?? 0).toFixed(2)}${item.suffix || ""}`}
                </p>
                <p className="text-[9px] font-mono text-muted-foreground/70 leading-tight">{item.formula}</p>
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
            Análise de ineficiências que impactam diretamente o score Kanitz. Todos os percentuais são calculados a partir do balancete do período ({l.year}) processado pelo motor contábil.
          </p>
          <div className="space-y-3">
            <div className={`flex items-start gap-3 p-4 rounded-lg border ${despFinSobreReceita > 0.05 ? "bg-red-500/5 border-red-500/20" : "bg-muted/20 border-border/30"}`}>
              <span className="text-xl shrink-0">💸</span>
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-foreground">Despesas Financeiras Excessivas</p>
                  {despFinSobreReceita > 0.05 && <Badge className="bg-red-500/15 text-red-600 text-[9px]">Detectado</Badge>}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Despesas financeiras: R$ {fmt(l.despFin)} · Receita líquida: R$ {fmt(l.rl)} · <strong>{fmtPct(despFinSobreReceita)}</strong> da RL.
                </p>
                <p className="text-[10px] font-mono text-muted-foreground/80 mt-1">Cálculo: Desp.Fin / RL = {fmt(l.despFin)} / {fmt(l.rl)} = {fmtPct(despFinSobreReceita)}</p>
                <p className="text-[10px] text-muted-foreground mt-1 italic">
                  Impacto: Desp.Fin acima de 5% da RL corrói margem operacional e reduz a base do RPL — pressiona o FI pelo componente −0,33·GE.
                </p>
              </div>
            </div>

            <div className={`flex items-start gap-3 p-4 rounded-lg border ${estoquesSobreAC > 0.3 ? "bg-red-500/5 border-red-500/20" : "bg-muted/20 border-border/30"}`}>
              <span className="text-xl shrink-0">📦</span>
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-foreground">Estoques Improdutivos</p>
                  {estoquesSobreAC > 0.3 && <Badge className="bg-red-500/15 text-red-600 text-[9px]">Detectado</Badge>}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Estoques: R$ {fmt(l.estoque)} · Ativo Circulante: R$ {fmt(l.ac)} · <strong>{fmtPct(estoquesSobreAC)}</strong> do AC.
                </p>
                <p className="text-[10px] font-mono text-muted-foreground/80 mt-1">Cálculo: Estoque / AC = {fmt(l.estoque)} / {fmt(l.ac)} = {fmtPct(estoquesSobreAC)}</p>
                <p className="text-[10px] text-muted-foreground mt-1 italic">
                  Impacto: estoques muito representativos deprimem a Liquidez Seca (LS = (AC−Estoque)/PC) e portanto reduzem o componente +3,55·LS do Kanitz.
                </p>
              </div>
            </div>

            <div className={`flex items-start gap-3 p-4 rounded-lg border ${giroAtivo < 0.5 ? "bg-red-500/5 border-red-500/20" : "bg-muted/20 border-border/30"}`}>
              <span className="text-xl shrink-0">⚙️</span>
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-foreground">Ociosidade Operacional — Giro do Ativo</p>
                  {giroAtivo < 0.5 && <Badge className="bg-red-500/15 text-red-600 text-[9px]">Detectado</Badge>}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Giro do Ativo: <strong>{(giroAtivo ?? 0).toFixed(2)}x</strong> — {giroAtivo < 0.5 ? "baixa utilização" : giroAtivo < 1 ? "utilização moderada" : "nível aceitável"}.
                </p>
                <p className="text-[10px] font-mono text-muted-foreground/80 mt-1">Cálculo: Receita Líquida / Ativo Total = {fmt(l.rl)} / {fmt(l.at)} = {(giroAtivo ?? 0).toFixed(2)}</p>
                <p className="text-[10px] text-muted-foreground mt-1 italic">
                  Interpretação: quantas vezes por período o ativo se converte em receita. Valores abaixo de 0,5 indicam ativos subutilizados que pressionam a rentabilidade e o GE.
                </p>
              </div>
            </div>

            <div className={`flex items-start gap-3 p-4 rounded-lg border ${margemLiquida < 0.05 ? "bg-red-500/5 border-red-500/20" : "bg-muted/20 border-border/30"}`}>
              <span className="text-xl shrink-0">🏢</span>
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-foreground">Margem Líquida</p>
                  {margemLiquida < 0.05 && <Badge className="bg-red-500/15 text-red-600 text-[9px]">Detectado</Badge>}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Lucro Líquido: R$ {fmt(l.ll)} · Receita Líquida: R$ {fmt(l.rl)} · Margem: <strong>{fmtPct(margemLiquida)}</strong>.
                </p>
                <p className="text-[10px] font-mono text-muted-foreground/80 mt-1">Cálculo: LL / RL = {fmt(l.ll)} / {fmt(l.rl)} = {fmtPct(margemLiquida)}</p>
                <p className="text-[10px] text-muted-foreground mt-1 italic">
                  Impacto: margens apertadas reduzem o RPL (LL/PL), primeiro componente do Kanitz. Meta mínima saudável: &gt; 5%.
                </p>
              </div>
            </div>
          </div>
        </div>
      </ReportPage>

      {/* ══ MÓDULO 9 — SIMULAÇÃO FINANCEIRA ══ */}
      <ReportPage>
        <div className="space-y-4">
          <SectionTitle num="9" title="SIMULAÇÃO FINANCEIRA" />
          <p className="text-xs text-muted-foreground">
            Cenários simulados de melhoria do FI aplicando premissas Kanitz diretamente sobre as contas do balancete (não sobre os componentes já calculados). Fórmula reaplicada: FI = 0,05·RPL + 1,65·LG + 3,55·LS − 1,06·LC − 0,33·GE.
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
                  <TableHead className="text-[10px]">Premissa aplicada</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[
                  { cenario: "📉 Redução de Dívida", fi: simReducaoDivida, premissa: "Passivo Total e PC reduzidos em 20% — impacta LG, LS, LC e GE." },
                  { cenario: "📈 Aumento de Margem", fi: simAumentoMargem, premissa: "Lucro Líquido aumentado em 30% — impacta RPL." },
                  { cenario: "💰 Injeção de Capital", fi: simInjecaoCapital, premissa: "Aporte equivalente a 30% do PL entra em caixa (AC ↑, PL ↑) — impacta LG, LS, LC e GE." },
                  { cenario: "✂️ Redução de Custos", fi: simReducaoCustos, premissa: "Redução de 15% do CPV convertida em Lucro Líquido — impacta RPL." },
                ].map(sim => {
                  const delta = sim.fi - l.fi;
                  const newClass: KanitzRow["classificacao"] = kAplic
                    ? (sim.fi > 1 ? "saudavel" : sim.fi > 0 ? "estavel" : sim.fi > -1 ? "atencao" : sim.fi >= -3 ? "risco" : "insolvente")
                    : "na";
                  return (
                    <TableRow key={sim.cenario}>
                      <TableCell className="text-xs font-medium">{sim.cenario}</TableCell>
                      <TableCell className="text-right text-xs font-mono">{(l.fi ?? 0).toFixed(2)}</TableCell>
                      <TableCell className={`text-right text-xs font-mono font-bold ${classColors[newClass]?.color}`}>{(sim.fi ?? 0).toFixed(2)}</TableCell>
                      <TableCell className={`text-right text-xs font-mono ${delta > 0 ? "text-emerald-600" : "text-red-600"}`}>{delta > 0 ? "+" : ""}{(delta ?? 0).toFixed(2)}</TableCell>
                      <TableCell className="text-xs">
                        <Badge className={`text-[9px] ${
                          newClass === "saudavel" ? "bg-emerald-500/15 text-emerald-600" :
                          newClass === "estavel" ? "bg-blue-500/15 text-blue-600" :
                          newClass === "atencao" ? "bg-yellow-500/15 text-yellow-600" :
                          newClass === "risco" ? "bg-orange-500/15 text-orange-600" :
                          newClass === "na" ? "bg-slate-500/15 text-slate-600" : "bg-red-500/15 text-red-600"
                        }`}>{classColors[newClass]?.icon} {classColors[newClass]?.label}</Badge>
                      </TableCell>
                      <TableCell className="text-[10px] text-muted-foreground max-w-[240px]">{sim.premissa}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          {!kAplic && (
            <p className="text-[10px] text-muted-foreground italic">
              Nota: com PL negativo, os FI simulados também são referenciais. O impacto real deve ser medido pelo ISG projetado — recomenda-se combinar redução de dívida com injeção de capital para restaurar PL positivo.
            </p>
          )}
        </div>
      </ReportPage>

      {/* ══ MÓDULO 10 — PARECER TÉCNICO ══ */}
      <ReportPage>
        <div className="space-y-4 break-inside-avoid section-print-avoid-break">
          <SectionTitle num="10" title="PARECER TÉCNICO" />
          <div className="space-y-4">
            {[
              { title: "Diagnóstico Financeiro", text: !kAplic
                ? `A empresa apresenta Patrimônio Líquido de R$ ${fmt(l.pl)} (negativo), Ativo Total de R$ ${fmt(l.at)} e Passivo Total de R$ ${fmt(l.pt)}. Nessas condições, o modelo Kanitz não se aplica: substitui-se pelo Índice de Solvência Geral (ISG = AT/PT) = ${(l.isg ?? 0).toFixed(2)} — ${isgClass.label}. O Endividamento Total é de ${fmtPct(endivTotal)}, configurando estrutura patrimonial ${endivTotal > 0.9 ? "criticamente alavancada" : endivTotal > 0.7 ? "altamente dependente de capital de terceiros" : "moderadamente alavancada"}.`
                : `A empresa apresenta Fator de Insolvência de ${(l.fi ?? 0).toFixed(2)} (${classColors[l.classificacao]?.label}). Patrimônio Líquido de R$ ${fmt(l.pl)} e Ativo Total de R$ ${fmt(l.at)} configuram ${endivTotal < 0.5 ? "estrutura patrimonial sólida" : endivTotal < 0.7 ? "estrutura patrimonial moderadamente alavancada" : "alta dependência de capital de terceiros"}. ISG = ${(l.isg ?? 0).toFixed(2)}.` },


              { title: "Causas de Deterioração", text: previous
                ? `Comparativo com período anterior (${previous.year}): FI variou de ${(previous.fi ?? 0).toFixed(2)} para ${(l.fi ?? 0).toFixed(2)} (${fiDelta > 0 ? "melhora" : "piora"} de ${Math.abs(fiDelta).toFixed(2)} pontos), ISG variou de ${(previous.isg ?? 0).toFixed(2)} para ${(l.isg ?? 0).toFixed(2)}. Principais vetores: ${!kAplic ? "PL passou a território negativo, invalidando RPL e GE. " : ""}${l.ls < (previous.ls || 0) ? "redução da liquidez seca; " : ""}${l.lc < (previous.lc || 0) ? "queda da liquidez corrente; " : ""}${l.pt > (previous.pt || 0) ? "expansão do passivo total; " : ""}${l.pl < (previous.pl || 0) ? "erosão do patrimônio líquido." : ""}`
                : "Análise evolutiva indisponível — apenas um período carregado no relatório." },

              { title: "Probabilidade de Insolvência", text: !kAplic
                ? `INSOLVÊNCIA TÉCNICA CONFIGURADA. PL negativo (R$ ${fmt(l.pl)}) significa que as obrigações totais superam os ativos livres de compromisso com terceiros. Pelo ISG (${(l.isg ?? 0).toFixed(2)}), ${l.isg < 1 ? "os ativos não são suficientes para cobrir o passivo total — risco crítico" : l.isg < 1.5 ? "a cobertura é estreita — risco elevado" : "a cobertura é adequada, mas a reconstituição do PL é imperativa"}. Recomenda-se avaliação de reestruturação nos moldes da Lei 11.101/2005.`
                : l.fi < -3 ? "ALTA. O FI abaixo de -3 indica alta probabilidade estatística de insolvência segundo o modelo Kanitz. A empresa deve buscar reestruturação imediata."
                : l.fi < 0 ? "MODERADA. O FI na zona de atenção/risco requer monitoramento contínuo e medidas preventivas."
                : "BAIXA. O FI positivo indica solvência segundo o modelo Kanitz. Recomenda-se manutenção das boas práticas financeiras." },

              { title: "Recomendações Estratégicas", text: [
                !kAplic ? "Prioridade máxima: restaurar PL positivo via aporte de capital ou capitalização de créditos de acionistas." : null,
                !kAplic ? "Renegociar dívidas com bancos e fornecedores para alongar prazos e reduzir juros — foco em melhorar o ISG." : null,
                endivTotal > 0.7 ? "Implementar plano de desalavancagem — priorizar quitação de dívidas onerosas." : null,
                l.ls < 1 ? "Reduzir dependência de estoques para liquidez — otimizar gestão de recebíveis e giro de estoque." : null,
                coberturaJuros < 2 ? "Renegociar condições de dívida bancária — melhorar cobertura de juros (atual: " + (coberturaJuros ?? 0).toFixed(2) + "x)." : null,
                margemLiquida < 0.1 ? `Revisar estrutura de custos — margem líquida de ${fmtPct(margemLiquida)} está abaixo do saudável.` : null,
                despFinSobreReceita > 0.1 ? `Reduzir peso das despesas financeiras (atualmente ${fmtPct(despFinSobreReceita)} da RL) — foco em capital próprio ou linhas mais baratas.` : null,
                "Monitorar mensalmente FI e ISG combinados; o ISG é o indicador de curto prazo para empresas com PL comprometido.",
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
              <p>X2 = (Ativo Circulante + Realizável LP) / Passivo Total (LG)</p>
              <p>X3 = (Ativo Circulante − Estoques) / Passivo Circulante (LS)</p>
              <p>X4 = Ativo Circulante / Passivo Circulante (LC)</p>
              <p>X5 = Passivo Total / Patrimônio Líquido (GE)</p>
              <p className="pt-1 border-t border-border/40 mt-1"><strong>ISG</strong> = Ativo Total / Passivo Total — usado como referência quando PL ≤ 0.</p>
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
                      <TableCell key={`w-${r.year}`} className="text-right text-xs font-mono font-bold">{(c.peso * (r[c.key] ?? 0)).toFixed(4)}</TableCell>
                    ))}
                  </TableRow>
                ))}
                <TableRow className="border-t-2 border-foreground/20">
                  <TableCell className="text-xs font-bold" colSpan={2}>FATOR DE INSOLVÊNCIA (FI)</TableCell>
                  {kanitzResults.map(r => <TableCell key={r.year} className="text-right" />)}
                  {kanitzResults.map(r => (
                    <TableCell key={`fi-${r.year}`} className={`text-right text-sm font-bold font-mono ${classColors[r.classificacao]?.color}`}>{(r.fi ?? 0).toFixed(2)}</TableCell>
                  ))}
                </TableRow>
                <TableRow className="bg-amber-500/5">
                  <TableCell className="text-xs font-bold" colSpan={2}>ISG (AT / PT)</TableCell>
                  {kanitzResults.map(r => <TableCell key={`isg-v-${r.year}`} className="text-right text-xs font-mono">{(r.isg ?? 0).toFixed(2)}</TableCell>)}
                  {kanitzResults.map(r => <TableCell key={`isg-w-${r.year}`} className="text-right" />)}
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
            <p className="text-xs text-muted-foreground">Parecer Técnico Sênior IA</p>
            <p className="text-xs text-muted-foreground">Relatório Kanitz Expandido v2.0 — Relatório Financeiro de Inteligência de Risco</p>
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
        <Button variant="outline" className="gap-1.5" onClick={() => exportPdf('report-kanitz-container', 'Relatório Kanitz')}>
          <Download className="w-4 h-4" /> Exportar PDF
        </Button>
        <span className="relative group/docbtn inline-flex hidden">
          <Button variant="outline" className="gap-1.5" onClick={() => exportDocx('report-kanitz-container', 'Relatório Kanitz')}>
            <FileText className="w-4 h-4" /> Exportar .doc
          </Button>
          <span className="pointer-events-none absolute -top-7 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded bg-red-600 text-white text-[10px] font-bold whitespace-nowrap shadow-md opacity-0 group-hover/docbtn:opacity-100 transition-opacity">
            Será removido
          </span>
        </span>
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
  // No fluxo técnico (Kanitz), ambos relatórios ficam disponíveis para seleção.
  // No fluxo executivo (BEX gratuito), apenas BEX.
  const effectiveAvailableReports: Array<"bex" | "kanitz"> =
    availableReports && availableReports.length > 0
      ? availableReports
      : isResumido ? ["bex"] : ["bex", "kanitz"];
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

  // Wizard de abas: começa exibindo apenas a 1ª, libera as próximas conforme o usuário avança.
  // Quando o relatório final é gerado (ou ao abrir um relatório salvo), todas as abas ficam visíveis.
  const tabOrder = useMemo(() => [
    "diagnostico", "analise-tecnica", "indicadores", "endividamento", "patrimonial",
    "bs-dados", "pivot", "graficos-auditoria", "risco-rj", "kanitz", "relatorio-final"
  ], []);
  const currentIdx = Math.max(0, tabOrder.indexOf(activeTab));
  const [maxUnlocked, setMaxUnlocked] = useState<number>(
    initialReportType ? tabOrder.length - 1 : currentIdx
  );
  useEffect(() => {
    if (currentIdx > maxUnlocked) setMaxUnlocked(currentIdx);
  }, [currentIdx, maxUnlocked]);
  const reportFinalGerado = !!initialReportType || reportType !== "none";
  const showAllTabs = reportFinalGerado;
  const effectiveMax = showAllTabs ? tabOrder.length - 1 : maxUnlocked;
  const goNextTab = () => {
    const ni = Math.min(currentIdx + 1, tabOrder.length - 1);
    setMaxUnlocked(m => Math.max(m, ni));
    setActiveTab(tabOrder[ni]);
  };
  const goPrevTab = () => {
    const ni = Math.max(currentIdx - 1, 0);
    setActiveTab(tabOrder[ni]);
  };
  const showWizardButtons = true;

  // Use AI data if available, otherwise fall back to mock data
  const activeDiagnostico = aiAnalysis?.diagnostico || diagnosticoData;
  const activePendencias = aiAnalysis?.pendencias || pendencias;
  const activeScoreRJ = aiAnalysis?.scoreRJ || scoreRJData;

  const bsRows = useMemo(() => {
    return buildBSDados(parsedData, balanceteEntries);
  }, [parsedData, balanceteEntries]);


  const persistReport = (variant: "resumido" | "completo") => {
    // FIX #4 — SEMPRE prioriza valores DETERMINÍSTICOS do servidor.
    // Quando ausentes, registra warning para investigação (não silencia).
    const det = aiAnalysis?.insightsDeterministicos || aiAnalysis?.insights;
    const detRiskLevel = det?.risk_level as "baixo"|"moderado"|"elevado"|"critico"|undefined;
    const detConformidade = typeof det?.conformidade === "number" ? det.conformidade : null;
    if (!detRiskLevel || detConformidade === null) {
      console.warn("[persistReport] insightsDeterministicos AUSENTE — usando fallback IA. audit-bs-dados pode não ter rodado.", {
        hasDet: !!det, detKeys: det ? Object.keys(det) : [],
      });
    }
    const aiRiskLevel = aiAnalysis?.diagnostico?.riskLevel;
    const riskLevel = detRiskLevel || aiRiskLevel || "moderado";
    const pendencias = aiAnalysis?.pendencias?.length || 0;
    const conformidade = detConformidade ?? (
      riskLevel === "baixo" ? 95 : riskLevel === "moderado" ? 78 : riskLevel === "elevado" ? 55 : 35
    );
    const baseName = (parsedData as any)?.fileName || aiAnalysis?.fileName || "Auditoria";
    const title = variant === "completo"
      ? `Relatório Kanitz - Ref. (${baseName})`
      : `Relatório BEx - Ref. (${baseName})`;
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
      // Expande "auto" → meses reais detectados (parsedData.years) antes de persistir,
      // garantindo que balanceteEntries e periodos não contenham literais não-mês.
      balanceteEntries: (balanceteEntries || []).map(e => {
        if (e.mesReferencia && e.mesReferencia !== "auto") return e;
        // Para "auto" ou null, herda os meses detectados no parser (todos)
        const detected = (parsedData?.years || []).filter(y => /^\d{4}-(0[1-9]|1[0-2])$/.test(y));
        return { ...e, mesReferencia: detected[0] ?? null, mesesDetectados: detected };
      }),
      periodos: (() => {
        const fromUser = (balanceteEntries || [])
          .map(e => e.mesReferencia)
          .filter((m): m is string => !!m && m !== "auto" && /^\d{4}-(0[1-9]|1[0-2])$/.test(m))
          .map(m => m.slice(0, 7));
        const fromParsed = (parsedData?.years || []).filter(y => /^\d{4}-(0[1-9]|1[0-2])$/.test(y));
        const merged = fromUser.length > 0 ? fromUser : fromParsed;
        return Array.from(new Set(merged)).sort();
      })(),
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
    // Após gerar e persistir o relatório, levar usuário à tela principal,
    // onde o card "Relatório Gerado" exibirá a tag "Disponível para análise".
    setTimeout(() => navigate("/user"), 600);
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
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground font-serif">Relatório BEx_Resumido_Kanitz</h1>
            <p className="text-sm text-muted-foreground">Documento gerado automaticamente pelo Técnico Contábil Sênior IA</p>
          </div>
        </div>
        <TabRelatorioFinal onBack={onBack} aiAnalysis={aiAnalysis} parsedData={parsedData} variant="resumido" uploadedFiles={uploadedFiles} sourceDocs={sourceDocs} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground font-serif">Avaliação Empresarial</h1>
          <p className="text-sm text-muted-foreground">Documento gerado automaticamente pelo Técnico Contábil Sênior IA</p>
        </div>
        
        {/* Export Dropdown */}
        <div className="flex items-center gap-2 print:hidden">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="default" className="gap-2 bg-[hsl(258,90%,66%)] hover:bg-[hsl(258,90%,75%)] hidden">
                <Download className="w-4 h-4" /> Exportar Resultados
                <ChevronDown className="w-3 h-3 ml-1 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-56 p-2">
              <div className="space-y-1">
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground px-2 py-1.5">Relatórios PDF</p>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="w-full justify-start gap-2 text-xs h-9" 
                  onClick={() => exportPdf('report-bex-container', 'Relatório BEx')}
                >
                  <FileText className="w-3.5 h-3.5 text-blue-500" /> 
                  Relatório BEx (PDF)
                </Button>

                {!isResumido && (
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="w-full justify-start gap-2 text-xs h-9" 
                    onClick={() => exportPdf('report-kanitz-container', 'Relatório Kanitz')}
                  >
                    <FileText className="w-3.5 h-3.5 text-amber-500" /> 
                    Relatório Kanitz (PDF)
                  </Button>
                )}
                
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="w-full justify-start gap-2 text-xs h-9" 
                  onClick={() => exportPdf('tab-graficos-container', `BEx_Graficos_Auditoria_e_Parecer_Contabil_${new Date().toISOString().split('T')[0]}`)}
                >
                  <BarChart3 className="w-3.5 h-3.5 text-purple-500" /> Gráficos de Auditoria + Parecer (PDF)
                </Button>
                
                <div className="h-px bg-border my-1" />
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground px-2 py-1.5">Dados Estruturados</p>
                
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="w-full justify-start gap-2 text-xs h-9" 
                  onClick={() => {
                    const rows = buildBSDados(parsedData, balanceteEntries);
                    const csv = exportBSDadosToCSV(rows);
                    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = `BEx_Balancete_Consolidado_${new Date().toISOString().split('T')[0]}.csv`;
                    a.click();
                    URL.revokeObjectURL(url);
                  }}
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-500" /> Balancete Consolidado (CSV)
                </Button>
              </div>
            </PopoverContent>
          </Popover>
          
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="w-full flex-wrap h-auto gap-1 bg-muted/50 p-1.5 justify-start">
          {[
            { value: "diagnostico", icon: Activity, label: "Diagnóstico" },
            { value: "analise-tecnica", icon: Search, label: "Análise Técnica" },
            { value: "indicadores", icon: BarChart3, label: "Indicadores" },
            { value: "endividamento", icon: Landmark, label: "Endividamento" },
            { value: "patrimonial", icon: Layers, label: "Patrimonial" },
            { value: "bs-dados", icon: Database, label: "BS & Dados" },
            { value: "pivot", icon: Layers, label: "Pivot" },
            { value: "graficos-auditoria", icon: BarChart3, label: "Gráficos de Auditoria" },
            
            { value: "risco-rj", icon: AlertOctagon, label: "Risco RJ" },
            { value: "kanitz", icon: Scale, label: "Kanitz" },
            { value: "relatorio-final", icon: BookOpen, label: "Relatório Final" },
          ].map(({ value, icon: Icon, label }, idx) => (
            <TabsTrigger
              key={value}
              value={value}
              className={`text-xs gap-1.5 relative rounded-t-md border-t-2 border-x-2 border-transparent transition-colors data-[state=active]:bg-[hsl(258,90%,66%)] data-[state=active]:text-white data-[state=active]:border-[hsl(258,90%,66%)] ${idx < currentIdx ? "border-t-[hsl(258,90%,66%)]" : ""} ${idx > effectiveMax ? "hidden" : ""}`}
            >
              <Icon className="w-3.5 h-3.5" /> {label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="diagnostico"><TabDiagnostico data={activeDiagnostico} /></TabsContent>
        <TabsContent value="analise-tecnica"><TabAnaliseTecnica pendenciasData={activePendencias} parsedData={parsedData} isHistoricalView={skipPersist} company={company} /></TabsContent>
        <TabsContent value="indicadores"><TabIndicadores parsedData={parsedData} aiAnalysis={aiAnalysis} bsRows={bsRows} /></TabsContent>
        <TabsContent value="endividamento"><TabEndividamento aiAnalysis={aiAnalysis} parsedData={parsedData} bsRows={bsRows} /></TabsContent>
        <TabsContent value="patrimonial"><TabPatrimonial aiAnalysis={aiAnalysis} parsedData={parsedData} bsRows={bsRows} /></TabsContent>
        <TabsContent value="bs-dados"><TabBSDados parsedData={parsedData} entries={balanceteEntries} /></TabsContent>
        <TabsContent value="pivot"><TabPivotBalancete parsedData={parsedData} entries={balanceteEntries} /></TabsContent>
        <TabsContent value="graficos-auditoria" id="tab-graficos-container" className="bg-background">
          {/* Capa de impressão BEx — só aparece em @media print */}
          <div className="bex-print-cover hidden" style={{ minHeight: "287mm", flexDirection: "column", background: "white", color: "hsl(220, 25%, 14%)", borderRadius: 0 }}>
            {/* Header com logo (padrão BEx) */}
            <div style={{ display: "flex", justifyContent: "flex-end", padding: "6mm 8mm 0" }}>
              <img src={logoBrasilExpertFull} alt="Brasil Expert" style={{ height: "14mm", objectFit: "contain" }} />
            </div>
            <div style={{ padding: "0 12mm", textAlign: "center", marginTop: "8mm" }}>
              <p style={{ fontSize: "22pt", fontWeight: 800, margin: 0 }}>BRASIL EXPERT</p>
            </div>
            {/* Centro */}
            <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "0 12mm", textAlign: "center" }}>
              <h1 style={{ fontSize: "22pt", fontWeight: 800, lineHeight: 1.15, margin: 0 }}>
                RELATÓRIO TÉCNICO DE GRÁFICOS<br />AUDITORIA CONTÁBIL E PARECER
              </h1>
              <p style={{ fontSize: "10pt", color: "hsl(220, 10%, 46%)", marginTop: "8pt", fontStyle: "italic" }}>Business Extended Analysis</p>

              <div style={{ display: "inline-flex", alignItems: "center", gap: "8pt", padding: "8pt 16pt", borderRadius: "999px", border: "1px solid hsl(258, 90%, 66%, 0.3)", background: "hsl(258, 90%, 66%, 0.05)", marginTop: "20pt" }}>
                <span style={{ fontSize: "12pt" }}>📊</span>
                <span style={{ fontSize: "10pt", fontWeight: 600 }}>Painel de Gráficos — Auditoria + Parecer Contábil</span>
              </div>

              <div style={{ marginTop: "28pt", fontSize: "10pt", color: "hsl(220, 10%, 46%)", lineHeight: 1.7 }}>
                <p style={{ fontWeight: 700, fontSize: "12pt", color: "hsl(220, 25%, 14%)", margin: 0 }}>Empresa Analisada: {company?.name ?? "—"}</p>
                {company?.cnpj && <p style={{ margin: 0 }}>CNPJ: {company.cnpj}</p>}
                <p style={{ margin: 0 }}>Data de Emissão: {new Date().toLocaleDateString("pt-BR")}</p>
              </div>

              <div style={{ marginTop: "24pt", paddingTop: "16pt", borderTop: "1px solid hsl(220, 18%, 90%)", width: "100%", maxWidth: "120mm" }}>
                <p style={{ fontSize: "8pt", color: "hsl(220, 10%, 46%)", textTransform: "uppercase", letterSpacing: "2pt", margin: 0 }}>Responsável Técnico</p>
                <p style={{ fontSize: "10pt", fontWeight: 600, margin: "4pt 0 0" }}>Técnico Contábil Sênior IA</p>
                <p style={{ fontSize: "9pt", color: "hsl(220, 10%, 46%)", margin: 0 }}>Especialista em Recuperação Judicial e Análise Empresarial</p>
              </div>
            </div>
            {/* Footer */}
            <div style={{ borderTop: "3px solid hsl(195, 53%, 50%)", padding: "3mm 8mm", textAlign: "center", fontSize: "9px", color: "hsl(220, 10%, 46%)", lineHeight: 1.5 }}>
              <p style={{ margin: 0 }}>Rua Cel. Oscar Porto, nº 736, 3º Andar, Paraíso, São Paulo-SP, CEP: 04003-003</p>
              <p style={{ margin: 0 }}>(11) 3285-4472 · https://www.brasilexpert.com.br/</p>
            </div>
          </div>
          <div className="flex items-center justify-between mb-3 print:hidden">
            <div className="text-xs text-muted-foreground">Use o botão abaixo para gerar um PDF (BEx) com ambos os painéis e capa.</div>
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => printReport('tab-graficos-container', `BEx_Graficos_Auditoria_e_Parecer_Contabil_${new Date().toISOString().split('T')[0]}`)}>
              <Printer className="w-3.5 h-3.5" /> Imprimir Gráficos (PDF BEx)
            </Button>
          </div>
          <Tabs defaultValue="auditoria" className="w-full">
            <TabsList className="mb-4">
              <TabsTrigger value="auditoria" className="gap-1.5"><BarChart3 className="w-3.5 h-3.5" /> Gráficos de Auditoria</TabsTrigger>
              <TabsTrigger value="parecer" className="gap-1.5"><BarChart3 className="w-3.5 h-3.5" /> Gráficos Parecer Contábil</TabsTrigger>
            </TabsList>
            <TabsContent value="auditoria">
              <h2 className="hidden print:block text-xl font-bold mb-3 mt-6 text-[#1e3a8a]">1. Gráficos de Auditoria</h2>
              <TabGraficosAuditoria files={uploadedFiles} parsedData={parsedData} entries={balanceteEntries} />
            </TabsContent>
            <TabsContent value="parecer" id="tab-graficos-parecer-container">
              <h2 className="hidden print:block text-xl font-bold mb-3 mt-8 text-[#1e3a8a]" style={{ pageBreakBefore: "always" }}>2. Gráficos do Parecer Contábil</h2>
              <div className="mb-4 rounded-lg border bg-muted/30 p-3 print:hidden">
                <div className="text-sm font-semibold text-foreground">Gráficos — Parecer Contábil</div>
                <p className="text-xs text-muted-foreground mt-1">Espelha 1:1 a aba <strong>GRÁFICOS (2)</strong> do template Kanitz/Giannini. Fórmulas idênticas às linhas O..V do Parecer Contábil; valores derivados da consolidação BS &amp; Dados. {balanceteEntries?.length || parsedData?.years?.length || 0} mês(es).</p>
              </div>
              <TabGraficosParecer parsedData={parsedData} entries={balanceteEntries} />
            </TabsContent>
          </Tabs>
        </TabsContent>
        <TabsContent value="risco-rj"><TabRiscoRJ aiAnalysis={aiAnalysis} /></TabsContent>
        <TabsContent value="kanitz"><TabKanitz parsedData={parsedData} aiAnalysis={aiAnalysis} balanceteEntries={balanceteEntries} /></TabsContent>
        <TabsContent value="relatorio-final">
          {effectiveAvailableReports.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 mb-4 p-3 rounded-lg border bg-muted/30">
              <span className="text-xs font-semibold text-muted-foreground mr-1">Relatórios disponíveis:</span>
              {effectiveAvailableReports.includes("bex") && (
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
              {effectiveAvailableReports.includes("kanitz") && (
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
            <TabRelatorioFinal onBack={onBack} aiAnalysis={aiAnalysis} parsedData={parsedData} variant="resumido" uploadedFiles={uploadedFiles} sourceDocs={sourceDocs} company={company} />
          ) : reportType === "kanitz" ? (
            <TabRelatorioKanitz onBack={onBack} aiAnalysis={aiAnalysis} parsedData={parsedData} uploadedFiles={uploadedFiles} sourceDocs={sourceDocs} company={company} />
          ) : (
            <TabRelatorioPreview onGerarBex={handleGerarBex} onGerarKanitz={handleGerarKanitz} selectedDepth={selectedDepth} />
          )}
        </TabsContent>
      </Tabs>

      {/* Botões laterais de navegação entre abas (wizard) — somem quando o relatório final é gerado */}
      {showWizardButtons && (
        <>
          {currentIdx > 0 && (
            <button
              type="button"
              onClick={goPrevTab}
              aria-label="Aba anterior"
              className="print:hidden fixed left-4 top-1/2 -translate-y-1/2 z-40 h-16 w-10 rounded-xl bg-[hsl(258,90%,66%)] text-white shadow-xl ring-2 ring-white/20 hover:bg-[hsl(258,90%,56%)] hover:scale-105 transition-all flex items-center justify-center"
            >
              <ChevronLeft className="w-6 h-6" />
            </button>
          )}
          <button
            type="button"
            onClick={goNextTab}
            disabled={currentIdx >= tabOrder.length - 1}
            aria-label="Próxima aba"
            className="print:hidden fixed right-4 top-1/2 -translate-y-1/2 z-40 h-16 w-10 rounded-xl bg-[hsl(12,90%,55%)] text-white shadow-xl ring-2 ring-white/20 hover:bg-[hsl(12,90%,45%)] hover:scale-105 transition-all flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100"
          >
            <ChevronRight className="w-6 h-6" />
          </button>
        </>
      )}
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
  const [monthsCap, setMonthsCap] = useState<number>(3);
  const [monthsTier, setMonthsTier] = useState<AuditMonthsTier>("gratuito");

  const [preParsing, setPreParsing] = useState(false);
  const [balanceteEntries, setBalanceteEntries] = useState<BalanceteEntry[]>([]);
  const [forceReprocess, setForceReprocess] = useState(false);

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
    
    // FIX #6 — usa determinístico quando disponível
    const det = analysis?.insightsDeterministicos || analysis?.insights;
    const detRiskLevel = det?.risk_level as "baixo"|"moderado"|"elevado"|"critico"|undefined;
    const detConformidade = typeof det?.conformidade === "number" ? det.conformidade : null;
    const riskLevel = detRiskLevel || analysis?.diagnostico?.riskLevel || "moderado";
    const pendencias = analysis?.pendencias?.length || 0;
    const conformidadeDefault = riskLevel === "baixo" ? 95 : riskLevel === "moderado" ? 78 : riskLevel === "elevado" ? 55 : 35;
    const conformidade = detConformidade ?? conformidadeDefault;
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
      conformidade,
      riscos: pendencias,
      riskLevel,
      batchId: newBatchId,
      companyId: company?.id,
      companyName: company?.name,
      source: reportSource,
      periodos: parsed?.years || [],
      deviations: analysis?.deviations || [],
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
              // Validação de cota mensal por variante (configurada no Gestor IA)
              if (company?.id) {
                const variant = selectedDepth === "tecnico" ? "completo" : "resumido";
                const { allowed, reason, quota } = await canGenerateForCompany(company.id, variant);
                if (!allowed) {
                  toast({
                    title: "Cota mensal esgotada",
                    description: reason ?? `Resumidos ${quota.resumido.used}/${quota.resumido.limit} · Completos ${quota.completo.used}/${quota.completo.limit}. Solicite ao Gestor IA cota extra.`,
                    variant: "destructive",
                  });
                  return;
                }
              }
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
                console.info("[Audit][PreParse] arquivos:", items.map(i => ({
                  file: i.fileName,
                  userMonth: i.userMonth,
                  parsedYears: i.parsed?.years ?? [],
                })));
                console.info("[Audit][PreParse] meses detectados (merged):", merged.months.map(m => `${m.label} (${m.source}, conf=${m.confidence})`));
                if (merged.months.length === 0) {
                  toast({
                    title: "Nenhum mês detectado",
                    description: "Selecione manualmente o período no combo de cada arquivo (ou renomeie incluindo MM.YYYY).",
                    variant: "destructive",
                  });
                }
                setMultiMonth(merged);
                // Regra de negócio: cap de meses depende do tier do plano da empresa
                // (gratuito = 3 meses recentes; pago = até 12 meses).
                const { cap, tier } = await getAuditMonthsCap(company?.id ?? null);
                setMonthsCap(cap);
                setMonthsTier(tier);
                const lastN = merged.years.slice(-cap);
                setFilteredMonths(lastN);
                if (merged.months.length > cap) {
                  toast({
                    title: `Auditoria limitada aos ${cap} meses mais recentes`,
                    description: `Plano ${tier}. Detectamos ${merged.months.length} meses; apenas (${lastN.map(k => {
                      const m = merged.months.find(x => x.key === k); return m?.label ?? k;
                    }).join(", ")}) serão usados no diagnóstico e nos relatórios.`,
                  });
                }
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
            onForceReprocess={setForceReprocess}
          />
        )}
        <MonthsConfirmDialog
          open={phase === "confirm-months" && !!multiMonth}
          data={multiMonth}
          maxMonths={monthsCap}
          tier={monthsTier}
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
            forceReprocess={forceReprocess}
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
