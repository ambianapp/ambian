import { useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { usePlayer } from "@/contexts/PlayerContext";
import { Track } from "@/data/musicData";
import { useToast } from "@/hooks/use-toast";

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
  const { user } = useAuth();
  const { handleTrackSelect, currentTrack } = usePlayer();
  const { toast } = useToast();
  const lastScheduleIdRef = useRef<string | null>(null);
  const checkIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const getCurrentSchedule = useCallback((schedules: Schedule[]) => {
    const now = new Date();
    const currentDay = now.getDay();
    const currentTime = now.toTimeString().slice(0, 5);

    // Find all matching schedules and pick highest priority
    const matching = schedules.filter(
      s =>
        s.is_active &&
        s.days_of_week.includes(currentDay) &&
        s.start_time.slice(0, 5) <= currentTime &&
        s.end_time.slice(0, 5) > currentTime
    );

    if (matching.length === 0) return null;

    // Return highest priority
    return matching.reduce((prev, curr) =>
      curr.priority > prev.priority ? curr : prev
    );
  }, []);

  const loadAndPlayPlaylist = useCallback(async (schedule: Schedule) => {
    // Fetch playlist tracks
    const { data: playlistTracks, error } = await supabase
      .from("playlist_tracks")
      .select("tracks(*)")
      .eq("playlist_id", schedule.playlist_id)
      .order("position");

    if (error || !playlistTracks || playlistTracks.length === 0) {
      console.log("No tracks found for scheduled playlist");
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
      // Start playing first track with full playlist
      handleTrackSelect(tracks[0], tracks);
      
      toast({
        title: "Scheduled playlist started",
        description: schedule.name || "Playing scheduled music",
      });
    }
  }, [handleTrackSelect, toast]);

  const checkSchedule = useCallback(async () => {
    if (!user) return;

    // Fetch user's schedules
    const { data: schedules, error } = await supabase
      .from("playlist_schedules")
      .select("*")
      .eq("user_id", user.id)
      .eq("is_active", true);

    if (error || !schedules) return;

    const currentSchedule = getCurrentSchedule(schedules);

    if (currentSchedule) {
      // Only switch if schedule changed
      if (lastScheduleIdRef.current !== currentSchedule.id) {
        lastScheduleIdRef.current = currentSchedule.id;
        await loadAndPlayPlaylist(currentSchedule);
      }
    } else {
      // No active schedule
      lastScheduleIdRef.current = null;
    }
  }, [user, getCurrentSchedule, loadAndPlayPlaylist]);

  useEffect(() => {
    if (!user) return;

    // Check immediately on mount
    checkSchedule();

    // Check every minute
    checkIntervalRef.current = setInterval(checkSchedule, 60000);

    return () => {
      if (checkIntervalRef.current) {
        clearInterval(checkIntervalRef.current);
      }
    };
  }, [user, checkSchedule]);

  return { checkSchedule };
};
