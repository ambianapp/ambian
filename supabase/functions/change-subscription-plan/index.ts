import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const ALLOWED_ORIGINS = [
  "https://ambian.lovable.app",
  "https://preview--ambian.lovable.app",
  "https://ambianmusic.com",
  "https://www.ambianmusic.com",
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
  console.log(`[CHANGE-PLAN] ${step}${detailsStr}`);
};

// Price IDs for subscriptions
const SUBSCRIPTION_PRICES = {
  monthly: "price_1S2BhCJrU52a7SNLtRRpyoCl",
  yearly: "price_1S2BqdJrU52a7SNLAnOR8Nhf",
};

serve(async (req) => {
  const origin = req.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    logStep("Function started");

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not set");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");

    // Use anon key with user's token for authentication
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError) throw new Error(`Auth error: ${userError.message}`);
    const user = userData.user;
    if (!user?.email) throw new Error("User not authenticated");
    logStep("User authenticated", { email: user.email });

    const { newPlan } = await req.json();
    if (!newPlan || !["monthly", "yearly"].includes(newPlan)) {
      throw new Error("Invalid plan. Must be 'monthly' or 'yearly'");
    }
    logStep("Requested plan change", { newPlan });

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    // Find customer
    const customers = await stripe.customers.list({ email: user.email, limit: 1 });
    if (customers.data.length === 0) {
      throw new Error("No Stripe customer found");
    }
    const customerId = customers.data[0].id;
    logStep("Found customer", { customerId });

    // Get active subscription
    const subscriptions = await stripe.subscriptions.list({
      customer: customerId,
      status: "active",
      limit: 1,
    });

    if (subscriptions.data.length === 0) {
      throw new Error("No active subscription found");
    }

    const subscription = subscriptions.data[0];
    const currentPriceId = subscription.items.data[0].price.id;
    const newPriceId = SUBSCRIPTION_PRICES[newPlan as keyof typeof SUBSCRIPTION_PRICES];

    logStep("Current subscription", { 
      subscriptionId: subscription.id, 
      currentPriceId, 
      newPriceId 
    });

    // Check if already on the requested plan
    if (currentPriceId === newPriceId) {
      throw new Error(`Already on ${newPlan} plan`);
    }

    const returnOrigin = ALLOWED_ORIGINS.includes(origin || "") ? origin : ALLOWED_ORIGINS[0];

    // Prefer a dedicated confirmation flow (shows proration + requires explicit confirmation).
    // If the portal isn't configured to allow subscription updates, fall back to the standard portal.
    try {
      const portalSession = await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: `${returnOrigin}/profile?plan_changed=true`,
        flow_data: {
          type: "subscription_update_confirm",
          subscription_update_confirm: {
            subscription: subscription.id,
            items: [
              {
                id: subscription.items.data[0].id,
                price: newPriceId,
                quantity: 1,
              },
            ],
          },
        },
      });

      logStep("Portal session created for plan change", {
        url: portalSession.url,
        newPlan,
      });

      return new Response(
        JSON.stringify({
          url: portalSession.url,
          newPlan,
          fallback: false,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        }
      );
    } catch (portalError) {
      const msg = portalError instanceof Error ? portalError.message : String(portalError);
      logStep("Portal confirm flow unavailable, falling back", { message: msg });

      const fallbackSession = await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: `${returnOrigin}/profile?plan_changed=true`,
      });

      return new Response(
        JSON.stringify({
          url: fallbackSession.url,
          newPlan,
          fallback: true,
          reason: "portal_subscription_update_disabled",
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        }
      );
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message: errorMessage });
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
