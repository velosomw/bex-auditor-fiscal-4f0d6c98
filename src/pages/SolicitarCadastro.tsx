import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Building2, CheckCircle2, Loader2, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import HeroBanner from "@/components/HeroBanner";
import { createCompany } from "@/services/companiesService";
import { toast } from "@/hooks/use-toast";

const UF = ["AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"];
const SECTORS = ["Indústria", "Varejo", "Serviços", "Tecnologia", "Construção", "Agro", "Saúde", "Financeiro", "Educação", "Outro"];

const SolicitarCadastro = () => {
  const navigate = useNavigate();
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: "", cnpj: "", sector: "", cnae: "",
    address: "", city: "", uf: "", zip: "",
    contact_name: "", email: "", phone: "", notes: "",
  });

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.cnpj.trim() || !form.email.trim()) {
      toast({ title: "Preencha os campos obrigatórios", description: "Razão Social, CNPJ e E-mail.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      await createCompany({ ...form, status: "pendente", source: "site" });
      setSubmitted(true);
    } catch (err: any) {
      toast({ title: "Erro ao enviar cadastro", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (submitted) {
    return (
      <>
        <HeroBanner title="Solicitação Enviada" subtitle="Recebemos seu cadastro com sucesso" breadcrumbs={[{ label: "🏠", href: "/" }, { label: "Soluções", href: "/solucoes" }, { label: "Solicitar Cadastro" }]} />
        <section className="section-padding bg-background">
          <div className="max-w-2xl mx-auto">
            <Card className="border-2 border-[hsl(142,76%,36%)]/30">
              <CardContent className="p-10 text-center space-y-5">
                <div className="w-20 h-20 mx-auto rounded-full bg-[hsl(142,76%,36%)]/10 flex items-center justify-center">
                  <CheckCircle2 className="w-10 h-10 text-[hsl(142,76%,36%)]" />
                </div>
                <h2 className="text-2xl font-display font-bold text-foreground">Cadastro recebido com sucesso!</h2>
                <p className="text-muted-foreground leading-relaxed">
                  Sua solicitação foi registrada e nossa equipe da <strong>Brasil Expert</strong> entrará em contato em até <strong>2 dias úteis</strong> para validar os dados e liberar o acesso à plataforma.
                </p>
                <div className="bg-muted/40 rounded-lg p-4 text-sm text-left">
                  <p className="font-semibold text-foreground mb-1">📧 Próximos passos:</p>
                  <ul className="list-disc list-inside text-muted-foreground space-y-1">
                    <li>Análise documental do CNPJ informado</li>
                    <li>Contato comercial para alinhamento do plano</li>
                    <li>Liberação do acesso e envio das credenciais por e-mail</li>
                  </ul>
                </div>
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
        subtitle="Preencha os dados da empresa para iniciar o processo de adesão à plataforma Brasil Expert"
        breadcrumbs={[{ label: "🏠", href: "/" }, { label: "Soluções", href: "/solucoes" }, { label: "Solicitar Cadastro" }]}
      />
      <section className="section-padding bg-background">
        <div className="max-w-3xl mx-auto">
          <Link to="/solucoes" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4">
            <ArrowLeft className="w-4 h-4" /> Voltar para Soluções
          </Link>
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-xl">
                  <Building2 className="w-5 h-5 text-[hsl(217,91%,50%)]" /> Dados da Empresa
                </CardTitle>
                <CardDescription>Após o envio, a Brasil Expert fará contato para liberar o cadastro na plataforma.</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5 md:col-span-2">
                    <Label htmlFor="name">Razão Social *</Label>
                    <Input id="name" value={form.name} onChange={e => set("name", e.target.value)} placeholder="Ex: Acme Indústria S.A." />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="cnpj">CNPJ *</Label>
                    <Input id="cnpj" value={form.cnpj} onChange={e => set("cnpj", e.target.value)} placeholder="00.000.000/0000-00" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="cnae">CNAE / Área de atuação</Label>
                    <Input id="cnae" value={form.cnae} onChange={e => set("cnae", e.target.value)} placeholder="Ex: 4711-3/01 — Comércio varejista" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Setor</Label>
                    <Select value={form.sector} onValueChange={v => set("sector", v)}>
                      <SelectTrigger><SelectValue placeholder="Selecione o setor" /></SelectTrigger>
                      <SelectContent>{SECTORS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="phone">Telefone *</Label>
                    <Input id="phone" value={form.phone} onChange={e => set("phone", e.target.value)} placeholder="(11) 99999-9999" />
                  </div>
                  <div className="space-y-1.5 md:col-span-2">
                    <Label htmlFor="address">Endereço Completo</Label>
                    <Input id="address" value={form.address} onChange={e => set("address", e.target.value)} placeholder="Rua, número, complemento, bairro" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="city">Cidade</Label>
                    <Input id="city" value={form.city} onChange={e => set("city", e.target.value)} placeholder="Ex: São Paulo" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Estado (UF)</Label>
                    <Select value={form.uf} onValueChange={v => set("uf", v)}>
                      <SelectTrigger><SelectValue placeholder="UF" /></SelectTrigger>
                      <SelectContent className="max-h-60">{UF.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="zip">CEP</Label>
                    <Input id="zip" value={form.zip} onChange={e => set("zip", e.target.value)} placeholder="00000-000" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="contact_name">Responsável</Label>
                    <Input id="contact_name" value={form.contact_name} onChange={e => set("contact_name", e.target.value)} placeholder="Nome do contato" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="email">E-mail *</Label>
                    <Input id="email" type="email" value={form.email} onChange={e => set("email", e.target.value)} placeholder="contato@empresa.com.br" />
                  </div>
                  <div className="space-y-1.5 md:col-span-2">
                    <Label htmlFor="notes">Mensagem / Observações</Label>
                    <Input id="notes" value={form.notes} onChange={e => set("notes", e.target.value)} placeholder="Conte-nos brevemente sobre a sua necessidade (opcional)" />
                  </div>
                  <div className="md:col-span-2 flex justify-end pt-2">
                    <Button type="submit" disabled={saving} size="lg" className="bg-[hsl(217,91%,50%)] hover:bg-[hsl(217,91%,45%)] text-white">
                      {saving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Enviando...</> : "Enviar Solicitação"}
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          </motion.div>
        </div>
      </section>
    </>
  );
};

export default SolicitarCadastro;
