import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@2.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: Record<string, unknown>) => {
  console.log(`[TRIAL-REMINDER] ${step}`, details ? JSON.stringify(details) : '');
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    logStep("Function started");

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    // Get reminder days from request body or default to 3 days
    let reminderDays = 3;
    try {
      const body = await req.json();
      if (body.reminderDays) {
        reminderDays = body.reminderDays;
      }
    } catch {
      // No body or invalid JSON, use default
    }

    // Calculate the date range for expiring trials
    const now = new Date();
    const reminderDate = new Date(now.getTime() + reminderDays * 24 * 60 * 60 * 1000);
    const startOfDay = new Date(reminderDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(reminderDate);
    endOfDay.setHours(23, 59, 59, 999);

    logStep("Checking for expiring trials", { 
      reminderDays, 
      startOfDay: startOfDay.toISOString(), 
      endOfDay: endOfDay.toISOString() 
    });

    // Find users with trials expiring in X days
    const { data: expiringSubscriptions, error: subError } = await supabaseAdmin
      .from('subscriptions')
      .select('user_id, current_period_end')
      .eq('status', 'trialing')
      .gte('current_period_end', startOfDay.toISOString())
      .lte('current_period_end', endOfDay.toISOString());

    if (subError) {
      throw new Error(`Failed to fetch subscriptions: ${subError.message}`);
    }

    logStep("Found expiring trials", { count: expiringSubscriptions?.length || 0 });

    if (!expiringSubscriptions || expiringSubscriptions.length === 0) {
      return new Response(JSON.stringify({ 
        success: true, 
        message: "No expiring trials found",
        emailsSent: 0 
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    // Get user profiles for email addresses
    const userIds = expiringSubscriptions.map(s => s.user_id);
    const { data: profiles, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('user_id, email, full_name')
      .in('user_id', userIds);

    if (profileError) {
      throw new Error(`Failed to fetch profiles: ${profileError.message}`);
    }

    logStep("Fetched user profiles", { count: profiles?.length || 0 });

    let emailsSent = 0;
    const errors: string[] = [];

    for (const subscription of expiringSubscriptions) {
      const profile = profiles?.find(p => p.user_id === subscription.user_id);
      
      if (!profile?.email) {
        logStep("Skipping user without email", { userId: subscription.user_id });
        continue;
      }

      const expiryDate = new Date(subscription.current_period_end!);
      const formattedDate = expiryDate.toLocaleDateString('en-US', { 
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      });

      try {
        const { error: emailError } = await resend.emails.send({
          from: "Ambian <noreply@ambianmusic.com>",
          to: [profile.email],
          subject: `Your Ambian trial expires in ${reminderDays} days`,
          html: `
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
                            ⏰ Your Trial is Ending Soon
                          </h1>
                        </td>
                      </tr>
                      
                      <!-- Content -->
                      <tr>
                        <td style="padding: 20px 40px;">
                          <p style="color: #e0e0e0; font-size: 16px; line-height: 1.6; margin: 0 0 20px;">
                            Hi${profile.full_name ? ` ${profile.full_name}` : ''},
                          </p>
                          <p style="color: #e0e0e0; font-size: 16px; line-height: 1.6; margin: 0 0 20px;">
                            Just a friendly reminder that your Ambian free trial will expire on <strong style="color: #ffffff;">${formattedDate}</strong>.
                          </p>
                          <p style="color: #e0e0e0; font-size: 16px; line-height: 1.6; margin: 0 0 30px;">
                            To continue enjoying unlimited access to our curated music library for your business, please subscribe before your trial ends.
                          </p>
                          
                          <!-- CTA Button -->
                          <table width="100%" cellpadding="0" cellspacing="0">
                            <tr>
                              <td align="center" style="padding: 10px 0 30px;">
                                <a href="https://ambian.app/pricing" style="display: inline-block; background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); color: #ffffff; text-decoration: none; padding: 16px 40px; border-radius: 8px; font-size: 16px; font-weight: 600;">
                                  View Plans & Subscribe
                                </a>
                              </td>
                            </tr>
                          </table>
                          
                          <!-- Benefits reminder -->
                          <div style="background: rgba(255,255,255,0.05); border-radius: 12px; padding: 24px; margin-bottom: 20px;">
                            <h3 style="color: #ffffff; font-size: 16px; margin: 0 0 16px;">What you'll keep with a subscription:</h3>
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
                          <p style="color: #888888; font-size: 14px; margin: 0;">
                            Questions? Just reply to this email or visit our <a href="https://ambian.app/help" style="color: #8b5cf6; text-decoration: none;">Help Center</a>.
                          </p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </body>
            </html>
          `,
        });

        if (emailError) {
          throw emailError;
        }

        emailsSent++;
        logStep("Email sent successfully", { email: profile.email });
      } catch (emailErr) {
        const errorMessage = emailErr instanceof Error ? emailErr.message : String(emailErr);
        errors.push(`Failed to send to ${profile.email}: ${errorMessage}`);
        logStep("Failed to send email", { email: profile.email, error: errorMessage });
      }
    }

    logStep("Function completed", { emailsSent, errors: errors.length });

    return new Response(JSON.stringify({ 
      success: true, 
      emailsSent,
      errors: errors.length > 0 ? errors : undefined
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
