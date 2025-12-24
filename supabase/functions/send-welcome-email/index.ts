import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@4.0.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY") as string);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Brand colors matching the app
const brandColors = {
  background: "#0f0f23",
  cardBackground: "#1a1a2e",
  primary: "#8b5cf6",
  primaryHover: "#7c3aed",
  text: "#ffffff",
  textMuted: "#a1a1aa",
  border: "#27272a",
  success: "#22c55e",
};

interface WelcomeEmailRequest {
  email: string;
  name?: string;
}

const generateWelcomeEmailHtml = (email: string, name?: string) => {
  const displayName = name || email.split('@')[0];
  
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="background-color: ${brandColors.background}; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; margin: 0; padding: 40px 20px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td align="center">
        <table role="presentation" width="520" cellpadding="0" cellspacing="0" style="background-color: ${brandColors.cardBackground}; border-radius: 16px; border: 1px solid ${brandColors.border}; max-width: 520px;">
          <tr>
            <td style="padding: 40px;">
              <!-- Logo -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="padding-bottom: 32px;">
                    <img src="https://hjecjqyonxvrrvprbvgr.supabase.co/storage/v1/object/public/playlist-covers/ambian-logo.png" alt="Ambian" width="140" style="display: block;">
                  </td>
                </tr>
              </table>
              
              <!-- Welcome Icon -->
              <div style="text-align: center; margin-bottom: 24px;">
                <div style="display: inline-block; width: 64px; height: 64px; background-color: ${brandColors.primary}20; border-radius: 50%; line-height: 64px; font-size: 32px;">
                  🎉
                </div>
              </div>
              
              <!-- Heading -->
              <h1 style="color: ${brandColors.text}; font-size: 28px; font-weight: 700; text-align: center; margin: 0 0 8px 0;">
                Welcome to Ambian!
              </h1>
              
              <p style="color: ${brandColors.primary}; font-size: 16px; text-align: center; margin: 0 0 24px 0;">
                Hi ${displayName}! 👋
              </p>
              
              <!-- Description -->
              <p style="color: ${brandColors.textMuted}; font-size: 16px; line-height: 26px; text-align: center; margin: 0 0 32px 0;">
                Thank you for joining Ambian! You now have access to premium, license-free background music for your business. Your 7-day free trial has started.
              </p>
              
              <!-- Features Box -->
              <div style="background-color: ${brandColors.background}; border-radius: 12px; padding: 24px; margin-bottom: 32px; border: 1px solid ${brandColors.border};">
                <h3 style="color: ${brandColors.text}; font-size: 16px; font-weight: 600; margin: 0 0 16px 0; text-align: center;">
                  Here's what you can do:
                </h3>
                
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="padding: 8px 0;">
                      <table role="presentation" cellpadding="0" cellspacing="0">
                        <tr>
                          <td style="width: 32px; vertical-align: top;">
                            <span style="color: ${brandColors.success}; font-size: 16px;">✓</span>
                          </td>
                          <td style="color: ${brandColors.textMuted}; font-size: 14px; line-height: 22px;">
                            Browse 50+ curated playlists across moods and genres
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0;">
                      <table role="presentation" cellpadding="0" cellspacing="0">
                        <tr>
                          <td style="width: 32px; vertical-align: top;">
                            <span style="color: ${brandColors.success}; font-size: 16px;">✓</span>
                          </td>
                          <td style="color: ${brandColors.textMuted}; font-size: 14px; line-height: 22px;">
                            Schedule music to play automatically throughout the day
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0;">
                      <table role="presentation" cellpadding="0" cellspacing="0">
                        <tr>
                          <td style="width: 32px; vertical-align: top;">
                            <span style="color: ${brandColors.success}; font-size: 16px;">✓</span>
                          </td>
                          <td style="color: ${brandColors.textMuted}; font-size: 14px; line-height: 22px;">
                            Use on any device - web, mobile, or tablet
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0;">
                      <table role="presentation" cellpadding="0" cellspacing="0">
                        <tr>
                          <td style="width: 32px; vertical-align: top;">
                            <span style="color: ${brandColors.success}; font-size: 16px;">✓</span>
                          </td>
                          <td style="color: ${brandColors.textMuted}; font-size: 14px; line-height: 22px;">
                            All music is fully licensed for commercial use
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                </table>
              </div>
              
              <!-- CTA Button -->
              <div style="text-align: center; margin: 0 0 32px 0;">
                <a href="https://ambianmusic.com" style="display: inline-block; background-color: ${brandColors.primary}; color: ${brandColors.text}; font-size: 16px; font-weight: 600; text-decoration: none; padding: 16px 40px; border-radius: 8px;">
                  Start Listening
                </a>
              </div>
              
              <!-- Trial reminder -->
              <div style="background-color: ${brandColors.primary}15; border-radius: 8px; padding: 16px; text-align: center; border: 1px solid ${brandColors.primary}30;">
                <p style="color: ${brandColors.text}; font-size: 14px; font-weight: 600; margin: 0 0 4px 0;">
                  🎁 Your 7-day free trial is active
                </p>
                <p style="color: ${brandColors.textMuted}; font-size: 13px; margin: 0;">
                  No credit card required. Explore everything Ambian has to offer!
                </p>
              </div>
              
              <!-- Divider -->
              <hr style="border: none; border-top: 1px solid ${brandColors.border}; margin: 32px 0 24px 0;">
              
              <!-- Help -->
              <p style="color: ${brandColors.textMuted}; font-size: 13px; text-align: center; margin: 0;">
                Questions? Just reply to this email or visit our 
                <a href="https://ambianmusic.com/help" style="color: ${brandColors.primary}; text-decoration: none;">Help Center</a>.
              </p>
            </td>
          </tr>
        </table>
        
        <!-- Footer branding -->
        <table role="presentation" width="520" cellpadding="0" cellspacing="0" style="max-width: 520px;">
          <tr>
            <td align="center" style="padding-top: 24px;">
              <p style="color: ${brandColors.textMuted}; font-size: 12px; margin: 0 0 4px 0;">
                © ${new Date().getFullYear()} Ambian. Premium background music for businesses.
              </p>
              <a href="https://ambianmusic.com" style="color: ${brandColors.primary}; font-size: 12px; text-decoration: none;">
                ambianmusic.com
              </a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;
};

const generateAdminNotificationHtml = (email: string, name?: string) => {
  const displayName = name || email.split('@')[0];
  const signupDate = new Date().toLocaleString('en-US', { 
    dateStyle: 'full', 
    timeStyle: 'short',
    timeZone: 'Europe/Helsinki'
  });
  
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="background-color: ${brandColors.background}; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; margin: 0; padding: 40px 20px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td align="center">
        <table role="presentation" width="520" cellpadding="0" cellspacing="0" style="background-color: ${brandColors.cardBackground}; border-radius: 16px; border: 1px solid ${brandColors.border}; max-width: 520px;">
          <tr>
            <td style="padding: 40px;">
              <!-- Logo -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="padding-bottom: 24px;">
                    <img src="https://hjecjqyonxvrrvprbvgr.supabase.co/storage/v1/object/public/playlist-covers/ambian-logo.png" alt="Ambian" width="100" style="display: block;">
                  </td>
                </tr>
              </table>
              
              <!-- New User Icon -->
              <div style="text-align: center; margin-bottom: 20px;">
                <div style="display: inline-block; width: 56px; height: 56px; background-color: ${brandColors.success}20; border-radius: 50%; line-height: 56px; font-size: 28px;">
                  🎉
                </div>
              </div>
              
              <!-- Heading -->
              <h1 style="color: ${brandColors.text}; font-size: 24px; font-weight: 700; text-align: center; margin: 0 0 24px 0;">
                New User Signup!
              </h1>
              
              <!-- User Info Box -->
              <div style="background-color: ${brandColors.background}; border-radius: 12px; padding: 24px; margin-bottom: 24px; border: 1px solid ${brandColors.border};">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="padding: 8px 0;">
                      <span style="color: ${brandColors.textMuted}; font-size: 13px;">Name</span>
                      <p style="color: ${brandColors.text}; font-size: 16px; font-weight: 600; margin: 4px 0 0 0;">${displayName}</p>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0;">
                      <span style="color: ${brandColors.textMuted}; font-size: 13px;">Email</span>
                      <p style="color: ${brandColors.text}; font-size: 16px; font-weight: 600; margin: 4px 0 0 0;">
                        <a href="mailto:${email}" style="color: ${brandColors.primary}; text-decoration: none;">${email}</a>
                      </p>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0;">
                      <span style="color: ${brandColors.textMuted}; font-size: 13px;">Signed up</span>
                      <p style="color: ${brandColors.text}; font-size: 16px; font-weight: 600; margin: 4px 0 0 0;">${signupDate}</p>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0;">
                      <span style="color: ${brandColors.textMuted}; font-size: 13px;">Trial Status</span>
                      <p style="color: ${brandColors.success}; font-size: 16px; font-weight: 600; margin: 4px 0 0 0;">7-day free trial started</p>
                    </td>
                  </tr>
                </table>
              </div>
              
              <!-- CTA Button -->
              <div style="text-align: center;">
                <a href="https://ambianmusic.com/admin" style="display: inline-block; background-color: ${brandColors.primary}; color: ${brandColors.text}; font-size: 14px; font-weight: 600; text-decoration: none; padding: 12px 32px; border-radius: 8px;">
                  View in Admin Panel
                </a>
              </div>
            </td>
          </tr>
        </table>
        
        <!-- Footer -->
        <table role="presentation" width="520" cellpadding="0" cellspacing="0" style="max-width: 520px;">
          <tr>
            <td align="center" style="padding-top: 20px;">
              <p style="color: ${brandColors.textMuted}; font-size: 12px; margin: 0;">
                This is an automated notification from Ambian.
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
};

serve(async (req) => {
  console.log("send-welcome-email function invoked");

  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    console.log("Invalid method:", req.method);
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  try {
    const { email, name }: WelcomeEmailRequest = await req.json();

    if (!email) {
      return new Response(
        JSON.stringify({ error: "Missing required field: email" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Sending welcome email to:", email);

    const welcomeHtml = generateWelcomeEmailHtml(email, name);

    // Send the welcome email to the user
    const { data: emailData, error: emailError } = await resend.emails.send({
      from: "Ambian <noreply@ambianmusic.com>",
      to: [email],
      subject: "Welcome to Ambian! 🎵 Your free trial has started",
      html: welcomeHtml,
    });

    if (emailError) {
      console.error("Resend error:", emailError);
      throw emailError;
    }

    console.log("Welcome email sent successfully:", emailData);

    // Send admin notification email
    try {
      const adminHtml = generateAdminNotificationHtml(email, name);
      
      const { error: adminEmailError } = await resend.emails.send({
        from: "Ambian <noreply@ambianmusic.com>",
        to: ["info@ambian.fi"],
        subject: `🎉 New signup: ${name || email}`,
        html: adminHtml,
      });

      if (adminEmailError) {
        console.error("Admin notification email error:", adminEmailError);
        // Don't throw - we still want to return success for the welcome email
      } else {
        console.log("Admin notification email sent successfully");
      }
    } catch (adminError) {
      console.error("Error sending admin notification:", adminError);
      // Don't throw - the main welcome email was sent successfully
    }

    return new Response(JSON.stringify({ 
      success: true, 
      message: "Welcome email sent"
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("Error in send-welcome-email:", error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
