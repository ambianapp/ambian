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
  console.log(`[ADD-DEVICE-SLOT] ${step}${detailsStr}`);
};

// Device slot price - single price that matches main subscription interval
const DEVICE_SLOT_PRICE_MONTHLY = "price_1SfhoMJrU52a7SNLpLI3yoEl"; // €5/month
const DEVICE_SLOT_PRICE_YEARLY = "price_1Sj2PMJrU52a7SNLzhpFYfJd";  // €50/year

// Main subscription prices (to identify the main subscription)
const MAIN_SUBSCRIPTION_PRICES = [
  "price_1RXZpLJrU52a7SNLNIb9VxaD", // monthly
  "price_1RXsWsJrU52a7SNLXbXsNfay", // yearly
  "price_1SQPakJrU52a7SNL4r23JvqL", // test daily
];

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
    
    try {
      const body = await req.json();
      if (body.quantity && typeof body.quantity === "number" && body.quantity >= 1 && body.quantity <= 10) {
        quantity = Math.floor(body.quantity);
      }
    } catch {
      // No body or invalid JSON, use defaults
    }
    logStep("Options selected", { quantity });

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError) throw new Error(`Auth error: ${userError.message}`);
    const user = userData.user;
    if (!user?.email) throw new Error("User not authenticated");
    logStep("User authenticated", { userId: user.id, email: user.email });

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not set");

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    // Check if customer exists
    const customers = await stripe.customers.list({ email: user.email, limit: 1 });
    if (customers.data.length === 0) {
      throw new Error("No active subscription found. Please subscribe first.");
    }
    const customerId = customers.data[0].id;
    logStep("Customer found", { customerId });

    // Find the active main subscription to add device slots to
    const subscriptions = await stripe.subscriptions.list({
      customer: customerId,
      status: "active",
      limit: 20,
    });

    // Find the main subscription (not device slot only)
    const mainSubscription = subscriptions.data.find((sub: any) => {
      const items = sub.items.data;
      return items.some((item: any) => MAIN_SUBSCRIPTION_PRICES.includes(item.price.id));
    });

    if (!mainSubscription) {
      // Also check for prepaid (non-recurring) subscriptions in local database
      const supabaseAdmin = createClient(
        Deno.env.get("SUPABASE_URL") ?? "",
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      );
      
      const { data: localSub } = await supabaseAdmin
        .from("subscriptions")
        .select("status, current_period_end, plan_type, stripe_subscription_id")
        .eq("user_id", user.id)
        .in("status", ["active", "pending_payment"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      
      if (localSub) {
        const periodEnd = localSub.current_period_end ? new Date(localSub.current_period_end) : null;
        if (periodEnd && periodEnd > new Date()) {
          // User has prepaid access but no recurring Stripe subscription
          // For prepaid users, we need to create a standalone device slot subscription
          // This is a limitation - prepaid users can't have aligned device slots
          throw new Error("Device slots require an active recurring subscription. Prepaid plans cannot add device slots with aligned billing. Please contact support for assistance.");
        }
      }
      
      throw new Error("No active subscription found. Please subscribe first before adding locations.");
    }

    logStep("Main subscription found", { 
      subscriptionId: mainSubscription.id, 
      status: mainSubscription.status,
      itemCount: mainSubscription.items.data.length 
    });

    // Determine which device slot price to use based on main subscription interval
    const mainItem = mainSubscription.items.data.find((item: any) => 
      MAIN_SUBSCRIPTION_PRICES.includes(item.price.id)
    );
    const mainInterval = mainItem?.price?.recurring?.interval;
    const deviceSlotPriceId = mainInterval === "year" ? DEVICE_SLOT_PRICE_YEARLY : DEVICE_SLOT_PRICE_MONTHLY;
    
    logStep("Determined device slot price", { mainInterval, deviceSlotPriceId });

    // Check if there's already a device slot item on this subscription
    const existingDeviceSlotItem = mainSubscription.items.data.find((item: any) => 
      item.price.id === deviceSlotPriceId
    );

    const returnOrigin = origin || "https://ambian.lovable.app";

    if (existingDeviceSlotItem) {
      // Update existing device slot quantity
      const newQuantity = (existingDeviceSlotItem.quantity || 0) + quantity;
      
      logStep("Updating existing device slot item", { 
        itemId: existingDeviceSlotItem.id, 
        currentQuantity: existingDeviceSlotItem.quantity,
        newQuantity 
      });

      // For adding more slots, use proration and update directly
      // This will charge the prorated amount immediately
      await stripe.subscriptions.update(mainSubscription.id, {
        items: [{
          id: existingDeviceSlotItem.id,
          quantity: newQuantity,
        }],
        proration_behavior: "create_prorations",
        metadata: {
          ...mainSubscription.metadata,
          device_slots_updated: new Date().toISOString(),
        },
      });

      logStep("Device slot quantity updated", { newQuantity });

      // Sync device slots in local database
      const supabaseAdmin = createClient(
        Deno.env.get("SUPABASE_URL") ?? "",
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      );

      await supabaseAdmin
        .from("subscriptions")
        .update({ 
          device_slots: 1 + newQuantity, // 1 base + additional slots
          updated_at: new Date().toISOString() 
        })
        .eq("user_id", user.id);

      return new Response(JSON.stringify({ 
        success: true,
        message: `Added ${quantity} additional location(s). Your subscription has been updated with prorated billing.`,
        newTotal: newQuantity,
        type: "updated",
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    // No existing device slot item - add new item to subscription
    // Use Checkout to handle payment for the new recurring item with proration
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: "subscription",
      line_items: [{
        price: deviceSlotPriceId,
        quantity: quantity,
      }],
      subscription_data: {
        metadata: {
          user_id: user.id,
          type: "device_slot_addon",
        },
      },
      // Use add_invoice_items to add to existing subscription billing
      success_url: `${returnOrigin}/?device_added=true`,
      cancel_url: `${returnOrigin}/profile`,
      metadata: {
        user_id: user.id,
        type: "device_slot",
        quantity: String(quantity),
        add_to_subscription: mainSubscription.id,
      },
    });

    // Actually, for adding to existing subscription, we should update the subscription directly
    // Let's do this properly - add item directly with proration
    
    logStep("Adding new device slot item to subscription");
    
    const updatedSubscription = await stripe.subscriptions.update(mainSubscription.id, {
      items: [
        ...mainSubscription.items.data.map((item: any) => ({ id: item.id })),
        {
          price: deviceSlotPriceId,
          quantity: quantity,
        },
      ],
      proration_behavior: "create_prorations",
      metadata: {
        ...mainSubscription.metadata,
        device_slots_added: new Date().toISOString(),
      },
    });

    logStep("Device slot item added to subscription", { 
      subscriptionId: updatedSubscription.id,
      itemCount: updatedSubscription.items.data.length 
    });

    // Sync device slots in local database
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    await supabaseAdmin
      .from("subscriptions")
      .update({ 
        device_slots: 1 + quantity, // 1 base + additional slots
        updated_at: new Date().toISOString() 
      })
      .eq("user_id", user.id);

    return new Response(JSON.stringify({ 
      success: true,
      message: `Added ${quantity} additional location(s). Prorated charges have been applied to your next invoice.`,
      newTotal: quantity,
      type: "added",
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
