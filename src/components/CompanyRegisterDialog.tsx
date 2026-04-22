import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Building2, Loader2 } from "lucide-react";
import { createCompany, type Company } from "@/services/companiesService";
import { toast } from "@/hooks/use-toast";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (company: Company) => void;
}

const SECTORS = ["Indústria", "Varejo", "Serviços", "Tecnologia", "Construção", "Agro", "Saúde", "Financeiro", "Educação", "Outro"];
const UF = ["AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"];

const CompanyRegisterDialog = ({ open, onOpenChange, onCreated }: Props) => {
  const [name, setName] = useState("");
  const [cnpj, setCnpj] = useState("");
  const [sector, setSector] = useState("");
  const [uf, setUf] = useState("");
  const [city, setCity] = useState("");
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setName(""); setCnpj(""); setSector(""); setUf(""); setCity("");
  };

  const handleSave = async () => {
    if (!name.trim()) { toast({ title: "Nome é obrigatório", variant: "destructive" }); return; }
    setSaving(true);
    try {
      const sectorComposed = [sector, uf && city ? `${city}/${uf}` : uf].filter(Boolean).join(" — ");
      const c = await createCompany({ name: name.trim(), cnpj: cnpj.trim(), sector: sectorComposed });
      // Persist extra metadata locally (created_by side; backend table não tem campos extras)
      try {
        const key = "bex_company_meta";
        const meta = JSON.parse(localStorage.getItem(key) || "{}");
        meta[c.id] = { uf, city };
        localStorage.setItem(key, JSON.stringify(meta));
      } catch {}
      toast({ title: "Empresa cadastrada", description: c.name });
      onCreated?.(c);
      reset();
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: "Erro ao cadastrar", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="w-5 h-5 text-[hsl(217,91%,50%)]" />
            Cadastrar Empresa
          </DialogTitle>
          <DialogDescription>
            Cadastro rápido da empresa interna. Os dados completos são preenchidos pela própria empresa no cadastro público.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-2">
          <div className="space-y-1.5 md:col-span-2">
            <Label htmlFor="rname">Razão Social *</Label>
            <Input id="rname" value={name} onChange={e => setName(e.target.value)} placeholder="Ex: Acme Indústria S.A." />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rcnpj">CNPJ</Label>
            <Input id="rcnpj" value={cnpj} onChange={e => setCnpj(e.target.value)} placeholder="00.000.000/0000-00" />
          </div>
          <div className="space-y-1.5">
            <Label>Setor</Label>
            <Select value={sector} onValueChange={setSector}>
              <SelectTrigger><SelectValue placeholder="Selecione o setor" /></SelectTrigger>
              <SelectContent>
                {SECTORS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>UF</Label>
            <Select value={uf} onValueChange={setUf}>
              <SelectTrigger><SelectValue placeholder="UF" /></SelectTrigger>
              <SelectContent className="max-h-60">
                {UF.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rcity">Cidade</Label>
            <Input id="rcity" value={city} onChange={e => setCity(e.target.value)} placeholder="Ex: São Paulo" />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving} className="bg-[hsl(217,91%,50%)] hover:bg-[hsl(217,91%,45%)] text-white">
            {saving && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />} Cadastrar Empresa
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default CompanyRegisterDialog;
