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
  
  <h1 style="color: #1a1a1a; font-size: 24px; margin-bottom: 20px;">Additional Locations Removed</h1>
  
  <p>Hi ${name},</p>
  
  <p>This email confirms that ${quantity} additional ${locationText} have been removed from your subscription.</p>
  
  <div style="background-color: #f5f5f5; border-radius: 8px; padding: 20px; margin: 20px 0;">
    <p style="margin: 0 0 10px 0;"><strong>Removed:</strong> ${quantity} additional ${locationText}</p>
    ${cancelImmediately 
      ? `<p style="margin: 0; color: #dc2626;"><strong>Status:</strong> Removed immediately</p>`
      : `<p style="margin: 0;"><strong>Access until:</strong> ${formattedDate}</p>`
    }
  </div>
  
  <p>Your subscription will be adjusted accordingly on your next billing date. A prorated credit will be applied to your account.</p>
  
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
      subject: `Additional Locations Removed - Ambian`,
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

    // Get item ID and subscription ID from request body
    const body = await req.json();
    const { itemId, subscriptionId, quantityToRemove = 1 } = body;
    
    if (!itemId || !subscriptionId) {
      throw new Error("Item ID and Subscription ID required");
    }
    logStep("Request parsed", { itemId, subscriptionId, quantityToRemove });

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

    // Find the device slot item
    const deviceSlotItem = subscription.items.data.find((item: any) => item.id === itemId);
    if (!deviceSlotItem) {
      throw new Error("Device slot item not found on subscription");
    }

    // Verify it's a device slot price
    if (!DEVICE_SLOT_PRICES.includes(deviceSlotItem.price.id)) {
      throw new Error("This is not a device slot item");
    }

    const currentQuantity = deviceSlotItem.quantity || 1;
    const period = deviceSlotItem.price.recurring?.interval === "year" ? "yearly" : "monthly";
    const endDate = new Date((deviceSlotItem as any).current_period_end * 1000);

    logStep("Device slot item found", { itemId, currentQuantity, period });

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

    const newQuantity = currentQuantity - quantityToRemove;

    if (newQuantity <= 0) {
      // Remove the item entirely from the subscription
      logStep("Removing device slot item entirely");
      
      await stripe.subscriptions.update(subscriptionId, {
        items: [{
          id: itemId,
          deleted: true,
        }],
        proration_behavior: "create_prorations",
      });

      logStep("Device slot item removed from subscription");
    } else {
      // Reduce the quantity
      logStep("Reducing device slot quantity", { from: currentQuantity, to: newQuantity });
      
      await stripe.subscriptions.update(subscriptionId, {
        items: [{
          id: itemId,
          quantity: newQuantity,
        }],
        proration_behavior: "create_prorations",
      });

      logStep("Device slot quantity reduced");
    }

    // Update local database
    const remainingSlots = newQuantity > 0 ? newQuantity : 0;
    await adminClient
      .from("subscriptions")
      .update({ 
        device_slots: 1 + remainingSlots, // 1 base + remaining additional
        updated_at: new Date().toISOString() 
      })
      .eq("user_id", user.id);

    // Send cancellation confirmation email (don't await to speed up response)
    EdgeRuntime.waitUntil(
      sendCancellationEmail(
        user.email,
        profile?.full_name || null,
        quantityToRemove,
        period,
        endDate,
        true // Prorated removal is immediate
      )
    );

    return new Response(JSON.stringify({ 
      success: true,
      message: `Removed ${quantityToRemove} location(s). A prorated credit will be applied to your account.`,
      remainingSlots: remainingSlots,
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
