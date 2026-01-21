import { useEffect, useRef, useCallback, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { usePlayer } from "@/contexts/PlayerContext";
import { Track } from "@/data/musicData";
import { useToast } from "@/hooks/use-toast";

const SCHEDULER_ENABLED_KEY = "ambian_scheduler_enabled";

interface Schedule {
  id: string;
  playlist_id: string;
  name: string | null;
  days_of_week: number[];
  start_time: string;
  end_time: string;
  is_active: boolean;
  priority: number;
}

interface PlaylistTrack {
  id: string;
  title: string;
  artist: string;
  album: string | null;
  duration: string | null;
  cover_url: string | null;
  audio_url: string | null;
  genre: string | null;
}

export const usePlaylistScheduler = () => {
  const { user, subscription } = useAuth();
  const { triggerScheduledCrossfade, currentTrack, isPlaying } = usePlayer();
  const { toast } = useToast();
  
  // Don't run scheduler if user doesn't have active access
  const hasAccess = subscription.subscribed || subscription.isTrial;
  const lastScheduleIdRef = useRef<string | null>(null);
  const lastPlaylistIdRef = useRef<string | null>(null);
  const checkIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const cachedSchedulesRef = useRef<{ schedules: Schedule[]; fetchedAt: number } | null>(null);
  const CACHE_TTL = 5 * 60 * 1000; // 5 minutes cache
  const [isEnabled, setIsEnabled] = useState(() => {
    const saved = localStorage.getItem(SCHEDULER_ENABLED_KEY);
    // Default to OFF - user must explicitly enable scheduler
    return saved === "true";
  });

  const toggleScheduler = useCallback((enabled: boolean) => {
    setIsEnabled(enabled);
    localStorage.setItem(SCHEDULER_ENABLED_KEY, String(enabled));
    if (!enabled) {
      lastScheduleIdRef.current = null;
      lastPlaylistIdRef.current = null;
      cachedSchedulesRef.current = null; // Clear cache when disabled
    }
  }, []);

  const getCurrentSchedule = useCallback((schedules: Schedule[]) => {
    const now = new Date();
    const currentDay = now.getDay();
    const currentTime = now.toTimeString().slice(0, 5);

    console.log("[Scheduler] Checking schedules at", currentTime, "day", currentDay);

    // Find all matching schedules and pick highest priority
    const matching = schedules.filter(s => {
      if (!s.is_active) return false;
      
      const startTime = s.start_time.slice(0, 5);
      const endTime = s.end_time.slice(0, 5);
      
      // Check if schedule spans midnight (e.g., 21:00 to 09:00)
      const spansOvernight = startTime > endTime;
      
      if (spansOvernight) {
        // For overnight schedules, check if current time is after start OR before end
        // Need to check correct day for each case
        const isAfterStart = currentTime >= startTime && s.days_of_week.includes(currentDay);
        // If before end time, we started yesterday, so check yesterday's day
        const yesterdayDay = (currentDay + 6) % 7;
        const isBeforeEnd = currentTime < endTime && s.days_of_week.includes(yesterdayDay);
        
        console.log("[Scheduler]", s.name, "overnight check:", { 
          startTime, endTime, currentTime, 
          isAfterStart, isBeforeEnd, 
          currentDay, yesterdayDay,
          scheduleDays: s.days_of_week 
        });
        
        return isAfterStart || isBeforeEnd;
      } else {
        // Normal same-day schedule
        const matches = s.days_of_week.includes(currentDay) && 
               currentTime >= startTime && 
               currentTime < endTime;
        console.log("[Scheduler]", s.name, "day check:", { startTime, endTime, currentTime, matches });
        return matches;
      }
    });

    if (matching.length === 0) {
      console.log("[Scheduler] No matching schedule found");
      return null;
    }

    // Return highest priority
    const selected = matching.reduce((prev, curr) =>
      curr.priority > prev.priority ? curr : prev
    );
    console.log("[Scheduler] Selected schedule:", selected.name, "playlist:", selected.playlist_id);
    return selected;
  }, []);

  const loadAndPlayPlaylist = useCallback(async (schedule: Schedule) => {
    console.log("[Scheduler] Loading playlist for schedule:", schedule.name, "playlist_id:", schedule.playlist_id);
    
    // Fetch playlist tracks
    const { data: playlistTracks, error } = await supabase
      .from("playlist_tracks")
      .select("tracks(*)")
      .eq("playlist_id", schedule.playlist_id)
      .order("position");

    if (error || !playlistTracks || playlistTracks.length === 0) {
      console.log("[Scheduler] No tracks found for scheduled playlist, error:", error);
      return;
    }

    const tracks: Track[] = playlistTracks
      .map((pt: any) => pt.tracks as PlaylistTrack)
      .filter(Boolean)
      .map((t: PlaylistTrack) => ({
        id: t.id,
        title: t.title,
        artist: t.artist,
        album: t.album || "",
        duration: t.duration || "0:00",
        cover: t.cover_url || "/placeholder.svg",
        genre: t.genre || "",
        audioUrl: t.audio_url || undefined,
      }));

    if (tracks.length > 0) {
      console.log("[Scheduler] Starting scheduled playlist with", tracks.length, "tracks, first track:", tracks[0].title);
      
      // Update last playlist ID BEFORE triggering to prevent race conditions
      lastPlaylistIdRef.current = schedule.playlist_id;
      
      // Use crossfade transition for smooth playlist changes
      try {
        await triggerScheduledCrossfade(tracks[0], tracks);
        console.log("[Scheduler] triggerScheduledCrossfade completed successfully");
        
        toast({
          title: "Scheduled playlist started",
          description: schedule.name || "Playing scheduled music",
        });
      } catch (err) {
        console.error("[Scheduler] triggerScheduledCrossfade failed:", err);
      }
    }
  }, [triggerScheduledCrossfade, toast]);

  const checkSchedule = useCallback(async (force = false) => {
    if (!user || !isEnabled || !hasAccess) return;

    console.log("[Scheduler] Checking schedule, force:", force);

    // Use cached schedules if still valid
    const now = Date.now();
    let schedules: Schedule[] | null = null;
    
    if (!force && cachedSchedulesRef.current && now - cachedSchedulesRef.current.fetchedAt < CACHE_TTL) {
      schedules = cachedSchedulesRef.current.schedules;
    } else {
      // Fetch user's schedules from DB
      const { data, error } = await supabase
        .from("playlist_schedules")
        .select("*")
        .eq("user_id", user.id)
        .eq("is_active", true);

      if (error || !data) {
        console.log("[Scheduler] Error fetching schedules:", error);
        return;
      }
      
      schedules = data;
      cachedSchedulesRef.current = { schedules: data, fetchedAt: now };
      console.log("[Scheduler] Fetched", data.length, "active schedules");
    }

    const currentSchedule = getCurrentSchedule(schedules);

    if (currentSchedule) {
      // Switch if schedule changed OR if playlist changed
      const scheduleChanged = lastScheduleIdRef.current !== currentSchedule.id;
      const playlistChanged = lastPlaylistIdRef.current !== currentSchedule.playlist_id;
      
      console.log("[Scheduler] Current schedule:", currentSchedule.name, 
        "scheduleChanged:", scheduleChanged, 
        "playlistChanged:", playlistChanged,
        "lastScheduleId:", lastScheduleIdRef.current,
        "currentScheduleId:", currentSchedule.id
      );
      
      if (scheduleChanged) {
        lastScheduleIdRef.current = currentSchedule.id;
        await loadAndPlayPlaylist(currentSchedule);
      }
    } else {
      // No active schedule - reset tracking but don't stop music
      console.log("[Scheduler] No active schedule, clearing refs");
      lastScheduleIdRef.current = null;
      // Don't clear lastPlaylistIdRef so if we come back to same schedule, 
      // we don't re-trigger unless the playlist actually changed
    }
  }, [user, isEnabled, hasAccess, getCurrentSchedule, loadAndPlayPlaylist]);

  // Check on mount and interval
  useEffect(() => {
    if (!user || !isEnabled || !hasAccess) return;

    // Check immediately on mount
    console.log("[Scheduler] Initial check on mount");
    checkSchedule(true); // Force refresh on mount

    // Check every minute (but intervals may not fire in background)
    checkIntervalRef.current = setInterval(() => {
      checkSchedule();
    }, 60000);

    return () => {
      if (checkIntervalRef.current) {
        clearInterval(checkIntervalRef.current);
      }
    };
  }, [user, isEnabled, hasAccess, checkSchedule]);

  // CRITICAL: Check schedule when tab becomes visible (handles Android wake)
  useEffect(() => {
    if (!user || !isEnabled || !hasAccess) return;

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        console.log("[Scheduler] Tab became visible, checking schedule");
        // Force refresh schedules and check
        cachedSchedulesRef.current = null; // Clear cache to get fresh data
        checkSchedule(true);
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [user, isEnabled, hasAccess, checkSchedule]);

  // CRITICAL: Check schedule when playback state changes (track ends)
  useEffect(() => {
    if (!user || !isEnabled || !isPlaying || !hasAccess) return;

    // When a new track starts, check if we should switch playlists
    console.log("[Scheduler] Track changed, checking schedule");
    checkSchedule();
  }, [currentTrack?.id, isPlaying, user, isEnabled, hasAccess, checkSchedule]);

  // Check schedule when online status changes (in case we were offline during transition)
  useEffect(() => {
    if (!user || !isEnabled || !hasAccess) return;

    const handleOnline = () => {
      console.log("[Scheduler] Device came online, checking schedule");
      cachedSchedulesRef.current = null; // Clear cache
      checkSchedule(true);
    };

    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
  }, [user, isEnabled, hasAccess, checkSchedule]);

  return { checkSchedule, isEnabled, toggleScheduler };
};
