import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const ALLOWED_ORIGINS = [
  "https://ambian.lovable.app",
  "https://preview--ambian.lovable.app",
  "http://localhost:5173",
  "http://localhost:8080",
  "https://ambianmusic.com",
  "https://www.ambianmusic.com",
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

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not set");

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

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
    const customers = await stripe.customers.list({ email: user.email, limit: 1 });

    if (customers.data.length === 0) {
      logStep("No Stripe customer found, checking trial");
      
      await supabaseClient
        .from("subscriptions")
        .upsert({
          user_id: user.id,
          status: isInTrial ? "trialing" : "inactive",
          updated_at: new Date().toISOString(),
        }, { onConflict: "user_id" });

      return new Response(JSON.stringify({ 
        subscribed: isInTrial,
        is_trial: isInTrial,
        trial_days_remaining: trialDaysRemaining,
        trial_end: trialEndDate.toISOString(),
        device_slots: 1,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    const customerId = customers.data[0].id;
    logStep("Found customer", { customerId });

    // Check for active Stripe subscription (recurring)
    const subscriptions = await stripe.subscriptions.list({
      customer: customerId,
      status: "active",
      limit: 1,
    });

    const hasActiveStripeSub = subscriptions.data.length > 0;
    let subscriptionEnd = null;
    let planType = null;
    let isRecurring = false;

    if (hasActiveStripeSub) {
      const subscription = subscriptions.data[0];
      const subscriptionItem = subscription.items.data[0];
      const collectionMethod = subscription.collection_method;
      
      // For invoice-based subscriptions, verify the latest invoice is actually paid
      if (collectionMethod === "send_invoice") {
        const invoices = await stripe.invoices.list({
          subscription: subscription.id,
          limit: 1,
        });
        
        if (invoices.data.length > 0) {
          const latestInvoice = invoices.data[0];
          logStep("Checking invoice status for send_invoice subscription", { 
            invoiceId: latestInvoice.id, 
            status: latestInvoice.status 
          });
          
          // If invoice is not paid (void, uncollectible, open), this subscription is not valid
          if (latestInvoice.status !== "paid") {
            logStep("Invoice not paid, subscription not valid", { status: latestInvoice.status });
            
            // Cancel the subscription in Stripe since invoice was voided/not paid
            try {
              await stripe.subscriptions.cancel(subscription.id);
              logStep("Canceled invalid subscription", { subscriptionId: subscription.id });
            } catch (cancelError) {
              logStep("Error canceling subscription", { error: String(cancelError) });
            }
            
            // Update local status
            await supabaseClient
              .from("subscriptions")
              .upsert({
                user_id: user.id,
                stripe_customer_id: customerId,
                status: isInTrial ? "trialing" : "inactive",
                updated_at: new Date().toISOString(),
              }, { onConflict: "user_id" });
            
            return new Response(JSON.stringify({
              subscribed: isInTrial,
              is_trial: isInTrial,
              trial_days_remaining: trialDaysRemaining,
              trial_end: trialEndDate.toISOString(),
              device_slots: 1,
            }), {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
              status: 200,
            });
          }
        }
      }
      
      // Period dates are on the subscription item in the new API structure
      const periodEnd = subscriptionItem.current_period_end ?? subscription.current_period_end;
      const periodStart = subscriptionItem.current_period_start ?? subscription.current_period_start;
      
      if (periodEnd) {
        subscriptionEnd = new Date(periodEnd * 1000).toISOString();
      }
      
      const interval = subscriptionItem.price.recurring?.interval;
      planType = interval === "year" ? "yearly" : "monthly";
      isRecurring = true;
      
      logStep("Active Stripe subscription found", { subscriptionId: subscription.id, planType, periodEnd, periodStart, collectionMethod });

      await supabaseClient
        .from("subscriptions")
        .upsert({
          user_id: user.id,
          stripe_customer_id: customerId,
          stripe_subscription_id: subscription.id,
          status: "active",
          plan_type: planType,
          current_period_start: periodStart ? new Date(periodStart * 1000).toISOString() : null,
          current_period_end: subscriptionEnd,
          updated_at: new Date().toISOString(),
        }, { onConflict: "user_id" });

      // Get device slots from local subscription
      const { data: subData } = await supabaseClient
        .from("subscriptions")
        .select("device_slots")
        .eq("user_id", user.id)
        .maybeSingle();
      
      const deviceSlots = subData?.device_slots ?? 1;

      return new Response(JSON.stringify({
        subscribed: true,
        is_trial: false,
        trial_days_remaining: 0,
        trial_end: null,
        plan_type: planType,
        subscription_end: subscriptionEnd,
        is_recurring: true,
        collection_method: collectionMethod,
        device_slots: deviceSlots,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    // No active Stripe subscription, check local database for prepaid access
    logStep("No active Stripe subscription, checking prepaid access");
    
    const { data: localSub, error: subError } = await supabaseClient
      .from("subscriptions")
      .select("*")
      .eq("user_id", user.id)
      .single();

    if (subError && subError.code !== "PGRST116") {
      logStep("Database query error", { error: subError.message });
    }

    let hasPrepaidAccess = false;
    let isPendingPayment = false;
    
    // Check for active or pending_payment status (invoice grace period)
    if (localSub && localSub.current_period_end && (localSub.status === "active" || localSub.status === "pending_payment")) {
      const periodEnd = new Date(localSub.current_period_end);
      hasPrepaidAccess = periodEnd > now;
      isPendingPayment = localSub.status === "pending_payment";
      
      if (hasPrepaidAccess) {
        subscriptionEnd = localSub.current_period_end;
        planType = localSub.plan_type;
        logStep("Access found", { status: localSub.status, periodEnd: periodEnd.toISOString() });
      } else {
        // Access expired, update status
        logStep("Access expired, updating status", { previousStatus: localSub.status });
        await supabaseClient
          .from("subscriptions")
          .update({ status: "inactive", updated_at: new Date().toISOString() })
          .eq("user_id", user.id);
        isPendingPayment = false;
      }
    }

    // If no prepaid access, update/create trial record
    if (!hasPrepaidAccess) {
      await supabaseClient
        .from("subscriptions")
        .upsert({
          user_id: user.id,
          stripe_customer_id: customerId,
          status: isInTrial ? "trialing" : "inactive",
          current_period_start: isInTrial ? userCreatedAt.toISOString() : null,
          current_period_end: isInTrial ? trialEndDate.toISOString() : null,
          updated_at: new Date().toISOString(),
        }, { onConflict: "user_id" });
    }

    const hasAccess = hasPrepaidAccess || isInTrial;

    const deviceSlots = localSub?.device_slots ?? 1;

    return new Response(JSON.stringify({
      subscribed: hasAccess,
      is_trial: !hasPrepaidAccess && isInTrial,
      trial_days_remaining: hasPrepaidAccess ? 0 : trialDaysRemaining,
      trial_end: hasPrepaidAccess ? null : trialEndDate.toISOString(),
      plan_type: planType,
      subscription_end: subscriptionEnd,
      is_recurring: false,
      is_pending_payment: isPendingPayment,
      device_slots: deviceSlots,
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
