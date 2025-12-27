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

    // Fetch open invoices (pending payment)
    const openInvoices = await stripe.invoices.list({
      customer: customerId,
      status: "open",
      limit: 10,
    });

    // If an open invoice is for a device slot subscription that is already canceled/unpaid, void it and hide it.
    const filteredOpenInvoices: any[] = [];
    for (const inv of openInvoices.data) {
      const isDeviceSlot =
        inv.metadata?.type === "device_slot" ||
        inv.lines?.data?.some((line: any) => line.metadata?.type === "device_slot");

      if (isDeviceSlot && inv.subscription) {
        try {
          const sub = await stripe.subscriptions.retrieve(inv.subscription as string);
          if (sub.status === "canceled") {
            await stripe.invoices.voidInvoice(inv.id);
            continue;
          }
        } catch (_e) {
          // If we can't verify, still show it (safer than hiding money owed)
        }
      }

      filteredOpenInvoices.push(inv);
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