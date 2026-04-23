import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { FileUp, Loader2, CheckCircle2, XCircle, FileText, Sparkles } from "lucide-react";

interface TesterProps {
  projectId?: string;
  location?: string;
  processorId?: string;
}

interface OcrResult {
  ok: boolean;
  pipeline: string;
  ocr: { pages: number; chars: number };
  extracted: {
    pdfType?: string;
    documentInfo?: { empresa?: string; periodo?: string; tipo?: string };
    years?: string[];
    balanco?: unknown[];
    dre?: unknown[];
  };
}

const DocumentAITester = ({ projectId, location, processorId }: TesterProps) => {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<OcrResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rawText, setRawText] = useState<string>("");

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 20 * 1024 * 1024) {
      toast.error("Arquivo muito grande (máx 20 MB).");
      return;
    }
    setFile(f);
    setResult(null);
    setError(null);
  };

  const fileToBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        resolve(dataUrl.split(",")[1]); // strip prefix
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  const runTest = async () => {
    if (!file) {
      toast.error("Selecione um arquivo PDF primeiro.");
      return;
    }
    if (!projectId || !processorId) {
      toast.error("Preencha Project ID e Processor ID antes de testar.");
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);
    setRawText("");

    try {
      const fileBase64 = await fileToBase64(file);
      const { data, error: invokeError } = await supabase.functions.invoke(
        "document-ai-process",
        {
          body: {
            fileBase64,
            fileName: file.name,
            mimeType: file.type || "application/pdf",
            projectId,
            location: location || "us",
            processorId,
          },
        },
      );

      if (invokeError) throw new Error(invokeError.message);
      if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);

      const ocrResult = data as OcrResult;
      setResult(ocrResult);

      // Construir prévia do texto a partir das contas extraídas (já vem estruturado)
      const balanco = ocrResult.extracted?.balanco ?? [];
      const dre = ocrResult.extracted?.dre ?? [];
      const preview = [
        `📄 Tipo: ${ocrResult.extracted?.pdfType || "—"}`,
        `🏢 Empresa: ${ocrResult.extracted?.documentInfo?.empresa || "—"}`,
        `📅 Período: ${ocrResult.extracted?.documentInfo?.periodo || "—"}`,
        `📊 Categoria: ${ocrResult.extracted?.documentInfo?.tipo || "—"}`,
        `📆 Anos detectados: ${(ocrResult.extracted?.years || []).join(", ") || "—"}`,
        ``,
        `── ${balanco.length} linhas de Balanço ──`,
        ...balanco.slice(0, 10).map((r: any) => `  ${r.conta} · ${r.descricao}`),
        ``,
        `── ${dre.length} linhas de DRE ──`,
        ...dre.slice(0, 10).map((r: any) => `  ${r.conta} · ${r.descricao}`),
      ].join("\n");
      setRawText(preview);

      toast.success(`OCR ok: ${ocrResult.ocr.pages} páginas, ${ocrResult.ocr.chars} caracteres`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erro desconhecido";
      setError(msg);
      toast.error("Falha no teste: " + msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-3 pt-3 border-t border-border">
      <div className="flex items-center gap-2">
        <Sparkles className="w-4 h-4 text-[hsl(200,90%,50%)]" />
        <Label className="text-xs font-bold uppercase tracking-wide">Teste de OCR ao vivo</Label>
      </div>

      <div className="grid md:grid-cols-[1fr_auto] gap-2 items-end">
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold">Arquivo PDF de teste</Label>
          <Input
            type="file"
            accept="application/pdf,.pdf"
            onChange={handleFile}
            className="text-xs file:mr-3 file:rounded file:border-0 file:bg-muted file:px-2 file:py-1 file:text-xs"
          />
          {file && (
            <p className="text-[11px] text-muted-foreground">
              <FileText className="w-3 h-3 inline mr-1" />
              {file.name} · {(file.size / 1024).toFixed(1)} KB
            </p>
          )}
        </div>
        <Button
          size="sm"
          onClick={runTest}
          disabled={loading || !file}
          className="gap-1.5 bg-[hsl(200,90%,50%)] hover:bg-[hsl(200,90%,42%)] text-white"
        >
          {loading ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Processando…
            </>
          ) : (
            <>
              <FileUp className="w-3.5 h-3.5" /> Executar OCR
            </>
          )}
        </Button>
      </div>

      {/* Result panel */}
      {error && (
        <div className="bg-destructive/10 border border-destructive/30 rounded-md p-3 text-xs flex items-start gap-2">
          <XCircle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
          <div>
            <strong className="text-destructive">Erro:</strong>
            <pre className="mt-1 whitespace-pre-wrap font-mono text-[11px] text-destructive/90">{error}</pre>
          </div>
        </div>
      )}

      {result && (
        <div className="space-y-2">
          <div className="bg-[hsl(152,70%,45%)]/10 border border-[hsl(152,70%,45%)]/30 rounded-md p-3 text-xs flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 text-[hsl(152,70%,45%)] shrink-0 mt-0.5" />
            <div className="flex-1">
              <strong className="text-[hsl(152,70%,45%)]">OCR concluído com sucesso</strong>
              <div className="grid grid-cols-3 gap-2 mt-2">
                <div className="bg-card rounded p-2">
                  <div className="text-[10px] uppercase text-muted-foreground">Páginas</div>
                  <div className="text-base font-bold">{result.ocr.pages}</div>
                </div>
                <div className="bg-card rounded p-2">
                  <div className="text-[10px] uppercase text-muted-foreground">Caracteres</div>
                  <div className="text-base font-bold">{result.ocr.chars.toLocaleString()}</div>
                </div>
                <div className="bg-card rounded p-2">
                  <div className="text-[10px] uppercase text-muted-foreground">Pipeline</div>
                  <div className="text-[10px] font-mono mt-1 leading-tight">{result.pipeline}</div>
                </div>
              </div>
            </div>
          </div>

          <details className="bg-muted/30 rounded-md border border-border">
            <summary className="px-3 py-2 text-xs font-semibold cursor-pointer hover:bg-muted/50">
              📋 Prévia da estrutura extraída
            </summary>
            <pre className="px-3 py-2 text-[11px] font-mono whitespace-pre-wrap max-h-64 overflow-auto border-t border-border">
              {rawText}
            </pre>
          </details>

          <details className="bg-muted/30 rounded-md border border-border">
            <summary className="px-3 py-2 text-xs font-semibold cursor-pointer hover:bg-muted/50">
              🔍 JSON completo
            </summary>
            <pre className="px-3 py-2 text-[11px] font-mono whitespace-pre-wrap max-h-64 overflow-auto border-t border-border">
              {JSON.stringify(result.extracted, null, 2)}
            </pre>
          </details>
        </div>
      )}
    </div>
  );
};

export default DocumentAITester;
