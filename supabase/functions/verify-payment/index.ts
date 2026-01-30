import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { getAllDeviceSlotPriceIds } from "../_shared/pricing.ts";

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
  console.log(`[VERIFY-PAYMENT] ${step}${detailsStr}`);
};

// Get device slot price IDs from shared config
const DEVICE_SLOT_PRICE_IDS = getAllDeviceSlotPriceIds();

serve(async (req) => {
  const origin = req.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "No authorization header" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 401,
    });
  }

  const supabaseClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    { global: { headers: { Authorization: authHeader } } }
  );

  try {
    logStep("Function started");

    const { sessionId } = await req.json();
    if (!sessionId) {
      throw new Error("Session ID is required");
    }
    logStep("Received request", { sessionId });

    const { data: userData, error: userError } = await supabaseClient.auth.getUser();
    if (userError) throw new Error(`Auth error: ${userError.message}`);
    const user = userData.user;
    if (!user?.email) throw new Error("User not authenticated");
    logStep("User authenticated", { userId: user.id, email: user.email });

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2025-08-27.basil",
    });

    // Retrieve the checkout session
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    logStep("Session retrieved", { 
      paymentStatus: session.payment_status,
      customerId: session.customer,
      metadata: session.metadata 
    });

    // Verify payment was successful
    if (session.payment_status !== "paid") {
      throw new Error("Payment not completed");
    }

    // Verify this session belongs to the current user
    if (session.metadata?.user_id !== user.id) {
      throw new Error("Session does not belong to current user");
    }

    const planType = session.metadata?.plan_type || "monthly";
    const now = new Date();
    
    // Check if user has existing access and extend it
    const { data: existingSub } = await supabaseClient
      .from("subscriptions")
      .select("current_period_end")
      .eq("user_id", user.id)
      .single();

    let startDate = now;
    // If user has existing valid access, extend from that end date
    if (existingSub?.current_period_end) {
      const existingEnd = new Date(existingSub.current_period_end);
      if (existingEnd > now) {
        startDate = existingEnd;
        logStep("Extending existing access", { existingEnd: existingEnd.toISOString() });
      }
    }

    // Calculate end date based on plan type
    let endDate: Date;
    if (planType === "yearly") {
      endDate = new Date(startDate);
      endDate.setFullYear(endDate.getFullYear() + 1);
    } else if (planType === "daily_test") {
      // TEST: 1 day access for testing
      endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + 1);
    } else {
      endDate = new Date(startDate);
      endDate.setMonth(endDate.getMonth() + 1);
    }

    logStep("Access period calculated", { 
      planType, 
      startDate: startDate.toISOString(), 
      endDate: endDate.toISOString() 
    });

    // Get customer ID from session
    const customerId = session.customer as string;

    // Update subscription in database
    const { error: upsertError } = await supabaseClient
      .from("subscriptions")
      .upsert({
        user_id: user.id,
        stripe_customer_id: customerId,
        stripe_subscription_id: null, // No subscription, just one-time payment
        status: "active",
        plan_type: planType,
        current_period_start: startDate.toISOString(),
        current_period_end: endDate.toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id" });

    if (upsertError) {
      logStep("Database upsert error", { error: upsertError.message });
      throw new Error(`Failed to update subscription: ${upsertError.message}`);
    }

    logStep("Subscription updated successfully");

    // Void any open invoices for this customer since they've now paid via card
    // This prevents confusion where old unpaid invoices remain open after card payment
    if (customerId) {
      try {
        const openInvoices = await stripe.invoices.list({
          customer: customerId,
          status: "open",
          limit: 10,
        });
        
        
        for (const openInv of openInvoices.data) {
          const invoiceLineItem = openInv.lines?.data?.[0];
          const isDeviceSlotInvoice = invoiceLineItem?.price?.id && DEVICE_SLOT_PRICE_IDS.includes(invoiceLineItem.price.id);
          
          if (!isDeviceSlotInvoice) {
            await stripe.invoices.voidInvoice(openInv.id);
            logStep("Voided old open invoice after card payment", { 
              invoiceId: openInv.id, 
              invoiceNumber: openInv.number 
            });
          }
        }
        
        // Also delete any draft invoices
        const draftInvoices = await stripe.invoices.list({
          customer: customerId,
          status: "draft",
          limit: 10,
        });
        
        for (const draftInv of draftInvoices.data) {
          const invoiceLineItem = draftInv.lines?.data?.[0];
          const isDeviceSlotInvoice = invoiceLineItem?.price?.id && DEVICE_SLOT_PRICE_IDS.includes(invoiceLineItem.price.id);
          
          if (!isDeviceSlotInvoice) {
            await stripe.invoices.del(draftInv.id);
            logStep("Deleted old draft invoice after card payment", { invoiceId: draftInv.id });
          }
        }
      } catch (cleanupError) {
        logStep("Error cleaning up old invoices", { error: String(cleanupError) });
        // Don't fail the process if cleanup fails
      }
    }

    return new Response(JSON.stringify({ 
      success: true,
      plan_type: planType,
      access_until: endDate.toISOString(),
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