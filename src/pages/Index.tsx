import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight, Shield, TrendingUp, BarChart3, Users } from "lucide-react";
import heroBg from "@/assets/hero-bg.jpg";
import aboutBg from "@/assets/about-bg.jpg";

const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.15, duration: 0.6, ease: "easeOut" as const },
  }),
};

const Index = () => {
  return (
    <>
      {/* Hero */}
      <section className="relative min-h-[85vh] flex items-center overflow-hidden">
        <img
          src={heroBg}
          alt="BEX Auditoria"
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div className="hero-overlay absolute inset-0" />
        <div className="relative z-10 max-w-7xl mx-auto px-6 lg:px-12 py-24">
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="text-accent font-semibold tracking-widest uppercase text-sm mb-4"
          >
            BEX Brasil — T Expert
          </motion.p>
          <motion.h1
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="text-4xl md:text-5xl lg:text-6xl font-serif font-bold text-primary-foreground leading-tight max-w-3xl mb-6"
          >
            Transparência na Reestruturação e Recuperação de Empresas
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="text-lg text-primary-foreground/70 max-w-xl mb-8 leading-relaxed"
          >
            Transformamos desafios financeiros em oportunidades de crescimento sustentável. Inteligência financeira, capacidade analítica e soluções estruturadas.
          </motion.p>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.35 }}
            className="flex flex-wrap gap-4"
          >
            <Link
              to="/solucoes"
              className="inline-flex items-center gap-2 px-8 py-3.5 rounded-md bg-accent text-accent-foreground font-semibold hover:opacity-90 transition-opacity"
            >
              Nossas Soluções
              <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              to="/contato"
              className="inline-flex items-center gap-2 px-8 py-3.5 rounded-md border border-primary-foreground/30 text-primary-foreground font-semibold hover:border-accent hover:text-accent transition-colors"
            >
              Fale Conosco
            </Link>
          </motion.div>
        </div>
      </section>

      {/* How We Help */}
      <section className="section-padding bg-background">
        <div className="max-w-7xl mx-auto">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-80px" }}
            className="text-center mb-16"
          >
            <motion.h2
              variants={fadeUp}
              custom={0}
              className="text-3xl md:text-4xl font-serif font-bold text-foreground mb-4"
            >
              Como ajudamos sua empresa
            </motion.h2>
            <motion.p
              variants={fadeUp}
              custom={1}
              className="text-muted-foreground max-w-2xl mx-auto"
            >
              Soluções estratégicas para reestruturação financeira e gestão de solvência
            </motion.p>
          </motion.div>

          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-60px" }}
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8"
          >
            {[
              {
                icon: BarChart3,
                title: "Diagnóstico Preciso",
                desc: "Identificamos rapidamente as causas reais da crise financeira da sua empresa.",
              },
              {
                icon: TrendingUp,
                title: "Reestruturação de Dívidas",
                desc: "Foco em redução de encargos e alongamento saudável de prazos.",
              },
              {
                icon: Shield,
                title: "Avaliação de Solvência",
                desc: "Modelos preditivos internacionais: Z-Score, Kanitz e Matias.",
              },
              {
                icon: Users,
                title: "Acompanhamento Contínuo",
                desc: "Execução do plano e sustentabilidade pós-reestruturação garantidas.",
              },
            ].map((item, i) => (
              <motion.div
                key={item.title}
                variants={fadeUp}
                custom={i}
                className="card-hover bg-card rounded-lg p-8 border border-border"
              >
                <div className="w-12 h-12 rounded-lg bg-accent/10 flex items-center justify-center mb-5">
                  <item.icon className="w-6 h-6 text-accent" />
                </div>
                <h3 className="font-serif font-semibold text-lg text-foreground mb-2">{item.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{item.desc}</p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Method */}
      <section className="section-padding bg-primary text-primary-foreground">
        <div className="max-w-7xl mx-auto">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            className="grid lg:grid-cols-2 gap-16 items-center"
          >
            <div>
              <motion.h2
                variants={fadeUp}
                custom={0}
                className="text-3xl md:text-4xl font-serif font-bold mb-8"
              >
                Nosso Método em 4 Fases
              </motion.h2>
              <div className="space-y-6">
                {[
                  { n: "01", title: "Diagnóstico Completo", desc: "Levantamento, classificação e análise de todo o passivo, fluxos de caixa e estrutura de custos." },
                  { n: "02", title: "Planejamento Estratégico", desc: "Modelagem de cenários, simulações, priorização de pagamentos e plano tático." },
                  { n: "03", title: "Implementação e Negociações", desc: "Acompanhamento direto com bancos, fornecedores e credores. Suporte em RJ/RE." },
                  { n: "04", title: "Monitoramento e Governança", desc: "Dashboards mensais, indicadores de performance e educação financeira da gestão." },
                ].map((step, i) => (
                  <motion.div
                    key={step.n}
                    variants={fadeUp}
                    custom={i + 1}
                    className="flex gap-5"
                  >
                    <span className="text-accent font-serif font-bold text-2xl shrink-0">{step.n}</span>
                    <div>
                      <h3 className="font-semibold font-sans mb-1">{step.title}</h3>
                      <p className="text-sm text-primary-foreground/60 leading-relaxed">{step.desc}</p>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
            <motion.div variants={fadeUp} custom={2} className="relative">
              <img
                src={aboutBg}
                alt="Equipe BEX"
                className="rounded-lg shadow-2xl w-full object-cover aspect-[4/3]"
              />
              <div className="absolute -bottom-6 -left-6 bg-accent text-accent-foreground p-6 rounded-lg shadow-xl">
                <p className="text-3xl font-serif font-bold">+15</p>
                <p className="text-sm font-medium">Anos de experiência</p>
              </div>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* Solutions CTA */}
      <section className="section-padding bg-background">
        <div className="max-w-7xl mx-auto">
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-3xl md:text-4xl font-serif font-bold text-foreground mb-12 text-center"
          >
            Pacotes de Soluções
          </motion.h2>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                tag: "Básico",
                title: "Diagnóstico Rápido",
                desc: "Ideal para empresas que começam a sentir o peso das dívidas. Relatório Técnico-Financeiro com prioridades e oportunidades imediatas.",
                href: "/solucoes/diagnostico-rapido",
              },
              {
                tag: "Intermediário",
                title: "Solvência + Reestruturação",
                desc: "Para empresas em crise moderada. Parecer de Solvência (Z-Score, Kanitz, Matias) e Plano Financeiro com projeções e cenários.",
                href: "/solucoes/solvencia-reestruturacao",
                featured: true,
              },
              {
                tag: "Avançado",
                title: "Consultoria Completa",
                desc: "Para empresas em crise aguda ou ambiente judicial. Laudo de Viabilidade, suporte integral em RJ/RE e dashboards mensais.",
                href: "/solucoes/consultoria-completa",
              },
            ].map((pkg, i) => (
              <motion.div
                key={pkg.title}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.15 }}
                className={`card-hover rounded-lg p-8 border transition-colors ${
                  pkg.featured
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-card text-foreground border-border"
                }`}
              >
                <span
                  className={`inline-block text-xs font-semibold uppercase tracking-wider px-3 py-1 rounded-full mb-4 ${
                    pkg.featured
                      ? "bg-accent text-accent-foreground"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {pkg.tag}
                </span>
                <h3 className="font-serif font-bold text-xl mb-3">{pkg.title}</h3>
                <p className={`text-sm leading-relaxed mb-6 ${pkg.featured ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                  {pkg.desc}
                </p>
                <Link
                  to={pkg.href}
                  className={`inline-flex items-center gap-2 text-sm font-semibold ${
                    pkg.featured ? "text-accent" : "text-accent"
                  } hover:underline`}
                >
                  Saiba mais <ArrowRight className="w-4 h-4" />
                </Link>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Results */}
      <section className="section-padding bg-muted">
        <div className="max-w-7xl mx-auto text-center">
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-3xl md:text-4xl font-serif font-bold text-foreground mb-12"
          >
            Resultados Esperados
          </motion.h2>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              { value: "↓ CET", label: "Redução significativa do Custo Efetivo Total das dívidas" },
              { value: "✓ Viabilidade", label: "Preservação da viabilidade operacional da empresa" },
              { value: "↑ Investimento", label: "Retomada da capacidade de investimento e crescimento" },
            ].map((item, i) => (
              <motion.div
                key={item.value}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.15 }}
                className="bg-card rounded-lg p-8 card-hover border border-border"
              >
                <p className="text-2xl font-serif font-bold text-accent mb-3">{item.value}</p>
                <p className="text-sm text-muted-foreground">{item.label}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="section-padding bg-primary text-primary-foreground text-center">
        <div className="max-w-2xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-serif font-bold mb-4">
            Pronto para um novo ciclo?
          </h2>
          <p className="text-primary-foreground/60 mb-8">
            Seus desafios financeiros podem ser complexos — mas as soluções não precisam ser. Estamos prontos para conduzir sua empresa a um novo ciclo de estabilidade e crescimento.
          </p>
          <Link
            to="/contato"
            className="inline-flex items-center gap-2 px-8 py-3.5 rounded-md bg-accent text-accent-foreground font-semibold hover:opacity-90 transition-opacity"
          >
            Entre em Contato <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>
    </>
  );
};

export default Index;
