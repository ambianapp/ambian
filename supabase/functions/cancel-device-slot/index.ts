import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { Resend } from "https://esm.sh/resend@2.0.0";

// Declare EdgeRuntime for background tasks
declare const EdgeRuntime: {
  waitUntil: (promise: Promise<any>) => void;
};

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
  console.log(`[CANCEL-DEVICE-SLOT] ${step}${detailsStr}`);
};

// Device slot price IDs
const DEVICE_SLOT_PRICES = [
  "price_1SfhoMJrU52a7SNLpLI3yoEl", // monthly €5
  "price_1Sj2PMJrU52a7SNLzhpFYfJd", // yearly €50
];

async function sendCancellationEmail(
  email: string,
  fullName: string | null,
  quantity: number,
  period: string,
  endDate: Date,
  cancelImmediately: boolean
) {
  try {
    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (!resendKey) {
      logStep("RESEND_API_KEY not set, skipping email");
      return;
    }

    const resend = new Resend(resendKey);
    const name = fullName || email.split("@")[0];
    const formattedDate = endDate.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    const locationText = quantity === 1 ? "location" : "locations";
    const periodText = period === "yearly" ? "yearly" : "monthly";

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="text-align: center; margin-bottom: 30px;">
    <img src="https://ambianmusic.com/ambian-logo.png" alt="Ambian" style="height: 40px;">
  </div>
  
  <h1 style="color: #1a1a1a; font-size: 24px; margin-bottom: 20px;">Location Subscription Cancelled</h1>
  
  <p>Hi ${name},</p>
  
  <p>This email confirms that your additional ${locationText} subscription has been cancelled.</p>
  
  <div style="background-color: #f5f5f5; border-radius: 8px; padding: 20px; margin: 20px 0;">
    <p style="margin: 0 0 10px 0;"><strong>Cancelled:</strong> ${quantity} additional ${locationText} (${periodText})</p>
    ${cancelImmediately 
      ? `<p style="margin: 0; color: #dc2626;"><strong>Status:</strong> Cancelled immediately</p>`
      : `<p style="margin: 0;"><strong>Access until:</strong> ${formattedDate}</p>`
    }
  </div>
  
  ${!cancelImmediately 
    ? `<p>Your additional ${locationText} will remain active until ${formattedDate}. After this date, the ${locationText} will be removed from your account.</p>`
    : `<p>Your additional ${locationText} have been removed from your account.</p>`
  }
  
  <p>If you have any questions or if this was a mistake, please contact us at <a href="mailto:support@ambian.fi" style="color: #6366f1;">support@ambian.fi</a>.</p>
  
  <p style="margin-top: 30px;">
    Best regards,<br>
    The Ambian Team
  </p>
  
  <hr style="border: none; border-top: 1px solid #e5e5e5; margin: 30px 0;">
  
  <p style="font-size: 12px; color: #666;">
    This email was sent by Ambian Music. If you need help, contact us at support@ambian.fi.
  </p>
</body>
</html>
    `;

    const { error } = await resend.emails.send({
      from: "Ambian <noreply@ambianmusic.com>",
      to: [email],
      subject: `Location Subscription Cancelled - Ambian`,
      html,
    });

    if (error) {
      logStep("Failed to send cancellation email", { error: error.message });
    } else {
      logStep("Cancellation email sent successfully", { email });
    }
  } catch (error) {
    logStep("Error sending cancellation email", { error: String(error) });
  }
}

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

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError) throw new Error(`Auth error: ${userError.message}`);
    const user = userData.user;
    if (!user?.email) throw new Error("User not authenticated");
    logStep("User authenticated", { userId: user.id, email: user.email });

    // Get subscription ID from request body
    const body = await req.json();
    const { subscriptionId, cancelImmediately } = body;
    if (!subscriptionId) throw new Error("Subscription ID required");
    logStep("Request parsed", { subscriptionId, cancelImmediately });

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not set");

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    // Find customer and verify ownership
    const customers = await stripe.customers.list({ email: user.email, limit: 1 });
    if (customers.data.length === 0) {
      throw new Error("No customer found");
    }
    const customerId = customers.data[0].id;
    logStep("Customer found", { customerId });

    // Get the subscription and verify it belongs to this customer
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    if (subscription.customer !== customerId) {
      throw new Error("Subscription does not belong to this user");
    }

    // Verify it's a device slot subscription
    const priceId = subscription.items.data[0]?.price.id;
    if (!DEVICE_SLOT_PRICES.includes(priceId)) {
      throw new Error("This is not a device slot subscription");
    }

    const quantity = subscription.items.data[0]?.quantity || 1;
    const period = priceId === "price_1Sj2PMJrU52a7SNLzhpFYfJd" ? "yearly" : "monthly";
    const endDate = new Date(subscription.current_period_end * 1000);

    logStep("Subscription verified", { subscriptionId, priceId, quantity, period });

    // Check if this subscription has unpaid invoices (invoice-based subscription not yet paid)
    let hasUnpaidInvoice = false;
    let shouldCancelImmediately = cancelImmediately;
    
    // Check if subscription is invoice-based and has unpaid invoices
    if (subscription.collection_method === "send_invoice") {
      logStep("Invoice-based subscription detected, checking for unpaid invoices");
      
      // Get recent invoices for this subscription
      const invoices = await stripe.invoices.list({
        subscription: subscriptionId,
        limit: 10,
      });

      const unpaidInvoices = invoices.data.filter((inv: any) => inv.status === "open" || inv.status === "draft");

      if (unpaidInvoices.length > 0) {
        hasUnpaidInvoice = true;
        shouldCancelImmediately = true;
        logStep("Found unpaid invoices, will cancel immediately", {
          invoices: unpaidInvoices.map((inv: any) => ({ id: inv.id, status: inv.status })),
        });

        for (const inv of unpaidInvoices) {
          // Void open invoices; delete draft invoices
          if (inv.status === "open") {
            await stripe.invoices.voidInvoice(inv.id);
            logStep("Voided unpaid invoice", { invoiceId: inv.id });
          } else if (inv.status === "draft") {
            await stripe.invoices.del(inv.id);
            logStep("Deleted draft invoice", { invoiceId: inv.id });
          }
        }
      }
    }

    // Get user's full name from profile
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );
    const { data: profile } = await adminClient
      .from("profiles")
      .select("full_name")
      .eq("user_id", user.id)
      .single();

    if (shouldCancelImmediately) {
      // Cancel immediately (either requested or unpaid invoice)
      await stripe.subscriptions.cancel(subscriptionId);
      logStep("Subscription cancelled immediately", { hasUnpaidInvoice });
    } else {
      // Cancel at end of billing period
      await stripe.subscriptions.update(subscriptionId, {
        cancel_at_period_end: true,
      });
      logStep("Subscription set to cancel at period end");
    }

    // Send cancellation confirmation email (don't await to speed up response)
    EdgeRuntime.waitUntil(
      sendCancellationEmail(
        user.email,
        profile?.full_name || null,
        quantity,
        period,
        endDate,
        cancelImmediately || false
      )
    );

    return new Response(JSON.stringify({ success: true }), {
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
