import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { 
  History, 
  Mail, 
  Clock, 
  AlertCircle, 
  Search,
  RefreshCw,
  UserCheck
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface LoginAttempt {
  id: string;
  email: string;
  status: string;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

const TabLoginAttempts = () => {
  const [attempts, setAttempts] = useState<LoginAttempt[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");

  const fetchAttempts = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("login_attempts")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);

      if (error) throw error;
      setAttempts(data || []);
    } catch (error: any) {
      console.error("Erro ao carregar tentativas de login:", error);
      toast.error("Erro ao carregar histórico.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAttempts();
  }, []);

  const filteredAttempts = attempts.filter(a => 
    a.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending_confirmation':
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-yellow-100 text-yellow-700 flex items-center gap-1 w-fit">
            <AlertCircle className="w-3 h-3" /> Aguardando Confirmação
          </span>
        );
      case 'failed':
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-700 flex items-center gap-1 w-fit">
            <AlertCircle className="w-3 h-3" /> Falha / Credenciais
          </span>
        );
      case 'success':
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-700 flex items-center gap-1 w-fit">
            <UserCheck className="w-3 h-3" /> Sucesso
          </span>
        );
      default:
        return <span className="text-xs">{status}</span>;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-bold font-serif text-foreground flex items-center gap-2">
            <span className="w-1 h-5 rounded-full bg-[hsl(258,90%,66%)]" /> Monitoramento de Acessos
          </h3>
          <p className="text-sm text-muted-foreground">Acompanhe tentativas de login bloqueadas por falta de confirmação de e-mail.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input 
              placeholder="Filtrar por e-mail..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 h-9 w-64 bg-card border-border"
            />
          </div>
          <Button variant="outline" size="sm" onClick={fetchAttempts} disabled={loading}>
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Data/Hora</th>
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Usuário (E-mail)</th>
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Status da Tentativa</th>
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Dispositivo/Navegador</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">Carregando histórico...</td>
                </tr>
              ) : filteredAttempts.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">Nenhuma tentativa encontrada.</td>
                </tr>
              ) : (
                filteredAttempts.map((attempt) => (
                  <tr key={attempt.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 text-foreground font-medium">
                      <div className="flex flex-col">
                        <span>{format(new Date(attempt.created_at), "dd/MM/yyyy", { locale: ptBR })}</span>
                        <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                          <Clock className="w-2.5 h-2.5" /> {format(new Date(attempt.created_at), "HH:mm:ss")}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xs">
                          {attempt.email.substring(0, 2).toUpperCase()}
                        </div>
                        <span className="text-foreground">{attempt.email}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {getStatusBadge(attempt.status)}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground max-w-[200px] truncate">
                      {attempt.user_agent || "N/A"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default TabLoginAttempts;