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
  console.log(`[CUSTOMER-PORTAL] ${step}${detailsStr}`);
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

    // Parse optional flow parameter from request body
    let flowType: string | null = null;
    try {
      const body = await req.json();
      flowType = body?.flow || null;
      logStep("Parsed request body", { flowType });
    } catch {
      // No body or invalid JSON, continue without flow
      logStep("No flow type specified, using default portal");
    }

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

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
    const customers = await stripe.customers.list({ email: user.email, limit: 1 });
    
    if (customers.data.length === 0) {
      throw new Error("No Stripe customer found for this user");
    }

    const customerId = customers.data[0].id;
    logStep("Found customer", { customerId });

    // Get the main active subscription for flow_data
    let mainSubscriptionId: string | null = null;
    try {
      const subscriptions = await stripe.subscriptions.list({
        customer: customerId,
        status: "active",
        limit: 10,
      });
      
      // Find the main subscription (not device slot subscription)
      // Device slot prices typically have specific IDs - filter them out
      const DEVICE_SLOT_PRICES = [
        "price_1SsJl5JrU52a7SNLIz1Hqxfa", // Live device slot price
        "price_1Sq8wQJrU52a7SNLBfNi7BW0", // Test device slot price
      ];
      
      for (const sub of subscriptions.data) {
        const isDeviceSlotOnly = sub.items.data.every((item: { price: { id: string } }) => 
          DEVICE_SLOT_PRICES.includes(item.price.id)
        );
        
        if (!isDeviceSlotOnly) {
          mainSubscriptionId = sub.id;
          logStep("Found main subscription", { subscriptionId: mainSubscriptionId });
          
          // Release any attached schedule so portal can show cancel option
          if (sub.schedule) {
            logStep("Releasing subscription schedule", { scheduleId: sub.schedule });
            try {
              await stripe.subscriptionSchedules.release(sub.schedule as string, {
                preserve_cancel_date: true,
              });
              logStep("Released subscription schedule successfully");
            } catch (e) {
              const msg = e instanceof Error ? e.message : String(e);
              logStep("Failed to release schedule (continuing)", { message: msg });
            }
          }
          break;
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      logStep("Error finding subscriptions (continuing)", { message: msg });
    }

    const returnOrigin = ALLOWED_ORIGINS.includes(origin || "") ? origin : ALLOWED_ORIGINS[0];

    // Build portal session options
    const portalOptions: Stripe.BillingPortal.SessionCreateParams = {
      customer: customerId,
      return_url: `${returnOrigin}/profile`,
    };

    // Use flow_data for deep-linking to specific actions
    // This bypasses portal configuration restrictions
    if (flowType && mainSubscriptionId) {
      if (flowType === "cancel") {
        portalOptions.flow_data = {
          type: "subscription_cancel",
          subscription_cancel: {
            subscription: mainSubscriptionId,
          },
          after_completion: {
            type: "redirect",
            redirect: {
              return_url: `${returnOrigin}/profile?cancelled=true`,
            },
          },
        };
        logStep("Using subscription_cancel flow", { subscriptionId: mainSubscriptionId });
      } else if (flowType === "update") {
        portalOptions.flow_data = {
          type: "subscription_update",
          subscription_update: {
            subscription: mainSubscriptionId,
          },
          after_completion: {
            type: "redirect",
            redirect: {
              return_url: `${returnOrigin}/profile?updated=true`,
            },
          },
        };
        logStep("Using subscription_update flow", { subscriptionId: mainSubscriptionId });
      }
    }

    // If no flow_data, try to use active billing portal configuration
    if (!portalOptions.flow_data) {
      try {
        const configs = await stripe.billingPortal.configurations.list({
          active: true,
          limit: 1,
        });
        if (configs.data?.[0]?.id) {
          portalOptions.configuration = configs.data[0].id;
          logStep("Using billing portal configuration", { configurationId: configs.data[0].id });
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        logStep("Failed to load billing portal configuration", { message: msg });
      }
    }

    const portalSession = await stripe.billingPortal.sessions.create(portalOptions);
    logStep("Portal session created", { url: portalSession.url });

    return new Response(JSON.stringify({ url: portalSession.url }), {
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