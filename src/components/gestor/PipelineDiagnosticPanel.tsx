import { useState } from "react";
import { Activity, CheckCircle2, XCircle, Loader2, PlayCircle, CircleDashed, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { runPipelineDiagnostic, type DiagnosticStep, type DiagnosticResult } from "@/services/pipelineDiagnosticService";

interface Props {
  onComplete?: () => void;
}

const StepIcon = ({ status }: { status: DiagnosticStep["status"] }) => {
  if (status === "running") return <Loader2 className="w-4 h-4 animate-spin" style={{ color: "hsl(217,91%,50%)" }} />;
  if (status === "ok") return <CheckCircle2 className="w-4 h-4" style={{ color: "hsl(152,70%,45%)" }} />;
  if (status === "fail") return <XCircle className="w-4 h-4" style={{ color: "hsl(0,80%,55%)" }} />;
  return <CircleDashed className="w-4 h-4 text-muted-foreground" />;
};

export default function PipelineDiagnosticPanel({ onComplete }: Props) {
  const [steps, setSteps] = useState<DiagnosticStep[] | null>(null);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<DiagnosticResult | null>(null);

  const handleRun = async () => {
    setRunning(true);
    setResult(null);
    setSteps(null);
    try {
      const res = await runPipelineDiagnostic((s) => setSteps(s));
      setResult(res);
      if (res.success) {
        const acc = res.quality_score != null ? `${(res.quality_score * 100).toFixed(1)}%` : "—";
        toast.success(`Diagnóstico OK · quality_score ${acc}`);
        onComplete?.();
      } else {
        toast.error(`Diagnóstico falhou: ${res.error || "erro desconhecido"}`);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro inesperado");
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="bg-card rounded-xl border border-border p-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: "hsla(217,91%,50%,0.1)" }}>
            <Activity className="w-5 h-5" style={{ color: "hsl(217,91%,50%)" }} />
          </div>
          <div>
            <h3 className="font-semibold text-sm text-foreground">Diagnóstico do Pipeline IA</h3>
            <p className="text-xs text-muted-foreground mt-0.5 max-w-xl">
              Executa um upload sintético end-to-end (seed → OCR → classify → extração → validação)
              e valida atualização dos KPIs e do gráfico de acurácia.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {steps && !running && (
            <Button
              onClick={() => { setSteps(null); setResult(null); }}
              variant="outline"
              size="sm"
              className="gap-1.5"
            >
              <ChevronUp className="w-3.5 h-3.5" /> Recolher
            </Button>
          )}
          <Button
            onClick={handleRun}
            disabled={running}
            className="bg-[hsl(258,90%,66%)] hover:bg-[hsl(258,80%,55%)] text-white gap-1.5"
            size="sm"
          >
            {running ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <PlayCircle className="w-3.5 h-3.5" />}
            {running ? "Executando…" : "Executar diagnóstico"}
          </Button>
        </div>
      </div>

      {steps && (
        <div className="mt-5 border-t border-border pt-4 space-y-2">
          {steps.map((s, i) => (
            <div key={i} className="flex items-start gap-3 text-sm">
              <div className="mt-0.5"><StepIcon status={s.status} /></div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className={`font-medium ${s.status === "fail" ? "text-[hsl(0,80%,55%)]" : "text-foreground"}`}>
                    {i + 1}. {s.name}
                  </span>
                  {s.duration_ms != null && (
                    <span className="text-[10px] text-muted-foreground tabular-nums">{s.duration_ms} ms</span>
                  )}
                </div>
                {s.detail && (
                  <div className={`text-xs mt-0.5 ${s.status === "fail" ? "text-[hsl(0,80%,55%)]" : "text-muted-foreground"}`}>
                    {s.detail}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {result?.success && (
        <div className="mt-4 rounded-lg border border-[hsl(152,70%,45%)]/30 bg-[hsl(152,70%,45%)]/5 p-3 text-xs">
          <div className="font-semibold text-[hsl(152,70%,45%)] flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5" /> Pipeline saudável
          </div>
          <div className="text-muted-foreground mt-1">
            analysis_id: <span className="font-mono">{result.analysis_id?.slice(0, 8)}…</span> ·
            doc: <span className="font-mono">{result.document_id?.slice(0, 8)}…</span> ·
            KPIs e gráfico de acurácia recarregados.
          </div>
        </div>
      )}

      {result && !result.success && (
        <div className="mt-4 rounded-lg border border-[hsl(0,80%,55%)]/30 bg-[hsl(0,80%,55%)]/5 p-3 text-xs">
          <div className="font-semibold text-[hsl(0,80%,55%)] flex items-center gap-1.5">
            <XCircle className="w-3.5 h-3.5" /> Falha: {result.error}
          </div>
        </div>
      )}
    </div>
  );
}
