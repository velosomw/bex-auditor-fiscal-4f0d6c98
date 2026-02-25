import { Link } from "react-router-dom";
import { ArrowRight, CheckCircle2, ChevronRight } from "lucide-react";
import imgConsultoria from "@/assets/solution-consultoria.jpg";
import PappersSection from "@/components/PappersSection";

const ConsultoriaCompleta = () => {
  return (
    <>
      <section className="section-padding bg-background">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-6">
            <Link to="/" className="hover:text-accent transition-colors">🏠</Link>
            <span>/</span>
            <Link to="/solucoes" className="hover:text-accent transition-colors">Soluções</Link>
            <span>/</span>
            <span className="text-foreground font-medium">Consultoria Completa</span>
          </div>
          <div className="relative rounded-3xl overflow-hidden bg-primary min-h-[280px] md:min-h-[320px] flex">
            <div className="relative z-10 flex-1 flex flex-col justify-center p-10 md:p-14 lg:p-16">
              <p className="text-accent text-sm font-semibold tracking-widest uppercase mb-3">Pacote Avançado</p>
              <h1 className="text-4xl md:text-5xl font-serif font-bold text-primary-foreground max-w-2xl mb-4">Consultoria Completa</h1>
              <p className="text-primary-foreground/70 max-w-md text-lg">
                Para empresas em crise aguda ou em ambiente judicial. Acompanhamento integral de 6 a 12 meses.
              </p>
            </div>
            <div className="hidden md:flex items-center justify-end w-[45%] overflow-hidden">
              <img src={imgConsultoria} alt="Consultoria Completa" className="w-full h-full object-cover" />
            </div>
          </div>
        </div>
      </section>

      {/* O que entregamos */}
      <section className="section-padding bg-background">
        <div className="max-w-7xl mx-auto">
          <div className="grid md:grid-cols-2 gap-0">
            <div className="pr-0 md:pr-10 pb-8 md:pb-0">
              <h2 className="text-2xl md:text-3xl font-serif font-bold text-foreground mb-6">O que entregamos</h2>
              <p className="text-muted-foreground leading-relaxed mb-4">
                Acompanhamento completo e integral durante 6 a 12 meses, incluindo suporte técnico em Recuperação Judicial e Extrajudicial, com relatórios mensais e treinamento gerencial.
              </p>
              <p className="text-muted-foreground leading-relaxed">
                Nossa consultoria oferece governança financeira aprimorada e indicadores de performance customizados para a recuperação sustentável da empresa.
              </p>
            </div>
            
            <div className="pl-0 md:pl-0">
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
                <div
                  key={item}
                  className="group flex items-center justify-between px-6 py-4 border-b border-border last:border-b-0 cursor-default hover:bg-muted/50 hover:pl-8 transition-all duration-300"
                >
                  <span className="text-sm font-medium text-foreground group-hover:text-accent transition-colors">
                    {item}
                  </span>
                  <ChevronRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Para quem é indicado */}
      <section className="px-6 md:px-12 lg:px-20 xl:px-32 py-6 lg:py-10">
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
                Empresas em crise aguda, em processo de Recuperação Judicial ou Extrajudicial, que precisam de acompanhamento especializado contínuo.
              </p>
              <div className="mb-8">
                <h3 className="font-semibold text-primary-foreground mb-2">Prazo</h3>
                <p className="text-sm text-primary-foreground/60">6 a 12 meses de acompanhamento integral.</p>
              </div>
              <Link
                to="/contato"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-md border border-primary-foreground/30 text-primary-foreground font-semibold hover:bg-accent hover:text-accent-foreground hover:border-accent transition-colors"
              >
                Solicitar Consultoria <ArrowRight className="w-4 h-4" />
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

      <PappersSection />
    </>
  );
};

export default ConsultoriaCompleta;
