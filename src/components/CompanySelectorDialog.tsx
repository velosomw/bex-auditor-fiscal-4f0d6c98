import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Building2, Plus, Loader2 } from "lucide-react";
import { listCompanies, createCompany, type Company } from "@/services/companiesService";
import { canGenerateForCompany, getAllCompaniesQuota, isQuotaExhausted, type CompanyQuota } from "@/services/reportLimitsService";
import { toast } from "@/hooks/use-toast";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (company: Company) => void;
}

const CompanySelectorDialog = ({ open, onOpenChange, onConfirm }: Props) => {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [quotaMap, setQuotaMap] = useState<Map<string, CompanyQuota>>(new Map());
  const [selectedId, setSelectedId] = useState<string>("");
  const [mode, setMode] = useState<"select" | "create">("select");
  const [name, setName] = useState("");
  const [cnpj, setCnpj] = useState("");
  const [sector, setSector] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const defaultQuota = quotaMap.get("__default__");
  const quotaFor = (id: string) => quotaMap.get(id) ?? defaultQuota;
  const isBlocked = (id: string) => isQuotaExhausted(quotaFor(id));
  const availableCompanies = companies.filter(c => !isBlocked(c.id));
  const allBlocked = companies.length > 0 && availableCompanies.length === 0;

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    Promise.all([
      listCompanies(),
      getAllCompaniesQuota().catch(() => new Map<string, CompanyQuota>()),
    ])
      .then(([list, qmap]) => {
        setCompanies(list);
        setQuotaMap(qmap);
        if (list.length === 0) setMode("create");
      })
      .catch(e => toast({ title: "Erro ao carregar empresas", description: e.message, variant: "destructive" }))
      .finally(() => setLoading(false));
  }, [open]);

  const handleConfirmSelect = async () => {
    const c = companies.find(c => c.id === selectedId);
    if (!c) return;
    const { allowed, reason, quota } = await canGenerateForCompany(c.id, "resumido");
    if (!allowed) {
      toast({
        title: "Cota mensal esgotada",
        description: reason ?? `Resumidos: ${quota.resumido.used}/${quota.resumido.limit} · Completos: ${quota.completo.used}/${quota.completo.limit}. Solicite ao Gestor IA cota extra.`,
        variant: "destructive",
      });
      return;
    }
    onConfirm(c);
    onOpenChange(false);
  };

  const handleCreate = async () => {
    if (!name.trim()) {
      toast({ title: "Nome é obrigatório", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const c = await createCompany({ name: name.trim(), cnpj: cnpj.trim(), sector: sector.trim() });
      toast({ title: "Empresa cadastrada", description: c.name });
      onConfirm(c);
      onOpenChange(false);
      setName(""); setCnpj(""); setSector("");
    } catch (e: any) {
      toast({ title: "Erro ao cadastrar", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="w-5 h-5 text-[hsl(217,91%,50%)]" />
            Selecionar Empresa
          </DialogTitle>
          <DialogDescription>
            Toda nova auditoria deve estar vinculada a uma empresa. Os relatórios gerados ficarão associados a ela.
          </DialogDescription>
        </DialogHeader>

        {mode === "select" ? (
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Empresa</Label>
              {loading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                  <Loader2 className="w-4 h-4 animate-spin" /> Carregando...
                </div>
              ) : (
                <Select value={selectedId} onValueChange={setSelectedId}>
                  <SelectTrigger><SelectValue placeholder="Selecione uma empresa" /></SelectTrigger>
                  <SelectContent>
                    {companies.map(c => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}{c.cnpj ? ` — ${c.cnpj}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            <Button variant="outline" size="sm" className="w-full gap-1.5" onClick={() => setMode("create")}>
              <Plus className="w-4 h-4" /> Cadastrar nova empresa
            </Button>
          </div>
        ) : (
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="cname">Nome da empresa *</Label>
              <Input id="cname" value={name} onChange={e => setName(e.target.value)} placeholder="Ex: Acme Indústria S.A." />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ccnpj">CNPJ</Label>
              <Input id="ccnpj" value={cnpj} onChange={e => setCnpj(e.target.value)} placeholder="00.000.000/0000-00" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="csector">Setor</Label>
              <Input id="csector" value={sector} onChange={e => setSector(e.target.value)} placeholder="Ex: Indústria, Varejo, Serviços" />
            </div>
            {companies.length > 0 && (
              <Button variant="ghost" size="sm" className="w-full" onClick={() => setMode("select")}>
                ← Voltar para seleção
              </Button>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          {mode === "select" ? (
            <Button onClick={handleConfirmSelect} disabled={!selectedId} className="bg-[hsl(217,91%,50%)] hover:bg-[hsl(217,91%,45%)] text-white">
              Iniciar Auditoria
            </Button>
          ) : (
            <Button onClick={handleCreate} disabled={saving} className="bg-[hsl(217,91%,50%)] hover:bg-[hsl(217,91%,45%)] text-white">
              {saving && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />} Cadastrar e Iniciar
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default CompanySelectorDialog;
