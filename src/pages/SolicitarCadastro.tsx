import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Building2, CheckCircle2, Loader2, ArrowLeft, Calculator, Plus, Trash2, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import HeroBanner from "@/components/HeroBanner";
import { submitAccountingFirmRegistration } from "@/services/accountingFirmsService";
import { toast } from "@/hooks/use-toast";
import { formatCep } from "@/lib/cep";

type Step = "contabilidade" | "empresas" | "sucesso";

interface ClientCompany {
  name: string;
  cnpj: string;
  city: string;
  contact_name: string;
  phone: string;
}

const emptyCompany = (): ClientCompany => ({
  name: "", cnpj: "", city: "", contact_name: "", phone: "",
});

const SolicitarCadastro = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>("contabilidade");
  const [saving, setSaving] = useState(false);

  // Etapa 1 — Contabilidade
  const [firm, setFirm] = useState({
    name: "", cnpj: "", crc: "", phone: "", address: "",
    zip: "", address_number: "", email: "",
  });
  const setFirmField = (k: string, v: string) => setFirm(f => ({ ...f, [k]: v }));

  // Etapa 2 — Empresas vinculadas
  const [companies, setCompanies] = useState<ClientCompany[]>([emptyCompany()]);
  const setCompanyField = (idx: number, k: keyof ClientCompany, v: string) =>
    setCompanies(list => list.map((c, i) => i === idx ? { ...c, [k]: v } : c));
  const addCompany = () => setCompanies(list => [...list, emptyCompany()]);
  const removeCompany = (idx: number) =>
    setCompanies(list => list.length > 1 ? list.filter((_, i) => i !== idx) : list);

  const validateFirm = () => {
    const required = ["name", "cnpj", "crc", "phone", "email"];
    for (const k of required) {
      if (!(firm as any)[k]?.trim()) {
        toast({ title: "Campo obrigatório", description: `Preencha ${k.toUpperCase()}.`, variant: "destructive" });
        return false;
      }
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(firm.email)) {
      toast({ title: "E-mail inválido", variant: "destructive" });
      return false;
    }
    return true;
  };

  const goToCompanies = () => {
    if (!validateFirm()) return;
    setStep("empresas");
  };

  const handleSubmit = async () => {
    const validCompanies = companies.filter(c => c.name.trim());
    setSaving(true);
    try {
      // 1) Persiste a contabilidade (anônima — status pendente) já com as empresas
      //    pendentes embutidas em metadata.pending_companies. Quando o admin aprovar,
      //    a Edge Function cria essas empresas vinculadas ao usuário recém-criado.
      const { supabase } = await import("@/integrations/supabase/client");
      const payload: any = {
        name: firm.name.trim(),
        cnpj: firm.cnpj.trim(),
        crc: firm.crc.trim(),
        phone: firm.phone.trim(),
        email: firm.email.trim().toLowerCase(),
        address: firm.address?.trim() || null,
        address_number: firm.address_number?.trim() || null,
        zip: firm.zip?.trim() || null,
        status: "pendente",
        source: "site",
        user_id: null,
        metadata: validCompanies.length > 0 ? { pending_companies: validCompanies } : null,
      };
      const { error } = await supabase.from("accounting_firms" as any).insert(payload);
      if (error) throw error;

      setStep("sucesso");
    } catch (err: any) {
      const isDup =
        err?.code === "23505" ||
        /duplicate|already exists|unique/i.test(err?.message || "");
      const msg = isDup
        ? "Já existe uma contabilidade cadastrada com este CNPJ."
        : err?.message || "Erro ao enviar cadastro";
      toast({ title: "Erro ao enviar cadastro", description: msg, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };


  // ============================ SUCESSO ============================
  if (step === "sucesso") {
    return (
      <>
        <HeroBanner
          title="Solicitação Enviada"
          subtitle="Recebemos seu cadastro com sucesso"
          breadcrumbs={[{ label: "🏠", href: "/" }, { label: "Soluções", href: "/solucoes" }, { label: "Solicitar Cadastro" }]}
        />
        <section className="section-padding bg-background">
          <div className="max-w-2xl mx-auto">
            <Card className="border-2 border-[hsl(142,76%,36%)]/30">
              <CardContent className="p-10 text-center space-y-5">
                <div className="w-20 h-20 mx-auto rounded-full bg-[hsl(142,76%,36%)]/10 flex items-center justify-center">
                  <CheckCircle2 className="w-10 h-10 text-[hsl(142,76%,36%)]" />
                </div>
                <h2 className="text-2xl font-display font-bold text-foreground">Solicitação recebida!</h2>
                <p className="text-muted-foreground leading-relaxed">
                  Sua contabilidade foi cadastrada com status <strong>pendente de aprovação</strong>.
                  Assim que nossa equipe aprovar, você receberá um <strong>e-mail</strong> com um link
                  para <strong>definir sua senha</strong> de acesso à plataforma <strong>Brasil Expert</strong>.
                </p>

                <Button onClick={() => navigate("/")} className="bg-[hsl(217,91%,50%)] hover:bg-[hsl(217,91%,45%)] text-white">
                  Voltar ao início
                </Button>
              </CardContent>
            </Card>
          </div>
        </section>
      </>
    );
  }

  return (
    <>
      <HeroBanner
        title="Solicitar Cadastro"
        subtitle="Cadastro de Contabilidade e Empresas-Cliente na plataforma Brasil Expert"
        breadcrumbs={[{ label: "🏠", href: "/" }, { label: "Soluções", href: "/solucoes" }, { label: "Solicitar Cadastro" }]}
      />
      <section className="section-padding bg-background">
        <div className="max-w-3xl mx-auto">
          <Link to="/solucoes" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4">
            <ArrowLeft className="w-4 h-4" /> Voltar para Soluções
          </Link>

          {/* Stepper */}
          <div className="flex items-center gap-3 mb-6">
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold ${step === "contabilidade" ? "bg-[hsl(217,91%,50%)] text-white" : "bg-[hsl(142,76%,36%)]/15 text-[hsl(142,76%,36%)]"}`}>
              {step === "empresas" ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Calculator className="w-3.5 h-3.5" />}
              1. Contabilidade
            </div>
            <div className="h-px flex-1 bg-border" />
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold ${step === "empresas" ? "bg-[hsl(217,91%,50%)] text-white" : "bg-muted text-muted-foreground"}`}>
              <Building2 className="w-3.5 h-3.5" />
              2. Empresas-cliente
            </div>
          </div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            {/* ============================ ETAPA 1 ============================ */}
            {step === "contabilidade" && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-xl">
                    <Calculator className="w-5 h-5 text-[hsl(217,91%,50%)]" /> Dados da Contabilidade
                  </CardTitle>
                  <CardDescription>Cadastro do escritório contábil responsável pela gestão das empresas-cliente.</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1.5 md:col-span-2">
                      <Label htmlFor="f-name">Razão Social *</Label>
                      <Input id="f-name" value={firm.name} onChange={e => setFirmField("name", e.target.value)} placeholder="Ex: Contabilidade Exemplo Ltda." maxLength={150} />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="f-cnpj">CNPJ *</Label>
                      <Input id="f-cnpj" value={firm.cnpj} onChange={e => setFirmField("cnpj", e.target.value)} placeholder="00.000.000/0000-00" maxLength={18} />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="f-crc">CRC *</Label>
                      <Input id="f-crc" value={firm.crc} onChange={e => setFirmField("crc", e.target.value)} placeholder="Ex: SP-123456/O" maxLength={20} />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="f-phone">Telefone *</Label>
                      <Input id="f-phone" value={firm.phone} onChange={e => setFirmField("phone", e.target.value)} placeholder="(11) 99999-9999" maxLength={20} />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="f-email">E-mail *</Label>
                      <Input id="f-email" type="email" value={firm.email} onChange={e => setFirmField("email", e.target.value)} placeholder="contato@contabilidade.com.br" maxLength={150} />
                    </div>
                    <div className="space-y-1.5 md:col-span-2">
                      <Label htmlFor="f-address">Endereço</Label>
                      <Input id="f-address" value={firm.address} onChange={e => setFirmField("address", e.target.value)} placeholder="Rua, bairro, cidade — UF" maxLength={200} />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="f-num">Nº</Label>
                      <Input id="f-num" value={firm.address_number} onChange={e => setFirmField("address_number", e.target.value)} placeholder="123" maxLength={10} />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="f-zip">CEP</Label>
                      <Input id="f-zip" value={firm.zip} onChange={e => setFirmField("zip", formatCep(e.target.value))} placeholder="00.000.000" maxLength={10} inputMode="numeric" />
                    </div>
                  </div>
                  <div className="flex justify-end pt-6">
                    <Button onClick={goToCompanies} size="lg" className="bg-[hsl(217,91%,50%)] hover:bg-[hsl(217,91%,45%)] text-white">
                      Próximo: Empresas-cliente <ArrowRight className="w-4 h-4 ml-2" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* ============================ ETAPA 2 ============================ */}
            {step === "empresas" && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-xl">
                    <Building2 className="w-5 h-5 text-[hsl(217,91%,50%)]" /> Empresas-cliente
                    <Badge variant="secondary" className="ml-auto">Opcional</Badge>
                  </CardTitle>
                  <CardDescription>
                    Cadastre as empresas que serão geridas por <strong>{firm.name || "esta contabilidade"}</strong>.
                    Você poderá adicionar mais depois, no painel logado.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                  {companies.map((c, idx) => (
                    <div key={idx} className="border rounded-lg p-4 bg-muted/20 space-y-3">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold text-foreground">Empresa #{idx + 1}</p>
                        {companies.length > 1 && (
                          <Button variant="ghost" size="sm" onClick={() => removeCompany(idx)} className="h-7 text-destructive hover:text-destructive">
                            <Trash2 className="w-3.5 h-3.5 mr-1" /> Remover
                          </Button>
                        )}
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div className="space-y-1 md:col-span-2">
                          <Label htmlFor={`c-name-${idx}`} className="text-xs">Razão Social ou Nome Fantasia *</Label>
                          <Input id={`c-name-${idx}`} value={c.name} onChange={e => setCompanyField(idx, "name", e.target.value)} placeholder="Ex: Acme Comércio Ltda." maxLength={150} />
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor={`c-cnpj-${idx}`} className="text-xs">CNPJ</Label>
                          <Input id={`c-cnpj-${idx}`} value={c.cnpj} onChange={e => setCompanyField(idx, "cnpj", e.target.value)} placeholder="00.000.000/0000-00" maxLength={18} />
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor={`c-city-${idx}`} className="text-xs">Cidade</Label>
                          <Input id={`c-city-${idx}`} value={c.city} onChange={e => setCompanyField(idx, "city", e.target.value)} placeholder="Ex: São Paulo" maxLength={100} />
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor={`c-resp-${idx}`} className="text-xs">Responsável</Label>
                          <Input id={`c-resp-${idx}`} value={c.contact_name} onChange={e => setCompanyField(idx, "contact_name", e.target.value)} placeholder="Nome do responsável" maxLength={100} />
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor={`c-phone-${idx}`} className="text-xs">Telefone Celular</Label>
                          <Input id={`c-phone-${idx}`} value={c.phone} onChange={e => setCompanyField(idx, "phone", e.target.value)} placeholder="(11) 99999-9999" maxLength={20} />
                        </div>
                      </div>
                    </div>
                  ))}

                  <Button variant="outline" onClick={addCompany} className="w-full border-dashed">
                    <Plus className="w-4 h-4 mr-1.5" /> Adicionar outra empresa
                  </Button>

                  <div className="flex justify-between pt-4 gap-2">
                    <Button variant="ghost" onClick={() => setStep("contabilidade")}>
                      <ArrowLeft className="w-4 h-4 mr-1" /> Voltar
                    </Button>
                    <Button onClick={handleSubmit} disabled={saving} size="lg" className="bg-[hsl(217,91%,50%)] hover:bg-[hsl(217,91%,45%)] text-white">
                      {saving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Enviando...</> : "Enviar Solicitação"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </motion.div>
        </div>
      </section>
    </>
  );
};

export default SolicitarCadastro;
