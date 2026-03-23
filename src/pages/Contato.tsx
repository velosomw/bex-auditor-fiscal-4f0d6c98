import { motion } from "framer-motion";
import { MapPin, Phone, Mail, Clock } from "lucide-react";
import HeroBanner from "@/components/HeroBanner";
import videoContato from "@/assets/video-contato.mp4";

const Contato = () => {
  return (
    <>
      <HeroBanner
        title="Contato"
        subtitle="Entre em contato com nossos especialistas para uma avaliação inicial sem compromisso."
        videoSrc={videoContato} />
      

      <section className="section-padding bg-background">
        <div className="max-w-7xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-16">
            {/* Form */}
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}>
              
              <h2 className="text-2xl font-display font-bold text-foreground mb-6">Envie sua mensagem</h2>
              <form className="space-y-5" onSubmit={(e) => e.preventDefault()}>
                <div className="grid md:grid-cols-2 gap-5">
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1.5">Nome</label>
                    <input type="text" className="w-full px-4 py-3 rounded-md border border-border bg-card text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-accent" placeholder="Seu nome" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1.5">Empresa</label>
                    <input type="text" className="w-full px-4 py-3 rounded-md border border-border bg-card text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-accent" placeholder="Nome da empresa" />
                  </div>
                </div>
                <div className="grid md:grid-cols-2 gap-5">
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1.5">E-mail</label>
                    <input type="email" className="w-full px-4 py-3 rounded-md border border-border bg-card text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-accent" placeholder="seu@email.com" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1.5">Telefone</label>
                    <input type="tel" className="w-full px-4 py-3 rounded-md border border-border bg-card text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-accent" placeholder="(11) 99999-9999" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1.5">Solução de interesse</label>
                  <select className="w-full px-4 py-3 rounded-md border border-border bg-card text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-accent">
                    <option>Selecione...</option>
                    <option>Diagnóstico Rápido</option>
                    <option>Solvência + Plano de Reestruturação</option>
                    <option>Consultoria Completa</option>
                    <option>Outro</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1.5">Mensagem</label>
                  <textarea rows={4} className="w-full px-4 py-3 rounded-md border border-border bg-card text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-accent resize-none" placeholder="Descreva brevemente sua situação..." />
                </div>
                <button type="submit" className="px-8 py-3 rounded-md text-white font-semibold hover:opacity-90 transition-opacity [background:var(--btn-gradient)]">
                  Enviar Mensagem
                </button>
              </form>
            </motion.div>

            {/* Info */}
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              className="space-y-8">
              
              <div>
                <h2 className="text-2xl font-display font-bold text-foreground mb-6">Informações de Contato</h2>
                <div className="space-y-6">
                  <div className="flex gap-4">
                    <MapPin className="w-5 h-5 text-accent shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold text-sm text-foreground">São Paulo/SP</p>
                      <p className="text-sm text-muted-foreground">Rua Cel. Oscar Porto, nº 736, 3º Andar, Paraíso, CEP: 04003-003</p>
                    </div>
                  </div>
                  <div className="flex gap-4">
                    <Phone className="w-5 h-5 text-accent shrink-0" />
                    <p className="text-sm text-foreground">(11) 3285-4472</p>
                  </div>
                  <div className="flex gap-4">
                    <Mail className="w-5 h-5 text-accent shrink-0" />
                    <p className="text-sm text-foreground"><p className="text-sm text-foreground">contato@brasilexpert.com.br</p></p>
                  </div>
                  <div className="flex gap-4">
                    <Clock className="w-5 h-5 text-accent shrink-0" />
                    <p className="text-sm text-foreground">Seg-Sex: 9h às 18h</p>
                  </div>
                </div>
              </div>

              <div className="bg-primary rounded-lg p-8 text-primary-foreground">
                <h3 className="font-display font-bold text-lg mb-3">Avaliação Inicial Gratuita</h3>
                <p className="text-sm text-primary-foreground/70 leading-relaxed">
                  Agende uma conversa sem compromisso com nossos especialistas. Analisamos brevemente sua situação e indicamos o melhor caminho para sua empresa.
                </p>
              </div>
            </motion.div>
          </div>
        </div>
      </section>
    </>);

};

export default Contato;