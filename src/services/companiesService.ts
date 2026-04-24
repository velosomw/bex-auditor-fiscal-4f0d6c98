import { supabase } from "@/integrations/supabase/client";

export type CompanyStatus = "ativa" | "pendente" | "bloqueada";
export type PaymentStatus = "em_dia" | "vencido" | "isento";
export type CompanySource = "site" | "auditor";

export interface Company {
  id: string;
  name: string;
  cnpj: string | null;
  sector: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  status: CompanyStatus;
  payment_status: PaymentStatus;
  payment_due_date: string | null;
  cnae: string | null;
  phone: string | null;
  phone_fixed: string | null;
  email: string | null;
  contact_name: string | null;
  address: string | null;
  city: string | null;
  uf: string | null;
  zip: string | null;
  notes: string | null;
  source: CompanySource;
  accounting_firm_id?: string | null;
}

/**
 * Lista empresas. Por padrão lista todas (uso de gestores/auditores).
 * Passe { ownedOnly: true } para listar apenas as empresas criadas pelo usuário logado
 * (uso do login Empresa, que vê apenas suas próprias empresas cadastradas).
 */
export async function listCompanies(opts?: { ownedOnly?: boolean }): Promise<Company[]> {
  let query = supabase.from("companies").select("*").order("name", { ascending: true });
  if (opts?.ownedOnly) {
    const { data: sessionData } = await supabase.auth.getSession();
    const uid = sessionData.session?.user?.id;
    if (!uid) return [];
    query = query.eq("created_by", uid);
  }
  const { data, error } = await query;
  if (error) throw error;
  return (data || []) as Company[];
}

export async function getCompany(id: string): Promise<Company | null> {
  const { data, error } = await supabase
    .from("companies")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return (data as Company) || null;
}

export interface CreateCompanyInput {
  name: string;
  cnpj?: string;
  sector?: string;
  cnae?: string;
  phone?: string;
  email?: string;
  contact_name?: string;
  address?: string;
  city?: string;
  uf?: string;
  zip?: string;
  notes?: string;
  status?: CompanyStatus;
  source?: CompanySource;
  phone_fixed?: string;
}

export async function createCompany(input: CreateCompanyInput): Promise<Company> {
  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData.session?.user?.id;
  const isAuthenticated = !!userId;

  if (!isAuthenticated && input.source !== "site") {
    throw new Error("Sessão expirada. Faça login novamente para cadastrar a empresa.");
  }

  const payload: any = {
    name: input.name,
    cnpj: input.cnpj || null,
    sector: input.sector || null,
    cnae: input.cnae || null,
    phone: input.phone || null,
    phone_fixed: input.phone_fixed || null,
    email: input.email || null,
    contact_name: input.contact_name || null,
    address: input.address || null,
    city: input.city || null,
    uf: input.uf || null,
    zip: input.zip || null,
    notes: input.notes || null,
    status: input.status || (isAuthenticated ? "ativa" : "pendente"),
    source: input.source || (isAuthenticated ? "auditor" : "site"),
    created_by: userId || null,
  };

  // Anonymous (site) inserts cannot SELECT back due to RLS — only insert.
  if (!isAuthenticated) {
    const { error } = await supabase.from("companies").insert(payload);
    if (error) throw error;
    return { ...payload, id: "", created_at: "", updated_at: "" } as Company;
  }

  const { data, error } = await supabase
    .from("companies")
    .insert(payload)
    .select()
    .single();
  if (error) throw error;
  return data as Company;
}

export async function updateCompanyStatus(id: string, status: CompanyStatus): Promise<void> {
  const { error } = await supabase.from("companies").update({ status }).eq("id", id);
  if (error) throw error;
}

export async function updateCompanyPayment(
  id: string,
  payment_status: PaymentStatus,
  payment_due_date?: string | null
): Promise<void> {
  const patch: any = { payment_status };
  if (payment_due_date !== undefined) patch.payment_due_date = payment_due_date;
  const { error } = await supabase.from("companies").update(patch).eq("id", id);
  if (error) throw error;
}

export async function deleteCompany(id: string): Promise<void> {
  const { error } = await supabase.from("companies").delete().eq("id", id);
  if (error) throw error;
}
