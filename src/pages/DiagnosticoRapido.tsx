import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight, CheckCircle2 } from "lucide-react";

const DiagnosticoRapido = () => {
  return (
    <>
      <section className="relative py-24 md:py-32 bg-primary text-primary-foreground">
        <div className="max-w-7xl mx-auto px-6 lg:px-12">
          <p className="text-accent text-sm font-semibold tracking-widest uppercase mb-3">Pacote Básico</p>
          <h1 className="text-4xl md:text-5xl font-serif font-bold max-w-2xl mb-4">Diagnóstico Rápido</h1>
          <p className="text-primary-foreground/70 max-w-xl">
            Ideal para empresas que começam a sentir o peso das dívidas e precisam de clareza sobre suas prioridades financeiras.
          </p>
        </div>
      </section>

      {/* O que entregamos */}
      <section className="section-padding bg-background">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl font-serif font-bold text-foreground mb-6">O que entregamos</h2>
          <p className="text-muted-foreground leading-relaxed mb-8">
            Relatório Técnico-Financeiro completo com prioridades e oportunidades imediatas de renegociação. Levantamos, classificamos e analisamos todo o passivo, fluxos de caixa e estrutura de custos da sua empresa.
          </p>
          <div className="grid sm:grid-cols-2 gap-4">
            {[
              "Análise completa do passivo empresarial",
              "Mapeamento de fluxos de caixa",
              "Identificação de custos ocultos",
              "Priorização de pagamentos",
              "Oportunidades imediatas de renegociação",
              "Relatório executivo com recomendações",
            ].map((item) => (
              <div key={item} className="flex items-center gap-3 text-sm text-foreground">
                <CheckCircle2 className="w-5 h-5 text-accent shrink-0" />
                {item}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Para quem é indicado */}
      <section className="px-6 md:px-12 lg:px-20 xl:px-32 py-16 lg:py-24">
        <div className="max-w-7xl mx-auto rounded-3xl bg-primary overflow-hidden">
          <div className="grid md:grid-cols-2">
            <div className="p-10 md:p-14">
              <span className="inline-block px-4 py-1.5 rounded-full bg-accent/20 text-accent text-xs font-semibold uppercase tracking-wider mb-6">
                Indicação
              </span>
              <h2 className="text-2xl md:text-3xl font-serif font-bold text-primary-foreground mb-4">
                Para quem é indicado?
              </h2>
              <p className="text-primary-foreground/70 leading-relaxed mb-6">
                Empresas que estão começando a enfrentar dificuldades financeiras e desejam um panorama claro da situação antes de tomar decisões estratégicas.
              </p>
              <div className="mb-8">
                <h3 className="font-semibold text-primary-foreground mb-2">Prazo estimado</h3>
                <p className="text-sm text-primary-foreground/60">2 a 4 semanas para entrega do relatório completo.</p>
              </div>
              <Link
                to="/contato"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-md border border-primary-foreground/30 text-primary-foreground font-semibold hover:bg-accent hover:text-accent-foreground hover:border-accent transition-colors"
              >
                Solicitar Diagnóstico <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
            <div className="hidden md:flex items-center justify-center p-14 relative overflow-hidden">
              <div className="absolute inset-0 opacity-10">
                <svg viewBox="0 0 400 400" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-full h-full text-primary-foreground">
                  <circle cx="300" cy="200" r="180" />
                  <circle cx="150" cy="300" r="120" />
                  <circle cx="200" cy="100" r="80" />
                </svg>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
};

export default DiagnosticoRapido;
