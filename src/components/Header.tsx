import { useState, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { ChevronDown, Menu, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const navItems = [
  { label: "Insights", href: "/insights" },
  {
    label: "Soluções",
    href: "/solucoes",
    submenu: [
      { label: "Diagnóstico Rápido", href: "/solucoes/diagnostico-rapido" },
      { label: "Solvência + Plano de Reestruturação", href: "/solucoes/solvencia-reestruturacao" },
      { label: "Consultoria Completa", href: "/solucoes/consultoria-completa" },
    ],
  },
  { label: "Sobre Nós", href: "/sobre" },
  { label: "Contato", href: "/contato" },
];

const Header = () => {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [activeSubmenu, setActiveSubmenu] = useState<string | null>(null);
  const location = useLocation();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    setMobileOpen(false);
    setActiveSubmenu(null);
  }, [location]);

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled
          ? "bg-primary/95 backdrop-blur-md shadow-lg"
          : "bg-primary"
      }`}
    >
      <div className="max-w-7xl mx-auto flex items-center justify-between px-6 lg:px-12 h-16 lg:h-20">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2">
          <span className="text-2xl font-serif font-bold text-primary-foreground tracking-tight">
            BEX
          </span>
          <span className="text-sm font-sans text-accent font-medium tracking-widest uppercase">
            Auditoria
          </span>
        </Link>

        {/* Desktop Nav */}
        <nav className="hidden lg:flex items-center gap-1">
          {navItems.map((item) => (
            <div
              key={item.label}
              className="relative"
              onMouseEnter={() => item.submenu && setActiveSubmenu(item.label)}
              onMouseLeave={() => setActiveSubmenu(null)}
            >
              <Link
                to={item.href}
                className="flex items-center gap-1 px-5 py-2 text-sm font-medium text-primary-foreground/80 hover:text-accent transition-colors"
              >
                {item.label}
                {item.submenu && <ChevronDown className="w-3.5 h-3.5" />}
              </Link>

              {/* Submenu */}
              <AnimatePresence>
                {item.submenu && activeSubmenu === item.label && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 8 }}
                    transition={{ duration: 0.2 }}
                    className="absolute top-full left-0 pt-2 min-w-[320px]"
                  >
                    <div className="bg-card rounded-lg shadow-xl border border-border overflow-hidden">
                      {item.submenu.map((sub) => (
                        <Link
                          key={sub.href}
                          to={sub.href}
                          className="block px-6 py-4 text-sm font-medium text-foreground hover:bg-muted hover:text-accent transition-colors border-b border-border last:border-b-0"
                        >
                          {sub.label}
                        </Link>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ))}
        </nav>

        {/* CTA Desktop */}
        <Link
          to="/contato"
          className="hidden lg:inline-flex items-center px-6 py-2.5 rounded-md bg-accent text-accent-foreground text-sm font-semibold hover:opacity-90 transition-opacity"
        >
          Fale Conosco
        </Link>

        {/* Mobile Toggle */}
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="lg:hidden text-primary-foreground"
        >
          {mobileOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      {/* Mobile Menu */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="lg:hidden bg-primary border-t border-primary-foreground/10 overflow-hidden"
          >
            <nav className="px-6 py-4 space-y-1">
              {navItems.map((item) => (
                <div key={item.label}>
                  <div className="flex items-center justify-between">
                    <Link
                      to={item.href}
                      className="block py-3 text-primary-foreground/80 hover:text-accent font-medium transition-colors"
                    >
                      {item.label}
                    </Link>
                    {item.submenu && (
                      <button
                        onClick={() =>
                          setActiveSubmenu(activeSubmenu === item.label ? null : item.label)
                        }
                        className="p-2 text-primary-foreground/60"
                      >
                        <ChevronDown
                          className={`w-4 h-4 transition-transform ${
                            activeSubmenu === item.label ? "rotate-180" : ""
                          }`}
                        />
                      </button>
                    )}
                  </div>
                  <AnimatePresence>
                    {item.submenu && activeSubmenu === item.label && (
                      <motion.div
                        initial={{ height: 0 }}
                        animate={{ height: "auto" }}
                        exit={{ height: 0 }}
                        className="overflow-hidden pl-4"
                      >
                        {item.submenu.map((sub) => (
                          <Link
                            key={sub.href}
                            to={sub.href}
                            className="block py-2.5 text-sm text-primary-foreground/60 hover:text-accent transition-colors"
                          >
                            {sub.label}
                          </Link>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              ))}
              <Link
                to="/contato"
                className="block mt-4 text-center py-3 rounded-md bg-accent text-accent-foreground font-semibold"
              >
                Fale Conosco
              </Link>
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
};

export default Header;
