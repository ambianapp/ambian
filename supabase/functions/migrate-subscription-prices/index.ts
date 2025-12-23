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
  console.log(`[MIGRATE-PRICES] ${step}${detailsStr}`);
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
    if (!authHeader) throw new Error("No authorization header provided");

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

    const { oldPriceId, newPriceId, dryRun = true } = await req.json();
    
    if (!oldPriceId || !newPriceId) {
      throw new Error("Both oldPriceId and newPriceId are required");
    }
    logStep("Request params", { oldPriceId, newPriceId, dryRun });

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not set");

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    // Get all active subscriptions with the old price
    const subscriptions = await stripe.subscriptions.list({
      status: "active",
      limit: 100,
    });
    logStep("Fetched subscriptions", { total: subscriptions.data.length });

    // Filter subscriptions that have the old price
    const subscriptionsToMigrate = subscriptions.data.filter((sub: any) => {
      return sub.items.data.some((item: any) => item.price.id === oldPriceId);
    });
    logStep("Subscriptions with old price", { count: subscriptionsToMigrate.length });

    if (dryRun) {
      // Just return what would be migrated
      const previewData = subscriptionsToMigrate.map((sub: any) => ({
        subscriptionId: sub.id,
        customerId: sub.customer,
        currentPriceId: oldPriceId,
        currentAmount: sub.items.data.find((i: any) => i.price.id === oldPriceId)?.price.unit_amount,
      }));

      return new Response(
        JSON.stringify({
          success: true,
          dryRun: true,
          message: `Found ${subscriptionsToMigrate.length} subscriptions to migrate`,
          subscriptions: previewData,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        }
      );
    }

    // Actually migrate the subscriptions
    const results = [];
    for (const subscription of subscriptionsToMigrate) {
      try {
        const itemToUpdate = subscription.items.data.find((item: any) => item.price.id === oldPriceId);
        if (!itemToUpdate) continue;

        // Update the subscription item to the new price
        const updatedSubscription = await stripe.subscriptions.update(subscription.id, {
          items: [
            {
              id: itemToUpdate.id,
              price: newPriceId,
            },
          ],
          proration_behavior: "none", // Don't prorate - just change the price for next billing
        });

        results.push({
          subscriptionId: subscription.id,
          status: "migrated",
          newPriceId,
        });
        logStep("Migrated subscription", { subscriptionId: subscription.id });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        results.push({
          subscriptionId: subscription.id,
          status: "failed",
          error: errorMessage,
        });
        logStep("Failed to migrate subscription", { subscriptionId: subscription.id, error: errorMessage });
      }
    }

    const successCount = results.filter((r) => r.status === "migrated").length;
    const failCount = results.filter((r) => r.status === "failed").length;

    return new Response(
      JSON.stringify({
        success: true,
        dryRun: false,
        message: `Migrated ${successCount} subscriptions, ${failCount} failed`,
        results,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message: errorMessage });
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});
