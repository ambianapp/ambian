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
};

// Get email content based on type
const getEmailContent = (emailType: string) => {
  switch (emailType) {
    case "recovery":
      return {
        subject: "Reset Your Ambian Password",
        heading: "Reset Your Password",
        description: "We received a request to reset your password. Click the button below to create a new password.",
        buttonText: "Reset Password",
        footerNote: "If you didn't request a password reset, you can safely ignore this email.",
      };
    case "signup":
      return {
        subject: "Welcome to Ambian - Confirm Your Email",
        heading: "Welcome to Ambian!",
        description: "Thanks for signing up. Please confirm your email address to get started with premium background music for your business.",
        buttonText: "Confirm Email",
        footerNote: "If you didn't create an Ambian account, you can safely ignore this email.",
      };
    case "magiclink":
      return {
        subject: "Your Ambian Login Link",
        heading: "Sign In to Ambian",
        description: "Click the button below to securely sign in to your account. This link expires in 1 hour.",
        buttonText: "Sign In",
        footerNote: "If you didn't request this login link, you can safely ignore this email.",
      };
    case "invite":
      return {
        subject: "You're Invited to Ambian",
        heading: "You've Been Invited!",
        description: "You've been invited to join Ambian. Click below to accept your invitation and set up your account.",
        buttonText: "Accept Invitation",
        footerNote: "If you weren't expecting this invitation, you can safely ignore this email.",
      };
    case "email_change":
      return {
        subject: "Confirm Your New Email - Ambian",
        heading: "Confirm Email Change",
        description: "Please confirm your new email address by clicking the button below.",
        buttonText: "Confirm New Email",
        footerNote: "If you didn't request this change, please contact support immediately.",
      };
    default:
      return {
        subject: "Ambian",
        heading: "Hello!",
        description: "Click the button below to continue.",
        buttonText: "Continue",
        footerNote: "",
      };
  }
};

// Generate branded HTML email
const generateEmailHtml = (
  content: ReturnType<typeof getEmailContent>,
  actionUrl: string,
  userEmail: string,
  otp?: string
) => {
  const showOtp = otp && otp.length > 0;
  
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
              
              <!-- Heading -->
              <h1 style="color: ${brandColors.text}; font-size: 24px; font-weight: 600; text-align: center; margin: 0 0 16px 0;">
                ${content.heading}
              </h1>
              
              <!-- Description -->
              <p style="color: ${brandColors.textMuted}; font-size: 16px; line-height: 24px; text-align: center; margin: 0 0 32px 0;">
                ${content.description}
              </p>
              
              <!-- CTA Button -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="padding-bottom: 32px;">
                    <a href="${actionUrl}" style="background-color: ${brandColors.primary}; border-radius: 8px; color: #ffffff; display: inline-block; font-size: 16px; font-weight: 600; padding: 14px 32px; text-decoration: none; text-align: center;">
                      ${content.buttonText}
                    </a>
                  </td>
                </tr>
              </table>
              
              <!-- Divider -->
              <hr style="border: none; border-top: 1px solid ${brandColors.border}; margin: 24px 0;">
              
              ${showOtp ? `
              <!-- OTP Code -->
              <p style="color: ${brandColors.textMuted}; font-size: 14px; text-align: center; margin: 0 0 12px 0;">
                Or use this verification code:
              </p>
              <p style="background-color: ${brandColors.background}; border: 1px solid ${brandColors.border}; border-radius: 8px; color: ${brandColors.text}; font-size: 28px; font-weight: 700; letter-spacing: 4px; padding: 16px; text-align: center; margin: 0 0 24px 0;">
                ${otp}
              </p>
              ` : ''}
              
              <!-- Footer note -->
              <p style="color: ${brandColors.textMuted}; font-size: 13px; text-align: center; margin: 0 0 8px 0;">
                ${content.footerNote}
              </p>
              
              <!-- Email sent to -->
              <p style="color: ${brandColors.textMuted}; font-size: 12px; text-align: center; margin: 16px 0 0 0;">
                This email was sent to ${userEmail}
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
              <a href="https://ambian.app" style="color: ${brandColors.primary}; font-size: 12px; text-decoration: none;">
                ambian.app
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

interface EmailRequest {
  email: string;
  type: "recovery" | "signup" | "magiclink" | "invite" | "email_change";
  actionUrl: string;
  otp?: string;
}

serve(async (req) => {
  console.log("send-auth-email function invoked");

  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    console.log("Invalid method:", req.method);
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  try {
    const { email, type, actionUrl, otp }: EmailRequest = await req.json();

    if (!email || !type || !actionUrl) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: email, type, actionUrl" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Processing email for:", email, "type:", type);

    const content = getEmailContent(type);
    const html = generateEmailHtml(content, actionUrl, email, otp);

    // Send the email via Resend
    // IMPORTANT: Update the "from" address to use your verified domain
    const { data, error } = await resend.emails.send({
      from: "Ambian <noreply@ambian.app>",
      to: [email],
      subject: content.subject,
      html,
    });

    if (error) {
      console.error("Resend error:", error);
      throw error;
    }

    console.log("Email sent successfully:", data);

    return new Response(JSON.stringify({ success: true, data }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("Error in send-auth-email:", error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
