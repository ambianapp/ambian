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
  disconnectDevice: (sessionId: string) => Promise<{ success: boolean; needsUserGesture: boolean }>;
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
  // Default to true to avoid blocking media during initial load.
  // Will be set to false only if device limit is actually reached.
  const [isSessionRegistered, setIsSessionRegistered] = useState(true);
  
  // Deduplication refs to prevent rapid duplicate API calls
  const lastRegisterCallRef = useRef<number>(0);
  const pendingRegisterRef = useRef<Promise<boolean> | null>(null);
  const lastValidationCallRef = useRef<number>(0);
  const lastValidationResultRef = useRef<{ result: 'valid' | 'kicked' | 'error'; timestamp: number } | null>(null);
  const consecutiveKicksRef = useRef(0);
  const isDisconnectingRef = useRef(false);

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

  // Keep a stable device ID for the lifetime of this JS runtime.
  // On iOS/Safari, localStorage can occasionally be cleared/blocked mid-session.
  // If that happens and the deviceId changes, we can accidentally treat the current
  // device as "kicked" which leads to sign-out and broken media/cover loading.
  const deviceIdRef = useRef<string | null>(null);

  // Can play music: allow unless device limit is explicitly reached.
  // isSessionRegistered starts true and only becomes false when limit is hit,
  // preventing blocking of media during initial load/auth flow.
  const canPlayMusic = !isDeviceLimitReached;

  // (Defined later, after registerSession)
  const autoExitLimitModeRef = useRef(false);

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
    // 1) Prefer the in-memory ID for stability during the current session.
    if (deviceIdRef.current) return deviceIdRef.current;

    const storageKey = "ambian_device_id";
    const sessionKey = "ambian_device_id_session";

    // 2) Try localStorage first, then sessionStorage as a fallback.
    let deviceId: string | null = null;
    try {
      deviceId = localStorage.getItem(storageKey);
    } catch {
      // ignore
    }

    if (!deviceId) {
      try {
        deviceId = sessionStorage.getItem(sessionKey);
      } catch {
        // ignore
      }
    }

    // 3) Generate if missing.
    if (!deviceId) {
      deviceId = crypto.randomUUID();
    }

    // 4) Persist best-effort (don’t crash if storage is blocked).
    try {
      localStorage.setItem(storageKey, deviceId);
    } catch {
      // ignore
    }
    try {
      sessionStorage.setItem(sessionKey, deviceId);
    } catch {
      // ignore
    }

    deviceIdRef.current = deviceId;
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
          const deviceSlotsFromServer = Number(data.deviceSlots ?? 1) || 1;
          const activeDevicesFromServer: ActiveDevice[] = Array.isArray(data.activeDevices)
            ? data.activeDevices
            : [];
          const currentDevicesFromServer =
            typeof data.currentDevices === "number" ? data.currentDevices : activeDevicesFromServer.length;

          // Keep local subscription in sync with the authoritative server value to avoid
          // confusing UI like "1 of 2" while still being blocked.
          setSubscription((prev) => ({ ...prev, deviceSlots: deviceSlotsFromServer }));

          console.log("Device limit reached:", currentDevicesFromServer, "/", deviceSlotsFromServer);
          setIsDeviceLimitReached(true);
          setActiveDevices(activeDevicesFromServer);
          setIsSessionRegistered(false);
          setShowDeviceLimitDialog(true);

          // Defensive: if the server sent an inconsistent state (e.g. active < slots),
          // immediately exit read-only mode and retry registration.
          if (activeDevicesFromServer.length < deviceSlotsFromServer) {
            console.warn("[DeviceLimit] Inconsistent limitReached payload; auto-recovering", {
              active: activeDevicesFromServer.length,
              slots: deviceSlotsFromServer,
            });
            setIsDeviceLimitReached(false);
            setShowDeviceLimitDialog(false);
            setIsSessionRegistered(true);
            setTimeout(() => registerSession(userId, true), 0);
          }
          
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

  // If device slots increased (or our active devices list shrank) while we were in
  // device-limit mode, automatically exit read-only mode.
  // This fixes cases where the backend briefly returns limitReached with stale slot
  // counts, leaving the UI stuck even though e.g. "1 of 2" are in use.
  useEffect(() => {
    if (!isDeviceLimitReached) return;
    if (!session?.user?.id) return;

    const slots = subscription.deviceSlots || 1;
    const used = activeDevices.length;
    if (used >= slots) return;

    // Prevent loops if multiple state updates fire at once.
    if (autoExitLimitModeRef.current) return;
    autoExitLimitModeRef.current = true;

    console.log("[DeviceLimit] Auto-exit: used < slots", { used, slots });
    setIsDeviceLimitReached(false);
    setShowDeviceLimitDialog(false);
    setIsSessionRegistered(true);

    // Clear validation caches so we don't immediately re-enter a stale state.
    lastValidationResultRef.current = null;
    lastValidationCallRef.current = 0;
    lastRegisterCallRef.current = 0;
    pendingRegisterRef.current = null;

    // Force re-register to claim a slot if needed.
    setTimeout(() => {
      registerSession(session.user.id, true).finally(() => {
        autoExitLimitModeRef.current = false;
      });
    }, 0);
  }, [isDeviceLimitReached, activeDevices.length, subscription.deviceSlots, session?.user?.id, registerSession]);

  // Disconnect a specific device
  // Returns: { success: boolean, needsUserGesture: boolean }
  const disconnectDevice = useCallback(async (sessionIdToDisconnect: string): Promise<{ success: boolean; needsUserGesture: boolean }> => {
    try {
      // Set flag to prevent realtime validation from triggering during disconnect
      isDisconnectingRef.current = true;
      
      // Capture the current device ID BEFORE any async operations
      // This is critical on iOS where storage can become unreliable
      const currentDeviceId = getDeviceId();
      console.log("[disconnectDevice] Current device:", currentDeviceId, "Disconnecting:", sessionIdToDisconnect);
      
      // Safety check: don't disconnect ourselves!
      if (sessionIdToDisconnect === currentDeviceId) {
        console.error("[disconnectDevice] Attempted to disconnect self - aborting");
        toast.error("Cannot disconnect the current device");
        isDisconnectingRef.current = false;
        return { success: false, needsUserGesture: false };
      }
      
      const deviceInfo = navigator.userAgent;

      // First disconnect the target device
      const { data, error: disconnectError } = await supabase.functions.invoke("register-session", {
        body: { sessionId: currentDeviceId, deviceInfo, disconnectSessionId: sessionIdToDisconnect },
      });

      if (disconnectError) {
        console.error("Disconnect error:", disconnectError);
        toast.error("Failed to disconnect device");
        isDisconnectingRef.current = false;
        return { success: false, needsUserGesture: false };
      }

      if (!data?.success) {
        console.error("Disconnect failed:", data);
        toast.error("Failed to disconnect device");
        isDisconnectingRef.current = false;
        return { success: false, needsUserGesture: false };
      }

      // Update local state immediately - remove the disconnected device from the list
      setActiveDevices(prev => prev.filter(d => d.sessionId !== sessionIdToDisconnect));

      // Reset the validation cache so next validation is fresh
      lastValidationResultRef.current = null;
      lastValidationCallRef.current = 0;
      lastRegisterCallRef.current = 0;
      pendingRegisterRef.current = null;
      
      // Wait for DB propagation
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Now try to register this session with force to claim the slot
      // Use the same deviceId we captured at the start
      const registered = await registerSession(user?.id || "", true);
      
      if (registered) {
        // Important: Set these BEFORE closing dialog to ensure state is ready
        setIsDeviceLimitReached(false);
        setIsSessionRegistered(true);
        
        // Small delay to let state propagate before closing dialog
        await new Promise(resolve => setTimeout(resolve, 100));
        
        setShowDeviceLimitDialog(false);
        
        // Check if we're on iOS/Safari - needs user gesture to play
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || 
                     (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
        
        if (isIOS) {
          toast.success("Device disconnected. Tap Play to start music.", { duration: 5000 });
        } else {
          toast.success("Device disconnected. You can now play music.");
        }
        
        // Reset consecutive kicks counter
        consecutiveKicksRef.current = 0;
        
        return { success: true, needsUserGesture: isIOS };
      } else {
        // If still can't register, refresh the device list
        toast.info("Device disconnected. Refreshing device list...");
        return { success: false, needsUserGesture: false };
      }
    } catch (error) {
      console.error("Error disconnecting device:", error);
      toast.error("Failed to disconnect device");
      return { success: false, needsUserGesture: false };
    } finally {
      // Re-enable realtime validation after a delay to let state settle
      setTimeout(() => {
        isDisconnectingRef.current = false;
      }, 6000);
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
           console.log("Session not found in active_sessions - disconnected");
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
      // Reset to true (the default) so next login isn't blocked
      setIsSessionRegistered(true);
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
          // Reset to true (the default) so next login isn't blocked
          setIsSessionRegistered(true);
        }
      }
    );

    // Check for existing session - this is the initial load
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);

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
        // For returning users WITH cache, use cache values but still wait for fresh data
        const hasValidCache = !!validCache;
        
        if (isNewOAuthUser) {
          sessionStorage.removeItem(SHOWN_LOADING_KEY);
        }
        
        // CRITICAL FIX: Always keep isLoading true during initial load until Promise.all completes
        // The cache only pre-fills the subscription state to avoid flash of wrong content,
        // but we still need to wait for fresh data before rendering the main app.
        // Only skip the subscription loading spinner if we have a valid cache (to avoid double loading UI)
        if (hasValidCache && !isNewOAuthUser) {
          setIsSubscriptionLoading(false);
        } else {
          setIsSubscriptionLoading(true);
        }
        // Keep isLoading = true until Promise.all below finishes
        
        // Run all async operations in parallel for speed
        Promise.all([
          checkAdminRole(session.user.id),
          checkSubscription(session, true),
          registerSession(session.user.id),
        ]).finally(() => {
          initialLoadComplete.current = true;
          setIsLoading(false);
        });
        
        // Handle OAuth signup - add to Resend audience and send welcome email for new users
        // This handles the case where OAuth redirects back and onAuthStateChange is blocked
        if (isNewOAuthUser && session.user.email) {
          const userName = session.user.user_metadata?.full_name || session.user.user_metadata?.name;
          handleOAuthAudienceSignup(session.user.email, userName, session.user.created_at);
        }
      } else {
        setIsLoading(false);
        setIsSubscriptionLoading(false);
        initialLoadComplete.current = true;
      }
    });

    return () => authSubscription.unsubscribe();
  }, [registerSession]);

  // Session validation interval - check periodically to enforce device limits
  const MAX_CONSECUTIVE_KICKS = 3; // Require 3 consecutive failures before kicking (was 1)
  
  useEffect(() => {
    if (!session) return;

    const validateAndKickIfNeeded = async () => {
      // Skip validation during active disconnect flow
      if (isDisconnectingRef.current) {
        console.log("Skipping validation - disconnect in progress");
        return;
      }
      
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
  }, [session, validateSession, registerSession, isDeviceLimitReached, isSessionRegistered]);

  // Real-time subscription for session changes - immediately notify when this device is disconnected
  useEffect(() => {
    if (!session?.user?.id || !isSessionRegistered) return;

    // Subscribe to changes on active_sessions for this user.
    // IMPORTANT: We don't rely on payload.old.session_id because DELETE payloads can omit non-PK
    // columns depending on replica identity settings. Instead, on any relevant change we
    // re-validate whether THIS device is still present in active_sessions.
    const channel = supabase
      .channel(`sessions-${session.user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'active_sessions',
          filter: `user_id=eq.${session.user.id}`,
        },
        async (payload) => {
          console.log("Session table changed:", payload.eventType, payload);

          // Don't do anything during disconnect flow - we're actively managing state
          if (isDisconnectingRef.current) {
            console.log("Skipping realtime validation - disconnect in progress");
            return;
          }
          
          // Don't do anything while the user is in the device-limit dialog (read-only mode)
          if (isDeviceLimitReached) return;
          if (isSigningOut.current) return;

          const latestSession = (await supabase.auth.getSession()).data.session;
          if (!latestSession?.user) return;

          const result = await validateSession(latestSession);
          if (result === 'kicked') {
            toast.error(
              "You've been disconnected from another device. Need more locations? Add extra device slots in your Profile settings.",
              { duration: Infinity, closeButton: true }
            );
            await signOut();
          }
        }
      )
      .subscribe();
    
    return () => {
      supabase.removeChannel(channel);
    };
  }, [session?.user?.id, isSessionRegistered, isDeviceLimitReached, validateSession, signOut]);

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
