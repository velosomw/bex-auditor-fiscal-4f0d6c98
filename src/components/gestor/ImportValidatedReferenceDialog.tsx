import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { UploadCloud, FileCheck2, Loader2, BookOpenCheck } from "lucide-react";
import { parseFile, type ParsedFinancialData } from "@/services/auditAIService";
import { supabase } from "@/integrations/supabase/client";

const ImportValidatedReferenceDialog = () => {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [notes, setNotes] = useState("");
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState<ParsedFinancialData | null>(null);

  const reset = () => { setFile(null); setNotes(""); setPreview(null); };

  const handleFile = async (f: File) => {
    setFile(f);
    setPreview(null);
    setParsing(true);
    try {
      const parsed = await parseFile(f);
      setPreview(parsed);
      toast.success(`Documento lido: ${parsed.balanco?.length || 0} contas (Balanço) + ${parsed.dre?.length || 0} (DRE)`);
    } catch (e) {
      console.error(e);
      toast.error("Falha ao ler o documento. Verifique o formato (XLSX, CSV ou PDF).");
      setFile(null);
    } finally {
      setParsing(false);
    }
  };

  const handleSave = async () => {
    if (!file || !preview) return toast.error("Carregue e processe um documento primeiro.");
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { toast.error("Sessão expirada. Faça login novamente."); return; }

      const input_json = {
        file_name: file.name,
        file_size: file.size,
        file_type: file.type || file.name.split(".").pop(),
        document_type: preview.documentType || "balancete",
        years: preview.years || [],
      };

      const output_corrected = {
        balanco: preview.balanco || [],
        dre: preview.dre || [],
        ocrScore: preview.ocrScore ?? 0.99,
        validated_at: new Date().toISOString(),
      };

      const { error } = await supabase.from("dataset_validated").insert({
        corrected_by: user.id,
        input_json,
        output_corrected,
        notes: notes.trim() || `Referência validada manualmente: ${file.name}`,
      });

      if (error) throw error;
      toast.success("Referência validada salva. RAG semântico atualizado.");
      setOpen(false);
      reset();
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || "Erro ao salvar referência validada.");
    } finally {
      setSaving(false);
    }
  };

  const totalContas = (preview?.balanco?.length || 0) + (preview?.dre?.length || 0);

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="gap-1.5 border-[#8B5CF6]/30 text-[#8B5CF6] hover:bg-[#8B5CF6]/10">
          <BookOpenCheck className="w-3.5 h-3.5" /> Importar referência validada
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BookOpenCheck className="w-4 h-4 text-[#8B5CF6]" />
            Importar referência validada (RAG semântico)
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="rounded-lg border border-dashed border-border bg-muted/20 p-5 text-center">
            <UploadCloud className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
            <p className="text-xs text-muted-foreground mb-3">
              Envie um balancete-modelo já validado (XLSX, CSV ou PDF). Será usado como referência
              <strong className="text-foreground"> few-shot </strong> pela IA em auditorias futuras.
            </p>
            <Input
              type="file"
              accept=".xlsx,.xls,.csv,.pdf"
              onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
              className="text-xs"
              disabled={parsing || saving}
            />
          </div>

          {parsing && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" /> Processando documento...
            </div>
          )}

          {preview && !parsing && (
            <div className="rounded-lg border border-border bg-card p-3 space-y-2">
              <div className="flex items-center gap-2 text-xs font-medium text-foreground">
                <FileCheck2 className="w-4 h-4 text-[hsl(152,70%,45%)]" /> {file?.name}
              </div>
              <div className="flex flex-wrap gap-2 text-[11px]">
                <Badge variant="outline">{preview.documentType || "balancete"}</Badge>
                <Badge variant="outline">{preview.balanco?.length || 0} contas balanço</Badge>
                <Badge variant="outline">{preview.dre?.length || 0} contas DRE</Badge>
                <Badge variant="outline">Acurácia OCR: {((preview.ocrScore ?? 0.99) * 100).toFixed(0)}%</Badge>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Total de {totalContas} linhas estruturadas serão indexadas no <code className="bg-muted px-1 rounded">dataset_validated</code>.
              </p>
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="text-xs">Anotações (opcional)</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ex.: Balancete de referência cliente X, exercício 2024, plano de contas BR padrão."
              className="text-xs min-h-[70px]"
              disabled={saving}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => { setOpen(false); reset(); }} disabled={saving}>
            Cancelar
          </Button>
          <Button
            className="bg-[#8B5CF6] hover:bg-[#7C3AED] text-white gap-1.5"
            onClick={handleSave}
            disabled={!preview || saving || parsing}
          >
            {saving ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Salvando...</> : <><BookOpenCheck className="w-3.5 h-3.5" /> Salvar referência</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ImportValidatedReferenceDialog;
