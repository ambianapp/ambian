import { createContext, useContext, useEffect, useState, ReactNode, useCallback, useRef } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { logActivity } from "@/lib/activityLogger";

// Deduplication helper - prevents multiple calls within a time window
const createDedupedCall = <T,>(fn: () => Promise<T>, minInterval: number) => {
  let lastCall = 0;
  let pending: Promise<T> | null = null;
  
  return (): Promise<T> | null => {
    const now = Date.now();
    if (pending) return pending; // Return existing promise if still pending
    if (now - lastCall < minInterval) return null; // Skip if called too recently
    
    lastCall = now;
    pending = fn().finally(() => { pending = null; });
    return pending;
  };
};

interface SubscriptionInfo {
  subscribed: boolean;
  planType: string | null;
  subscriptionEnd: string | null;
  isTrial: boolean;
  trialDaysRemaining: number;
  trialEnd: string | null;
  isRecurring: boolean;
  isPendingPayment: boolean;
  hasUnpaidInvoice: boolean;
  deviceSlots: number;
  collectionMethod: 'charge_automatically' | 'send_invoice' | null;
  cancelAtPeriodEnd: boolean;
}

interface ActiveDevice {
  sessionId: string;
  deviceInfo: string;
  createdAt: string;
  updatedAt: string;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  isLoading: boolean;
  isSubscriptionLoading: boolean;
  isAdmin: boolean;
  subscription: SubscriptionInfo;
  // Device limit state
  isDeviceLimitReached: boolean;
  activeDevices: ActiveDevice[];
  showDeviceLimitDialog: boolean;
  canPlayMusic: boolean;
  signOut: () => Promise<void>;
  checkSubscription: () => Promise<void>;
  syncDeviceSlots: () => Promise<void>;
  disconnectDevice: (sessionId: string) => Promise<void>;
  dismissDeviceLimitDialog: () => void;
  openDeviceLimitDialog: () => void;
  getDeviceId: () => string;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const SUBSCRIPTION_CACHE_KEY = "ambian_subscription_cache";
  const SUBSCRIPTION_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
  const SHOWN_LOADING_KEY = "ambian_shown_initial_loading";

  // Device limit state
  const [isDeviceLimitReached, setIsDeviceLimitReached] = useState(false);
  const [activeDevices, setActiveDevices] = useState<ActiveDevice[]>([]);
  const [showDeviceLimitDialog, setShowDeviceLimitDialog] = useState(false);
  const [isSessionRegistered, setIsSessionRegistered] = useState(false);
  
  // Deduplication refs to prevent rapid duplicate API calls
  const lastRegisterCallRef = useRef<number>(0);
  const pendingRegisterRef = useRef<Promise<boolean> | null>(null);
  const lastValidationCallRef = useRef<number>(0);
  const lastValidationResultRef = useRef<{ result: 'valid' | 'kicked' | 'error'; timestamp: number } | null>(null);

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
      hasUnpaidInvoice: false,
      deviceSlots: 1,
      collectionMethod: null,
      cancelAtPeriodEnd: false,
    }
  );
  
  const isSigningOut = useRef(false);
  const initialLoadComplete = useRef(false);

  // Can play music only if session is registered (not in device limit state)
  const canPlayMusic = isSessionRegistered && !isDeviceLimitReached;

  const checkSubscription = async (overrideSession?: Session | null, isInitialLoad = false) => {
    // Only show blocking loading if we have no cache to fall back to AND haven't shown loading this session
    const hasCachedData = cachedSubscriptionRef.current !== null;
    if (isInitialLoad && !hasCachedData && !hasShownInitialLoading()) {
      setIsSubscriptionLoading(true);
    }
    let currentSession: Session | null = null;
    try {
      currentSession = overrideSession ?? (await supabase.auth.getSession()).data.session;
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
        hasUnpaidInvoice: data.has_unpaid_invoice || false,
        deviceSlots: data.device_slots || 1,
        collectionMethod: data.collection_method || null,
        cancelAtPeriodEnd: data.cancel_at_period_end || false,
      };

      setSubscription(next);
      cachedSubscriptionRef.current = next;
      writeSubscriptionCache(next, currentSession.user.id);
      markInitialLoadingShown();
    } catch (error) {
      console.error("Error checking subscription:", error);

      // Fallback: read from database subscription table (helps on some mobile sessions where
      // the backend function call can fail during initialization)
      if (currentSession?.user?.id) {
        try {
          const { data: subRow, error: subError } = await supabase
            .from("subscriptions")
            .select("status, plan_type, current_period_end, device_slots")
            .eq("user_id", currentSession.user.id)
            .maybeSingle();

          if (subError) throw subError;

          const now = new Date();
          const periodEnd = subRow?.current_period_end ? new Date(subRow.current_period_end) : null;
          const isActiveByDb =
            (subRow?.status === "active" || subRow?.status === "trialing" || subRow?.status === "pending_payment") &&
            (!periodEnd || periodEnd > now);

          const fallback: SubscriptionInfo = {
            subscribed: !!isActiveByDb,
            planType: subRow?.plan_type ?? null,
            subscriptionEnd: subRow?.current_period_end ?? null,
            isTrial: subRow?.status === "trialing",
            trialDaysRemaining: 0,
            trialEnd: null,
            isRecurring: true,
            isPendingPayment: subRow?.status === "pending_payment",
            hasUnpaidInvoice: false,
            deviceSlots: subRow?.device_slots ?? 1,
            collectionMethod: null,
            cancelAtPeriodEnd: false,
          };

          setSubscription(fallback);
          cachedSubscriptionRef.current = fallback;
          writeSubscriptionCache(fallback, currentSession.user.id);
          markInitialLoadingShown();
        } catch (fallbackError) {
          console.error("Subscription fallback also failed:", fallbackError);
        }
      }
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

  // Register session via edge function - now handles device limit gracefully
  // Deduped to prevent multiple calls within 5 seconds
  const registerSession = useCallback(async (userId: string, forceRegister = false): Promise<boolean> => {
    const now = Date.now();
    const MIN_INTERVAL = 5000; // 5 seconds between calls
    
    // If we have a pending call, return that promise
    if (pendingRegisterRef.current) {
      console.log("Session registration already in progress, reusing...");
      return pendingRegisterRef.current;
    }
    
    // Skip if called too recently (unless forcing)
    if (!forceRegister && now - lastRegisterCallRef.current < MIN_INTERVAL) {
      console.log("Session registration skipped (called too recently)");
      return isSessionRegistered;
    }
    
    lastRegisterCallRef.current = now;
    
    const doRegister = async (): Promise<boolean> => {
      try {
        const sessionId = getDeviceId();
        const deviceInfo = navigator.userAgent;

        const { data, error } = await supabase.functions.invoke("register-session", {
          body: { sessionId, deviceInfo, forceRegister },
        });

        if (error) {
          console.warn("Session registration failed (non-critical):", error);
          return false;
        }

        // Check if device limit was reached
        if (data?.limitReached) {
          console.log("Device limit reached:", data.currentDevices, "/", data.deviceSlots);
          setIsDeviceLimitReached(true);
          setActiveDevices(data.activeDevices || []);
          setIsSessionRegistered(false);
          setShowDeviceLimitDialog(true);
          
          // Log device limit event
          const currentUser = (await supabase.auth.getUser()).data.user;
          logActivity({
            userId: currentUser?.id,
            userEmail: currentUser?.email || undefined,
            eventType: "device_limit_reached",
            eventMessage: `Device limit reached: ${data.currentDevices}/${data.deviceSlots} devices`,
            eventDetails: { currentDevices: data.currentDevices, deviceSlots: data.deviceSlots },
          });
          
          return false;
        }

        // Session registered successfully
        if (data?.success || data?.isRegistered) {
          console.log("Session registered:", data?.message);
          setIsDeviceLimitReached(false);
          setActiveDevices([]);
          setIsSessionRegistered(true);
          return true;
        }

        return false;
      } catch (error) {
        console.warn("Session registration error (non-critical):", error);
        return false;
      }
    };
    
    pendingRegisterRef.current = doRegister().finally(() => {
      pendingRegisterRef.current = null;
    });
    
    return pendingRegisterRef.current;
  }, [getDeviceId]);

  // Disconnect a specific device
  const disconnectDevice = useCallback(async (sessionIdToDisconnect: string) => {
    try {
      const sessionId = getDeviceId();
      const deviceInfo = navigator.userAgent;

      // First disconnect the target device
      const { error: disconnectError } = await supabase.functions.invoke("register-session", {
        body: { sessionId, deviceInfo, disconnectSessionId: sessionIdToDisconnect },
      });

      if (disconnectError) {
        toast.error("Failed to disconnect device");
        return;
      }

      // Now try to register this session
      const registered = await registerSession(user?.id || "", false);
      
      if (registered) {
        setShowDeviceLimitDialog(false);
        toast.success("Device disconnected. You can now play music.");
      }
    } catch (error) {
      console.error("Error disconnecting device:", error);
      toast.error("Failed to disconnect device");
    }
  }, [getDeviceId, registerSession, user?.id]);

  const dismissDeviceLimitDialog = useCallback(() => {
    setShowDeviceLimitDialog(false);
  }, []);

  const openDeviceLimitDialog = useCallback(() => {
    if (isDeviceLimitReached) {
      setShowDeviceLimitDialog(true);
    }
  }, [isDeviceLimitReached]);

  // Validate current session against active_sessions table
  // Returns: 'valid' | 'kicked' | 'error'
  // Cached for 10 seconds to prevent duplicate queries
  const validateSession = useCallback(async (currentSession: Session): Promise<'valid' | 'kicked' | 'error'> => {
    if (isSigningOut.current) return 'valid';
    
    const now = Date.now();
    const CACHE_TTL = 10000; // 10 seconds
    
    // Return cached result if recent
    if (lastValidationResultRef.current && now - lastValidationResultRef.current.timestamp < CACHE_TTL) {
      return lastValidationResultRef.current.result;
    }
    
    // Prevent duplicate calls within 3 seconds
    if (now - lastValidationCallRef.current < 3000) {
      return lastValidationResultRef.current?.result ?? 'valid';
    }
    lastValidationCallRef.current = now;
    
    try {
      const sessionId = getDeviceId();
      
      // Check if this session is in the active sessions list
      const { data, error } = await supabase
        .from("active_sessions")
        .select("session_id")
        .eq("user_id", currentSession.user.id)
        .eq("session_id", sessionId)
        .maybeSingle();

      if (error) {
        console.warn("Error validating session (will retry):", error);
        return 'error';
      }

      let result: 'valid' | 'kicked' | 'error';
      
      // If session not found, could mean device limit or was disconnected
      if (!data) {
        // Check if we're in device limit mode
        if (isDeviceLimitReached) {
          result = 'valid'; // Don't kick out - user knows they're in read-only mode
        } else {
          console.log("Session not found in active_sessions - may have been disconnected");
          result = 'kicked';
        }
      } else {
        result = 'valid';
      }
      
      // Cache the result
      lastValidationResultRef.current = { result, timestamp: now };
      return result;
    } catch (error) {
      console.warn("Error validating session (will retry):", error);
      return 'error';
    }
  }, [getDeviceId, isDeviceLimitReached]);

  const signOut = async () => {
    isSigningOut.current = true;
    try {
      // Log logout activity before clearing session
      if (user) {
        logActivity({
          userId: user.id,
          userEmail: user.email || undefined,
          eventType: "logout",
          eventMessage: "User logged out",
        });
        
        // Clear only this device's session, not all sessions
        const sessionId = getDeviceId();
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
      setSubscription({ subscribed: false, planType: null, subscriptionEnd: null, isTrial: false, trialDaysRemaining: 0, trialEnd: null, isRecurring: false, isPendingPayment: false, hasUnpaidInvoice: false, deviceSlots: 1, collectionMethod: null, cancelAtPeriodEnd: false });
      setIsDeviceLimitReached(false);
      setActiveDevices([]);
      setIsSessionRegistered(false);
      isSigningOut.current = false;
    }
  };

  // Handle adding OAuth users to Resend audience and sending welcome email after sign-in
  // Only sends for users created within the last 2 minutes (truly new signups)
  const handleOAuthAudienceSignup = useCallback(async (userEmail: string, userName?: string, userCreatedAt?: string) => {
    const marketingOptIn = localStorage.getItem('ambian_marketing_optin');
    
    // Check if user was JUST created (within last 2 minutes) - this indicates a truly new signup
    const createdAt = userCreatedAt ? new Date(userCreatedAt).getTime() : 0;
    const now = Date.now();
    const isNewUser = now - createdAt < 2 * 60 * 1000; // 2 minutes
    
    // Only add to audience and send welcome email for truly new users
    if (isNewUser) {
      console.log('New OAuth user detected, sending welcome email and adding to audience');
      try {
        const audienceType = marketingOptIn === 'true' ? 'both' : 'all';
        
        // Add to audience
        await supabase.functions.invoke('add-to-audience', {
          body: { 
            email: userEmail,
            audienceType
          }
        });
        
        // Send welcome email
        await supabase.functions.invoke('send-welcome-email', {
          body: { 
            email: userEmail,
            name: userName
          }
        });
        
        console.log('Added new OAuth user to Resend audience and sent welcome email');
      } catch (error) {
        console.error('Failed to add OAuth user to audience or send welcome email:', error);
      } finally {
        // Clean up the marketing opt-in flag
        localStorage.removeItem('ambian_marketing_optin');
      }
    } else {
      console.log('Existing user login, skipping welcome email (created:', userCreatedAt, ')');
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

            // Register session on sign in
            if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
              registerSession(session.user.id);
              
              // Log login activity only for actual new logins, not session restoration
              // Check if the session was just created (within the last 5 seconds)
              const sessionCreatedAt = session.user.created_at ? new Date(session.user.created_at).getTime() : 0;
              const lastSignInAt = session.user.last_sign_in_at ? new Date(session.user.last_sign_in_at).getTime() : 0;
              const now = Date.now();
              const isRecentSignIn = now - lastSignInAt < 5000; // Within 5 seconds = actual login
              
              if (event === "SIGNED_IN" && isRecentSignIn) {
                logActivity({
                  userId: session.user.id,
                  userEmail: session.user.email || undefined,
                  eventType: "login",
                  eventMessage: "User logged in",
                  eventDetails: { provider: session.user.app_metadata?.provider || "email" },
                });
              }
            }
            
            // Handle OAuth signup - add to Resend audience and send welcome email (only on recent sign-in)
            const lastSignInAt = session.user.last_sign_in_at ? new Date(session.user.last_sign_in_at).getTime() : 0;
            const isRecentSignIn = Date.now() - lastSignInAt < 5000;
            if (event === "SIGNED_IN" && session.user.email && isRecentSignIn) {
              const userName = session.user.user_metadata?.full_name || session.user.user_metadata?.name;
              handleOAuthAudienceSignup(session.user.email, userName, session.user.created_at);
            }
          }, 0);
        } else {
          setIsAdmin(false);
          setIsSubscriptionLoading(false);
          setSubscription({ subscribed: false, planType: null, subscriptionEnd: null, isTrial: false, trialDaysRemaining: 0, trialEnd: null, isRecurring: false, isPendingPayment: false, hasUnpaidInvoice: false, deviceSlots: 1, collectionMethod: null, cancelAtPeriodEnd: false });
          setIsDeviceLimitReached(false);
          setActiveDevices([]);
          setIsSessionRegistered(false);
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
        
        // Check if this is a fresh OAuth signup (user just created within 2 minutes)
        const createdAt = session.user.created_at ? new Date(session.user.created_at).getTime() : 0;
        const now = Date.now();
        const isNewOAuthUser = now - createdAt < 2 * 60 * 1000; // 2 minutes
        
        // For new OAuth users, always show loading screen regardless of cache
        const shouldShowLoading = isNewOAuthUser || (!validCache && !hasShownInitialLoading());
        if (isNewOAuthUser) {
          sessionStorage.removeItem(SHOWN_LOADING_KEY);
        }
        setIsSubscriptionLoading(shouldShowLoading);
        
        checkAdminRole(session.user.id);
        checkSubscription(session, true).finally(() => {
          initialLoadComplete.current = true;
        });
        // Register session on app load
        registerSession(session.user.id);
        
        // Handle OAuth signup - add to Resend audience and send welcome email for new users
        // This handles the case where OAuth redirects back and onAuthStateChange is blocked
        if (isNewOAuthUser && session.user.email) {
          const userName = session.user.user_metadata?.full_name || session.user.user_metadata?.name;
          handleOAuthAudienceSignup(session.user.email, userName, session.user.created_at);
        }
      } else {
        setIsSubscriptionLoading(false);
        initialLoadComplete.current = true;
      }
    });

    return () => authSubscription.unsubscribe();
  }, [registerSession]);

  // Session validation interval - check periodically to enforce device limits
  const consecutiveKicksRef = useRef(0);
  const MAX_CONSECUTIVE_KICKS = 3; // Require 3 consecutive failures before kicking (was 1)
  
  useEffect(() => {
    if (!session) return;

    const validateAndKickIfNeeded = async () => {
      // If in device limit mode, don't validate (user is in read-only mode)
      if (isDeviceLimitReached) return;
      
      // Don't validate until session is registered - this prevents race conditions on login
      if (!isSessionRegistered) {
        console.log("Skipping validation - session not yet registered");
        return;
      }

      // Always validate against the LATEST session from the auth client.
      const latestSession = (await supabase.auth.getSession()).data.session;
      if (!latestSession) return;

      const result = await validateSession(latestSession);

      if (result === 'valid') {
        consecutiveKicksRef.current = 0;
        return;
      }

      if (result === 'error') {
        return;
      }

      // result === 'kicked'
      consecutiveKicksRef.current++;
      console.log(`Session kicked check ${consecutiveKicksRef.current}/${MAX_CONSECUTIVE_KICKS}`);

      if (consecutiveKicksRef.current >= MAX_CONSECUTIVE_KICKS && !isSigningOut.current) {
        toast.error("You've been disconnected from another device. Need more locations? Add extra device slots in your Profile settings.", { duration: Infinity, closeButton: true });
        await signOut();
      }
    };

    // Initial validation after longer delay to allow registration to complete (was 5s, now 15s)
    const initialTimeout = setTimeout(validateAndKickIfNeeded, 15000);

    // Check every 2 minutes (reduced from 30s to decrease traffic at scale)
    const interval = setInterval(validateAndKickIfNeeded, 2 * 60 * 1000);

    // Re-validate when page becomes visible
    let visibilityTimeoutId: ReturnType<typeof setTimeout> | null = null;
    
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        if (visibilityTimeoutId) {
          clearTimeout(visibilityTimeoutId);
        }
        
        visibilityTimeoutId = setTimeout(async () => {
          visibilityTimeoutId = null;
          const latestSession = (await supabase.auth.getSession()).data.session;
          if (latestSession?.user) {
            // Re-register session when tab becomes visible
            registerSession(latestSession.user.id);
            setTimeout(validateAndKickIfNeeded, 3000);
          }
        }, 2000);
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      clearTimeout(initialTimeout);
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [session, validateSession, registerSession, isDeviceLimitReached]);

  // Auto-refresh subscription every minute
  useEffect(() => {
    if (!session) return;

    // Check every 5 minutes (reduced from 60s to decrease traffic at scale)
    const interval = setInterval(() => {
      checkSubscription();
    }, 5 * 60 * 1000);
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
        isDeviceLimitReached,
        activeDevices,
        showDeviceLimitDialog,
        canPlayMusic,
        signOut,
        checkSubscription,
        syncDeviceSlots,
        disconnectDevice,
        dismissDeviceLimitDialog,
        openDeviceLimitDialog,
        getDeviceId,
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
