import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[CREATE-CHECKOUT] ${step}${detailsStr}`);
};

// Price IDs for subscriptions (recurring)
const SUBSCRIPTION_PRICES = {
  monthly: "price_1S2BhCJrU52a7SNLtRRpyoCl",
  yearly: "price_1S2BqdJrU52a7SNLAnOR8Nhf",
};

// Price IDs for prepaid access (one-time)
const PREPAID_PRICES = {
  monthly: "price_1SfhOOJrU52a7SNLPPopAVyb",
  yearly: "price_1SfhOZJrU52a7SNLIejHHUh4",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "No authorization header" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 401,
    });
  }

  const supabaseClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    { global: { headers: { Authorization: authHeader } } }
  );

  try {
    logStep("Function started");

    const { priceId, paymentMode } = await req.json();
    // paymentMode: "subscription" or "payment" (one-time prepaid)
    const mode = paymentMode || "subscription";
    logStep("Received request", { priceId, mode });

    // Determine plan type from price ID
    let planType = "monthly";
    if (priceId === SUBSCRIPTION_PRICES.yearly || priceId === PREPAID_PRICES.yearly) {
      planType = "yearly";
    }
    logStep("Plan type determined", { planType });

    const { data, error: userError } = await supabaseClient.auth.getUser();
    if (userError) throw new Error(`Auth error: ${userError.message}`);
    const user = data.user;
    if (!user?.email) throw new Error("User not authenticated");
    logStep("User authenticated", { userId: user.id, email: user.email });

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2025-08-27.basil",
    });

    // Check for existing customer
    const customers = await stripe.customers.list({ email: user.email, limit: 1 });
    let customerId: string | undefined;
    if (customers.data.length > 0) {
      customerId = customers.data[0].id;
      logStep("Found existing customer", { customerId });
    }

    const returnOrigin = req.headers.get("origin") || "https://ambian.lovable.app";
    
    // Build success URL based on mode
    const successUrl = mode === "payment" 
      ? `${returnOrigin}/?checkout=success&session_id={CHECKOUT_SESSION_ID}&mode=prepaid`
      : `${returnOrigin}/?checkout=success`;

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      customer_email: customerId ? undefined : user.email,
      customer_update: customerId ? {
        name: "auto",
        address: "auto",
      } : undefined,
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      mode: mode, // "subscription" or "payment"
      success_url: successUrl,
      cancel_url: `${returnOrigin}/?checkout=cancelled`,
      metadata: {
        user_id: user.id,
        plan_type: planType,
        payment_mode: mode,
      },
      automatic_tax: { enabled: true },
      tax_id_collection: { enabled: true },
      billing_address_collection: "required",
      custom_fields: [
        {
          key: "company_name",
          label: { type: "custom", custom: "Company Name" },
          type: "text",
        },
      ],
    });

    logStep("Checkout session created", { sessionId: session.id, mode });

    return new Response(JSON.stringify({ url: session.url }), {
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
