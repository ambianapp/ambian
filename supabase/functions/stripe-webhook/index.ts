import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { Resend } from "https://esm.sh/resend@2.0.0";

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[STRIPE-WEBHOOK] ${step}${detailsStr}`);
};

// Email wrapper with proper dark mode support for all email clients
const emailWrapper = (content: string) => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="dark">
  <meta name="supported-color-schemes" content="dark">
  <style>
    :root { color-scheme: dark; }
    @media (prefers-color-scheme: dark) {
      body, .body-bg { background-color: #1a1a2e !important; }
    }
  </style>
</head>
<body class="body-bg" style="margin: 0; padding: 0; background-color: #1a1a2e; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;" bgcolor="#1a1a2e">
  <table role="presentation" width="100%" height="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#1a1a2e" style="background-color: #1a1a2e; min-height: 100vh;">
    <tr>
      <td align="center" valign="top" style="padding: 40px 20px; background-color: #1a1a2e;" bgcolor="#1a1a2e">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width: 600px; width: 100%; background-color: #16213e; border-radius: 16px;" bgcolor="#16213e">
          ${content}
        </table>
      </td>
    </tr>
    <!-- Spacer for dark background -->
    <tr>
      <td style="background-color: #1a1a2e; height: 40px;" bgcolor="#1a1a2e">&nbsp;</td>
    </tr>
  </table>
</body>
</html>
`;

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

  const html = emailWrapper(`
          <!-- Header -->
          <tr>
            <td style="padding: 40px 40px 20px; text-align: center;">
              <img src="https://ambianmusic.com/ambian-logo.png" alt="Ambian" width="120" style="display: block; margin: 0 auto 20px;" />
              <h1 style="color: #ffffff; font-size: 28px; font-weight: 600; margin: 0;">
                ⏰ Payment Reminder
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
                This is a friendly reminder that your Ambian subscription renewal is coming up.
              </p>
              
              <!-- Details Box -->
              <div style="background: rgba(255,255,255,0.05); border-radius: 12px; padding: 24px; margin: 20px 0; border: 1px solid rgba(255,255,255,0.1);">
                <table width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="padding: 8px 0;">
                      <span style="color: #888888; font-size: 14px;">Plan:</span>
                      <span style="color: #ffffff; font-size: 14px; margin-left: 12px; font-weight: 500;">${planType === 'yearly' ? 'Yearly' : 'Monthly'} Subscription</span>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0;">
                      <span style="color: #888888; font-size: 14px;">Amount:</span>
                      <span style="color: #ffffff; font-size: 14px; margin-left: 12px; font-weight: 500;">${formattedAmount}</span>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0;">
                      <span style="color: #888888; font-size: 14px;">Due by:</span>
                      <span style="color: #ffffff; font-size: 14px; margin-left: 12px; font-weight: 500;">${formattedDueDate}</span>
                    </td>
                  </tr>
                </table>
              </div>
              
              <p style="color: #e0e0e0; font-size: 16px; line-height: 1.6; margin: 0 0 20px;">
                If you're paying by bank transfer (IBAN), please ensure payment is made before the due date to avoid any interruption to your service.
              </p>
              
              <!-- CTA Button -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="padding: 20px 0 30px;">
                    <a href="https://ambianmusic.com/profile" style="display: inline-block; background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); color: #ffffff; text-decoration: none; padding: 16px 40px; border-radius: 8px; font-size: 16px; font-weight: 600;">
                      View Invoice
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="padding: 20px 40px 40px; text-align: center; border-top: 1px solid rgba(255,255,255,0.1);">
              <p style="color: #888888; font-size: 14px; margin: 0;">
                Questions? Contact us at <a href="mailto:support@ambianmusic.com" style="color: #8b5cf6; text-decoration: none;">support@ambianmusic.com</a>
              </p>
            </td>
          </tr>
  `);

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

  const html = emailWrapper(`
          <!-- Header -->
          <tr>
            <td style="padding: 40px 40px 20px; text-align: center;">
              <img src="https://ambianmusic.com/ambian-logo.png" alt="Ambian" width="120" style="display: block; margin: 0 auto 20px;" />
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
  `);

  try {
    const { data, error } = await resend.emails.send({
      from: "Ambian <noreply@ambianmusic.com>",
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

  const html = emailWrapper(`
          <!-- Header -->
          <tr>
            <td style="padding: 40px 40px 20px; text-align: center;">
              <img src="https://ambianmusic.com/ambian-logo.png" alt="Ambian" width="120" style="display: block; margin: 0 auto 20px;" />
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
  `);

  try {
    const { data, error } = await resend.emails.send({
      from: "Ambian <noreply@ambianmusic.com>",
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

  const html = emailWrapper(`
          <!-- Header -->
          <tr>
            <td style="padding: 40px 40px 20px; text-align: center;">
              <img src="https://ambianmusic.com/ambian-logo.png" alt="Ambian" width="120" style="display: block; margin: 0 auto 20px;" />
              <h1 style="color: #ffffff; font-size: 28px; font-weight: 600; margin: 0;">
                ✓ Payment Confirmed
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
                Thank you for your payment! Your Ambian subscription is now active.
              </p>
              
              <!-- Details Box -->
              <div style="background: rgba(16, 185, 129, 0.1); border-radius: 12px; padding: 24px; margin: 20px 0; border: 1px solid rgba(16, 185, 129, 0.3);">
                <h3 style="color: #10b981; font-size: 16px; margin: 0 0 16px;">Payment Details</h3>
                <table width="100%" cellpadding="0" cellspacing="0">
                  ${invoiceNumber ? `<tr>
                    <td style="padding: 8px 0;">
                      <span style="color: #888888; font-size: 14px;">Invoice:</span>
                      <span style="color: #ffffff; font-size: 14px; margin-left: 12px; font-weight: 500;">${invoiceNumber}</span>
                    </td>
                  </tr>` : ''}
                  <tr>
                    <td style="padding: 8px 0;">
                      <span style="color: #888888; font-size: 14px;">Plan:</span>
                      <span style="color: #ffffff; font-size: 14px; margin-left: 12px; font-weight: 500;">${planType === 'yearly' ? 'Yearly' : 'Monthly'} Subscription</span>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0;">
                      <span style="color: #888888; font-size: 14px;">Amount paid:</span>
                      <span style="color: #ffffff; font-size: 14px; margin-left: 12px; font-weight: 500;">${formattedAmount}</span>
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
              
              <p style="color: #e0e0e0; font-size: 16px; line-height: 1.6; margin: 0 0 20px;">
                You can start enjoying unlimited background music for your business right away!
              </p>
              
              <!-- CTA Button -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="padding: 20px 0 30px;">
                    <a href="https://ambianmusic.com" style="display: inline-block; background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); color: #ffffff; text-decoration: none; padding: 16px 40px; border-radius: 8px; font-size: 16px; font-weight: 600;">
                      Open Ambian
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="padding: 20px 40px 40px; text-align: center; border-top: 1px solid rgba(255,255,255,0.1);">
              <p style="color: #888888; font-size: 14px; margin: 0;">
                Manage your subscription at <a href="https://ambianmusic.com/profile" style="color: #8b5cf6; text-decoration: none;">ambianmusic.com/profile</a>
              </p>
            </td>
          </tr>
  `);

  try {
    const { data, error } = await resend.emails.send({
      from: "Ambian <noreply@ambianmusic.com>",
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

async function sendDeviceSlotConfirmationEmail(
  email: string,
  customerName: string | null,
  quantity: number,
  period: string,
  amount: number,
  currency: string
) {
  const resend = new Resend(Deno.env.get("RESEND_API_KEY"));
  
  const formattedAmount = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format(amount / 100);
  
  const locationText = quantity === 1 ? "1 new location" : `${quantity} new locations`;
  const periodText = period === 'yearly' ? 'year' : 'month';

  const html = emailWrapper(`
          <!-- Header -->
          <tr>
            <td style="padding: 40px 40px 20px; text-align: center;">
              <img src="https://ambianmusic.com/ambian-logo.png" alt="Ambian" width="120" style="display: block; margin: 0 auto 20px;" />
              <h1 style="color: #ffffff; font-size: 28px; font-weight: 600; margin: 0;">
                🏪 Location Added!
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
                Great news! You've successfully added ${locationText} to your Ambian subscription.
              </p>
              
              <!-- Details Box -->
              <div style="background: rgba(255,255,255,0.05); border-radius: 12px; padding: 24px; margin: 20px 0; border: 1px solid rgba(255,255,255,0.1);">
                <h3 style="color: #10b981; font-size: 16px; margin: 0 0 16px;">✓ Location Added</h3>
                <table width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="padding: 8px 0;">
                      <span style="color: #888888; font-size: 14px;">Locations added:</span>
                      <span style="color: #ffffff; font-size: 14px; margin-left: 12px; font-weight: 500;">${quantity}</span>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0;">
                      <span style="color: #888888; font-size: 14px;">Billing:</span>
                      <span style="color: #ffffff; font-size: 14px; margin-left: 12px; font-weight: 500;">${formattedAmount}/${periodText}</span>
                    </td>
                  </tr>
                </table>
              </div>
              
              <p style="color: #e0e0e0; font-size: 16px; line-height: 1.6; margin: 0 0 20px;">
                You can now play Ambian on ${quantity} additional device${quantity > 1 ? 's' : ''} at your new location${quantity > 1 ? 's' : ''}.
              </p>
              
              <!-- CTA Button -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="padding: 20px 0 30px;">
                    <a href="https://ambianmusic.com" style="display: inline-block; background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); color: #ffffff; text-decoration: none; padding: 16px 40px; border-radius: 8px; font-size: 16px; font-weight: 600;">
                      Start Playing
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="padding: 20px 40px 40px; text-align: center; border-top: 1px solid rgba(255,255,255,0.1);">
              <p style="color: #888888; font-size: 14px; margin: 0 0 10px;">
                Manage your locations at <a href="https://ambianmusic.com/profile" style="color: #8b5cf6; text-decoration: none;">ambianmusic.com/profile</a>
              </p>
            </td>
          </tr>
  `);

  try {
    const { data, error } = await resend.emails.send({
      from: "Ambian <noreply@ambianmusic.com>",
      to: [email],
      subject: `Location Added - ${locationText} now active on Ambian`,
      html,
    });

    if (error) {
      logStep("Error sending device slot confirmation email", { error });
      return false;
    }

    logStep("Device slot confirmation email sent", { emailId: data?.id, to: email });
    return true;
  } catch (error) {
    logStep("Failed to send device slot confirmation email", { error: String(error) });
    return false;
  }
}

async function sendSubscriptionCanceledEmail(
  email: string,
  customerName: string | null,
  planType: string
) {
  const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

  const html = emailWrapper(`
          <!-- Header -->
          <tr>
            <td style="padding: 40px 40px 20px; text-align: center;">
              <img src="https://ambianmusic.com/ambian-logo.png" alt="Ambian" width="120" style="display: block; margin: 0 auto 20px;" />
              <h1 style="color: #ffffff; font-size: 28px; font-weight: 600; margin: 0;">
                We're sorry to see you go
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
                Your Ambian ${planType === 'yearly' ? 'yearly' : 'monthly'} subscription has been canceled. We hope you enjoyed our service!
              </p>
              
              <!-- Offer Box -->
              <div style="background: rgba(139, 92, 246, 0.1); border-radius: 12px; padding: 24px; margin: 20px 0; border: 1px solid rgba(139, 92, 246, 0.3);">
                <h3 style="color: #8b5cf6; font-size: 16px; margin: 0 0 12px;">💡 Did you know?</h3>
                <p style="color: #e0e0e0; font-size: 14px; line-height: 1.6; margin: 0;">
                  You can resubscribe anytime and get instant access to all your favorite playlists again. Your preferences and settings are saved!
                </p>
              </div>
              
              <p style="color: #e0e0e0; font-size: 16px; line-height: 1.6; margin: 0 0 20px;">
                If you have any feedback on how we can improve, we'd love to hear from you. Just reply to this email.
              </p>
              
              <!-- CTA Button -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="padding: 20px 0 30px;">
                    <a href="https://ambianmusic.com/pricing" style="display: inline-block; background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); color: #ffffff; text-decoration: none; padding: 16px 40px; border-radius: 8px; font-size: 16px; font-weight: 600;">
                      Resubscribe Now
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="padding: 20px 40px 40px; text-align: center; border-top: 1px solid rgba(255,255,255,0.1);">
              <p style="color: #888888; font-size: 14px; margin: 0;">
                Thank you for being a part of Ambian. We hope to see you again soon!
              </p>
            </td>
          </tr>
  `);

  try {
    const { data, error } = await resend.emails.send({
      from: "Ambian <noreply@ambianmusic.com>",
      to: [email],
      subject: "Your Ambian subscription has been canceled",
      html,
    });

    if (error) {
      logStep("Error sending subscription canceled email", { error });
      return false;
    }

    logStep("Subscription canceled email sent", { emailId: data?.id, to: email });
    return true;
  } catch (error) {
    logStep("Failed to send subscription canceled email", { error: String(error) });
    return false;
  }
}

// Owner notification email when a purchase is made
async function sendOwnerPurchaseNotificationEmail(
  customerEmail: string,
  customerName: string | null,
  planType: string,
  amount: number,
  currency: string,
  isFirstSubscription: boolean,
  isDeviceSlot: boolean = false,
  deviceSlotQuantity: number = 0
) {
  const resend = new Resend(Deno.env.get("RESEND_API_KEY"));
  const ownerEmail = "info@ambian.fi";
  
  const formattedAmount = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format(amount / 100);
  
  const purchaseType = isDeviceSlot 
    ? `${deviceSlotQuantity} Additional Location(s)` 
    : (isFirstSubscription ? 'New Subscription' : 'Subscription Renewal');
  
  const planDisplay = isDeviceSlot 
    ? `${planType === 'yearly' ? 'Yearly' : 'Monthly'} Device Slot` 
    : `${planType === 'yearly' ? 'Yearly' : 'Monthly'} Subscription`;

  const html = emailWrapper(`
          <!-- Header -->
          <tr>
            <td style="padding: 40px 40px 20px; text-align: center;">
              <img src="https://ambianmusic.com/ambian-logo.png" alt="Ambian" width="120" style="display: block; margin: 0 auto 20px;" />
              <h1 style="color: #ffffff; font-size: 28px; font-weight: 600; margin: 0;">
                💰 New Purchase!
              </h1>
            </td>
          </tr>
          
          <!-- Content -->
          <tr>
            <td style="padding: 20px 40px;">
              <p style="color: #e0e0e0; font-size: 16px; line-height: 1.6; margin: 0 0 20px;">
                A customer just made a purchase on Ambian!
              </p>
              
              <!-- Purchase Details Box -->
              <div style="background: rgba(16, 185, 129, 0.1); border-radius: 12px; padding: 24px; margin: 20px 0; border: 1px solid rgba(16, 185, 129, 0.3);">
                <h3 style="color: #10b981; font-size: 16px; margin: 0 0 16px;">✓ ${purchaseType}</h3>
                <table width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="padding: 8px 0;">
                      <span style="color: #888888; font-size: 14px;">Customer:</span>
                      <span style="color: #ffffff; font-size: 14px; margin-left: 12px; font-weight: 500;">${customerName || 'N/A'}</span>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0;">
                      <span style="color: #888888; font-size: 14px;">Email:</span>
                      <span style="color: #ffffff; font-size: 14px; margin-left: 12px; font-weight: 500;">${customerEmail}</span>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0;">
                      <span style="color: #888888; font-size: 14px;">Plan:</span>
                      <span style="color: #ffffff; font-size: 14px; margin-left: 12px; font-weight: 500;">${planDisplay}</span>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0;">
                      <span style="color: #888888; font-size: 14px;">Amount:</span>
                      <span style="color: #10b981; font-size: 14px; margin-left: 12px; font-weight: 600;">${formattedAmount}</span>
                    </td>
                  </tr>
                </table>
              </div>
              
              <p style="color: #888888; font-size: 14px; line-height: 1.6; margin: 20px 0 0;">
                Time: ${new Date().toLocaleString('en-US', { 
                  weekday: 'long', 
                  year: 'numeric', 
                  month: 'long', 
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                  timeZone: 'Europe/Helsinki'
                })} (Helsinki)
              </p>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="padding: 20px 40px 40px; text-align: center; border-top: 1px solid rgba(255,255,255,0.1);">
              <p style="color: #888888; font-size: 14px; margin: 0;">
                <a href="https://ambian.app/admin" style="color: #8b5cf6; text-decoration: none;">View Admin Dashboard</a>
              </p>
            </td>
          </tr>
  `);

  try {
    const { data, error } = await resend.emails.send({
      from: "Ambian <noreply@ambianmusic.com>",
      to: [ownerEmail],
      subject: `💰 ${purchaseType}: ${customerEmail} - ${formattedAmount}`,
      html,
    });

    if (error) {
      logStep("Error sending owner purchase notification email", { error });
      return false;
    }

    logStep("Owner purchase notification email sent", { emailId: data?.id, to: ownerEmail, customerEmail });
    return true;
  } catch (error) {
    logStep("Failed to send owner purchase notification email", { error: String(error) });
    return false;
  }
}

// Owner notification email when a subscription is canceled
async function sendOwnerCancellationNotificationEmail(
  customerEmail: string,
  customerName: string | null,
  planType: string,
  isDeviceSlot: boolean = false,
  deviceSlotQuantity: number = 0
) {
  const resend = new Resend(Deno.env.get("RESEND_API_KEY"));
  const ownerEmail = "info@ambian.fi";
  
  const cancellationType = isDeviceSlot 
    ? `${deviceSlotQuantity} Location(s) Canceled` 
    : 'Subscription Canceled';
  
  const planDisplay = isDeviceSlot 
    ? `${planType === 'yearly' ? 'Yearly' : 'Monthly'} Device Slot` 
    : `${planType === 'yearly' ? 'Yearly' : 'Monthly'} Subscription`;

  const html = emailWrapper(`
          <!-- Header -->
          <tr>
            <td style="padding: 40px 40px 20px; text-align: center;">
              <img src="https://ambianmusic.com/ambian-logo.png" alt="Ambian" width="120" style="display: block; margin: 0 auto 20px;" />
              <h1 style="color: #ffffff; font-size: 28px; font-weight: 600; margin: 0;">
                📉 ${cancellationType}
              </h1>
            </td>
          </tr>
          
          <!-- Content -->
          <tr>
            <td style="padding: 20px 40px;">
              <p style="color: #e0e0e0; font-size: 16px; line-height: 1.6; margin: 0 0 20px;">
                A customer has canceled their subscription on Ambian.
              </p>
              
              <!-- Cancellation Details Box -->
              <div style="background: rgba(239, 68, 68, 0.1); border-radius: 12px; padding: 24px; margin: 20px 0; border: 1px solid rgba(239, 68, 68, 0.3);">
                <h3 style="color: #fca5a5; font-size: 16px; margin: 0 0 16px;">✗ ${cancellationType}</h3>
                <table width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="padding: 8px 0;">
                      <span style="color: #888888; font-size: 14px;">Customer:</span>
                      <span style="color: #ffffff; font-size: 14px; margin-left: 12px; font-weight: 500;">${customerName || 'N/A'}</span>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0;">
                      <span style="color: #888888; font-size: 14px;">Email:</span>
                      <span style="color: #ffffff; font-size: 14px; margin-left: 12px; font-weight: 500;">${customerEmail}</span>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0;">
                      <span style="color: #888888; font-size: 14px;">Plan:</span>
                      <span style="color: #ffffff; font-size: 14px; margin-left: 12px; font-weight: 500;">${planDisplay}</span>
                    </td>
                  </tr>
                </table>
              </div>
              
              <p style="color: #888888; font-size: 14px; line-height: 1.6; margin: 20px 0 0;">
                Time: ${new Date().toLocaleString('en-US', { 
                  weekday: 'long', 
                  year: 'numeric', 
                  month: 'long', 
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                  timeZone: 'Europe/Helsinki'
                })} (Helsinki)
              </p>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="padding: 20px 40px 40px; text-align: center; border-top: 1px solid rgba(255,255,255,0.1);">
              <p style="color: #888888; font-size: 14px; margin: 0;">
                <a href="https://ambian.app/admin" style="color: #8b5cf6; text-decoration: none;">View Admin Dashboard</a>
              </p>
            </td>
          </tr>
  `);

  try {
    const { data, error } = await resend.emails.send({
      from: "Ambian <noreply@ambianmusic.com>",
      to: [ownerEmail],
      subject: `📉 ${cancellationType}: ${customerEmail}`,
      html,
    });

    if (error) {
      logStep("Error sending owner cancellation notification email", { error });
      return false;
    }

    logStep("Owner cancellation notification email sent", { emailId: data?.id, to: ownerEmail, customerEmail });
    return true;
  } catch (error) {
    logStep("Failed to send owner cancellation notification email", { error: String(error) });
    return false;
  }
}

async function sendPlanChangeEmail(
  email: string,
  customerName: string | null,
  oldPlan: string,
  newPlan: string,
  amount: number,
  currency: string,
  periodEnd: Date
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
  
  const isUpgrade = newPlan === 'yearly' && oldPlan === 'monthly';
  const savingsText = isUpgrade ? "You're now saving €58/year compared to monthly billing!" : "";

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
                  <img src="https://ambianmusic.com/ambian-logo.png" alt="Ambian" width="120" style="display: block; margin: 0 auto 20px;" />
                  <h1 style="color: #ffffff; font-size: 28px; font-weight: 600; margin: 0;">
                    ${isUpgrade ? '🎉 Plan Upgraded!' : '📋 Plan Changed'}
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
                    Your Ambian subscription has been ${isUpgrade ? 'upgraded' : 'changed'} from ${oldPlan} to ${newPlan}.
                    ${savingsText}
                  </p>
                  
                  <!-- Details Box -->
                  <div style="background: rgba(255,255,255,0.05); border-radius: 12px; padding: 24px; margin: 20px 0; border: 1px solid rgba(255,255,255,0.1);">
                    <h3 style="color: #10b981; font-size: 16px; margin: 0 0 16px;">✓ Plan Updated</h3>
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="padding: 8px 0;">
                          <span style="color: #888888; font-size: 14px;">New plan:</span>
                          <span style="color: #ffffff; font-size: 14px; margin-left: 12px; font-weight: 500;">${newPlan === 'yearly' ? 'Yearly' : 'Monthly'} Subscription</span>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 8px 0;">
                          <span style="color: #888888; font-size: 14px;">Amount:</span>
                          <span style="color: #ffffff; font-size: 14px; margin-left: 12px; font-weight: 500;">${formattedAmount}/${newPlan === 'yearly' ? 'year' : 'month'}</span>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 8px 0;">
                          <span style="color: #888888; font-size: 14px;">Next billing:</span>
                          <span style="color: #ffffff; font-size: 14px; margin-left: 12px; font-weight: 500;">${formattedPeriodEnd}</span>
                        </td>
                      </tr>
                    </table>
                  </div>
                  
                  <!-- CTA Button -->
                  <table width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                      <td align="center" style="padding: 20px 0 30px;">
                        <a href="https://ambianmusic.com" style="display: inline-block; background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); color: #ffffff; text-decoration: none; padding: 16px 40px; border-radius: 8px; font-size: 16px; font-weight: 600;">
                          Continue Listening
                        </a>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
              
              <!-- Footer -->
              <tr>
                <td style="padding: 20px 40px 40px; text-align: center; border-top: 1px solid rgba(255,255,255,0.1);">
                  <p style="color: #888888; font-size: 14px; margin: 0 0 10px;">
                    Manage your subscription at <a href="https://ambianmusic.com/profile" style="color: #8b5cf6; text-decoration: none;">ambianmusic.com/profile</a>
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
      from: "Ambian <noreply@ambianmusic.com>",
      to: [email],
      subject: `Plan ${isUpgrade ? 'Upgraded' : 'Changed'} - Now on ${newPlan === 'yearly' ? 'Yearly' : 'Monthly'} billing`,
      html,
    });

    if (error) {
      logStep("Error sending plan change email", { error });
      return false;
    }

    logStep("Plan change email sent", { emailId: data?.id, to: email });
    return true;
  } catch (error) {
    logStep("Failed to send plan change email", { error: String(error) });
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
  let periodEndIsValid = false;
  
  if (invoice.subscription) {
    try {
      const subscription = await stripe.subscriptions.retrieve(invoice.subscription as string);
      planType = subscription.items?.data?.[0]?.price?.recurring?.interval === 'year' ? 'yearly' : 'monthly';
      
      // Check if current_period_end exists and is a valid number
      const currentPeriodEnd = (subscription as any).current_period_end;
      if (currentPeriodEnd && typeof currentPeriodEnd === 'number' && currentPeriodEnd > 0) {
        periodEnd = new Date(currentPeriodEnd * 1000);
        // Validate the date is actually valid
        if (!isNaN(periodEnd.getTime())) {
          periodEndIsValid = true;
          logStep("Got period end from subscription", { periodEnd: periodEnd.toISOString() });
        }
      }
    } catch (e) {
      logStep("Could not retrieve subscription details", { error: String(e) });
    }
  } else {
    // For one-time invoices, check line items for interval
    const lineItems = invoice.lines?.data || [];
    for (const item of lineItems) {
      if (item.price?.recurring?.interval === 'year') {
        planType = 'yearly';
        break;
      }
    }
  }
  
  // Fallback: calculate period end from now if we couldn't get it from subscription
  if (!periodEndIsValid) {
    logStep("Using fallback period end calculation", { planType });
    periodEnd = new Date();
    if (planType === 'yearly') {
      periodEnd.setFullYear(periodEnd.getFullYear() + 1);
    } else {
      periodEnd.setMonth(periodEnd.getMonth() + 1);
    }
  }

  // For first subscription, send welcome email instead of just payment confirmation
  if (isFirstSubscription) {
    logStep("Sending welcome email for first subscription", { email: customerEmail, planType });
    const ok = await sendSubscriptionConfirmationEmail(
      customerEmail,
      customerName,
      planType,
      periodEnd
    );
    return ok;
  }

  const ok = await sendPaymentConfirmationEmail(
    customerEmail,
    customerName,
    invoice.amount_paid || 0,
    invoice.currency || 'eur',
    planType,
    periodEnd,
    invoice.number
  );

  return ok;
}

async function sendDeviceSlotUnpaidCancellationEmail(
  email: string,
  customerName: string | null,
  quantity: number,
  period: string
) {
  const resend = new Resend(Deno.env.get("RESEND_API_KEY"));
  
  const locationText = quantity === 1 ? "location" : "locations";
  const periodText = period === "yearly" ? "yearly" : "monthly";

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
                  <img src="https://ambianmusic.com/ambian-logo.png" alt="Ambian" width="120" style="display: block; margin: 0 auto 20px;" />
                  <h1 style="color: #ffffff; font-size: 24px; font-weight: 600; margin: 0;">
                    Location Subscription Canceled
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
                    Your additional ${locationText} subscription has been canceled because the invoice was not paid within the required timeframe.
                  </p>
                  
                  <!-- Details Box -->
                  <div style="background: rgba(239, 68, 68, 0.1); border-radius: 12px; padding: 24px; margin: 20px 0; border: 1px solid rgba(239, 68, 68, 0.3);">
                    <p style="color: #fca5a5; font-size: 14px; margin: 0 0 10px;">
                      <strong>Canceled:</strong> ${quantity} additional ${locationText} (${periodText})
                    </p>
                    <p style="color: #fca5a5; font-size: 14px; margin: 0;">
                      <strong>Reason:</strong> Invoice not paid
                    </p>
                  </div>
                  
                  <p style="color: #e0e0e0; font-size: 16px; line-height: 1.6; margin: 0 0 20px;">
                    If you still need additional locations for your business, you can add them again from your profile.
                  </p>
                  
                  <!-- CTA Button -->
                  <table width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                      <td align="center" style="padding: 20px 0 30px;">
                        <a href="https://ambianmusic.com/profile" style="display: inline-block; background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); color: #ffffff; text-decoration: none; padding: 16px 40px; border-radius: 8px; font-size: 16px; font-weight: 600;">
                          Add Locations
                        </a>
                      </td>
                    </tr>
                  </table>
                  
                  <p style="color: #888888; font-size: 14px; line-height: 1.6; margin: 0;">
                    If you believe this is an error or have questions, please contact us at <a href="mailto:support@ambian.fi" style="color: #8b5cf6;">support@ambian.fi</a>.
                  </p>
                </td>
              </tr>
              
              <!-- Footer -->
              <tr>
                <td style="padding: 20px 40px 40px; text-align: center; border-top: 1px solid rgba(255,255,255,0.1);">
                  <p style="color: #888888; font-size: 14px; margin: 0;">
                    &copy; ${new Date().getFullYear()} Ambian. All rights reserved.
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
      from: "Ambian <noreply@ambianmusic.com>",
      to: [email],
      subject: "Location Subscription Canceled - Invoice Not Paid",
      html,
    });

    if (error) {
      logStep("Error sending unpaid cancellation email", { error });
      return false;
    }

    logStep("Unpaid cancellation email sent", { emailId: data?.id, to: email });
    return true;
  } catch (error) {
    logStep("Failed to send unpaid cancellation email", { error: String(error) });
    return false;
  }
}

async function sendDeviceSlotAutoCanceledEmail(
  email: string,
  customerName: string | null,
  quantity: number
) {
  const resend = new Resend(Deno.env.get("RESEND_API_KEY"));
  
  const locationText = quantity === 1 ? "location" : "locations";

  const html = emailWrapper(`
          <!-- Header -->
          <tr>
            <td style="padding: 40px 40px 20px; text-align: center;">
              <img src="https://ambianmusic.com/ambian-logo.png" alt="Ambian" width="120" style="display: block; margin: 0 auto 20px;" />
              <h1 style="color: #ffffff; font-size: 24px; font-weight: 600; margin: 0;">
                Additional Locations Canceled
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
                Your main Ambian subscription has ended, so your additional ${quantity} ${locationText} subscription${quantity > 1 ? 's have' : ' has'} been automatically canceled.
              </p>
              
              <!-- Info Box -->
              <div style="background: rgba(251, 191, 36, 0.1); border-radius: 12px; padding: 24px; margin: 20px 0; border: 1px solid rgba(251, 191, 36, 0.3);">
                <p style="color: #fbbf24; font-size: 14px; margin: 0;">
                  <strong>Note:</strong> Additional location subscriptions require an active main subscription. If you resubscribe to Ambian, you can add locations again from your Profile page.
                </p>
              </div>
              
              <p style="color: #e0e0e0; font-size: 16px; line-height: 1.6; margin: 0 0 20px;">
                If you'd like to continue using Ambian with multiple locations, please resubscribe and then add your additional locations.
              </p>
              
              <!-- CTA Button -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="padding: 20px 0 30px;">
                    <a href="https://ambianmusic.com/pricing" style="display: inline-block; background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); color: #ffffff; text-decoration: none; padding: 16px 40px; border-radius: 8px; font-size: 16px; font-weight: 600;">
                      View Plans
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="padding: 20px 40px 40px; text-align: center; border-top: 1px solid rgba(255,255,255,0.1);">
              <p style="color: #888888; font-size: 14px; margin: 0;">
                Questions? Contact us at <a href="mailto:support@ambianmusic.com" style="color: #8b5cf6; text-decoration: none;">support@ambianmusic.com</a>
              </p>
            </td>
          </tr>
  `);

  try {
    const { data, error } = await resend.emails.send({
      from: "Ambian <noreply@ambianmusic.com>",
      to: [email],
      subject: `Additional Locations Canceled - Main Subscription Ended`,
      html,
    });

    if (error) {
      logStep("Error sending device slot auto-canceled email", { error });
      return false;
    }

    logStep("Device slot auto-canceled email sent", { emailId: data?.id, to: email });
    return true;
  } catch (error) {
    logStep("Failed to send device slot auto-canceled email", { error: String(error) });
    return false;
  }
}

// Device slot price IDs
const DEVICE_SLOT_PRICES = [
  "price_1SfhoMJrU52a7SNLpLI3yoEl", // monthly €5
  "price_1Sj2PMJrU52a7SNLzhpFYfJd", // yearly €50
];

async function syncDeviceSlotsForUser(
  supabase: any,
  userId: string,
  stripe: Stripe,
  customerId: string
) {
  logStep("Syncing device slots for user", { userId, customerId });

  // Count device slot items across all active subscriptions
  const subscriptions = await stripe.subscriptions.list({
    customer: customerId,
    status: "active",
  });

  let deviceSlotCount = 1; // Base slot
  for (const sub of subscriptions.data) {
    for (const item of sub.items.data) {
      // Check by price ID for device slot items
      if (DEVICE_SLOT_PRICES.includes(item.price.id)) {
        deviceSlotCount += item.quantity || 1;
        logStep("Found device slot item", { 
          subscriptionId: sub.id, 
          itemId: item.id,
          quantity: item.quantity 
        });
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
          // Extend grace period by 7 days from now to cover IBAN payment time
          const gracePeriodEnd = new Date();
          gracePeriodEnd.setDate(gracePeriodEnd.getDate() + 7);
          
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
          
          // Send device slot confirmation email
          const customerId = typeof invoice.customer === 'string' ? invoice.customer : (invoice.customer as any)?.id;
          if (customerId) {
            try {
              const customer = await stripe.customers.retrieve(customerId);
              const customerEmail = (customer as any).email;
              const customerName = (customer as any).name;
              
              if (customerEmail) {
                // Get quantity and period from invoice metadata or line items
                const quantity = parseInt(invoice.metadata?.quantity || '1', 10);
                const period = invoice.metadata?.period || 'monthly';
                const amount = invoice.amount_paid || 0;
                const currency = invoice.currency || 'eur';
                
                await sendDeviceSlotConfirmationEmail(
                  customerEmail,
                  customerName,
                  quantity,
                  period,
                  amount,
                  currency
                );
                
                // Send owner notification for device slot purchase
                await sendOwnerPurchaseNotificationEmail(
                  customerEmail,
                  customerName,
                  period,
                  amount,
                  currency,
                  false,
                  true,
                  quantity
                );
              }
            } catch (e) {
              logStep("Could not send device slot confirmation email", { error: String(e) });
            }
          }
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
        // Webhooks can be retried; ensure we process each invoice only once.
        const invoiceLockType = "email_invoice_processed";

        const { data: alreadyProcessed } = await supabaseAdmin
          .from("activity_logs")
          .select("id")
          .eq("event_type", invoiceLockType)
          .contains("event_details", { invoiceId: invoice.id })
          .maybeSingle();

        if (alreadyProcessed) {
          logStep("Skipping duplicate invoice processing", {
            invoiceId: invoice.id,
            userId: targetUserId,
          });
          return;
        }

        // Acquire a best-effort lock BEFORE sending any email (prevents duplicates even if email send/log insert fails)
        await supabaseAdmin.from("activity_logs").insert({
          user_id: targetUserId,
          user_email: customerEmail,
          event_type: invoiceLockType,
          event_message: "Invoice processing locked",
          event_details: {
            invoiceId: invoice.id,
            invoiceNumber: invoice.number,
          },
        });

        const isRenewal = invoice.metadata?.renewal === "true";

        // Check if user already has an active subscription record (to determine if this is their first)
        const { data: existingSub } = await supabaseAdmin
          .from("subscriptions")
          .select("id, status")
          .eq("user_id", targetUserId)
          .maybeSingle();

        // It's a first subscription if no record exists OR if the existing record is in trial/trialing status
        const isFirstSubscription = !existingSub || existingSub.status === "trialing";

        const emailEventType = isFirstSubscription && !isRenewal
          ? "email_subscription_active"
          : "email_payment_confirmed";

        // Send welcome email for first subscription, payment confirmation for renewals
        logStep("Determining email type", {
          isFirstSubscription,
          isRenewal,
          existingStatus: existingSub?.status,
        });

        const ok = await sendPaymentConfirmationEmailForInvoice(
          stripe,
          invoice,
          customerEmail,
          isFirstSubscription && !isRenewal
        );

        if (ok) {
          await supabaseAdmin.from("activity_logs").insert({
            user_id: targetUserId,
            user_email: customerEmail,
            event_type: emailEventType,
            event_message: "Subscription email sent",
            event_details: {
              invoiceId: invoice.id,
              invoiceNumber: invoice.number,
              renewal: isRenewal,
              firstSubscription: isFirstSubscription,
            },
          });
        }
        
        // Send owner notification email
        let planType = "monthly";
        if (invoice.subscription) {
          try {
            const subscription = await stripe.subscriptions.retrieve(invoice.subscription as string);
            planType = subscription.items?.data?.[0]?.price?.recurring?.interval === 'year' ? 'yearly' : 'monthly';
          } catch (e) {
            logStep("Could not retrieve subscription for plan type", { error: String(e) });
          }
        }
        
        // Get customer name
        const customerId = typeof invoice.customer === 'string' ? invoice.customer : (invoice.customer as any)?.id;
        let customerName: string | null = null;
        if (customerId) {
          try {
            const customer = await stripe.customers.retrieve(customerId);
            customerName = (customer as any).name;
          } catch (e) {
            logStep("Could not retrieve customer name for owner notification", { error: String(e) });
          }
        }
        
        await sendOwnerPurchaseNotificationEmail(
          customerEmail,
          customerName,
          planType,
          invoice.amount_paid || 0,
          invoice.currency || 'eur',
          isFirstSubscription && !isRenewal,
          false,
          0
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
            
            // Get customer details for email
            const customerId = typeof subscription.customer === 'string' 
              ? subscription.customer 
              : (subscription.customer as any)?.id;
            
            let customerEmail: string | null = null;
            let customerName: string | null = null;
            
            if (customerId) {
              try {
                const customer = await stripe.customers.retrieve(customerId);
                customerEmail = (customer as any).email;
                customerName = (customer as any).name;
              } catch (e) {
                logStep("Could not retrieve customer for email", { error: String(e) });
              }
            }
            
            // Sync device slots for the user
            const userId = subscription.metadata?.user_id;
              
            if (userId && customerId) {
              await syncDeviceSlotsForUser(supabaseAdmin, userId, stripe, customerId);
              logStep("Device slots synced after unpaid invoice cancellation", { userId });
            }
            
            // Send cancellation email
            if (customerEmail) {
              const quantity = subscription.items?.data?.[0]?.quantity || 1;
              const period = priceId === "price_1Sj2PMJrU52a7SNLzhpFYfJd" ? "yearly" : "monthly";
              await sendDeviceSlotUnpaidCancellationEmail(
                customerEmail,
                customerName,
                quantity,
                period
              );
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
                user_email: profile?.email || customerEmail || null,
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
    // Handle subscription status changes (trial to active) and plan changes
    if (event.type === "customer.subscription.updated") {
      const subscription = event.data.object as Stripe.Subscription;
      const previousAttributes = (event.data as any).previous_attributes;
      
      logStep("Subscription updated", { 
        subscriptionId: subscription.id, 
        status: subscription.status,
        previousStatus: previousAttributes?.status 
      });

      const userId = subscription.metadata?.user_id;
      const customerId = typeof subscription.customer === 'string' 
        ? subscription.customer 
        : (subscription.customer as any)?.id;

      // Check if this is a plan change (price change)
      if (previousAttributes?.items && subscription.status === "active") {
        const previousPriceId = previousAttributes.items?.data?.[0]?.price?.id;
        const newPriceId = subscription.items?.data?.[0]?.price?.id;
        
        // Skip if it's a device slot subscription
        const DEVICE_SLOT_PRICES = [
          "price_1SfhoMJrU52a7SNLpLI3yoEl", // monthly device slot
          "price_1Sj2PMJrU52a7SNLzhpFYfJd", // yearly device slot
        ];
        const isDeviceSlot = DEVICE_SLOT_PRICES.includes(newPriceId || '') || DEVICE_SLOT_PRICES.includes(previousPriceId || '');
        
        if (!isDeviceSlot && previousPriceId && newPriceId && previousPriceId !== newPriceId) {
          logStep("Plan change detected", { previousPriceId, newPriceId });
          
          // Determine old and new plan types
          const previousInterval = previousAttributes.items?.data?.[0]?.price?.recurring?.interval;
          const newInterval = subscription.items?.data?.[0]?.price?.recurring?.interval;
          const oldPlan = previousInterval === 'year' ? 'yearly' : 'monthly';
          const newPlan = newInterval === 'year' ? 'yearly' : 'monthly';
          
          if (oldPlan !== newPlan && customerId) {
            try {
              const customer = await stripe.customers.retrieve(customerId);
              const customerEmail = (customer as any).email;
              const customerName = (customer as any).name;
              
              if (customerEmail) {
                const amount = subscription.items?.data?.[0]?.price?.unit_amount || 0;
                const currency = subscription.items?.data?.[0]?.price?.currency || 'eur';
                const periodEnd = new Date(subscription.current_period_end * 1000);
                
                await sendPlanChangeEmail(
                  customerEmail,
                  customerName,
                  oldPlan,
                  newPlan,
                  amount,
                  currency,
                  periodEnd
                );
                
                logStep("Plan change email sent", { email: customerEmail, oldPlan, newPlan });
              }
            } catch (e) {
              logStep("Error sending plan change email", { error: String(e) });
            }
            
            // Log the plan change activity
            if (userId) {
              const { data: profile } = await supabaseAdmin
                .from("profiles")
                .select("email")
                .eq("user_id", userId)
                .maybeSingle();

              await supabaseAdmin.from('activity_logs').insert({
                user_id: userId,
                user_email: profile?.email || null,
                event_type: 'plan_changed',
                event_message: `Plan changed from ${oldPlan} to ${newPlan}`,
                event_details: { subscriptionId: subscription.id, oldPlan, newPlan },
              });
            }
          }
        }
      }

      // Check if this is a trial-to-active conversion
      if (previousAttributes?.status === "trialing" && subscription.status === "active") {
        logStep("Trial converted to active subscription");
        
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

      // Check if this is a device-slot-only subscription (legacy) or main subscription
      // With line items approach, main subscription includes device slots, so when it's deleted,
      // device slots are automatically removed too
      const subscriptionItems = subscription.items?.data || [];
      const hasOnlyDeviceSlots = subscriptionItems.every((item: any) => 
        DEVICE_SLOT_PRICES.includes(item.price?.id || '')
      );

      const userId = subscription.metadata?.user_id;
      const customerId = typeof subscription.customer === 'string' ? subscription.customer : (subscription.customer as any)?.id;
      
      if (userId) {
        // Only update main subscription status if this isn't a device-slot-only subscription
        if (!hasOnlyDeviceSlots) {
          await supabaseAdmin
            .from("subscriptions")
            .update({ 
              status: "canceled",
              device_slots: 1, // Reset to base slot when subscription is canceled
              updated_at: new Date().toISOString()
            })
            .eq("user_id", userId);

          logStep("Subscription marked as canceled", { userId });
        } else {
          // Legacy: device-slot-only subscription canceled, sync device slots
          if (customerId) {
            await syncDeviceSlotsForUser(supabaseAdmin, userId, stripe, customerId);
          }
        }

        // Log subscription canceled activity
        const { data: profile } = await supabaseAdmin
          .from("profiles")
          .select("email")
          .eq("user_id", userId)
          .maybeSingle();

        await supabaseAdmin.from('activity_logs').insert({
          user_id: userId,
          user_email: profile?.email || null,
          event_type: hasOnlyDeviceSlots ? 'device_slot_canceled' : 'subscription_canceled',
          event_message: hasOnlyDeviceSlots ? 'Device slot canceled' : 'Subscription canceled',
          event_details: { subscriptionId: subscription.id },
        });

        // Send churn email for main subscription cancellations (not device slots only)
        if (!hasOnlyDeviceSlots && profile?.email) {
          let customerName: string | null = null;
          
          if (customerId) {
            try {
              const customer = await stripe.customers.retrieve(customerId);
              customerName = (customer as any).name;
            } catch (e) {
              logStep("Could not retrieve customer name", { error: String(e) });
            }
          }
          
          const planType = subscription.items?.data?.[0]?.price?.recurring?.interval === 'year' ? 'yearly' : 'monthly';
          await sendSubscriptionCanceledEmail(profile.email, customerName, planType);
          
          // Send owner notification about the cancellation
          await sendOwnerCancellationNotificationEmail(profile.email, customerName, planType, false, 0);
        }
        
        // Send owner notification for legacy device slot subscription cancellations
        if (hasOnlyDeviceSlots && profile?.email) {
          let customerName: string | null = null;
          
          if (customerId) {
            try {
              const customer = await stripe.customers.retrieve(customerId);
              customerName = (customer as any).name;
            } catch (e) {
              logStep("Could not retrieve customer name for device slot", { error: String(e) });
            }
          }
          
          const planType = subscription.items?.data?.[0]?.price?.recurring?.interval === 'year' ? 'yearly' : 'monthly';
          const quantity = subscription.items?.data?.[0]?.quantity || 1;
          await sendOwnerCancellationNotificationEmail(profile.email, customerName, planType, true, quantity);
        }
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
