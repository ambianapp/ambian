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
          <!-- Header -->
          <tr>
            <td style="padding: 40px 40px 20px; text-align: center;">
              <img src="https://ambianmusic.com/ambian-logo.png" alt="Ambian" width="140" style="display: block; margin: 0 auto 20px;" />
              <h1 style="color: #ffffff; font-size: 28px; font-weight: 600; margin: 0;">
                🎉 Welcome to Ambian!
              </h1>
            </td>
          </tr>
          
          <!-- Content -->
          <tr>
            <td style="padding: 20px 40px;">
              <p style="color: #a78bfa; font-size: 18px; line-height: 1.6; margin: 0 0 8px; text-align: center;">
                Hi ${displayName}! 👋
              </p>
              <p style="color: #e0e0e0; font-size: 16px; line-height: 1.6; margin: 0 0 24px; text-align: center;">
                Thank you for joining Ambian! You now have access to premium, license-free background music for your business. Your 3-day free trial has started.
              </p>
              
              <!-- Features Box -->
              <div style="background: rgba(255,255,255,0.05); border-radius: 12px; padding: 24px; margin: 20px 0; border: 1px solid rgba(255,255,255,0.1);">
                <h3 style="color: #ffffff; font-size: 16px; margin: 0 0 16px; text-align: center;">
                  Here's what you can do:
                </h3>
                <table width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="padding: 8px 0;">
                      <span style="color: #10b981; font-size: 16px;">✓</span>
                      <span style="color: #e0e0e0; font-size: 14px; margin-left: 12px;">Browse 50+ curated playlists across moods and genres</span>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0;">
                      <span style="color: #10b981; font-size: 16px;">✓</span>
                      <span style="color: #e0e0e0; font-size: 14px; margin-left: 12px;">Schedule music to play automatically throughout the day</span>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0;">
                      <span style="color: #10b981; font-size: 16px;">✓</span>
                      <span style="color: #e0e0e0; font-size: 14px; margin-left: 12px;">Use on any device - web, mobile, or tablet</span>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0;">
                      <span style="color: #10b981; font-size: 16px;">✓</span>
                      <span style="color: #e0e0e0; font-size: 14px; margin-left: 12px;">All music is fully licensed for commercial use</span>
                    </td>
                  </tr>
                </table>
              </div>
              
              <!-- CTA Button -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="padding: 20px 0 30px;">
                    <a href="https://ambianmusic.com" style="display: inline-block; background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); color: #ffffff; text-decoration: none; padding: 16px 40px; border-radius: 8px; font-size: 16px; font-weight: 600;">
                      Start Listening
                    </a>
                  </td>
                </tr>
              </table>
              
              <!-- Trial reminder -->
              <div style="background: rgba(139, 92, 246, 0.15); border-radius: 12px; padding: 20px; text-align: center; border: 1px solid rgba(139, 92, 246, 0.3);">
                <p style="color: #ffffff; font-size: 14px; font-weight: 600; margin: 0 0 4px;">
                  🎁 Your 3-day free trial is active
                </p>
                <p style="color: #a1a1aa; font-size: 13px; margin: 0;">
                  No credit card required. Explore everything Ambian has to offer!
                </p>
              </div>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="padding: 20px 40px 40px; text-align: center; border-top: 1px solid rgba(255,255,255,0.1);">
              <p style="color: #888888; font-size: 13px; margin: 0 0 10px;">
                Questions? Just reply to this email or visit our 
                <a href="https://ambianmusic.com/help" style="color: #8b5cf6; text-decoration: none;">Help Center</a>
              </p>
              <p style="color: #666666; font-size: 12px; margin: 0;">
                © ${new Date().getFullYear()} Ambian. Premium background music for businesses.
              </p>
            </td>
          </tr>
        </table>
        <!-- Spacer to extend dark background -->
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width: 600px; width: 100%;">
          <tr>
            <td style="padding: 20px; text-align: center;" bgcolor="#1a1a2e">
              <a href="https://ambianmusic.com" style="color: #8b5cf6; font-size: 12px; text-decoration: none;">ambianmusic.com</a>
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
<body style="margin: 0; padding: 0; background-color: #0a0a0a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #0a0a0a; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); border-radius: 16px; overflow: hidden;">
          <!-- Header -->
          <tr>
            <td style="padding: 40px 40px 20px; text-align: center;">
              <img src="https://ambianmusic.com/ambian-logo.png" alt="Ambian" width="100" style="display: block; margin: 0 auto 20px;" />
              <h1 style="color: #ffffff; font-size: 24px; font-weight: 600; margin: 0;">
                🎉 New User Signup!
              </h1>
            </td>
          </tr>
          
          <!-- Content -->
          <tr>
            <td style="padding: 20px 40px;">
              <!-- User Info Box -->
              <div style="background: rgba(255,255,255,0.05); border-radius: 12px; padding: 24px; margin: 20px 0; border: 1px solid rgba(255,255,255,0.1);">
                <table width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="padding: 8px 0;">
                      <span style="color: #888888; font-size: 13px;">Name</span>
                      <p style="color: #ffffff; font-size: 16px; font-weight: 600; margin: 4px 0 0 0;">${displayName}</p>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0;">
                      <span style="color: #888888; font-size: 13px;">Email</span>
                      <p style="color: #ffffff; font-size: 16px; font-weight: 600; margin: 4px 0 0 0;">
                        <a href="mailto:${email}" style="color: #8b5cf6; text-decoration: none;">${email}</a>
                      </p>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0;">
                      <span style="color: #888888; font-size: 13px;">Signed up</span>
                      <p style="color: #ffffff; font-size: 16px; font-weight: 600; margin: 4px 0 0 0;">${signupDate}</p>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0;">
                      <span style="color: #888888; font-size: 13px;">Trial Status</span>
                      <p style="color: #10b981; font-size: 16px; font-weight: 600; margin: 4px 0 0 0;">3-day free trial started</p>
                    </td>
                  </tr>
                </table>
              </div>
              
              <!-- CTA Button -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="padding: 20px 0 20px;">
                    <a href="https://ambianmusic.com/admin" style="display: inline-block; background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-size: 14px; font-weight: 600;">
                      View in Admin Panel
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="padding: 20px 40px 40px; text-align: center; border-top: 1px solid rgba(255,255,255,0.1);">
              <p style="color: #888888; font-size: 12px; margin: 0;">
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

    // Add a small delay to avoid Resend rate limit (2 requests/second)
    await new Promise(resolve => setTimeout(resolve, 600));

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
