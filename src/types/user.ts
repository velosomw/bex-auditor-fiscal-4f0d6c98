export type UserRole = 'auditor_chefe' | 'usuario';

export interface User {
  email: string;
  role: UserRole | null;
  name: string;
}
