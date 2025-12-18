import { useEffect, useRef, useCallback } from "react";
import { getSignedAudioUrl } from "@/lib/storage";

// Refresh URL 30 minutes before expiry (URLs last 4 hours)
const REFRESH_INTERVAL = 3.5 * 60 * 60 * 1000; // 3.5 hours in ms

export const useUrlRefresh = (
  audioUrl: string | undefined,
  originalDbUrl: string | null,
  onUrlRefreshed: (newUrl: string) => void
) => {
  const refreshTimerRef = useRef<NodeJS.Timeout | null>(null);
  const urlCreatedAtRef = useRef<number>(Date.now());

  const refreshUrl = useCallback(async () => {
    if (!originalDbUrl) return;
    
    console.log("Refreshing signed URL before expiry...");
    const newUrl = await getSignedAudioUrl(originalDbUrl);
    
    if (newUrl) {
      urlCreatedAtRef.current = Date.now();
      onUrlRefreshed(newUrl);
      console.log("Signed URL refreshed successfully");
    }
  }, [originalDbUrl, onUrlRefreshed]);

  // Set up refresh timer when URL changes
  useEffect(() => {
    if (!audioUrl || !originalDbUrl) return;

    // Clear existing timer
    if (refreshTimerRef.current) {
      clearTimeout(refreshTimerRef.current);
    }

    // Record when this URL was created
    urlCreatedAtRef.current = Date.now();

    // Schedule refresh before expiry
    refreshTimerRef.current = setTimeout(() => {
      refreshUrl();
    }, REFRESH_INTERVAL);

    return () => {
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
      }
    };
  }, [audioUrl, originalDbUrl, refreshUrl]);

  // Also refresh when tab becomes visible if URL is old
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible" && originalDbUrl) {
        const urlAge = Date.now() - urlCreatedAtRef.current;
        // If URL is older than 3 hours, refresh it
        if (urlAge > 3 * 60 * 60 * 1000) {
          console.log("Tab visible with old URL, refreshing...");
          refreshUrl();
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [originalDbUrl, refreshUrl]);

  return { refreshUrl };
};
