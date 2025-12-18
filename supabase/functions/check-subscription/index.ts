import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const getCorsHeaders = (origin: string | null) => {
  return {
    "Access-Control-Allow-Origin": origin ?? "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[CHECK-SUBSCRIPTION] ${step}${detailsStr}`);
};

serve(async (req) => {
  const origin = req.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const authHeader = req.headers.get("Authorization");

  if (!authHeader) {
    return new Response(JSON.stringify({ error: "No authorization header" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 401,
    });
  }

  const supabaseClient = createClient(
    supabaseUrl,
    Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    { global: { headers: { Authorization: authHeader } } }
  );

  try {
    logStep("Function started");

    const { data: userData, error: userError } = await supabaseClient.auth.getUser();
    if (userError) throw new Error(`Auth error: ${userError.message}`);
    const user = userData.user;
    if (!user?.email) throw new Error("User not authenticated");
    logStep("User authenticated", { userId: user.id, email: user.email });

    // Check trial status based on user creation date
    const TRIAL_DAYS = 3;
    const userCreatedAt = new Date(user.created_at);
    const trialEndDate = new Date(userCreatedAt.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000);
    const now = new Date();
    const isInTrial = now < trialEndDate;
    const trialDaysRemaining = isInTrial ? Math.ceil((trialEndDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)) : 0;
    logStep("Trial status", { isInTrial, trialDaysRemaining, trialEndDate: trialEndDate.toISOString() });

    // Check local database for prepaid access
    const { data: subscription, error: subError } = await supabaseClient
      .from("subscriptions")
      .select("*")
      .eq("user_id", user.id)
      .single();

    if (subError && subError.code !== "PGRST116") {
      logStep("Database query error", { error: subError.message });
    }

    let hasActiveAccess = false;
    let accessEndDate: string | null = null;
    let planType: string | null = null;

    if (subscription && subscription.current_period_end) {
      const periodEnd = new Date(subscription.current_period_end);
      hasActiveAccess = periodEnd > now && subscription.status === "active";
      accessEndDate = subscription.current_period_end;
      planType = subscription.plan_type;
      logStep("Prepaid access check", { 
        hasActiveAccess, 
        periodEnd: periodEnd.toISOString(),
        status: subscription.status 
      });
    }

    // Update subscription status if expired
    if (subscription && !hasActiveAccess && subscription.status === "active") {
      logStep("Access expired, updating status to inactive");
      await supabaseClient
        .from("subscriptions")
        .update({ 
          status: "inactive",
          updated_at: new Date().toISOString() 
        })
        .eq("user_id", user.id);
    }

    // If no subscription record exists, create one for trial tracking
    if (!subscription) {
      await supabaseClient
        .from("subscriptions")
        .upsert({
          user_id: user.id,
          status: isInTrial ? "trialing" : "inactive",
          current_period_start: isInTrial ? userCreatedAt.toISOString() : null,
          current_period_end: isInTrial ? trialEndDate.toISOString() : null,
          updated_at: new Date().toISOString(),
        }, { onConflict: "user_id" });
    }

    // User has access if they have active prepaid access OR are in trial
    const hasAccess = hasActiveAccess || isInTrial;

    return new Response(JSON.stringify({
      subscribed: hasAccess,
      is_trial: !hasActiveAccess && isInTrial,
      trial_days_remaining: hasActiveAccess ? 0 : trialDaysRemaining,
      trial_end: hasActiveAccess ? null : trialEndDate.toISOString(),
      plan_type: planType,
      subscription_end: accessEndDate,
    }), {
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
