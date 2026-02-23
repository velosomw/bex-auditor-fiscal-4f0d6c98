import { Link } from "react-router-dom";
import { ArrowRight, CheckCircle2 } from "lucide-react";

const ConsultoriaCompleta = () => {
  return (
    <>
      <section className="relative py-24 md:py-32 bg-primary text-primary-foreground">
        <div className="max-w-7xl mx-auto px-6 lg:px-12">
          <p className="text-accent text-sm font-semibold tracking-widest uppercase mb-3">Pacote Avançado</p>
          <h1 className="text-4xl md:text-5xl font-serif font-bold max-w-2xl mb-4">Consultoria Completa</h1>
          <p className="text-primary-foreground/70 max-w-xl">
            Para empresas em crise aguda ou em ambiente judicial. Acompanhamento integral de 6 a 12 meses.
          </p>
        </div>
      </section>

      <section className="section-padding bg-background">
        <div className="max-w-4xl mx-auto">
          <div className="grid md:grid-cols-2 gap-12">
            <div>
              <h2 className="text-2xl font-serif font-bold text-foreground mb-6">O que entregamos</h2>
              <p className="text-muted-foreground leading-relaxed mb-6">
                Acompanhamento completo e integral durante 6 a 12 meses, incluindo suporte técnico em Recuperação Judicial e Extrajudicial, com relatórios mensais e treinamento gerencial.
              </p>
              <ul className="space-y-3">
                {[
                  "Laudo de Viabilidade Econômico-Financeira",
                  "Suporte integral em RJ/RE",
                  "Negociação direta com bancos e credores",
                  "Negociação com fornecedores estratégicos",
                  "Relatórios mensais de acompanhamento",
                  "Dashboards de performance financeira",
                  "Treinamento gerencial e financeiro",
                  "Governança financeira aprimorada",
                  "Indicadores de performance customizados",
                  "Educação financeira para gestão",
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
                Empresas em crise aguda, em processo de Recuperação Judicial ou Extrajudicial, que precisam de acompanhamento especializado contínuo.
              </p>
              <h3 className="font-serif font-bold text-lg text-foreground mb-4">Prazo</h3>
              <p className="text-sm text-muted-foreground mb-8">6 a 12 meses de acompanhamento integral.</p>
              <Link
                to="/contato"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-md bg-accent text-accent-foreground font-semibold hover:opacity-90 transition-opacity"
              >
                Solicitar Consultoria <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
};

export default ConsultoriaCompleta;
