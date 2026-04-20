import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Building2, Plus, Search, CheckCircle2, Clock, Ban, CreditCard, Eye, ArrowLeft, MoreVertical, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import PlatformLayout from "@/components/PlatformLayout";
import CompanyRegisterDialog from "@/components/CompanyRegisterDialog";
import { listCompanies, updateCompanyStatus, updateCompanyPayment, deleteCompany, type Company, type CompanyStatus, type PaymentStatus } from "@/services/companiesService";
import { toast } from "@/hooks/use-toast";

const statusBadge = (s: CompanyStatus) => {
  if (s === "ativa") return <Badge className="bg-[hsl(142,76%,36%)]/15 text-[hsl(142,76%,36%)] hover:bg-[hsl(142,76%,36%)]/25"><CheckCircle2 className="w-3 h-3 mr-1" />Ativa</Badge>;
  if (s === "pendente") return <Badge className="bg-[hsl(38,92%,50%)]/15 text-[hsl(38,92%,50%)] hover:bg-[hsl(38,92%,50%)]/25"><Clock className="w-3 h-3 mr-1" />Pendente</Badge>;
  return <Badge className="bg-[hsl(0,84%,60%)]/15 text-[hsl(0,84%,60%)] hover:bg-[hsl(0,84%,60%)]/25"><Ban className="w-3 h-3 mr-1" />Bloqueada</Badge>;
};

const paymentBadge = (p: PaymentStatus) => {
  if (p === "em_dia") return <Badge variant="outline" className="border-[hsl(142,76%,36%)]/40 text-[hsl(142,76%,36%)]">Em dia</Badge>;
  if (p === "vencido") return <Badge variant="outline" className="border-[hsl(0,84%,60%)]/40 text-[hsl(0,84%,60%)]">Vencido</Badge>;
  return <Badge variant="outline">Isento</Badge>;
};

const Empresas = () => {
  const navigate = useNavigate();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [registerOpen, setRegisterOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<"todas" | "ativa" | "pendente" | "bloqueada">("todas");

  const refresh = async () => {
    setLoading(true);
    try { setCompanies(await listCompanies()); } catch {} 
    finally { setLoading(false); }
  };

  useEffect(() => { refresh(); }, []);

  const filtered = useMemo(() => {
    return companies.filter(c => {
      const matchTab = tab === "todas" || c.status === tab;
      const q = search.trim().toLowerCase();
      const matchSearch = !q || c.name.toLowerCase().includes(q) || (c.cnpj || "").toLowerCase().includes(q) || (c.city || "").toLowerCase().includes(q);
      return matchTab && matchSearch;
    });
  }, [companies, tab, search]);

  const counts = useMemo(() => ({
    todas: companies.length,
    ativa: companies.filter(c => c.status === "ativa").length,
    pendente: companies.filter(c => c.status === "pendente").length,
    bloqueada: companies.filter(c => c.status === "bloqueada").length,
    vencidos: companies.filter(c => c.payment_status === "vencido").length,
  }), [companies]);

  const handleStatusChange = async (id: string, status: CompanyStatus) => {
    try {
      await updateCompanyStatus(id, status);
      toast({ title: "Status atualizado", description: `Empresa marcada como ${status}.` });
      refresh();
    } catch (e: any) { toast({ title: "Erro", description: e.message, variant: "destructive" }); }
  };

  const handlePaymentChange = async (id: string, payment_status: PaymentStatus) => {
    try {
      await updateCompanyPayment(id, payment_status);
      toast({ title: "Pagamento atualizado" });
      refresh();
    } catch (e: any) { toast({ title: "Erro", description: e.message, variant: "destructive" }); }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Excluir a empresa "${name}"? Esta ação não pode ser desfeita.`)) return;
    try {
      await deleteCompany(id);
      toast({ title: "Empresa excluída" });
      refresh();
    } catch (e: any) { toast({ title: "Erro", description: e.message, variant: "destructive" }); }
  };

  return (
    <PlatformLayout>
      <div className="max-w-[1600px] mx-auto p-4 md:p-6 space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => navigate("/dashboard")} className="gap-1.5">
              <ArrowLeft className="w-4 h-4" /> Dashboard
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-foreground flex items-center gap-2"><Building2 className="w-6 h-6 text-[hsl(217,91%,50%)]" /> Empresas</h1>
              <p className="text-sm text-muted-foreground">Gestão de empresas, liberação de acesso e status de pagamento</p>
            </div>
          </div>
          <Button onClick={() => setRegisterOpen(true)} className="bg-[hsl(217,91%,50%)] hover:bg-[hsl(217,91%,45%)] text-white gap-1.5">
            <Plus className="w-4 h-4" /> Cadastrar Empresa
          </Button>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[
            { label: "Total", value: counts.todas, icon: Building2, color: "hsl(217,91%,50%)" },
            { label: "Ativas", value: counts.ativa, icon: CheckCircle2, color: "hsl(142,76%,36%)" },
            { label: "Pendentes", value: counts.pendente, icon: Clock, color: "hsl(38,92%,50%)" },
            { label: "Bloqueadas", value: counts.bloqueada, icon: Ban, color: "hsl(0,84%,60%)" },
            { label: "Pgto Vencido", value: counts.vencidos, icon: CreditCard, color: "hsl(0,84%,60%)" },
          ].map(k => (
            <Card key={k.label}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs text-muted-foreground">{k.label}</span>
                  <k.icon className="w-4 h-4" style={{ color: k.color }} />
                </div>
                <p className="text-2xl font-bold text-foreground">{k.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              <CardTitle className="text-base">Lista de Empresas</CardTitle>
              <div className="relative w-full md:w-72">
                <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
                <Input className="pl-8" placeholder="Buscar por nome, CNPJ ou cidade…" value={search} onChange={e => setSearch(e.target.value)} />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
              <TabsList>
                <TabsTrigger value="todas">Todas <span className="ml-1.5 text-[10px] opacity-70">({counts.todas})</span></TabsTrigger>
                <TabsTrigger value="ativa">Ativas <span className="ml-1.5 text-[10px] opacity-70">({counts.ativa})</span></TabsTrigger>
                <TabsTrigger value="pendente">Pendentes <span className="ml-1.5 text-[10px] opacity-70">({counts.pendente})</span></TabsTrigger>
                <TabsTrigger value="bloqueada">Bloqueadas <span className="ml-1.5 text-[10px] opacity-70">({counts.bloqueada})</span></TabsTrigger>
              </TabsList>
              <TabsContent value={tab} className="mt-4">
                {loading ? (
                  <p className="text-sm text-muted-foreground py-8 text-center">Carregando…</p>
                ) : filtered.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-8 text-center">Nenhuma empresa encontrada.</p>
                ) : (
                  <div className="rounded-lg border border-border overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Empresa</TableHead>
                          <TableHead>CNPJ</TableHead>
                          <TableHead>Cidade/UF</TableHead>
                          <TableHead>Origem</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Pagamento</TableHead>
                          <TableHead className="text-right">Ações</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filtered.map(c => (
                          <TableRow key={c.id}>
                            <TableCell>
                              <p className="font-medium text-foreground">{c.name}</p>
                              {c.contact_name && <p className="text-[11px] text-muted-foreground">{c.contact_name}{c.email ? ` • ${c.email}` : ""}</p>}
                            </TableCell>
                            <TableCell className="font-mono text-xs">{c.cnpj || "—"}</TableCell>
                            <TableCell className="text-xs">{[c.city, c.uf].filter(Boolean).join("/") || "—"}</TableCell>
                            <TableCell><Badge variant="outline" className="text-[10px]">{c.source === "site" ? "Site" : "Auditor"}</Badge></TableCell>
                            <TableCell>{statusBadge(c.status)}</TableCell>
                            <TableCell>{paymentBadge(c.payment_status)}</TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-1">
                                <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => navigate(`/empresa/${c.id}`)}>
                                  <Eye className="w-3.5 h-3.5 mr-1" /> Ver
                                </Button>
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0"><MoreVertical className="w-3.5 h-3.5" /></Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end" className="w-52">
                                    <DropdownMenuItem onClick={() => handleStatusChange(c.id, "ativa")} disabled={c.status === "ativa"}>
                                      <CheckCircle2 className="w-3.5 h-3.5 mr-2 text-[hsl(142,76%,36%)]" /> Liberar acesso (Ativa)
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => handleStatusChange(c.id, "pendente")} disabled={c.status === "pendente"}>
                                      <Clock className="w-3.5 h-3.5 mr-2 text-[hsl(38,92%,50%)]" /> Marcar como Pendente
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => handleStatusChange(c.id, "bloqueada")} disabled={c.status === "bloqueada"}>
                                      <Ban className="w-3.5 h-3.5 mr-2 text-[hsl(0,84%,60%)]" /> Bloquear acesso
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem onClick={() => handlePaymentChange(c.id, "em_dia")}>
                                      <CreditCard className="w-3.5 h-3.5 mr-2" /> Pagamento em dia
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => handlePaymentChange(c.id, "vencido")}>
                                      <CreditCard className="w-3.5 h-3.5 mr-2 text-[hsl(0,84%,60%)]" /> Marcar como Vencido
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem className="text-[hsl(0,84%,60%)]" onClick={() => handleDelete(c.id, c.name)}>
                                      <Trash2 className="w-3.5 h-3.5 mr-2" /> Excluir empresa
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>

      <CompanyRegisterDialog open={registerOpen} onOpenChange={setRegisterOpen} onCreated={refresh} />
    </PlatformLayout>
  );
};

export default Empresas;
