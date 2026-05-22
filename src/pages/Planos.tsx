import { Link, useNavigate } from "react-router-dom";
import { Check, X, Sparkles, Crown, Quote, Star } from "lucide-react";
import { Fragment } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { useUser } from "@/contexts/UserContext";

const proFeatures = [
  { ok: true, label: "Cadastro com CNPJ e CRC" },
  { ok: true, label: "Até 3 relatórios PRO por mês" },
  { ok: true, label: "Gráficos e análise básica de balancetes" },
  { ok: true, label: "Visibilidade Kanitz (resumida)" },
  { ok: false, label: "Workspace de análise pós-relatório" },
  { ok: false, label: "Relatórios completos BEx Auditoria IA" },
  { ok: false, label: "Kanitz completo + análise ampliada" },
];

const entFeatures = [
  { ok: true, label: "Tudo do plano PRO" },
  { ok: true, label: "6 relatórios completos BEx Auditoria IA/mês" },
  { ok: true, label: "+10 relatórios PRO (desbloqueio PRO 10)" },
  { ok: true, label: "Total de 16 relatórios mensais" },
  { ok: true, label: "2 relatórios simultâneos PRO + Kanitz" },
  { ok: true, label: "Workspace de análise pós-relatório" },
  { ok: true, label: "Kanitz completo + análise aprofundada" },
];

type Cmp = boolean | string;
const comparison: { feature: string; pro: Cmp; enterprise: Cmp }[] = [
  { feature: "Cadastro com CNPJ e CRC", pro: true, enterprise: true },
  { feature: "Relatórios PRO mensais", pro: "3", enterprise: "10" },
  { feature: "Relatórios completos BEx Auditoria IA", pro: false, enterprise: "6" },
  { feature: "Total de relatórios por mês", pro: "3", enterprise: "16" },
  { feature: "Gráficos de auditoria", pro: "Básico", enterprise: "Ampliado" },
  { feature: "Visibilidade Kanitz", pro: "Resumida", enterprise: "Completa" },
  { feature: "Workspace pós-relatório", pro: false, enterprise: true },
  { feature: "Relatórios simultâneos (PRO + Kanitz)", pro: false, enterprise: true },
  { feature: "Suporte técnico prioritário", pro: false, enterprise: true },
  { feature: "Cancelamento a qualquer momento", pro: true, enterprise: true },
];

const stories = [
  {
    name: "Carla M.",
    role: "Sócia — Contabilidade Horizonte",
    quote:
      "A BEx IA reduziu pela metade o tempo de análise dos balancetes dos nossos clientes. O Workspace pós-relatório virou o nosso diferencial comercial.",
    metric: "−52% no tempo de auditoria",
  },
  {
    name: "Rodrigo A.",
    role: "Diretor Financeiro — Indústria SP",
    quote:
      "Com o Enterprise, conseguimos cruzar Kanitz completo e a análise BEx no mesmo dashboard. Antecipamos um risco de insolvência em três meses.",
    metric: "Risco identificado em 90 dias",
  },
  {
    name: "Juliana T.",
    role: "Contadora — Escritório Trindade",
    quote:
      "Comecei no PRO grátis para testar e migrei para o Enterprise em duas semanas. O custo-benefício é simplesmente imbatível.",
    metric: "Upgrade em 14 dias",
  },
];

const faq = [
  {
    q: "Posso começar grátis?",
    a: "Sim. O plano PRO é gratuito para sempre e libera até 3 relatórios PRO por mês, com gráficos e visibilidade Kanitz resumida.",
  },
  {
    q: "Como funciona o pagamento do plano Enterprise?",
    a: "O pagamento é feito via PIX recorrente através do gateway AbacatePay. Após a confirmação, sua assinatura é ativada automaticamente.",
  },
  {
    q: "Posso cancelar quando quiser?",
    a: "Sim. Você pode cancelar a renovação automática a qualquer momento na página Minha Assinatura, mantendo acesso até o fim do ciclo já pago.",
  },
  {
    q: "Os relatórios não usados acumulam para o mês seguinte?",
    a: "Não. Os relatórios são renovados todo mês e não são cumulativos, garantindo capacidade de processamento consistente para todos os usuários.",
  },
  {
    q: "Posso fazer upgrade do PRO para o Enterprise depois?",
    a: "Sim. A qualquer momento, basta acessar Minha Assinatura e contratar o Enterprise. O upgrade é instantâneo após a confirmação do PIX.",
  },
  {
    q: "Meus dados estão seguros?",
    a: "Sim. Operamos com criptografia em trânsito e em repouso, RLS em todas as tabelas e infraestrutura em conformidade com a LGPD.",
  },
];

const renderCmp = (v: Cmp, accent = false) => {
  if (v === true)
    return <Check className={`w-5 h-5 mx-auto ${accent ? "text-[hsl(217,91%,50%)]" : "text-emerald-600"}`} />;
  if (v === false) return <X className="w-5 h-5 mx-auto text-muted-foreground/40" />;
  return <span className={`text-sm font-medium ${accent ? "text-[hsl(217,91%,50%)]" : ""}`}>{v}</span>;
};

const Planos = () => {
  const navigate = useNavigate();
  const { authenticated: user } = useUser();

  const handleContratarEnterprise = () => {
    if (user) navigate("/minha-assinatura?upgrade=enterprise");
    else navigate("/signup?plan=enterprise&redirect=/minha-assinatura?upgrade=enterprise");
  };

  return (
    <Fragment>
      {/* HERO */}
      <section className="bg-[hsl(222,47%,11%)] text-white py-20 px-6">
        <div className="max-w-6xl mx-auto text-center">
          <Badge className="mb-4 bg-[hsl(217,91%,50%)]/20 text-[hsl(217,91%,70%)] border-[hsl(217,91%,50%)]/30">
            Planos e Assinatura
          </Badge>
          <h1 className="text-4xl md:text-5xl font-bold mb-4 tracking-tight">
            Escolha o plano ideal para o seu escritório
          </h1>
          <p className="text-lg text-white/70 max-w-2xl mx-auto">
            Auditoria contábil inteligente com IA. Comece grátis com o plano PRO ou avance seu negócio com o Enterprise.
          </p>
        </div>
      </section>

      {/* PRICING CARDS */}
      <section className="py-16 px-6 bg-background">
        <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* PRO */}
          <Card className="group p-8 border-2 flex flex-col transition-all duration-300 hover:-translate-y-2 hover:shadow-2xl hover:border-[hsl(217,91%,50%)]/60 hover:shadow-[hsl(217,91%,50%)]/10">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="w-5 h-5 text-[hsl(217,91%,50%)] transition-transform duration-300 group-hover:scale-110" />
              <h2 className="text-2xl font-bold">Plano PRO</h2>
            </div>
            <p className="text-muted-foreground mb-6">Para começar a usar a plataforma sem custo.</p>
            <div className="mb-6">
              <span className="text-5xl font-bold">Grátis</span>
              <span className="text-muted-foreground ml-2">para 1 ano</span>
            </div>
            <ul className="space-y-3 mb-8 flex-1">
              {proFeatures.map((f) => (
                <li key={f.label} className="flex items-start gap-2 text-sm">
                  {f.ok ? <Check className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" /> : <X className="w-4 h-4 text-muted-foreground/50 mt-0.5 shrink-0" />}
                  <span className={f.ok ? "" : "text-muted-foreground/60 line-through"}>{f.label}</span>
                </li>
              ))}
            </ul>
            <Button variant="outline" className="w-full h-12 text-base transition-all group-hover:border-[hsl(217,91%,50%)] group-hover:text-[hsl(217,91%,50%)]" onClick={() => navigate("/signup?plan=pro")}>
              Fazer Cadastro
            </Button>
          </Card>

          {/* ENTERPRISE */}
          <Card className="group p-8 border-2 border-[hsl(217,91%,50%)] flex flex-col relative shadow-xl transition-all duration-300 hover:-translate-y-2 hover:shadow-2xl hover:shadow-[hsl(217,91%,50%)]/30">
            <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[hsl(217,91%,50%)] text-white">
              Recomendado
            </Badge>
            <div className="flex items-center gap-2 mb-2">
              <Crown className="w-5 h-5 text-[hsl(217,91%,50%)] transition-transform duration-300 group-hover:scale-110 group-hover:rotate-6" />
              <h2 className="text-2xl font-bold">Plano Enterprise</h2>
            </div>
            <p className="text-muted-foreground mb-6">Avance seu negócio com Auditoria BEx IA completa.</p>
            <div className="mb-6">
              <span className="text-5xl font-bold">R$ 5,00</span>
              <span className="text-muted-foreground ml-2">/mês</span>
            </div>
            <ul className="space-y-3 mb-8 flex-1">
              {entFeatures.map((f) => (
                <li key={f.label} className="flex items-start gap-2 text-sm">
                  <Check className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
                  <span>{f.label}</span>
                </li>
              ))}
            </ul>
            <Button className="w-full h-12 text-base text-white [background:var(--btn-gradient)] hover:[background:var(--btn-gradient-hover)] transition-transform group-hover:scale-[1.02]" onClick={handleContratarEnterprise}>
              Contratar
            </Button>
            {!user && (
              <p className="text-xs text-center text-muted-foreground mt-3">
                Já é cadastrado?{" "}
                <Link to="/login?redirect=/minha-assinatura?upgrade=enterprise" className="text-[hsl(217,91%,50%)] hover:underline font-medium">
                  Clique aqui para entrar
                </Link>
              </p>
            )}
          </Card>
        </div>
      </section>

      {/* COMPARE FEATURES */}
      <section className="py-16 px-6 bg-muted/30 border-y">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-10">
            <Badge variant="outline" className="mb-3">Comparativo</Badge>
            <h2 className="text-3xl md:text-4xl font-bold mb-3">Compare os recursos de cada plano</h2>
            <p className="text-muted-foreground">Veja em detalhes o que cada plano oferece e escolha com segurança.</p>
          </div>

          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-background">
                  <tr className="border-b">
                    <th className="text-left py-4 px-6 font-semibold text-sm uppercase tracking-wider text-muted-foreground">Recurso</th>
                    <th className="py-4 px-6 font-semibold text-center min-w-[140px]">
                      <div className="flex items-center justify-center gap-2">
                        <Sparkles className="w-4 h-4 text-[hsl(217,91%,50%)]" /> PRO
                      </div>
                    </th>
                    <th className="py-4 px-6 font-semibold text-center min-w-[140px] bg-[hsl(217,91%,50%)]/5">
                      <div className="flex items-center justify-center gap-2 text-[hsl(217,91%,50%)]">
                        <Crown className="w-4 h-4" /> Enterprise
                      </div>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {comparison.map((row, i) => (
                    <tr key={row.feature} className={`border-b transition-colors hover:bg-muted/50 ${i % 2 === 0 ? "bg-background/50" : ""}`}>
                      <td className="py-4 px-6 text-sm font-medium">{row.feature}</td>
                      <td className="py-4 px-6 text-center">{renderCmp(row.pro)}</td>
                      <td className="py-4 px-6 text-center bg-[hsl(217,91%,50%)]/5">{renderCmp(row.enterprise, true)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      </section>

      {/* SUCCESS STORIES */}
      <section className="py-16 px-6 bg-background">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-10">
            <Badge variant="outline" className="mb-3">Cases reais</Badge>
            <h2 className="text-3xl md:text-4xl font-bold mb-3">Histórias de sucesso</h2>
            <p className="text-muted-foreground">Quem usa a BEx IA acelera diagnóstico, reduz custos e fecha mais negócios.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {stories.map((s) => (
              <Card key={s.name} className="group p-6 flex flex-col transition-all duration-300 hover:-translate-y-2 hover:shadow-xl hover:border-[hsl(217,91%,50%)]/60">
                <Quote className="w-8 h-8 text-[hsl(217,91%,50%)]/30 mb-3 transition-transform group-hover:scale-110" />
                <p className="text-sm leading-relaxed mb-6 flex-1">"{s.quote}"</p>
                <div className="flex items-center gap-1 mb-4 text-amber-500">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star key={i} className="w-4 h-4 fill-current" />
                  ))}
                </div>
                <div className="border-t pt-4">
                  <p className="font-semibold text-sm">{s.name}</p>
                  <p className="text-xs text-muted-foreground mb-2">{s.role}</p>
                  <Badge className="bg-[hsl(217,91%,50%)]/10 text-[hsl(217,91%,50%)] border-[hsl(217,91%,50%)]/20 hover:bg-[hsl(217,91%,50%)]/20">
                    {s.metric}
                  </Badge>
                </div>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-16 px-6 bg-muted/30 border-t">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-10">
            <Badge variant="outline" className="mb-3">FAQ</Badge>
            <h2 className="text-3xl md:text-4xl font-bold mb-3">Perguntas frequentes</h2>
            <p className="text-muted-foreground">Tudo o que você precisa saber antes de escolher o seu plano.</p>
          </div>

          <Accordion type="single" collapsible className="w-full space-y-3">
            {faq.map((item, i) => (
              <AccordionItem
                key={i}
                value={`item-${i}`}
                className="bg-background border rounded-lg px-5 transition-all hover:border-[hsl(217,91%,50%)]/40 hover:shadow-md"
              >
                <AccordionTrigger className="text-left font-semibold hover:no-underline">
                  {item.q}
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground text-sm leading-relaxed">
                  {item.a}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>

          <div className="mt-12 text-center">
            <h3 className="text-xl font-semibold mb-3">Ainda tem dúvidas?</h3>
            <p className="text-muted-foreground mb-4">Fale com nosso time. Ajustamos a melhor opção para o seu escritório.</p>
            <Button variant="outline" onClick={() => navigate("/contato")}>Fale Conosco</Button>
          </div>
        </div>
      </section>
    </Fragment>
  );
};

export default Planos;
