export type UserRole = 'auditor_chefe' | 'usuario' | 'empresa';

export interface User {
  email: string;
  role: UserRole | null;
  name: string;
}
