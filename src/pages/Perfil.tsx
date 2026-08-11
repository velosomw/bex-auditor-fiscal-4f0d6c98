import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, User, Loader2, Save, CheckCircle2, Building2, Phone, Mail } from "lucide-react";
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
      <div className="max-w-[1400px] mx-auto p-6 space-y-6">
        {/* Header — mesmo padrão de /user/empresas */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-start gap-3">
            <Button variant="ghost" size="sm" onClick={() => navigate("/user")} className="gap-1.5 mt-1">
              <ArrowLeft className="w-4 h-4" />
              Voltar para Minha Área
            </Button>
            <div className="w-12 h-12 rounded-xl bg-[hsl(217,91%,50%)]/10 flex items-center justify-center shrink-0">
              <User className="w-6 h-6 text-[hsl(217,91%,50%)]" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">Perfil</h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                Dados da empresa e do administrador da conta.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {required && !completedAt && (
              <Badge className="bg-amber-500/15 text-amber-700 border border-amber-500/30">Cadastro pendente</Badge>
            )}
            {completedAt && (
              <Badge className="bg-emerald-500/15 text-emerald-700 border border-emerald-500/30 gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" /> Cadastro completo
              </Badge>
            )}
          </div>
        </div>

        {/* KPIs — mesmo layout de /user/empresas */}
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: "Administrador", value: form.full_name || "—", icon: User, color: "hsl(217,91%,50%)" },
            { label: "Escritório", value: form.company_name || "—", icon: Building2, color: "#8B5CF6" },
            { label: "Contato", value: form.whatsapp || form.phone_fixed || "—", icon: Phone, color: "hsl(142,76%,36%)" },
          ].map(k => (
            <Card key={k.label} className="border-border/50">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-muted-foreground">{k.label}</span>
                  <k.icon className="w-4 h-4" style={{ color: k.color }} />
                </div>
                <p className="text-lg font-bold text-foreground truncate">{k.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Card de dados — mesmo estilo do cadastro em /user/empresas */}
        <Card className="border-[hsl(217,91%,50%)]/40">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Building2 className="w-4 h-4 text-[hsl(217,91%,50%)]" /> Dados da Empresa
            </CardTitle>
            <CardDescription>
              Todos os campos são opcionais. A validação de CNPJ e CRC via integrações será ativada em breve para liberar
              recursos avançados da plataforma.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="py-10 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></div>
            ) : (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5 md:col-span-2">
                    <Label htmlFor="pname">Nome do Administrador</Label>
                    <Input id="pname" value={form.full_name} onChange={update("full_name")} placeholder="Seu nome completo" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="pcompany">Escritório / Contabilidade</Label>
                    <Input id="pcompany" value={form.company_name} onChange={update("company_name")} placeholder="Nome fantasia" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="prazao">Razão Social</Label>
                    <Input id="prazao" value={form.razao_social} onChange={update("razao_social")} placeholder="Razão social completa" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="pcnpj">CNPJ</Label>
                    <Input id="pcnpj" value={form.cnpj} onChange={update("cnpj")} placeholder="00.000.000/0000-00" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="pfixed">Telefone Fixo</Label>
                    <Input id="pfixed" value={form.phone_fixed} onChange={update("phone_fixed")} placeholder="(00) 0000-0000" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="pwhats">WhatsApp</Label>
                    <Input id="pwhats" value={form.whatsapp} onChange={update("whatsapp")} placeholder="(00) 90000-0000" />
                  </div>
                  <div className="space-y-1.5 md:col-span-2">
                    <Label htmlFor="paddr">Endereço</Label>
                    <Input id="paddr" value={form.address} onChange={update("address")} placeholder="Rua, número, bairro, cidade/UF, CEP" />
                  </div>
                </div>
                <div className="flex justify-end gap-2 mt-4">
                  <Button
                    onClick={handleSave}
                    disabled={saving}
                    className="bg-[hsl(217,91%,50%)] hover:bg-[hsl(217,91%,45%)] text-white gap-1.5"
                  >
                    {saving ? <><Loader2 className="w-4 h-4 animate-spin" />Salvando…</> : <><Save className="w-4 h-4" />Salvar alterações</>}
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
