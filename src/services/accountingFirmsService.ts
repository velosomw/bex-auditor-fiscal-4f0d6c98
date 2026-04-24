import { supabase } from "@/integrations/supabase/client";

export type AccountingFirmStatus = "ativa" | "pendente" | "bloqueada";

export interface AccountingFirm {
  id: string;
  user_id: string | null;
  name: string;
  cnpj: string;
  crc: string;
  phone: string;
  email: string;
  address: string | null;
  address_number: string | null;
  zip: string | null;
  status: AccountingFirmStatus;
  source: "site" | "auditor";
  created_at: string;
  updated_at: string;
}

export interface CreateAccountingFirmInput {
  name: string;
  cnpj: string;
  crc: string;
  phone: string;
  email: string;
  address?: string;
  address_number?: string;
  zip?: string;
}

/** Public site registration — anonymous insert, status pendente */
export async function submitAccountingFirmRegistration(
  input: CreateAccountingFirmInput,
): Promise<void> {
  const payload = {
    name: input.name.trim(),
    cnpj: input.cnpj.trim(),
    crc: input.crc.trim(),
    phone: input.phone.trim(),
    email: input.email.trim().toLowerCase(),
    address: input.address?.trim() || null,
    address_number: input.address_number?.trim() || null,
    zip: input.zip?.trim() || null,
    status: "pendente" as const,
    source: "site" as const,
    user_id: null,
  };
  const { error } = await supabase.from("accounting_firms" as any).insert(payload);
  if (error) throw error;
}

/** Get the firm linked to the currently logged-in user */
export async function getMyAccountingFirm(): Promise<AccountingFirm | null> {
  const { data: sessionData } = await supabase.auth.getSession();
  const uid = sessionData.session?.user?.id;
  if (!uid) return null;
  const { data, error } = await supabase
    .from("accounting_firms" as any)
    .select("*")
    .eq("user_id", uid)
    .maybeSingle();
  if (error) throw error;
  return (data as unknown as AccountingFirm) || null;
}
