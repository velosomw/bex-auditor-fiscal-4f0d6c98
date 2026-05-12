export type UserRole = 'auditor_chefe' | 'usuario' | 'empresa' | 'gestor_ia' | 'coordenadora' | 'consultor' | 'magistrado' | 'recuperanda' | 'contabilidade';

export interface User {
  email: string;
  role: UserRole | null;
  name: string;
}
