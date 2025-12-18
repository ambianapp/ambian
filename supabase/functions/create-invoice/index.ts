import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[CREATE-INVOICE] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? ""
  );

  try {
    logStep("Function started");

    const { priceId, companyName, companyAddress } = await req.json();
    logStep("Received request", { priceId, companyName });

    const authHeader = req.headers.get("Authorization")!;
    const token = authHeader.replace("Bearer ", "");
    const { data } = await supabaseClient.auth.getUser(token);
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
      
      // Update customer with company info if provided
      if (companyName || companyAddress) {
        await stripe.customers.update(customerId, {
          name: companyName || undefined,
          address: companyAddress ? {
            line1: companyAddress,
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
        address: companyAddress ? {
          line1: companyAddress,
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

    // Create the invoice
    const invoice = await stripe.invoices.create({
      customer: customerId,
      collection_method: "send_invoice",
      days_until_due: 14, // 14 days to pay
      auto_advance: true,
      metadata: {
        user_id: user.id,
      },
    });
    logStep("Created invoice", { invoiceId: invoice.id });

    // Add the subscription item to the invoice
    if (price.recurring) {
      // For subscriptions, create a subscription with send_invoice collection method
      const subscription = await stripe.subscriptions.create({
        customer: customerId,
        items: [{ price: priceId }],
        collection_method: "send_invoice",
        days_until_due: 14,
        metadata: {
          user_id: user.id,
        },
      });
      logStep("Created subscription", { subscriptionId: subscription.id });

      // Get the latest invoice for this subscription and send it
      const invoices = await stripe.invoices.list({
        subscription: subscription.id,
        limit: 1,
      });
      
      if (invoices.data.length > 0) {
        const subscriptionInvoice = invoices.data[0];
        logStep("Found subscription invoice", { invoiceId: subscriptionInvoice.id, status: subscriptionInvoice.status });
        
        // If invoice is in draft, finalize it first
        if (subscriptionInvoice.status === 'draft') {
          await stripe.invoices.finalizeInvoice(subscriptionInvoice.id);
          logStep("Finalized invoice");
        }
        
        // Send the invoice email
        await stripe.invoices.sendInvoice(subscriptionInvoice.id);
        logStep("Sent invoice email", { invoiceId: subscriptionInvoice.id });
      }

      return new Response(JSON.stringify({ 
        success: true, 
        message: "Invoice sent to your email. You have 14 days to pay.",
        subscriptionId: subscription.id,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    } else {
      // For one-time payments, add invoice item
      await stripe.invoiceItems.create({
        customer: customerId,
        price: priceId,
        invoice: invoice.id,
      });
      logStep("Added invoice item");

      // Finalize and send the invoice
      const finalizedInvoice = await stripe.invoices.finalizeInvoice(invoice.id);
      await stripe.invoices.sendInvoice(invoice.id);
      logStep("Finalized and sent invoice", { invoiceId: finalizedInvoice.id });

      return new Response(JSON.stringify({ 
        success: true, 
        message: "Invoice sent to your email. You have 14 days to pay.",
        invoiceId: finalizedInvoice.id,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message: errorMessage });
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
