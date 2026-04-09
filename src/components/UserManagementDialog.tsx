import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Plus, Edit, Pause, CheckCircle2, UserPlus } from "lucide-react";
import type { UserRole } from "@/types/user";

interface ManagedUser {
  id: string;
  user_id: string;
  full_name: string;
  email: string;
  phone: string;
  role: string;
  status: string;
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

interface UserManagementDialogProps {
  allowedRoles: UserRole[];
  buttonLabel?: string;
  buttonClassName?: string;
}

const StatusBadge = ({ status }: { status: string }) => {
  const styles: Record<string, string> = {
    active: "bg-[hsl(152,70%,45%)]/10 text-[hsl(152,70%,45%)]",
    inactive: "bg-[hsl(0,70%,55%)]/10 text-[hsl(0,70%,55%)]",
  };
  const labels: Record<string, string> = { active: "Ativo", inactive: "Inativo" };
  return <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${styles[status] || styles.inactive}`}>{labels[status] || status}</span>;
};

const UserManagementDialog = ({ allowedRoles, buttonLabel = "Cadastrar Usuário", buttonClassName }: UserManagementDialogProps) => {
  const [open, setOpen] = useState(false);
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<ManagedUser | null>(null);
  const [formName, setFormName] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formPassword, setFormPassword] = useState("");
  const [formPhone, setFormPhone] = useState("");
  const [formRole, setFormRole] = useState(allowedRoles[0] || "usuario");
  const [saving, setSaving] = useState(false);

  const loadUsers = async () => {
    setLoading(true);
    // Fetch profiles + roles for allowed roles
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
            email: "",
            phone: p.phone || "",
            role: userRole?.role || "",
            status: "active",
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
    if (open) {
      loadUsers();
    }
  }, [open]);

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
    setFormEmail(user.email);
    setFormPassword("");
    setFormPhone(user.phone);
    setFormRole(user.role as UserRole);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formName) {
      toast.error("Preencha o nome.");
      return;
    }

    setSaving(true);

    if (editingUser) {
      // Update profile
      await supabase
        .from("profiles")
        .update({ full_name: formName, phone: formPhone })
        .eq("id", editingUser.id);

      toast.success("Usuário atualizado com sucesso!");
      setDialogOpen(false);
      loadUsers();
    } else {
      if (!formEmail || !formPassword) {
        toast.error("Preencha e-mail e senha para novo usuário.");
        setSaving(false);
        return;
      }

      // Create user via edge function
      const { data, error } = await supabase.functions.invoke("admin-create-user", {
        body: {
          email: formEmail,
          password: formPassword,
          full_name: formName,
          phone: formPhone,
          role: formRole,
        },
      });

      if (error) {
        toast.error("Erro ao criar usuário. Tente novamente.");
      } else {
        toast.success("Usuário cadastrado com sucesso!");
        setDialogOpen(false);
        loadUsers();
      }
    }
    setSaving(false);
  };

  return (
    <>
      <Button
        size="sm"
        className={buttonClassName || "bg-[hsl(258,90%,66%)] hover:bg-[hsl(258,80%,55%)] text-white gap-1.5"}
        onClick={() => setOpen(true)}
      >
        <UserPlus className="w-3.5 h-3.5" /> {buttonLabel}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-card border-border max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-foreground flex items-center gap-2">
              <UserPlus className="w-5 h-5 text-[hsl(258,90%,66%)]" /> Gestão de Usuários
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Perfis disponíveis: {allowedRoles.map(r => roleLabels[r]).join(", ")}
              </p>
              <Button size="sm" className="bg-[hsl(258,90%,66%)] hover:bg-[hsl(258,80%,55%)] text-white gap-1.5" onClick={openCreate}>
                <Plus className="w-3.5 h-3.5" /> Novo Usuário
              </Button>
            </div>

            {loading ? (
              <div className="text-center py-8 text-muted-foreground">Carregando...</div>
            ) : users.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">Nenhum usuário cadastrado com estes perfis.</div>
            ) : (
              <div className="bg-card rounded-xl border border-border overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/50">
                      <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Nome</th>
                      <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Telefone</th>
                      <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Perfil</th>
                      <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((user) => (
                      <tr key={user.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-3 font-medium text-foreground">{user.full_name || "—"}</td>
                        <td className="px-4 py-3 text-muted-foreground">{user.phone || "—"}</td>
                        <td className="px-4 py-3">
                          <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-[hsl(258,90%,66%)]/10 text-[hsl(258,90%,66%)]">
                            {roleLabels[user.role] || user.role}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(user)} title="Editar">
                            <Edit className="w-4 h-4" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Create / Edit Sub-Dialog */}
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
                  <Label className="text-sm text-muted-foreground">Senha</Label>
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
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button
              className="bg-[hsl(258,90%,66%)] hover:bg-[hsl(258,80%,55%)] text-white"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? "Salvando..." : editingUser ? "Salvar Alterações" : "Cadastrar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default UserManagementDialog;
