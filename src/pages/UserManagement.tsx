import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import PlatformLayout from "@/components/PlatformLayout";
import { supabase } from "@/integrations/supabase/client";
import { useUser } from "@/contexts/UserContext";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Users, UserCheck, UserX, Plus, Edit, Trash2, Ban, Search } from "lucide-react";
import type { UserRole } from "@/types/user";

interface ManagedUser {
  id: string;
  user_id: string;
  full_name: string;
  phone: string;
  role: string;
  status: string;
  created_at: string;
  last_sign_in?: string;
}

const roleLabels: Record<string, string> = {
  auditor_chefe: "Auditor Chefe",
  usuario: "Usuário",
  empresa: "Empresa",
  gestor_ia: "Gestor IA",
  coordenadora: "Coordenadora",
  consultor: "Consultor",
  magistrado: "Magistrado",
  recuperanda: "Recuperanda",
};

const UserManagement = () => {
  const navigate = useNavigate();
  const { role } = useUser();
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  // Form state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<ManagedUser | null>(null);
  const [formName, setFormName] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formPassword, setFormPassword] = useState("");
  const [formPhone, setFormPhone] = useState("");
  const [formRole, setFormRole] = useState<UserRole>("usuario");
  const [saving, setSaving] = useState(false);

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<ManagedUser | null>(null);
  const [deleting, setDeleting] = useState(false);

  const allowedRoles: UserRole[] = role === "gestor_ia"
    ? ["coordenadora"]
    : role === "coordenadora"
      ? ["empresa", "usuario"]
      : [];

  const loadUsers = async () => {
    setLoading(true);
    const { data: rolesData } = await supabase
      .from("user_roles")
      .select("user_id, role")
      .in("role", allowedRoles);

    if (rolesData && rolesData.length > 0) {
      const userIds = rolesData.map(r => r.user_id);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("*")
        .in("user_id", userIds);

      if (profiles) {
        const mapped: ManagedUser[] = profiles.map(p => {
          const userRole = rolesData.find(r => r.user_id === p.user_id);
          return {
            id: p.id,
            user_id: p.user_id,
            full_name: p.full_name || "",
            phone: p.phone || "",
            role: userRole?.role || "",
            status: "active",
            created_at: p.created_at,
            last_sign_in: p.updated_at,
          };
        });
        setUsers(mapped);
      }
    } else {
      setUsers([]);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (allowedRoles.length > 0) loadUsers();
    else setLoading(false);
  }, [role]);

  const totalUsers = users.length;
  const activeUsers = users.filter(u => u.status === "active").length;
  const inactiveUsers = users.filter(u => u.status === "inactive").length;

  const filteredUsers = users.filter(u =>
    u.full_name.toLowerCase().includes(search.toLowerCase()) ||
    u.role.toLowerCase().includes(search.toLowerCase())
  );

  const openCreate = () => {
    setEditingUser(null);
    setFormName("");
    setFormEmail("");
    setFormPassword("");
    setFormPhone("");
    setFormRole(allowedRoles[0] || "usuario");
    setDialogOpen(true);
  };

  const openEdit = (user: ManagedUser) => {
    setEditingUser(user);
    setFormName(user.full_name);
    setFormEmail("");
    setFormPassword("");
    setFormPhone(user.phone);
    setFormRole(user.role as UserRole);
    setDialogOpen(true);
  };

  const handleSave = async (sendInvite = false) => {
    if (!formName) { toast.error("Preencha o nome."); return; }
    setSaving(true);

    if (editingUser) {
      await supabase
        .from("profiles")
        .update({ full_name: formName, phone: formPhone })
        .eq("id", editingUser.id);
      toast.success("Usuário atualizado com sucesso!");
      setDialogOpen(false);
      loadUsers();
    } else {
      if (!formEmail) {
        toast.error("Preencha o e-mail.");
        setSaving(false);
        return;
      }
      if (!sendInvite && !formPassword) {
        toast.error("Preencha a senha ou use 'Criar e enviar e-mail'.");
        setSaving(false);
        return;
      }
      const { data, error } = await supabase.functions.invoke("admin-create-user", {
        body: {
          email: formEmail,
          password: sendInvite ? undefined : formPassword,
          full_name: formName,
          phone: formPhone,
          role: formRole,
          send_invite: sendInvite,
          redirect_to: `${window.location.origin}/reset-password`,
        },
      });
      if (error || (data as any)?.error) {
        toast.error("Erro ao criar usuário. Tente novamente.");
      } else if (sendInvite) {
        toast.success(
          (data as any)?.invite_sent
            ? "Usuário criado! E-mail de definição de senha enviado."
            : "Usuário criado, mas o e-mail não pôde ser enviado.",
        );
        setDialogOpen(false);
        loadUsers();
      } else {
        toast.success("Usuário cadastrado com sucesso!");
        setDialogOpen(false);
        loadUsers();
      }
    }
    setSaving(false);
  };

  const handleToggleStatus = (user: ManagedUser) => {
    setUsers(prev => prev.map(u =>
      u.id === user.id ? { ...u, status: u.status === "active" ? "inactive" : "active" } : u
    ));
    toast.success(user.status === "active" ? "Acesso suspenso." : "Acesso reativado.");
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    // Delete role and profile
    await supabase.from("user_roles").delete().eq("user_id", deleteTarget.user_id);
    await supabase.from("profiles").delete().eq("user_id", deleteTarget.user_id);
    toast.success("Usuário excluído com sucesso.");
    setDeleteTarget(null);
    setDeleting(false);
    loadUsers();
  };

  const formatDate = (d?: string) => {
    if (!d) return "—";
    return new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  };

  const dashCards = [
    { label: "Total Cadastrados", value: totalUsers, icon: Users, color: "hsl(258,90%,66%)" },
    { label: "Ativos", value: activeUsers, icon: UserCheck, color: "hsl(152,70%,45%)" },
    { label: "Inativos", value: inactiveUsers, icon: UserX, color: "hsl(0,70%,55%)" },
  ];

  return (
    <PlatformLayout>
      <div className="max-w-[1400px] mx-auto px-4 md:px-6 py-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Gestão de Usuários</h1>
            <p className="text-sm text-muted-foreground">
              Perfis disponíveis: {allowedRoles.map(r => roleLabels[r]).join(", ")}
            </p>
          </div>
          <Button
            size="sm"
            className="bg-[hsl(258,90%,66%)] hover:bg-[hsl(258,80%,55%)] text-white gap-1.5"
            onClick={openCreate}
          >
            <Plus className="w-4 h-4" /> Novo Usuário
          </Button>
        </div>

        {/* Dashboard Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          {dashCards.map((card, i) => (
            <div key={i} className="relative bg-card rounded-xl border border-border p-5 overflow-hidden">
              <div className="absolute top-3 right-3 opacity-10">
                <card.icon className="w-14 h-14" style={{ color: card.color }} />
              </div>
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: `${card.color}20` }}>
                  <card.icon className="w-5 h-5" style={{ color: card.color }} />
                </div>
              </div>
              <div className="text-3xl font-bold text-foreground">{card.value}</div>
              <div className="text-sm font-medium text-muted-foreground">{card.label}</div>
            </div>
          ))}
        </div>

        {/* Search */}
        <div className="flex items-center gap-2 bg-card border border-border rounded-lg px-3 py-2 mb-4 max-w-md">
          <Search className="w-4 h-4 text-muted-foreground" />
          <input
            placeholder="Buscar por nome ou perfil..."
            className="bg-transparent text-sm outline-none flex-1 text-foreground placeholder:text-muted-foreground"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        {/* Users Table */}
        {loading ? (
          <div className="text-center py-12 text-muted-foreground">Carregando...</div>
        ) : filteredUsers.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">Nenhum usuário encontrado.</div>
        ) : (
          <div className="bg-card rounded-xl border border-border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Nome</th>
                    <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Telefone</th>
                    <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Perfil</th>
                    <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Status</th>
                    <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Último Acesso</th>
                    <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map((user) => (
                    <tr key={user.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3 font-medium text-foreground">{user.full_name || "—"}</td>
                      <td className="px-4 py-3 text-muted-foreground">{user.phone || "—"}</td>
                      <td className="px-4 py-3">
                        <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-[hsl(258,90%,66%)]/10 text-[hsl(258,90%,66%)]">
                          {roleLabels[user.role] || user.role}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                          user.status === "active"
                            ? "bg-[hsl(152,70%,45%)]/10 text-[hsl(152,70%,45%)]"
                            : "bg-[hsl(0,70%,55%)]/10 text-[hsl(0,70%,55%)]"
                        }`}>
                          {user.status === "active" ? "Ativo" : "Inativo"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">{formatDate(user.last_sign_in)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => openEdit(user)}
                            title="Editar"
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => handleToggleStatus(user)}
                            title={user.status === "active" ? "Suspender acesso" : "Reativar acesso"}
                          >
                            <Ban className={`w-4 h-4 ${user.status === "active" ? "text-[hsl(38,90%,55%)]" : "text-[hsl(152,70%,45%)]"}`} />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-[hsl(0,70%,55%)]"
                            onClick={() => setDeleteTarget(user)}
                            title="Excluir"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-card border-border max-w-md">
          <DialogHeader>
            <DialogTitle className="text-foreground">{editingUser ? "Editar Usuário" : "Cadastrar Novo Usuário"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-sm text-muted-foreground">Nome Completo</Label>
              <Input value={formName} onChange={e => setFormName(e.target.value)} placeholder="Nome completo" />
            </div>
            {!editingUser && (
              <>
                <div className="space-y-1.5">
                  <Label className="text-sm text-muted-foreground">E-mail</Label>
                  <Input type="email" value={formEmail} onChange={e => setFormEmail(e.target.value)} placeholder="email@exemplo.com" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm text-muted-foreground">
                    Senha <span className="text-xs">(opcional — deixe em branco para enviar e-mail)</span>
                  </Label>
                  <Input type="password" value={formPassword} onChange={e => setFormPassword(e.target.value)} placeholder="Mínimo 8 caracteres" />
                </div>
              </>
            )}
            <div className="space-y-1.5">
              <Label className="text-sm text-muted-foreground">Telefone</Label>
              <Input value={formPhone} onChange={e => setFormPhone(e.target.value)} placeholder="(11) 99999-9999" />
            </div>
            {!editingUser && (
              <div className="space-y-1.5">
                <Label className="text-sm text-muted-foreground">Perfil de Acesso</Label>
                <Select value={formRole} onValueChange={(v) => setFormRole(v as UserRole)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {allowedRoles.map(r => (
                      <SelectItem key={r} value={r}>{roleLabels[r]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            {!editingUser && (
              <Button
                variant="outline"
                className="border-[hsl(258,90%,66%)] text-[hsl(258,90%,66%)] hover:bg-[hsl(258,90%,66%)]/10"
                onClick={() => handleSave(true)}
                disabled={saving}
              >
                {saving ? "Enviando..." : "Criar e enviar e-mail de senha"}
              </Button>
            )}
            <Button className="bg-[hsl(258,90%,66%)] hover:bg-[hsl(258,80%,55%)] text-white" onClick={() => handleSave(false)} disabled={saving}>
              {saving ? "Salvando..." : editingUser ? "Salvar Alterações" : "Cadastrar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent className="bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-foreground">Confirmar Exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir o usuário <strong>{deleteTarget?.full_name}</strong>?
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-[hsl(0,70%,55%)] hover:bg-[hsl(0,70%,45%)] text-white"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? "Excluindo..." : "Sim, Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PlatformLayout>
  );
};

export default UserManagement;
