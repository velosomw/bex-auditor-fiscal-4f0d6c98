import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import solutionsHero from "@/assets/solutions-hero.jpg";
import imgDiagnostico from "@/assets/solution-diagnostico.jpg";
import imgSolvencia from "@/assets/solution-solvencia.jpg";
import imgConsultoria from "@/assets/solution-consultoria.jpg";

const solutions = [
  {
    tag: "Pacote Básico",
    title: "Diagnóstico Rápido",
    desc: "Ideal para empresas que começam a sentir o peso das dívidas. Relatório Técnico-Financeiro com prioridades e oportunidades imediatas de renegociação.",
    href: "/solucoes/diagnostico-rapido",
    image: imgDiagnostico,
    features: ["Análise do passivo", "Fluxo de caixa", "Priorização de pagamentos", "Oportunidades de renegociação"],
  },
  {
    tag: "Pacote Intermediário",
    title: "Solvência + Plano de Reestruturação",
    desc: "Para empresas em crise moderada. Parecer de Solvência com modelos preditivos internacionais e Plano Financeiro com projeções e cenários.",
    href: "/solucoes/solvencia-reestruturacao",
    image: imgSolvencia,
    features: ["Z-Score, Kanitz, Matias", "Plano Financeiro completo", "Projeções e cenários", "Modelagem de reestruturação"],
  },
  {
    tag: "Pacote Avançado",
    title: "Consultoria Completa",
    desc: "Para empresas em crise aguda ou em ambiente judicial. Acompanhamento integral de 6 a 12 meses com suporte técnico completo.",
    href: "/solucoes/consultoria-completa",
    image: imgConsultoria,
    features: ["Laudo de Viabilidade", "Suporte integral em RJ/RE", "Dashboards mensais", "Treinamento gerencial"],
  },
];

const Solucoes = () => {
  return (
    <>
      {/* Hero */}
      <section className="relative py-24 md:py-32 overflow-hidden">
        <img
          src={solutionsHero}
          alt="Soluções BEX"
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div className="hero-overlay absolute inset-0" />
        <div className="relative z-10 max-w-7xl mx-auto px-6 lg:px-12">
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-accent text-sm font-semibold tracking-widest uppercase mb-3"
          >
            Nossas Soluções
          </motion.p>
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-4xl md:text-5xl font-serif font-bold text-primary-foreground max-w-2xl mb-4"
          >
            Soluções Estratégicas para sua Empresa
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="text-primary-foreground/70 max-w-xl"
          >
            Como podemos contribuir com a evolução dos seus negócios?
          </motion.p>
        </div>
      </section>

      {/* Intro */}
      <section className="section-padding bg-background">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-2xl md:text-3xl font-serif font-bold text-foreground mb-6">
            Exceder as expectativas é o que nos move
          </h2>
          <p className="text-muted-foreground leading-relaxed">
            Navegamos pelas oportunidades e incertezas com agilidade, integridade e governança para trazer recomendações significativas, pragmáticas e de valor agregado capazes de contribuir com o crescimento sustentável dos seus negócios.
          </p>
        </div>
      </section>

      {/* Solutions Grid */}
      <section className="section-padding bg-muted">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-3xl font-serif font-bold text-foreground mb-12 text-center">
            Nossos Pacotes
          </h2>
          <div className="grid md:grid-cols-3 gap-8">
            {solutions.map((sol, i) => (
              <motion.div
                key={sol.title}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.15 }}
              >
                <Link
                  to={sol.href}
                  className="group block bg-card rounded-2xl overflow-hidden shadow-sm hover:shadow-xl transition-shadow duration-300"
                >
                  <div className="aspect-[4/3] overflow-hidden">
                    <img
                      src={sol.image}
                      alt={sol.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                  </div>
                  <div className="p-6 pb-8">
                    <span className="text-xs font-semibold uppercase tracking-wider text-accent">
                      {sol.tag}
                    </span>
                    <h3 className="font-serif font-bold text-xl text-foreground mt-2 mb-3 group-hover:text-accent transition-colors">
                      {sol.title}
                    </h3>
                    <p className="text-sm text-muted-foreground leading-relaxed mb-4">{sol.desc}</p>
                    <span className="inline-flex items-center gap-2 text-sm font-semibold text-accent">
                      Saiba mais <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                    </span>
                  </div>
                </Link>
              </motion.div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
};

export default Solucoes;
