// Lovable Cloud backend function: get-signed-audio-url
// Creates signed URLs for private audio objects after validating user access.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SIGNED_URL_EXPIRY = 60 * 60 * 4; // 4 hours
const TRIAL_DAYS = 3;

function extractAudioPath(input: string): string | null {
  if (!input) return null;

  // If caller already sends a path like "folder/file.mp3" just use it.
  if (!input.includes("/")) return input;

  // Full URL formats we commonly see:
  // .../storage/v1/object/public/audio/<path>
  // .../storage/v1/object/audio/<path>
  // .../storage/v1/object/sign/audio/<path>?token=...
  const patterns = [
    "/storage/v1/object/public/audio/",
    "/storage/v1/object/sign/audio/",
    "/storage/v1/object/audio/",
  ];

  for (const p of patterns) {
    const idx = input.indexOf(p);
    if (idx !== -1) {
      const after = input.slice(idx + p.length);
      const path = after.split("?")[0];
      try {
        return decodeURIComponent(path);
      } catch {
        return path;
      }
    }
  }

  // Last resort: take the last segment.
  const parts = input.split("/").filter(Boolean);
  const last = parts[parts.length - 1];
  return last ? last.split("?")[0] : null;
}

async function userHasAccess(
  supabaseAdmin: any,
  userId: string,
  userCreatedAt: string | null | undefined
): Promise<boolean> {
  // Admins always allowed
  const { data: roleRow } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (roleRow) return true;

  // Active / trialing / pending_payment subscription allowed
  const { data: subRow } = await supabaseAdmin
    .from("subscriptions")
    .select("status, current_period_end")
    .eq("user_id", userId)
    .maybeSingle();

  if (subRow?.status && ["active", "trialing", "pending_payment"].includes(subRow.status)) {
    if (!subRow.current_period_end) return true;
    const end = new Date(subRow.current_period_end).getTime();
    return Date.now() < end;
  }

  // App trial: within TRIAL_DAYS of auth user created_at (must match check-subscription logic)
  if (!userCreatedAt) return false;
  const createdAt = new Date(userCreatedAt).getTime();
  const ms = TRIAL_DAYS * 24 * 60 * 60 * 1000;
  return Date.now() - createdAt < ms;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    // Validate JWT from caller
    const authHeader = req.headers.get("authorization") ?? "";
    const jwt = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!jwt) {
      return new Response(JSON.stringify({ error: "missing_authorization" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const {
      data: { user },
      error: userErr,
    } = await supabaseAdmin.auth.getUser(jwt);
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: "invalid_token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const audioUrl = typeof body?.audioUrl === "string" ? body.audioUrl : "";
    const path = typeof body?.path === "string" ? body.path : "";
    const input = path || audioUrl;

    const filePath = extractAudioPath(input);
    if (!filePath) {
      return new Response(JSON.stringify({ error: "invalid_path" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const ok = await userHasAccess(supabaseAdmin, user.id, user.created_at);
    if (!ok) {
      return new Response(JSON.stringify({ error: "forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data, error } = await supabaseAdmin.storage
      .from("audio")
      .createSignedUrl(filePath, SIGNED_URL_EXPIRY);

    if (error || !data?.signedUrl) {
      console.error("[get-signed-audio-url] createSignedUrl failed", { error, filePath });
      return new Response(JSON.stringify({ error: "signed_url_failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ signedUrl: data.signedUrl }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[get-signed-audio-url] unexpected", e);
    return new Response(JSON.stringify({ error: "unexpected" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
