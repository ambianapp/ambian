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

const logStep = (step: string, details?: Record<string, unknown>) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[CANCEL-USER-SUBSCRIPTION] ${step}${detailsStr}`);
};

serve(async (req) => {
  const origin = req.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");

    if (!stripeKey) {
      throw new Error("STRIPE_SECRET_KEY is not set");
    }

    // Create client with user's token to verify admin status
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      throw new Error("No authorization header");
    }

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      logStep("Auth error", { error: userError?.message });
      throw new Error("Unauthorized");
    }

    // Check if requesting user is admin
    const { data: isAdmin } = await userClient.rpc("has_role", {
      _user_id: user.id,
      _role: "admin",
    });

    if (!isAdmin) {
      logStep("Non-admin attempted cancellation", { userId: user.id });
      throw new Error("Unauthorized - admin access required");
    }

    const { userId, stripeSubscriptionId } = await req.json();
    if (!userId || !stripeSubscriptionId) {
      throw new Error("Missing userId or stripeSubscriptionId parameter");
    }

    logStep("Admin canceling subscription", { 
      adminId: user.id, 
      targetUserId: userId,
      subscriptionId: stripeSubscriptionId 
    });

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    // Cancel the subscription immediately
    const canceledSubscription = await stripe.subscriptions.cancel(stripeSubscriptionId);
    logStep("Stripe subscription canceled", { status: canceledSubscription.status });

    // Update the subscription status in our database (needs service role to bypass RLS)
    const supabaseServiceClient = createClient(
      supabaseUrl,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { error: updateError } = await supabaseServiceClient
      .from("subscriptions")
      .update({ 
        status: "canceled",
        updated_at: new Date().toISOString()
      })
      .eq("user_id", userId)
      .eq("stripe_subscription_id", stripeSubscriptionId);

    if (updateError) {
      logStep("Database update error", { error: updateError.message });
      // Don't throw - the Stripe cancellation already succeeded
    }

    logStep("Subscription canceled successfully", { userId, subscriptionId: stripeSubscriptionId });

    // Log subscription cancellation activity
    const supabaseServiceClient2 = createClient(
      supabaseUrl,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    
    // Get user email
    const { data: profile } = await supabaseServiceClient2
      .from("profiles")
      .select("email")
      .eq("user_id", userId)
      .maybeSingle();

    await supabaseServiceClient2.from('activity_logs').insert({
      user_id: userId,
      user_email: profile?.email || null,
      event_type: 'subscription_canceled_by_admin',
      event_message: 'Subscription canceled by admin',
      event_details: { canceledBy: user.id, canceledByEmail: user.email, stripeSubscriptionId },
    });

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logStep("Error", { message });
    return new Response(
      JSON.stringify({ error: message }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});