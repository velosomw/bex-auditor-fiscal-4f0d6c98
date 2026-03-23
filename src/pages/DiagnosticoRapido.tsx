import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useState } from "react";
import { ArrowRight, ChevronRight, X } from "lucide-react";
import HeroBanner from "@/components/HeroBanner";
import videoDiagnostico from "@/assets/video-diagnostico.mp4";
import PappersSection from "@/components/PappersSection";

const topicDetails: Record<string, {title: string;intro: string;listTitle?: string;items: string[];conclusion: string;}> = {
  "Análise completa do passivo empresarial": {
    title: "Análise Completa do Passivo Empresarial",
    intro: "Realizamos um diagnóstico aprofundado de todas as obrigações financeiras da empresa, incluindo dívidas bancárias, fornecedores, tributos, encargos trabalhistas e compromissos contratuais.\n\nMais do que levantar valores, avaliamos:",
    items: ["Estrutura do endividamento", "Prazos e vencimentos", "Taxas de juros e encargos", "Grau de risco financeiro"],
    conclusion: "O objetivo é oferecer uma visão clara da real exposição financeira do negócio, identificando gargalos e riscos que comprometem a sustentabilidade da empresa."
  },
  "Mapeamento de fluxos de caixa": {
    title: "Mapeamento de Fluxos de Caixa",
    intro: "Organizamos e analisamos todas as entradas e saídas de recursos para entender o comportamento financeiro da empresa no curto e médio prazo.\n\nCom isso, identificamos:",
    items: ["Períodos de pressão de caixa", "Sazonalidades", "Descompassos entre receitas e despesas", "Necessidade real de capital de giro"],
    conclusion: "Esse mapeamento permite antecipar riscos e estruturar decisões financeiras mais seguras e estratégicas."
  },
  "Identificação de custos ocultos": {
    title: "Identificação de Custos Ocultos",
    intro: "Muitas empresas perdem margem sem perceber. Nossa análise identifica despesas invisíveis que impactam diretamente a lucratividade.\n\nMapeamos:",
    items: ["Desperdícios operacionais", "Contratos ineficientes", "Encargos financeiros excessivos", "Gastos recorrentes não estratégicos"],
    conclusion: "Ao eliminar custos ocultos, a empresa aumenta sua eficiência e recupera margem de forma imediata."
  },
  "Priorização de pagamentos": {
    title: "Priorização Estratégica de Pagamentos",
    intro: "Nem todas as dívidas têm o mesmo impacto. Classificamos as obrigações financeiras por grau de urgência, risco e custo.\n\nDefinimos prioridades com base em:",
    items: ["Impacto operacional", "Incidência de multas e juros", "Risco jurídico", "Pressão sobre o caixa"],
    conclusion: "Essa estratégia protege a empresa e preserva recursos nos momentos mais críticos."
  },
  "Oportunidades imediatas de renegociação": {
    title: "Oportunidades Imediatas de Renegociação",
    intro: "Identificamos passivos que podem ser renegociados para melhorar prazos, reduzir juros ou reestruturar parcelas.\n\nA análise aponta:",
    items: ["Dívidas com potencial de redução de encargos", "Contratos que permitem alongamento", "Ajustes viáveis conforme o fluxo de caixa atual"],
    conclusion: "O resultado é ganho de fôlego financeiro e redução de pressão no curto prazo."
  },
  "Relatório executivo com recomendações": {
    title: "Relatório Executivo com Recomendações Estratégicas",
    intro: "Ao final do diagnóstico, entregamos um relatório claro, objetivo e direcionado à tomada de decisão.\n\nO documento apresenta:",
    items: ["Panorama financeiro consolidado", "Principais riscos identificados", "Pontos críticos prioritários", "Plano de ação recomendado"],
    conclusion: "Transformamos dados financeiros em decisões estratégicas."
  }
};

const topics = [
"Análise completa do passivo empresarial",
"Mapeamento de fluxos de caixa",
"Identificação de custos ocultos",
"Priorização de pagamentos",
"Oportunidades imediatas de renegociação",
"Relatório executivo com recomendações"];


const DiagnosticoRapido = () => {
  const [activeTopic, setActiveTopic] = useState<string | null>(null);
  const detail = activeTopic ? topicDetails[activeTopic] : null;

  return (
    <>
      <HeroBanner
        title="Diagnóstico Rápido"
        subtitle="Ideal para empresas que começam a sentir o peso das dívidas e precisam de clareza sobre suas prioridades financeiras."
        videoSrc={videoDiagnostico}
        breadcrumbs={[
        { label: "🏠", href: "/" },
        { label: "Soluções", href: "/solucoes" },
        { label: "Diagnóstico Rápido" }]
        } />
      

      {/* O que entregamos */}
      <section className="section-padding bg-background">
        <div className="max-w-7xl mx-auto">
          <div className="grid md:grid-cols-2 gap-0">
            <div className="pr-0 md:pr-10 pb-8 md:pb-0">
              <h2 className="text-2xl md:text-3xl font-display font-bold text-foreground mb-6">O que entregamos</h2>
              <p className="text-muted-foreground leading-relaxed mb-4">
                Relatório Técnico-Financeiro completo com prioridades e oportunidades imediatas de renegociação. Levantamos, classificamos e analisamos todo o passivo, fluxos de caixa e estrutura de custos da sua empresa.
              </p>
              <p className="text-muted-foreground leading-relaxed">
                Nosso diagnóstico oferece uma visão clara e objetiva da situação financeira, permitindo decisões estratégicas fundamentadas.
              </p>
            </div>
            <div className="pl-0 md:pl-0 relative">
              {topics.map((item) =>
              <div key={item}>
                  <button
                  onClick={() => setActiveTopic(activeTopic === item ? null : item)}
                  className={`group w-full flex items-center justify-between px-6 py-4 border-b border-border last:border-b-0 cursor-pointer hover:bg-muted/50 hover:pl-8 transition-all duration-300 text-left ${activeTopic === item ? 'bg-muted/50 pl-8' : ''}`}>
                  
                    <span className={`text-sm font-medium transition-colors ${activeTopic === item ? 'text-accent' : 'text-foreground group-hover:text-accent'}`}>{item}</span>
                    <ChevronRight className={`w-4 h-4 text-muted-foreground transition-all duration-300 ${activeTopic === item ? 'opacity-100 rotate-90 text-accent' : 'opacity-0 group-hover:opacity-100'}`} />
                  </button>
                  <AnimatePresence>
                    {activeTopic === item && detail &&
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.3, ease: "easeInOut" }}
                    className="overflow-hidden">
                    
                        <div className="px-6 py-5 bg-muted/30 border-b border-border">
                          <h4 className="font-display font-bold text-foreground mb-3">{detail.title}</h4>
                          {detail.intro.split('\n\n').map((p, i) =>
                      <p key={i} className="text-sm text-muted-foreground leading-relaxed mb-3">{p}</p>
                      )}
                          <ul className="space-y-1.5 mb-3 ml-1">
                            {detail.items.map((li) =>
                        <li key={li} className="flex items-center gap-2 text-sm text-foreground">
                                <span className="w-1.5 h-1.5 rounded-full bg-accent shrink-0" />
                                {li}
                              </li>
                        )}
                          </ul>
                          <p className="text-sm text-muted-foreground leading-relaxed italic">{detail.conclusion}</p>
                        </div>
                      </motion.div>
                  }
                  </AnimatePresence>
                </div>
              )}
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
              <h2 className="text-2xl md:text-3xl font-display font-bold text-primary-foreground mb-4">
                Para quem é indicado?
              </h2>
              <p className="text-primary-foreground/70 leading-relaxed mb-6">
                Empresas que estão começando a enfrentar dificuldades financeiras e desejam um panorama claro da situação antes de tomar decisões estratégicas.
              </p>
              <div className="mb-8">
                <h3 className="font-semibold text-primary-foreground mb-2">Prazo estimado</h3>
                <p className="text-sm text-primary-foreground/60"></p>
              </div>
              <Link
                to="/contato"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-md border border-primary-foreground/30 text-primary-foreground font-semibold hover:bg-accent hover:text-accent-foreground hover:border-accent transition-colors">
                
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

      <PappersSection />
    </>);

};

export default DiagnosticoRapido;