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
      // Set cancel_at_period_end for the ENTIRE subscription won't work here
      // We need to mark the item for removal at period end
      // Stripe doesn't support cancel_at_period_end per line item, so we use a workaround:
      // We schedule a cancellation by updating the subscription's cancel behavior
      // BUT that affects the whole subscription. Instead, we should update metadata
      // and handle this differently OR use a scheduled update.
      
      // For now, let's use subscription schedules to schedule the removal at period end
      logStep("Scheduling device slot item removal at period end");
      
      // First check if there's already a schedule for this subscription
      const existingSchedules = await stripe.subscriptionSchedules.list({
        customer: customerId,
        limit: 100,
      });
      
      const activeSchedule = existingSchedules.data.find(
        (s: any) => s.subscription === subscriptionId && s.status === "active"
      );
      
      if (activeSchedule) {
        // Update existing schedule to remove the item in the next phase
        logStep("Updating existing subscription schedule", { scheduleId: activeSchedule.id });

          const activeScheduleCurrentPhase = activeSchedule.phases?.[0];
          const currentPhaseItems = (activeScheduleCurrentPhase?.items || []).map((item: any) => ({
            price: typeof item.price === "string" ? item.price : item.price.id,
            quantity: item.quantity,
          }));

          const currentPhaseStart = activeScheduleCurrentPhase?.start_date ?? undefined;
          const currentPhaseEnd =
            activeScheduleCurrentPhase?.end_date ?? subscription.current_period_end ?? undefined;
        
        // Get items for the next phase (excluding this device slot item)
        const nextPhaseItems = subscription.items.data
          .filter((item: any) => item.id !== itemId)
          .map((item: any) => ({
            price: item.price.id,
            quantity: item.quantity,
          }));
        
        await stripe.subscriptionSchedules.update(activeSchedule.id, {
            end_behavior: "release",
          phases: [
            {
                items: currentPhaseItems,
                ...(currentPhaseStart ? { start_date: currentPhaseStart } : {}),
                ...(currentPhaseEnd ? { end_date: currentPhaseEnd } : {}),
            },
            {
              items: nextPhaseItems,
            },
          ],
        });
      } else {
        // Create a schedule from the existing subscription
        logStep("Creating subscription schedule for deferred cancellation");
        
        const schedule = await stripe.subscriptionSchedules.create({
          from_subscription: subscriptionId,
        });
        
        logStep("Schedule created from subscription", { 
          scheduleId: schedule.id, 
          phasesCount: schedule.phases.length,
          currentPhaseStart: schedule.phases[0]?.start_date,
          currentPhaseEnd: schedule.phases[0]?.end_date,
        });
        
        // Get items for the next phase (excluding this device slot item)
        const nextPhaseItems = subscription.items.data
          .filter((item: any) => item.id !== itemId)
          .map((item: any) => ({
            price: item.price.id,
            quantity: item.quantity,
          }));
        
        // When creating from a subscription, the schedule already has the current phase set up
        // We just need to add the next phase with reduced items
        // The current phase keeps the same items, next phase removes the device slot
        const currentPhaseItems = schedule.phases[0].items.map((item: any) => ({
          price: typeof item.price === 'string' ? item.price : item.price.id,
          quantity: item.quantity,
        }));
        
        await stripe.subscriptionSchedules.update(schedule.id, {
          end_behavior: 'release',
          phases: [
            {
              items: currentPhaseItems,
              end_date: subscription.current_period_end,
            },
            {
              items: nextPhaseItems,
            },
          ],
        });
      }

      logStep("Device slot item scheduled for removal at period end");
    } else {
      // Reduce the quantity at period end using subscription schedules
      logStep("Scheduling device slot quantity reduction", { from: currentQuantity, to: newQuantity });
      
      const existingSchedules = await stripe.subscriptionSchedules.list({
        customer: customerId,
        limit: 100,
      });
      
      const activeSchedule = existingSchedules.data.find(
        (s: any) => s.subscription === subscriptionId && s.status === "active"
      );
      
      if (activeSchedule) {
        // Update existing schedule
        const activeScheduleCurrentPhase = activeSchedule.phases?.[0];
        const currentPhaseItems = (activeScheduleCurrentPhase?.items || []).map((item: any) => ({
          price: typeof item.price === "string" ? item.price : item.price.id,
          quantity: item.quantity,
        }));

        const currentPhaseStart = activeScheduleCurrentPhase?.start_date ?? undefined;
        const currentPhaseEnd =
          activeScheduleCurrentPhase?.end_date ?? subscription.current_period_end ?? undefined;

        const nextPhaseItems = subscription.items.data.map((item: any) => ({
          price: item.price.id,
          quantity: item.id === itemId ? newQuantity : item.quantity,
        }));
        
        await stripe.subscriptionSchedules.update(activeSchedule.id, {
          end_behavior: "release",
          phases: [
            {
              items: currentPhaseItems,
              ...(currentPhaseStart ? { start_date: currentPhaseStart } : {}),
              ...(currentPhaseEnd ? { end_date: currentPhaseEnd } : {}),
            },
            {
              items: nextPhaseItems,
            },
          ],
        });
      } else {
        // Create a schedule from the existing subscription
        const schedule = await stripe.subscriptionSchedules.create({
          from_subscription: subscriptionId,
        });
        
        logStep("Schedule created for quantity reduction", { 
          scheduleId: schedule.id, 
          phasesCount: schedule.phases.length,
        });
        
        const nextPhaseItems = subscription.items.data.map((item: any) => ({
          price: item.price.id,
          quantity: item.id === itemId ? newQuantity : item.quantity,
        }));
        
        // Current phase keeps items as-is, next phase reduces quantity
        const currentPhaseItems = schedule.phases[0].items.map((item: any) => ({
          price: typeof item.price === 'string' ? item.price : item.price.id,
          quantity: item.quantity,
        }));
        
        await stripe.subscriptionSchedules.update(schedule.id, {
          end_behavior: 'release',
          phases: [
            {
              items: currentPhaseItems,
              end_date: subscription.current_period_end,
            },
            {
              items: nextPhaseItems,
            },
          ],
        });
      }

      logStep("Device slot quantity reduction scheduled");
    }

    // Note: Don't update the database yet - the slot is still active until period end
    // The webhook will handle updating the device_slots when the subscription actually changes
    logStep("Device slot scheduled for removal - will be updated at period end");

    // Send cancellation confirmation email (don't await to speed up response)
    EdgeRuntime.waitUntil(
      sendCancellationEmail(
        user.email,
        profile?.full_name || null,
        quantityToRemove,
        period,
        endDate,
        false // Scheduled for period end, not immediate
      )
    );

    return new Response(JSON.stringify({ 
      success: true,
      message: `${quantityToRemove} device(s) will be removed at the end of your billing period on ${endDate.toLocaleDateString()}.`,
      scheduledForRemoval: true,
      removalDate: endDate.toISOString(),
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
