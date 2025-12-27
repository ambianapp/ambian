import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { Resend } from "https://esm.sh/resend@2.0.0";

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[STRIPE-WEBHOOK] ${step}${detailsStr}`);
};

async function sendUpcomingPaymentEmail(
  email: string,
  customerName: string | null,
  amount: number,
  currency: string,
  dueDate: Date,
  planType: string
) {
  const resend = new Resend(Deno.env.get("RESEND_API_KEY"));
  
  const formattedAmount = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format(amount / 100);
  
  const formattedDueDate = dueDate.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="text-align: center; margin-bottom: 30px;">
        <h1 style="color: #1a1a1a; margin: 0;">Ambian</h1>
      </div>
      
      <div style="background: #f9fafb; border-radius: 12px; padding: 30px; margin-bottom: 20px;">
        <h2 style="color: #1a1a1a; margin-top: 0;">Upcoming Payment Reminder</h2>
        <p>Hi${customerName ? ` ${customerName}` : ''},</p>
        <p>This is a friendly reminder that your Ambian subscription renewal is coming up.</p>
        
        <div style="background: white; border-radius: 8px; padding: 20px; margin: 20px 0; border: 1px solid #e5e7eb;">
          <p style="margin: 0 0 10px 0;"><strong>Plan:</strong> ${planType === 'yearly' ? 'Yearly' : 'Monthly'} Subscription</p>
          <p style="margin: 0 0 10px 0;"><strong>Amount:</strong> ${formattedAmount}</p>
          <p style="margin: 0;"><strong>Due by:</strong> ${formattedDueDate}</p>
        </div>
        
        <p>If you're paying by bank transfer (IBAN), please ensure payment is made before the due date to avoid any interruption to your service.</p>
        
        <p>You can view your invoice and payment details in your profile at <a href="https://ambianmusic.com/profile" style="color: #4f46e5;">ambianmusic.com/profile</a>.</p>
      </div>
      
      <div style="text-align: center; color: #6b7280; font-size: 14px;">
        <p>If you have any questions, please contact us at support@ambianmusic.com</p>
        <p style="margin-top: 20px;">&copy; ${new Date().getFullYear()} Ambian. All rights reserved.</p>
      </div>
    </body>
    </html>
  `;

  try {
    const { data, error } = await resend.emails.send({
      from: "Ambian <noreply@ambianmusic.com>",
      to: [email],
      subject: `Payment Reminder: Your Ambian subscription renews soon (${formattedAmount})`,
      html,
    });

    if (error) {
      logStep("Error sending upcoming payment email", { error });
      return false;
    }

    logStep("Upcoming payment email sent", { emailId: data?.id, to: email });
    return true;
  } catch (error) {
    logStep("Failed to send upcoming payment email", { error: String(error) });
    return false;
  }
}

async function sendPaymentFailedEmail(
  email: string,
  customerName: string | null,
  amount: number,
  currency: string,
  planType: string
) {
  const resend = new Resend(Deno.env.get("RESEND_API_KEY"));
  
  const formattedAmount = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format(amount / 100);

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="margin: 0; padding: 0; background-color: #0a0a0a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #0a0a0a; padding: 40px 20px;">
        <tr>
          <td align="center">
            <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); border-radius: 16px; overflow: hidden;">
              <!-- Header -->
              <tr>
                <td style="padding: 40px 40px 20px; text-align: center;">
                  <img src="https://ambian.app/ambian-logo.png" alt="Ambian" width="120" style="display: block; margin: 0 auto 20px;" />
                  <h1 style="color: #ffffff; font-size: 28px; font-weight: 600; margin: 0;">
                    ⚠️ Payment Failed
                  </h1>
                </td>
              </tr>
              
              <!-- Content -->
              <tr>
                <td style="padding: 20px 40px;">
                  <p style="color: #e0e0e0; font-size: 16px; line-height: 1.6; margin: 0 0 20px;">
                    Hi${customerName ? ` ${customerName}` : ''},
                  </p>
                  <p style="color: #e0e0e0; font-size: 16px; line-height: 1.6; margin: 0 0 20px;">
                    We were unable to process your payment of <strong style="color: #ffffff;">${formattedAmount}</strong> for your ${planType === 'yearly' ? 'yearly' : 'monthly'} Ambian subscription.
                  </p>
                  
                  <!-- Warning Box -->
                  <div style="background: rgba(239, 68, 68, 0.1); border-radius: 12px; padding: 24px; margin: 20px 0; border: 1px solid rgba(239, 68, 68, 0.3);">
                    <p style="color: #fca5a5; font-size: 14px; margin: 0;">
                      <strong>Action required:</strong> Please update your payment method to avoid interruption to your service.
                    </p>
                  </div>
                  
                  <p style="color: #e0e0e0; font-size: 16px; line-height: 1.6; margin: 0 0 20px;">
                    This could be due to:
                  </p>
                  <ul style="color: #e0e0e0; font-size: 14px; line-height: 1.8; margin: 0 0 20px; padding-left: 20px;">
                    <li>Insufficient funds</li>
                    <li>Expired card</li>
                    <li>Card declined by your bank</li>
                  </ul>
                  
                  <!-- CTA Button -->
                  <table width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                      <td align="center" style="padding: 20px 0 30px;">
                        <a href="https://ambian.app/profile" style="display: inline-block; background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); color: #ffffff; text-decoration: none; padding: 16px 40px; border-radius: 8px; font-size: 16px; font-weight: 600;">
                          Update Payment Method
                        </a>
                      </td>
                    </tr>
                  </table>
                  
                  <p style="color: #888888; font-size: 14px; line-height: 1.6; margin: 0;">
                    If you believe this is an error, please contact your bank or reach out to us for assistance.
                  </p>
                </td>
              </tr>
              
              <!-- Footer -->
              <tr>
                <td style="padding: 20px 40px 40px; text-align: center; border-top: 1px solid rgba(255,255,255,0.1);">
                  <p style="color: #888888; font-size: 14px; margin: 0;">
                    Questions? Visit our <a href="https://ambian.app/help" style="color: #8b5cf6; text-decoration: none;">Help Center</a> or reply to this email.
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;

  try {
    const { data, error } = await resend.emails.send({
      from: "Ambian <noreply@ambian.app>",
      to: [email],
      subject: "Action Required: Your Ambian payment failed",
      html,
    });

    if (error) {
      logStep("Error sending payment failed email", { error });
      return false;
    }

    logStep("Payment failed email sent", { emailId: data?.id, to: email });
    return true;
  } catch (error) {
    logStep("Failed to send payment failed email", { error: String(error) });
    return false;
  }
}

async function sendSubscriptionConfirmationEmail(
  email: string,
  customerName: string | null,
  planType: string,
  periodEnd: Date
) {
  const resend = new Resend(Deno.env.get("RESEND_API_KEY"));
  
  const formattedPeriodEnd = periodEnd.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="margin: 0; padding: 0; background-color: #0a0a0a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #0a0a0a; padding: 40px 20px;">
        <tr>
          <td align="center">
            <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); border-radius: 16px; overflow: hidden;">
              <!-- Header -->
              <tr>
                <td style="padding: 40px 40px 20px; text-align: center;">
                  <img src="https://ambian.app/ambian-logo.png" alt="Ambian" width="120" style="display: block; margin: 0 auto 20px;" />
                  <h1 style="color: #ffffff; font-size: 28px; font-weight: 600; margin: 0;">
                    🎉 Welcome to Ambian!
                  </h1>
                </td>
              </tr>
              
              <!-- Content -->
              <tr>
                <td style="padding: 20px 40px;">
                  <p style="color: #e0e0e0; font-size: 16px; line-height: 1.6; margin: 0 0 20px;">
                    Hi${customerName ? ` ${customerName}` : ''},
                  </p>
                  <p style="color: #e0e0e0; font-size: 16px; line-height: 1.6; margin: 0 0 20px;">
                    Thank you for subscribing to Ambian! Your subscription is now active and you have full access to our entire music library.
                  </p>
                  
                  <!-- Subscription Details -->
                  <div style="background: rgba(255,255,255,0.05); border-radius: 12px; padding: 24px; margin: 20px 0; border: 1px solid rgba(255,255,255,0.1);">
                    <h3 style="color: #10b981; font-size: 16px; margin: 0 0 16px;">✓ Subscription Active</h3>
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="padding: 8px 0;">
                          <span style="color: #888888; font-size: 14px;">Plan:</span>
                          <span style="color: #ffffff; font-size: 14px; margin-left: 12px; font-weight: 500;">${planType === 'yearly' ? 'Yearly' : 'Monthly'} Subscription</span>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 8px 0;">
                          <span style="color: #888888; font-size: 14px;">Access until:</span>
                          <span style="color: #ffffff; font-size: 14px; margin-left: 12px; font-weight: 500;">${formattedPeriodEnd}</span>
                        </td>
                      </tr>
                    </table>
                  </div>
                  
                  <!-- CTA Button -->
                  <table width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                      <td align="center" style="padding: 20px 0 30px;">
                        <a href="https://ambian.app" style="display: inline-block; background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); color: #ffffff; text-decoration: none; padding: 16px 40px; border-radius: 8px; font-size: 16px; font-weight: 600;">
                          Start Listening
                        </a>
                      </td>
                    </tr>
                  </table>
                  
                  <!-- What's included -->
                  <div style="background: rgba(255,255,255,0.05); border-radius: 12px; padding: 24px; margin-bottom: 20px;">
                    <h3 style="color: #ffffff; font-size: 16px; margin: 0 0 16px;">What's included:</h3>
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="padding: 8px 0;">
                          <span style="color: #10b981; font-size: 16px;">✓</span>
                          <span style="color: #e0e0e0; font-size: 14px; margin-left: 12px;">Unlimited access to all playlists</span>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 8px 0;">
                          <span style="color: #10b981; font-size: 16px;">✓</span>
                          <span style="color: #e0e0e0; font-size: 14px; margin-left: 12px;">Commercial licensing for your business</span>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 8px 0;">
                          <span style="color: #10b981; font-size: 16px;">✓</span>
                          <span style="color: #e0e0e0; font-size: 14px; margin-left: 12px;">Schedule playlists for different times</span>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 8px 0;">
                          <span style="color: #10b981; font-size: 16px;">✓</span>
                          <span style="color: #e0e0e0; font-size: 14px; margin-left: 12px;">Priority support</span>
                        </td>
                      </tr>
                    </table>
                  </div>
                </td>
              </tr>
              
              <!-- Footer -->
              <tr>
                <td style="padding: 20px 40px 40px; text-align: center; border-top: 1px solid rgba(255,255,255,0.1);">
                  <p style="color: #888888; font-size: 14px; margin: 0 0 10px;">
                    Manage your subscription anytime at <a href="https://ambian.app/profile" style="color: #8b5cf6; text-decoration: none;">ambian.app/profile</a>
                  </p>
                  <p style="color: #888888; font-size: 14px; margin: 0;">
                    Questions? Visit our <a href="https://ambian.app/help" style="color: #8b5cf6; text-decoration: none;">Help Center</a>
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;

  try {
    const { data, error } = await resend.emails.send({
      from: "Ambian <noreply@ambian.app>",
      to: [email],
      subject: "Welcome to Ambian! Your subscription is now active 🎉",
      html,
    });

    if (error) {
      logStep("Error sending subscription confirmation email", { error });
      return false;
    }

    logStep("Subscription confirmation email sent", { emailId: data?.id, to: email });
    return true;
  } catch (error) {
    logStep("Failed to send subscription confirmation email", { error: String(error) });
    return false;
  }
}

async function sendPaymentConfirmationEmail(
  email: string,
  customerName: string | null,
  amount: number,
  currency: string,
  planType: string,
  periodEnd: Date,
  invoiceNumber: string | null
) {
  const resend = new Resend(Deno.env.get("RESEND_API_KEY"));
  
  const formattedAmount = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format(amount / 100);
  
  const formattedPeriodEnd = periodEnd.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="text-align: center; margin-bottom: 30px;">
        <h1 style="color: #1a1a1a; margin: 0;">Ambian</h1>
      </div>
      
      <div style="background: #f0fdf4; border-radius: 12px; padding: 30px; margin-bottom: 20px; border: 1px solid #86efac;">
        <h2 style="color: #166534; margin-top: 0;">✓ Payment Confirmed</h2>
        <p>Hi${customerName ? ` ${customerName}` : ''},</p>
        <p>Thank you for your payment! Your Ambian subscription is now active.</p>
        
        <div style="background: white; border-radius: 8px; padding: 20px; margin: 20px 0; border: 1px solid #e5e7eb;">
          ${invoiceNumber ? `<p style="margin: 0 0 10px 0;"><strong>Invoice:</strong> ${invoiceNumber}</p>` : ''}
          <p style="margin: 0 0 10px 0;"><strong>Plan:</strong> ${planType === 'yearly' ? 'Yearly' : 'Monthly'} Subscription</p>
          <p style="margin: 0 0 10px 0;"><strong>Amount paid:</strong> ${formattedAmount}</p>
          <p style="margin: 0;"><strong>Access until:</strong> ${formattedPeriodEnd}</p>
        </div>
        
        <p>You can start enjoying unlimited background music for your business right away!</p>
        
        <div style="text-align: center; margin: 30px 0;">
          <a href="https://ambian.app" style="background: #166534; color: white; padding: 12px 30px; border-radius: 8px; text-decoration: none; font-weight: 500;">Open Ambian</a>
        </div>
      </div>
      
      <div style="text-align: center; color: #6b7280; font-size: 14px;">
        <p>You can manage your subscription anytime at <a href="https://ambian.app/profile" style="color: #4f46e5;">ambian.app/profile</a></p>
        <p style="margin-top: 20px;">&copy; ${new Date().getFullYear()} Ambian. All rights reserved.</p>
      </div>
    </body>
    </html>
  `;

  try {
    const { data, error } = await resend.emails.send({
      from: "Ambian <noreply@ambian.app>",
      to: [email],
      subject: `Payment Confirmed - Your Ambian subscription is active`,
      html,
    });

    if (error) {
      logStep("Error sending payment confirmation email", { error });
      return false;
    }

    logStep("Payment confirmation email sent", { emailId: data?.id, to: email });
    return true;
  } catch (error) {
    logStep("Failed to send payment confirmation email", { error: String(error) });
    return false;
  }
}

async function sendPaymentConfirmationEmailForInvoice(
  stripe: Stripe,
  invoice: Stripe.Invoice,
  customerEmail: string,
  isFirstSubscription: boolean = false
) {
  // Get customer name
  const customerId = typeof invoice.customer === 'string' ? invoice.customer : (invoice.customer as any)?.id;
  let customerName: string | null = null;
  
  if (customerId) {
    try {
      const customer = await stripe.customers.retrieve(customerId);
      customerName = (customer as any).name;
    } catch (e) {
      logStep("Could not retrieve customer name", { error: String(e) });
    }
  }

  // Determine plan type and period end
  let planType = "monthly";
  let periodEnd = new Date();
  
  if (invoice.subscription) {
    try {
      const subscription = await stripe.subscriptions.retrieve(invoice.subscription as string);
      planType = subscription.items?.data?.[0]?.price?.recurring?.interval === 'year' ? 'yearly' : 'monthly';
      periodEnd = new Date((subscription as any).current_period_end * 1000);
    } catch (e) {
      logStep("Could not retrieve subscription details", { error: String(e) });
      // Fallback: calculate from invoice
      if (planType === 'yearly') {
        periodEnd.setFullYear(periodEnd.getFullYear() + 1);
      } else {
        periodEnd.setMonth(periodEnd.getMonth() + 1);
      }
    }
  } else {
    // For one-time invoices, check line items for interval
    const lineItems = invoice.lines?.data || [];
    for (const item of lineItems) {
      if (item.price?.recurring?.interval === 'year') {
        planType = 'yearly';
        periodEnd.setFullYear(periodEnd.getFullYear() + 1);
        break;
      }
    }
    if (planType === 'monthly') {
      periodEnd.setMonth(periodEnd.getMonth() + 1);
    }
  }

  // For first subscription, send welcome email instead of just payment confirmation
  if (isFirstSubscription) {
    logStep("Sending welcome email for first subscription", { email: customerEmail, planType });
    await sendSubscriptionConfirmationEmail(
      customerEmail,
      customerName,
      planType,
      periodEnd
    );
  } else {
    await sendPaymentConfirmationEmail(
      customerEmail,
      customerName,
      invoice.amount_paid || 0,
      invoice.currency || 'eur',
      planType,
      periodEnd,
      invoice.number
    );
  }
}

const DEVICE_SLOT_PRODUCT_ID = "prod_TcxjtTopFvWHDs";

async function syncDeviceSlotsForUser(
  supabase: any,
  userId: string,
  stripe: Stripe,
  customerId: string
) {
  logStep("Syncing device slots for user", { userId, customerId });

  // Count active device slot subscriptions
  const subscriptions = await stripe.subscriptions.list({
    customer: customerId,
    status: "active",
  });

  let deviceSlotCount = 1; // Base slot
  for (const sub of subscriptions.data) {
    for (const item of sub.items.data) {
      const productId = typeof item.price.product === 'string' 
        ? item.price.product 
        : (item.price.product as any).id;
      
      if (productId === DEVICE_SLOT_PRODUCT_ID) {
        deviceSlotCount += item.quantity || 1;
        logStep("Found device slot subscription", { subscriptionId: sub.id, quantity: item.quantity });
      }
    }
  }

  logStep("Total device slots calculated", { deviceSlotCount });

  // Update local database
  const { error } = await supabase
    .from("subscriptions")
    .update({ device_slots: deviceSlotCount, updated_at: new Date().toISOString() })
    .eq("user_id", userId);

  if (error) {
    logStep("Error updating device slots", { error: error.message });
  } else {
    logStep("Device slots updated in database", { userId, deviceSlotCount });
  }
}

serve(async (req) => {
  // Webhooks are server-to-server, no CORS needed
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 405 }); // Method Not Allowed
  }

  try {
    logStep("Webhook received");

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2025-08-27.basil",
    });

    const signature = req.headers.get("stripe-signature");
    if (!signature) {
      logStep("ERROR: No signature");
      return new Response(null, { status: 400 });
    }

    const body = await req.text();
    const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
    
    if (!webhookSecret) {
      logStep("ERROR: No webhook secret configured");
      return new Response(null, { status: 500 });
    }

    let event: Stripe.Event;
    try {
      event = await stripe.webhooks.constructEventAsync(body, signature, webhookSecret);
    } catch (err: any) {
      logStep("ERROR: Signature verification failed", { error: err.message });
      return new Response(null, { status: 400 });
    }

    logStep("Event verified", { type: event.type });

    // Create admin Supabase client
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    // Handle invoice.upcoming - sent ~3 days before renewal for send_invoice subscriptions
    // This is our cue to extend access grace period for IBAN payers and send reminder email
    if (event.type === "invoice.upcoming") {
      const invoice = event.data.object as Stripe.Invoice;
      logStep("Upcoming invoice", { customerId: invoice.customer, subscriptionId: invoice.subscription });
      
      // Get user from subscription metadata
      if (invoice.subscription) {
        const subscription = await stripe.subscriptions.retrieve(invoice.subscription as string);
        const userId = subscription.metadata?.user_id;
        
        if (userId) {
          // Extend grace period by 14 days from now to cover IBAN payment time
          const gracePeriodEnd = new Date();
          gracePeriodEnd.setDate(gracePeriodEnd.getDate() + 14);
          
          await supabaseAdmin
            .from("subscriptions")
            .update({
              status: "pending_payment",
              current_period_end: gracePeriodEnd.toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq("user_id", userId);
          
          logStep("Extended grace period for upcoming renewal", { userId, until: gracePeriodEnd.toISOString() });

          // Get customer details for email
          const customerId = typeof invoice.customer === 'string' ? invoice.customer : (invoice.customer as any)?.id;
          if (customerId) {
            const customer = await stripe.customers.retrieve(customerId);
            const customerEmail = (customer as any).email;
            const customerName = (customer as any).name;
            
            if (customerEmail) {
              // Calculate invoice amount and due date
              const amount = invoice.amount_due || 0;
              const currency = invoice.currency || 'eur';
              const planType = subscription.items?.data?.[0]?.price?.recurring?.interval === 'year' ? 'yearly' : 'monthly';
              
              // Due date is the grace period end
              await sendUpcomingPaymentEmail(
                customerEmail,
                customerName,
                amount,
                currency,
                gracePeriodEnd,
                planType
              );
            }
          }
        }
      }
    }

    // Handle invoice events
    if (event.type === "invoice.paid") {
      const invoice = event.data.object as Stripe.Invoice;
      logStep("Invoice paid", { invoiceId: invoice.id, customerId: invoice.customer });

      // Check if this is a device slot payment
      const isDeviceSlot = invoice.metadata?.type === "device_slot" || 
        invoice.lines?.data?.some((line: any) => line.metadata?.type === "device_slot");

      if (isDeviceSlot) {
        logStep("Device slot payment detected");
        // Handle device slot - sync device slots for this user
        const userId = invoice.metadata?.user_id;
        if (userId) {
          await syncDeviceSlotsForUser(supabaseAdmin, userId, stripe, invoice.customer as string);
          logStep("Device slots synced after payment", { userId });
        }
        return new Response(JSON.stringify({ received: true }), {
          headers: { "Content-Type": "application/json" },
          status: 200,
        });
      }

      // Get user_id from invoice metadata
      const userId = invoice.metadata?.user_id;
      
      // Helper function to check if this is a first subscription and send appropriate email
      const handleSubscriptionEmail = async (targetUserId: string, customerEmail: string) => {
        // Check if user already has an active subscription record (to determine if this is their first)
        const { data: existingSub } = await supabaseAdmin
          .from("subscriptions")
          .select("id, status")
          .eq("user_id", targetUserId)
          .maybeSingle();
        
        // It's a first subscription if no record exists OR if the existing record is in trial/trialing status
        const isFirstSubscription = !existingSub || existingSub.status === 'trialing';
        const isRenewal = invoice.metadata?.renewal === "true";
        
        // Send welcome email for first subscription, payment confirmation for renewals
        logStep("Determining email type", { 
          isFirstSubscription, 
          isRenewal, 
          existingStatus: existingSub?.status 
        });
        
        // Don't send welcome email for renewals
        await sendPaymentConfirmationEmailForInvoice(
          stripe, 
          invoice, 
          customerEmail, 
          isFirstSubscription && !isRenewal
        );
      };
      
      if (!userId) {
        // Try to find user by customer email
        const customerEmail = typeof invoice.customer_email === 'string' ? invoice.customer_email : null;
        if (!customerEmail) {
          logStep("No user_id or customer_email found");
          return new Response(JSON.stringify({ received: true }), {
            headers: { "Content-Type": "application/json" },
            status: 200,
          });
        }

        // Find profile by email
        const { data: profile } = await supabaseAdmin
          .from("profiles")
          .select("user_id")
          .eq("email", customerEmail)
          .single();

        if (!profile) {
          logStep("No user found for email", { email: customerEmail });
          return new Response(JSON.stringify({ received: true }), {
            headers: { "Content-Type": "application/json" },
            status: 200,
          });
        }

        // Check for first subscription BEFORE updating
        await handleSubscriptionEmail(profile.user_id, customerEmail);
        await updateSubscriptionFromInvoice(supabaseAdmin, profile.user_id, invoice, stripe);
      } else {
        // Get customer email first for the email
        const customerId = typeof invoice.customer === 'string' ? invoice.customer : (invoice.customer as any)?.id;
        let customerEmail: string | null = null;
        
        if (customerId) {
          const customer = await stripe.customers.retrieve(customerId);
          customerEmail = (customer as any).email;
        }
        
        // Check for first subscription BEFORE updating
        if (customerEmail) {
          await handleSubscriptionEmail(userId, customerEmail);
        }
        
        await updateSubscriptionFromInvoice(supabaseAdmin, userId, invoice, stripe);
      }

      logStep("Subscription updated from invoice payment");
    }

    // Handle subscription events for recurring subscriptions
    if (event.type === "invoice.payment_failed") {
      const invoice = event.data.object as Stripe.Invoice;
      logStep("Invoice payment failed", { invoiceId: invoice.id });
      
      // Get customer details for email
      const customerId = typeof invoice.customer === 'string' ? invoice.customer : (invoice.customer as any)?.id;
      let customerEmail: string | null = null;
      let customerName: string | null = null;
      
      if (customerId) {
        try {
          const customer = await stripe.customers.retrieve(customerId);
          customerEmail = (customer as any).email;
          customerName = (customer as any).name;
        } catch (e) {
          logStep("Could not retrieve customer", { error: String(e) });
        }
      }
      
      // Get user from metadata or email
      const userId = invoice.metadata?.user_id;
      if (userId) {
        // Update subscription status to past_due
        await supabaseAdmin
          .from("subscriptions")
          .update({ 
            status: "past_due",
            updated_at: new Date().toISOString()
          })
          .eq("user_id", userId);
        
        logStep("Subscription marked as past_due", { userId });

        // Log payment failed activity
        const { data: profile } = await supabaseAdmin
          .from("profiles")
          .select("email")
          .eq("user_id", userId)
          .maybeSingle();

        await supabaseAdmin.from('activity_logs').insert({
          user_id: userId,
          user_email: profile?.email || customerEmail || null,
          event_type: 'payment_failed',
          event_message: 'Subscription payment failed',
          event_details: { invoiceId: invoice.id, amount: invoice.amount_due, currency: invoice.currency },
        });
      }
      
      // Send payment failed email
      if (customerEmail) {
        // Determine plan type from subscription
        let planType = "monthly";
        if (invoice.subscription) {
          try {
            const subscription = await stripe.subscriptions.retrieve(invoice.subscription as string);
            planType = subscription.items?.data?.[0]?.price?.recurring?.interval === 'year' ? 'yearly' : 'monthly';
          } catch (e) {
            logStep("Could not retrieve subscription for plan type", { error: String(e) });
          }
        }
        
        await sendPaymentFailedEmail(
          customerEmail,
          customerName,
          invoice.amount_due || 0,
          invoice.currency || 'eur',
          planType
        );
      }
    }

    // Handle invoice becoming uncollectible (unpaid after grace period for invoice-based payments)
    // This happens when an invoice-based subscription's invoice isn't paid
    if (event.type === "invoice.marked_uncollectible" || event.type === "invoice.voided") {
      const invoice = event.data.object as Stripe.Invoice;
      logStep(`Invoice ${event.type}`, { invoiceId: invoice.id, subscriptionId: invoice.subscription });
      
      // If this invoice is tied to a subscription, cancel the subscription
      if (invoice.subscription) {
        try {
          const subscription = await stripe.subscriptions.retrieve(invoice.subscription as string);
          
          // Check if this is a device slot subscription (unpaid invoice = should be canceled)
          const priceId = subscription.items?.data?.[0]?.price?.id;
          const DEVICE_SLOT_PRICES = [
            "price_1SfhoMJrU52a7SNLpLI3yoEl", // monthly €5
            "price_1Sj2PMJrU52a7SNLzhpFYfJd", // yearly €50
          ];
          
          if (DEVICE_SLOT_PRICES.includes(priceId || "")) {
            // Cancel the device slot subscription immediately since invoice wasn't paid
            await stripe.subscriptions.cancel(subscription.id);
            logStep("Canceled unpaid device slot subscription", { subscriptionId: subscription.id });
            
            // Sync device slots for the user
            const userId = subscription.metadata?.user_id;
            const customerId = typeof subscription.customer === 'string' 
              ? subscription.customer 
              : (subscription.customer as any)?.id;
              
            if (userId && customerId) {
              await syncDeviceSlotsForUser(supabaseAdmin, userId, stripe, customerId);
              logStep("Device slots synced after unpaid invoice cancellation", { userId });
            }
            
            // Log activity
            if (userId) {
              const { data: profile } = await supabaseAdmin
                .from("profiles")
                .select("email")
                .eq("user_id", userId)
                .maybeSingle();

              await supabaseAdmin.from('activity_logs').insert({
                user_id: userId,
                user_email: profile?.email || null,
                event_type: 'device_slot_canceled_unpaid',
                event_message: 'Device slot subscription canceled due to unpaid invoice',
                event_details: { subscriptionId: subscription.id, invoiceId: invoice.id },
              });
            }
          } else {
            // Main subscription - mark as canceled
            const userId = subscription.metadata?.user_id;
            if (userId) {
              await supabaseAdmin
                .from("subscriptions")
                .update({ 
                  status: "canceled",
                  updated_at: new Date().toISOString()
                })
                .eq("user_id", userId);
              
              logStep("Main subscription marked as canceled due to unpaid invoice", { userId });
              
              // Log activity
              const { data: profile } = await supabaseAdmin
                .from("profiles")
                .select("email")
                .eq("user_id", userId)
                .maybeSingle();

              await supabaseAdmin.from('activity_logs').insert({
                user_id: userId,
                user_email: profile?.email || null,
                event_type: 'subscription_canceled_unpaid',
                event_message: 'Subscription canceled due to unpaid invoice',
                event_details: { subscriptionId: subscription.id, invoiceId: invoice.id },
              });
            }
          }
        } catch (e) {
          logStep("Error handling uncollectible invoice", { error: String(e) });
        }
      }
    }
    // Handle subscription status changes (trial to active)
    if (event.type === "customer.subscription.updated") {
      const subscription = event.data.object as Stripe.Subscription;
      const previousAttributes = (event.data as any).previous_attributes;
      
      logStep("Subscription updated", { 
        subscriptionId: subscription.id, 
        status: subscription.status,
        previousStatus: previousAttributes?.status 
      });

      // Check if this is a trial-to-active conversion
      if (previousAttributes?.status === "trialing" && subscription.status === "active") {
        logStep("Trial converted to active subscription");
        
        const userId = subscription.metadata?.user_id;
        const customerId = typeof subscription.customer === 'string' 
          ? subscription.customer 
          : (subscription.customer as any)?.id;
        
        if (customerId) {
          try {
            const customer = await stripe.customers.retrieve(customerId);
            const customerEmail = (customer as any).email;
            const customerName = (customer as any).name;
            
            if (customerEmail) {
              const planType = subscription.items?.data?.[0]?.price?.recurring?.interval === 'year' ? 'yearly' : 'monthly';
              const periodEnd = new Date(subscription.current_period_end * 1000);
              
              await sendSubscriptionConfirmationEmail(
                customerEmail,
                customerName,
                planType,
                periodEnd
              );
              
              logStep("Subscription confirmation email sent for trial conversion", { email: customerEmail });
            }
          } catch (e) {
            logStep("Error sending subscription confirmation email", { error: String(e) });
          }
        }

        // Log the conversion activity
        if (userId) {
          const { data: profile } = await supabaseAdmin
            .from("profiles")
            .select("email")
            .eq("user_id", userId)
            .maybeSingle();

          await supabaseAdmin.from('activity_logs').insert({
            user_id: userId,
            user_email: profile?.email || null,
            event_type: 'trial_converted',
            event_message: 'Trial converted to active subscription',
            event_details: { subscriptionId: subscription.id },
          });
        }
      }
    }

    if (event.type === "customer.subscription.deleted") {
      const subscription = event.data.object as Stripe.Subscription;
      logStep("Subscription deleted", { subscriptionId: subscription.id });

      const userId = subscription.metadata?.user_id;
      if (userId) {
        await supabaseAdmin
          .from("subscriptions")
          .update({ 
            status: "canceled",
            updated_at: new Date().toISOString()
          })
          .eq("user_id", userId);

        logStep("Subscription marked as canceled", { userId });

        // Log subscription canceled activity
        const { data: profile } = await supabaseAdmin
          .from("profiles")
          .select("email")
          .eq("user_id", userId)
          .maybeSingle();

        await supabaseAdmin.from('activity_logs').insert({
          user_id: userId,
          user_email: profile?.email || null,
          event_type: 'subscription_canceled',
          event_message: 'Subscription canceled',
          event_details: { subscriptionId: subscription.id },
        });
      }
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message: errorMessage });
    // Return generic error to client, detailed error logged server-side only
    return new Response(null, { status: 400 });
  }
});

async function updateSubscriptionFromInvoice(
  supabase: any,
  userId: string,
  invoice: Stripe.Invoice,
  stripe: Stripe
) {
  logStep("Updating subscription for user", { userId, invoiceId: invoice.id });

  // Determine plan type from invoice line items
  let planType = "monthly";
  const lineItems = invoice.lines?.data || [];
  for (const item of lineItems) {
    const price = item.price;
    if (price?.recurring?.interval === "year") {
      planType = "yearly";
      break;
    }
    // Also check for yearly one-time prices by looking at metadata or price ID
    if (item.description?.toLowerCase().includes("year") || item.description?.toLowerCase().includes("yearly")) {
      planType = "yearly";
      break;
    }
  }

  // Check invoice metadata for plan type (set by our create-invoice function)
  if (invoice.metadata?.plan_type) {
    planType = invoice.metadata.plan_type;
  }

  const now = new Date();
  let startDate = now;
  let endDate: Date;
  
  // Check if this is a subscription invoice
  if (invoice.subscription) {
    // For subscriptions, use the subscription period
    const subscription = await stripe.subscriptions.retrieve(invoice.subscription as string);
    endDate = new Date((subscription as any).current_period_end * 1000);
    planType = (subscription as any).items?.data?.[0]?.price?.recurring?.interval === "year" ? "yearly" : "monthly";
    logStep("Using subscription period", { endDate: endDate.toISOString() });
  } else {
    // For one-time invoice payments (including renewals), check if we should extend existing access
    const isRenewal = invoice.metadata?.renewal === "true";
    
    if (isRenewal) {
      // Get existing subscription to extend from current_period_end
      const { data: existingSub } = await supabase
        .from("subscriptions")
        .select("current_period_end")
        .eq("user_id", userId)
        .single();
      
      if (existingSub?.current_period_end) {
        const existingEnd = new Date(existingSub.current_period_end);
        // If existing period hasn't ended yet, extend from that date
        if (existingEnd > now) {
          startDate = existingEnd;
          logStep("Extending from existing period end", { existingEnd: existingEnd.toISOString() });
        }
      }
    }
    
    // Calculate end date based on plan type
    if (planType === "yearly") {
      endDate = new Date(startDate);
      endDate.setFullYear(endDate.getFullYear() + 1);
    } else {
      endDate = new Date(startDate);
      endDate.setMonth(endDate.getMonth() + 1);
    }
    logStep("Using calculated period", { startDate: startDate.toISOString(), endDate: endDate.toISOString(), isRenewal });
  }

  const customerId = typeof invoice.customer === 'string' ? invoice.customer : (invoice.customer as any)?.id;
  const subscriptionId = typeof invoice.subscription === 'string' ? invoice.subscription : null;

  // Upsert subscription record
  const { error } = await supabase
    .from("subscriptions")
    .upsert({
      user_id: userId,
      stripe_customer_id: customerId,
      stripe_subscription_id: subscriptionId,
      status: "active",
      plan_type: planType,
      current_period_start: startDate.toISOString(),
      current_period_end: endDate.toISOString(),
      updated_at: now.toISOString(),
    }, { onConflict: "user_id" });

  if (error) {
    logStep("Error updating subscription", { error: error.message });
    throw error;
  }

  logStep("Subscription activated", { userId, planType, endDate: endDate.toISOString() });
}
