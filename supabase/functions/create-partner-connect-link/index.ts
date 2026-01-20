import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.21.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : "";
  console.log(`[CREATE-PARTNER-CONNECT-LINK] ${step}${detailsStr}`);
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
    logStep("Partner found", { name: partner.name, email: partner.email });

    const stripe = new Stripe(stripeKey, { apiVersion: "2023-10-16" });
    const origin = req.headers.get("origin") || "https://ambian.lovable.app";

    let accountId = partner.stripe_connect_account_id;

    // Create Connect account if doesn't exist
    if (!accountId) {
      logStep("Creating new Stripe Connect account");
      const account = await stripe.accounts.create({
        type: "express",
        email: partner.email,
        metadata: {
          partner_id: partnerId,
          referral_code: partner.referral_code,
        },
        capabilities: {
          transfers: { requested: true },
        },
      });
      accountId = account.id;
      logStep("Connect account created", { accountId });

      // Save account ID to database
      const { error: updateError } = await supabaseClient
        .from("referral_partners")
        .update({
          stripe_connect_account_id: accountId,
          stripe_connect_status: "pending",
        })
        .eq("id", partnerId);

      if (updateError) {
        logStep("Error saving account ID", { error: updateError.message });
        throw new Error("Failed to save Stripe Connect account");
      }
    }

    // Create account link for onboarding
    logStep("Creating account link for onboarding");
    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${origin}/admin?connect_refresh=true&partner_id=${partnerId}`,
      return_url: `${origin}/admin?connect_complete=true&partner_id=${partnerId}`,
      type: "account_onboarding",
    });

    logStep("Account link created", { url: accountLink.url });

    return new Response(JSON.stringify({ url: accountLink.url }), {
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
