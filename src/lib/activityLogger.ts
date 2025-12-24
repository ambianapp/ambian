import { supabase } from "@/integrations/supabase/client";

export type ActivityEventType = 
  | "login"
  | "logout"
  | "signup"
  | "subscription_created"
  | "subscription_canceled"
  | "subscription_renewed"
  | "payment_failed"
  | "playback_started"
  | "device_registered"
  | "device_limit_reached"
  | "device_disconnected"
  | "user_deleted"
  | "subscription_canceled_by_admin"
  | "error";

interface LogActivityParams {
  userId?: string;
  userEmail?: string;
  eventType: ActivityEventType;
  eventMessage?: string;
  eventDetails?: Record<string, unknown>;
}

export const logActivity = async ({
  userId,
  userEmail,
  eventType,
  eventMessage,
  eventDetails,
}: LogActivityParams): Promise<void> => {
  try {
    await supabase.functions.invoke("log-activity", {
      body: {
        user_id: userId,
        user_email: userEmail,
        event_type: eventType,
        event_message: eventMessage,
        event_details: eventDetails || {},
      },
    });
  } catch (error) {
    // Silently fail - logging should not break the app
    console.error("Failed to log activity:", error);
  }
};
