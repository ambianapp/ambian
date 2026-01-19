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
  console.log(`[GET-INVOICES] ${step}${detailsStr}`);
};

serve(async (req) => {
  const origin = req.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");
    
    const token = authHeader.replace("Bearer ", "");
    const { data, error: authError } = await supabaseClient.auth.getUser(token);
    
    if (authError) {
      console.error("Auth error:", authError);
      throw new Error("User not authenticated");
    }
    
    const user = data.user;
    if (!user?.email) throw new Error("User not authenticated");

    logStep("Fetching payment history", { email: user.email, userId: user.id });

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2025-08-27.basil",
    });

    // Device slot price IDs
    const DEVICE_SLOT_PRICE_IDS = [
      "price_1SfhoMJrU52a7SNLpLI3yoEl", // monthly
      "price_1Sj2PMJrU52a7SNLzhpFYfJd", // yearly
    ];

    // Find customer by email
    const customers = await stripe.customers.list({ email: user.email, limit: 1 });
    const customerId = customers.data.length > 0 ? customers.data[0].id : null;
    
    logStep("Customer lookup", { customerId, hasCustomer: !!customerId });

    const formattedInvoices: any[] = [];

    // If customer exists, fetch their invoices
    if (customerId) {
      // Fetch open invoices (pending payment) with line items expanded
      const openInvoices = await stripe.invoices.list({
        customer: customerId,
        status: "open",
        limit: 10,
        expand: ["data.lines.data.price"],
      });

      // Fetch draft invoices too (they might also be orphaned)
      const draftInvoices = await stripe.invoices.list({
        customer: customerId,
        status: "draft",
        limit: 10,
        expand: ["data.lines.data.price"],
      });

      // Process open and draft invoices - void/delete if subscription is canceled
      const filteredOpenInvoices: any[] = [];
      
      for (const inv of [...openInvoices.data, ...draftInvoices.data]) {
        // Check if this invoice is for a subscription
        if (inv.subscription) {
          try {
            const sub = await stripe.subscriptions.retrieve(inv.subscription as string);
            const priceId = sub.items?.data?.[0]?.price?.id;
            const isDeviceSlot = DEVICE_SLOT_PRICE_IDS.includes(priceId || "");
            
            // If the subscription is canceled (especially device slots), void/delete the invoice
            if (sub.status === "canceled") {
              logStep("Found invoice for canceled subscription, cleaning up", { 
                invoiceId: inv.id, 
                status: inv.status,
                subscriptionId: sub.id,
                isDeviceSlot 
              });
              
              if (inv.status === "open") {
                await stripe.invoices.voidInvoice(inv.id);
                logStep("Voided invoice", { invoiceId: inv.id });
              } else if (inv.status === "draft") {
                await stripe.invoices.del(inv.id);
                logStep("Deleted draft invoice", { invoiceId: inv.id });
              }
              continue; // Don't include in results
            }
          } catch (e) {
            logStep("Error checking subscription for invoice", { invoiceId: inv.id, error: String(e) });
            // If subscription doesn't exist anymore, void/delete the invoice
            try {
              if (inv.status === "open") {
                await stripe.invoices.voidInvoice(inv.id);
                logStep("Voided orphaned invoice", { invoiceId: inv.id });
              } else if (inv.status === "draft") {
                await stripe.invoices.del(inv.id);
                logStep("Deleted orphaned draft invoice", { invoiceId: inv.id });
              }
            } catch (cleanupError) {
              logStep("Failed to cleanup invoice", { invoiceId: inv.id, error: String(cleanupError) });
            }
            continue; // Don't include in results
          }
        }

        // Only include open invoices in the UI (not draft)
        if (inv.status === "open") {
          filteredOpenInvoices.push(inv);
        }
      }

      // Fetch paid invoices with line items expanded
      const paidInvoices = await stripe.invoices.list({
        customer: customerId,
        status: "paid",
        limit: 20,
        expand: ["data.lines.data.price"],
      });

      // Add invoices to results - open invoices first
      const allInvoices = [...filteredOpenInvoices, ...paidInvoices.data];

      for (const invoice of allInvoices) {
        // Determine invoice type from line items
        let invoiceLabel = "Subscription";
        let isDeviceSlot = false;
        let isYearly = false;
        let isOneTime = false;
        
        if (invoice.lines?.data?.length > 0) {
          const lineItem = invoice.lines.data[0];
          const priceId = lineItem.price?.id;
          const recurring = lineItem.price?.recurring;
          const description = (lineItem.description || "").toLowerCase();
          
          // Check if device slot by price ID OR description
          isDeviceSlot = DEVICE_SLOT_PRICE_IDS.includes(priceId || "") || 
                         description.includes("device slot") ||
                         description.includes("extra device");
          isOneTime = !recurring; // No recurring = one-time payment
          isYearly = recurring?.interval === "year" || description.includes("year");
          
          // Get quantity from line item (not count of line items - Stripe creates multiple for proration)
          // Look for positive quantity line items (not credit/proration adjustments)
          let deviceSlotQuantity = 0;
          for (const li of invoice.lines.data) {
            const liDesc = (li.description || "").toLowerCase();
            const isDeviceItem = DEVICE_SLOT_PRICE_IDS.includes(li.price?.id || "") ||
                   liDesc.includes("device slot") ||
                   liDesc.includes("extra device");
            // Use quantity if positive, or check if it's the main charge (not adjustment)
            if (isDeviceItem && li.quantity && li.quantity > 0 && !liDesc.includes("unused time")) {
              deviceSlotQuantity = li.quantity;
              break;
            }
          }
          
          logStep("Invoice line item analysis", {
            invoiceId: invoice.id,
            priceId,
            isDeviceSlot,
            isOneTime,
            isYearly,
            deviceSlotQuantity,
            description: lineItem.description
          });
          
          if (isDeviceSlot) {
            invoiceLabel = deviceSlotQuantity > 1 
              ? `Additional Devices (${deviceSlotQuantity}×)` 
              : "Additional Device";
          } else if (isOneTime) {
            invoiceLabel = "Yearly Access";
          } else if (isYearly) {
            invoiceLabel = "Yearly Subscription";
          } else {
            invoiceLabel = "Monthly Subscription";
          }
        }
        
        formattedInvoices.push({
          id: invoice.id,
          number: invoice.number,
          amount: invoice.status === "paid" ? invoice.amount_paid : invoice.amount_due,
          currency: invoice.currency,
          date: invoice.created,
          status: invoice.status,
          dueDate: invoice.due_date,
          pdfUrl: invoice.invoice_pdf,
          hostedUrl: invoice.hosted_invoice_url,
          type: "invoice",
          label: invoiceLabel,
          isDeviceSlot,
          isYearly,
        });
      }

      logStep("Fetched customer invoices", { count: formattedInvoices.length });
    }

    // Also fetch completed checkout sessions for one-time payments (prepaid)
    // These may not have invoices but should still show in payment history
    try {
      // Fetch recent checkout sessions - we'll filter by user_id in metadata
      const checkoutSessions = await stripe.checkout.sessions.list({
        limit: 50,
        expand: ["data.line_items"],
      });

      for (const session of checkoutSessions.data) {
        // Only include sessions for this user (by metadata or email)
        const sessionUserId = session.metadata?.user_id;
        const sessionEmail = session.customer_email || session.customer_details?.email;
        
        if (sessionUserId !== user.id && sessionEmail?.toLowerCase() !== user.email.toLowerCase()) {
          continue;
        }

        // Only include successful one-time payments
        if (session.mode !== "payment" || session.payment_status !== "paid") {
          continue;
        }

        // Skip if we already have an invoice for this (shouldn't happen for one-time payments, but just in case)
        const existingEntry = formattedInvoices.find(inv => 
          inv.id === session.id || 
          (session.payment_intent && inv.paymentIntentId === session.payment_intent)
        );
        if (existingEntry) {
          continue;
        }

        // Get receipt URL from the charge
        let receiptUrl: string | null = null;
        if (session.payment_intent) {
          try {
            const paymentIntent = await stripe.paymentIntents.retrieve(session.payment_intent as string);
            if (paymentIntent.latest_charge) {
              const charge = await stripe.charges.retrieve(paymentIntent.latest_charge as string);
              receiptUrl = charge.receipt_url;
            }
          } catch (e) {
            logStep("Could not fetch receipt for checkout session", { sessionId: session.id });
          }
        }

        // Get plan type from metadata or line items
        const planType = session.metadata?.plan_type || "prepaid";
        const lineItemDescription = session.line_items?.data?.[0]?.description || `${planType} access`;

        formattedInvoices.push({
          id: session.id,
          number: null, // Checkout sessions don't have invoice numbers
          amount: session.amount_total || 0,
          currency: session.currency || "eur",
          date: session.created,
          status: "paid",
          dueDate: null,
          pdfUrl: null, // No PDF for checkout payments
          hostedUrl: receiptUrl, // Use receipt URL instead
          type: "checkout",
          description: lineItemDescription,
          paymentIntentId: session.payment_intent,
        });

        logStep("Added checkout session to history", { 
          sessionId: session.id, 
          amount: session.amount_total,
          planType 
        });
      }
    } catch (checkoutError) {
      logStep("Error fetching checkout sessions", { error: String(checkoutError) });
      // Continue - invoices are still returned even if checkout sessions fail
    }

    // Sort by date descending (newest first)
    formattedInvoices.sort((a, b) => b.date - a.date);

    logStep("Returning payment history", { totalCount: formattedInvoices.length });

    return new Response(JSON.stringify({ invoices: formattedInvoices }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error: any) {
    logStep("ERROR", { message: error.message });
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});