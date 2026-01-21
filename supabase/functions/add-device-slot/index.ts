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

    // Re-fetch the main subscription to ensure we have all fields including current_period_end
    const fullMainSubscription = await stripe.subscriptions.retrieve(mainSubscription.id);
    
    logStep("Main subscription found", { 
      subscriptionId: fullMainSubscription.id, 
      status: fullMainSubscription.status,
      itemCount: fullMainSubscription.items.data.length,
      currentPeriodEnd: fullMainSubscription.current_period_end,
    });
    
    // Use the fully retrieved subscription from now on
    mainSubscription = fullMainSubscription as any;

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
      
      // Get period end from the MAIN subscription (not from any schedule)
      // This is the actual billing renewal date
      const mainSubscriptionPeriodEnd = mainSubscription.current_period_end;
      const periodEnd = mainSubscriptionPeriodEnd ? new Date(mainSubscriptionPeriodEnd * 1000) : new Date();
      const now = new Date();
      const msRemaining = periodEnd.getTime() - now.getTime();
      const daysRemaining = Math.max(1, Math.ceil(msRemaining / (1000 * 60 * 60 * 24)));
      
      logStep("Period end from main subscription", { 
        mainSubscriptionPeriodEnd,
        periodEndDate: periodEnd.toISOString(),
        daysRemaining 
      });
      
      // Use Stripe's invoice preview to get accurate proration with tax
      // Check if there's already a device slot item on this subscription
      const existingDeviceSlotItem = mainSubscription.items.data.find((item: any) => 
        item.price.id === deviceSlotPriceId
      );
      
      const currentDeviceQuantity = existingDeviceSlotItem?.quantity || 0;
      const newTotalQuantity = currentDeviceQuantity + quantity;
      
      const subscriptionItems = existingDeviceSlotItem
        ? [{ id: existingDeviceSlotItem.id, quantity: newTotalQuantity }]
        : [...mainSubscription.items.data.map((item: any) => ({ id: item.id })), { price: deviceSlotPriceId, quantity }];

      const upcomingInvoice = await stripe.invoices.createPreview({
        customer: customerId,
        subscription: mainSubscription.id,
        automatic_tax: { enabled: true },
        subscription_details: {
          items: subscriptionItems,
          proration_behavior: "create_prorations",
        },
      });

      const invoiceAny = upcomingInvoice as any;
      
      logStep("Invoice preview response", {
        total: invoiceAny.total,
        subtotal: invoiceAny.subtotal,
        total_excluding_tax: invoiceAny.total_excluding_tax,
        automatic_tax: invoiceAny.automatic_tax,
        lineItemCount: invoiceAny.lines?.data?.length || 0,
        lineItems: invoiceAny.lines?.data?.map((item: any) => ({
          description: item.description,
          amount: item.amount,
        })) || [],
      });
      
      // Filter for only proration line items for the NEW quantity being added
      // Proration items have descriptions like "Remaining time for X × Extra Device Slot"
      // or Finnish: "Jäljellä oleva aika kohteelle X × Extra Device Slot"
      // We need to find the one that corresponds to the NEW total quantity
      const prorationItems = invoiceAny.lines?.data?.filter((item: any) => {
        const desc = (item.description || '').toLowerCase();
        
        // Check if it's a proration item (positive amount, contains "remaining time" or equivalent)
        if (item.amount <= 0) return false;
        
        // Match patterns for remaining time prorations in various languages
        const isRemainingTime = 
          desc.includes('remaining time for') ||
          desc.includes('jäljellä oleva aika') ||
          desc.includes('temps restant pour') ||
          desc.includes('resterende tijd voor');
        
        if (!isRemainingTime) return false;
        
        // Check if it's for device slots
        const isDeviceSlot = 
          desc.includes('device slot') ||
          desc.includes('extra device') ||
          desc.includes('location') ||
          desc.includes('device');
        
        if (!isDeviceSlot) return false;
        
        // Check if it's for the NEW total quantity (e.g., "2 × Extra Device Slot" when going from 1 to 2)
        const quantityMatch = desc.match(/(\d+)\s*[×x]/);
        if (quantityMatch) {
          const descQuantity = parseInt(quantityMatch[1], 10);
          // This should be the new total quantity
          return descQuantity === newTotalQuantity;
        }
        
        return true;
      }) || [];
      
      // Also need to account for credit items for unused time on existing slots
      const creditItems = invoiceAny.lines?.data?.filter((item: any) => {
        const desc = (item.description || '').toLowerCase();
        if (item.amount >= 0) return false;
        
        // Match patterns for unused time in various languages
        const isUnusedTime = 
          desc.includes('unused time') ||
          desc.includes('käyttämätön aika') ||
          desc.includes('temps non utilisé');
        
        if (!isUnusedTime) return false;
        
        // Check if it's for device slots
        return desc.includes('device slot') || desc.includes('extra device') || desc.includes('device');
      }) || [];
      
      logStep("Filtered proration items", { 
        prorationItemsCount: prorationItems.length, 
        creditItemsCount: creditItems.length,
        prorationItems: prorationItems.map((i: any) => ({ amount: i.amount, description: i.description })),
        creditItems: creditItems.map((i: any) => ({ amount: i.amount, description: i.description })),
      });
      
      // Calculate net proration (new slots minus credit for existing)
      // For adding to an existing item: new total proration - credit for old = delta for new slot
      const prorationSum = prorationItems.reduce((sum: number, item: any) => sum + item.amount, 0);
      const creditSum = creditItems.reduce((sum: number, item: any) => sum + item.amount, 0);
      const netProrationCents = prorationSum + creditSum; // creditSum is negative
      
      // Calculate tax proportionally from the invoice totals
      let proratedTaxCents = 0;
      if (typeof invoiceAny.total === "number" && typeof invoiceAny.total_excluding_tax === "number" && invoiceAny.subtotal > 0) {
        const invoiceTaxCents = invoiceAny.total - invoiceAny.total_excluding_tax;
        // Tax rate as a proportion
        const taxRate = invoiceAny.total_excluding_tax > 0 ? invoiceTaxCents / invoiceAny.total_excluding_tax : 0;
        proratedTaxCents = Math.round(netProrationCents * taxRate);
        
        logStep("Tax calculated", { 
          invoiceTaxCents,
          invoiceTotalExclTax: invoiceAny.total_excluding_tax,
          taxRate: (taxRate * 100).toFixed(2) + "%",
          netProrationCents,
          proratedTaxCents,
        });
      }
      
      const proratedAmountCents = Math.max(0, netProrationCents);
      const proratedTax = Math.max(0, proratedTaxCents);
      
      logStep("Proration calculated", { 
        proratedAmountCents, 
        proratedTaxCents: proratedTax,
        totalWithTax: proratedAmountCents + proratedTax,
      });

      return new Response(JSON.stringify({
        success: true,
        mode: "calculate",
        proratedPrice: proratedAmountCents / 100, // Convert to euros (excl. tax)
        proratedTax: proratedTax / 100, // Tax amount in euros
        proratedTotal: (proratedAmountCents + proratedTax) / 100, // Total incl. tax
        fullPrice: fullPrice * quantity,
        remainingDays: daysRemaining,
        periodEnd: periodEnd.toISOString(),
        quantity,
        interval: mainInterval,
        currency: "eur",
        isSendInvoice,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
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
      // For card subscriptions: always_invoice charges immediately
      // For invoice-based subscriptions: create_prorations + manual invoice creation
      const prorationBehavior = isSendInvoice ? "create_prorations" : "always_invoice";
      
      await stripe.subscriptions.update(mainSubscription.id, {
        items: [{
          id: existingDeviceSlotItem.id,
          quantity: newQuantity,
        }],
        proration_behavior: prorationBehavior,
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
    // For card subscriptions: always_invoice charges immediately
    // For invoice-based subscriptions: create_prorations + manual invoice creation
    const prorationBehavior = isSendInvoice ? "create_prorations" : "always_invoice";
    
    logStep("Adding new device slot item to subscription", { prorationBehavior });

    const updatedSubscription = await stripe.subscriptions.update(mainSubscription.id, {
      items: [
        ...mainSubscription.items.data.map((item: any) => ({ id: item.id })),
        {
          price: deviceSlotPriceId,
          quantity: quantity,
        },
      ],
      proration_behavior: prorationBehavior,
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