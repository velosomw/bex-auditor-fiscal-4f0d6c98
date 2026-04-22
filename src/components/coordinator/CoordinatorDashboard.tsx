import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Building2, Users, Activity, Search, X, Mail, Phone, MapPin,
  Calendar, Briefcase, ShieldCheck, FileText, ArrowUpRight,
} from "lucide-react";
import { listCompanies, type Company } from "@/services/companiesService";
import { supabase } from "@/integrations/supabase/client";

/* ─── Types ─── */
type Accountant = {
  id: string;
  name: string;
  email: string;
  empresas: number;
  consultores: number;
  status: "ativa" | "pendente" | "bloqueada";
};

type ConsultantUser = {
  id: string;
  full_name: string;
  email?: string | null;
  role: string;
  created_at: string;
};

type AccessLog = {
  id: string;
  user: string;
  email: string;
  role: string;
  when: string;
  ip: string;
};

type Movement = {
  id: string;
  who: string;
  action: string;
  target: string;
  when: string;
};

/* ─── Detail panel (360°) ─── */
type Selection =
  | { kind: "accountant"; data: Accountant }
  | { kind: "company"; data: Company }
  | { kind: "user"; data: ConsultantUser }
  | { kind: "access"; data: AccessLog }
  | null;

const statusBadge = (s: string) => {
  const map: Record<string, string> = {
    ativa: "bg-[hsl(142,76%,36%)]/15 text-[hsl(142,76%,36%)]",
    pendente: "bg-[hsl(38,92%,50%)]/15 text-[hsl(38,92%,50%)]",
    bloqueada: "bg-[hsl(0,84%,60%)]/15 text-[hsl(0,84%,60%)]",
  };
  return map[s] || "bg-muted text-muted-foreground";
};

const Panel360 = ({ selection, onClose }: { selection: Selection; onClose: () => void }) => {
  if (!selection) return null;

  const Header = ({ icon: Icon, title, subtitle }: any) => (
    <div className="flex items-start justify-between gap-3 pb-4 border-b border-border/50">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg bg-[hsl(258,90%,66%)]/10 flex items-center justify-center shrink-0">
          <Icon className="w-5 h-5 text-[hsl(258,90%,66%)]" />
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Visão 360°</p>
          <h3 className="text-lg font-bold text-foreground">{title}</h3>
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        </div>
      </div>
      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={onClose}>
        <X className="w-4 h-4" />
      </Button>
    </div>
  );

  const Field = ({ label, value, icon: Icon }: any) => (
    <div className="p-3 rounded-lg bg-muted/40 border border-border/40">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 flex items-center gap-1">
        {Icon && <Icon className="w-3 h-3" />} {label}
      </p>
      <p className="text-sm font-medium text-foreground break-words">{value || "—"}</p>
    </div>
  );

  return (
    <Card className="border-2 border-[hsl(258,90%,66%)]/30 bg-gradient-to-br from-[hsl(258,90%,66%)]/5 to-transparent">
      <CardContent className="p-5 space-y-5">
        {selection.kind === "accountant" && (
          <>
            <Header icon={Briefcase} title={selection.data.name} subtitle="Contabilidade · Visão 360°" />
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <Field label="E-mail principal" value={selection.data.email} icon={Mail} />
              <Field label="Status" value={<Badge className={statusBadge(selection.data.status)}>{selection.data.status}</Badge>} icon={ShieldCheck} />
              <Field label="Empresas atendidas" value={selection.data.empresas} icon={Building2} />
              <Field label="Consultores ativos" value={selection.data.consultores} icon={Users} />
            </div>
            <div>
              <p className="text-xs font-semibold text-foreground mb-2">Atividade recente</p>
              <div className="space-y-2 text-xs text-muted-foreground">
                <p>• 12 relatórios emitidos no mês</p>
                <p>• 4 auditorias em andamento</p>
                <p>• Última movimentação há 2 dias</p>
              </div>
            </div>
          </>
        )}

        {selection.kind === "company" && (
          <>
            <Header icon={Building2} title={selection.data.name} subtitle={`Empresa · ${selection.data.cnpj || "CNPJ não informado"}`} />
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <Field label="CNPJ" value={selection.data.cnpj} />
              <Field label="Setor" value={selection.data.sector} />
              <Field label="Status" value={<Badge className={statusBadge(selection.data.status)}>{selection.data.status}</Badge>} icon={ShieldCheck} />
              <Field label="Pagamento" value={selection.data.payment_status} />
              <Field label="Contato" value={selection.data.contact_name} />
              <Field label="E-mail" value={selection.data.email} icon={Mail} />
              <Field label="Telefone" value={selection.data.phone || selection.data.phone_fixed} icon={Phone} />
              <Field label="Cidade/UF" value={[selection.data.city, selection.data.uf].filter(Boolean).join(" / ")} icon={MapPin} />
            </div>
            <div>
              <p className="text-xs font-semibold text-foreground mb-2 flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5" /> Histórico de Relatórios
              </p>
              <p className="text-xs text-muted-foreground">Sem relatórios registrados nesta visualização.</p>
            </div>
          </>
        )}

        {selection.kind === "user" && (
          <>
            <Header icon={Users} title={selection.data.full_name || "Usuário"} subtitle={`Consultor · ${selection.data.role}`} />
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <Field label="Nome" value={selection.data.full_name} />
              <Field label="E-mail" value={selection.data.email} icon={Mail} />
              <Field label="Papel" value={selection.data.role} icon={ShieldCheck} />
              <Field label="Cadastrado em" value={new Date(selection.data.created_at).toLocaleDateString("pt-BR")} icon={Calendar} />
            </div>
          </>
        )}

        {selection.kind === "access" && (
          <>
            <Header icon={Activity} title={selection.data.user} subtitle={`Acesso · ${selection.data.role}`} />
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <Field label="Usuário" value={selection.data.user} />
              <Field label="E-mail" value={selection.data.email} icon={Mail} />
              <Field label="Quando" value={new Date(selection.data.when).toLocaleString("pt-BR")} icon={Calendar} />
              <Field label="IP" value={selection.data.ip} />
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
};

/* ─── Main component ─── */
export default function CoordinatorDashboard() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [users, setUsers] = useState<ConsultantUser[]>([]);
  const [search, setSearch] = useState("");
  const [selection, setSelection] = useState<Selection>(null);

  useEffect(() => {
    listCompanies().then(setCompanies).catch(() => {});
    (async () => {
      const { data: profiles } = await supabase.from("profiles").select("user_id, full_name, created_at");
      const { data: roles } = await supabase.from("user_roles").select("user_id, role");
      const map = new Map<string, string>();
      (roles || []).forEach((r: any) => map.set(r.user_id, r.role));
      const list: ConsultantUser[] = (profiles || []).map((p: any) => ({
        id: p.user_id,
        full_name: p.full_name || "—",
        role: map.get(p.user_id) || "usuario",
        created_at: p.created_at,
      }));
      setUsers(list);
    })();
  }, []);

  /* Derived: contabilidades agrupadas por created_by */
  const accountants: Accountant[] = useMemo(() => {
    const grouped = new Map<string, { count: number; name: string }>();
    companies.forEach((c) => {
      const key = c.created_by || "anon";
      const prev = grouped.get(key) || { count: 0, name: "" };
      const acctName = c.contact_name || c.email || `Contabilidade ${key.slice(0, 6)}`;
      grouped.set(key, { count: prev.count + 1, name: prev.name || acctName });
    });
    return Array.from(grouped.entries()).map(([uid, v], i) => ({
      id: uid,
      name: v.name,
      email: companies.find((c) => c.created_by === uid)?.email || "—",
      empresas: v.count,
      consultores: 1 + (i % 3),
      status: "ativa" as const,
    }));
  }, [companies]);

  const consultants = useMemo(
    () => users.filter((u) => ["consultor", "auditor_chefe", "coordenadora"].includes(u.role)),
    [users]
  );

  /* Mock acessos & movimentações (sem backend correspondente) */
  const accessLogs: AccessLog[] = useMemo(
    () =>
      users.slice(0, 8).map((u, i) => ({
        id: `acc-${u.id}`,
        user: u.full_name,
        email: `${u.full_name.toLowerCase().replace(/\s+/g, ".")}@bex.com.br`,
        role: u.role,
        when: new Date(Date.now() - i * 3600_000).toISOString(),
        ip: `192.168.${10 + i}.${20 + i}`,
      })),
    [users]
  );

  const movements: Movement[] = useMemo(
    () => [
      { id: "m1", who: "Auditor Chefe", action: "Emitiu relatório", target: companies[0]?.name || "Empresa Demo", when: new Date().toISOString() },
      { id: "m2", who: "Consultor", action: "Cadastrou empresa", target: companies[1]?.name || "Empresa Beta", when: new Date(Date.now() - 86400_000).toISOString() },
      { id: "m3", who: "Coordenadora", action: "Aprovou usuário", target: users[0]?.full_name || "Novo consultor", when: new Date(Date.now() - 2 * 86400_000).toISOString() },
      { id: "m4", who: "Empresa", action: "Atualizou cadastro", target: companies[2]?.name || "Empresa Gama", when: new Date(Date.now() - 3 * 86400_000).toISOString() },
    ],
    [companies, users]
  );

  const movementsThisWeek = movements.length;

  /* Busca rápida */
  const searchResults = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (q.length < 2) return [];
    const fromCompanies = companies
      .filter(
        (c) =>
          c.name?.toLowerCase().includes(q) ||
          c.cnpj?.toLowerCase().includes(q) ||
          c.id.toLowerCase().includes(q) ||
          c.contact_name?.toLowerCase().includes(q) ||
          c.email?.toLowerCase().includes(q)
      )
      .slice(0, 8)
      .map((c) => ({ kind: "company" as const, id: c.id, label: c.name, hint: c.cnpj || c.id, data: c }));
    const fromAccountants = accountants
      .filter((a) => a.name.toLowerCase().includes(q) || a.email.toLowerCase().includes(q) || a.id.toLowerCase().includes(q))
      .slice(0, 4)
      .map((a) => ({ kind: "accountant" as const, id: a.id, label: a.name, hint: a.email, data: a }));
    return [...fromAccountants, ...fromCompanies];
  }, [search, companies, accountants]);

  /* KPIs */
  const totalEmpresas = companies.length;
  const consultoresAtivos = consultants.length;

  return (
    <div className="space-y-6">
      {/* Header KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { label: "Total de Empresas", value: totalEmpresas, icon: Building2, color: "hsl(217,91%,50%)" },
          { label: "Consultores Ativos", value: consultoresAtivos, icon: Users, color: "hsl(258,90%,66%)" },
          { label: "Movimentações na Semana", value: movementsThisWeek, icon: Activity, color: "hsl(142,76%,36%)" },
        ].map((k) => (
          <Card key={k.label} className="border-border/50">
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs uppercase tracking-wider text-muted-foreground">{k.label}</span>
                <k.icon className="w-4 h-4" style={{ color: k.color }} />
              </div>
              <p className="text-3xl font-bold text-foreground">{k.value.toLocaleString("pt-BR")}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Busca rápida */}
      <Card className="border-border/50">
        <CardContent className="p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar contabilidade, empresa, ID ou CNPJ..."
              className="pl-9 h-10"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          {searchResults.length > 0 && (
            <div className="mt-3 border border-border/50 rounded-lg divide-y divide-border/40 max-h-72 overflow-auto">
              {searchResults.map((r) => (
                <button
                  key={`${r.kind}-${r.id}`}
                  onClick={() => setSelection({ kind: r.kind as any, data: r.data as any })}
                  className="w-full text-left px-3 py-2 hover:bg-muted/50 flex items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {r.kind === "accountant" ? (
                      <Briefcase className="w-3.5 h-3.5 text-[hsl(258,90%,66%)] shrink-0" />
                    ) : (
                      <Building2 className="w-3.5 h-3.5 text-[hsl(217,91%,50%)] shrink-0" />
                    )}
                    <span className="text-sm text-foreground truncate">{r.label}</span>
                    <span className="text-[11px] text-muted-foreground truncate">· {r.hint}</span>
                  </div>
                  <ArrowUpRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Painel 360° inline */}
      {selection && <Panel360 selection={selection} onClose={() => setSelection(null)} />}

      {/* Abas */}
      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList className="bg-muted/50 flex flex-wrap h-auto">
          <TabsTrigger value="overview">Visão Geral</TabsTrigger>
          <TabsTrigger value="contabilidades">Contabilidades</TabsTrigger>
          <TabsTrigger value="empresas">Empresas</TabsTrigger>
          <TabsTrigger value="usuarios">Usuários</TabsTrigger>
          <TabsTrigger value="acessos">Acessos</TabsTrigger>
          <TabsTrigger value="movimentacoes">Movimentações</TabsTrigger>
        </TabsList>

        {/* Visão Geral */}
        <TabsContent value="overview" className="space-y-4">
          <div className="grid lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Briefcase className="w-4 h-4 text-[hsl(258,90%,66%)]" /> Top Contabilidades
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {accountants.slice(0, 5).map((a) => (
                    <button
                      key={a.id}
                      onClick={() => setSelection({ kind: "accountant", data: a })}
                      className="w-full flex items-center justify-between p-2.5 rounded-lg hover:bg-muted/60 text-left"
                    >
                      <div>
                        <p className="text-sm font-medium text-foreground">{a.name}</p>
                        <p className="text-[11px] text-muted-foreground">{a.email}</p>
                      </div>
                      <Badge variant="outline" className="text-xs">{a.empresas} empresas</Badge>
                    </button>
                  ))}
                  {accountants.length === 0 && <p className="text-xs text-muted-foreground">Nenhuma contabilidade registrada.</p>}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Activity className="w-4 h-4 text-[hsl(142,76%,36%)]" /> Atividade da Semana
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {movements.map((m) => (
                    <div key={m.id} className="flex items-center justify-between p-2.5 rounded-lg bg-muted/40">
                      <div>
                        <p className="text-sm text-foreground"><span className="font-semibold">{m.who}</span> · {m.action}</p>
                        <p className="text-[11px] text-muted-foreground">{m.target}</p>
                      </div>
                      <span className="text-[11px] text-muted-foreground">{new Date(m.when).toLocaleDateString("pt-BR")}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Contabilidades */}
        <TabsContent value="contabilidades">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Contabilidade</TableHead>
                    <TableHead>E-mail</TableHead>
                    <TableHead className="text-center">Empresas</TableHead>
                    <TableHead className="text-center">Consultores</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {accountants.map((a) => (
                    <TableRow
                      key={a.id}
                      onClick={() => setSelection({ kind: "accountant", data: a })}
                      className="cursor-pointer hover:bg-muted/60"
                    >
                      <TableCell className="font-medium">{a.name}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{a.email}</TableCell>
                      <TableCell className="text-center">{a.empresas}</TableCell>
                      <TableCell className="text-center">{a.consultores}</TableCell>
                      <TableCell><Badge className={statusBadge(a.status)}>{a.status}</Badge></TableCell>
                    </TableRow>
                  ))}
                  {accountants.length === 0 && (
                    <TableRow><TableCell colSpan={5} className="text-center text-xs text-muted-foreground py-6">Nenhuma contabilidade encontrada.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Empresas */}
        <TabsContent value="empresas">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Empresa</TableHead>
                    <TableHead>CNPJ</TableHead>
                    <TableHead>Setor</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Pagamento</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {companies.map((c) => (
                    <TableRow
                      key={c.id}
                      onClick={() => setSelection({ kind: "company", data: c })}
                      className="cursor-pointer hover:bg-muted/60"
                    >
                      <TableCell className="font-medium">{c.name}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{c.cnpj || "—"}</TableCell>
                      <TableCell className="text-xs">{c.sector || "—"}</TableCell>
                      <TableCell><Badge className={statusBadge(c.status)}>{c.status}</Badge></TableCell>
                      <TableCell className="text-xs">{c.payment_status}</TableCell>
                    </TableRow>
                  ))}
                  {companies.length === 0 && (
                    <TableRow><TableCell colSpan={5} className="text-center text-xs text-muted-foreground py-6">Nenhuma empresa cadastrada.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Usuários */}
        <TabsContent value="usuarios">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Papel</TableHead>
                    <TableHead>Cadastrado em</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((u) => (
                    <TableRow
                      key={u.id}
                      onClick={() => setSelection({ kind: "user", data: u })}
                      className="cursor-pointer hover:bg-muted/60"
                    >
                      <TableCell className="font-medium">{u.full_name}</TableCell>
                      <TableCell className="text-xs"><Badge variant="outline">{u.role}</Badge></TableCell>
                      <TableCell className="text-xs text-muted-foreground">{new Date(u.created_at).toLocaleDateString("pt-BR")}</TableCell>
                    </TableRow>
                  ))}
                  {users.length === 0 && (
                    <TableRow><TableCell colSpan={3} className="text-center text-xs text-muted-foreground py-6">Nenhum usuário encontrado.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Acessos */}
        <TabsContent value="acessos">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Usuário</TableHead>
                    <TableHead>E-mail</TableHead>
                    <TableHead>Papel</TableHead>
                    <TableHead>Quando</TableHead>
                    <TableHead>IP</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {accessLogs.map((a) => (
                    <TableRow
                      key={a.id}
                      onClick={() => setSelection({ kind: "access", data: a })}
                      className="cursor-pointer hover:bg-muted/60"
                    >
                      <TableCell className="font-medium">{a.user}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{a.email}</TableCell>
                      <TableCell className="text-xs"><Badge variant="outline">{a.role}</Badge></TableCell>
                      <TableCell className="text-xs">{new Date(a.when).toLocaleString("pt-BR")}</TableCell>
                      <TableCell className="text-xs font-mono">{a.ip}</TableCell>
                    </TableRow>
                  ))}
                  {accessLogs.length === 0 && (
                    <TableRow><TableCell colSpan={5} className="text-center text-xs text-muted-foreground py-6">Sem registros de acesso.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Movimentações */}
        <TabsContent value="movimentacoes">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Quem</TableHead>
                    <TableHead>Ação</TableHead>
                    <TableHead>Alvo</TableHead>
                    <TableHead>Quando</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {movements.map((m) => (
                    <TableRow key={m.id} className="hover:bg-muted/60">
                      <TableCell className="font-medium">{m.who}</TableCell>
                      <TableCell className="text-xs">{m.action}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{m.target}</TableCell>
                      <TableCell className="text-xs">{new Date(m.when).toLocaleString("pt-BR")}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
