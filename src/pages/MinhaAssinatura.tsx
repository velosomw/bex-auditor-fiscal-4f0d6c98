import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Crown, Check, Loader2, Copy, AlertCircle, Calendar, CreditCard, X, ArrowLeft } from "lucide-react";
import PlatformLayout from "@/components/PlatformLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useSubscription } from "@/hooks/useSubscription";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const formatBRL = (cents: number) => (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const formatDate = (d?: string | null) => d ? new Date(d).toLocaleDateString("pt-BR") : "—";

const statusBadge = (s: string) => {
  const map: Record<string, string> = {
    paid: "bg-emerald-500/15 text-emerald-700 border-emerald-500/30",
    pending: "bg-amber-500/15 text-amber-700 border-amber-500/30",
    failed: "bg-red-500/15 text-red-700 border-red-500/30",
    expired: "bg-muted text-muted-foreground border-border",
    refunded: "bg-blue-500/15 text-blue-700 border-blue-500/30",
  };
  const label: Record<string, string> = { paid: "Pago", pending: "Pendente", failed: "Falhou", expired: "Expirado", refunded: "Reembolsado" };
  return <Badge className={`border ${map[s] || ""}`}>{label[s] || s}</Badge>;
};

const MinhaAssinatura = () => {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { subscription, invoices, loading, refresh } = useSubscription();
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [checkout, setCheckout] = useState<{ qr?: string; copy?: string; invoiceId?: string; amount?: number } | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);

  const isEnterprise = subscription?.plan_code === "enterprise" && subscription.status === "active";

  useEffect(() => {
    if (!loading && params.get("upgrade") === "enterprise" && !isEnterprise) {
      setCheckoutOpen(true);
    }
  }, [loading, params, isEnterprise]);

  const handleContratar = async () => {
    setCreating(true);
    try {
      const { data, error } = await supabase.functions.invoke("abacatepay-create-billing", { body: {} });
      if (error) throw error;
      setCheckout({ qr: data.qr_code_base64, copy: data.pix_copy_paste, invoiceId: data.invoice_id, amount: data.amount_cents });
      toast.success("PIX gerado! Escaneie o QR ou copie o código.");
      refresh();
    } catch (e: any) {
      toast.error(e.message || "Falha ao gerar cobrança PIX");
    } finally {
      setCreating(false);
    }
  };

  const handleToggleAutoRenew = async () => {
    const { error } = await supabase.functions.invoke("subscription-manage", { body: { action: "toggle_autorenew" } });
    if (error) toast.error("Erro: " + error.message);
    else { toast.success("Renovação automática atualizada"); refresh(); }
  };

  const handleCancel = async () => {
    const { error } = await supabase.functions.invoke("subscription-manage", { body: { action: "cancel" } });
    if (error) toast.error("Erro: " + error.message);
    else { toast.success("Assinatura cancelada. Acesso mantido até o fim do período vigente."); setCancelOpen(false); refresh(); }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Código PIX copiado!");
  };

  return (
    <PlatformLayout>
      <div className="max-w-5xl mx-auto p-6 space-y-6">
        <button
          onClick={() => navigate("/user")}
          className="flex items-center gap-2 text-[hsl(217,91%,50%)] hover:text-[hsl(217,91%,40%)] transition-colors text-sm"
        >
          <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-[hsl(217,91%,50%)] text-white">
            <ArrowLeft className="w-4 h-4" />
          </span>
          Voltar para Minha Área
        </button>
        <div>
          <h1 className="text-2xl font-bold">Minha Assinatura</h1>
          <p className="text-muted-foreground">Gerencie seu plano, cobrança e histórico de faturas</p>
        </div>

        {loading ? (
          <Card><CardContent className="py-12 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></CardContent></Card>
        ) : (
          <>
            {/* Plano atual */}
            <Card>
              <CardHeader>
                <div className="flex items-start justify-between flex-wrap gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      {isEnterprise && <Crown className="w-5 h-5 text-[hsl(217,91%,50%)]" />}
                      <CardTitle>Plano {subscription?.plan_code === "enterprise" ? "Enterprise" : "PRO"}</CardTitle>
                      <Badge variant={subscription?.status === "active" ? "default" : "outline"}>{subscription?.status || "—"}</Badge>
                    </div>
                    <CardDescription className="mt-1">
                      {isEnterprise ? "R$ 5,00/mês · 16 relatórios mensais" : "Gratuito · até 3 relatórios PRO/mês"}
                    </CardDescription>
                  </div>
                  {!isEnterprise && (
                    <Button className="text-white [background:var(--btn-gradient)] hover:[background:var(--btn-gradient-hover)]" onClick={() => setCheckoutOpen(true)}>
                      <Crown className="w-4 h-4 mr-2" /> Contratar Enterprise
                    </Button>
                  )}
                </div>
              </CardHeader>
              {isEnterprise && (
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                    <div className="flex items-center gap-2"><Calendar className="w-4 h-4 text-muted-foreground" /><div><p className="text-xs text-muted-foreground">Início</p><p className="font-medium">{formatDate(subscription?.current_period_start)}</p></div></div>
                    <div className="flex items-center gap-2"><Calendar className="w-4 h-4 text-muted-foreground" /><div><p className="text-xs text-muted-foreground">Próximo vencimento</p><p className="font-medium">{formatDate(subscription?.current_period_end)}</p></div></div>
                    <div className="flex items-center gap-2"><CreditCard className="w-4 h-4 text-muted-foreground" /><div><p className="text-xs text-muted-foreground">Prazo contratual</p><p className="font-medium">Mensal</p></div></div>
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
                    <div>
                      <p className="font-medium text-sm">Manter cobrança automática</p>
                      <p className="text-xs text-muted-foreground">Renovação mensal via PIX no vencimento</p>
                    </div>
                    <Switch checked={subscription?.auto_renew} onCheckedChange={handleToggleAutoRenew} />
                  </div>
                  {subscription?.canceled_at ? (
                    <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-500/10 text-amber-700 text-sm">
                      <AlertCircle className="w-4 h-4" />
                      Cancelamento solicitado em {formatDate(subscription.canceled_at)}. Acesso mantido até {formatDate(subscription.current_period_end)}.
                    </div>
                  ) : (
                    <Button variant="outline" onClick={() => setCancelOpen(true)} className="text-red-600 hover:text-red-700 hover:bg-red-50">
                      <X className="w-4 h-4 mr-2" /> Cancelar plano
                    </Button>
                  )}
                </CardContent>
              )}
            </Card>

            {/* Histórico */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Histórico de Faturas</CardTitle>
                <CardDescription>Cobranças mensais geradas pela AbacatePay</CardDescription>
              </CardHeader>
              <CardContent>
                {invoices.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">Nenhuma fatura ainda.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Período</TableHead>
                        <TableHead>Valor</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Pago em</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {invoices.map(inv => (
                        <TableRow key={inv.id}>
                          <TableCell className="text-sm">{formatDate(inv.period_start)} → {formatDate(inv.period_end)}</TableCell>
                          <TableCell className="font-medium">{formatBRL(inv.amount_cents)}</TableCell>
                          <TableCell>{statusBadge(inv.status)}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{formatDate(inv.paid_at)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {/* Dialog Checkout PIX */}
      <Dialog open={checkoutOpen} onOpenChange={setCheckoutOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Crown className="w-5 h-5 text-[hsl(217,91%,50%)]" /> Contratar Plano Enterprise</DialogTitle>
            <DialogDescription>R$ 5,00/mês · 16 relatórios mensais · Kanitz completo</DialogDescription>
          </DialogHeader>
          {!checkout ? (
            <div className="space-y-4">
              <ul className="space-y-2 text-sm">
                {["Tudo do plano PRO","6 relatórios completos BEx IA/mês","+10 relatórios PRO (PRO 10)","2 relatórios simultâneos PRO+Kanitz","Workspace de análise pós-relatório"].map(f => (
                  <li key={f} className="flex items-start gap-2"><Check className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />{f}</li>
                ))}
              </ul>
              <Button className="w-full text-white [background:var(--btn-gradient)] hover:[background:var(--btn-gradient-hover)]" disabled={creating} onClick={handleContratar}>
                {creating ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Gerando PIX…</> : "Gerar PIX e Contratar"}
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-center">Escaneie o QR Code abaixo ou copie o código PIX para pagar.</p>
              {checkout.qr && (
                <div className="flex justify-center">
                  <img src={checkout.qr.startsWith("data:") ? checkout.qr : `data:image/png;base64,${checkout.qr}`} alt="QR PIX" className="w-56 h-56 border rounded-lg" />
                </div>
              )}
              {checkout.copy && (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">PIX Copia e Cola</p>
                  <div className="flex gap-2">
                    <code className="flex-1 p-2 bg-muted rounded text-xs break-all max-h-20 overflow-y-auto">{checkout.copy}</code>
                    <Button size="icon" variant="outline" onClick={() => copyToClipboard(checkout.copy!)}><Copy className="w-4 h-4" /></Button>
                  </div>
                </div>
              )}
              <p className="text-xs text-center text-muted-foreground">Assim que o pagamento for confirmado, seu plano será ativado automaticamente.</p>
              <Button variant="outline" className="w-full" onClick={() => { setCheckoutOpen(false); setCheckout(null); }}>Fechar</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Cancel confirm */}
      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancelar assinatura?</DialogTitle>
            <DialogDescription>
              Você manterá acesso ao plano Enterprise até {formatDate(subscription?.current_period_end)}. Após essa data, sua conta voltará ao plano PRO gratuito.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => setCancelOpen(false)}>Manter assinatura</Button>
            <Button variant="destructive" onClick={handleCancel}>Confirmar cancelamento</Button>
          </div>
        </DialogContent>
      </Dialog>
    </PlatformLayout>
  );
};

export default MinhaAssinatura;
