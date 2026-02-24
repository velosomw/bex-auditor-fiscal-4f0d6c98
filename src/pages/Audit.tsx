import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Upload, FileText, CheckCircle2, ChevronRight, ChevronLeft, ArrowRight, Shield, MessageCircle, Send, Eye, AlertTriangle, Download, Printer, PenLine, FileEdit, Calculator, FileCheck } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { AuditProvider, useAudit } from "@/contexts/AuditContext";
import PlatformLayout from "@/components/PlatformLayout";

/* ── Timeline ── */
const stepLabels = ["Configuração", "Revisão", "Análise IA", "Consolidação", "Relatório"];

const Timeline = () => {
  const { state } = useAudit();
  return (
    <div className="flex items-center justify-between mb-8">
      {stepLabels.map((label, i) => {
        const step = i + 1;
        const isComplete = step < state.currentStep;
        const isActive = step === state.currentStep;
        return (
          <div key={label} className="flex items-center flex-1 last:flex-none">
            <div className="flex flex-col items-center">
              <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold border-2 transition-all ${
                isComplete ? "bg-[hsl(142,76%,36%)] border-[hsl(142,76%,36%)] text-white" :
                isActive ? "bg-[hsl(258,90%,66%)] border-[hsl(258,90%,66%)] text-white" :
                "bg-background border-border text-muted-foreground"
              }`}>
                {isComplete ? "✓" : step}
              </div>
              <span className={`text-xs mt-1.5 hidden sm:block ${isActive ? "font-semibold text-foreground" : "text-muted-foreground"}`}>
                {label}
              </span>
            </div>
            {i < 4 && (
              <div className={`flex-1 h-0.5 mx-2 ${isComplete ? "bg-[hsl(142,76%,36%)]" : "bg-border"}`} />
            )}
          </div>
        );
      })}
    </div>
  );
};

/* ── Step 1: Configuração ── */
const Step1 = () => {
  const { state, setConfig, goNext } = useAudit();
  const [dragOver, setDragOver] = useState(false);

  const handleFile = (files: FileList | null) => {
    if (files?.[0]) setConfig({ file: files[0] });
  };

  const canProceed = state.config.file && state.config.depth && state.config.purpose;

  return (
    <div className="grid lg:grid-cols-2 gap-6">
      {/* Upload */}
      <Card>
        <CardHeader><CardTitle className="text-base">Upload de Documento</CardTitle></CardHeader>
        <CardContent>
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files); }}
            onClick={() => document.getElementById("file-input")?.click()}
            className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors ${
              dragOver ? "border-[hsl(258,90%,66%)] bg-[hsl(258,90%,66%)]/5" :
              state.config.file ? "border-[hsl(142,76%,36%)] bg-[hsl(142,76%,36%)]/5" : "border-border hover:border-[hsl(258,90%,66%)]"
            }`}
          >
            <input id="file-input" type="file" hidden accept=".pdf,.xlsx,.xls,.doc,.docx,.txt" onChange={(e) => handleFile(e.target.files)} />
            {state.config.file ? (
              <div className="space-y-2">
                <FileText className="w-10 h-10 mx-auto text-[hsl(142,76%,36%)]" />
                <p className="font-medium text-foreground">{state.config.file.name}</p>
                <p className="text-xs text-muted-foreground">{(state.config.file.size / 1024).toFixed(1)} KB</p>
              </div>
            ) : (
              <div className="space-y-2">
                <Upload className="w-10 h-10 mx-auto text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Arraste um arquivo ou clique para selecionar</p>
                <p className="text-xs text-muted-foreground">.pdf, .xlsx, .xls, .doc, .docx, .txt</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Options */}
      <Card>
        <CardHeader><CardTitle className="text-base">Configurações</CardTitle></CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Nível de Profundidade</label>
            <Select value={state.config.depth} onValueChange={(v) => setConfig({ depth: v as any })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="executive">Executivo — Visão sintética</SelectItem>
                <SelectItem value="technical">Técnico Detalhado — Análise aprofundada</SelectItem>
                <SelectItem value="formal">Parecer Formal — Linguagem normativa NBC TA</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Finalidade do Trabalho</label>
            <Select value={state.config.purpose} onValueChange={(v) => setConfig({ purpose: v as any })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="external">Auditoria Externa</SelectItem>
                <SelectItem value="internal">Auditoria Interna</SelectItem>
                <SelectItem value="fiscal">Fiscalização / Órgãos de Controle</SelectItem>
                <SelectItem value="defense">Defesa Técnica</SelectItem>
                <SelectItem value="review">Revisão Independente</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Button onClick={goNext} disabled={!canProceed} className="w-full bg-[hsl(258,90%,66%)] hover:bg-[hsl(258,90%,60%)] text-white gap-2">
            Continuar <ChevronRight className="w-4 h-4" />
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

/* ── Step 2: Revisão ── */
const Step2 = () => {
  const { state, toggleTopic, goNext, goPrevious } = useAudit();
  const activeCount = state.topics.filter(t => t.enabled).length;
  const categories = { evaluation: "Avaliação Técnica", compliance: "Conformidade", risks: "Riscos", controls: "Controles" };

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="p-4 text-center">
          <FileText className="w-5 h-5 mx-auto text-[hsl(258,90%,66%)] mb-1" />
          <p className="text-xs text-muted-foreground">Documento</p>
          <p className="text-sm font-medium text-foreground truncate">{state.config.file?.name || "—"}</p>
        </Card>
        <Card className="p-4 text-center">
          <Eye className="w-5 h-5 mx-auto text-[hsl(200,98%,55%)] mb-1" />
          <p className="text-xs text-muted-foreground">Nível</p>
          <p className="text-sm font-medium text-foreground capitalize">{state.config.depth}</p>
        </Card>
        <Card className="p-4 text-center">
          <Shield className="w-5 h-5 mx-auto text-[hsl(142,76%,36%)] mb-1" />
          <p className="text-xs text-muted-foreground">Finalidade</p>
          <p className="text-sm font-medium text-foreground capitalize">{state.config.purpose}</p>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Tópicos de Auditoria</CardTitle>
            <Badge variant="secondary">{activeCount} de {state.topics.length} ativos</Badge>
          </div>
        </CardHeader>
        <CardContent>
          {(Object.entries(categories) as [string, string][]).map(([key, label]) => {
            const topics = state.topics.filter(t => t.category === key);
            return (
              <div key={key} className="mb-5 last:mb-0">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">{label}</p>
                <div className="space-y-2">
                  {topics.map(topic => (
                    <div key={topic.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
                      <div>
                        <p className="text-sm font-medium text-foreground">{topic.name}</p>
                        <p className="text-xs text-muted-foreground">{topic.description}</p>
                      </div>
                      <Switch checked={topic.enabled} onCheckedChange={() => toggleTopic(topic.id)} />
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <div className="flex justify-between">
        <Button variant="outline" onClick={goPrevious} className="gap-1.5"><ChevronLeft className="w-4 h-4" /> Voltar</Button>
        <Button onClick={goNext} className="bg-[hsl(258,90%,66%)] hover:bg-[hsl(258,90%,60%)] text-white gap-1.5">Iniciar Análise <ArrowRight className="w-4 h-4" /></Button>
      </div>
    </div>
  );
};

/* ── Step 3: Análise IA ── */
const Step3 = () => {
  const { state, goNext, goPrevious } = useAudit();
  const [selectedFinding, setSelectedFinding] = useState(state.findings[0]?.id || "");
  const [chatMessages, setChatMessages] = useState<Array<{ role: "bot" | "user"; text: string }>>([
    { role: "bot", text: "Olá! Sou o assistente técnico de auditoria. Posso ajudar com questionamentos normativos sobre os achados identificados." },
  ]);
  const [chatInput, setChatInput] = useState("");

  const finding = state.findings.find(f => f.id === selectedFinding);

  const riskColor = { low: "hsl(142,76%,36%)", medium: "hsl(38,92%,50%)", high: "hsl(0,84%,60%)" };
  const typeLabel: Record<string, string> = { inconsistency: "Inconsistência", omission: "Omissão", impropriety: "Impropriedade", control_weakness: "Fragilidade de Controle" };

  const sendChat = () => {
    if (!chatInput.trim()) return;
    const q = chatInput;
    setChatInput("");
    setChatMessages(m => [...m, { role: "user" as const, text: q }]);
    setTimeout(() => {
      setChatMessages(m => [...m, {
        role: "bot" as const,
        text: `Analisando: "${q}"\n\nCom base nos achados identificados e na fundamentação normativa aplicável (${finding?.normativeFramework.cpc || "CPC aplicável"}):\n\n**Fato**: ${finding?.description || "Achado selecionado"}\n**Interpretação**: Conforme ceticismo profissional, requer verificação adicional.\n**Recomendação**: ${finding?.recommendation || "Revisar procedimentos aplicáveis."}`
      }]);
    }, 1200);
  };

  return (
    <div className="space-y-4">
      <div className="grid lg:grid-cols-3 gap-4" style={{ minHeight: 500 }}>
        {/* Col 1: Document / Findings list */}
        <Card className="lg:col-span-1">
          <CardHeader className="pb-2"><CardTitle className="text-sm">Achados no Documento</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {state.findings.map(f => (
              <button
                key={f.id}
                onClick={() => setSelectedFinding(f.id)}
                className={`w-full text-left p-3 rounded-lg border transition-all ${
                  selectedFinding === f.id ? "border-[hsl(258,90%,66%)] bg-[hsl(258,90%,66%)]/5" : "border-border hover:bg-muted/50"
                }`}
              >
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

        {/* Col 2: Finding Detail */}
        <Card className="lg:col-span-1">
          <CardHeader className="pb-2"><CardTitle className="text-sm">Detalhe do Achado</CardTitle></CardHeader>
          <CardContent>
            {finding ? (
              <div className="space-y-4 text-sm">
                <div className="flex gap-2 flex-wrap">
                  <Badge style={{ backgroundColor: riskColor[finding.riskLevel], color: "white" }}>
                    {finding.riskLevel === "high" ? "Alto Risco" : finding.riskLevel === "medium" ? "Médio Risco" : "Baixo Risco"}
                  </Badge>
                  <Badge variant="outline">{typeLabel[finding.findingType]}</Badge>
                </div>
                <p className="text-foreground font-medium">{finding.description}</p>

                {/* Normas */}
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Enquadramento Normativo</p>
                  <div className="flex gap-1.5 flex-wrap">
                    {finding.normativeFramework.cpc && <Badge className="bg-[hsl(258,80%,60%)] text-white text-[10px]">{finding.normativeFramework.cpc}</Badge>}
                    {finding.normativeFramework.ifrs && <Badge className="bg-[hsl(200,98%,45%)] text-white text-[10px]">{finding.normativeFramework.ifrs}</Badge>}
                    {finding.normativeFramework.nbcTa && <Badge className="bg-[hsl(142,76%,36%)] text-white text-[10px]">{finding.normativeFramework.nbcTa}</Badge>}
                    {finding.normativeFramework.legislation && <Badge className="bg-[hsl(38,92%,50%)] text-white text-[10px]">{finding.normativeFramework.legislation}</Badge>}
                  </div>
                </div>

                <div>
                  <p className="text-xs text-muted-foreground mb-1">Fundamentação Técnica</p>
                  <p className="text-xs text-foreground leading-relaxed">{finding.technicalBasis}</p>
                </div>

                <div>
                  <p className="text-xs text-muted-foreground mb-1">Impacto</p>
                  <div className="flex gap-1.5">
                    {finding.impactType.map(t => (
                      <Badge key={t} variant="secondary" className="text-[10px] capitalize">{t === "patrimonial" ? "Patrimonial" : t === "result" ? "Resultado" : "Divulgação"}</Badge>
                    ))}
                  </div>
                </div>

                {finding.recommendation && (
                  <div className="p-3 rounded-lg bg-[hsl(258,90%,66%)]/5 border border-[hsl(258,60%,70%)]/20">
                    <div className="flex items-center gap-1.5 mb-1">
                      <Shield className="w-3.5 h-3.5 text-[hsl(258,90%,66%)]" />
                      <p className="text-xs font-semibold text-foreground">Recomendação</p>
                    </div>
                    <p className="text-xs text-muted-foreground">{finding.recommendation}</p>
                  </div>
                )}

                {finding.documentReference && (
                  <p className="text-[10px] text-muted-foreground">📄 {finding.documentReference}</p>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Selecione um achado</p>
            )}
          </CardContent>
        </Card>

        {/* Col 3: Chat */}
        <Card className="lg:col-span-1 flex flex-col">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-1.5">
              <MessageCircle className="w-4 h-4 text-[hsl(258,90%,66%)]" /> Chat IA Técnico
            </CardTitle>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col">
            <div className="flex-1 space-y-3 overflow-y-auto max-h-[350px] mb-3">
              {chatMessages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[85%] p-3 rounded-xl text-xs leading-relaxed whitespace-pre-wrap ${
                    msg.role === "user"
                      ? "bg-[hsl(258,90%,66%)] text-white rounded-br-sm"
                      : "bg-muted text-foreground rounded-bl-sm"
                  }`}>
                    {msg.text}
                  </div>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && sendChat()}
                placeholder="Pergunta sobre normas..."
                className="text-xs h-9"
              />
              <Button size="sm" onClick={sendChat} className="bg-[hsl(258,90%,66%)] hover:bg-[hsl(258,90%,60%)] text-white h-9 px-3">
                <Send className="w-3.5 h-3.5" />
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex justify-between">
        <Button variant="outline" onClick={goPrevious} className="gap-1.5"><ChevronLeft className="w-4 h-4" /> Voltar</Button>
        <Button onClick={goNext} className="bg-[hsl(258,90%,66%)] hover:bg-[hsl(258,90%,60%)] text-white gap-1.5">Consolidar <ArrowRight className="w-4 h-4" /></Button>
      </div>
    </div>
  );
};

/* ── Step 4: Consolidação ── */
const Step4 = () => {
  const { state, toggleOnDemandContent, goNext, goPrevious } = useAudit();

  const baseSections = [
    { icon: PenLine, title: "Correções e Edições Sugeridas", content: "1. Ajustar reconhecimento de receita conforme CPC 47\n2. Realizar teste de impairment nos ativos imobilizados\n3. Documentar critérios de depreciação\n4. Implementar conciliação de contas a receber" },
    { icon: FileEdit, title: "Redação Técnica Revisada", content: "O escopo do trabalho abrangeu a análise das demonstrações financeiras do exercício findo em 31/12/2024, com base nas Normas Brasileiras de Contabilidade aplicáveis..." },
    { icon: Calculator, title: "Ajustes Contábeis Sugeridos", content: "Patrimonial: Reversão de R$ 450.000 por impairment não reconhecido\nResultado: Diferimento de R$ 1.200.000 em receita antecipada\nDivulgação: 3 notas explicativas a complementar" },
    { icon: FileCheck, title: "Melhoria de Notas Explicativas", content: "Nota 3.1 — Incluir política de conciliação de recebíveis\nNota 4.1 — Justificar taxas de depreciação\nNota 5.2 — Detalhar critérios de reconhecimento de receita" },
  ];

  return (
    <div className="space-y-6">
      <div className="p-3 rounded-lg bg-[hsl(200,98%,55%)]/10 border border-[hsl(200,98%,55%)]/20 text-xs text-muted-foreground">
        ℹ️ Conteúdo editável. Alterações serão refletidas no relatório final.
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Base Content */}
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-foreground">Conteúdo Base</h3>
          {baseSections.map((sec) => (
            <Card key={sec.title}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <sec.icon className="w-4 h-4 text-[hsl(258,90%,66%)]" />
                  {sec.title}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Textarea defaultValue={sec.content} className="text-xs min-h-[100px] resize-y" />
              </CardContent>
            </Card>
          ))}
        </div>

        {/* On Demand */}
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-foreground">Conteúdos Sob Demanda (IA)</h3>
          {state.onDemandContents.map((c) => (
            <Card key={c.id} className={c.generated ? "border-[hsl(142,76%,36%)]/30" : ""}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">{c.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{c.description}</p>
                  </div>
                  <Button
                    size="sm"
                    variant={c.generated ? "outline" : "default"}
                    onClick={() => toggleOnDemandContent(c.id)}
                    className={c.generated ? "text-[hsl(142,76%,36%)] border-[hsl(142,76%,36%)]/30" : "bg-[hsl(258,90%,66%)] text-white"}
                  >
                    {c.generated ? "✓ Incluído" : "Gerar"}
                  </Button>
                </div>
                {c.generated && (
                  <div className="mt-3 p-3 rounded-lg bg-muted/50 text-xs text-muted-foreground">
                    Conteúdo gerado pela IA com base nos achados identificados e na fundamentação normativa aplicável. Clique em "Editar" para ajustes manuais.
                  </div>
                )}
              </CardContent>
            </Card>
          ))}

          {/* Summary */}
          <Card className="bg-muted/30">
            <CardContent className="p-4 space-y-2">
              <p className="text-sm font-semibold text-foreground">Resumo da Consolidação</p>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="p-2 rounded bg-background"><span className="text-muted-foreground">Seções base:</span> <span className="font-medium">4</span></div>
                <div className="p-2 rounded bg-background"><span className="text-muted-foreground">Achados:</span> <span className="font-medium">{state.findings.length}</span></div>
                <div className="p-2 rounded bg-background"><span className="text-muted-foreground">Alto risco:</span> <span className="font-medium text-[hsl(0,84%,60%)]">{state.findings.filter(f => f.riskLevel === "high").length}</span></div>
                <div className="p-2 rounded bg-background"><span className="text-muted-foreground">Sob demanda:</span> <span className="font-medium">{state.onDemandContents.filter(c => c.generated).length}</span></div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="flex justify-between">
        <Button variant="outline" onClick={goPrevious} className="gap-1.5"><ChevronLeft className="w-4 h-4" /> Voltar</Button>
        <Button onClick={goNext} className="bg-[hsl(258,90%,66%)] hover:bg-[hsl(258,90%,60%)] text-white gap-1.5">Gerar Relatório <ArrowRight className="w-4 h-4" /></Button>
      </div>
    </div>
  );
};

/* ── Step 5: Relatório Final ── */
const Step5 = () => {
  const { state, goPrevious } = useAudit();
  const navigate = useNavigate();

  const depthLabel = { executive: "Executivo", technical: "Técnico Detalhado", formal: "Parecer Formal" };

  return (
    <div className="space-y-6">
      {/* Actions */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-foreground">Relatório — {depthLabel[state.config.depth]}</h2>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="gap-1.5"><Download className="w-4 h-4" /> Download</Button>
          <Button variant="outline" size="sm" className="gap-1.5"><Printer className="w-4 h-4" /> Imprimir</Button>
        </div>
      </div>

      {/* Report Content */}
      <Card className="p-6 md:p-10">
        <div className="max-w-3xl mx-auto space-y-8">
          {/* Header */}
          <div className="text-center border-b border-border pb-6">
            <div className="flex items-center justify-center gap-2 mb-2">
              <Shield className="w-5 h-5 text-[hsl(258,90%,66%)]" />
              <span className="font-bold text-foreground">Plataforma de Auditoria IA</span>
            </div>
            <h1 className="text-xl font-bold text-foreground mb-1">
              Relatório de Auditoria — {depthLabel[state.config.depth]}
            </h1>
            <p className="text-xs text-muted-foreground">Gerado em {new Date().toLocaleDateString("pt-BR")} • {state.config.file?.name}</p>
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

          {/* Findings */}
          <div>
            <h2 className="text-base font-bold text-foreground mb-3">Achados Técnicos</h2>
            <div className="space-y-3">
              {state.findings.map(f => (
                <div key={f.id} className="p-4 rounded-lg border border-border">
                  <div className="flex items-center gap-2 mb-2">
                    <Badge style={{ backgroundColor: f.riskLevel === "high" ? "hsl(0,84%,60%)" : f.riskLevel === "medium" ? "hsl(38,92%,50%)" : "hsl(142,76%,36%)", color: "white" }} className="text-[10px]">
                      {f.riskLevel === "high" ? "Alto" : f.riskLevel === "medium" ? "Médio" : "Baixo"}
                    </Badge>
                    <span className="text-xs text-muted-foreground">{f.documentReference}</span>
                  </div>
                  <p className="text-sm font-medium text-foreground mb-1">{f.description}</p>
                  <p className="text-xs text-muted-foreground">{f.technicalBasis}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Footer */}
          <div className="text-center border-t border-border pt-6 text-xs text-muted-foreground">
            <p>BEX Auditoria — Plataforma de Auditoria IA v1.0</p>
            <p>CPC • IFRS • NBC TA</p>
          </div>
        </div>
      </Card>

      <div className="flex justify-between">
        <Button variant="outline" onClick={goPrevious} className="gap-1.5"><ChevronLeft className="w-4 h-4" /> Voltar</Button>
        <Button onClick={() => navigate("/user")} className="bg-[hsl(142,76%,36%)] hover:bg-[hsl(142,70%,32%)] text-white gap-1.5">
          <CheckCircle2 className="w-4 h-4" /> Concluir
        </Button>
      </div>
    </div>
  );
};

/* ── Main Audit Page ── */
const AuditContent = () => {
  const { state } = useAudit();

  return (
    <PlatformLayout>
      <div className="max-w-[1400px] mx-auto p-4 md:p-6">
        <Timeline />
        {state.currentStep === 1 && <Step1 />}
        {state.currentStep === 2 && <Step2 />}
        {state.currentStep === 3 && <Step3 />}
        {state.currentStep === 4 && <Step4 />}
        {state.currentStep === 5 && <Step5 />}
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
