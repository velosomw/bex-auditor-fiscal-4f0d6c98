import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Building2, Lock, Unlock, Trash2, ChevronDown, ChevronRight, Calculator } from "lucide-react";
import { toast } from "sonner";

type Firm = {
  id: string;
  name: string;
  cnpj: string;
  email: string;
  phone: string;
  status: string;
};

type Company = {
  id: string;
  name: string;
  cnpj: string | null;
  status: string;
  accounting_firm_id: string | null;
};

const FirmsCompaniesPanel = () => {
  const [firms, setFirms] = useState<Firm[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const load = async () => {
    setLoading(true);
    const [{ data: f }, { data: c }] = await Promise.all([
      supabase.from("accounting_firms").select("id,name,cnpj,email,phone,status").order("name"),
      supabase.from("companies").select("id,name,cnpj,status,accounting_firm_id").order("name"),
    ]);
    setFirms((f || []) as Firm[]);
    setCompanies((c || []) as Company[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const toggleBlock = async (firm: Firm) => {
    const next = firm.status === "bloqueada" ? "ativa" : "bloqueada";
    const { error } = await supabase.from("accounting_firms").update({ status: next }).eq("id", firm.id);
    if (error) return toast.error("Falha ao atualizar perfil: " + error.message);
    toast.success(next === "bloqueada" ? "Perfil bloqueado" : "Perfil desbloqueado");
    setFirms((prev) => prev.map((x) => (x.id === firm.id ? { ...x, status: next } : x)));
  };

  const deleteCompany = async (company: Company) => {
    if (!confirm(`Excluir definitivamente a empresa "${company.name}"?`)) return;
    const { error } = await supabase.from("companies").delete().eq("id", company.id);
    if (error) return toast.error("Falha ao excluir empresa: " + error.message);
    toast.success("Empresa excluída");
    setCompanies((prev) => prev.filter((c) => c.id !== company.id));
  };

  const companiesByFirm = (firmId: string) => companies.filter((c) => c.accounting_firm_id === firmId);
  const orphanCompanies = companies.filter((c) => !c.accounting_firm_id);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Calculator className="w-4 h-4 text-[hsl(217,91%,50%)]" />
          Perfis Contabilidade & Empresas
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading && <p className="text-xs text-muted-foreground">Carregando…</p>}
        {!loading && firms.length === 0 && (
          <p className="text-xs text-muted-foreground">Nenhum perfil de contabilidade cadastrado.</p>
        )}

        {firms.map((firm) => {
          const list = companiesByFirm(firm.id);
          const open = expanded[firm.id] ?? true;
          const blocked = firm.status === "bloqueada";
          return (
            <div key={firm.id} className={`rounded-lg border ${blocked ? "border-destructive/40 bg-destructive/5" : "border-border/60"}`}>
              <div className="flex items-center justify-between gap-3 p-3">
                <button
                  onClick={() => setExpanded((e) => ({ ...e, [firm.id]: !open }))}
                  className="flex items-center gap-2 min-w-0 text-left flex-1"
                >
                  {open ? <ChevronDown className="w-4 h-4 shrink-0" /> : <ChevronRight className="w-4 h-4 shrink-0" />}
                  <Calculator className="w-4 h-4 text-[hsl(217,91%,50%)] shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold truncate">{firm.name}</p>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {firm.cnpj || "CNPJ —"} · {firm.email || "sem e-mail"} · {list.length} empresa(s)
                    </p>
                  </div>
                </button>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge variant={blocked ? "destructive" : "outline"} className="text-[10px]">
                    {blocked ? "Bloqueada" : firm.status}
                  </Badge>
                  <Button size="sm" variant={blocked ? "default" : "outline"} className="h-8 gap-1.5 text-xs" onClick={() => toggleBlock(firm)}>
                    {blocked ? <><Unlock className="w-3.5 h-3.5" /> Desbloquear</> : <><Lock className="w-3.5 h-3.5" /> Bloquear</>}
                  </Button>
                </div>
              </div>

              {open && (
                <div className="border-t border-border/60 divide-y divide-border/60">
                  {list.length === 0 ? (
                    <p className="text-[11px] text-muted-foreground p-3">Sem empresas associadas.</p>
                  ) : (
                    list.map((c) => (
                      <div key={c.id} className="flex items-center justify-between gap-3 px-3 py-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <Building2 className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                          <div className="min-w-0">
                            <p className="text-xs font-medium truncate">{c.name}</p>
                            <p className="text-[10px] text-muted-foreground truncate">
                              {c.cnpj || "CNPJ —"} · {c.status}
                            </p>
                          </div>
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={() => deleteCompany(c)}
                          aria-label="Excluir empresa"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          );
        })}

        {orphanCompanies.length > 0 && (
          <div className="rounded-lg border border-border/60">
            <div className="px-3 py-2 border-b border-border/60">
              <p className="text-xs font-semibold">Empresas sem contabilidade vinculada</p>
            </div>
            <div className="divide-y divide-border/60">
              {orphanCompanies.map((c) => (
                <div key={c.id} className="flex items-center justify-between gap-3 px-3 py-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <Building2 className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs font-medium truncate">{c.name}</p>
                      <p className="text-[10px] text-muted-foreground truncate">{c.cnpj || "CNPJ —"} · {c.status}</p>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                    onClick={() => deleteCompany(c)}
                    aria-label="Excluir empresa"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default FirmsCompaniesPanel;
