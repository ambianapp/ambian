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
  console.log(`[GET-DEVICE-SLOTS] ${step}${detailsStr}`);
};

// Device slot price IDs
const DEVICE_SLOT_PRICES = [
  "price_1SfhoMJrU52a7SNLpLI3yoEl", // monthly €5
  "price_1Sj2PMJrU52a7SNLzhpFYfJd", // yearly €50
];

// Main subscription prices
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

    // Find customer
    const customers = await stripe.customers.list({ email: user.email, limit: 1 });
    if (customers.data.length === 0) {
      logStep("No customer found");
      return new Response(JSON.stringify({ deviceSlots: [], totalSlots: 1 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    const customerId = customers.data[0].id;
    logStep("Customer found", { customerId });

    // Get all active subscriptions
    const subscriptions = await stripe.subscriptions.list({
      customer: customerId,
      status: "active",
      limit: 100,
    });

    // Also check for subscription schedules to detect scheduled cancellations
    const schedules = await stripe.subscriptionSchedules.list({
      customer: customerId,
      limit: 100,
    });
    
    // Build a map of items scheduled for removal/reduction
    const scheduledChanges: Map<string, { willBeRemoved: boolean; newQuantity?: number }> = new Map();
    
    for (const schedule of schedules.data) {
      if (schedule.status !== "active" || !schedule.subscription) continue;
      
      // Check if there are multiple phases (meaning changes are scheduled)
      if (schedule.phases.length >= 2) {
        const currentPhase = schedule.phases[0];
        const nextPhase = schedule.phases[1];
        
        // Find items in current phase that are device slots
        const currentItems = currentPhase.items || [];
        const nextItems = nextPhase.items || [];
        
        for (const currentItem of currentItems) {
          const priceId = typeof currentItem.price === 'string' ? currentItem.price : currentItem.price;
          if (DEVICE_SLOT_PRICES.includes(priceId as string)) {
            // Check if this item is reduced or removed in next phase
            const nextItem = nextItems.find((ni: any) => {
              const nextPriceId = typeof ni.price === 'string' ? ni.price : ni.price;
              return nextPriceId === priceId;
            });
            
            if (!nextItem) {
              // Item will be removed entirely
              scheduledChanges.set(`${schedule.subscription}-${priceId}`, { willBeRemoved: true });
            } else if (nextItem.quantity < currentItem.quantity) {
              // Quantity will be reduced
              scheduledChanges.set(`${schedule.subscription}-${priceId}`, { 
                willBeRemoved: false, 
                newQuantity: nextItem.quantity 
              });
            }
          }
        }
      }
    }
    
    logStep("Scheduled changes detected", { count: scheduledChanges.size });

    // Find device slot items within subscriptions (now they're line items on main subscription)
    const deviceSlots: any[] = [];
    let totalAdditionalSlots = 0;

    for (const sub of subscriptions.data) {
      // Check each item in the subscription
      for (const item of sub.items.data) {
        if (DEVICE_SLOT_PRICES.includes(item.price.id)) {
          const isYearly = item.price.recurring?.interval === "year";
          const quantity = item.quantity || 1;
          totalAdditionalSlots += quantity;
          
          // Check if this item is scheduled for cancellation/reduction
          const scheduleKey = `${sub.id}-${item.price.id}`;
          const scheduledChange = scheduledChanges.get(scheduleKey);
          const cancelAtPeriodEnd = scheduledChange?.willBeRemoved || false;
          const scheduledQuantityReduction = scheduledChange?.newQuantity;
          
          deviceSlots.push({
            id: item.id, // Use item ID for cancellation
            subscriptionId: sub.id,
            quantity: quantity,
            period: isYearly ? "yearly" : "monthly",
            amount: item.price.unit_amount ? item.price.unit_amount / 100 : 0,
            currency: item.price.currency,
            currentPeriodEnd: new Date((item as any).current_period_end * 1000).toISOString(),
            cancelAtPeriodEnd: cancelAtPeriodEnd,
            scheduledQuantityReduction: scheduledQuantityReduction,
            // New field: indicates this is a line item on main subscription
            isLineItem: true,
          });
          
          logStep("Found device slot item", { 
            itemId: item.id, 
            subscriptionId: sub.id,
            quantity, 
            period: isYearly ? "yearly" : "monthly",
            cancelAtPeriodEnd,
            scheduledQuantityReduction,
          });
        }
      }
    }

    logStep("Device slots retrieved", { count: deviceSlots.length, totalAdditionalSlots });

    return new Response(JSON.stringify({ 
      deviceSlots,
      totalSlots: 1 + totalAdditionalSlots, // 1 base + additional
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
