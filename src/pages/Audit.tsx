import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Upload, FileText, CheckCircle2, ChevronRight, ChevronLeft, ArrowRight,
  Shield, MessageCircle, Send, AlertTriangle, Download, Printer,
  PenLine, FileEdit, Calculator, FileCheck, TrendingUp, TrendingDown,
  BarChart3, PieChart, Activity, Target, Eye, Scale, Layers
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AuditProvider, useAudit } from "@/contexts/AuditContext";
import PlatformLayout from "@/components/PlatformLayout";
import type { DocumentType, UploadedDocument, ScopeIssueType } from "@/types/audit";

/* ── Helpers ── */
const fmt = (n: number) => new Intl.NumberFormat("pt-BR").format(Math.round(n));
const fmtPct = (n: number) => `${(n * 100).toFixed(1)}%`;
const fmtDays = (n: number) => `${Math.round(n)} dias`;

const riskColor: Record<string, string> = { low: "hsl(142,76%,36%)", medium: "hsl(38,92%,50%)", high: "hsl(0,84%,60%)" };
const tagColors: Record<string, { bg: string; text: string; label: string }> = {
  carregado: { bg: "bg-emerald-500/10", text: "text-emerald-400", label: "🟢 Carregado" },
  parcial: { bg: "bg-yellow-500/10", text: "text-yellow-400", label: "🟡 Parcial" },
  pendente: { bg: "bg-red-500/10", text: "text-red-400", label: "🔴 Pendente" },
  risco: { bg: "bg-orange-500/10", text: "text-orange-400", label: "⚠ Risco" },
};

/* ── Timeline ── */
const stepLabels = [
  "Configuração", "Revisão", "Análise Técnica", "Demonstrativo 1",
  "Índices", "DRE/DFC", "Demonstrativo 2", "AH",
  "AV", "Insolvência", "Solvência", "Consolidação", "Relatório"
];

const Timeline = () => {
  const { state, setStep } = useAudit();
  return (
    <div className="mb-6">
      <div className="flex items-center overflow-x-auto pb-2 gap-1">
        {stepLabels.map((label, i) => {
          const step = (i + 1) as import("@/types/audit").AuditStep;
          const isComplete = step < state.currentStep;
          const isActive = step === state.currentStep;
          return (
            <div key={label} className="flex items-center flex-shrink-0">
              <button
                onClick={() => step <= state.currentStep && setStep(step)}
                className="flex flex-col items-center group"
              >
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold border-2 transition-all ${
                  isComplete ? "bg-[hsl(142,76%,36%)] border-[hsl(142,76%,36%)] text-white" :
                  isActive ? "bg-[hsl(258,90%,66%)] border-[hsl(258,90%,66%)] text-white" :
                  "bg-background border-border text-muted-foreground"
                }`}>
                  {isComplete ? "✓" : step}
                </div>
                <span className={`text-[9px] mt-1 hidden lg:block whitespace-nowrap ${isActive ? "font-semibold text-foreground" : "text-muted-foreground"}`}>
                  {label}
                </span>
              </button>
              {i < 12 && <div className={`w-4 xl:w-6 h-0.5 mx-0.5 ${isComplete ? "bg-[hsl(142,76%,36%)]" : "bg-border"}`} />}
            </div>
          );
        })}
      </div>
    </div>
  );
};

/* ── Nav Buttons ── */
const NavButtons = ({ nextLabel = "Avançar", showBack = true }: { nextLabel?: string; showBack?: boolean }) => {
  const { goNext, goPrevious } = useAudit();
  return (
    <div className="flex justify-between mt-6">
      {showBack ? (
        <Button variant="outline" onClick={goPrevious} className="gap-1.5"><ChevronLeft className="w-4 h-4" /> Voltar</Button>
      ) : <div />}
      <Button onClick={goNext} className="bg-[hsl(258,90%,66%)] hover:bg-[hsl(258,90%,60%)] text-white gap-1.5">{nextLabel} <ArrowRight className="w-4 h-4" /></Button>
    </div>
  );
};

/* ══════════════════════════════════════════════════════
   STEP 1: CONFIGURAÇÃO
   ══════════════════════════════════════════════════════ */
const Step1 = () => {
  const { state, setConfig, goNext } = useAudit();
  const [dragOver, setDragOver] = useState(false);

  const handleFiles = (fileList: FileList | null) => {
    if (!fileList) return;
    const newDocs: UploadedDocument[] = Array.from(fileList).map((f, i) => {
      const ext = f.name.toLowerCase();
      let type: DocumentType = "outro";
      if (ext.includes("balanc") || ext.includes("bp")) type = "balanco";
      else if (ext.includes("dre")) type = "dre";
      else if (ext.includes("dfc") || ext.includes("fluxo")) type = "dfc";
      else if (ext.includes("nota")) type = "notas";
      return { id: `doc-${Date.now()}-${i}`, fileName: f.name, fileSize: f.size, type, parsed: false, tags: ["carregado"] };
    });
    setConfig({ files: [...state.config.files, ...newDocs] });
  };

  const removeFile = (id: string) => {
    setConfig({ files: state.config.files.filter(f => f.id !== id) });
  };

  const hasBalanco = state.config.files.some(f => f.type === "balanco");
  const hasDre = state.config.files.some(f => f.type === "dre");
  const canProceed = state.config.files.length > 0 && state.config.depth && state.config.purpose;

  // Validation: Ativo = Passivo + PL
  const d = state.config.entityData["2023"];
  const ativoTotal = d?.ativoCirculante + d?.ativoNaoCirculante;
  const passivoTotal = d?.passivoCirculante + d?.passivoNaoCirculante + d?.patrimonioLiquido;
  const isBalanced = Math.abs(ativoTotal - passivoTotal) < 1;

  return (
    <div className="space-y-6">
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Upload */}
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Upload className="w-4 h-4" /> Upload Multi-Documento</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }}
              onClick={() => document.getElementById("file-input")?.click()}
              className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
                dragOver ? "border-[hsl(258,90%,66%)] bg-[hsl(258,90%,66%)]/5" : "border-border hover:border-[hsl(258,90%,66%)]"
              }`}
            >
              <input id="file-input" type="file" hidden multiple accept=".pdf,.xlsx,.xls,.doc,.docx,.txt,.csv" onChange={(e) => handleFiles(e.target.files)} />
              <Upload className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">Arraste arquivos ou clique para selecionar</p>
              <p className="text-xs text-muted-foreground mt-1">Balanço, DRE, DFC, Notas Explicativas</p>
            </div>

            {state.config.files.length > 0 && (
              <div className="space-y-2">
                {state.config.files.map(f => (
                  <div key={f.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border">
                    <div className="flex items-center gap-3">
                      <FileText className="w-4 h-4 text-[hsl(258,90%,66%)]" />
                      <div>
                        <p className="text-xs font-medium text-foreground">{f.fileName}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <Badge variant="secondary" className="text-[10px]">{f.type.toUpperCase()}</Badge>
                          {f.tags.map(t => (
                            <span key={t} className={`text-[10px] px-1.5 py-0.5 rounded ${tagColors[t]?.bg} ${tagColors[t]?.text}`}>
                              {tagColors[t]?.label}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => removeFile(f.id)} className="text-muted-foreground text-xs">✕</Button>
                  </div>
                ))}
              </div>
            )}

            {!hasBalanco && <p className="text-xs text-orange-400">⚠ Balanço Patrimonial obrigatório</p>}
            {!hasDre && <p className="text-xs text-orange-400">⚠ DRE obrigatório</p>}
          </CardContent>
        </Card>

        {/* Config + Entity Data */}
        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Configurações</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Nível de Profundidade</label>
                <Select value={state.config.depth} onValueChange={(v) => setConfig({ depth: v as any })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="executive">Executivo</SelectItem>
                    <SelectItem value="technical">Técnico Detalhado</SelectItem>
                    <SelectItem value="formal">Parecer Formal (NBC TA)</SelectItem>
                    <SelectItem value="financial">Financeiro Analítico</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Finalidade</label>
                <Select value={state.config.purpose} onValueChange={(v) => setConfig({ purpose: v as any })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="external">Auditoria Externa</SelectItem>
                    <SelectItem value="internal">Auditoria Interna</SelectItem>
                    <SelectItem value="fiscal">Fiscalização</SelectItem>
                    <SelectItem value="defense">Defesa Técnica</SelectItem>
                    <SelectItem value="review">Revisão Independente</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-sm">Validação Patrimonial (2023)</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-xs">
              <div className="flex justify-between"><span className="text-muted-foreground">Ativo Total</span><span className="font-mono">{fmt(ativoTotal)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Passivo + PL</span><span className="font-mono">{fmt(passivoTotal)}</span></div>
              <div className={`flex justify-between font-semibold ${isBalanced ? "text-emerald-400" : "text-red-400"}`}>
                <span>Status</span><span>{isBalanced ? "✓ Balanceado" : "✗ Divergente"}</span>
              </div>
            </CardContent>
          </Card>

          <Button onClick={goNext} disabled={!canProceed} className="w-full bg-[hsl(258,90%,66%)] hover:bg-[hsl(258,90%,60%)] text-white gap-2">
            Continuar <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
};

/* ══════════════════════════════════════════════════════
   STEP 2: REVISÃO DE ESCOPO
   ══════════════════════════════════════════════════════ */
const Step2 = () => {
  const { state, toggleScopeCheck, setScopeIssueType } = useAudit();
  const cats = { patrimonial: "Estrutura Patrimonial", resultado: "Resultado", fluxo_caixa: "Fluxo de Caixa" };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Checklist Técnico Estruturado</CardTitle>
            <Badge variant="secondary">{state.scopeChecks.filter(c => c.enabled).length} ativos</Badge>
          </div>
        </CardHeader>
        <CardContent>
          {(Object.entries(cats) as [string, string][]).map(([key, label]) => {
            const items = state.scopeChecks.filter(c => c.category === key);
            return (
              <div key={key} className="mb-5 last:mb-0">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">{label}</p>
                <div className="space-y-2">
                  {items.map(item => (
                    <div key={item.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-foreground">{item.name}</p>
                          {item.normReference && <Badge variant="outline" className="text-[10px]">{item.normReference}</Badge>}
                        </div>
                        <p className="text-xs text-muted-foreground">{item.description}</p>
                        {item.enabled && (
                          <Select value={item.issueType || ""} onValueChange={(v) => setScopeIssueType(item.id, v as ScopeIssueType)}>
                            <SelectTrigger className="h-7 w-40 mt-1.5 text-[10px]"><SelectValue placeholder="Tipo..." /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="issue">Issue</SelectItem>
                              <SelectItem value="desvio">Desvio</SelectItem>
                              <SelectItem value="risco">Risco</SelectItem>
                              <SelectItem value="problema_tecnico">Problema Técnico</SelectItem>
                            </SelectContent>
                          </Select>
                        )}
                      </div>
                      <Switch checked={item.enabled} onCheckedChange={() => toggleScopeCheck(item.id)} />
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>
      <NavButtons nextLabel="Iniciar Análise" />
    </div>
  );
};

/* ══════════════════════════════════════════════════════
   STEP 3: ANÁLISE TÉCNICA (3 colunas)
   ══════════════════════════════════════════════════════ */
const Step3 = () => {
  const { state } = useAudit();
  const [selectedId, setSelectedId] = useState(state.findings[0]?.id || "");
  const [chatMessages, setChatMessages] = useState<Array<{ role: "bot" | "user"; text: string }>>([
    { role: "bot" as const, text: "Assistente técnico de auditoria pronto. Posso ajudar com normas CPC, IFRS e NBC TA." },
  ]);
  const [chatInput, setChatInput] = useState("");
  const finding = state.findings.find(f => f.id === selectedId);
  const typeLabel: Record<string, string> = { inconsistency: "Inconsistência", omission: "Omissão", impropriety: "Impropriedade", control_weakness: "Fragilidade" };

  const sendChat = () => {
    if (!chatInput.trim()) return;
    const q = chatInput; setChatInput("");
    setChatMessages(m => [...m, { role: "user" as const, text: q }]);
    setTimeout(() => {
      setChatMessages(m => [...m, {
        role: "bot" as const,
        text: `Análise: "${q}"\n\n**Norma**: ${finding?.normativeFramework.cpc || "CPC aplicável"}\n**Risco**: ${finding?.riskLevel === "high" ? "Alto" : "Médio"}\n**Recomendação**: ${finding?.recommendation || "Revisar procedimentos."}`
      }]);
    }, 800);
  };

  return (
    <div className="space-y-4">
      <div className="grid lg:grid-cols-3 gap-4" style={{ minHeight: 480 }}>
        {/* Col 1: Pendências */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-1.5"><AlertTriangle className="w-4 h-4 text-orange-400" /> Pendências</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {state.findings.map(f => (
              <button key={f.id} onClick={() => setSelectedId(f.id)}
                className={`w-full text-left p-3 rounded-lg border transition-all ${selectedId === f.id ? "border-[hsl(258,90%,66%)] bg-[hsl(258,90%,66%)]/5" : "border-border hover:bg-muted/50"}`}>
                <div className="flex items-center gap-2 mb-1">
                  <Badge className="text-[10px]" style={{ backgroundColor: riskColor[f.riskLevel], color: "white" }}>
                    {f.riskLevel === "high" ? "Alto" : f.riskLevel === "medium" ? "Médio" : "Baixo"}
                  </Badge>
                  <span className="text-[10px] text-muted-foreground">{typeLabel[f.findingType]}</span>
                </div>
                <p className="text-xs font-medium text-foreground line-clamp-2">{f.description}</p>
              </button>
            ))}
          </CardContent>
        </Card>

        {/* Col 2: Achados Técnicos */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Achado Técnico</CardTitle></CardHeader>
          <CardContent>
            {finding ? (
              <div className="space-y-3 text-sm">
                <div className="flex gap-2 flex-wrap">
                  <Badge style={{ backgroundColor: riskColor[finding.riskLevel], color: "white" }}>{finding.riskLevel === "high" ? "Alto Risco" : "Médio Risco"}</Badge>
                  <Badge variant="outline">{typeLabel[finding.findingType]}</Badge>
                </div>
                <p className="text-foreground font-medium text-xs">{finding.description}</p>
                <div>
                  <p className="text-[10px] text-muted-foreground mb-1">Norma Aplicável</p>
                  <div className="flex gap-1 flex-wrap">
                    {finding.normativeFramework.cpc && <Badge className="bg-[hsl(258,80%,60%)] text-white text-[10px]">{finding.normativeFramework.cpc}</Badge>}
                    {finding.normativeFramework.ifrs && <Badge className="bg-[hsl(200,98%,45%)] text-white text-[10px]">{finding.normativeFramework.ifrs}</Badge>}
                    {finding.normativeFramework.nbcTa && <Badge className="bg-[hsl(142,76%,36%)] text-white text-[10px]">{finding.normativeFramework.nbcTa}</Badge>}
                  </div>
                </div>
                <div><p className="text-[10px] text-muted-foreground mb-0.5">Impacto</p><div className="flex gap-1">{finding.impactType.map(t => <Badge key={t} variant="secondary" className="text-[10px] capitalize">{t}</Badge>)}</div></div>
                {finding.materiality && <div><p className="text-[10px] text-muted-foreground">Materialidade: <span className="text-foreground font-medium">{finding.materiality}</span></p></div>}
                <div><p className="text-[10px] text-muted-foreground mb-0.5">Fundamentação</p><p className="text-[10px] text-foreground">{finding.technicalBasis}</p></div>
                {finding.recommendation && (
                  <div className="p-2 rounded bg-[hsl(258,90%,66%)]/5 border border-[hsl(258,60%,70%)]/20">
                    <p className="text-[10px] font-semibold text-foreground mb-0.5">Recomendação</p>
                    <p className="text-[10px] text-muted-foreground">{finding.recommendation}</p>
                  </div>
                )}
              </div>
            ) : <p className="text-sm text-muted-foreground">Selecione um achado</p>}
          </CardContent>
        </Card>

        {/* Col 3: Chat IA */}
        <Card className="flex flex-col">
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-1.5"><MessageCircle className="w-4 h-4 text-[hsl(258,90%,66%)]" /> Chat IA</CardTitle></CardHeader>
          <CardContent className="flex-1 flex flex-col">
            <div className="flex-1 space-y-2 overflow-y-auto max-h-[340px] mb-3">
              {chatMessages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[85%] p-2.5 rounded-xl text-xs leading-relaxed whitespace-pre-wrap ${msg.role === "user" ? "bg-[hsl(258,90%,66%)] text-white rounded-br-sm" : "bg-muted text-foreground rounded-bl-sm"}`}>
                    {msg.text}
                  </div>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <Input value={chatInput} onChange={(e) => setChatInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && sendChat()} placeholder="Pergunta sobre normas..." className="text-xs h-9" />
              <Button size="sm" onClick={sendChat} className="bg-[hsl(258,90%,66%)] text-white h-9 px-3"><Send className="w-3.5 h-3.5" /></Button>
            </div>
          </CardContent>
        </Card>
      </div>
      <NavButtons />
    </div>
  );
};

/* ══════════════════════════════════════════════════════
   STEP 4: DEMONSTRATIVO 1 (Balanço)
   ══════════════════════════════════════════════════════ */
const Step4 = () => {
  const { state } = useAudit();
  const years = ["2021", "2022", "2023"];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><Layers className="w-4 h-4" /> Balanço Patrimonial Consolidado</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-20 text-[10px]">Conta</TableHead>
                <TableHead className="text-[10px]">Descrição</TableHead>
                {years.map(y => <TableHead key={y} className="text-right text-[10px]">{y}</TableHead>)}
                <TableHead className="w-20 text-[10px]">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {state.balancoRows.map(row => (
                <TableRow key={row.conta} className={row.hasRisk ? "bg-orange-500/5" : ""}>
                  <TableCell className="text-[10px] font-mono text-muted-foreground">{row.conta}</TableCell>
                  <TableCell className={`text-xs ${row.conta.split(".").length <= 2 ? "font-semibold" : ""}`}>{row.descricao}</TableCell>
                  {years.map(y => (
                    <TableCell key={y} className="text-right text-xs font-mono">{fmt(row.values[y] || 0)}</TableCell>
                  ))}
                  <TableCell>
                    {row.tag && (
                      <span className={`text-[9px] px-1.5 py-0.5 rounded ${tagColors[row.tag]?.bg} ${tagColors[row.tag]?.text}`}>
                        {tagColors[row.tag]?.label}
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <NavButtons />
    </div>
  );
};

/* ══════════════════════════════════════════════════════
   STEP 5: ÍNDICES FINANCEIROS
   ══════════════════════════════════════════════════════ */
const Step5 = () => {
  const { state } = useAudit();
  const years = ["2021", "2022", "2023"];
  const ind = state.financialAnalysis.indicators;

  const sections = [
    {
      title: "Liquidez", icon: Activity, items: [
        { label: "Liquidez Corrente", key: "liquidezCorrente", fmt: fmtPct, formula: "AC / PC" },
        { label: "Liquidez Seca", key: "liquidezSeca", fmt: fmtPct, formula: "(AC - EST) / PC" },
        { label: "Liquidez Imediata", key: "liquidezImediata", fmt: fmtPct, formula: "Caixa / PC" },
      ]
    },
    {
      title: "Estrutura de Capital", icon: PieChart, items: [
        { label: "Endividamento Geral", key: "endividamentoGeral", fmt: fmtPct, formula: "PT / AT" },
        { label: "Composição Endividamento", key: "composicaoEndividamento", fmt: fmtPct, formula: "PC / PT" },
        { label: "Imobilização do PL", key: "imobilizacaoPL", fmt: fmtPct, formula: "ANC / PL" },
        { label: "Cobertura dos Juros", key: "coberturaJuros", fmt: (n: number) => n.toFixed(1), formula: "LAJIR / Juros" },
      ]
    },
    {
      title: "Atividade", icon: BarChart3, items: [
        { label: "Giro do Ativo", key: "giroAtivo", fmt: (n: number) => n.toFixed(2), formula: "V / AT" },
        { label: "PMR", key: "pmr", fmt: fmtDays, formula: "DR×360 / V" },
        { label: "PMP", key: "pmp", fmt: fmtDays, formula: "DP×360 / Compras" },
        { label: "Idade Média Estoque", key: "idadeMediaEstoque", fmt: fmtDays, formula: "EST×360 / CMV" },
      ]
    },
    {
      title: "Resultado", icon: TrendingUp, items: [
        { label: "Margem Líquida", key: "margemLiquida", fmt: fmtPct, formula: "LL / V" },
        { label: "Margem Operacional", key: "margemOperacional", fmt: fmtPct, formula: "LAJIR / V" },
        { label: "ROE", key: "roe", fmt: fmtPct, formula: "LL / PL" },
        { label: "ROA", key: "roa", fmt: fmtPct, formula: "LL / AT" },
      ]
    },
  ];

  return (
    <div className="space-y-4">
      <div className="grid md:grid-cols-2 gap-4">
        {sections.map(sec => (
          <Card key={sec.title}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2"><sec.icon className="w-4 h-4 text-[hsl(258,90%,66%)]" /> {sec.title}</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-[10px]">Índice</TableHead>
                    <TableHead className="text-[10px]">Fórmula</TableHead>
                    {years.map(y => <TableHead key={y} className="text-right text-[10px]">{y}</TableHead>)}
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
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        ))}
      </div>
      <NavButtons />
    </div>
  );
};

/* ══════════════════════════════════════════════════════
   STEP 6: DRE / DFC
   ══════════════════════════════════════════════════════ */
const Step6 = () => {
  const { state } = useAudit();
  const years = ["2021", "2022", "2023"];

  const validations = [
    { label: "Lucro vs Variação PL", status: state.dreValidation, detail: "Comparação entre lucro líquido e variação do patrimônio líquido" },
    { label: "Lucro vs Fluxo Operacional", status: "com_ressalva" as const, detail: "Lucro líquido vs caixa gerado nas operações" },
    { label: "Coerência Investimentos", status: "validado" as const, detail: "Investimentos vs variação de ativos não circulantes" },
  ];

  const statusStyle = { validado: "text-emerald-400 bg-emerald-500/10", com_ressalva: "text-yellow-400 bg-yellow-500/10", inconsistente: "text-red-400 bg-red-500/10" };
  const statusLabel = { validado: "VALIDADO", com_ressalva: "COM RESSALVA", inconsistente: "INCONSISTENTE" };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle className="text-base">DRE — Demonstração do Resultado</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-[10px]">Conta</TableHead>
                <TableHead className="text-[10px]">Descrição</TableHead>
                {years.map(y => <TableHead key={y} className="text-right text-[10px]">{y}</TableHead>)}
              </TableRow>
            </TableHeader>
            <TableBody>
              {state.dreRows.map(row => (
                <TableRow key={row.conta}>
                  <TableCell className="text-[10px] font-mono text-muted-foreground">{row.conta}</TableCell>
                  <TableCell className={`text-xs ${["3.03", "3.05", "3.07", "3.11"].includes(row.conta) ? "font-semibold" : ""}`}>{row.descricao}</TableCell>
                  {years.map(y => (
                    <TableCell key={y} className={`text-right text-xs font-mono ${(row.values[y] || 0) < 0 ? "text-red-400" : ""}`}>
                      {fmt(row.values[y] || 0)}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-sm">Validação Cruzada</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {validations.map(v => (
            <div key={v.label} className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
              <div>
                <p className="text-sm font-medium text-foreground">{v.label}</p>
                <p className="text-xs text-muted-foreground">{v.detail}</p>
              </div>
              <span className={`text-[10px] font-bold px-2 py-1 rounded ${statusStyle[v.status]}`}>
                {statusLabel[v.status]}
              </span>
            </div>
          ))}
        </CardContent>
      </Card>
      <NavButtons />
    </div>
  );
};

/* ══════════════════════════════════════════════════════
   STEP 7: DEMONSTRATIVO 2 (Consolidado pós-correções)
   ══════════════════════════════════════════════════════ */
const Step7 = () => {
  const { state } = useAudit();
  const years = ["2021", "2022", "2023"];

  return (
    <div className="space-y-4">
      <div className="p-3 rounded-lg bg-[hsl(200,98%,55%)]/10 border border-[hsl(200,98%,55%)]/20 text-xs text-muted-foreground">
        ℹ️ Balanço consolidado após correções. Itens ajustados marcados com indicador visual.
      </div>
      <Card>
        <CardHeader><CardTitle className="text-base">Demonstrativo Consolidado (Pós-Correções)</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-[10px]">Conta</TableHead>
                <TableHead className="text-[10px]">Descrição</TableHead>
                {years.map(y => <TableHead key={y} className="text-right text-[10px]">{y}</TableHead>)}
                <TableHead className="text-[10px]">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {state.balancoRows.map(row => (
                <TableRow key={row.conta} className={row.adjusted ? "bg-emerald-500/5" : row.hasRisk ? "bg-orange-500/5" : ""}>
                  <TableCell className="text-[10px] font-mono text-muted-foreground">{row.conta}</TableCell>
                  <TableCell className="text-xs">{row.descricao}</TableCell>
                  {years.map(y => (
                    <TableCell key={y} className="text-right text-xs font-mono">{fmt(row.values[y] || 0)}</TableCell>
                  ))}
                  <TableCell className="text-[10px]">
                    {row.adjusted ? <span className="text-emerald-400">✓ Ajustado</span> :
                     row.hasRisk ? <span className="text-orange-400">⚠ Risco</span> :
                     <span className="text-muted-foreground">Mantido</span>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <NavButtons />
    </div>
  );
};

/* ══════════════════════════════════════════════════════
   STEP 8: AH — Análise Horizontal
   ══════════════════════════════════════════════════════ */
const Step8 = () => {
  const { state } = useAudit();

  const rows = state.balancoRows.map(row => {
    const v21 = row.values["2021"] || 0;
    const v22 = row.values["2022"] || 0;
    const v23 = row.values["2023"] || 0;
    const var22 = v21 !== 0 ? ((v22 - v21) / Math.abs(v21)) : 0;
    const var23 = v22 !== 0 ? ((v23 - v22) / Math.abs(v22)) : 0;
    return { ...row, var22, var23, alert22: Math.abs(var22) > 0.3, alert23: Math.abs(var23) > 0.25 };
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><TrendingUp className="w-4 h-4" /> Análise Horizontal</CardTitle>
          <p className="text-xs text-muted-foreground">(Ano Atual - Ano Base) / Ano Base • Gatilhos: Crescimento &gt;30%, Queda &gt;25%</p>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-[10px]">Conta</TableHead>
                <TableHead className="text-[10px]">Descrição</TableHead>
                <TableHead className="text-right text-[10px]">2021</TableHead>
                <TableHead className="text-right text-[10px]">2022</TableHead>
                <TableHead className="text-right text-[10px]">AH 22/21</TableHead>
                <TableHead className="text-right text-[10px]">2023</TableHead>
                <TableHead className="text-right text-[10px]">AH 23/22</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(row => (
                <TableRow key={row.conta}>
                  <TableCell className="text-[10px] font-mono text-muted-foreground">{row.conta}</TableCell>
                  <TableCell className="text-xs">{row.descricao}</TableCell>
                  <TableCell className="text-right text-xs font-mono">{fmt(row.values["2021"] || 0)}</TableCell>
                  <TableCell className="text-right text-xs font-mono">{fmt(row.values["2022"] || 0)}</TableCell>
                  <TableCell className={`text-right text-xs font-mono font-bold ${row.alert22 ? (row.var22 > 0 ? "text-emerald-400" : "text-red-400") : ""}`}>
                    {fmtPct(row.var22)} {row.alert22 && "⚠"}
                  </TableCell>
                  <TableCell className="text-right text-xs font-mono">{fmt(row.values["2023"] || 0)}</TableCell>
                  <TableCell className={`text-right text-xs font-mono font-bold ${row.alert23 ? (row.var23 > 0 ? "text-emerald-400" : "text-red-400") : ""}`}>
                    {fmtPct(row.var23)} {row.alert23 && "⚠"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <NavButtons />
    </div>
  );
};

/* ══════════════════════════════════════════════════════
   STEP 9: AV — Análise Vertical
   ══════════════════════════════════════════════════════ */
const Step9 = () => {
  const { state } = useAudit();
  const years = ["2021", "2022", "2023"];

  // Ativo Total per year
  const ativoTotal: Record<string, number> = {};
  const ativoRow = state.balancoRows.find(r => r.conta === "1");
  years.forEach(y => { ativoTotal[y] = ativoRow?.values[y] || 1; });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><PieChart className="w-4 h-4" /> Análise Vertical — Balanço</CardTitle>
          <p className="text-xs text-muted-foreground">Conta / Ativo Total</p>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-[10px]">Conta</TableHead>
                <TableHead className="text-[10px]">Descrição</TableHead>
                {years.map(y => (
                  <TableHead key={y} className="text-right text-[10px]" colSpan={1}>{y} (Valor / %)</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {state.balancoRows.map(row => (
                <TableRow key={row.conta}>
                  <TableCell className="text-[10px] font-mono text-muted-foreground">{row.conta}</TableCell>
                  <TableCell className="text-xs">{row.descricao}</TableCell>
                  {years.map(y => {
                    const pct = ativoTotal[y] ? (Math.abs(row.values[y] || 0) / ativoTotal[y]) * 100 : 0;
                    const isHigh = pct > 30 && row.conta !== "1" && row.conta !== "2";
                    return (
                      <TableCell key={y} className="text-right text-xs font-mono">
                        <span>{fmt(row.values[y] || 0)}</span>
                        <span className={`ml-2 ${isHigh ? "text-orange-400 font-bold" : "text-muted-foreground"}`}>({pct.toFixed(1)}%)</span>
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <NavButtons />
    </div>
  );
};

/* ══════════════════════════════════════════════════════
   STEP 10: ÍNDICE DE INSOLVÊNCIA
   ══════════════════════════════════════════════════════ */
const Step10 = () => {
  const { state } = useAudit();
  const fa = state.financialAnalysis;
  const scoreColor = fa.insolvencyScore < 0 ? "text-red-400" : fa.insolvencyScore <= 1 ? "text-yellow-400" : "text-emerald-400";
  const classLabel = { insolvencia: "Insolvência", atencao: "Atenção", solidez: "Solidez" };

  return (
    <div className="space-y-4">
      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Target className="w-4 h-4" /> Índice de Insolvência</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="text-center py-6">
              <p className={`text-5xl font-bold ${scoreColor}`}>{fa.insolvencyScore.toFixed(3)}</p>
              <p className={`text-lg font-semibold mt-2 ${scoreColor}`}>{classLabel[fa.insolvencyClassification]}</p>
            </div>
            <div className="space-y-2 text-xs">
              <p className="text-muted-foreground font-semibold">Modelo Kanitz Simplificado:</p>
              <code className="block bg-muted/50 p-3 rounded text-[10px] font-mono">
                Score = (Liquidez Geral × 0,4) + (Rentabilidade × 0,3) - (Endividamento × 0,3)
              </code>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-sm">Classificação</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {[
              { range: "< 0", label: "Insolvência", color: "text-red-400 bg-red-500/10" },
              { range: "0 – 1", label: "Atenção", color: "text-yellow-400 bg-yellow-500/10" },
              { range: "> 1", label: "Solidez", color: "text-emerald-400 bg-emerald-500/10" },
            ].map(item => (
              <div key={item.range} className={`flex items-center justify-between p-3 rounded-lg ${fa.insolvencyClassification === item.label.toLowerCase().replace("ê", "e") ? "ring-2 ring-[hsl(258,90%,66%)]" : ""} bg-muted/30`}>
                <div className="flex items-center gap-3">
                  <span className={`text-xs font-mono font-bold px-2 py-1 rounded ${item.color}`}>{item.range}</span>
                  <span className="text-sm font-medium">{item.label}</span>
                </div>
                {fa.insolvencyClassification === item.label.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace("ê", "e") && (
                  <CheckCircle2 className="w-4 h-4 text-[hsl(258,90%,66%)]" />
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
      <NavButtons />
    </div>
  );
};

/* ══════════════════════════════════════════════════════
   STEP 11: SOLVÊNCIA
   ══════════════════════════════════════════════════════ */
const Step11 = () => {
  const { state } = useAudit();
  const d = state.config.entityData["2023"];
  const dividaOnerosa = (d?.passivoCirculante || 0) * 0.28 + (d?.passivoNaoCirculante || 0) * 0.69;
  const dividaLiquida = dividaOnerosa - (d?.caixaEquivalentes || 0);

  return (
    <div className="space-y-4">
      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Scale className="w-4 h-4" /> Análise de Solvência</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              {[
                { label: "Duplicatas Descontadas", value: d?.duplicatasDescontadas || 0 },
                { label: "Dívida Onerosa (estimada)", value: dividaOnerosa },
                { label: "Caixa e Equivalentes", value: d?.caixaEquivalentes || 0 },
                { label: "Dívida Líquida", value: dividaLiquida },
              ].map(item => (
                <div key={item.label} className="flex justify-between p-3 rounded-lg bg-muted/30">
                  <span className="text-sm text-muted-foreground">{item.label}</span>
                  <span className={`text-sm font-mono font-bold ${item.value < 0 ? "text-red-400" : "text-foreground"}`}>{fmt(item.value)}</span>
                </div>
              ))}
            </div>

            <div className="p-4 rounded-lg bg-[hsl(258,90%,66%)]/5 border border-[hsl(258,60%,70%)]/20">
              <p className="text-xs font-semibold text-foreground mb-1">Ajuste Patrimonial Simulado</p>
              <p className="text-xs text-muted-foreground">
                PL ajustado (sem duplicatas): <span className="font-mono font-bold">{fmt((d?.patrimonioLiquido || 0) - (d?.duplicatasDescontadas || 0))}</span>
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-sm">Conclusão Técnica</CardTitle></CardHeader>
          <CardContent>
            <Textarea
              defaultValue={state.financialAnalysis.solvencyConclusion}
              className="min-h-[200px] text-xs"
              placeholder="Conclusão técnica sobre solvência..."
            />
            <p className="text-[10px] text-muted-foreground mt-2">
              Permite: Simular retirada das duplicatas, reprocessar índices, emitir conclusão técnica.
            </p>
          </CardContent>
        </Card>
      </div>
      <NavButtons />
    </div>
  );
};

/* ══════════════════════════════════════════════════════
   STEP 12: CONSOLIDAÇÃO
   ══════════════════════════════════════════════════════ */
const Step12 = () => {
  const { state, toggleOnDemandContent } = useAudit();

  const baseSections = [
    { icon: PenLine, title: "Achados Técnicos Consolidados", content: state.findings.map((f, i) => `${i + 1}. ${f.description} (${f.riskLevel})`).join("\n") },
    { icon: Calculator, title: "Indicadores Financeiros", content: "Liquidez, Endividamento, Rentabilidade — Dados calculados automaticamente nas abas anteriores." },
    { icon: TrendingUp, title: "Análise Horizontal / Vertical", content: "AH e AV consolidados com gatilhos de alerta para variações significativas." },
    { icon: Target, title: "Insolvência e Solvência", content: `Score: ${state.financialAnalysis.insolvencyScore.toFixed(3)} — ${state.financialAnalysis.insolvencyClassification}` },
  ];

  return (
    <div className="space-y-6">
      <div className="p-3 rounded-lg bg-[hsl(200,98%,55%)]/10 border border-[hsl(200,98%,55%)]/20 text-xs text-muted-foreground">
        ℹ️ Consolidação expandida com achados técnicos, indicadores, AH/AV, insolvência e solvência.
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-foreground">Motor IA (4 camadas)</h3>
          {baseSections.map(sec => (
            <Card key={sec.title}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2"><sec.icon className="w-4 h-4 text-[hsl(258,90%,66%)]" /> {sec.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <Textarea defaultValue={sec.content} className="text-xs min-h-[80px] resize-y" />
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-foreground">Conteúdos Sob Demanda</h3>
          {state.onDemandContents.map(c => (
            <Card key={c.id} className={c.generated ? "border-[hsl(142,76%,36%)]/30" : ""}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">{c.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{c.description}</p>
                  </div>
                  <Button size="sm" variant={c.generated ? "outline" : "default"} onClick={() => toggleOnDemandContent(c.id)}
                    className={c.generated ? "text-[hsl(142,76%,36%)] border-[hsl(142,76%,36%)]/30" : "bg-[hsl(258,90%,66%)] text-white"}>
                    {c.generated ? "✓ Incluído" : "Gerar"}
                  </Button>
                </div>
                {c.generated && (
                  <div className="mt-3 p-3 rounded-lg bg-muted/50 text-xs text-muted-foreground">
                    Conteúdo gerado pela IA com base nos achados e análise financeira consolidada.
                  </div>
                )}
              </CardContent>
            </Card>
          ))}

          <Card className="bg-muted/30">
            <CardContent className="p-4 space-y-2">
              <p className="text-sm font-semibold text-foreground">Modelo de Relatório</p>
              <div className="space-y-1.5">
                {["Executivo", "Técnico", "Parecer Formal", "Financeiro Analítico"].map(m => (
                  <label key={m} className="flex items-center gap-2 p-2 rounded bg-background cursor-pointer hover:bg-muted/50">
                    <input type="radio" name="modelo" defaultChecked={m === "Executivo"} className="accent-[hsl(258,90%,66%)]" />
                    <span className="text-xs font-medium">{m}</span>
                  </label>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
      <NavButtons nextLabel="Gerar Relatório" />
    </div>
  );
};

/* ══════════════════════════════════════════════════════
   STEP 13: RELATÓRIO FINAL V3
   ══════════════════════════════════════════════════════ */
const Step13 = () => {
  const { state, goPrevious } = useAudit();
  const navigate = useNavigate();
  const depthLabel: Record<string, string> = { executive: "Executivo", technical: "Técnico Detalhado", formal: "Parecer Formal", financial: "Financeiro Analítico" };
  const fa = state.financialAnalysis;
  const ind2023 = fa.indicators["2023"];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-foreground">Relatório Final — {depthLabel[state.config.depth]}</h2>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="gap-1.5"><Download className="w-4 h-4" /> Download</Button>
          <Button variant="outline" size="sm" className="gap-1.5"><Printer className="w-4 h-4" /> Imprimir</Button>
        </div>
      </div>

      <Card className="p-6 md:p-10">
        <div className="max-w-3xl mx-auto space-y-8">
          {/* Header */}
          <div className="text-center border-b border-border pb-6">
            <div className="flex items-center justify-center gap-2 mb-2">
              <Shield className="w-5 h-5 text-[hsl(258,90%,66%)]" />
              <span className="font-bold text-foreground">BEX Auditoria — Plataforma IA</span>
            </div>
            <h1 className="text-xl font-bold text-foreground mb-1">Relatório de Auditoria — {depthLabel[state.config.depth]}</h1>
            <p className="text-xs text-muted-foreground">Gerado em {new Date().toLocaleDateString("pt-BR")} • {state.config.files.map(f => f.fileName).join(", ") || "Documentos analisados"}</p>
          </div>

          {/* Sections */}
          {state.reportSections.map((section, i) => (
            <div key={section.id}>
              <h2 className="text-base font-bold text-foreground flex items-center gap-2 mb-3">
                <span className="w-6 h-6 rounded bg-[hsl(258,90%,66%)]/10 text-[hsl(258,90%,66%)] flex items-center justify-center text-xs font-bold">{i + 1}</span>
                {section.title}
              </h2>
              <p className="text-sm text-muted-foreground leading-relaxed">{section.content}</p>
            </div>
          ))}

          {/* Achados */}
          <div>
            <h2 className="text-base font-bold text-foreground mb-3">Achados Técnicos</h2>
            <div className="space-y-3">
              {state.findings.map(f => (
                <div key={f.id} className="p-4 rounded-lg border border-border">
                  <div className="flex items-center gap-2 mb-2">
                    <Badge style={{ backgroundColor: riskColor[f.riskLevel], color: "white" }} className="text-[10px]">
                      {f.riskLevel === "high" ? "Alto" : f.riskLevel === "medium" ? "Médio" : "Baixo"}
                    </Badge>
                    {f.normativeFramework.cpc && <Badge variant="outline" className="text-[10px]">{f.normativeFramework.cpc}</Badge>}
                  </div>
                  <p className="text-sm font-medium text-foreground mb-1">{f.description}</p>
                  <p className="text-xs text-muted-foreground">{f.technicalBasis}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Seção Financeira */}
          <div>
            <h2 className="text-base font-bold text-foreground mb-3">Seção Financeira</h2>
            {ind2023 && (
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: "Liquidez Corrente", value: fmtPct(ind2023.liquidezCorrente) },
                  { label: "Endividamento Geral", value: fmtPct(ind2023.endividamentoGeral) },
                  { label: "Margem Líquida", value: fmtPct(ind2023.margemLiquida) },
                  { label: "ROE", value: fmtPct(ind2023.roe) },
                  { label: "Insolvência Score", value: fa.insolvencyScore.toFixed(3) },
                  { label: "Classificação", value: fa.insolvencyClassification },
                ].map(item => (
                  <div key={item.label} className="p-3 rounded-lg bg-muted/30">
                    <p className="text-[10px] text-muted-foreground">{item.label}</p>
                    <p className="text-sm font-mono font-bold text-foreground">{item.value}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Governança */}
          <div>
            <h2 className="text-base font-bold text-foreground mb-3">Governança 3.0</h2>
            <div className="flex flex-wrap gap-1.5">
              {["NBC TA 200", "NBC TA 315", "NBC TA 320", "NBC TA 500", "NBC TA 705", "Lei 6.404/76"].map(n => (
                <Badge key={n} variant="secondary" className="text-[10px]">{n}</Badge>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-2">Rastreabilidade financeira • Logs de simulação • Histórico de ajustes • Versão de cálculo</p>
          </div>

          {/* Footer */}
          <div className="text-center border-t border-border pt-6 text-xs text-muted-foreground">
            <p>BEX Auditoria — Plataforma de Auditoria IA v3.0</p>
            <p>CPC • IFRS • NBC TA</p>
          </div>
        </div>
      </Card>

      <div className="flex justify-between">
        <Button variant="outline" onClick={goPrevious} className="gap-1.5"><ChevronLeft className="w-4 h-4" /> Voltar</Button>
        <Button onClick={() => navigate("/platform/user-dashboard")} className="bg-[hsl(142,76%,36%)] hover:bg-[hsl(142,70%,32%)] text-white gap-1.5">
          <CheckCircle2 className="w-4 h-4" /> Concluir
        </Button>
      </div>
    </div>
  );
};

/* ══════════════════════════════════════════════════════
   MAIN AUDIT PAGE
   ══════════════════════════════════════════════════════ */
const AuditContent = () => {
  const { state } = useAudit();
  const steps: Record<number, JSX.Element> = {
    1: <Step1 />, 2: <Step2 />, 3: <Step3 />, 4: <Step4 />,
    5: <Step5 />, 6: <Step6 />, 7: <Step7 />, 8: <Step8 />,
    9: <Step9 />, 10: <Step10 />, 11: <Step11 />, 12: <Step12 />,
    13: <Step13 />,
  };

  return (
    <PlatformLayout>
      <div className="max-w-[1400px] mx-auto p-4 md:p-6">
        <Timeline />
        {steps[state.currentStep]}
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
