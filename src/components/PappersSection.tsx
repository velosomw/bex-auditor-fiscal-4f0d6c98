import { motion } from "framer-motion";
import { ArrowRight, ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";
import paper1 from "@/assets/paper-1.jpg";
import paper2 from "@/assets/paper-2.jpg";
import paper3 from "@/assets/paper-3.jpg";
import paper4 from "@/assets/paper-4.jpg";

const papers = [
  { title: "Reestruturação Financeira: Guia Prático para PMEs", date: "19 de Fevereiro de 2026", image: paper1, featured: true, tag: "Reestruturação" },
  { title: "Estudo Global de Sustentabilidade Corporativa", date: "15 de Fevereiro de 2026", image: paper2 },
  { title: "Novas regras de tributação da pessoa física", date: "16 de Janeiro de 2026", image: paper3 },
  { title: "Legislação & Tributos - Janeiro 2026", date: "13 de Janeiro de 2026", image: paper4 },
];

const PappersSection = () => {
  return (
    <section className="section-padding bg-background">
      <div className="max-w-7xl mx-auto">
        <h2 className="text-3xl font-display font-bold text-foreground mb-10">
          Pappers
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          {/* Featured card */}
          <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="md:row-span-1">
            <Link to="/insights" className="group relative block rounded-2xl overflow-hidden h-full min-h-[400px] md:min-h-0">
              <img src={papers[0].image} alt={papers[0].title} className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
              <div className="absolute inset-0 bg-gradient-to-t from-primary/90 via-primary/50 to-primary/20" />
              <div className="relative z-10 flex flex-col justify-between h-full p-6">
                <div>
                  <span className="inline-block px-3 py-1 rounded text-[10px] font-bold uppercase tracking-wider bg-primary-foreground/20 text-primary-foreground mb-3">
                    {papers[0].tag}
                  </span>
                </div>
                <div>
                  <h3 className="text-lg font-display font-bold text-primary-foreground mb-1 group-hover:text-accent transition-colors">
                    {papers[0].title}
                  </h3>
                  <p className="text-xs text-primary-foreground/60 uppercase tracking-wide mb-4">{papers[0].date}</p>
                  <span className="inline-flex items-center gap-1 text-sm font-semibold text-accent group-hover:gap-2 transition-all">
                    Saiba mais <ChevronRight className="w-4 h-4" />
                  </span>
                </div>
              </div>
            </Link>
          </motion.div>

          {/* Regular cards */}
          {papers.slice(1).map((paper, i) => (
            <motion.div key={paper.title} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: (i + 1) * 0.1 }}>
              <Link to="/insights" className="group block rounded-2xl overflow-hidden bg-card shadow-sm hover:shadow-xl transition-shadow duration-300 h-full">
                <div className="aspect-[3/2] overflow-hidden">
                  <img src={paper.image} alt={paper.title} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
                </div>
                <div className="p-5 flex flex-col justify-between min-h-[160px]">
                  <div>
                    <h3 className="font-display font-bold text-foreground text-base leading-snug mb-2 group-hover:text-accent transition-colors">
                      {paper.title}
                    </h3>
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">{paper.date}</p>
                  </div>
                  <span className="inline-flex items-center text-accent mt-4 group-hover:translate-x-1 transition-transform">
                    <ChevronRight className="w-5 h-5" />
                  </span>
                </div>
              </Link>
            </motion.div>
          ))}
        </div>

        <div className="flex justify-end mt-6">
          <Link to="/insights" className="inline-flex items-center gap-2 text-sm font-semibold text-accent hover:gap-3 transition-all">
            Ver todos os Pappers <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </section>
  );
};

export default PappersSection;
