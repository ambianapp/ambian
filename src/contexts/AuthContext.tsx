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

  // Register session in active_sessions table (kick out oldest devices if over limit)
  const registerSession = useCallback(async (userId: string, sessionAccessToken: string) => {
    try {
      const sessionId = sessionAccessToken.slice(-32);
      const deviceInfo = navigator.userAgent;

      // Get device slots limit from subscription
      const { data: subData } = await supabase
        .from("subscriptions")
        .select("device_slots")
        .eq("user_id", userId)
        .maybeSingle();
      
      const deviceSlots = subData?.device_slots || 1;

      // Check if this session already exists
      const { data: existingSession } = await supabase
        .from("active_sessions")
        .select("id")
        .eq("user_id", userId)
        .eq("session_id", sessionId)
        .maybeSingle();

      if (existingSession) {
        // Session already registered, just update timestamp
        await supabase
          .from("active_sessions")
          .update({ device_info: deviceInfo, updated_at: new Date().toISOString() })
          .eq("id", existingSession.id);
        console.log("Session updated");
        return;
      }

      // Get current session count
      const { data: allSessions, error: countError } = await supabase
        .from("active_sessions")
        .select("id, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: true });

      if (countError) {
        console.error("Error counting sessions:", countError);
        return;
      }

      const currentCount = allSessions?.length || 0;

      // If at or over the limit, remove oldest sessions
      if (currentCount >= deviceSlots) {
        const sessionsToRemove = currentCount - deviceSlots + 1;
        const oldestSessions = allSessions?.slice(0, sessionsToRemove) || [];
        
        for (const oldSession of oldestSessions) {
          await supabase
            .from("active_sessions")
            .delete()
            .eq("id", oldSession.id);
        }
        console.log(`Removed ${sessionsToRemove} old session(s)`);
      }

      // Insert new session
      await supabase
        .from("active_sessions")
        .insert({ user_id: userId, session_id: sessionId, device_info: deviceInfo });

      console.log("Session registered successfully");
    } catch (error) {
      console.error("Error registering session:", error);
    }
  }, []);

  // Validate current session against active_sessions table
  const validateSession = useCallback(async (currentSession: Session) => {
    if (isSigningOut.current) return true;
    
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
        console.error("Error validating session:", error);
        return true; // Don't kick out on error
      }

      // If session not found, user was kicked out
      if (!data) {
        console.log("Session invalidated - logged in from another device");
        return false;
      }

      return true;
    } catch (error) {
      console.error("Error validating session:", error);
      return true; // Don't kick out on error
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

  // Session validation interval - check every 30 seconds
  useEffect(() => {
    if (!session) return;

    const validateAndKickIfNeeded = async () => {
      const isValid = await validateSession(session);
      if (!isValid && !isSigningOut.current) {
        toast.error("You've been logged out because your account was accessed from another device.");
        await signOut();
      }
    };

    // Initial validation after a short delay
    const initialTimeout = setTimeout(validateAndKickIfNeeded, 5000);
    
    // Periodic validation
    const interval = setInterval(validateAndKickIfNeeded, 30000);
    
    return () => {
      clearTimeout(initialTimeout);
      clearInterval(interval);
    };
  }, [session, validateSession]);

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
