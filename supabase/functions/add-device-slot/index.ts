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
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin || "") ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowedOrigin!,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[ADD-DEVICE-SLOT] ${step}${detailsStr}`);
};

// Device slot prices
const DEVICE_SLOT_PRICES = {
  monthly: "price_1SfhoMJrU52a7SNLpLI3yoEl", // €5/month
  yearly: "price_1Sj2PMJrU52a7SNLzhpFYfJd",  // €50/year (save €10)
};

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

    // Parse request body to get period, quantity, payment method, and billing info
    let period: "monthly" | "yearly" = "monthly";
    let quantity = 1;
    let payByInvoice = false;
    let billingInfo: { companyName?: string; address?: { line1: string; city: string; postal_code: string; country: string } } | null = null;
    
    try {
      const body = await req.json();
      if (body.period === "yearly") {
        period = "yearly";
      }
      if (body.quantity && typeof body.quantity === "number" && body.quantity >= 1 && body.quantity <= 10) {
        quantity = Math.floor(body.quantity);
      }
      // Pay by invoice only allowed for yearly
      if (body.payByInvoice === true && period === "yearly") {
        payByInvoice = true;
      }
      // Billing info for invoice payments
      if (body.billingInfo) {
        billingInfo = body.billingInfo;
      }
    } catch {
      // No body or invalid JSON, use defaults
    }
    logStep("Options selected", { period, quantity, payByInvoice, hasBillingInfo: !!billingInfo });

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

    // Verify user has an active main subscription (not just device slots)
    // Check for active, trialing, or past_due subscriptions (give grace period for invoice payments)
    const subscriptions = await stripe.subscriptions.list({
      customer: customerId,
      limit: 20,
    });

    // Device slot prices to exclude from main subscription check
    const deviceSlotPriceIds = [
      "price_1SfhoMJrU52a7SNLpLI3yoEl", // monthly device slot
      "price_1Sj2PMJrU52a7SNLzhpFYfJd", // yearly device slot
    ];

    // Valid statuses for main subscription
    const validStatuses = ["active", "trialing", "past_due"];

    const hasMainSubscription = subscriptions.data.some((sub: any) => {
      const priceId = sub.items.data[0]?.price?.id;
      const isDeviceSlot = deviceSlotPriceIds.includes(priceId);
      const hasValidStatus = validStatuses.includes(sub.status);
      return !isDeviceSlot && hasValidStatus;
    });

    if (!hasMainSubscription) {
      throw new Error("No active subscription found. Please subscribe first before adding locations.");
    }
    logStep("Main subscription verified");

    const returnOrigin = origin || "https://ambian.lovable.app";
    const priceId = DEVICE_SLOT_PRICES[period];

    // Pay by invoice flow - create subscription directly with send_invoice
    if (payByInvoice) {
      logStep("Creating invoice-based subscription");
      
      // Update customer with billing info if provided
      if (billingInfo) {
        const updateData: any = {};
        if (billingInfo.companyName) {
          updateData.name = billingInfo.companyName;
        }
        if (billingInfo.address) {
          updateData.address = billingInfo.address;
        }
        if (Object.keys(updateData).length > 0) {
          await stripe.customers.update(customerId, updateData);
          logStep("Customer billing info updated", { name: billingInfo.companyName });
        }
      }
      
      const subscription = await stripe.subscriptions.create({
        customer: customerId,
        items: [{ price: priceId, quantity: quantity }],
        collection_method: "send_invoice",
        days_until_due: 14,
        metadata: {
          user_id: user.id,
          type: "device_slot",
          period: period,
          quantity: String(quantity),
        },
      });

      logStep("Invoice subscription created", { subscriptionId: subscription.id });

      // Get the invoice to provide payment link
      const invoices = await stripe.invoices.list({
        subscription: subscription.id,
        limit: 1,
      });

      if (invoices.data.length > 0 && invoices.data[0].hosted_invoice_url) {
        logStep("Invoice URL retrieved", { invoiceId: invoices.data[0].id });
        return new Response(JSON.stringify({ 
          url: invoices.data[0].hosted_invoice_url,
          type: "invoice",
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        });
      }

      // Fallback: return success without URL (invoice will be emailed)
      return new Response(JSON.stringify({ 
        success: true,
        message: "Invoice has been sent to your email",
        type: "invoice",
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    // Normal checkout flow
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      customer_update: {
        name: "auto",
        address: "auto",
      },
      line_items: [
        {
          price: priceId,
          quantity: quantity,
        },
      ],
      mode: "subscription",
      allow_promotion_codes: true,
      automatic_tax: { enabled: true },
      tax_id_collection: { enabled: true },
      billing_address_collection: "required",
      custom_fields: [
        {
          key: "company_name",
          label: { type: "custom", custom: "Company Name" },
          type: "text",
        },
        {
          key: "company_address",
          label: { type: "custom", custom: "Company Address" },
          type: "text",
        },
      ],
      success_url: `${returnOrigin}/?device_added=true`,
      cancel_url: `${returnOrigin}/profile`,
      metadata: {
        user_id: user.id,
        type: "device_slot",
        period: period,
        quantity: String(quantity),
      },
      subscription_data: {
        metadata: {
          user_id: user.id,
          type: "device_slot",
          period: period,
          quantity: String(quantity),
        },
      },
    });

    logStep("Checkout session created", { sessionId: session.id, period, quantity, priceId });

    return new Response(JSON.stringify({ url: session.url, type: "checkout" }), {
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
