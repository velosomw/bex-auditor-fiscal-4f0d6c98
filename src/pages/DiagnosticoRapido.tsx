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

      <section className="section-padding bg-background">
        <div className="max-w-4xl mx-auto">
          <div className="grid md:grid-cols-2 gap-12">
            <div>
              <h2 className="text-2xl font-serif font-bold text-foreground mb-6">O que entregamos</h2>
              <p className="text-muted-foreground leading-relaxed mb-6">
                Relatório Técnico-Financeiro completo com prioridades e oportunidades imediatas de renegociação. Levantamos, classificamos e analisamos todo o passivo, fluxos de caixa e estrutura de custos da sua empresa.
              </p>
              <ul className="space-y-3">
                {[
                  "Análise completa do passivo empresarial",
                  "Mapeamento de fluxos de caixa",
                  "Identificação de custos ocultos",
                  "Priorização de pagamentos",
                  "Oportunidades imediatas de renegociação",
                  "Relatório executivo com recomendações",
                ].map((item) => (
                  <li key={item} className="flex items-center gap-3 text-sm text-foreground">
                    <CheckCircle2 className="w-5 h-5 text-accent shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <div className="bg-muted rounded-lg p-8">
              <h3 className="font-serif font-bold text-lg text-foreground mb-4">Para quem é indicado?</h3>
              <p className="text-sm text-muted-foreground leading-relaxed mb-6">
                Empresas que estão começando a enfrentar dificuldades financeiras e desejam um panorama claro da situação antes de tomar decisões estratégicas.
              </p>
              <h3 className="font-serif font-bold text-lg text-foreground mb-4">Prazo estimado</h3>
              <p className="text-sm text-muted-foreground mb-8">2 a 4 semanas para entrega do relatório completo.</p>
              <Link
                to="/contato"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-md bg-accent text-accent-foreground font-semibold hover:opacity-90 transition-opacity"
              >
                Solicitar Diagnóstico <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
};

export default DiagnosticoRapido;
