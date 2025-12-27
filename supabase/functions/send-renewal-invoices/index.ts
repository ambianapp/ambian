import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[SEND-RENEWAL-INVOICES] ${step}${detailsStr}`);
};

// Yearly price ID for invoice renewals
const YEARLY_INVOICE_PRICE_ID = "price_1SfhOZJrU52a7SNLIejHHUh4";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } }
  );

  try {
    logStep("Function started - checking for subscriptions expiring in 14 days");

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2025-08-27.basil",
    });

    // Calculate the date window: 13-15 days from now (to catch exactly 14 days)
    const now = new Date();
    const thirteenDaysFromNow = new Date(now);
    thirteenDaysFromNow.setDate(thirteenDaysFromNow.getDate() + 13);
    
    const fifteenDaysFromNow = new Date(now);
    fifteenDaysFromNow.setDate(fifteenDaysFromNow.getDate() + 15);

    logStep("Date window", { 
      from: thirteenDaysFromNow.toISOString(), 
      to: fifteenDaysFromNow.toISOString() 
    });

    // Find subscriptions expiring in ~14 days that are:
    // 1. Active (not trial, not pending_payment)
    // 2. Yearly plan
    // 3. Invoice-based (stripe_subscription_id is null - we handle these manually)
    const { data: expiringSubscriptions, error: queryError } = await supabaseAdmin
      .from("subscriptions")
      .select("*, profiles!inner(email, full_name)")
      .eq("status", "active")
      .eq("plan_type", "yearly")
      .is("stripe_subscription_id", null) // Invoice-based (no Stripe subscription)
      .gte("current_period_end", thirteenDaysFromNow.toISOString())
      .lte("current_period_end", fifteenDaysFromNow.toISOString());

    if (queryError) {
      logStep("Query error", { error: queryError.message });
      throw new Error(`Failed to query subscriptions: ${queryError.message}`);
    }

    logStep("Found expiring subscriptions", { count: expiringSubscriptions?.length || 0 });

    if (!expiringSubscriptions || expiringSubscriptions.length === 0) {
      return new Response(JSON.stringify({ 
        success: true, 
        message: "No subscriptions need renewal invoices today",
        processed: 0 
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    let processed = 0;
    let errors: string[] = [];

    for (const sub of expiringSubscriptions) {
      try {
        const userEmail = sub.profiles?.email;
        const userName = sub.profiles?.full_name;
        
        if (!userEmail) {
          logStep("Skipping - no email found", { userId: sub.user_id });
          continue;
        }

        if (!sub.stripe_customer_id) {
          logStep("Skipping - no Stripe customer ID", { userId: sub.user_id });
          continue;
        }

        logStep("Processing renewal", { 
          userId: sub.user_id, 
          email: userEmail,
          expiresAt: sub.current_period_end 
        });

        // Check if there's already an open invoice for this customer
        const openInvoices = await stripe.invoices.list({
          customer: sub.stripe_customer_id,
          status: "open",
          limit: 5,
        });

        if (openInvoices.data.length > 0) {
          logStep("Skipping - already has open invoice", { 
            userId: sub.user_id, 
            invoiceCount: openInvoices.data.length 
          });
          continue;
        }

        // Create renewal invoice
        const invoice = await stripe.invoices.create({
          customer: sub.stripe_customer_id,
          collection_method: "send_invoice",
          days_until_due: 14, // 14 days to pay
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
                    country: "DE",
                  },
                },
              },
            },
          },
          metadata: {
            user_id: sub.user_id,
            plan_type: "yearly",
            renewal: "true",
            previous_period_end: sub.current_period_end,
          },
        });

        logStep("Created renewal invoice", { invoiceId: invoice.id, userId: sub.user_id });

        // Add the yearly price to the invoice
        await stripe.invoiceItems.create({
          customer: sub.stripe_customer_id,
          price: YEARLY_INVOICE_PRICE_ID,
          invoice: invoice.id,
        });

        // Finalize and send
        await stripe.invoices.finalizeInvoice(invoice.id);
        await stripe.invoices.sendInvoice(invoice.id);

        logStep("Sent renewal invoice", { invoiceId: invoice.id, email: userEmail });

        processed++;
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        logStep("Error processing subscription", { userId: sub.user_id, error: errMsg });
        errors.push(`${sub.user_id}: ${errMsg}`);
      }
    }

    logStep("Completed", { processed, errors: errors.length });

    return new Response(JSON.stringify({ 
      success: true, 
      message: `Processed ${processed} renewal invoices`,
      processed,
      errors: errors.length > 0 ? errors : undefined,
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
