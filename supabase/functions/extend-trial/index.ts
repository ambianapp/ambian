import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[EXTEND-TRIAL] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const authHeader = req.headers.get("Authorization");

  if (!authHeader) {
    return new Response(JSON.stringify({ error: "No authorization header" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 401,
    });
  }

  const supabaseClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  try {
    logStep("Function started");

    // Verify the requesting user is an admin
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError) throw new Error(`Auth error: ${userError.message}`);
    
    const requestingUserId = userData.user?.id;
    if (!requestingUserId) throw new Error("User not authenticated");

    // Check if requesting user is admin
    const { data: adminRole, error: roleError } = await supabaseClient
      .from("user_roles")
      .select("role")
      .eq("user_id", requestingUserId)
      .eq("role", "admin")
      .maybeSingle();

    if (roleError) throw new Error(`Role check error: ${roleError.message}`);
    if (!adminRole) {
      return new Response(JSON.stringify({ error: "Unauthorized - admin access required" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 403,
      });
    }

    logStep("Admin verified", { adminUserId: requestingUserId });

    // Parse request body
    const { targetUserId, additionalDays } = await req.json();
    
    if (!targetUserId || typeof additionalDays !== "number" || additionalDays < 1 || additionalDays > 365) {
      return new Response(JSON.stringify({ error: "Invalid parameters. Provide targetUserId and additionalDays (1-365)" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    logStep("Extending trial", { targetUserId, additionalDays });

    // Get current subscription status for the target user
    const { data: subscription, error: subError } = await supabaseClient
      .from("subscriptions")
      .select("*")
      .eq("user_id", targetUserId)
      .maybeSingle();

    const now = new Date();
    let newTrialEnd: Date;

    if (subscription?.current_period_end) {
      // If they already have a period end, extend from that
      const currentEnd = new Date(subscription.current_period_end);
      // Use the later of current end or now
      const baseDate = currentEnd > now ? currentEnd : now;
      newTrialEnd = new Date(baseDate.getTime() + additionalDays * 24 * 60 * 60 * 1000);
    } else {
      // No subscription yet, extend from now
      newTrialEnd = new Date(now.getTime() + additionalDays * 24 * 60 * 60 * 1000);
    }

    // Upsert the subscription with extended trial
    const { error: upsertError } = await supabaseClient
      .from("subscriptions")
      .upsert({
        user_id: targetUserId,
        status: "trialing",
        current_period_end: newTrialEnd.toISOString(),
        current_period_start: now.toISOString(),
        updated_at: now.toISOString(),
        device_slots: subscription?.device_slots || 1,
      }, { onConflict: "user_id" });

    if (upsertError) throw new Error(`Failed to update subscription: ${upsertError.message}`);

    logStep("Trial extended successfully", { 
      targetUserId, 
      additionalDays, 
      newTrialEnd: newTrialEnd.toISOString() 
    });

    return new Response(JSON.stringify({ 
      success: true,
      newTrialEnd: newTrialEnd.toISOString(),
      additionalDays,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });

  } catch (error: any) {
    logStep("Error", { message: error.message });
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
