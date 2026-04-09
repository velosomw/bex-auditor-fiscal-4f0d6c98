
-- Clean slate
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;
DROP FUNCTION IF EXISTS public.update_updated_at_column() CASCADE;
DROP TABLE IF EXISTS public.user_roles CASCADE;
DROP TABLE IF EXISTS public.profiles CASCADE;
DROP TYPE IF EXISTS public.app_role CASCADE;

-- 1. Profiles
CREATE TABLE public.profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  full_name TEXT NOT NULL DEFAULT '',
  phone TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 2. Roles
CREATE TYPE public.app_role AS ENUM (
  'gestor_ia','auditor_chefe','coordenadora','consultor',
  'magistrado','recuperanda','usuario','empresa'
);
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- 3. has_role (security definer)
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role) $$;

-- 4. Profiles RLS
CREATE POLICY "p_sel_own" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "p_upd_own" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "p_ins_own" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "p_sel_mgr" ON public.profiles FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'gestor_ia') OR public.has_role(auth.uid(), 'coordenadora'));
CREATE POLICY "p_upd_mgr" ON public.profiles FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'gestor_ia') OR public.has_role(auth.uid(), 'coordenadora'));
CREATE POLICY "p_ins_mgr" ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'gestor_ia') OR public.has_role(auth.uid(), 'coordenadora'));

-- 5. Roles RLS
CREATE POLICY "r_sel" ON public.user_roles FOR SELECT TO authenticated USING (true);
CREATE POLICY "r_ins" ON public.user_roles FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'gestor_ia') OR public.has_role(auth.uid(), 'coordenadora'));
CREATE POLICY "r_upd" ON public.user_roles FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'gestor_ia') OR public.has_role(auth.uid(), 'coordenadora'));
CREATE POLICY "r_del" ON public.user_roles FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'gestor_ia') OR public.has_role(auth.uid(), 'coordenadora'));

-- 6. Triggers
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (user_id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', ''));
  RETURN NEW;
END; $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$
LANGUAGE plpgsql SET search_path = public;
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
