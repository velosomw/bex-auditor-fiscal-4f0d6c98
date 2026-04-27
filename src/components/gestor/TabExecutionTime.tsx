import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, RefreshCw, Timer, Cpu } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { listCompanies, type Company } from "@/services/companiesService";

interface PipelineDoc {
  id: string;
  file_name: string;
  file_type: string | null;
  status: string;
  created_at: string;
  updated_at: string;
  company_id: string | null;
}

const inferEngine = (fileType: string | null): string => {
  const t = (fileType || "").toLowerCase();
  if (t === "pdf") return "Google Document AI + Gemini 2.5";
  if (["xlsx", "xls", "xlsm", "xlsb", "csv"].includes(t)) return "Gemini 2.5 Flash";
  if (["docx", "doc", "txt", "rtf"].includes(t)) return "Gemini 2.5 Flash";
  return "Gemini 2.5 Flash";
};

const statusVariant = (status: string) => {
  switch (status) {
    case "completed": return "bg-emerald-500/15 text-emerald-700 border-emerald-500/30";
    case "failed":    return "bg-red-500/15 text-red-700 border-red-500/30";
    case "pending":   return "bg-slate-500/15 text-slate-700 border-slate-500/30";
    default:          return "bg-amber-500/15 text-amber-700 border-amber-500/30";
  }
};

const TabExecutionTime = () => {
  const [docs, setDocs] = useState<PipelineDoc[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const [{ data, error }, comps] = await Promise.all([
        supabase
          .from("pipeline_documents")
          .select("id, file_name, file_type, status, created_at, updated_at, company_id")
          .order("created_at", { ascending: false })
          .limit(20),
        listCompanies(),
      ]);
      if (error) throw error;
      setDocs((data || []) as PipelineDoc[]);
      setCompanies(comps);
    } catch (e: any) {
      toast.error("Erro ao carregar tempos de execução", { description: e.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const companyName = (id: string | null) =>
    id ? (companies.find(c => c.id === id)?.name || "—") : "Não vinculada";

  const topEngine = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const d of docs) {
      const e = inferEngine(d.file_type);
      counts[e] = (counts[e] || 0) + 1;
    }
    const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    return entries[0]?.[0] || "—";
  }, [docs]);

  const avgSecs = useMemo(() => {
    const finished = docs.filter(d => d.status === "completed" || d.status === "failed");
    if (!finished.length) return 0;
    const total = finished.reduce((s, d) => {
      const secs = (new Date(d.updated_at).getTime() - new Date(d.created_at).getTime()) / 1000;
      return s + Math.max(0, secs);
    }, 0);
    return total / finished.length;
  }, [docs]);

  return (
    <div className="space-y-4 pt-4">
      <Card className="p-4 bg-card border-border">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-[hsl(258,90%,66%)]/10 flex items-center justify-center">
              <Timer className="w-5 h-5 text-[hsl(258,90%,66%)]" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground">Tempo de Execução</h3>
              <p className="text-sm text-muted-foreground">
                Últimos 20 documentos processados pela plataforma — tempo total da análise (ingestão → conclusão).
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="gap-1.5 text-xs">
              <Cpu className="w-3.5 h-3.5" /> Motor mais usado: <span className="font-semibold ml-1">{topEngine}</span>
            </Badge>
            <Badge variant="outline" className="gap-1.5 text-xs">
              <Timer className="w-3.5 h-3.5" /> Média: <span className="font-semibold ml-1">{avgSecs.toFixed(1)}s</span>
            </Badge>
            <Button variant="outline" size="sm" onClick={load} disabled={loading} className="gap-1.5">
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} /> Atualizar
            </Button>
          </div>
        </div>
      </Card>

      {loading ? (
        <Card className="p-12 bg-card border-border flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </Card>
      ) : docs.length === 0 ? (
        <Card className="p-12 bg-card border-border text-center">
          <p className="text-sm text-muted-foreground">Nenhum documento processado até o momento.</p>
        </Card>
      ) : (
        <Card className="bg-card border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 border-b border-border">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Arquivo</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Criado em</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Empresa</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">Segundos</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">Minutos</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Motor IA</th>
                </tr>
              </thead>
              <tbody>
                {docs.map(doc => {
                  const finished = doc.status === "completed" || doc.status === "failed";
                  const secs = finished
                    ? Math.max(0, (new Date(doc.updated_at).getTime() - new Date(doc.created_at).getTime()) / 1000)
                    : null;
                  const engine = inferEngine(doc.file_type);
                  const linked = !!doc.company_id;
                  return (
                    <tr key={doc.id} className="border-b border-border last:border-0 hover:bg-muted/20">
                      <td className="px-4 py-3 text-foreground font-medium max-w-[320px] truncate" title={doc.file_name}>
                        {doc.file_name}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="outline" className={`text-xs ${statusVariant(doc.status)}`}>
                          {doc.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground text-xs whitespace-nowrap">
                        {new Date(doc.created_at).toLocaleString("pt-BR")}
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {linked ? (
                          <span className="text-foreground">{companyName(doc.company_id)}</span>
                        ) : (
                          <Badge variant="outline" className="text-[10px] bg-amber-500/10 text-amber-700 border-amber-500/30">
                            Não vinculada
                          </Badge>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-xs">
                        {secs === null ? "—" : `${secs.toFixed(1)}s`}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-xs">
                        {secs === null ? "—" : `${(secs / 60).toFixed(2)} min`}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{engine}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
};

export default TabExecutionTime;
