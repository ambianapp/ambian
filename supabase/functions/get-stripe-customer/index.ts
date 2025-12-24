import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const ALLOWED_ORIGINS = [
  "https://ambian.lovable.app",
  "https://preview--ambian.lovable.app",
  "http://localhost:5173",
  "http://localhost:8080",
];

const getCorsHeaders = (origin: string | null) => {
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin || "") ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowedOrigin!,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[GET-STRIPE-CUSTOMER] ${step}${detailsStr}`);
};

serve(async (req) => {
  const origin = req.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    logStep("Function started");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");

    // Create user client for authorization check
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) throw new Error("Unauthorized");

    // Check admin role using standard RPC
    const { data: isAdmin } = await userClient.rpc("has_role", {
      _user_id: user.id,
      _role: "admin",
    });

    if (!isAdmin) {
      throw new Error("Admin access required");
    }
    logStep("Admin verified", { userId: user.id });

    const { email } = await req.json();
    if (!email) throw new Error("Email is required");
    logStep("Looking up customer", { email });

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2025-08-27.basil",
    });

    // Find customer by email
    const customers = await stripe.customers.list({ email, limit: 1 });
    
    if (customers.data.length === 0) {
      logStep("No customer found");
      return new Response(JSON.stringify({ customer: null }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    const customer = customers.data[0];
    logStep("Customer found", { customerId: customer.id });

    // Get subscriptions for this customer
    const subscriptions = await stripe.subscriptions.list({
      customer: customer.id,
      limit: 10,
    });

    // Get all invoices (increased limit for full payment history)
    const invoices = await stripe.invoices.list({
      customer: customer.id,
      limit: 100,
    });

    // Get payment methods
    const paymentMethods = await stripe.paymentMethods.list({
      customer: customer.id,
      type: "card",
    });

    const customerData = {
      id: customer.id,
      email: customer.email,
      name: customer.name,
      phone: customer.phone,
      address: customer.address,
      metadata: customer.metadata,
      created: customer.created,
      currency: customer.currency,
      balance: customer.balance,
      delinquent: customer.delinquent,
      subscriptions: subscriptions.data.map((sub: any) => ({
        id: sub.id,
        status: sub.status,
        current_period_start: sub.current_period_start,
        current_period_end: sub.current_period_end,
        cancel_at_period_end: sub.cancel_at_period_end,
        items: sub.items.data.map((item: any) => ({
          price_id: item.price.id,
          product_id: item.price.product,
          amount: item.price.unit_amount,
          currency: item.price.currency,
          interval: item.price.recurring?.interval,
        })),
      })),
      invoices: invoices.data.map((inv: any) => ({
        id: inv.id,
        number: inv.number,
        status: inv.status,
        amount_due: inv.amount_due,
        amount_paid: inv.amount_paid,
        currency: inv.currency,
        created: inv.created,
        hosted_invoice_url: inv.hosted_invoice_url,
        invoice_pdf: inv.invoice_pdf,
        description: inv.description,
        period_start: inv.period_start,
        period_end: inv.period_end,
      })),
      paymentMethods: paymentMethods.data.map((pm: any) => ({
        id: pm.id,
        brand: pm.card?.brand,
        last4: pm.card?.last4,
        exp_month: pm.card?.exp_month,
        exp_year: pm.card?.exp_year,
      })),
    };

    logStep("Returning customer data");
    return new Response(JSON.stringify({ customer: customerData }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message: errorMessage });
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
