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
  console.log(`[CREATE-INVOICE] ${step}${detailsStr}`);
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

  // Admin client for subscription checks and rollback
  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } }
  );

  let rollbackUserId: string | null = null;
  let didUpsertPendingPayment = false;

  try {
    logStep("Function started");

    const { priceId, companyName, address } = await req.json();
    logStep("Received request", { priceId, companyName, address });

    const { data, error: userError } = await supabaseClient.auth.getUser();
    if (userError) throw new Error(`Auth error: ${userError.message}`);
    const user = data.user;
    if (!user?.email) throw new Error("User not authenticated");
    rollbackUserId = user.id;
    logStep("User authenticated", { userId: user.id, email: user.email });

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2025-08-27.basil",
    });

    // Check if user already has a pending payment (and verify Stripe state)
    const { data: existingSub } = await supabaseAdmin
      .from("subscriptions")
      .select("status, current_period_end")
      .eq("user_id", user.id)
      .single();

    if (existingSub?.status === "pending_payment") {
      const periodEnd = existingSub.current_period_end ? new Date(existingSub.current_period_end) : null;

      // If grace period is still active, only block if there's actually an open invoice in Stripe.
      if (periodEnd && periodEnd > new Date()) {
        const customersForPending = await stripe.customers.list({ email: user.email, limit: 1 });
        const pendingCustomerId = customersForPending.data[0]?.id;

        if (pendingCustomerId) {
          const openInvoices = await stripe.invoices.list({
            customer: pendingCustomerId,
            status: "open",
            limit: 10,
          });

          if (openInvoices.data.length > 0) {
            logStep("User already has pending invoice", { until: periodEnd.toISOString(), open: openInvoices.data.length });
            throw new Error(
              "You already have a pending invoice. Please check your email or wait for it to expire before requesting a new one."
            );
          }
        }

        // No open invoice found -> clear stale pending state
        await supabaseAdmin
          .from("subscriptions")
          .update({
            status: "inactive",
            current_period_start: null,
            current_period_end: null,
            stripe_subscription_id: null,
            updated_at: new Date().toISOString(),
          })
          .eq("user_id", user.id);

        logStep("Cleared stale pending_payment state (no open invoices found)");
      }
    }

    // Check for existing customer or create one
    const customers = await stripe.customers.list({ email: user.email, limit: 1 });
    let customerId: string;
    
    if (customers.data.length > 0) {
      customerId = customers.data[0].id;
      logStep("Found existing customer", { customerId });

      // Check for any open/unpaid invoices in Stripe
      const openInvoices = await stripe.invoices.list({
        customer: customerId,
        status: "open",
        limit: 10,
      });

      if (openInvoices.data.length > 0) {
        logStep("User has open invoices in Stripe", { count: openInvoices.data.length });
        throw new Error("You have an unpaid invoice. Please pay it first before requesting a new one.");
      }

      // Check for past genuinely unpaid invoices (uncollectible) - prevent abuse
      // NOTE: "void" invoices can happen for legitimate reasons (test invoices, corrections),
      // so we do NOT treat them as unpaid-abuse signals.
      const uncollectibleInvoices = await stripe.invoices.list({
        customer: customerId,
        status: "uncollectible",
        limit: 10,
      });

      const uncollectibleCount = uncollectibleInvoices.data.length;
      if (uncollectibleCount >= 2) {
        logStep("User has history of uncollectible invoices", { uncollectibleCount });
        throw new Error("Invoice payment is not available for your account. Please use card payment instead.");
      }
      
      // Update customer with company info if provided
      if (companyName || address) {
        await stripe.customers.update(customerId, {
          name: companyName || undefined,
          address: address ? {
            line1: address.line1,
            city: address.city,
            postal_code: address.postal_code,
            country: address.country,
          } : undefined,
          metadata: {
            user_id: user.id,
            company_name: companyName || '',
          },
        });
        logStep("Updated customer with company info");
      }
    } else {
      const newCustomer = await stripe.customers.create({
        email: user.email,
        name: companyName || undefined,
        address: address ? {
          line1: address.line1,
          city: address.city,
          postal_code: address.postal_code,
          country: address.country,
        } : undefined,
        metadata: {
          user_id: user.id,
          company_name: companyName || '',
        },
      });
      customerId = newCustomer.id;
      logStep("Created new customer", { customerId });
    }

    // Get the price to determine if it's recurring
    const price = await stripe.prices.retrieve(priceId);
    logStep("Retrieved price", { priceId, recurring: !!price.recurring });

    // Grant 7-day grace period immediately
    const gracePeriodDays = 7;
    const now = new Date();
    const gracePeriodEnd = new Date(now);
    gracePeriodEnd.setDate(gracePeriodEnd.getDate() + gracePeriodDays);
    
    // Determine plan duration for after payment
    const planType = price.recurring?.interval === "year" ? "yearly" : "monthly";
    
    logStep("Granting grace period", { gracePeriodEnd: gracePeriodEnd.toISOString(), planType });

    // Create the invoice with bank transfer enabled and automatic tax
    const invoice = await stripe.invoices.create({
      customer: customerId,
      collection_method: "send_invoice",
      days_until_due: gracePeriodDays, // Match grace period
      auto_advance: true,
      automatic_tax: {
        enabled: true,
      },
      payment_settings: {
        payment_method_types: ["card", "customer_balance"],
        payment_method_options: {
          customer_balance: {
            funding_type: "bank_transfer",
            bank_transfer: {
              type: "eu_bank_transfer",
              eu_bank_transfer: {
                country: "DE", // Germany for SEPA (supported: BE, DE, FR, IE, NL)
              },
            },
          },
        },
      },
      metadata: {
        user_id: user.id,
        plan_type: planType,
      },
    });
    logStep("Created invoice", { invoiceId: invoice.id });

    // Update subscription with grace period access

    const { error: subError } = await supabaseAdmin
      .from("subscriptions")
      .upsert({
        user_id: user.id,
        stripe_customer_id: customerId,
        stripe_subscription_id: null,
        status: "pending_payment", // Special status for invoice grace period
        plan_type: planType,
        current_period_start: now.toISOString(),
        current_period_end: gracePeriodEnd.toISOString(),
        updated_at: now.toISOString(),
      }, { onConflict: "user_id" });

    if (subError) {
      logStep("Error creating grace period subscription", { error: subError.message });
    } else {
      didUpsertPendingPayment = true;
      logStep("Grace period subscription created", { userId: user.id, until: gracePeriodEnd.toISOString() });
    }

    // Add the price to the invoice (always one-time, we handle renewals manually via cron)
    // This gives us full control over when renewal invoices are sent (14 days early for IBAN)
    await stripe.invoiceItems.create({
      customer: customerId,
      price: priceId,
      invoice: invoice.id,
    });
    logStep("Added invoice item");

    // Calculate access period based on plan type
    let accessEnd: Date;
    if (planType === "yearly") {
      accessEnd = new Date(now);
      accessEnd.setFullYear(accessEnd.getFullYear() + 1);
    } else {
      accessEnd = new Date(now);
      accessEnd.setMonth(accessEnd.getMonth() + 1);
    }

    // Update subscription record with full access period (not just grace period)
    // Access will be granted once payment is confirmed via webhook
    const { error: subUpdateError } = await supabaseAdmin
      .from("subscriptions")
      .update({
        // Store the intended access end date in metadata for when payment completes
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", user.id);

    if (subUpdateError) {
      logStep("Error updating subscription", { error: subUpdateError.message });
    }

    // Finalize and send the invoice
    const finalizedInvoice = await stripe.invoices.finalizeInvoice(invoice.id);
    await stripe.invoices.sendInvoice(invoice.id);
    logStep("Finalized and sent invoice", { invoiceId: finalizedInvoice.id, planType });

    return new Response(JSON.stringify({ 
      success: true, 
      message: `Invoice sent! You have ${gracePeriodDays} days access while awaiting payment. Renewal invoices are sent 14 days before expiry.`,
      invoiceId: finalizedInvoice.id,
      grace_period_until: gracePeriodEnd.toISOString(),
      access_period: planType,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    // Roll back pending access if invoice/subscription creation failed
    if (rollbackUserId && didUpsertPendingPayment) {
      const { error: rollbackError } = await supabaseAdmin
        .from("subscriptions")
        .update({
          status: "inactive",
          current_period_start: null,
          current_period_end: null,
          stripe_subscription_id: null,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", rollbackUserId);

      if (rollbackError) {
        logStep("Rollback failed", { error: rollbackError.message });
      } else {
        logStep("Rolled back pending_payment after failure", { userId: rollbackUserId });
      }
    }

    logStep("ERROR", { message: errorMessage });
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});