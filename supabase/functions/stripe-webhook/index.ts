import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[STRIPE-WEBHOOK] ${step}${detailsStr}`);
};

serve(async (req) => {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, stripe-signature",
  };

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    logStep("Webhook received");

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2025-08-27.basil",
    });

    const signature = req.headers.get("stripe-signature");
    if (!signature) {
      logStep("ERROR: No signature");
      return new Response(JSON.stringify({ error: "No signature" }), { status: 400 });
    }

    const body = await req.text();
    const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
    
    if (!webhookSecret) {
      logStep("ERROR: No webhook secret configured");
      return new Response(JSON.stringify({ error: "Webhook secret not configured" }), { status: 500 });
    }

    let event: Stripe.Event;
    try {
      event = await stripe.webhooks.constructEventAsync(body, signature, webhookSecret);
    } catch (err: any) {
      logStep("ERROR: Signature verification failed", { error: err.message });
      return new Response(JSON.stringify({ error: `Webhook signature verification failed: ${err.message}` }), { status: 400 });
    }

    logStep("Event verified", { type: event.type });

    // Create admin Supabase client
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    // Handle invoice events
    if (event.type === "invoice.paid") {
      const invoice = event.data.object as Stripe.Invoice;
      logStep("Invoice paid", { invoiceId: invoice.id, customerId: invoice.customer });

      // Get user_id from invoice metadata
      const userId = invoice.metadata?.user_id;
      
      if (!userId) {
        // Try to find user by customer email
        const customerEmail = typeof invoice.customer_email === 'string' ? invoice.customer_email : null;
        if (!customerEmail) {
          logStep("No user_id or customer_email found");
          return new Response(JSON.stringify({ received: true, message: "No user identifier" }), { status: 200 });
        }

        // Find profile by email
        const { data: profile } = await supabaseAdmin
          .from("profiles")
          .select("user_id")
          .eq("email", customerEmail)
          .single();

        if (!profile) {
          logStep("No user found for email", { email: customerEmail });
          return new Response(JSON.stringify({ received: true, message: "No user found" }), { status: 200 });
        }

        await updateSubscriptionFromInvoice(supabaseAdmin, profile.user_id, invoice, stripe);
      } else {
        await updateSubscriptionFromInvoice(supabaseAdmin, userId, invoice, stripe);
      }

      logStep("Subscription updated from invoice payment");
    }

    // Handle subscription events for recurring subscriptions
    if (event.type === "invoice.payment_failed") {
      const invoice = event.data.object as Stripe.Invoice;
      logStep("Invoice payment failed", { invoiceId: invoice.id });
      
      // Get user from metadata or email
      const userId = invoice.metadata?.user_id;
      if (userId) {
        // Update subscription status to past_due
        await supabaseAdmin
          .from("subscriptions")
          .update({ 
            status: "past_due",
            updated_at: new Date().toISOString()
          })
          .eq("user_id", userId);
        
        logStep("Subscription marked as past_due", { userId });
      }
    }

    if (event.type === "customer.subscription.deleted") {
      const subscription = event.data.object as Stripe.Subscription;
      logStep("Subscription deleted", { subscriptionId: subscription.id });

      const userId = subscription.metadata?.user_id;
      if (userId) {
        await supabaseAdmin
          .from("subscriptions")
          .update({ 
            status: "canceled",
            updated_at: new Date().toISOString()
          })
          .eq("user_id", userId);

        logStep("Subscription marked as canceled", { userId });
      }
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message: errorMessage });
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { "Content-Type": "application/json" },
      status: 500,
    });
  }
});

async function updateSubscriptionFromInvoice(
  supabase: any,
  userId: string,
  invoice: Stripe.Invoice,
  stripe: Stripe
) {
  logStep("Updating subscription for user", { userId, invoiceId: invoice.id });

  // Determine plan type from invoice line items
  let planType = "monthly";
  const lineItems = invoice.lines?.data || [];
  for (const item of lineItems) {
    const price = item.price;
    if (price?.recurring?.interval === "year") {
      planType = "yearly";
      break;
    }
  }

  // Calculate period based on plan type
  const now = new Date();
  let endDate: Date;
  
  // Check if this is a subscription invoice
  if (invoice.subscription) {
    // For subscriptions, use the subscription period
    const subscription = await stripe.subscriptions.retrieve(invoice.subscription as string);
    endDate = new Date((subscription as any).current_period_end * 1000);
    planType = (subscription as any).items?.data?.[0]?.price?.recurring?.interval === "year" ? "yearly" : "monthly";
    logStep("Using subscription period", { endDate: endDate.toISOString() });
  } else {
    // For one-time invoice payments, calculate based on plan type
    if (planType === "yearly") {
      endDate = new Date(now);
      endDate.setFullYear(endDate.getFullYear() + 1);
    } else {
      endDate = new Date(now);
      endDate.setMonth(endDate.getMonth() + 1);
    }
    logStep("Using calculated period", { endDate: endDate.toISOString() });
  }

  const customerId = typeof invoice.customer === 'string' ? invoice.customer : (invoice.customer as any)?.id;
  const subscriptionId = typeof invoice.subscription === 'string' ? invoice.subscription : null;

  // Upsert subscription record
  const { error } = await supabase
    .from("subscriptions")
    .upsert({
      user_id: userId,
      stripe_customer_id: customerId,
      stripe_subscription_id: subscriptionId,
      status: "active",
      plan_type: planType,
      current_period_start: now.toISOString(),
      current_period_end: endDate.toISOString(),
      updated_at: now.toISOString(),
    }, { onConflict: "user_id" });

  if (error) {
    logStep("Error updating subscription", { error: error.message });
    throw error;
  }

  logStep("Subscription activated", { userId, planType, endDate: endDate.toISOString() });
}
