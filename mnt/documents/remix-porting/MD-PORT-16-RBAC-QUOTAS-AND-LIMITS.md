# MD-PORT-16 — RBAC, Quotas and Limits

## 1. Objetivo
Documentar o modelo de controle de acesso baseado em papéis (RBAC) da plataforma, o enum `app_role` completo, a matriz de permissões por rota/ação, o mecanismo `has_role`, e o sistema de cotas/limites (`report_global_quotas`, `report_company_quota_extras`, `subscription_plans`, `subscriptions`), incluindo os valores reais de default extraídos das migrações SQL do repositório, para permitir replicação exata em um novo ambiente.

## 2. Escopo
- Enum `app_role` (banco de dados, `public.app_role`).
- Tabela `user_roles` e função `has_role`.
- `UserContext` (`src/contexts/UserContext.tsx`) — papel real (`realRole`) vs papel efetivo (`effectiveRole`) vs impersonation (`viewAsRole`).
- `src/services/reportLimitsService.ts` — cotas de relatórios resumidos/completos, extras por empresa, cap de meses de extração.
- `subscription_plans`/`subscriptions` — planos comerciais e limites mensais.
- Enforcement no frontend (rotas/menus) e nas Row Level Security (RLS) policies do banco.

## 3. Pré-requisitos
- Extensão/tabela `public.user_roles(user_id uuid, role app_role)` e função de banco `has_role(user_id uuid, role app_role) returns boolean` (`SECURITY DEFINER`), usada em toda policy RLS do projeto.
- Tabelas `report_global_quotas` (linha única, `id = true`) e `report_company_quota_extras` (uma linha por empresa).
- Tabela `audit_reports` com coluna `variant` (`"resumido" | "completo"`) e `company_id`, usada para cálculo de uso mensal.
- Tabelas `subscription_plans` (catálogo) e `subscriptions` (assinatura por usuário).

## 4. Enum `app_role` — valores oficiais
Definição real, extraída de `src/integrations/supabase/types.ts` (gerado a partir do schema Postgres):
```ts
Enums: {
  app_role:
    | "gestor_ia"
    | "auditor_chefe"
    | "coordenadora"
    | "consultor"
    | "magistrado"
    | "recuperanda"
    | "usuario"
    | "empresa"
    | "contabilidade"
}
```
E a lista de constantes correspondente (`Constants.public.Enums.app_role`):
```ts
app_role: [
  "gestor_ia",
  "auditor_chefe",
  "coordenadora",
  "consultor",
  "magistrado",
  "recuperanda",
  "usuario",
  "empresa",
  "contabilidade",
],
```
### 4.1 Semântica de cada papel
| Papel | Perfil | Descrição funcional |
|---|---|---|
| `gestor_ia` | Administrador da plataforma | Gestor de IA/produto. Único papel com escrita irrestrita em `report_global_quotas` (junto com `coordenadora`) e em `subscription_plans`. Rotas prefetchadas via `prefetchGestorRoutes()`. |
| `auditor_chefe` | Staff sênior | Único papel autorizado a **impersonar** outro papel em modo leitura (`viewAsRole`) — ver §5.1. Rotas via `prefetchStaffRoutes()`. |
| `coordenadora` | Staff de coordenação | Co-titular de permissões de escrita em `subscription_plans` (`plans_mgr_write`) junto com `gestor_ia`. Rotas via `prefetchStaffRoutes()`. |
| `consultor` | Staff técnico/consultoria | Papel operacional de apoio técnico (auditoria/parecer), sem privilégios administrativos de cota. |
| `magistrado` | Usuário externo institucional (Judiciário) | Papel de consulta a processos de recuperação judicial — acesso de leitura a relatórios vinculados aos processos sob sua jurisdição. |
| `recuperanda` | Empresa em Recuperação Judicial | Papel da empresa-parte no processo de RJ — consome relatórios/indicadores da própria empresa. |
| `usuario` | Usuário padrão/genérico | Papel default de conta pessoa física sem vínculo de empresa/contabilidade. Rotas via `prefetchUserRoutes()`. |
| `empresa` | Conta de empresa (cliente comercial) | Papel comercial padrão (planos PRO/Enterprise) — mesmo grupo de prefetch de `usuario`. |
| `contabilidade` | Escritório de contabilidade | Papel de terceiro que opera auditorias em nome de empresas-cliente — mesmo grupo de prefetch de `usuario`. |

### 4.2 Agrupamento de prefetch/roteamento (real, `UserContext.tsx`)
```ts
if (r === "usuario" || r === "empresa" || r === "contabilidade") prefetchUserRoutes();
else if (r === "auditor_chefe" || r === "coordenadora") prefetchStaffRoutes();
else if (r === "gestor_ia") prefetchGestorRoutes();
```
Nota: `consultor`, `magistrado` e `recuperanda` não disparam nenhum dos três prefetches acima (nenhuma condição casa) — ao portar, isso deve ser tratado como comportamento **intencional atual**, mas é um ponto de atenção: esses três papéis não têm rotas pré-carregadas, o que pode ser revisitado como melhoria, não como bug de paridade obrigatória.

## 5. `has_role` e o modelo de leitura de papel no frontend
### 5.1 Fonte de verdade: tabela `user_roles`
```ts
async function fetchUserRole(userId: string): Promise<UserRole | null> {
  const { data: roles, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .limit(1);
  if (error) { console.error("Error fetching user role:", error); return null; }
  if (roles && roles.length > 0) return roles[0].role as UserRole;
  return null;
}
```
Observação crítica: o frontend busca **apenas 1 role** (`.limit(1)`) por usuário — o modelo de dados assume 1 papel por usuário na UI, mesmo que o schema de banco (`user_roles`) permita, em tese, múltiplas linhas por `user_id`. Ao portar, preservar esse comportamento (`limit(1)`) para não introduzir ambiguidade de qual papel prevalece.

### 5.2 `role`, `realRole`, `effectiveRole`, `viewAsRole`, `isReadOnly`
Trecho real (`UserContext.tsx`, linhas 189-192):
```ts
// Only auditor_chefe is allowed to impersonate (read-only "view as").
const effectiveViewAs = role === "auditor_chefe" ? viewAsRole : null;
const effectiveRole: UserRole | null = effectiveViewAs ?? role;
const isReadOnly = !!effectiveViewAs;
```
Regras de negócio derivadas (obrigatórias na porta):
- **Somente `auditor_chefe`** pode setar `viewAsRole` com efeito real — para qualquer outro papel real, `effectiveViewAs` é forçado a `null`, mesmo que `viewAsRole` esteja setado em `localStorage` (proteção contra escalonamento de privilégio via manipulação de `localStorage`, já que o cálculo depende de `role` real, não do valor armazenado).
- `effectiveRole` é o papel que a UI deve usar para decisões de exibição de menu/rota (`role: effectiveRole` exposto no contexto).
- `realRole` (`role` bruto do banco) deve ser preservado sempre disponível para telas administrativas (ex.: para mostrar "Visualizando como: X" apenas para quem realmente é `auditor_chefe`).
- `isReadOnly = true` sempre que há impersonation ativa — toda ação de escrita (formulários, botões de salvar/excluir) DEVE ser desabilitada na UI quando `isReadOnly` for `true`. Isso é enforcement de UI; a garantia real de segurança está nas RLS policies do banco (que usam o JWT do usuário autenticado, não o `viewAsRole` do cliente — logo, mesmo que a UI falhe, o backend nunca aceita escrita indevida).

### 5.3 Higienização de armazenamento por troca de usuário
```ts
const USER_SCOPED_KEYS = [
  "userRole",
  "viewAsRole",
  "authenticated",
  "bex_audit_history",
  "bex_generated_reports",
];
const LAST_USER_KEY = "bex_last_user_id";
```
Sempre que o `user.id` da sessão Supabase mudar em relação ao último usuário registrado em `localStorage["bex_last_user_id"]`, **todas** as chaves de `USER_SCOPED_KEYS` são limpas antes de aplicar os dados do novo usuário — prevenindo vazamento de papel, impersonation ou histórico de auditoria entre contas compartilhando o mesmo navegador. Essa limpeza deve ser replicada literalmente (mesma lista de chaves) em qualquer porte.

## 6. `has_role` no banco (RLS) — padrão de uso real
Extraído de `supabase/migrations/20260522191037_...sql` (policy de `subscription_plans`):
```sql
CREATE POLICY plans_select_all ON public.subscription_plans FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY plans_mgr_write ON public.subscription_plans FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'gestor_ia'::app_role) OR has_role(auth.uid(), 'coordenadora'::app_role))
  WITH CHECK (has_role(auth.uid(), 'gestor_ia'::app_role) OR has_role(auth.uid(), 'coordenadora'::app_role));
```
Padrão de replicação: toda tabela sensível a papel deve ter:
1. Uma policy de leitura ampla (`FOR SELECT ... USING (true)`) quando o dado é público/catálogo (ex.: planos), OU restrita por `has_role`/`auth.uid() = user_id` quando o dado é privado.
2. Uma policy de escrita (`FOR ALL` ou `FOR INSERT/UPDATE/DELETE`) restrita a `has_role(auth.uid(), '<role>'::app_role)`, sempre com `USING` **e** `WITH CHECK` idênticos, para impedir tanto leitura quanto gravação indevida do lado servidor.
3. A função `has_role` deve ser `SECURITY DEFINER` e não pode depender de estado de sessão do cliente (ex.: `viewAsRole`), apenas do `auth.uid()` real do JWT.

## 7. Matriz de Permissões por Rota/Ação (papel → capacidade)
| Ação/Rota | gestor_ia | auditor_chefe | coordenadora | consultor | magistrado | recuperanda | usuario | empresa | contabilidade |
|---|---|---|---|---|---|---|---|---|---|
| Configurar cotas globais (`report_global_quotas`) — `setGlobalLimits` | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Definir cota extra por empresa (`setPerCompanyExtra`/`removePerCompanyExtra`) | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Gerir catálogo de planos (`subscription_plans` write) | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Impersonar outro papel (`setViewAsRole`, somente leitura) | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Gerar relatório BEx/Kanitz (consumindo cota da própria empresa) | — (n/a, não opera empresa) | ✅ (leitura/apoio) | ✅ (apoio) | ✅ | ❌ | ✅ (próprios dados) | ✅ | ✅ | ✅ (em nome de clientes) |
| Ver todos os relatórios de todas as empresas | ✅ | ✅ | ✅ | ✅ (conforme atribuição) | ❌ (só processos vinculados) | ❌ (só a própria empresa) | ❌ (só a própria conta) | ❌ (só a própria empresa) | ❌ (só empresas-cliente vinculadas) |
| Upload de balancetes/arquivos para auditoria | ✅ (teste/admin) | ✅ | ✅ | ✅ | ❌ | ✅ (próprios) | ✅ | ✅ | ✅ (clientes vinculados) |
| Chat de auditoria assistido por IA (`audit-chat`) | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ (leitura guiada) | ✅ | ✅ | ✅ |
| Consultar processo de RJ vinculado (visão institucional) | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ (o próprio processo) | ❌ | ❌ | ❌ |

Notas de leitura da matriz: `usuario`, `empresa` e `contabilidade` compartilham o mesmo conjunto de rotas prefetchadas (`prefetchUserRoutes`) e, na prática de negócio, são o "operador padrão" da ferramenta — a diferenciação entre eles é de cadastro/contexto comercial (pessoa física vs. empresa vs. escritório contábil terceirizado), não de nível de acesso técnico. Os papéis `magistrado` e `recuperanda` são de **consulta institucional/processual**, tipicamente vinculados a um processo de recuperação judicial específico, e não a permissões operacionais amplas de auditoria.

## 8. Enforcement no frontend
- `UserProvider` é a única fonte de `role`/`effectiveRole`/`isReadOnly` consumida por toda a árvore de componentes via `useUser()`.
- Botões/formulários de escrita devem checar `isReadOnly` do contexto antes de habilitar qualquer ação de gravação, além de checar o papel efetivo pertinente (ex.: um botão "Configurar Cotas Globais" só deve renderizar/habilitar quando `effectiveRole === "gestor_ia" || effectiveRole === "coordenadora"`).
- `PlatformLayout.tsx` é o componente responsável por decidir menu/rota conforme papel (ponto único de "ProtectedRoute"/guarda de navegação identificado no repositório).
- **Importante**: o enforcement de frontend é sempre considerado **UX**, não segurança — a segurança real está nas RLS policies (`has_role` no banco), pois o cliente pode ser adulterado.

## 9. Enforcement no edge (backend)
- As edge functions (`audit-analyze`, `audit-chat`, `audit-parse-pdf`) recebem o JWT do usuário via header `Authorization: Bearer <SUPABASE_KEY>` (chave publicável) — a validação de identidade/role real ocorre no lado do banco via RLS quando a função grava/lê dados (ex.: `audit_account_cache`, `audit_reports`, `insights`).
- Toda operação de contagem de cota (`getCompanyMonthlyUsage`, `getAllCompaniesMonthlyUsage`) lê diretamente de `audit_reports` filtrando por `company_id` e janela de tempo do mês corrente — não há bypass client-side possível para essas contagens, pois dependem de registros já persistidos no servidor no momento da geração do relatório.

## 10. Cotas de Relatórios — `report_global_quotas`
### 10.1 Schema e defaults reais (evolução via migrações)
Migração inicial (`20260522013850_...sql`):
```sql
completo integer NOT NULL DEFAULT 10 CHECK (completo >= 0 AND completo <= 9999),
...
INSERT INTO public.report_global_quotas (id) VALUES (true) ON CONFLICT DO NOTHING;
```
Migração `20260615165240_...sql` adiciona `empresas`:
```sql
ALTER TABLE public.report_global_quotas ADD COLUMN IF NOT EXISTS empresas integer NOT NULL DEFAULT 10 CHECK (empresas >= 0 AND empresas <= 9999);
```
Migração `20260615170059_...sql` adiciona `arquivos_por_auditoria` e **reduz** os defaults de `empresas` e `resumido`:
```sql
ALTER TABLE public.report_global_quotas ADD COLUMN IF NOT EXISTS arquivos_por_auditoria integer NOT NULL DEFAULT 3;
ALTER TABLE public.report_global_quotas ALTER COLUMN empresas SET DEFAULT 3;
ALTER TABLE public.report_global_quotas ALTER COLUMN resumido SET DEFAULT 1;
UPDATE public.report_global_quotas SET arquivos_por_auditoria = COALESCE(arquivos_por_auditoria, 3);
```
Migração `20260615170423_...sql` adiciona os caps de meses de extração:
```sql
ADD COLUMN IF NOT EXISTS meses_extracao_gratuito integer NOT NULL DEFAULT 3,
ADD COLUMN IF NOT EXISTS meses_extracao_pago integer NOT NULL DEFAULT 12;
```
### 10.2 Valores de default **vigentes** (linha única `id = true`)
| Coluna | Default vigente | Faixa permitida (CHECK/clamp no serviço) |
|---|---|---|
| `resumido` | `1` | `0..9999` |
| `completo` | `10` | `0..9999` |
| `empresas` | `3` | `0..9999` |
| `arquivos_por_auditoria` | `3` | mínimo `1` (clamp no serviço) |
| `meses_extracao_gratuito` | `3` | `1..60` (clamp no serviço) |
| `meses_extracao_pago` | `12` | `1..120` (clamp no serviço) |

### 10.3 Constante `DEFAULT_GLOBAL` no frontend (fallback quando a query falha)
`src/services/reportLimitsService.ts`:
```ts
const DEFAULT_GLOBAL: GlobalLimits = {
  resumido: 1, completo: 10, empresas: 3, arquivos_por_auditoria: 3,
  meses_extracao_gratuito: 3, meses_extracao_pago: 12,
};
```
Este objeto é retornado por `getGlobalLimits()` **somente** em caso de erro/ausência de linha no banco (`if (error || !data) return { ...DEFAULT_GLOBAL };`) — na operação normal, os valores vêm sempre da tabela `report_global_quotas` (linha `id = true`), garantindo que a UI do Gestor IA seja a única fonte de configuração (comentário do arquivo: *"Antes ficava em localStorage do gestor — por isso outros usuários nunca recebiam a configuração"*).

### 10.4 Regras de consumo de cota
Comentário oficial do arquivo:
```
* - Cota GLOBAL definida pelo Gestor IA (padrão 50 resumidos / 10 completos por mês).
* - Cada empresa pode receber cota EXTRA pontual que se soma à global.
* - "Relatório Completo" consome 1 completo + 1 resumido.
* - "Relatório Resumido" consome 1 resumido.
* - Renovação mensal: contagens consideram apenas o mês corrente.
```
Nota: o comentário cita "50 resumidos" como padrão histórico de documentação, mas o valor **vigente** no schema/serviço é `resumido: 1` (ver §10.2/§10.3) — ao portar, usar o valor vigente (`1`), não o valor citado no comentário desatualizado. Isso deve ser registrado como discrepância de documentação interna conhecida.

Lógica real de checagem (`canGenerateForCompany`):
```ts
export async function canGenerateForCompany(
  companyId: string,
  variant: ReportVariant = "resumido",
): Promise<{ allowed: boolean; reason?: string; quota: CompanyQuota }> {
  const quota = await getCompanyQuota(companyId);
  if (variant === "completo") {
    if (quota.completo.remaining <= 0) {
      return { allowed: false, reason: `Cota mensal de Completos esgotada (${quota.completo.used}/${quota.completo.limit}).`, quota };
    }
    if (quota.resumido.remaining <= 0) {
      return { allowed: false, reason: `Cota mensal de Resumidos esgotada — o Completo gera também 1 Resumido (${quota.resumido.used}/${quota.resumido.limit}).`, quota };
    }
    return { allowed: true, quota };
  }
  if (quota.resumido.remaining <= 0) {
    return { allowed: false, reason: `Cota mensal de Resumidos esgotada (${quota.resumido.used}/${quota.resumido.limit}).`, quota };
  }
  return { allowed: true, quota };
}
```
Regra de acoplamento obrigatória: **gerar um relatório "completo" exige simultaneamente 1 unidade de cota "completo" E 1 unidade de cota "resumido" disponíveis** — a validação checa completo primeiro, depois resumido, e só permite se ambas as condições passarem.

### 10.5 Janela de contagem mensal
```ts
function monthBounds(d = new Date()): { start: string; end: string } {
  const start = new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0).toISOString();
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 1, 0, 0, 0, 0).toISOString();
  return { start, end };
}
```
Contagem sempre em fuso/relógio local do processo que executa o cálculo (client-side, no navegador), consultando `audit_reports` filtrando `created_at` dentro de `[start, end)` do mês corrente — sem consideração de fuso horário do usuário vs. servidor (ponto de atenção para replicação em ambientes multi-fuso; a plataforma atual assume TZ único de operação, tipicamente America/Sao_Paulo).

### 10.6 Extras por empresa (`report_company_quota_extras`)
```ts
export async function setPerCompanyExtra(
  companyId: string, companyName: string,
  extras: { resumido: number; completo: number },
): Promise<void> {
  const payload = {
    company_id: companyId,
    company_name: companyName,
    resumido_extra: Math.max(0, Math.min(999, Math.floor(Number(extras.resumido) || 0))),
    completo_extra: Math.max(0, Math.min(999, Math.floor(Number(extras.completo) || 0))),
    updated_at: new Date().toISOString(),
    updated_by: userRes?.user?.id ?? null,
  };
  const { error } = await supabase.from("report_company_quota_extras").upsert(payload, { onConflict: "company_id" });
  if (error) throw error;
}
```
Cota efetiva da empresa = cota global + extra da empresa (soma simples), calculada em `getCompanyQuota`:
```ts
const limR = global.resumido + (extra?.resumido ?? 0);
const limC = global.completo + (extra?.completo ?? 0);
```

### 10.7 Cap de meses de extração — `getAuditMonthsCap`
```ts
export async function getAuditMonthsCap(companyId: string | null | undefined): Promise<AuditMonthsCap> {
  const global = await getGlobalLimits();
  const capGrat = Math.max(1, Number(global.meses_extracao_gratuito) || 3);
  const capPago = Math.max(capGrat, Number(global.meses_extracao_pago) || 12);
  if (!companyId) return { cap: capGrat, tier: "gratuito" };
  try {
    const quota = await getCompanyQuota(companyId);
    const isPago = quota.completo.remaining > 0;
    return { cap: isPago ? capPago : capGrat, tier: isPago ? "pago" : "gratuito" };
  } catch {
    return { cap: capGrat, tier: "gratuito" };
  }
}
```
Regra de negócio: o **tier** (`gratuito`/`pago`) de uma empresa para fins de cap de meses de extração **não vem de `subscriptions`/`subscription_plans`**, mas sim indiretamente do saldo de cota "completo" restante (`quota.completo.remaining > 0` ⇒ tier `pago`). Isso significa que uma empresa some para o tier "gratuito" automaticamente quando esgota a cota de relatórios completos do mês, mesmo tendo uma assinatura paga ativa — comportamento real e intencional a preservar na porta, não um bug.

## 11. `subscription_plans` e `subscriptions`
### 11.1 Catálogo real de planos (`INSERT` da migração)
```sql
INSERT INTO public.subscription_plans (code, name, price_cents, monthly_report_limit, features) VALUES
  ('pro', 'PRO', 0, 3, '["Cadastro com CNPJ e CRC", "Até 3 relatórios PRO/mês", "Gráficos e análise básica de balancetes", "Visibilidade Kanitz (resumida)"]'::jsonb),
  ('enterprise', 'Enterprise', 500, 16, '["Tudo do PRO", "6 relatórios completos Auditoria BEx IA/mês", "+10 relatórios PRO (desbloqueio PRO 10)", "2 relatórios simultâneos PRO + Kanitz", "Workspace de análise pós-relatório", "Kanitz completo", "Análise aprofundada e ampliada"]'::jsonb);
```
| Código | Nome | `price_cents` | `monthly_report_limit` | Features |
|---|---|---|---|---|
| `pro` | PRO | 0 | 3 | Cadastro com CNPJ e CRC; Até 3 relatórios PRO/mês; Gráficos e análise básica de balancetes; Visibilidade Kanitz (resumida) |
| `enterprise` | Enterprise | 500 | 16 | Tudo do PRO; 6 relatórios completos Auditoria BEx IA/mês; +10 relatórios PRO (desbloqueio PRO 10); 2 relatórios simultâneos PRO + Kanitz; Workspace de análise pós-relatório; Kanitz completo; Análise aprofundada e ampliada |

Observações: `price_cents = 500` para `enterprise` equivale a **R$ 5,00** (nomenclatura em centavos) — valor de catálogo de exemplo/homologação presente na migração; ao portar para produção, revisar antes de publicar comercialmente. `monthly_report_limit` do plano `enterprise` (16) é a soma implícita de "6 completos + 10 PRO extras" citada nas features, mas o **enforcement real** de geração de relatório passa por `report_global_quotas`/`report_company_quota_extras` (§10), não diretamente por `monthly_report_limit` da assinatura — este último é informativo/comercial no catálogo.

### 11.2 RLS de `subscription_plans`
```sql
ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY plans_select_all ON public.subscription_plans FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY plans_mgr_write ON public.subscription_plans FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'gestor_ia'::app_role) OR has_role(auth.uid(), 'coordenadora'::app_role))
  WITH CHECK (has_role(auth.uid(), 'gestor_ia'::app_role) OR has_role(auth.uid(), 'coordenadora'::app_role));
```
Catálogo de planos é **público** (leitura livre, inclusive anônima, para exibir preços/planos em landing page), mas escrita restrita a `gestor_ia`/`coordenadora`.

### 11.3 `subscriptions` (schema real)
```sql
CREATE TABLE public.subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE,
  plan_code TEXT NOT NULL REFERENCES public.subscription_plans(code),
  status TEXT NOT NULL DEFAULT 'active', -- active | pending | past_due | canceled
  auto_renew BOOLEAN NOT NULL DEFAULT true,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  current_period_start TIMESTAMPTZ NOT NULL DEFAULT now(),
  current_period_end TIMESTAMPTZ,
  canceled_at TIMESTAMPTZ,
  abacatepay_customer_id TEXT,
  abacatepay_subscription_id TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```
Pontos relevantes: `user_id UNIQUE` (1 assinatura ativa por usuário, sem histórico de múltiplas assinaturas simultâneas na mesma linha); `status` é um enum textual livre (`active|pending|past_due|canceled`), não um `CHECK` de banco (a validação de valores é responsabilidade da aplicação); integração de pagamento via campos `abacatepay_customer_id`/`abacatepay_subscription_id` (gateway AbacatePay).

## 12. Limites de meses de extração e arquivos por auditoria — resumo operacional
| Parâmetro | Tier Gratuito | Tier Pago |
|---|---|---|
| Meses de extração processáveis (workspace/relatórios) | `meses_extracao_gratuito` = **3** (default) | `meses_extracao_pago` = **12** (default) |
| Arquivos por auditoria | `arquivos_por_auditoria` = **3** (default, global — não distingue tier) |
| Empresas cadastráveis (cota global) | `empresas` = **3** (default) |

`getAuditMonthsCap` garante `capPago >= capGrat` sempre (`Math.max(capGrat, ...)`), prevenindo configuração inconsistente onde o tier pago teria cap menor que o gratuito.

## 13. Checklist de Implementação
- [ ] Enum `app_role` replicado com exatamente os 9 valores, na mesma ordem semântica: `gestor_ia, auditor_chefe, coordenadora, consultor, magistrado, recuperanda, usuario, empresa, contabilidade`.
- [ ] Tabela `user_roles` + função `has_role(uuid, app_role) returns boolean` (`SECURITY DEFINER`) implementadas antes de qualquer policy RLS.
- [ ] `UserContext` com `role`, `realRole`, `effectiveRole`, `viewAsRole`, `isReadOnly` — impersonation restrita a `auditor_chefe`.
- [ ] Limpeza de `USER_SCOPED_KEYS` ao detectar troca de `user.id` via `LAST_USER_KEY`.
- [ ] `report_global_quotas` com defaults vigentes: `resumido=1, completo=10, empresas=3, arquivos_por_auditoria=3, meses_extracao_gratuito=3, meses_extracao_pago=12`.
- [ ] `report_company_quota_extras` com `upsert` por `company_id` (`onConflict: "company_id"`), clamps `0..999`.
- [ ] `canGenerateForCompany` replicado com a regra de acoplamento completo→(completo+resumido).
- [ ] `getAuditMonthsCap` derivando tier a partir de `quota.completo.remaining > 0`, nunca de `subscriptions.status` diretamente.
- [ ] `subscription_plans` semeado com os planos `pro` (limite 3, R$0) e `enterprise` (limite 16, `price_cents=500`).
- [ ] RLS: leitura pública de `subscription_plans`, escrita restrita a `gestor_ia`/`coordenadora` (`USING` e `WITH CHECK` idênticos).
- [ ] `subscriptions.user_id` com constraint `UNIQUE`.

## 14. Critérios de Homologação
1. **Isolamento de impersonation**: logar como um papel diferente de `auditor_chefe`, setar `viewAsRole` manualmente via `localStorage`, e confirmar que `effectiveRole` continua sendo o papel real (impersonation ignorada).
2. **Troca de usuário limpa estado**: logar com usuário A, depois logar com usuário B no mesmo navegador, e confirmar que nenhuma chave de `USER_SCOPED_KEYS` de A é lida por B.
3. **Cota acoplada**: com `completo.remaining = 1` e `resumido.remaining = 0`, tentar gerar um relatório "completo" deve falhar com a mensagem exata *"Cota mensal de Resumidos esgotada — o Completo gera também 1 Resumido (X/Y)."*.
4. **Extras somam corretamente**: definir extra de empresa `resumido: 5` com cota global `resumido: 1` deve resultar em `limit = 6` para `getCompanyQuota`.
5. **Tier dinâmico**: uma empresa com assinatura `enterprise` ativa, mas cota "completo" zerada no mês, deve cair para tier `gratuito` no cap de meses de extração — validar que isso é o comportamento esperado (não um bug) e está documentado para o time de produto.
6. **RLS de planos**: usuário anônimo consegue `SELECT` em `subscription_plans`; usuário `usuario`/`empresa` NÃO consegue `INSERT/UPDATE` em `subscription_plans` (deve falhar por RLS); usuário `gestor_ia` ou `coordenadora` consegue.
7. **Janela mensal**: um relatório gerado no último dia do mês anterior não deve contar na cota do mês corrente; um relatório gerado no primeiro dia do mês corrente deve contar.
