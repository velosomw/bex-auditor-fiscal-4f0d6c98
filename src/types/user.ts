export type UserRole = 'auditor_chefe' | 'usuario' | 'empresa' | 'gestor_ia';

export interface User {
  email: string;
  role: UserRole | null;
  name: string;
}
