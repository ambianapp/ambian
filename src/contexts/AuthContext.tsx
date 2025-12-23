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
  isPendingPayment: boolean;
  deviceSlots: number;
  collectionMethod: 'charge_automatically' | 'send_invoice' | null;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  isLoading: boolean;
  isSubscriptionLoading: boolean;
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
  const SUBSCRIPTION_CACHE_KEY = "ambian_subscription_cache";
  const SUBSCRIPTION_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
  const SHOWN_LOADING_KEY = "ambian_shown_initial_loading";

  const loadSubscriptionCache = (userId?: string): SubscriptionInfo | null => {
    try {
      const raw = localStorage.getItem(SUBSCRIPTION_CACHE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as { savedAt: number; userId?: string; value: SubscriptionInfo };
      if (!parsed?.savedAt || !parsed?.value) return null;
      // Cache must be for the same user
      if (userId && parsed.userId && parsed.userId !== userId) return null;
      if (Date.now() - parsed.savedAt > SUBSCRIPTION_CACHE_TTL_MS) return null;
      return parsed.value;
    } catch {
      return null;
    }
  };

  const writeSubscriptionCache = (value: SubscriptionInfo, userId?: string) => {
    try {
      localStorage.setItem(SUBSCRIPTION_CACHE_KEY, JSON.stringify({ savedAt: Date.now(), userId, value }));
    } catch {
      // ignore
    }
  };

  // Check if we've already shown the initial loading screen this browser session
  const hasShownInitialLoading = (): boolean => {
    return sessionStorage.getItem(SHOWN_LOADING_KEY) === "true";
  };

  const markInitialLoadingShown = () => {
    sessionStorage.setItem(SHOWN_LOADING_KEY, "true");
  };

  // On mount, try to load cached subscription (without user ID check initially)
  const cachedSubscriptionRef = useRef<SubscriptionInfo | null>(loadSubscriptionCache());
  const [isSubscriptionLoading, setIsSubscriptionLoading] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [subscription, setSubscription] = useState<SubscriptionInfo>(
    cachedSubscriptionRef.current ?? {
      subscribed: false,
      planType: null,
      subscriptionEnd: null,
      isTrial: false,
      trialDaysRemaining: 0,
      trialEnd: null,
      isRecurring: false,
      isPendingPayment: false,
      deviceSlots: 1,
      collectionMethod: null,
    }
  );
  
  const isSigningOut = useRef(false);
  const initialLoadComplete = useRef(false);

  const checkSubscription = async (overrideSession?: Session | null, isInitialLoad = false) => {
    // Only show blocking loading if we have no cache to fall back to AND haven't shown loading this session
    const hasCachedData = cachedSubscriptionRef.current !== null;
    if (isInitialLoad && !hasCachedData && !hasShownInitialLoading()) {
      setIsSubscriptionLoading(true);
    }
    try {
      const currentSession = overrideSession ?? (await supabase.auth.getSession()).data.session;
      if (!currentSession) {
        setIsSubscriptionLoading(false);
        return;
      }

      const { data, error } = await supabase.functions.invoke("check-subscription");
      if (error) throw error;

      const next: SubscriptionInfo = {
        subscribed: data.subscribed,
        planType: data.plan_type,
        subscriptionEnd: data.subscription_end,
        isTrial: data.is_trial || false,
        trialDaysRemaining: data.trial_days_remaining || 0,
        trialEnd: data.trial_end || null,
        isRecurring: data.is_recurring || false,
        isPendingPayment: data.is_pending_payment || false,
        deviceSlots: data.device_slots || 1,
        collectionMethod: data.collection_method || null,
      };

      setSubscription(next);
      cachedSubscriptionRef.current = next;
      writeSubscriptionCache(next, currentSession.user.id);
      markInitialLoadingShown();
    } catch (error) {
      console.error("Error checking subscription:", error);
    } finally {
      setIsSubscriptionLoading(false);
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

  // Get or create a persistent device ID (survives token refreshes)
  const getDeviceId = useCallback(() => {
    const storageKey = 'ambian_device_id';
    let deviceId = localStorage.getItem(storageKey);
    if (!deviceId) {
      deviceId = crypto.randomUUID();
      localStorage.setItem(storageKey, deviceId);
    }
    return deviceId;
  }, []);

  // Register session via edge function (uses service role to kick out older devices)
  const registerSession = useCallback(async (userId: string) => {
    try {
      const sessionId = getDeviceId(); // Use persistent device ID instead of token
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
  }, [getDeviceId]);

  // Validate current session against active_sessions table
  // Returns: 'valid' | 'kicked' | 'error'
  const validateSession = useCallback(async (currentSession: Session): Promise<'valid' | 'kicked' | 'error'> => {
    if (isSigningOut.current) return 'valid';
    
    try {
      const sessionId = getDeviceId(); // Use persistent device ID
      
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
  }, [getDeviceId]);

  const signOut = async () => {
    isSigningOut.current = true;
    try {
      // Clear only this device's session, not all sessions
      if (user) {
        const sessionId = getDeviceId(); // Use persistent device ID
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
      setIsSubscriptionLoading(false);
      setSubscription({ subscribed: false, planType: null, subscriptionEnd: null, isTrial: false, trialDaysRemaining: 0, trialEnd: null, isRecurring: false, isPendingPayment: false, deviceSlots: 1, collectionMethod: null });
      isSigningOut.current = false;
    }
  };

  // Handle adding OAuth users to Resend audience after sign-in
  const handleOAuthAudienceSignup = useCallback(async (userEmail: string) => {
    const marketingOptIn = localStorage.getItem('ambian_marketing_optin');
    const alreadyAdded = localStorage.getItem('ambian_audience_added');
    
    // Only add to audience if this is a new OAuth signup and we haven't already processed it
    if (!alreadyAdded) {
      try {
        const audienceType = marketingOptIn === 'true' ? 'both' : 'all';
        await supabase.functions.invoke('add-to-audience', {
          body: { 
            email: userEmail,
            audienceType
          }
        });
        // Mark as added so we don't add again on future logins
        localStorage.setItem('ambian_audience_added', 'true');
        console.log('Added OAuth user to Resend audience');
      } catch (error) {
        console.error('Failed to add OAuth user to audience:', error);
      } finally {
        // Clean up the marketing opt-in flag
        localStorage.removeItem('ambian_marketing_optin');
      }
    }
  }, []);

  useEffect(() => {
    // Set up auth state listener
    const { data: { subscription: authSubscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        // Skip if initial load already handled this
        if (!initialLoadComplete.current) return;
        
        setSession(session);
        setUser(session?.user ?? null);
        setIsLoading(false);

        if (session?.user) {
          // When user actively signs in, show the loading screen while we fetch subscription.
          // Also reset the "already shown" flag so login always shows the loading screen.
          const shouldShowLoading = event === "SIGNED_IN";
          if (shouldShowLoading) {
            sessionStorage.removeItem(SHOWN_LOADING_KEY);
            // Clear all saved scroll positions so user starts fresh at the top
            Object.keys(sessionStorage).forEach((key) => {
              if (key.startsWith("ambian_scroll:")) {
                sessionStorage.removeItem(key);
              }
            });
            setIsSubscriptionLoading(true);
          }

          setTimeout(() => {
            checkAdminRole(session.user.id);
            checkSubscription(session, shouldShowLoading);

            // Register session on sign in to kick out other devices
            if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
              registerSession(session.user.id);
            }
            
            // Handle OAuth signup - add to Resend audience
            if (event === "SIGNED_IN" && session.user.email) {
              handleOAuthAudienceSignup(session.user.email);
            }
          }, 0);
        } else {
          setIsAdmin(false);
          setIsSubscriptionLoading(false);
          setSubscription({ subscribed: false, planType: null, subscriptionEnd: null, isTrial: false, trialDaysRemaining: 0, trialEnd: null, isRecurring: false, isPendingPayment: false, deviceSlots: 1, collectionMethod: null });
        }
      }
    );

    // Check for existing session - this is the initial load
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setIsLoading(false);

      if (session?.user) {
        // Re-check cache with user ID now that we know the user
        const validCache = loadSubscriptionCache(session.user.id);
        cachedSubscriptionRef.current = validCache;
        if (validCache) {
          setSubscription(validCache);
        }
        
        // Only block UI if there's no valid cached subscription state AND we haven't shown loading this session
        const shouldShowLoading = !validCache && !hasShownInitialLoading();
        setIsSubscriptionLoading(shouldShowLoading);
        
        checkAdminRole(session.user.id);
        checkSubscription(session, true).finally(() => {
          initialLoadComplete.current = true;
        });
        // Register session on app load
        registerSession(session.user.id);
      } else {
        setIsSubscriptionLoading(false);
        initialLoadComplete.current = true;
      }
    });

    return () => authSubscription.unsubscribe();
  }, [registerSession]);

  // Session validation interval - check periodically to enforce device limits
  const consecutiveKicksRef = useRef(0);
  const MAX_CONSECUTIVE_KICKS = 1; // Log out immediately when kicked (was 2, causing delays)
  
  useEffect(() => {
    if (!session) return;

    const validateAndKickIfNeeded = async () => {
      // NOTE: We still validate in background to enforce device limits.
      // (Mobile/PWA often runs with document.visibilityState === 'hidden' while audio plays.)

      // Always validate against the LATEST session from the auth client.
      // This avoids false "kicked" results during token refreshes where access_token changes.
      const latestSession = (await supabase.auth.getSession()).data.session;
      if (!latestSession) return;

      const result = await validateSession(latestSession);

      if (result === 'valid') {
        consecutiveKicksRef.current = 0;
        return;
      }

      if (result === 'error') {
        // Network/auth error - don't increment counter, just wait for next check
        return;
      }

      // result === 'kicked'
      consecutiveKicksRef.current++;
      console.log(`Session kicked check ${consecutiveKicksRef.current}/${MAX_CONSECUTIVE_KICKS}`);

      if (consecutiveKicksRef.current >= MAX_CONSECUTIVE_KICKS && !isSigningOut.current) {
        toast.error("You've been logged out because your account was accessed from another device. Need more locations? You can add extra device slots in your Profile settings.", { duration: Infinity, closeButton: true });
        await signOut();
      }
    };

    // Initial validation after short delay (session should be registered quickly)
    const initialTimeout = setTimeout(validateAndKickIfNeeded, 5000);

    // Check every 30 seconds to ensure device limits are enforced reasonably quickly
    const interval = setInterval(validateAndKickIfNeeded, 15 * 1000); // Check every 15 seconds (was 30)

    // Re-validate when page becomes visible again (silently, no loading state)
    // Use a ref to track pending timeouts to avoid state updates during visibility changes
    let visibilityTimeoutId: ReturnType<typeof setTimeout> | null = null;
    
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        // Clear any pending timeout to avoid duplicate calls
        if (visibilityTimeoutId) {
          clearTimeout(visibilityTimeoutId);
        }
        
        // Delay validation significantly to avoid UI disruption
        visibilityTimeoutId = setTimeout(async () => {
          visibilityTimeoutId = null;
          const latestSession = (await supabase.auth.getSession()).data.session;
          if (latestSession?.user) {
            // Silently register session - no UI changes
            registerSession(latestSession.user.id);
            // Validate after another delay
            setTimeout(validateAndKickIfNeeded, 3000);
          }
        }, 2000); // Wait 2 seconds before doing anything
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
        isSubscriptionLoading,
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
