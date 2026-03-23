import { motion } from "framer-motion";
import aboutBg from "@/assets/about-bg.jpg";
import HeroBanner from "@/components/HeroBanner";
import videoSobre from "@/assets/video-sobre.mp4";

const Sobre = () => {
  return (
    <>
      <HeroBanner
        title="Sobre Nós"
        subtitle="Conheça a BEX Auditoria e nossa missão de transformar desafios financeiros em oportunidades de crescimento."
        videoSrc={videoSobre} />
      

      <section className="section-padding bg-background">
        <div className="max-w-7xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <motion.div
              initial={{ opacity: 0, x: -30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}>
              
              <h2 className="text-3xl font-display font-bold text-foreground mb-6">
                Inteligência financeira para o seu negócio
              </h2>
              <p className="text-muted-foreground leading-relaxed mb-4">
                Em um cenário de juros elevados, pressão competitiva e dificuldade de acesso a crédito, muitas empresas enfrentam riscos de insolvência — e é exatamente aqui que nosso escritório se torna um aliado estratégico.
              </p>
              <p className="text-muted-foreground leading-relaxed mb-4">
                Nossa proposta é oferecer muito mais do que contabilidade: entregamos inteligência financeira, capacidade analítica e soluções estruturadas para restaurar a saúde econômico-financeira do negócio.
              </p>
              <p className="text-muted-foreground leading-relaxed">
                ​
              </p>
            </motion.div>
            <motion.img
              initial={{ opacity: 0, x: 30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              src={aboutBg}
              alt="Equipe BEX Auditoria"
              className="rounded-lg shadow-xl w-full object-cover aspect-[4/3]" />
            
          </div>
        </div>
      </section>

      {/* Values */}
      <section className="section-padding bg-muted">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-3xl font-display font-bold text-foreground mb-12 text-center">Nossos Valores</h2>
          <div className="grid md:grid-cols-3 gap-8">
            {[
            { title: "Transparência", desc: "Clareza total em cada etapa do processo. Relatórios objetivos e comunicação direta." },
            { title: "Excelência Técnica", desc: "Metodologias reconhecidas internacionalmente e equipe altamente qualificada." },
            { title: "Compromisso com Resultados", desc: "Foco na entrega de resultados mensuráveis e sustentáveis para cada cliente." }].
            map((v, i) =>
            <motion.div
              key={v.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.15 }}
              className="bg-card rounded-lg p-8 border border-border card-hover">
              
                <h3 className="font-display font-bold text-lg text-foreground mb-3">{v.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{v.desc}</p>
              </motion.div>
            )}
          </div>
        </div>
      </section>

      {/* Locations */}
      <section className="section-padding bg-background">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl font-display font-bold text-foreground mb-12">Nossos Escritórios</h2>
          <div className="flex justify-center">
            <div className="bg-card rounded-lg p-8 border border-border">
              <h3 className="font-display font-bold text-foreground mb-2">São Paulo/SP</h3>
              <p className="text-sm text-muted-foreground">Rua Cel. Oscar Porto, nº 736, 3º Andar, Paraíso</p>
              <p className="text-sm text-muted-foreground">CEP: 04003-003</p>
              <p className="text-sm text-accent mt-2">Tel.: (11) 3285-4472</p>
            </div>
          </div>
        </div>
      </section>
    </>);

};

export default Sobre;