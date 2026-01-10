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
  console.log(`[VERIFY-DEVICE-SLOT-PAYMENT] ${step}${detailsStr}`);
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
    if (!authHeader) throw new Error("No authorization header");

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError) throw new Error(`Auth error: ${userError.message}`);
    const user = userData.user;
    if (!user?.email) throw new Error("User not authenticated");
    logStep("User authenticated", { userId: user.id, email: user.email });

    const { sessionId } = await req.json();
    if (!sessionId) {
      throw new Error("Session ID is required");
    }
    logStep("Received request", { sessionId });

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not set");

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    // Retrieve the checkout session
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    logStep("Session retrieved", {
      paymentStatus: session.payment_status,
      metadata: session.metadata,
    });

    // Verify payment was successful
    if (session.payment_status !== "paid") {
      throw new Error("Payment not completed");
    }

    // Verify this session belongs to the current user
    if (session.metadata?.user_id !== user.id) {
      throw new Error("Session does not belong to current user");
    }

    // Verify this is a device slot payment
    if (session.metadata?.type !== "prepaid_device_slot") {
      throw new Error("Invalid session type");
    }

    const quantity = parseInt(session.metadata?.quantity || "1", 10);
    logStep("Payment verified", { quantity });

    // Update local device slots
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    // Get current device slots
    const { data: currentSub, error: fetchError } = await supabaseAdmin
      .from("subscriptions")
      .select("device_slots")
      .eq("user_id", user.id)
      .single();

    if (fetchError) {
      logStep("Error fetching current subscription", { error: fetchError.message });
      throw new Error("Failed to fetch subscription");
    }

    const currentSlots = currentSub?.device_slots || 1;
    const newSlots = currentSlots + quantity;

    // Update device slots
    const { error: updateError } = await supabaseAdmin
      .from("subscriptions")
      .update({
        device_slots: newSlots,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", user.id);

    if (updateError) {
      logStep("Error updating device slots", { error: updateError.message });
      throw new Error("Failed to update device slots");
    }

    logStep("Device slots updated successfully", { previousSlots: currentSlots, newSlots });

    return new Response(JSON.stringify({
      success: true,
      previousSlots: currentSlots,
      newSlots,
      addedQuantity: quantity,
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
