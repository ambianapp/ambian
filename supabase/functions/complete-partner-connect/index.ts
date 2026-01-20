import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.21.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : "";
  console.log(`[COMPLETE-PARTNER-CONNECT] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    logStep("Function started");

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not set");

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    // Verify admin user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header provided");

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError) throw new Error(`Authentication error: ${userError.message}`);
    
    const userId = userData.user?.id;
    if (!userId) throw new Error("User not authenticated");

    // Check if user is admin
    const { data: roleData } = await supabaseClient
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .single();

    if (!roleData) throw new Error("Admin access required");
    logStep("Admin verified", { userId });

    // Get partner ID from request
    const { partnerId } = await req.json();
    if (!partnerId) throw new Error("Partner ID is required");
    logStep("Partner ID received", { partnerId });

    // Fetch partner details
    const { data: partner, error: partnerError } = await supabaseClient
      .from("referral_partners")
      .select("*")
      .eq("id", partnerId)
      .single();

    if (partnerError || !partner) throw new Error("Partner not found");
    if (!partner.stripe_connect_account_id) throw new Error("No Stripe Connect account found");
    logStep("Partner found", { name: partner.name, accountId: partner.stripe_connect_account_id });

    const stripe = new Stripe(stripeKey, { apiVersion: "2023-10-16" });

    // Check account status
    const account = await stripe.accounts.retrieve(partner.stripe_connect_account_id);
    logStep("Account retrieved", { 
      chargesEnabled: account.charges_enabled,
      payoutsEnabled: account.payouts_enabled,
      detailsSubmitted: account.details_submitted,
    });

    // Determine status based on account capabilities
    let status = "pending";
    if (account.charges_enabled && account.payouts_enabled) {
      status = "active";
    } else if (account.requirements?.disabled_reason) {
      status = "restricted";
    } else if (account.details_submitted) {
      status = "pending_verification";
    }

    // Update partner status in database
    const { error: updateError } = await supabaseClient
      .from("referral_partners")
      .update({
        stripe_connect_status: status,
      })
      .eq("id", partnerId);

    if (updateError) {
      logStep("Error updating status", { error: updateError.message });
      throw new Error("Failed to update partner status");
    }

    logStep("Partner status updated", { status });

    return new Response(JSON.stringify({ 
      status,
      chargesEnabled: account.charges_enabled,
      payoutsEnabled: account.payouts_enabled,
      detailsSubmitted: account.details_submitted,
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
