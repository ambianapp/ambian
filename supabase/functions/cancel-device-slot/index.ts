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
  const allowedOrigin =
    origin &&
    (ALLOWED_ORIGINS.includes(origin) ||
      origin.endsWith(".lovable.app") ||
      origin.endsWith(".lovableproject.com"))
      ? origin
      : ALLOWED_ORIGINS[0];

  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[CANCEL-DEVICE-SLOT] ${step}${detailsStr}`);
};

// Device slot price IDs
const DEVICE_SLOT_PRICES = [
  "price_1SfhoMJrU52a7SNLpLI3yoEl", // monthly €5
  "price_1Sj2PMJrU52a7SNLzhpFYfJd", // yearly €50
];

serve(async (req) => {
  const origin = req.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? "",
  );

  try {
    logStep("Function started");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError) throw new Error(`Auth error: ${userError.message}`);
    const user = userData.user;
    if (!user?.email) throw new Error("User not authenticated");
    logStep("User authenticated", { userId: user.id, email: user.email });

    // Get subscription ID from request body
    const body = await req.json();
    const { subscriptionId, cancelImmediately } = body;
    if (!subscriptionId) throw new Error("Subscription ID required");
    logStep("Request parsed", { subscriptionId, cancelImmediately });

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not set");

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    // Find customer and verify ownership
    const customers = await stripe.customers.list({ email: user.email, limit: 1 });
    if (customers.data.length === 0) {
      throw new Error("No customer found");
    }
    const customerId = customers.data[0].id;
    logStep("Customer found", { customerId });

    // Get the subscription and verify it belongs to this customer
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    if (subscription.customer !== customerId) {
      throw new Error("Subscription does not belong to this user");
    }

    // Verify it's a device slot subscription
    const priceId = subscription.items.data[0]?.price.id;
    if (!DEVICE_SLOT_PRICES.includes(priceId)) {
      throw new Error("This is not a device slot subscription");
    }

    logStep("Subscription verified", { subscriptionId, priceId });

    if (cancelImmediately) {
      // Cancel immediately
      await stripe.subscriptions.cancel(subscriptionId);
      logStep("Subscription cancelled immediately");
    } else {
      // Cancel at end of billing period
      await stripe.subscriptions.update(subscriptionId, {
        cancel_at_period_end: true,
      });
      logStep("Subscription set to cancel at period end");
    }

    return new Response(JSON.stringify({ success: true }), {
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
