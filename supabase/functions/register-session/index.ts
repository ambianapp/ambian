import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_ORIGINS = [
  "http://localhost:5173",
  "http://localhost:8080",
  "https://lovable.dev",
  "https://ambian.fi",
  "https://ambian.app",
  "https://ambianmusic.com",
  "https://www.ambianmusic.com",
  "https://hjecjqyonxvrrvprbvgr.supabase.co",
];

function getCorsHeaders(origin: string | null) {
  const allowedOrigin = origin && (ALLOWED_ORIGINS.includes(origin) || origin.endsWith(".lovable.app") || origin.endsWith(".lovableproject.com"))
    ? origin
    : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

serve(async (req) => {
  const origin = req.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Authenticate the user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Parse request body
    const { sessionId, deviceInfo, forceRegister, disconnectSessionId, deviceFingerprint } = await req.json();
    if (!sessionId) {
      return new Response(JSON.stringify({ error: "Missing sessionId" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Use service role client to manage sessions (bypass RLS)
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    // Handle disconnect request - remove a specific session
    if (disconnectSessionId) {
      const { error: deleteError } = await adminClient
        .from("active_sessions")
        .delete()
        .eq("user_id", user.id)
        .eq("session_id", disconnectSessionId);

      if (deleteError) {
        console.error("Error disconnecting session:", deleteError);
        return new Response(JSON.stringify({ error: "Failed to disconnect session" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      console.log(`Disconnected session: ${disconnectSessionId}`);

    // IMPORTANT: Keep the CURRENT device session alive.
    // On iOS/Safari, the client may not immediately re-register after a disconnect.
    // If the current device doesn't have an active_sessions row at this moment,
    // realtime/interval validation can interpret that as being "kicked" and sign the
    // user out on the next interaction. We defensively (re)register the caller session.
    try {
      if (sessionId) {
        const { data: existingCallerSession, error: existingCallerErr } = await adminClient
          .from("active_sessions")
          .select("id")
          .eq("user_id", user.id)
          .eq("session_id", sessionId)
          .maybeSingle();

        if (existingCallerErr) {
          console.warn("Failed to check caller session during disconnect:", existingCallerErr);
        } else if (existingCallerSession?.id) {
          await adminClient
            .from("active_sessions")
            .update({ device_info: deviceInfo, updated_at: new Date().toISOString() })
            .eq("id", existingCallerSession.id);
        } else {
          await adminClient
            .from("active_sessions")
            .insert({
              user_id: user.id,
              session_id: sessionId,
              device_info: deviceInfo,
            });
        }
      }
    } catch (e) {
      // Non-fatal; disconnect should still succeed.
      console.warn("Failed to keep caller session alive during disconnect:", e);
    }

      return new Response(JSON.stringify({ success: true, message: "Session disconnected" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if user is admin (admins have unlimited devices)
    const { data: roleData } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle();

    const isAdmin = !!roleData;

    // Get device slots limit from subscription (only matters for non-admins)
    let deviceSlots = 999; // Unlimited for admins
    if (!isAdmin) {
      const { data: subData } = await adminClient
        .from("subscriptions")
        .select("device_slots")
        .eq("user_id", user.id)
        .maybeSingle();

      deviceSlots = subData?.device_slots || 1;
    }

    // Check if this session already exists
    const { data: existingSession } = await adminClient
      .from("active_sessions")
      .select("id, session_id")
      .eq("user_id", user.id)
      .eq("session_id", sessionId)
      .maybeSingle();

    if (existingSession) {
      // Session already registered, just update timestamp
      await adminClient
        .from("active_sessions")
        .update({ device_info: deviceInfo, updated_at: new Date().toISOString() })
        .eq("id", existingSession.id);

      return new Response(JSON.stringify({ success: true, message: "Session updated", isRegistered: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // DEVICE FINGERPRINT CONSOLIDATION:
    // If a fingerprint is provided, check if another session from the same device exists.
    // This handles the case where the same physical device is using different browsers.
    if (deviceFingerprint && deviceFingerprint.length > 0) {
      // Look for sessions that have the same fingerprint prefix in their session_id
      // Session IDs with fingerprints start with "fp_"
      const fingerprintPrefix = `fp_${deviceFingerprint}`;
      
      const { data: fingerprintSessions } = await adminClient
        .from("active_sessions")
        .select("id, session_id, device_info")
        .eq("user_id", user.id)
        .like("session_id", `fp_${deviceFingerprint.substring(0, 8)}%`);

      if (fingerprintSessions && fingerprintSessions.length > 0) {
        // Found an existing session from the same physical device
        // Update it instead of creating a new one
        const existingDeviceSession = fingerprintSessions[0];
        
        console.log(`Consolidating session: ${sessionId} with existing ${existingDeviceSession.session_id} (same device fingerprint)`);
        
        await adminClient
          .from("active_sessions")
          .update({ 
            session_id: sessionId, // Update to new session ID
            device_info: deviceInfo, 
            updated_at: new Date().toISOString() 
          })
          .eq("id", existingDeviceSession.id);

        return new Response(JSON.stringify({ 
          success: true, 
          message: "Session consolidated (same device)", 
          isRegistered: true,
          consolidated: true,
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Clean up stale sessions.
    // IMPORTANT: This must be very conservative.
    // Aggressive cleanup (e.g. 10 minutes) can incorrectly delete “idle but valid” devices
    // (e.g. iPad on a stand, or a phone not currently playing) and causes cascading logouts
    // when those devices next interact with the app.
    //
    // We only remove sessions that haven't been seen for 7 days.
    const staleCutoffIso = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: staleRemoved } = await adminClient
      .from("active_sessions")
      .delete()
      .eq("user_id", user.id)
      .lt("updated_at", staleCutoffIso)
      .select("session_id");
    
    if (staleRemoved && staleRemoved.length > 0) {
      console.log(`Cleaned up ${staleRemoved.length} stale session(s) for user ${user.id}`);
    }

    // Get all current sessions for this user (after cleanup)
    const { data: allSessions, error: countError } = await adminClient
      .from("active_sessions")
      .select("id, created_at, session_id, device_info, updated_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true });

    if (countError) {
      console.error("Error counting sessions:", countError);
      return new Response(JSON.stringify({ error: "Failed to count sessions" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const currentCount = allSessions?.length || 0;

    // If at or over the limit
    if (!isAdmin && currentCount >= deviceSlots) {
      // For single-slot subscriptions (no additional devices), auto-disconnect the oldest
      if (deviceSlots === 1 && !forceRegister) {
        const oldestSession = allSessions?.[0];
        if (oldestSession) {
          await adminClient
            .from("active_sessions")
            .delete()
            .eq("id", oldestSession.id);
          console.log(`Auto-disconnected oldest session for single-slot user ${user.id}: ${oldestSession.session_id}`);
          
          // Insert the new session
          const { error: insertError } = await adminClient
            .from("active_sessions")
            .insert({
              user_id: user.id,
              session_id: sessionId,
              device_info: deviceInfo,
            });

          if (insertError) {
            console.error("Error inserting session after auto-disconnect:", insertError);
            return new Response(JSON.stringify({ error: "Failed to register session" }), {
              status: 500,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }

          return new Response(JSON.stringify({ 
            success: true, 
            message: "Session registered, previous device disconnected",
            isRegistered: true,
            autoDisconnected: true,
            disconnectedDevice: oldestSession.device_info,
          }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }
      
      // For multi-slot subscriptions, show the dialog
      if (!forceRegister) {
        console.log(`Device limit reached for user ${user.id}: ${currentCount}/${deviceSlots} devices`);
        
        // Return list of active devices so user can choose which to disconnect
        const activeDevices = allSessions?.map(s => ({
          sessionId: s.session_id,
          deviceInfo: s.device_info,
          createdAt: s.created_at,
          updatedAt: s.updated_at,
        })) || [];

        return new Response(JSON.stringify({ 
          success: false, 
          limitReached: true,
          deviceSlots,
          currentDevices: currentCount,
          activeDevices,
          message: "Device limit reached. Choose a device to disconnect.",
        }), {
          status: 200, // Not an error, just a conflict state
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // If forceRegister is true and at limit, remove oldest session (user explicitly chose this)
    if (!isAdmin && currentCount >= deviceSlots && forceRegister) {
      const sessionsToRemove = currentCount - deviceSlots + 1;
      const oldestSessions = allSessions?.slice(0, sessionsToRemove) || [];

      for (const oldSession of oldestSessions) {
        await adminClient
          .from("active_sessions")
          .delete()
          .eq("id", oldSession.id);
        console.log(`Removed old session (force): ${oldSession.id}`);
      }
    }

    // Insert new session
    const { error: insertError } = await adminClient
      .from("active_sessions")
      .insert({
        user_id: user.id,
        session_id: sessionId,
        device_info: deviceInfo,
      });

    if (insertError) {
      console.error("Error inserting session:", insertError);
      return new Response(JSON.stringify({ error: "Failed to register session" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ 
      success: true, 
      message: "Session registered",
      isRegistered: true,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: unknown) {
    console.error("Error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
