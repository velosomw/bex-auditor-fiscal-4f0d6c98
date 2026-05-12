-- Email branding (single row)
create table if not exists public.email_brand_settings (
  id boolean primary key default true check (id),
  brand_name text not null default 'BEx Auditoria',
  tagline text not null default 'Inteligência Financeira · Auditor Contábil Sênior IA',
  logo_url text not null default 'https://mrvizydgxysaxazhmfqk.supabase.co/storage/v1/object/public/email-assets/logo-bex.jpeg',
  primary_color text not null default '#1a7af0',
  primary_color_dark text not null default '#0f5fc7',
  header_bg_from text not null default '#121f3a',
  header_bg_to text not null default '#1c2c52',
  text_color text not null default '#1c2540',
  muted_color text not null default '#5b6478',
  footer_url text not null default 'https://bexbrasil.online',
  footer_label text not null default 'bexbrasil.online',
  updated_at timestamptz not null default now(),
  updated_by uuid
);

insert into public.email_brand_settings (id) values (true) on conflict do nothing;

create table if not exists public.email_template_overrides (
  template_type text primary key check (template_type in ('signup','recovery','invite','magiclink','email_change','reauthentication')),
  subject text not null,
  preview_text text not null,
  header_subtitle text not null,
  heading text not null,
  intro_html text not null,
  body_html text not null default '',
  button_label text not null,
  footer_html text not null,
  enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

insert into public.email_template_overrides (template_type, subject, preview_text, header_subtitle, heading, intro_html, body_html, button_label, footer_html) values
('signup','Confirme seu e-mail','Confirme seu e-mail para acessar a BEx Auditoria','Inteligência Financeira · Auditor Contábil Sênior IA','Confirme seu e-mail','Recebemos sua solicitação de cadastro na plataforma BEx Auditoria com o e-mail <strong>{{recipient}}</strong>.','Para ativar seu acesso ao painel de Contabilidade — onde você poderá cadastrar empresas vinculadas e executar auditorias com nossa IA — confirme seu e-mail clicando no botão abaixo:','Confirmar e-mail e acessar','Este link é válido por 24 horas. Se você não solicitou este cadastro, ignore esta mensagem com segurança — nenhuma conta será criada.'),
('recovery','Redefina sua senha','Redefina sua senha de acesso à BEx Auditoria','Plataforma de Auditoria Inteligente','Redefinir sua senha','Recebemos uma solicitação para redefinir a senha da sua conta na BEx Auditoria.','Clique no botão abaixo para escolher uma nova senha:','Redefinir senha','Por segurança, este link expira em breve. Se você não solicitou a redefinição, ignore este e-mail — sua senha permanecerá inalterada.'),
('invite','Você foi convidado','Você foi convidado para a BEx Auditoria','Convite de acesso à plataforma','Você foi convidado','Um administrador da <strong>BEx Auditoria</strong> convidou você para acessar a plataforma de auditoria inteligente.','Aceite o convite, defina sua senha e comece a usar os relatórios Kanitz, BEx Solvência e BEx-RJ junto ao nosso Auditor Contábil Sênior IA.','Aceitar convite','Se você não esperava este convite, pode ignorar esta mensagem com segurança.'),
('magiclink','Seu link de acesso','Seu link de acesso à BEx Auditoria','Acesso seguro · sem senha','Seu link de acesso','Use o botão abaixo para entrar na plataforma BEx Auditoria. O link é pessoal, de uso único e expira em alguns minutos.','','Entrar na plataforma','Se você não solicitou este link, ignore este e-mail com segurança.'),
('email_change','Confirme a alteração de e-mail','Confirme a alteração do seu e-mail na BEx Auditoria','Alteração de e-mail da conta','Confirme a alteração de e-mail','Recebemos uma solicitação para alterar o e-mail da sua conta de <strong>{{oldEmail}}</strong> para <strong>{{newEmail}}</strong>.','Clique no botão abaixo para confirmar a alteração:','Confirmar alteração','Se você não solicitou esta alteração, proteja sua conta imediatamente alterando sua senha e contate nosso suporte.'),
('reauthentication','Seu código de verificação','Seu código de verificação BEx Auditoria','Código de verificação','Confirme sua identidade','Use o código abaixo para confirmar sua identidade na plataforma BEx Auditoria:','','','Este código expira em alguns minutos. Se você não solicitou esta verificação, ignore este e-mail e considere alterar sua senha.')
on conflict (template_type) do nothing;

alter table public.email_brand_settings enable row level security;
alter table public.email_template_overrides enable row level security;

drop policy if exists "email_brand_admin_read" on public.email_brand_settings;
drop policy if exists "email_brand_admin_write" on public.email_brand_settings;
drop policy if exists "email_tpl_admin_read" on public.email_template_overrides;
drop policy if exists "email_tpl_admin_write" on public.email_template_overrides;

create policy "email_brand_admin_read" on public.email_brand_settings for select to authenticated
  using (public.has_role(auth.uid(),'gestor_ia') or public.has_role(auth.uid(),'coordenadora') or public.has_role(auth.uid(),'auditor_chefe'));
create policy "email_brand_admin_write" on public.email_brand_settings for update to authenticated
  using (public.has_role(auth.uid(),'gestor_ia') or public.has_role(auth.uid(),'coordenadora'))
  with check (public.has_role(auth.uid(),'gestor_ia') or public.has_role(auth.uid(),'coordenadora'));

create policy "email_tpl_admin_read" on public.email_template_overrides for select to authenticated
  using (public.has_role(auth.uid(),'gestor_ia') or public.has_role(auth.uid(),'coordenadora') or public.has_role(auth.uid(),'auditor_chefe'));
create policy "email_tpl_admin_write" on public.email_template_overrides for update to authenticated
  using (public.has_role(auth.uid(),'gestor_ia') or public.has_role(auth.uid(),'coordenadora'))
  with check (public.has_role(auth.uid(),'gestor_ia') or public.has_role(auth.uid(),'coordenadora'));

create or replace function public.touch_email_settings() returns trigger language plpgsql as $$
begin new.updated_at := now(); new.updated_by := auth.uid(); return new; end $$;

drop trigger if exists tg_touch_email_brand on public.email_brand_settings;
create trigger tg_touch_email_brand before update on public.email_brand_settings for each row execute function public.touch_email_settings();
drop trigger if exists tg_touch_email_tpl on public.email_template_overrides;
create trigger tg_touch_email_tpl before update on public.email_template_overrides for each row execute function public.touch_email_settings();