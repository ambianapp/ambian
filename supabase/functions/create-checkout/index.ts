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
  console.log(`[CREATE-CHECKOUT] ${step}${detailsStr}`);
};

// Price IDs for subscriptions (recurring) - by currency
const SUBSCRIPTION_PRICES = {
  EUR: {
    monthly: "price_1S2BhCJrU52a7SNLtRRpyoCl",
    yearly: "price_1S2BqdJrU52a7SNLAnOR8Nhf",
  },
  USD: {
    monthly: "price_1SvJoMJrU52a7SNLo959c2de",
    yearly: "price_1SvJowJrU52a7SNLGaCy1fSV",
  },
};

// Price IDs for prepaid access (one-time) - by currency
const PREPAID_PRICES = {
  EUR: {
    monthly: "price_1SfhOOJrU52a7SNLPPopAVyb",
    yearly: "price_1SfhOZJrU52a7SNLIejHHUh4",
  },
  USD: {
    monthly: "price_1SvJqQJrU52a7SNLQVDEH3YZ",
    yearly: "price_1SvJqmJrU52a7SNLpKF8z2oF",
  },
};

// Test prices (EUR only)
const TEST_PRICES = {
  subscription_daily: "price_1SjxomJrU52a7SNL3ImdC1N0",
  prepaid_daily: "price_1SjxozJrU52a7SNLnoFrDtvf",
};

// All valid price IDs for lookup
const ALL_PRICES = {
  ...SUBSCRIPTION_PRICES.EUR,
  ...SUBSCRIPTION_PRICES.USD,
  ...PREPAID_PRICES.EUR,
  ...PREPAID_PRICES.USD,
  ...TEST_PRICES,
};

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

    const { priceId, paymentMode, promoCode, currency } = await req.json();
    // paymentMode: "subscription" or "payment" (one-time prepaid)
    const mode = paymentMode || "subscription";
    const selectedCurrency = currency || "EUR";
    logStep("Received request", { priceId, mode, promoCode: promoCode || "none", currency: selectedCurrency });

    // Determine plan type from price ID
    let planType = "monthly";
    const allYearlyPrices = [
      SUBSCRIPTION_PRICES.EUR.yearly,
      SUBSCRIPTION_PRICES.USD.yearly,
      PREPAID_PRICES.EUR.yearly,
      PREPAID_PRICES.USD.yearly,
    ];
    const allDailyTestPrices = [TEST_PRICES.subscription_daily, TEST_PRICES.prepaid_daily];
    
    if (allYearlyPrices.includes(priceId)) {
      planType = "yearly";
    } else if (allDailyTestPrices.includes(priceId)) {
      planType = "daily_test";
    }
    logStep("Plan type determined", { planType });

    const { data, error: userError } = await supabaseClient.auth.getUser();
    if (userError) throw new Error(`Auth error: ${userError.message}`);
    const user = data.user;
    if (!user?.email) throw new Error("User not authenticated");
    logStep("User authenticated", { userId: user.id, email: user.email });

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2025-08-27.basil",
    });

    // Check for existing customer or create one
    const customers = await stripe.customers.list({ email: user.email, limit: 1 });
    let customerId: string;
    if (customers.data.length > 0) {
      customerId = customers.data[0].id;
      logStep("Found existing customer", { customerId });
    } else {
      // Create a new customer to ensure all payments are properly linked
      const newCustomer = await stripe.customers.create({
        email: user.email,
        metadata: {
          user_id: user.id,
        },
      });
      customerId = newCustomer.id;
      logStep("Created new customer", { customerId });
    }

    const returnOrigin = origin || "https://ambian.lovable.app";
    
    // Build success URL based on mode - redirect to pricing page for thank you dialog
    const successUrl = mode === "payment" 
      ? `${returnOrigin}/pricing?checkout=success&session_id={CHECKOUT_SESSION_ID}&mode=prepaid`
      : `${returnOrigin}/pricing?checkout=success`;

    // Build checkout session options - always use customer ID since we create one
    const sessionOptions: any = {
      customer: customerId,
      customer_update: {
        name: "auto",
        address: "auto",
      },
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      mode: mode, // "subscription" or "payment"
      success_url: successUrl,
      cancel_url: `${returnOrigin}/?checkout=cancelled`,
      metadata: {
        user_id: user.id,
        plan_type: planType,
        payment_mode: mode,
        currency: selectedCurrency,
      },
      automatic_tax: { enabled: true },
      tax_id_collection: { enabled: true },
      billing_address_collection: "required",
      custom_fields: [
        {
          key: "company_name",
          label: { type: "custom", custom: "Company Name (optional)" },
          type: "text",
          optional: true,
        },
      ],
      allow_promotion_codes: !promoCode, // Allow manual entry if no code provided
    };

    // If a promo code is provided, look it up and apply it
    if (promoCode && promoCode.trim()) {
      const rawCode = promoCode.trim();
      const promoCodeUpper = rawCode.toUpperCase();
      logStep("Looking up promo code", { promoCode: promoCodeUpper });

      try {
        // First try to find a Promotion Code (case-insensitive)
        const promotionCodes = await stripe.promotionCodes.list({
          code: promoCodeUpper,
          active: true,
          limit: 1,
        });

        if (promotionCodes.data.length > 0) {
          sessionOptions.discounts = [{ promotion_code: promotionCodes.data[0].id }];
          logStep("Applied promotion code", { promoCodeId: promotionCodes.data[0].id });
        } else {
          // Fallback: treat input as a Coupon ID (case-sensitive)
          try {
            const coupon = await stripe.coupons.retrieve(rawCode);
            if (coupon && coupon.valid) {
              sessionOptions.discounts = [{ coupon: coupon.id }];
              logStep("Applied coupon directly", { couponId: coupon.id });
            } else {
              logStep("Coupon not valid, allowing manual entry");
              sessionOptions.allow_promotion_codes = true;
            }
          } catch (_couponError) {
            logStep("Promo/coupon not found, allowing manual entry");
            sessionOptions.allow_promotion_codes = true;
          }
        }
      } catch (promoError) {
        logStep("Error looking up promo code, allowing manual entry", { error: String(promoError) });
        sessionOptions.allow_promotion_codes = true;
      }
    }

    const session = await stripe.checkout.sessions.create(sessionOptions);

    logStep("Checkout session created", { sessionId: session.id, mode, currency: selectedCurrency });

    return new Response(JSON.stringify({ url: session.url }), {
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