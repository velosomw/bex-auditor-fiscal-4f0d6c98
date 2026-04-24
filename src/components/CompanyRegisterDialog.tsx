import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Building2, Loader2 } from "lucide-react";
import { createCompany, type Company } from "@/services/companiesService";
import { toast } from "@/hooks/use-toast";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (company: Company) => void;
  /** Vincular a empresa criada à contabilidade do usuário logado */
  accountingFirmId?: string | null;
}

const CompanyRegisterDialog = ({ open, onOpenChange, onCreated, accountingFirmId }: Props) => {
  const [name, setName] = useState("");
  const [cnpj, setCnpj] = useState("");
  const [city, setCity] = useState("");
  const [contactName, setContactName] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setName(""); setCnpj(""); setCity(""); setContactName(""); setPhone("");
  };

  const handleSave = async () => {
    if (!name.trim()) {
      toast({ title: "Razão Social/Nome Fantasia é obrigatório", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const c = await createCompany({
        name: name.trim(),
        cnpj: cnpj.trim(),
        city: city.trim(),
        contact_name: contactName.trim(),
        phone: phone.trim(),
        accounting_firm_id: accountingFirmId || null,
      });
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
      <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="w-5 h-5 text-[hsl(217,91%,50%)]" />
            Cadastrar Empresa-Cliente
          </DialogTitle>
          <DialogDescription>
            A empresa ficará vinculada ao seu perfil de contabilidade.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-2">
          <div className="space-y-1.5 md:col-span-2">
            <Label htmlFor="rname">Razão Social ou Nome Fantasia *</Label>
            <Input id="rname" value={name} onChange={e => setName(e.target.value)} placeholder="Ex: Acme Comércio Ltda." maxLength={150} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rcnpj">CNPJ</Label>
            <Input id="rcnpj" value={cnpj} onChange={e => setCnpj(e.target.value)} placeholder="00.000.000/0000-00" maxLength={18} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rcity">Cidade</Label>
            <Input id="rcity" value={city} onChange={e => setCity(e.target.value)} placeholder="Ex: São Paulo" maxLength={100} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rresp">Responsável</Label>
            <Input id="rresp" value={contactName} onChange={e => setContactName(e.target.value)} placeholder="Nome do responsável" maxLength={100} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rphone">Telefone Celular</Label>
            <Input id="rphone" value={phone} onChange={e => setPhone(e.target.value)} placeholder="(11) 99999-9999" maxLength={20} />
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
