-- Tabela para rastrear tentativas de login
CREATE TABLE public.login_attempts (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    email TEXT NOT NULL,
    status TEXT NOT NULL, -- 'pending_confirmation', 'failed', 'success'
    ip_address TEXT,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Habilitar RLS
ALTER TABLE public.login_attempts ENABLE ROW LEVEL SECURITY;

-- Política para Gestor IA visualizar todas as tentativas
CREATE POLICY "Gestor IA pode visualizar todas as tentativas de login"
ON public.login_attempts
FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM public.user_roles
        WHERE user_id = auth.uid()
        AND role = 'gestor_ia'
    )
);

-- Política para inserir tentativas (pode ser feito anonimamente ou via edge function, mas aqui permitimos inserção básica para facilitar o rastreamento inicial)
CREATE POLICY "Permitir inserção de tentativas de login"
ON public.login_attempts
FOR INSERT
WITH CHECK (true);

-- Indexar e-mail e status para performance no acompanhamento
CREATE INDEX idx_login_attempts_email ON public.login_attempts(email);
CREATE INDEX idx_login_attempts_status ON public.login_attempts(status);