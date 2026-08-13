import { useState, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { ChevronDown, Menu, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import logoBex from "@/assets/logo-bex-brasil-expert.png";

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
  { label: "Planos", href: "/planos" },
  { label: "Sobre Nós", href: "/sobre" },
  { label: "Contato", href: "/contato" },
];

const slugify = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-");

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

  // Keyboard: Escape closes any open submenu and returns focus to its trigger
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && activeSubmenu) {
        const trigger = document.getElementById(`submenu-trigger-${slugify(activeSubmenu)}`);
        setActiveSubmenu(null);
        trigger?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [activeSubmenu]);

  return (
    <>
      {/* QA Conciliação Técnica banner */}
      <div
        className="fixed top-0 left-0 right-0 z-[60] h-9 flex items-center justify-center bg-accent text-accent-foreground text-xs md:text-sm font-medium px-4 text-center"
        role="banner"
        aria-label="Ambiente de homologação Kanitz"
      >
        <span className="truncate">
          Este ambiente Kanitz (QA) está em Conciliação Técnica. Acesse o ambiente produtivo:{" "}
          <a
            href="https://www.kanitzbex.com.br"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-foreground/50 rounded px-1 -mx-1"
          >
            www.kanitzbex.com.br
          </a>
        </span>
      </div>

      <header
        className={`fixed top-9 left-0 right-0 z-50 transition-all duration-300 border-b border-border ${
          scrolled
            ? "bg-white/95 backdrop-blur-md shadow-lg"
            : "bg-white"
        }`}
      >
      <div className="max-w-7xl mx-auto flex items-center justify-between px-6 lg:px-12 h-16 lg:h-20">
        {/* Logo */}
        <Link to="/" className="flex items-center py-2 -ml-2 px-2 rounded-md hover:opacity-80 transition-opacity">
          <img 
            src={logoBex} 
            alt="BEX Brasil Expert" 
            className="h-10 lg:h-12 w-auto object-contain"
          />
        </Link>

        {/* Desktop Nav */}
        <nav className="hidden lg:flex items-center gap-1" aria-label="Principal">
          {navItems.map((item) => {
            const submenuId = `submenu-${slugify(item.label)}`;
            const triggerId = `submenu-trigger-${slugify(item.label)}`;
            const isOpen = activeSubmenu === item.label;
            return (
              <div
                key={item.label}
                className="relative"
                onMouseEnter={() => item.submenu && setActiveSubmenu(item.label)}
                onMouseLeave={() => setActiveSubmenu(null)}
                onFocus={() => item.submenu && setActiveSubmenu(item.label)}
                onBlur={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                    setActiveSubmenu(null);
                  }
                }}
              >
                <Link
                  to={item.href}
                  className="flex items-center gap-1 px-5 py-2 text-sm font-medium text-primary hover:text-accent transition-colors rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  {item.label}
                  {item.submenu && (
                    <button
                      id={triggerId}
                      type="button"
                      aria-haspopup="menu"
                      aria-expanded={isOpen}
                      aria-controls={submenuId}
                      aria-label={`${isOpen ? "Fechar" : "Abrir"} submenu ${item.label}`}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setActiveSubmenu(isOpen ? null : item.label);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "ArrowDown") {
                          e.preventDefault();
                          setActiveSubmenu(item.label);
                          requestAnimationFrame(() => {
                            const first = document.querySelector<HTMLAnchorElement>(
                              `#${submenuId} a`
                            );
                            first?.focus();
                          });
                        }
                      }}
                      className="p-1 -mr-1 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                    >
                      <ChevronDown
                        className={`w-3.5 h-3.5 transition-transform ${isOpen ? "rotate-180" : ""}`}
                      />
                    </button>
                  )}
                </Link>

                {/* Submenu */}
                <AnimatePresence>
                  {item.submenu && isOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 8 }}
                      transition={{ duration: 0.2 }}
                      className="absolute top-full left-0 pt-2 min-w-[320px]"
                    >
                      <div
                        id={submenuId}
                        role="menu"
                        aria-label={item.label}
                        className="bg-card rounded-lg shadow-xl border border-border overflow-hidden"
                      >
                        {item.submenu.map((sub) => (
                          <Link
                            key={sub.href}
                            to={sub.href}
                            role="menuitem"
                            className="block px-6 py-4 text-sm font-medium text-foreground hover:bg-muted hover:text-accent transition-colors border-b border-border last:border-b-0 focus-visible:outline-none focus-visible:bg-muted focus-visible:text-accent"
                          >
                            {sub.label}
                          </Link>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </nav>

        {/* CTA Desktop */}
        <div className="hidden lg:flex items-center gap-3">
          <Link
            to="/contato"
            className="inline-flex items-center gap-2 px-6 py-2.5 rounded-md font-semibold transition-all border border-primary/30 text-primary bg-transparent hover:[background:var(--btn-gradient)] hover:text-white hover:border-transparent"
          >
            Fale Conosco
          </Link>
          <Link
            to="/login"
            className="inline-flex items-center gap-2 px-6 py-2.5 rounded-md text-white font-semibold hover:opacity-90 transition-opacity [background:var(--btn-gradient)]"
          >
            Acessar a Plataforma
          </Link>
        </div>

        {/* Mobile Toggle */}
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label={mobileOpen ? "Fechar menu" : "Abrir menu"}
          aria-expanded={mobileOpen}
          aria-controls="mobile-menu"
          className="lg:hidden text-primary p-2 -mr-2 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
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
            id="mobile-menu"
            className="lg:hidden bg-white border-t border-border overflow-hidden"
          >
            <nav className="px-6 py-4 space-y-1" aria-label="Mobile">
              {navItems.map((item) => {
                const submenuId = `mobile-submenu-${slugify(item.label)}`;
                const triggerId = `mobile-submenu-trigger-${slugify(item.label)}`;
                const isOpen = activeSubmenu === item.label;
                return (
                  <div key={item.label} className="border-b border-border/50 last:border-b-0">
                    <div className="flex items-center justify-between min-h-[48px]">
                      <Link
                        to={item.href}
                        className="flex-1 py-3 text-primary hover:text-accent font-medium transition-colors rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                      >
                        {item.label}
                      </Link>
                      {item.submenu && (
                        <button
                          id={triggerId}
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setActiveSubmenu(isOpen ? null : item.label);
                          }}
                          aria-label={`${isOpen ? "Fechar" : "Abrir"} submenu ${item.label}`}
                          aria-expanded={isOpen}
                          aria-controls={submenuId}
                          className="p-3 -mr-2 text-primary/60 hover:text-accent transition-colors rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                        >
                          <ChevronDown
                            className={`w-4 h-4 transition-transform ${isOpen ? "rotate-180" : ""}`}
                          />
                        </button>
                      )}
                    </div>
                    <AnimatePresence initial={false}>
                      {item.submenu && isOpen && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          className="overflow-hidden"
                        >
                          <div id={submenuId} role="menu" aria-label={item.label} className="pl-4 pb-2 space-y-1">
                            {item.submenu.map((sub) => (
                              <Link
                                key={sub.href}
                                to={sub.href}
                                role="menuitem"
                                className="block py-2.5 text-sm text-muted-foreground hover:text-accent transition-colors rounded focus-visible:outline-none focus-visible:text-accent"
                              >
                                {sub.label}
                              </Link>
                            ))}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
                <Link
                to="/contato"
                className="block mt-4 text-center py-3 rounded-md text-white font-semibold hover:opacity-90 transition-opacity [background:var(--btn-gradient)]"
              >
                Fale Conosco
              </Link>
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
    </>
  );
};

export default Header;
