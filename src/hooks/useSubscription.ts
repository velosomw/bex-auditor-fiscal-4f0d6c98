import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export type Subscription = {
  id: string;
  user_id: string;
  plan_code: "pro" | "enterprise";
  status: "active" | "pending" | "past_due" | "canceled";
  auto_renew: boolean;
  current_period_start: string;
  current_period_end: string | null;
  canceled_at: string | null;
  started_at: string;
};

export type SubscriptionInvoice = {
  id: string;
  subscription_id: string;
  period_start: string;
  period_end: string;
  amount_cents: number;
  status: "pending" | "paid" | "failed" | "refunded" | "expired";
  paid_at: string | null;
  pix_qr_code: string | null;
  pix_copy_paste: string | null;
  expires_at: string | null;
  created_at: string;
};

export const useSubscription = () => {
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [invoices, setInvoices] = useState<SubscriptionInvoice[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }
    const { data: sub } = await supabase.from("subscriptions").select("*").eq("user_id", user.id).maybeSingle();
    setSubscription(sub as Subscription | null);
    const { data: inv } = await supabase.from("subscription_invoices").select("*").eq("user_id", user.id).order("created_at", { ascending: false });
    setInvoices((inv || []) as SubscriptionInvoice[]);
    setLoading(false);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  return { subscription, invoices, loading, refresh };
};
