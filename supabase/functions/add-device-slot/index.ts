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

const INVOICE_DAYS_UNTIL_DUE = 7;

const maybeCreateAndSendInvoiceForSendInvoiceSubscription = async (params: {
  stripe: Stripe;
  customerId: string;
  subscriptionId: string;
  collectionMethod?: string | null;
  userId?: string;
  quantity?: number;
}) => {
  const { stripe, customerId, subscriptionId, collectionMethod, userId, quantity } = params;

  // Only invoice immediately for invoice-based subscriptions
  if (collectionMethod !== "send_invoice") return null;

  // For send_invoice subscriptions, proration line items are added as pending invoice items.
  // We need to create a standalone invoice that pulls those pending items.
  // NOTE: Stripe doesn't allow both `subscription` and `pending_invoice_items_behavior` together,
  // so we create an invoice WITHOUT the subscription param, but WITH pending_invoice_items_behavior.
  const invoice = await stripe.invoices.create({
    customer: customerId,
    collection_method: "send_invoice",
    days_until_due: INVOICE_DAYS_UNTIL_DUE,
    auto_advance: true,
    pending_invoice_items_behavior: "include",
    automatic_tax: { enabled: true },
    metadata: {
      type: "device_slot_addon",
      subscription_id: subscriptionId,
      user_id: userId || "",
      quantity: String(quantity || 1),
    },
  });

  // Avoid sending empty/zero invoices
  if ((invoice.total ?? 0) <= 0) {
    try {
      await stripe.invoices.del(invoice.id);
    } catch {
      // ignore
    }
    return null;
  }

  if (invoice.status === "draft") {
    await stripe.invoices.finalizeInvoice(invoice.id);
  }

  // Send invoice email
  await stripe.invoices.sendInvoice(invoice.id);

  return invoice.id;
};

// Device slot price - single price that matches main subscription interval
const DEVICE_SLOT_PRICE_MONTHLY = "price_1SfhoMJrU52a7SNLpLI3yoEl"; // €5/month
const DEVICE_SLOT_PRICE_YEARLY = "price_1Sj2PMJrU52a7SNLzhpFYfJd";  // €50/year

// Main subscription prices (to identify the main subscription)
const MAIN_SUBSCRIPTION_PRICES = [
  "price_1S2BhCJrU52a7SNLtRRpyoCl", // monthly €8.90
  "price_1S2BqdJrU52a7SNLAnOR8Nhf", // yearly €89
  "price_1RREw6JrU52a7SNLjcBLbT7w", // monthly with VAT €11.17
  "price_1RREw6JrU52a7SNLevS4o4gf", // yearly with VAT €111.70
  "price_1SjxomJrU52a7SNL3ImdC1N0", // test daily
];

// Check for abuse: open invoices or too many uncollectible invoices
const checkDeviceSlotInvoiceAbuse = async (
  stripe: Stripe,
  customerId: string
): Promise<{ blocked: boolean; reason?: string }> => {
  logStep("Checking for device slot invoice abuse", { customerId });

  // Check for open device slot invoices (already pending payment)
  const openInvoices = await stripe.invoices.list({
    customer: customerId,
    status: "open",
    limit: 100,
  });

  const openDeviceSlotInvoices = openInvoices.data.filter(
    (inv: Stripe.Invoice) => inv.metadata?.type === "device_slot_addon"
  );

  if (openDeviceSlotInvoices.length > 0) {
    logStep("Found open device slot invoices", { count: openDeviceSlotInvoices.length });
    return {
      blocked: true,
      reason: "You have an unpaid invoice for additional locations. Please pay the existing invoice before adding more locations.",
    };
  }

  // Check for uncollectible device slot invoices (abuse pattern)
  const uncollectibleInvoices = await stripe.invoices.list({
    customer: customerId,
    status: "uncollectible",
    limit: 100,
  });

  const uncollectibleDeviceSlotInvoices = uncollectibleInvoices.data.filter(
    (inv: Stripe.Invoice) => inv.metadata?.type === "device_slot_addon"
  );

  if (uncollectibleDeviceSlotInvoices.length >= 2) {
    logStep("Too many uncollectible device slot invoices", { count: uncollectibleDeviceSlotInvoices.length });
    return {
      blocked: true,
      reason: "You have multiple unpaid invoices for additional locations. Please contact support or use card payment instead.",
    };
  }

  logStep("No device slot invoice abuse detected");
  return { blocked: false };
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

    // Parse request body
    let quantity = 1;
    let mode: "calculate" | "execute" = "execute";
    
    try {
      const body = await req.json();
      if (body.quantity && typeof body.quantity === "number" && body.quantity >= 1 && body.quantity <= 10) {
        quantity = Math.floor(body.quantity);
      }
      if (body.mode === "calculate") {
        mode = "calculate";
      }
    } catch {
      // No body or invalid JSON, use defaults
    }
    logStep("Options selected", { quantity, mode });

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

    // Find the main subscription to add device slots to
    // Include 'active' and 'past_due' (for invoice/SEPA users awaiting payment)
    const activeSubscriptions = await stripe.subscriptions.list({
      customer: customerId,
      status: "active",
      limit: 20,
    });
    
    const pastDueSubscriptions = await stripe.subscriptions.list({
      customer: customerId,
      status: "past_due",
      limit: 20,
    });
    
    const allSubscriptions = [...activeSubscriptions.data, ...pastDueSubscriptions.data];
    logStep("Found subscriptions", { 
      activeCount: activeSubscriptions.data.length, 
      pastDueCount: pastDueSubscriptions.data.length 
    });

    // Find the main subscription (not device slot only)
    let mainSubscription = allSubscriptions.find((sub: any) => {
      const items = sub.items.data;
      return items.some((item: any) => MAIN_SUBSCRIPTION_PRICES.includes(item.price.id));
    });

    if (!mainSubscription) {
      // Check local database for subscription status
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
      
      logStep("Local subscription check", { localSub });
      
      if (localSub) {
        const periodEnd = localSub.current_period_end ? new Date(localSub.current_period_end) : null;
        if (periodEnd && periodEnd > new Date()) {
          // Check if they have a stripe subscription ID - could be invoice-based
          if (localSub.stripe_subscription_id) {
            // Try to fetch this specific subscription from Stripe
            try {
              const stripeSub = await stripe.subscriptions.retrieve(localSub.stripe_subscription_id);
              if (stripeSub && stripeSub.items.data.some((item: any) => MAIN_SUBSCRIPTION_PRICES.includes(item.price.id))) {
                logStep("Found invoice-based subscription via local DB", { 
                  subscriptionId: stripeSub.id, 
                  status: stripeSub.status,
                  collectionMethod: stripeSub.collection_method
                });
                mainSubscription = stripeSub as any;
              }
            } catch (fetchError) {
              logStep("Failed to fetch stripe subscription", { 
                subscriptionId: localSub.stripe_subscription_id, 
                error: fetchError instanceof Error ? fetchError.message : String(fetchError) 
              });
            }
          }
          
          // If still no main subscription found, check if this is a prepaid (non-recurring) plan
          if (!mainSubscription && !localSub.stripe_subscription_id) {
            throw new Error("Device slots require an active recurring subscription. Prepaid plans cannot add device slots with aligned billing. Please contact support for assistance.");
          }
        }
      }
      
      if (!mainSubscription) {
        throw new Error("No active subscription found. Please subscribe first before adding locations.");
      }
    }

    logStep("Main subscription found", { 
      subscriptionId: mainSubscription.id, 
      status: mainSubscription.status,
      itemCount: mainSubscription.items.data.length 
    });

    // Check if this is a send_invoice subscription - if so, check for abuse
    const isSendInvoice = (mainSubscription as any).collection_method === "send_invoice";
    
    if (isSendInvoice) {
      const abuseCheck = await checkDeviceSlotInvoiceAbuse(stripe, customerId);
      if (abuseCheck.blocked) {
        throw new Error(abuseCheck.reason);
      }
    }

    // Determine which device slot price to use based on main subscription interval
    const mainItem = mainSubscription.items.data.find((item: any) => 
      MAIN_SUBSCRIPTION_PRICES.includes(item.price.id)
    );
    const mainInterval = mainItem?.price?.recurring?.interval;
    const deviceSlotPriceId = mainInterval === "year" ? DEVICE_SLOT_PRICE_YEARLY : DEVICE_SLOT_PRICE_MONTHLY;
    const fullPrice = mainInterval === "year" ? 50 : 5; // €50/year or €5/month
    
    logStep("Determined device slot price", { mainInterval, deviceSlotPriceId });

    // If mode is "calculate", return proration preview without making changes
    if (mode === "calculate") {
      logStep("Calculate mode - returning proration preview");
      
      // Use Stripe's upcoming invoice preview to get exact proration
      try {
        // Check if there's already a device slot item on this subscription
        const existingDeviceSlotItem = mainSubscription.items.data.find((item: any) => 
          item.price.id === deviceSlotPriceId
        );

        const subscriptionItems = existingDeviceSlotItem
          ? [{ id: existingDeviceSlotItem.id, quantity: (existingDeviceSlotItem.quantity || 0) + quantity }]
          : [...mainSubscription.items.data.map((item: any) => ({ id: item.id })), { price: deviceSlotPriceId, quantity }];

        // Use createPreview (Stripe SDK v18+) instead of deprecated retrieveUpcoming
        const upcomingInvoice = await stripe.invoices.createPreview({
          customer: customerId,
          subscription: mainSubscription.id,
          subscription_details: {
            items: subscriptionItems,
            proration_behavior: "create_prorations",
          },
        });

        // Log all line items to understand structure
        logStep("Invoice preview response", {
          total: upcomingInvoice.total,
          subtotal: upcomingInvoice.subtotal,
          tax: upcomingInvoice.tax,
          lineItemCount: upcomingInvoice.lines.data.length,
          lineItems: upcomingInvoice.lines.data.map((line: any) => ({
            description: line.description,
            amount: line.amount,
            proration: line.proration,
            type: line.type,
            price_id: line.price?.id,
          })),
        });

        // Find the proration line items - these are typically:
        // 1. Items with proration=true, OR
        // 2. Items that are NOT the standard recurring charges (identified by description patterns)
        // The proration items have descriptions like "Remaining time for..." or "Jäljellä oleva aika..."
        
        // Standard recurring items have descriptions like "1 × Product Name (at €X / period)"
        const isRecurringCharge = (description: string) => {
          return description && (
            description.includes(' × ') || 
            description.includes(' x ') ||
            /^\d+\s*[×x]\s*.+\(at\s/.test(description)
          );
        };
        
        const prorationItems = upcomingInvoice.lines.data.filter((line: any) => 
          line.proration === true || 
          (line.amount > 0 && !isRecurringCharge(line.description || ''))
        );

        logStep("Filtered proration items", {
          prorationItemsCount: prorationItems.length,
          prorationItems: prorationItems.map((l: any) => ({ 
            amount: l.amount, 
            description: l.description,
            proration: l.proration,
            tax_amounts: l.tax_amounts,
          })),
        });
        
        // For proration calculation: sum positive proration items
        let proratedAmountCents = 0;
        let proratedTaxCents = 0;

        // Sum up only the positive amounts (charges for new service)
        proratedAmountCents = prorationItems.reduce((sum: number, item: any) => {
          return item.amount > 0 ? sum + item.amount : sum;
        }, 0);

        // Get tax amount from the proration items
        proratedTaxCents = prorationItems.reduce((sum: number, item: any) => {
          if (item.amount > 0 && item.tax_amounts && item.tax_amounts.length > 0) {
            return sum + item.tax_amounts.reduce((taxSum: number, tax: any) => taxSum + tax.amount, 0);
          }
          return sum;
        }, 0);

        // Get period info
        const periodEnd = mainItem?.current_period_end 
          ? new Date(mainItem.current_period_end * 1000) 
          : new Date(mainSubscription.current_period_end * 1000);
        
        const now = new Date();
        const remainingMs = periodEnd.getTime() - now.getTime();
        const remainingDays = Math.ceil(remainingMs / (1000 * 60 * 60 * 24));

        logStep("Proration calculated", { 
          proratedAmountCents, 
          proratedTaxCents,
          totalWithTax: proratedAmountCents + proratedTaxCents
        });

        return new Response(JSON.stringify({
          success: true,
          mode: "calculate",
          proratedPrice: proratedAmountCents / 100, // Convert to euros (excl. tax)
          proratedTax: proratedTaxCents / 100, // Tax amount in euros
          proratedTotal: (proratedAmountCents + proratedTaxCents) / 100, // Total incl. tax
          fullPrice: fullPrice * quantity,
          remainingDays,
          periodEnd: periodEnd.toISOString(),
          quantity,
          interval: mainInterval,
          currency: upcomingInvoice.currency || "eur",
          isSendInvoice,
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        });
      } catch (prorationError: any) {
        logStep("Failed to calculate proration", { error: prorationError.message });
        // Throw error - we need exact amounts from Stripe, not estimates
        throw new Error("Unable to calculate exact proration. Please try again.");
      }
    }

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
      // For invoice-based subscriptions, we'll also create+send an invoice immediately.
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

      const invoiceId = await maybeCreateAndSendInvoiceForSendInvoiceSubscription({
        stripe,
        customerId,
        subscriptionId: mainSubscription.id,
        collectionMethod: (mainSubscription as any).collection_method,
        userId: user.id,
        quantity,
      });

      logStep("Device slot quantity updated", { newQuantity, invoiceId });

      // Update local device_slots immediately for both card and invoice payments
      // For invoice users: they get immediate access for their FIRST batch (abuse check blocks further requests)
      // If they don't pay within 7 days, the webhook will revoke access
      const supabaseAdmin = createClient(
        Deno.env.get("SUPABASE_URL") ?? "",
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      );

      await supabaseAdmin
        .from("subscriptions")
        .update({
          device_slots: 1 + newQuantity, // 1 base + additional slots
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", user.id);

      logStep("Updated local device_slots", { newTotal: 1 + newQuantity, isSendInvoice });

      const message = isSendInvoice
        ? `Added ${quantity} additional location(s). An invoice has been sent - please pay within 7 days to keep access.`
        : `Added ${quantity} additional location(s). Your subscription has been updated.`;

      return new Response(JSON.stringify({
        success: true,
        message,
        newTotal: newQuantity,
        type: "updated",
        invoiceId: invoiceId || undefined,
        pendingPayment: isSendInvoice,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    // No existing device slot item - add new item to subscription
    // Add item directly with proration
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

    const invoiceId = await maybeCreateAndSendInvoiceForSendInvoiceSubscription({
      stripe,
      customerId,
      subscriptionId: updatedSubscription.id,
      collectionMethod: (updatedSubscription as any).collection_method,
      userId: user.id,
      quantity,
    });

    logStep("Device slot item added to subscription", {
      subscriptionId: updatedSubscription.id,
      itemCount: updatedSubscription.items.data.length,
      invoiceId,
    });

    // Update local device_slots immediately for both card and invoice payments
    // For invoice users: they get immediate access for their FIRST batch (abuse check blocks further requests)
    // If they don't pay within 7 days, the webhook will revoke access
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    await supabaseAdmin
      .from("subscriptions")
      .update({
        device_slots: 1 + quantity, // 1 base + additional slots
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", user.id);

    logStep("Updated local device_slots", { newTotal: 1 + quantity, isSendInvoice });

    const message = isSendInvoice
      ? `Added ${quantity} additional location(s). An invoice has been sent - please pay within 7 days to keep access.`
      : `Added ${quantity} additional location(s). Your subscription has been updated.`;

    return new Response(JSON.stringify({
      success: true,
      message,
      newTotal: quantity,
      type: "added",
      invoiceId: invoiceId || undefined,
      pendingPayment: isSendInvoice,
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