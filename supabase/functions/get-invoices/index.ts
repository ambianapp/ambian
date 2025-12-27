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

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2025-08-27.basil",
    });

    // Find customer by email
    const customers = await stripe.customers.list({ email: user.email, limit: 1 });
    if (customers.data.length === 0) {
      return new Response(JSON.stringify({ invoices: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    const customerId = customers.data[0].id;

    // Device slot price IDs
    const DEVICE_SLOT_PRICE_IDS = [
      "price_1SfhoMJrU52a7SNLpLI3yoEl", // monthly
      "price_1Sj2PMJrU52a7SNLzhpFYfJd", // yearly
    ];

    // Fetch open invoices (pending payment)
    const openInvoices = await stripe.invoices.list({
      customer: customerId,
      status: "open",
      limit: 10,
    });

    // Fetch draft invoices too (they might also be orphaned)
    const draftInvoices = await stripe.invoices.list({
      customer: customerId,
      status: "draft",
      limit: 10,
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
            console.log(`[GET-INVOICES] Found invoice for canceled subscription, cleaning up`, { 
              invoiceId: inv.id, 
              status: inv.status,
              subscriptionId: sub.id,
              isDeviceSlot 
            });
            
            if (inv.status === "open") {
              await stripe.invoices.voidInvoice(inv.id);
              console.log(`[GET-INVOICES] Voided invoice ${inv.id}`);
            } else if (inv.status === "draft") {
              await stripe.invoices.del(inv.id);
              console.log(`[GET-INVOICES] Deleted draft invoice ${inv.id}`);
            }
            continue; // Don't include in results
          }
          
          // For device slot subscriptions with open/draft invoices but active subscription,
          // still show them (user needs to pay)
        } catch (e) {
          console.log(`[GET-INVOICES] Error checking subscription for invoice ${inv.id}:`, e);
          // If subscription doesn't exist anymore, void/delete the invoice
          try {
            if (inv.status === "open") {
              await stripe.invoices.voidInvoice(inv.id);
              console.log(`[GET-INVOICES] Voided orphaned invoice ${inv.id}`);
            } else if (inv.status === "draft") {
              await stripe.invoices.del(inv.id);
              console.log(`[GET-INVOICES] Deleted orphaned draft invoice ${inv.id}`);
            }
          } catch (cleanupError) {
            console.log(`[GET-INVOICES] Failed to cleanup invoice ${inv.id}:`, cleanupError);
          }
          continue; // Don't include in results
        }
      }

      // Only include open invoices in the UI (not draft)
      if (inv.status === "open") {
        filteredOpenInvoices.push(inv);
      }
    }

    // Fetch paid invoices
    const paidInvoices = await stripe.invoices.list({
      customer: customerId,
      status: "paid",
      limit: 20,
    });

    // Combine and format - open invoices first
    const allInvoices = [...filteredOpenInvoices, ...paidInvoices.data];

    const formattedInvoices = allInvoices.map((invoice: any) => ({
      id: invoice.id,
      number: invoice.number,
      amount: invoice.status === "paid" ? invoice.amount_paid : invoice.amount_due,
      currency: invoice.currency,
      date: invoice.created,
      status: invoice.status,
      dueDate: invoice.due_date,
      pdfUrl: invoice.invoice_pdf,
      hostedUrl: invoice.hosted_invoice_url,
    }));

    return new Response(JSON.stringify({ invoices: formattedInvoices }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});