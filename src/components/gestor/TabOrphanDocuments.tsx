import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Loader2, RefreshCw, FileWarning, Link2, PlayCircle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { listCompanies, type Company } from "@/services/companiesService";

interface OrphanDoc {
  id: string;
  file_name: string;
  status: string;
  created_at: string;
  company_id: string | null;
}

const TabOrphanDocuments = () => {
  const [docs, setDocs] = useState<OrphanDoc[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [selection, setSelection] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<Record<string, boolean>>({});

  const load = async () => {
    setLoading(true);
    try {
      const [{ data, error }, comps] = await Promise.all([
        supabase
          .from("pipeline_documents")
          .select("id, file_name, status, created_at, company_id")
          .is("company_id", null)
          .order("created_at", { ascending: false }),
        listCompanies(),
      ]);
      if (error) throw error;
      setDocs((data || []) as OrphanDoc[]);
      setCompanies(comps);
    } catch (e: any) {
      toast.error("Erro ao carregar órfãos", { description: e.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const reprocess = async (doc: OrphanDoc) => {
    const companyId = selection[doc.id];
    if (!companyId) {
      toast.error("Selecione a empresa antes de reprocessar");
      return;
    }
    setBusy(b => ({ ...b, [doc.id]: true }));
    try {
      // 1. Vincula company_id
      const { error: upErr } = await supabase
        .from("pipeline_documents")
        .update({ company_id: companyId, status: "normalizing" })
        .eq("id", doc.id);
      if (upErr) throw upErr;

      // 2. Dispara pipeline (reaproveita document_id)
      const { error: fnErr } = await supabase.functions.invoke("audit-pipeline-process", {
        body: { document_id: doc.id, company_id: companyId, file_name: doc.file_name },
      });
      if (fnErr) throw fnErr;

      toast.success("Documento reprocessado", { description: doc.file_name });
      setDocs(d => d.filter(x => x.id !== doc.id));
    } catch (e: any) {
      toast.error("Falha ao reprocessar", { description: e.message });
    } finally {
      setBusy(b => ({ ...b, [doc.id]: false }));
    }
  };

  const reprocessAll = async () => {
    const pending = docs.filter(d => selection[d.id]);
    if (pending.length === 0) {
      toast.error("Nenhuma empresa selecionada", { description: "Selecione a empresa de pelo menos 1 documento." });
      return;
    }
    for (const d of pending) await reprocess(d);
  };

  return (
    <div className="space-y-4 pt-4">
      <Card className="p-4 bg-card border-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-[hsl(38,90%,55%)]/10 flex items-center justify-center">
              <FileWarning className="w-5 h-5 text-[hsl(38,90%,55%)]" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground">Documentos Órfãos</h3>
              <p className="text-sm text-muted-foreground">
                Pipeline documents sem <code className="text-xs">company_id</code> — não aparecem no Modelo Matemático até serem vinculados.
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={load} disabled={loading} className="gap-1.5">
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} /> Atualizar
            </Button>
            <Button
              size="sm"
              onClick={reprocessAll}
              disabled={loading || docs.length === 0}
              className="gap-1.5 bg-[#8B5CF6] hover:bg-[hsl(258,90%,60%)] text-white"
            >
              <PlayCircle className="w-4 h-4" /> Reprocessar selecionados
            </Button>
          </div>
        </div>
      </Card>

      {loading ? (
        <Card className="p-12 bg-card border-border flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </Card>
      ) : docs.length === 0 ? (
        <Card className="p-12 bg-card border-border flex flex-col items-center justify-center text-center gap-2">
          <CheckCircle2 className="w-10 h-10 text-[hsl(152,70%,45%)]" />
          <h4 className="font-semibold text-foreground">Nenhum documento órfão</h4>
          <p className="text-sm text-muted-foreground">Todos os documentos do pipeline estão vinculados a uma empresa.</p>
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
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">Ação</th>
                </tr>
              </thead>
              <tbody>
                {docs.map(doc => (
                  <tr key={doc.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-3 text-foreground font-medium">{doc.file_name}</td>
                    <td className="px-4 py-3">
                      <Badge variant="outline" className="text-xs">{doc.status}</Badge>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">
                      {new Date(doc.created_at).toLocaleString("pt-BR")}
                    </td>
                    <td className="px-4 py-3 min-w-[240px]">
                      <Select
                        value={selection[doc.id] || ""}
                        onValueChange={v => setSelection(s => ({ ...s, [doc.id]: v }))}
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue placeholder="Selecione a empresa..." />
                        </SelectTrigger>
                        <SelectContent>
                          {companies.map(c => (
                            <SelectItem key={c.id} value={c.id} className="text-xs">
                              {c.name}{c.cnpj ? ` — ${c.cnpj}` : ""}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={!selection[doc.id] || busy[doc.id]}
                        onClick={() => reprocess(doc)}
                        className="gap-1.5"
                      >
                        {busy[doc.id]
                          ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          : <Link2 className="w-3.5 h-3.5" />}
                        Vincular & Reprocessar
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
};

export default TabOrphanDocuments;
