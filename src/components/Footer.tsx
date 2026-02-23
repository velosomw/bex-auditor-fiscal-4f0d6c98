import { Link } from "react-router-dom";
import { MapPin, Phone, Mail } from "lucide-react";

const Footer = () => {
  return (
    <footer className="bg-primary text-primary-foreground">
      <div className="max-w-7xl mx-auto px-6 lg:px-12 py-16">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12">
          {/* Brand */}
          <div>
            <Link to="/" className="inline-flex items-center gap-2 mb-4">
              <span className="text-2xl font-serif font-bold">BEX</span>
              <span className="text-sm text-accent font-medium tracking-widest uppercase">Auditoria</span>
            </Link>
            <p className="text-primary-foreground/60 text-sm leading-relaxed">
              Transparência na Reestruturação e Recuperação de Empresas. Inteligência financeira para o seu negócio.
            </p>
          </div>

          {/* Links */}
          <div>
            <h4 className="font-sans font-semibold text-sm uppercase tracking-wider mb-4 text-accent">Soluções</h4>
            <ul className="space-y-3 text-sm text-primary-foreground/60">
              <li><Link to="/solucoes/diagnostico-rapido" className="hover:text-accent transition-colors">Diagnóstico Rápido</Link></li>
              <li><Link to="/solucoes/solvencia-reestruturacao" className="hover:text-accent transition-colors">Solvência + Reestruturação</Link></li>
              <li><Link to="/solucoes/consultoria-completa" className="hover:text-accent transition-colors">Consultoria Completa</Link></li>
            </ul>
          </div>

          {/* Navigation */}
          <div>
            <h4 className="font-sans font-semibold text-sm uppercase tracking-wider mb-4 text-accent">Navegação</h4>
            <ul className="space-y-3 text-sm text-primary-foreground/60">
              <li><Link to="/insights" className="hover:text-accent transition-colors">Insights</Link></li>
              <li><Link to="/sobre" className="hover:text-accent transition-colors">Sobre Nós</Link></li>
              <li><Link to="/contato" className="hover:text-accent transition-colors">Contato</Link></li>
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h4 className="font-sans font-semibold text-sm uppercase tracking-wider mb-4 text-accent">Contato</h4>
            <ul className="space-y-3 text-sm text-primary-foreground/60">
              <li className="flex items-start gap-2">
                <MapPin className="w-4 h-4 mt-0.5 shrink-0 text-accent" />
                <span>Rua Cel. Oscar Porto, nº 736, 3º Andar, Paraíso, São Paulo/SP</span>
              </li>
              <li className="flex items-center gap-2">
                <Phone className="w-4 h-4 shrink-0 text-accent" />
                <span>(11) 3285-4472</span>
              </li>
              <li className="flex items-center gap-2">
                <Mail className="w-4 h-4 shrink-0 text-accent" />
                <span>contato@bexauditoria.com.br</span>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-12 pt-8 border-t border-primary-foreground/10 text-center text-xs text-primary-foreground/40">
          © {new Date().getFullYear()} BEX Auditoria. Todos os direitos reservados.
        </div>
      </div>
    </footer>
  );
};

export default Footer;
