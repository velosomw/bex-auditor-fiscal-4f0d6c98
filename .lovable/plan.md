## Visão geral

Implementação completa do fluxo de monetização baseado em dois planos (PRO gratuito e Enterprise R$ 5,00/mês) usando AbacatePay como gateway via PIX/Cartão recorrente. Inclui página pública de planos inspirada em redrive.com.br/planos, fluxo de contratação, página interna "Minha Assinatura" e ajustes de navegação no dashboard do usuário.

> Observação importante: **AbacatePay não é um provedor nativo do Lovable**. Vamos integrar via Edge Functions usando a API REST oficial da AbacatePay. Será necessário você fornecer a `ABACATEPAY_API_KEY` (chave do ambiente DEV primeiro, depois PROD) através do prompt seguro de secrets — solicitarei na primeira etapa de execução.

---

## 1. Backend (Lovable Cloud)

### Migration — novas tabelas e enums
- `subscription_plans` (seed: `pro` gratuito, `enterprise` R$5,00)
  - `code` (pro|enterprise), `name`, `price_cents`, `monthly_report_limit`, `features jsonb`, `active`
- `subscriptions`
  - `user_id`, `plan_code`, `status` (active|canceled|past_due|pending), `auto_renew bool`, `started_at`, `current_period_start`, `current_period_end`, `canceled_at`, `abacatepay_customer_id`, `abacatepay_subscription_id`
- `subscription_invoices` (histórico mensal)
  - `subscription_id`, `period_start`, `period_end`, `amount_cents`, `status` (paid|pending|failed|refunded), `paid_at`, `abacatepay_billing_id`, `pix_qr_code`, `pix_copy_paste`, `invoice_url`
- RLS: usuário lê apenas suas próprias assinaturas/faturas; `coordenadora`/`gestor_ia` leem todas.
- Trigger: ao criar usuário (`handle_new_user`), criar subscription `pro` ativa por padrão.

### Edge Functions (novas)
- `abacatepay-create-billing` — cria cobrança PIX mensal Enterprise (chamada quando usuário clica "Contratar"). Valida JWT, cria customer na AbacatePay se necessário, devolve QR Code + copia-cola.
- `abacatepay-webhook` — recebe eventos `billing.paid`, `billing.failed`, `billing.expired` (verify_jwt=false, valida assinatura via header `webhook-secret`), atualiza `subscription_invoices` e `subscriptions.status`.
- `subscription-cancel` — marca `auto_renew=false` e `canceled_at=now()`; mantém acesso até `current_period_end`.
- `subscription-toggle-autorenew` — liga/desliga renovação automática.

### Secrets necessárias
- `ABACATEPAY_API_KEY`
- `ABACATEPAY_WEBHOOK_SECRET`

---

## 2. Frontend

### Página pública `/planos` (nova rota, no Layout público)
Inspirada em https://redrive.com.br/planos: hero com headline, dois cards lado a lado (PRO e Enterprise), comparativo de features (✓/✗), FAQ resumido e CTA final.

**Card PRO** (gratuito)
- Preço: "Grátis"
- Botão: **"Fazer Cadastro"** → `/signup?plan=pro`
- Lista: CNPJ + CRC, até 3 relatórios PRO/mês, gráficos e análise básica, Kanitz resumido.

**Card Enterprise** (R$ 5,00/mês, destacado)
- Preço: "R$ 5,00/mês"
- Botão: **"Contratar"** → se logado vai para `/minha-assinatura?upgrade=enterprise`; se não logado vai para `/signup?plan=enterprise&redirect=/minha-assinatura?upgrade=enterprise`
- Rodapé do formulário de cadastro: *"Já é cadastrado? Clique aqui para entrar"* → `/login?redirect=/minha-assinatura?upgrade=enterprise`
- Lista: tudo do PRO + 6 relatórios Enterprise/mês + desbloqueio de 7 relatórios PRO adicionais (PRO 10) + 2 relatórios simultâneos PRO+Kanitz + workspace pós-relatório + Kanitz completo. **Total: 16 relatórios/mês**.

### Página interna `/minha-assinatura` (nova)
- Header: plano atual, status, próximo vencimento.
- Se PRO e `?upgrade=enterprise`: abre dialog com card Enterprise + botão **"Contratar"** que chama `abacatepay-create-billing` e exibe QR Code PIX + copia-cola.
- Se Enterprise ativo: switch "Manter cobrança automática", botão "Cancelar plano" (com confirmação).
- Tabela "Histórico de faturas": mês, valor, status, data de pagamento, link da fatura.

### Ajustes no dashboard do usuário (`/user`)
**Inline acima dos dashboards** (novo componente `UserQuickActions`):
- Botão **"Visualizar Empresas"** (move o atual botão "Empresas" do header de ações)
- Botão **"Minha Assinatura"**

**No header de ações (ao lado de "+ Nova Auditoria")**:
- Remover botão "Empresas"
- Adicionar botão **"Avançar meu negócio"** em verde (variante nova `success`, gradient verde) → leva para `/minha-assinatura?upgrade=enterprise`

### Ajustes em `/signup`
- Aceitar query `?plan=pro|enterprise&redirect=...`
- Após signup bem-sucedido, se `plan=enterprise` redirecionar para `/minha-assinatura?upgrade=enterprise`; senão para `/user`.
- Garantir mensagem "Já é cadastrado? Clique aqui" linkando para `/login` preservando o `redirect`.

### Ajuste em `App.tsx`
- Rota pública `/planos`
- Rota protegida `/minha-assinatura` (allow: `usuario`, `empresa`, `contabilidade`)

### Ajuste no Header público
- Adicionar item de menu "Planos" → `/planos`

---

## 3. Regras de negócio do limite de relatórios

- `subscription_plans.monthly_report_limit`: PRO=3, Enterprise=16 (6 Enterprise + 10 PRO).
- Adicionar enforcement no backend de auditoria (apenas adicionar verificação simples: contar relatórios do mês atual do `user_id` e bloquear se exceder o limite do plano ativo). Implementação mínima sem refatorar o pipeline existente — apenas guard no `audit-pipeline-process` antes do `INSERT`.

---

## 4. Design

- Reaproveitar tokens existentes (`--btn-gradient` para Enterprise/CTAs principais).
- Criar variante `success` no `buttonVariants` com gradiente verde (`from-emerald-500 to-green-600`) para "Avançar meu negócio".
- Cards de plano: layout 2 colunas, plano Enterprise com badge "Recomendado" e borda destacada.
- Página `/planos`: hero escuro com Plus Jakarta Sans (heading) + Inter (body) seguindo identidade do projeto.

---

## 5. Ordem de execução

1. Solicitar `ABACATEPAY_API_KEY` e `ABACATEPAY_WEBHOOK_SECRET` via prompt seguro.
2. Migration: planos, subscriptions, invoices, RLS, trigger de subscription default PRO + backfill para usuários existentes.
3. Edge Functions AbacatePay (create-billing, webhook, cancel, toggle-autorenew).
4. Página pública `/planos` + rota.
5. Página `/minha-assinatura` + dialog de checkout PIX.
6. Ajustes no `/user` (inline, botão verde, remoção do botão Empresas).
7. Ajustes no `/signup` (query params, link "já é cadastrado").
8. Item "Planos" no Header público.
9. Guard de limite mensal de relatórios no edge function de auditoria.

---

## Detalhes técnicos

- **AbacatePay API**: base `https://api.abacatepay.com/v1`. Endpoints usados: `POST /customer/create`, `POST /billing/create` (PIX), `POST /pixQrCode/create` para cobrança avulsa recorrente mensal. Como AbacatePay (no momento) não tem subscription nativa, o webhook `billing.paid` dispara criação da próxima cobrança 30 dias depois via cron (Edge Function `subscription-renew-cron` invocada por `pg_cron` mensalmente).
- **Webhook URL** a configurar no painel AbacatePay: `https://mrvizydgxysaxazhmfqk.supabase.co/functions/v1/abacatepay-webhook`
- **Reaproveitamento**: `RoleGuard`, `UserContext`, `supabase` client existentes.

Após sua aprovação, começo pela solicitação das secrets e em seguida pela migration.
