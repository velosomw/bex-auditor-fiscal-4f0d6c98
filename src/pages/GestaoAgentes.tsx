import { useState, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import PlatformLayout from "@/components/PlatformLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import {
  ArrowLeft, Upload, Brain, BookOpen, Database, Activity, FileText,
  CheckCircle2, AlertCircle, Sparkles, Save, RefreshCw, Star, Loader2,
  Eye, Trash2, Edit3, TrendingUp, Cpu, Lightbulb, Target, Zap, XCircle,
} from "lucide-react";
import { parseFile, runAuditPipeline, type PipelineResult } from "@/services/auditAIService";
import { listCompanies, type Company } from "@/services/companiesService";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Legend,
} from "recharts";

// ─── Mock data ────────────────────────────────────────────────
const mockExtraction = [
  { id: 1, original: "Receita Operacional Líquida", padrao: "Receita Operacional", categoria: "Receita", valor: 1250000, status: "ok", confianca: 96 },
  { id: 2, original: "Custo dos Serviços Vendidos", padrao: "CMV/CSV", categoria: "Custo", valor: -680000, status: "ok", confianca: 92 },
  { id: 3, original: "Desp. Adm. e Gerais", padrao: "Despesas Administrativas", categoria: "Despesa", valor: -210000, status: "duvida", confianca: 78 },
  { id: 4, original: "Outras Receitas/Despesas", padrao: "?", categoria: "?", valor: 15000, status: "erro", confianca: 42 },
  { id: 5, original: "Resultado Financeiro Líq.", padrao: "Resultado Financeiro", categoria: "Financeiro", valor: -38000, status: "ok", confianca: 88 },
];

const learningRows = [
  { original: "Rec. Op. Líquida", padrao: "Receita Operacional", freq: 142, conf: 98 },
  { original: "CMV", padrao: "CMV/CSV", freq: 118, conf: 96 },
  { original: "Desp. Pessoal", padrao: "Despesas com Pessoal", freq: 95, conf: 94 },
  { original: "Imp. s/ Vendas", padrao: "Impostos sobre Vendas", freq: 87, conf: 92 },
  { original: "Result. Fin.", padrao: "Resultado Financeiro", freq: 76, conf: 90 },
];

const datasetRows = [
  { doc: "Balancete_2024_Q4_EmpresaA.pdf", empresa: "Empresa A", data: "2025-01-12", score: 94, gold: true },
  { doc: "DRE_2024_EmpresaB.xlsx", empresa: "Empresa B", data: "2025-01-08", score: 88, gold: false },
  { doc: "Balancete_Out_2024_EmpresaC.pdf", empresa: "Empresa C", data: "2024-12-22", score: 91, gold: true },
  { doc: "DRE_Nov_2024_EmpresaA.pdf", empresa: "Empresa A", data: "2024-12-10", score: 85, gold: false },
];

const accuracyTrend = [
  { mes: "Jul", precisao: 78 }, { mes: "Ago", precisao: 82 }, { mes: "Set", precisao: 85 },
  { mes: "Out", precisao: 88 }, { mes: "Nov", precisao: 91 }, { mes: "Dez", precisao: 93 }, { mes: "Jan", precisao: 95 },
];

const errorReduction = [
  { mes: "Jul", erros: 124 }, { mes: "Ago", erros: 98 }, { mes: "Set", erros: 76 },
  { mes: "Out", erros: 58 }, { mes: "Nov", erros: 42 }, { mes: "Dez", erros: 31 }, { mes: "Jan", erros: 22 },
];

// ─── TELA 1 — Upload & Processamento (REAL: parseFile + runAuditPipeline) ─────
type StageKey = "upload" | "ocr" | "extract" | "normalize" | "analyze";
type StageStatus = "idle" | "running" | "done" | "error";

const STAGE_LABELS: Record<StageKey, string> = {
  upload: "Upload",
  ocr: "OCR / Parse",
  extract: "Extração",
  normalize: "Normalização",
  analyze: "Análise & Score",
};

const TabUpload = () => {
  const [files, setFiles] = useState<File[]>([]);
  const [tipo, setTipo] = useState("balancete");
  const [empresaId, setEmpresaId] = useState<string>("");
  const [periodo, setPeriodo] = useState("");
  const [companies, setCompanies] = useState<Company[]>([]);
  const [processing, setProcessing] = useState(false);
  const [stages, setStages] = useState<Record<StageKey, StageStatus>>({
    upload: "idle", ocr: "idle", extract: "idle", normalize: "idle", analyze: "idle",
  });
  const [result, setResult] = useState<PipelineResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [timings, setTimings] = useState<Partial<Record<StageKey, number>>>({});
  const [totalMs, setTotalMs] = useState<number | null>(null);

  useEffect(() => {
    listCompanies().then(setCompanies).catch(() => {});
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const dropped = Array.from(e.dataTransfer.files);
    setFiles(prev => [...prev, ...dropped]);
  }, []);

  const setStage = (k: StageKey, s: StageStatus) =>
    setStages(prev => ({ ...prev, [k]: s }));

  const startPipeline = async () => {
    if (!files.length) return toast.error("Adicione pelo menos um documento.");
    if (!empresaId) return toast.error("Selecione a empresa.");
    if (!periodo) return toast.error("Informe o período.");

    setProcessing(true);
    setErrorMsg(null);
    setResult(null);
    setTimings({});
    setTotalMs(null);
    setStages({ upload: "running", ocr: "idle", extract: "idle", normalize: "idle", analyze: "idle" });

    const t0 = performance.now();
    const mark = (k: StageKey, start: number) =>
      setTimings(prev => ({ ...prev, [k]: Math.round(performance.now() - start) }));

    try {
      const tUpload = performance.now();
      setStage("upload", "done");
      mark("upload", tUpload);

      const tOcr = performance.now();
      setStage("ocr", "running");
      const parsed = await parseFile(files[0]);
      setStage("ocr", "done");
      mark("ocr", tOcr);

      const tExt = performance.now();
      setStage("extract", "running");
      if (!parsed.balanco?.length && !parsed.dre?.length) {
        throw new Error("Nenhum balanço ou DRE detectado no documento.");
      }
      setStage("extract", "done");
      mark("extract", tExt);

      const tNorm = performance.now();
      setStage("normalize", "running");
      const pipe = await runAuditPipeline(parsed, files[0].name, empresaId);
      if (!pipe) throw new Error("Pipeline indisponível (sessão ou serviço).");
      setStage("normalize", "done");
      mark("normalize", tNorm);

      const tAna = performance.now();
      setStage("analyze", "running");
      setResult(pipe);
      setStage("analyze", "done");
      mark("analyze", tAna);

      setTotalMs(Math.round(performance.now() - t0));
      toast.success(`Processado em ${((performance.now() - t0) / 1000).toFixed(1)}s · Quality ${(pipe.scores.quality * 100).toFixed(0)}%`);
    } catch (e: any) {
      const msg = e?.message || "Falha no pipeline.";
      setErrorMsg(msg);
      setStages(prev => {
        const next = { ...prev };
        (Object.keys(next) as StageKey[]).forEach(k => {
          if (next[k] === "running") next[k] = "error";
        });
        return next;
      });
      toast.error(msg);
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="space-y-6">
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
        className="bg-card border-2 border-dashed border-border rounded-xl p-10 text-center hover:border-[hsl(258,90%,66%)] transition-colors"
      >
        <Upload className="w-12 h-12 mx-auto text-[hsl(258,90%,66%)] mb-3" />
        <h3 className="font-semibold text-foreground mb-1">Arraste documentos ou clique para selecionar</h3>
        <p className="text-xs text-muted-foreground mb-4">PDF, XLSX, CSV — Balancete, DRE ou Fluxo de Caixa</p>
        <input
          type="file"
          multiple
          id="file-input"
          className="hidden"
          accept=".pdf,.xlsx,.xls,.csv,.txt,.docx"
          onChange={(e) => e.target.files && setFiles(prev => [...prev, ...Array.from(e.target.files!)])}
        />
        <label htmlFor="file-input">
          <Button asChild variant="outline" size="sm" className="cursor-pointer">
            <span>Selecionar Arquivos</span>
          </Button>
        </label>
        {files.length > 0 && (
          <div className="mt-4 text-left max-w-md mx-auto space-y-1.5">
            {files.map((f, i) => (
              <div key={i} className="flex items-center justify-between gap-2 text-xs text-muted-foreground bg-muted/40 px-3 py-1.5 rounded-md">
                <span className="flex items-center gap-2 truncate"><FileText className="w-3.5 h-3.5 shrink-0" /> {f.name}</span>
                <button
                  onClick={() => setFiles(prev => prev.filter((_, idx) => idx !== i))}
                  className="text-muted-foreground hover:text-destructive"
                  aria-label="Remover"
                >×</button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="grid md:grid-cols-3 gap-4 bg-card rounded-xl border border-border p-5">
        <div className="space-y-1.5">
          <Label className="text-xs">Tipo de documento</Label>
          <Select value={tipo} onValueChange={setTipo}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="balancete">Balancete</SelectItem>
              <SelectItem value="dre">DRE</SelectItem>
              <SelectItem value="fluxo">Fluxo de Caixa</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Empresa</Label>
          <Select value={empresaId} onValueChange={setEmpresaId}>
            <SelectTrigger><SelectValue placeholder={companies.length ? "Selecionar empresa" : "Sem empresas cadastradas"} /></SelectTrigger>
            <SelectContent>
              {companies.map(c => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Período</Label>
          <Input value={periodo} onChange={(e) => setPeriodo(e.target.value)} placeholder="Ex.: 2024-Q4" />
        </div>
      </div>

      <div className="bg-card rounded-xl border border-border p-5 space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 flex-1">
            {(Object.keys(STAGE_LABELS) as StageKey[]).map((k) => {
              const s = stages[k];
              return (
                <div key={k} className="flex items-center gap-2">
                  {s === "done" && <CheckCircle2 className="w-5 h-5 text-[hsl(152,70%,45%)]" />}
                  {s === "running" && <Loader2 className="w-5 h-5 text-[hsl(258,90%,66%)] animate-spin" />}
                  {s === "error" && <XCircle className="w-5 h-5 text-[hsl(0,70%,55%)]" />}
                  {s === "idle" && <div className="w-5 h-5 rounded-full border-2 border-border" />}
                  <span className="text-xs sm:text-sm text-foreground">{STAGE_LABELS[k]}</span>
                </div>
              );
            })}
          </div>
          <Button onClick={startPipeline} disabled={processing} className="bg-[hsl(258,90%,66%)] hover:bg-[hsl(258,80%,55%)] text-white gap-1.5 shrink-0">
            <Sparkles className="w-3.5 h-3.5" /> {processing ? "Processando..." : "Processar com IA"}
          </Button>
        </div>

        {errorMsg && (
          <div className="flex items-start gap-2 text-xs text-[hsl(0,70%,55%)] bg-[hsl(0,70%,55%)]/10 border border-[hsl(0,70%,55%)]/20 rounded-md p-3">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" /> {errorMsg}
          </div>
        )}

        {result && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-border">
            {[
              { label: "OCR", v: result.scores.ocr },
              { label: "Mapeamento", v: result.scores.mapping },
              { label: "Validação", v: result.scores.validation },
              { label: "Quality Score", v: result.scores.quality, hi: true },
            ].map((m, i) => (
              <div key={i} className={`rounded-lg border p-3 ${m.hi ? "border-[hsl(258,90%,66%)]/30 bg-[hsl(258,90%,66%)]/5" : "border-border"}`}>
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{m.label}</div>
                <div className="text-lg font-bold text-foreground">{(m.v * 100).toFixed(0)}%</div>
                <Progress value={m.v * 100} className="h-1 mt-1" />
              </div>
            ))}
            <div className="col-span-2 sm:col-span-4 text-xs text-muted-foreground">
              {result.normalized.length} contas normalizadas · Ativo {result.validation.ativo.toLocaleString("pt-BR")} ·
              Passivo+PL {(result.validation.passivo + result.validation.pl).toLocaleString("pt-BR")} ·
              {result.validation.valid ? " ✅ Balanceado" : ` ⚠️ Diferença ${result.validation.diff.toLocaleString("pt-BR")}`}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// ─── TELA 2 — Validação Inteligente (CORE) ────────────────────
const TabValidacao = () => {
  const [rows, setRows] = useState(mockExtraction);
  const [selected, setSelected] = useState<number | null>(null);

  const updateRow = (id: number, field: string, value: string | number) => {
    setRows(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r));
  };

  const statusBadge = (s: string) => {
    if (s === "ok") return <Badge className="bg-[hsl(152,70%,45%)]/10 text-[hsl(152,70%,45%)] hover:bg-[hsl(152,70%,45%)]/20">🟢 Correto</Badge>;
    if (s === "duvida") return <Badge className="bg-[hsl(38,90%,55%)]/10 text-[hsl(38,90%,55%)] hover:bg-[hsl(38,90%,55%)]/20">🟡 Dúvida</Badge>;
    return <Badge className="bg-[hsl(0,70%,55%)]/10 text-[hsl(0,70%,55%)] hover:bg-[hsl(0,70%,55%)]/20">🔴 Erro</Badge>;
  };

  return (
    <div className="space-y-4">
      <div className="grid lg:grid-cols-[1fr_1.4fr] gap-4">
        {/* Documento original */}
        <div className="bg-card rounded-xl border border-border p-5">
          <div className="flex items-center gap-2 mb-3 text-sm font-semibold text-foreground">
            <FileText className="w-4 h-4 text-[hsl(258,90%,66%)]" /> Documento Original
          </div>
          <div className="aspect-[3/4] bg-muted/30 rounded-lg border border-border flex items-center justify-center text-xs text-muted-foreground">
            <div className="text-center">
              <FileText className="w-12 h-12 mx-auto mb-2 opacity-30" />
              Pré-visualização do PDF/Excel renderizado
            </div>
          </div>
        </div>

        {/* Estrutura extraída */}
        <div className="bg-card rounded-xl border border-border p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Brain className="w-4 h-4 text-[hsl(258,90%,66%)]" /> Estrutura Extraída pela IA
            </div>
            <span className="text-xs text-muted-foreground">{rows.length} linhas</span>
          </div>
          <div className="overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Conta Original</TableHead>
                  <TableHead className="text-xs">Conta Padronizada</TableHead>
                  <TableHead className="text-xs">Categoria</TableHead>
                  <TableHead className="text-xs text-right">Valor</TableHead>
                  <TableHead className="text-xs">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id} className={`cursor-pointer ${selected === r.id ? "bg-[hsl(258,90%,66%)]/5" : ""}`} onClick={() => setSelected(r.id)}>
                    <TableCell className="text-xs">{r.original}</TableCell>
                    <TableCell className="text-xs">
                      <Input value={r.padrao} onChange={(e) => updateRow(r.id, "padrao", e.target.value)} className="h-7 text-xs" />
                    </TableCell>
                    <TableCell className="text-xs">
                      <Input value={r.categoria} onChange={(e) => updateRow(r.id, "categoria", e.target.value)} className="h-7 text-xs" />
                    </TableCell>
                    <TableCell className="text-xs text-right font-mono">{r.valor.toLocaleString("pt-BR")}</TableCell>
                    <TableCell>{statusBadge(r.status)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>

      {/* IA Assistiva */}
      {selected && (
        <div className="bg-[hsl(258,90%,66%)]/5 border border-[hsl(258,90%,66%)]/20 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2 text-sm font-semibold text-foreground">
            <Lightbulb className="w-4 h-4 text-[hsl(258,90%,66%)]" /> Sugestões da IA para a linha selecionada
          </div>
          <div className="grid md:grid-cols-3 gap-2">
            {[
              { label: "Receita Operacional", conf: 92 },
              { label: "Receita Bruta", conf: 87 },
              { label: "Receita de Serviços", conf: 81 },
            ].map((s, i) => (
              <button key={i} className="text-left bg-card border border-border rounded-lg p-3 hover:border-[hsl(258,90%,66%)] transition-colors">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-foreground">{s.label}</span>
                  <span className="text-xs font-mono text-[hsl(258,90%,66%)]">{s.conf}%</span>
                </div>
                <Progress value={s.conf} className="h-1 mt-2" />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Ações */}
      <div className="flex flex-wrap items-center justify-end gap-2 bg-card rounded-xl border border-border p-4">
        <Button variant="outline" size="sm" className="gap-1.5">
          <Edit3 className="w-3.5 h-3.5" /> Corrigir manualmente
        </Button>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={() => toast.success("Aprovado tudo.")}>
          <CheckCircle2 className="w-3.5 h-3.5" /> Aprovar tudo
        </Button>
        <Button
          size="sm"
          className="bg-[hsl(258,90%,66%)] hover:bg-[hsl(258,80%,55%)] text-white gap-1.5"
          onClick={() => toast.success("IA ensinada: dataset + embedding + dicionário atualizados.")}
        >
          <Brain className="w-3.5 h-3.5" /> Ensinar IA com essa correção
        </Button>
      </div>
    </div>
  );
};

// ─── TELA 3 — Aprendizado da IA ───────────────────────────────
const TabAprendizado = () => (
  <div className="space-y-6">
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      {[
        { label: "Documentos aprendidos", value: "847", icon: BookOpen, color: "hsl(258,90%,66%)" },
        { label: "Taxa de acerto", value: "94.7%", icon: Target, color: "hsl(152,70%,45%)" },
        { label: "Evolução (90d)", value: "+18%", icon: TrendingUp, color: "hsl(38,90%,55%)" },
      ].map((k, i) => (
        <div key={i} className="bg-card rounded-xl border border-border p-5">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center mb-3" style={{ background: `${k.color}15` }}>
            <k.icon className="w-5 h-5" style={{ color: k.color }} />
          </div>
          <div className="text-2xl font-bold text-foreground">{k.value}</div>
          <div className="text-xs text-muted-foreground">{k.label}</div>
        </div>
      ))}
    </div>

    <div className="bg-card rounded-xl border border-border overflow-hidden">
      <div className="px-5 py-3 border-b border-border flex items-center justify-between">
        <h4 className="text-sm font-semibold text-foreground">Mapeamentos aprendidos</h4>
        <Button variant="outline" size="sm" className="gap-1.5 text-xs"><Save className="w-3 h-3" /> Fixar selecionados</Button>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="text-xs">Conta Original</TableHead>
            <TableHead className="text-xs">Conta Padronizada</TableHead>
            <TableHead className="text-xs text-right">Frequência</TableHead>
            <TableHead className="text-xs text-right">Confiança</TableHead>
            <TableHead className="text-xs text-right">Ações</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {learningRows.map((r, i) => (
            <TableRow key={i}>
              <TableCell className="text-xs">{r.original}</TableCell>
              <TableCell className="text-xs font-medium text-foreground">{r.padrao}</TableCell>
              <TableCell className="text-xs text-right font-mono">{r.freq}</TableCell>
              <TableCell className="text-xs text-right font-mono text-[hsl(152,70%,45%)]">{r.conf}%</TableCell>
              <TableCell className="text-right">
                <Button variant="ghost" size="icon" className="h-7 w-7"><Edit3 className="w-3.5 h-3.5" /></Button>
                <Button variant="ghost" size="icon" className="h-7 w-7"><Trash2 className="w-3.5 h-3.5" /></Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  </div>
);

// ─── TELA 4 — Dataset & Histórico ─────────────────────────────
const TabDataset = () => (
  <div className="space-y-4">
    <div className="bg-card rounded-xl border border-border overflow-hidden">
      <div className="px-5 py-3 border-b border-border flex items-center justify-between">
        <h4 className="text-sm font-semibold text-foreground">Dataset validado</h4>
        <span className="text-xs text-muted-foreground">{datasetRows.length} documentos</span>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="text-xs">Documento</TableHead>
            <TableHead className="text-xs">Empresa</TableHead>
            <TableHead className="text-xs">Data</TableHead>
            <TableHead className="text-xs text-right">Score</TableHead>
            <TableHead className="text-xs text-right">Ações</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {datasetRows.map((r, i) => (
            <TableRow key={i}>
              <TableCell className="text-xs flex items-center gap-2">
                {r.gold && <Star className="w-3.5 h-3.5 text-[hsl(38,90%,55%)] fill-[hsl(38,90%,55%)]" />}
                {r.doc}
              </TableCell>
              <TableCell className="text-xs">{r.empresa}</TableCell>
              <TableCell className="text-xs text-muted-foreground">{r.data}</TableCell>
              <TableCell className="text-xs text-right font-mono">{r.score}</TableCell>
              <TableCell className="text-right">
                <Button variant="ghost" size="icon" className="h-7 w-7" title="Visualizar diff"><Eye className="w-3.5 h-3.5" /></Button>
                <Button variant="ghost" size="icon" className="h-7 w-7" title="Reprocessar"><RefreshCw className="w-3.5 h-3.5" /></Button>
                <Button variant="ghost" size="icon" className="h-7 w-7" title="Marcar exemplo ouro"><Star className="w-3.5 h-3.5" /></Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  </div>
);

// ─── TELA 5 — Performance da IA ───────────────────────────────
const TabPerformance = () => (
  <div className="space-y-6">
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {[
        { label: "Precisão OCR", value: "98.2%", icon: Cpu, color: "hsl(258,90%,66%)" },
        { label: "Precisão Mapeamento", value: "94.7%", icon: Target, color: "hsl(152,70%,45%)" },
        { label: "Correção Humana", value: "5.3%", icon: Edit3, color: "hsl(38,90%,55%)" },
        { label: "Tempo Médio", value: "2.4s", icon: Zap, color: "hsl(200,90%,50%)" },
      ].map((k, i) => (
        <div key={i} className="bg-card rounded-xl border border-border p-5">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center mb-3" style={{ background: `${k.color}15` }}>
            <k.icon className="w-5 h-5" style={{ color: k.color }} />
          </div>
          <div className="text-2xl font-bold text-foreground">{k.value}</div>
          <div className="text-xs text-muted-foreground">{k.label}</div>
        </div>
      ))}
    </div>

    <div className="grid md:grid-cols-2 gap-4">
      <div className="bg-card rounded-xl border border-border p-5">
        <h4 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-[hsl(258,90%,66%)]" /> Evolução da Precisão
        </h4>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={accuracyTrend}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(214,20%,88%)" />
            <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
            <YAxis domain={[70, 100]} tick={{ fontSize: 11 }} />
            <Tooltip />
            <Line type="monotone" dataKey="precisao" stroke="hsl(258,90%,66%)" strokeWidth={2.5} dot={{ r: 4 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="bg-card rounded-xl border border-border p-5">
        <h4 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-[hsl(38,90%,55%)]" /> Redução de Erros
        </h4>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={errorReduction}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(214,20%,88%)" />
            <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip />
            <Bar dataKey="erros" fill="hsl(38,90%,55%)" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  </div>
);

// ─── Main page ────────────────────────────────────────────────
const GestaoAgentes = () => {
  const navigate = useNavigate();
  return (
    <PlatformLayout>
      <div className="max-w-[1600px] mx-auto px-4 md:px-6 py-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate("/gestor-ia")}>
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold font-serif text-foreground flex items-center gap-2">
                <Brain className="w-6 h-6 text-[hsl(258,90%,66%)]" /> Gestão de Agentes
              </h1>
              <p className="text-sm text-muted-foreground">Human-in-the-Loop visual — treine a IA na leitura de documentos e geração de relatórios.</p>
            </div>
          </div>
          <div className="hidden md:flex items-center gap-2 text-xs text-muted-foreground bg-card border border-border rounded-lg px-3 py-2">
            <Activity className="w-3.5 h-3.5 text-[hsl(152,70%,45%)]" /> Pipeline: OCR → Extração → Normalização → Análise → Aprendizado
          </div>
        </div>

        <Tabs defaultValue="upload">
          <TabsList className="bg-card border border-border h-auto p-1 flex-wrap">
            <TabsTrigger value="upload" className="gap-1.5 data-[state=active]:bg-[hsl(258,90%,66%)] data-[state=active]:text-white text-xs">
              <Upload className="w-3.5 h-3.5" /> Upload & Processamento
            </TabsTrigger>
            <TabsTrigger value="validacao" className="gap-1.5 data-[state=active]:bg-[hsl(258,90%,66%)] data-[state=active]:text-white text-xs">
              <Brain className="w-3.5 h-3.5" /> Validação Inteligente
            </TabsTrigger>
            <TabsTrigger value="aprendizado" className="gap-1.5 data-[state=active]:bg-[hsl(258,90%,66%)] data-[state=active]:text-white text-xs">
              <Lightbulb className="w-3.5 h-3.5" /> Aprendizado da IA
            </TabsTrigger>
            <TabsTrigger value="dataset" className="gap-1.5 data-[state=active]:bg-[hsl(258,90%,66%)] data-[state=active]:text-white text-xs">
              <Database className="w-3.5 h-3.5" /> Dataset & Histórico
            </TabsTrigger>
            <TabsTrigger value="performance" className="gap-1.5 data-[state=active]:bg-[hsl(258,90%,66%)] data-[state=active]:text-white text-xs">
              <Activity className="w-3.5 h-3.5" /> Performance
            </TabsTrigger>
          </TabsList>

          <TabsContent value="upload" className="mt-5"><TabUpload /></TabsContent>
          <TabsContent value="validacao" className="mt-5"><TabValidacao /></TabsContent>
          <TabsContent value="aprendizado" className="mt-5"><TabAprendizado /></TabsContent>
          <TabsContent value="dataset" className="mt-5"><TabDataset /></TabsContent>
          <TabsContent value="performance" className="mt-5"><TabPerformance /></TabsContent>
        </Tabs>
      </div>
    </PlatformLayout>
  );
};

export default GestaoAgentes;
