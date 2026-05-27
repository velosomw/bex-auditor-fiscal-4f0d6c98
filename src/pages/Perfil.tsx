import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, User, Loader2, Save, CheckCircle2 } from "lucide-react";
import PlatformLayout from "@/components/PlatformLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useUser } from "@/contexts/UserContext";

type ProfileForm = {
  full_name: string;
  company_name: string;
  razao_social: string;
  cnpj: string;
  address: string;
  phone_fixed: string;
  whatsapp: string;
};

const empty: ProfileForm = {
  full_name: "",
  company_name: "",
  razao_social: "",
  cnpj: "",
  address: "",
  phone_fixed: "",
  whatsapp: "",
};

const Perfil = () => {
  const navigate = useNavigate();
  const { supabaseUser } = useUser();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<ProfileForm>(empty);
  const [required, setRequired] = useState(false);
  const [completedAt, setCompletedAt] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      if (!supabaseUser) return;
      const { data, error } = await supabase
        .from("profiles")
        .select("full_name, company_name, razao_social, cnpj, address, phone_fixed, whatsapp, profile_required, profile_completed_at")
        .eq("user_id", supabaseUser.id)
        .maybeSingle();
      if (error) {
        toast.error("Erro ao carregar perfil: " + error.message);
      } else if (data) {
        setForm({
          full_name: data.full_name || "",
          company_name: (data as any).company_name || "",
          razao_social: (data as any).razao_social || "",
          cnpj: (data as any).cnpj || "",
          address: (data as any).address || "",
          phone_fixed: (data as any).phone_fixed || "",
          whatsapp: (data as any).whatsapp || "",
        });
        setRequired(!!(data as any).profile_required);
        setCompletedAt((data as any).profile_completed_at || null);
      }
      setLoading(false);
    };
    void load();
  }, [supabaseUser]);

  const update = (k: keyof ProfileForm) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const handleSave = async () => {
    if (!supabaseUser) return;
    setSaving(true);
    const hasMinimal = !!(form.company_name && form.cnpj);
    const { error } = await supabase
      .from("profiles")
      .update({
        full_name: form.full_name,
        company_name: form.company_name || null,
        razao_social: form.razao_social || null,
        cnpj: form.cnpj || null,
        address: form.address || null,
        phone_fixed: form.phone_fixed || null,
        whatsapp: form.whatsapp || null,
        ...(hasMinimal ? { profile_completed_at: new Date().toISOString() } : {}),
      } as any)
      .eq("user_id", supabaseUser.id);
    setSaving(false);
    if (error) {
      toast.error("Erro ao salvar: " + error.message);
    } else {
      toast.success("Perfil atualizado com sucesso");
      if (hasMinimal) setCompletedAt(new Date().toISOString());
    }
  };

  return (
    <PlatformLayout>
      <div className="max-w-3xl mx-auto p-6 space-y-6">
        <button
          onClick={() => navigate("/user")}
          className="flex items-center gap-2 text-[hsl(217,91%,50%)] hover:text-[hsl(217,91%,40%)] transition-colors text-sm"
        >
          <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-[hsl(217,91%,50%)] text-white">
            <ArrowLeft className="w-4 h-4" />
          </span>
          Voltar para Minha Área
        </button>

        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2"><User className="w-6 h-6 text-[hsl(217,91%,50%)]" /> Perfil</h1>
            <p className="text-muted-foreground text-sm">Dados da empresa e do administrador da conta</p>
          </div>
          {required && !completedAt && (
            <Badge className="bg-amber-500/15 text-amber-700 border border-amber-500/30">Cadastro pendente</Badge>
          )}
          {completedAt && (
            <Badge className="bg-emerald-500/15 text-emerald-700 border border-emerald-500/30 gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" /> Cadastro completo
            </Badge>
          )}
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Dados da Empresa</CardTitle>
            <CardDescription>
              Todos os campos são opcionais. A validação de CNPJ e CRC via integrações será ativada em breve para liberar
              recursos avançados da plataforma.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {loading ? (
              <div className="py-10 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></div>
            ) : (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2 md:col-span-2">
                    <Label>Nome do Administrador</Label>
                    <Input value={form.full_name} onChange={update("full_name")} placeholder="Seu nome completo" />
                  </div>
                  <div className="space-y-2">
                    <Label>Escritório / Contabilidade</Label>
                    <Input value={form.company_name} onChange={update("company_name")} placeholder="Nome fantasia" />
                  </div>
                  <div className="space-y-2">
                    <Label>Razão Social</Label>
                    <Input value={form.razao_social} onChange={update("razao_social")} placeholder="Razão social completa" />
                  </div>
                  <div className="space-y-2">
                    <Label>CNPJ</Label>
                    <Input value={form.cnpj} onChange={update("cnpj")} placeholder="00.000.000/0000-00" />
                  </div>
                  <div className="space-y-2">
                    <Label>Telefone Fixo</Label>
                    <Input value={form.phone_fixed} onChange={update("phone_fixed")} placeholder="(00) 0000-0000" />
                  </div>
                  <div className="space-y-2">
                    <Label>WhatsApp</Label>
                    <Input value={form.whatsapp} onChange={update("whatsapp")} placeholder="(00) 90000-0000" />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label>Endereço</Label>
                    <Input value={form.address} onChange={update("address")} placeholder="Rua, número, bairro, cidade/UF, CEP" />
                  </div>
                </div>
                <div className="flex justify-end">
                  <Button onClick={handleSave} disabled={saving} className="text-white [background:var(--btn-gradient)] hover:[background:var(--btn-gradient-hover)]">
                    {saving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Salvando…</> : <><Save className="w-4 h-4 mr-2" />Salvar alterações</>}
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </PlatformLayout>
  );
};

export default Perfil;
