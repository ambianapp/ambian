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
  console.log(`[ADD-DEVICE-SLOT-PREPAID] ${step}${detailsStr}`);
};

// Full yearly device slot price for reference (€50/year = 5000 cents)
const YEARLY_DEVICE_SLOT_PRICE_CENTS = 5000;

serve(async (req) => {
  const origin = req.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? "",
  );

  try {
    logStep("Function started");

    // Parse request body
    let quantity = 1;
    let mode: "calculate" | "checkout" = "calculate";
    
    try {
      const body = await req.json();
      if (body.quantity && typeof body.quantity === "number" && body.quantity >= 1 && body.quantity <= 10) {
        quantity = Math.floor(body.quantity);
      }
      if (body.mode === "checkout") {
        mode = "checkout";
      }
    } catch {
      // No body or invalid JSON, use defaults
    }
    logStep("Options", { quantity, mode });

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError) throw new Error(`Auth error: ${userError.message}`);
    const user = userData.user;
    if (!user?.email) throw new Error("User not authenticated");
    logStep("User authenticated", { userId: user.id, email: user.email });

    // Get local subscription data for prepaid access
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const { data: localSub, error: subError } = await supabaseAdmin
      .from("subscriptions")
      .select("*")
      .eq("user_id", user.id)
      .in("status", ["active", "pending_payment"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (subError) {
      logStep("Database error", { error: subError.message });
      throw new Error("Failed to fetch subscription data");
    }

    if (!localSub) {
      throw new Error("No active subscription found");
    }

    if (!localSub.current_period_end) {
      throw new Error("Subscription has no end date");
    }

    const periodEnd = new Date(localSub.current_period_end);
    const now = new Date();

    if (periodEnd <= now) {
      throw new Error("Subscription has expired");
    }

    // Calculate remaining time
    const remainingMs = periodEnd.getTime() - now.getTime();
    const remainingDays = Math.ceil(remainingMs / (1000 * 60 * 60 * 24));
    
    // Calculate prorated price based on remaining days out of 365
    // Minimum 1 day to avoid zero pricing
    const effectiveDays = Math.max(1, remainingDays);
    const proratedPriceCents = Math.ceil((YEARLY_DEVICE_SLOT_PRICE_CENTS * effectiveDays) / 365) * quantity;
    
    // Minimum charge of €1 to avoid Stripe issues
    const finalPriceCents = Math.max(100, proratedPriceCents);

    logStep("Proration calculated", {
      periodEnd: periodEnd.toISOString(),
      remainingDays,
      effectiveDays,
      proratedPriceCents,
      finalPriceCents,
      quantity,
    });

    // If just calculating, return the quote
    if (mode === "calculate") {
      return new Response(JSON.stringify({
        success: true,
        remainingDays,
        proratedPrice: finalPriceCents / 100, // Convert to euros
        quantity,
        periodEnd: periodEnd.toISOString(),
        currentSlots: localSub.device_slots || 1,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    // Mode is "checkout" - create a Stripe checkout session
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not set");

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    // Find or create customer
    const customers = await stripe.customers.list({ email: user.email, limit: 1 });
    let customerId: string;
    
    if (customers.data.length > 0) {
      customerId = customers.data[0].id;
    } else {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: { user_id: user.id },
      });
      customerId = customer.id;
    }
    logStep("Customer", { customerId });

    const returnOrigin = origin || "https://ambian.lovable.app";

    // Create a checkout session with a one-time price
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      line_items: [
        {
          price_data: {
            currency: "eur",
            product_data: {
              name: quantity === 1 
                ? "Additional Device Slot (Prorated)" 
                : `${quantity} Additional Device Slots (Prorated)`,
              description: `Access until ${periodEnd.toLocaleDateString()} (${remainingDays} days remaining)`,
            },
            unit_amount: Math.ceil(finalPriceCents / quantity), // Per-unit price
          },
          quantity: quantity,
        },
      ],
      mode: "payment",
      success_url: `${returnOrigin}/profile?device_slot_added=true&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${returnOrigin}/profile?device_slot_cancelled=true`,
      metadata: {
        user_id: user.id,
        type: "prepaid_device_slot",
        quantity: String(quantity),
        period_end: periodEnd.toISOString(),
      },
      automatic_tax: { enabled: true },
      tax_id_collection: { enabled: true },
      custom_fields: [
        {
          key: "company_name",
          label: { type: "custom", custom: "Company name (optional)" },
          type: "text",
          optional: true,
        },
      ],
      invoice_creation: {
        enabled: true,
        invoice_data: {
          metadata: {
            user_id: user.id,
            type: "prepaid_device_slot",
          },
        },
      },
    });

    logStep("Checkout session created", { sessionId: session.id, url: session.url });

    return new Response(JSON.stringify({
      success: true,
      url: session.url,
      sessionId: session.id,
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
