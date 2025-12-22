import { createContext, useContext, useEffect, useState, ReactNode, useCallback, useRef } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface SubscriptionInfo {
  subscribed: boolean;
  planType: string | null;
  subscriptionEnd: string | null;
  isTrial: boolean;
  trialDaysRemaining: number;
  trialEnd: string | null;
  isRecurring: boolean;
  deviceSlots: number;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  isLoading: boolean;
  isAdmin: boolean;
  subscription: SubscriptionInfo;
  signOut: () => Promise<void>;
  checkSubscription: () => Promise<void>;
  syncDeviceSlots: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [subscription, setSubscription] = useState<SubscriptionInfo>({
    subscribed: false,
    planType: null,
    subscriptionEnd: null,
    isTrial: false,
    trialDaysRemaining: 0,
    trialEnd: null,
    isRecurring: false,
    deviceSlots: 1,
  });
  
  const isSigningOut = useRef(false);

  const checkSubscription = async (overrideSession?: Session | null) => {
    try {
      const currentSession =
        overrideSession ?? (await supabase.auth.getSession()).data.session;
      if (!currentSession) return;

      const { data, error } = await supabase.functions.invoke("check-subscription");
      if (error) throw error;

      setSubscription({
        subscribed: data.subscribed,
        planType: data.plan_type,
        subscriptionEnd: data.subscription_end,
        isTrial: data.is_trial || false,
        trialDaysRemaining: data.trial_days_remaining || 0,
        trialEnd: data.trial_end || null,
        isRecurring: data.is_recurring || false,
        deviceSlots: data.device_slots || 1,
      });
    } catch (error) {
      console.error("Error checking subscription:", error);
    }
  };

  const syncDeviceSlots = async () => {
    try {
      const { data, error } = await supabase.functions.invoke("sync-device-slots");
      if (error) throw error;
      
      if (data?.device_slots) {
        setSubscription(prev => ({ ...prev, deviceSlots: data.device_slots }));
      }
    } catch (error) {
      console.error("Error syncing device slots:", error);
    }
  };

  const checkAdminRole = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId)
        .eq("role", "admin")
        .maybeSingle();

      if (error) throw error;
      setIsAdmin(!!data);
    } catch (error) {
      console.error("Error checking admin role:", error);
      setIsAdmin(false);
    }
  };

  // Register session via edge function (uses service role to kick out older devices)
  const registerSession = useCallback(async (userId: string, sessionAccessToken: string) => {
    try {
      const sessionId = sessionAccessToken.slice(-32);
      const deviceInfo = navigator.userAgent;

      const { data, error } = await supabase.functions.invoke("register-session", {
        body: { sessionId, deviceInfo },
      });

      if (error) {
        // Don't fail silently - just log, the app should continue working
        console.warn("Session registration failed (non-critical):", error);
        return;
      }

      console.log("Session registered:", data?.message);
      if (data?.removedSessions > 0) {
        console.log(`Kicked out ${data.removedSessions} older device(s)`);
      }
    } catch (error) {
      // Network errors during registration shouldn't break the app
      console.warn("Session registration error (non-critical):", error);
    }
  }, []);

  // Validate current session against active_sessions table
  // Returns: 'valid' | 'kicked' | 'error'
  const validateSession = useCallback(async (currentSession: Session): Promise<'valid' | 'kicked' | 'error'> => {
    if (isSigningOut.current) return 'valid';
    
    try {
      const sessionId = currentSession.access_token.slice(-32);
      
      // Check if this session is in the active sessions list
      const { data, error } = await supabase
        .from("active_sessions")
        .select("session_id")
        .eq("user_id", currentSession.user.id)
        .eq("session_id", sessionId)
        .maybeSingle();

      if (error) {
        console.warn("Error validating session (will retry):", error);
        return 'error'; // Network error, don't kick out
      }

      // If session not found, it could mean:
      // 1. User was kicked out from another device
      // 2. Session record was cleaned up (shouldn't happen but be safe)
      // 3. Network/timing issue
      if (!data) {
        console.log("Session not found in active_sessions - may have been kicked");
        return 'kicked';
      }

      return 'valid';
    } catch (error) {
      console.warn("Error validating session (will retry):", error);
      return 'error'; // Network error, don't kick out
    }
  }, []);

  const signOut = async () => {
    isSigningOut.current = true;
    try {
      // Clear only this device's session, not all sessions
      if (user && session) {
        const sessionId = session.access_token.slice(-32);
        await supabase
          .from("active_sessions")
          .delete()
          .eq("user_id", user.id)
          .eq("session_id", sessionId);
      }
      await supabase.auth.signOut();
    } catch (error) {
      console.error("Sign out error:", error);
    } finally {
      // Always clear local state even if signOut fails
      setSession(null);
      setUser(null);
      setIsAdmin(false);
      setSubscription({ subscribed: false, planType: null, subscriptionEnd: null, isTrial: false, trialDaysRemaining: 0, trialEnd: null, isRecurring: false, deviceSlots: 1 });
      isSigningOut.current = false;
    }
  };

  useEffect(() => {
    // Set up auth state listener
    const { data: { subscription: authSubscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        setIsLoading(false);

        if (session?.user) {
          setTimeout(() => {
            checkAdminRole(session.user.id);
            checkSubscription(session);
            
            // Register session on sign in to kick out other devices
            if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
              registerSession(session.user.id, session.access_token);
            }
          }, 0);
        } else {
          setIsAdmin(false);
          setSubscription({ subscribed: false, planType: null, subscriptionEnd: null, isTrial: false, trialDaysRemaining: 0, trialEnd: null, isRecurring: false, deviceSlots: 1 });
        }
      }
    );

    // Check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setIsLoading(false);

      if (session?.user) {
        checkAdminRole(session.user.id);
        checkSubscription(session);
        // Register session on app load
        registerSession(session.user.id, session.access_token);
      }
    });

    return () => authSubscription.unsubscribe();
  }, [registerSession]);

  // Session validation interval - check periodically to enforce device limits
  const consecutiveKicksRef = useRef(0);
  const MAX_CONSECUTIVE_KICKS = 2; // Require 2 consecutive "kicked" results to log out (prevents network glitches)
  
  useEffect(() => {
    if (!session) return;

    const validateAndKickIfNeeded = async () => {
      // NOTE: We still validate in background to enforce device limits.
      // (Mobile/PWA often runs with document.visibilityState === 'hidden' while audio plays.)

      const result = await validateSession(session);
      
      if (result === 'valid') {
        consecutiveKicksRef.current = 0;
        return;
      }
      
      if (result === 'error') {
        // Network error - don't increment counter, just wait for next check
        return;
      }
      
      // result === 'kicked'
      consecutiveKicksRef.current++;
      console.log(`Session kicked check ${consecutiveKicksRef.current}/${MAX_CONSECUTIVE_KICKS}`);
      
      if (consecutiveKicksRef.current >= MAX_CONSECUTIVE_KICKS && !isSigningOut.current) {
        toast.error("You've been logged out because your account was accessed from another device.", { duration: Infinity });
        await signOut();
      }
    };

    // Initial validation after short delay (session should be registered quickly)
    const initialTimeout = setTimeout(validateAndKickIfNeeded, 5000);
    
    // Check every 30 seconds to ensure device limits are enforced reasonably quickly
    const interval = setInterval(validateAndKickIfNeeded, 30 * 1000);

    // Re-validate when page becomes visible again
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        setTimeout(async () => {
          await registerSession(session.user.id, session.access_token);
          setTimeout(validateAndKickIfNeeded, 2000);
        }, 1000);
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      clearTimeout(initialTimeout);
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [session, validateSession, registerSession]);

  // Auto-refresh subscription every minute
  useEffect(() => {
    if (!session) return;

    const interval = setInterval(() => {
      checkSubscription();
    }, 60000);
    return () => clearInterval(interval);
  }, [session]);

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        isLoading,
        isAdmin,
        subscription,
        signOut,
        checkSubscription,
        syncDeviceSlots,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
