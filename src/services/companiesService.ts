import { supabase } from "@/integrations/supabase/client";

export interface Company {
  id: string;
  name: string;
  cnpj: string | null;
  sector: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export async function listCompanies(): Promise<Company[]> {
  const { data, error } = await supabase
    .from("companies")
    .select("*")
    .order("name", { ascending: true });
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

export async function createCompany(input: {
  name: string;
  cnpj?: string;
  sector?: string;
}): Promise<Company> {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) throw new Error("Não autenticado");

  const { data, error } = await supabase
    .from("companies")
    .insert({
      name: input.name,
      cnpj: input.cnpj || null,
      sector: input.sector || null,
      created_by: userId,
    })
    .select()
    .single();
  if (error) throw error;
  return data as Company;
}
