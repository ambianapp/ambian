import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { Resend } from "https://esm.sh/resend@2.0.0";

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[INVOICE-REMINDERS] ${step}${detailsStr}`);
};

// Email wrapper with proper dark mode support
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
    <tr>
      <td style="background-color: #1a1a2e; height: 40px;" bgcolor="#1a1a2e">&nbsp;</td>
    </tr>
  </table>
</body>
</html>
`;

async function sendInvoiceReminderEmail(
  resend: any,
  email: string,
  customerName: string | null,
  amount: number,
  currency: string,
  dueDate: Date,
  hostedInvoiceUrl: string | null,
  invoiceNumber: string | null,
  daysRemaining: number
) {
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

  const urgencyText = daysRemaining <= 1 
    ? "⚠️ Your invoice is due tomorrow!" 
    : `⏰ Your invoice is due in ${daysRemaining} days`;

  const html = emailWrapper(`
          <!-- Header -->
          <tr>
            <td style="padding: 40px 40px 20px; text-align: center;">
              <img src="https://ambianmusic.com/ambian-logo.png" alt="Ambian" width="120" style="display: block; margin: 0 auto 20px;" />
              <h1 style="color: #ffffff; font-size: 28px; font-weight: 600; margin: 0;">
                ${urgencyText}
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
                This is a friendly reminder that you have an unpaid invoice for your Ambian subscription.
              </p>
              
              <!-- Details Box -->
              <div style="background: rgba(255,255,255,0.05); border-radius: 12px; padding: 24px; margin: 20px 0; border: 1px solid rgba(255,255,255,0.1);">
                <table width="100%" cellpadding="0" cellspacing="0">
                  ${invoiceNumber ? `
                  <tr>
                    <td style="padding: 8px 0;">
                      <span style="color: #888888; font-size: 14px;">Invoice:</span>
                      <span style="color: #ffffff; font-size: 14px; margin-left: 12px; font-weight: 500;">${invoiceNumber}</span>
                    </td>
                  </tr>
                  ` : ''}
                  <tr>
                    <td style="padding: 8px 0;">
                      <span style="color: #888888; font-size: 14px;">Amount:</span>
                      <span style="color: #ffffff; font-size: 14px; margin-left: 12px; font-weight: 500;">${formattedAmount}</span>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0;">
                      <span style="color: #888888; font-size: 14px;">Due by:</span>
                      <span style="color: ${daysRemaining <= 1 ? '#fca5a5' : '#ffffff'}; font-size: 14px; margin-left: 12px; font-weight: 500;">${formattedDueDate}</span>
                    </td>
                  </tr>
                </table>
              </div>
              
              <!-- Warning for IBAN -->
              <div style="background: rgba(251, 191, 36, 0.1); border-radius: 12px; padding: 16px; margin: 20px 0; border: 1px solid rgba(251, 191, 36, 0.3);">
                <p style="color: #fbbf24; font-size: 14px; margin: 0;">
                  <strong>💡 Paying by bank transfer (IBAN)?</strong><br>
                  Please initiate payment today as bank transfers may take 1-3 business days to process.
                </p>
              </div>
              
              <!-- CTA Button -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="padding: 20px 0 30px;">
                    <a href="${hostedInvoiceUrl || 'https://ambianmusic.com/profile'}" style="display: inline-block; background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); color: #ffffff; text-decoration: none; padding: 16px 40px; border-radius: 8px; font-size: 16px; font-weight: 600;">
                      Pay Invoice Now
                    </a>
                  </td>
                </tr>
              </table>
              
              <p style="color: #888888; font-size: 14px; line-height: 1.6; margin: 0;">
                If you've already paid, please disregard this email. Payments may take a few hours to be reflected in our system.
              </p>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="padding: 20px 40px 40px; text-align: center; border-top: 1px solid rgba(255,255,255,0.1);">
              <p style="color: #888888; font-size: 14px; margin: 0;">
                Questions? Contact us at <a href="mailto:info@ambian.fi" style="color: #8b5cf6; text-decoration: none;">info@ambian.fi</a>
              </p>
            </td>
          </tr>
  `);

  try {
    const { data, error } = await resend.emails.send({
      from: "Ambian <noreply@ambianmusic.com>",
      to: [email],
      subject: `${daysRemaining <= 1 ? '⚠️ ' : ''}Payment Reminder: Invoice due ${daysRemaining <= 1 ? 'tomorrow' : `in ${daysRemaining} days`} (${formattedAmount})`,
      html,
    });

    if (error) {
      logStep("Error sending reminder email", { error, email });
      return false;
    }

    logStep("Reminder email sent", { emailId: data?.id, to: email, invoiceNumber });
    return true;
  } catch (error) {
    logStep("Failed to send reminder email", { error: String(error), email });
    return false;
  }
}

serve(async (req) => {
  try {
    logStep("Function started - checking for invoices due soon");

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    const resendKey = Deno.env.get("RESEND_API_KEY");
    
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not set");
    if (!resendKey) throw new Error("RESEND_API_KEY is not set");

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
    const resend = new Resend(resendKey);

    // Get all open invoices (status: "open" means sent but not paid)
    const invoices = await stripe.invoices.list({
      status: "open",
      limit: 100,
    });

    logStep("Found open invoices", { count: invoices.data.length });

    const now = new Date();
    let remindersSent = 0;
    let errors = 0;

    for (const invoice of invoices.data) {
      // Skip if no due date or no customer email
      if (!invoice.due_date || !invoice.customer_email) {
        continue;
      }

      const dueDate = new Date(invoice.due_date * 1000);
      const daysUntilDue = Math.ceil((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

      // Send reminder if due in 2 days or 1 day (but not overdue or too far out)
      if (daysUntilDue <= 2 && daysUntilDue >= 0) {
        logStep("Sending reminder for invoice", { 
          invoiceId: invoice.id, 
          number: invoice.number,
          email: invoice.customer_email,
          daysUntilDue,
          amount: invoice.amount_due,
        });

        // Get customer name
        let customerName: string | null = null;
        if (invoice.customer && typeof invoice.customer === 'string') {
          try {
            const customer = await stripe.customers.retrieve(invoice.customer);
            if (customer && !customer.deleted) {
              customerName = customer.name || null;
            }
          } catch {
            // Ignore customer retrieval errors
          }
        }

        const success = await sendInvoiceReminderEmail(
          resend,
          invoice.customer_email,
          customerName,
          invoice.amount_due,
          invoice.currency,
          dueDate,
          invoice.hosted_invoice_url,
          invoice.number,
          daysUntilDue
        );

        if (success) {
          remindersSent++;
        } else {
          errors++;
        }
      }
    }

    logStep("Completed", { remindersSent, errors, totalChecked: invoices.data.length });

    return new Response(JSON.stringify({ 
      success: true, 
      remindersSent, 
      errors,
      totalChecked: invoices.data.length,
    }), {
      headers: { "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message: errorMessage });
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { "Content-Type": "application/json" },
      status: 500,
    });
  }
});
