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
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  isLoading: boolean;
  isAdmin: boolean;
  subscription: SubscriptionInfo;
  signOut: () => Promise<void>;
  checkSubscription: () => Promise<void>;
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
      });
    } catch (error) {
      console.error("Error checking subscription:", error);
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

  // Register session in active_sessions table (kick out other devices)
  const registerSession = useCallback(async (userId: string, sessionAccessToken: string) => {
    try {
      // Generate a unique session identifier from the access token
      const sessionId = sessionAccessToken.slice(-32);
      const deviceInfo = navigator.userAgent;

      // First, try to update existing record
      const { data: existingSession } = await supabase
        .from("active_sessions")
        .select("id")
        .eq("user_id", userId)
        .maybeSingle();

      if (existingSession) {
        // Update existing session
        await supabase
          .from("active_sessions")
          .update({ session_id: sessionId, device_info: deviceInfo })
          .eq("user_id", userId);
      } else {
        // Insert new session
        await supabase
          .from("active_sessions")
          .insert({ user_id: userId, session_id: sessionId, device_info: deviceInfo });
      }

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
      
      const { data, error } = await supabase
        .from("active_sessions")
        .select("session_id")
        .eq("user_id", currentSession.user.id)
        .maybeSingle();

      if (error) {
        console.error("Error validating session:", error);
        return true; // Don't kick out on error
      }

      // If no active session record or session doesn't match, user was kicked out
      if (data && data.session_id !== sessionId) {
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
      // Clear the active session first
      if (user) {
        await supabase
          .from("active_sessions")
          .delete()
          .eq("user_id", user.id);
      }
      await supabase.auth.signOut();
    } catch (error) {
      console.error("Sign out error:", error);
    } finally {
      // Always clear local state even if signOut fails
      setSession(null);
      setUser(null);
      setIsAdmin(false);
      setSubscription({ subscribed: false, planType: null, subscriptionEnd: null, isTrial: false, trialDaysRemaining: 0, trialEnd: null, isRecurring: false });
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
          setSubscription({ subscribed: false, planType: null, subscriptionEnd: null, isTrial: false, trialDaysRemaining: 0, trialEnd: null, isRecurring: false });
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
