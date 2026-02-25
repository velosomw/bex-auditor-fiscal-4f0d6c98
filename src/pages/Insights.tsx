import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";

const insights = [
  {
    category: "Reestruturação",
    title: "Como identificar sinais de crise financeira antes que seja tarde",
    excerpt: "Conheça os indicadores-chave que podem antecipar problemas de solvência na sua empresa e como agir preventivamente.",
    date: "20 Fev 2026",
  },
  {
    category: "Gestão Financeira",
    title: "Z-Score de Altman: o modelo preditivo que pode salvar sua empresa",
    excerpt: "Entenda como o modelo Z-Score funciona e por que ele é usado internacionalmente para avaliar riscos de insolvência.",
    date: "15 Fev 2026",
  },
  {
    category: "Recuperação Judicial",
    title: "Recuperação Judicial vs. Extrajudicial: qual o melhor caminho?",
    excerpt: "Análise comparativa das duas modalidades de recuperação empresarial, com prós, contras e recomendações estratégicas.",
    date: "10 Fev 2026",
  },
  {
    category: "Tendências",
    title: "O impacto dos juros elevados na saúde financeira das PMEs brasileiras",
    excerpt: "Como o cenário macroeconômico atual afeta diretamente as pequenas e médias empresas e estratégias de mitigação.",
    date: "05 Fev 2026",
  },
];

const Insights = () => {
  return (
    <>
      <section className="relative py-24 md:py-32 bg-primary text-primary-foreground">
        <div className="max-w-7xl mx-auto px-6 lg:px-12">
          <h1 className="text-4xl md:text-5xl font-display font-bold max-w-2xl mb-4">Insights</h1>
          <p className="text-primary-foreground/70 max-w-xl">
            Artigos, análises e publicações sobre reestruturação financeira, gestão de solvência e recuperação empresarial.
          </p>
        </div>
      </section>

      <section className="section-padding bg-background">
        <div className="max-w-7xl mx-auto">
          <div className="grid md:grid-cols-2 gap-8">
            {insights.map((item, i) => (
              <motion.article
                key={item.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className="bg-card rounded-lg border border-border card-hover p-8"
              >
                <div className="flex items-center gap-3 mb-4">
                  <span className="text-xs font-semibold uppercase tracking-wider text-accent">{item.category}</span>
                  <span className="text-xs text-muted-foreground">{item.date}</span>
                </div>
                <h2 className="font-display font-bold text-xl text-foreground mb-3">{item.title}</h2>
                <p className="text-sm text-muted-foreground leading-relaxed mb-4">{item.excerpt}</p>
                <span className="inline-flex items-center gap-1 text-sm font-semibold text-accent cursor-pointer hover:underline">
                  Ler mais <ArrowRight className="w-4 h-4" />
                </span>
              </motion.article>
            ))}
          </div>
        </div>
      </section>
    </>
  );
};

export default Insights;
