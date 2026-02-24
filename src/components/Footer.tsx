import { Link } from "react-router-dom";
import { MapPin, Phone, Mail, Shield, User, Building2, Brain } from "lucide-react";

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

        {/* Platform Access */}
        <div className="mt-12 pt-8 border-t border-primary-foreground/10">
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-8">
            <span className="text-sm text-primary-foreground/50">Acesso à Plataforma:</span>
            <div className="flex gap-3">
              <Link
                to="/login"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-md bg-accent/10 border border-accent/20 text-accent text-sm font-semibold hover:bg-accent/20 transition-colors"
              >
                <Shield className="w-4 h-4" />
                Auditor Chefe
              </Link>
              <Link
                to="/login"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-md bg-primary-foreground/5 border border-primary-foreground/10 text-primary-foreground/70 text-sm font-semibold hover:bg-primary-foreground/10 transition-colors"
              >
                <Building2 className="w-4 h-4" />
                Empresa
              </Link>
              <Link
                to="/login"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-md bg-primary-foreground/5 border border-primary-foreground/10 text-primary-foreground/70 text-sm font-semibold hover:bg-primary-foreground/10 transition-colors"
              >
                <User className="w-4 h-4" />
                Usuário
              </Link>
              <Link
                to="/login"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-md bg-[hsl(258,90%,66%)]/10 border border-[hsl(258,90%,66%)]/20 text-[hsl(258,90%,66%)] text-sm font-semibold hover:bg-[hsl(258,90%,66%)]/20 transition-colors"
              >
                <Brain className="w-4 h-4" />
                Gestor IA
              </Link>
            </div>
          </div>

          <div className="text-center text-xs text-primary-foreground/40">
            © {new Date().getFullYear()} BEX Auditoria. Todos os direitos reservados.
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
