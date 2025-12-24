import { createContext, useContext, useState, useCallback, useRef, ReactNode, useEffect } from "react";
import { Track } from "@/data/musicData";
import { getSignedAudioUrl } from "@/lib/storage";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

interface PlaybackState {
  currentTrackId: string | null;
  playlistTrackIds: string[];
  position: number;
  wasPlaying: boolean;
  savedAt: number;
}

interface ScheduledTransition {
  track: Track & { audioUrl?: string };
  playlist: Track[];
}

interface PlayerContextType {
  currentTrack: (Track & { audioUrl?: string }) | null;
  isPlaying: boolean;
  shuffle: boolean;
  repeat: "off" | "all" | "one";
  crossfade: boolean;
  playlistTracksRef: React.MutableRefObject<Track[]>;
  handleTrackSelect: (track: Track, playlistTracks?: Track[]) => void;
  handlePlayPause: () => void;
  handleNext: () => Promise<void>;
  handlePrevious: () => Promise<void>;
  handleShuffleToggle: () => void;
  handleRepeatToggle: () => void;
  handleCrossfadeToggle: () => void;
  updateAudioUrl: (newUrl: string) => void;
  originalDbUrl: string | null;
  setSeekPosition: (position: number) => void;
  seekPosition: number | null;
  getNextTrack: () => Promise<(Track & { audioUrl?: string }) | null>;
  pendingScheduledTransition: ScheduledTransition | null;
  triggerScheduledCrossfade: (track: Track, playlist: Track[]) => Promise<void>;
  clearScheduledTransition: () => void;
  setCurrentTrackDirect: (track: Track & { audioUrl?: string }) => void;
}

const PlayerContext = createContext<PlayerContextType | undefined>(undefined);

export const usePlayer = () => {
  const context = useContext(PlayerContext);
  if (!context) {
    throw new Error("usePlayer must be used within a PlayerProvider");
  }
  return context;
};

// URL refresh interval - 3.5 hours (URLs last 4 hours)
const URL_REFRESH_INTERVAL = 3.5 * 60 * 60 * 1000;
const PERSISTENCE_KEY = "ambian_playback_state";

export const PlayerProvider = ({ children }: { children: ReactNode }) => {
  const { canPlayMusic, openDeviceLimitDialog } = useAuth();
  const [currentTrack, setCurrentTrack] = useState<(Track & { audioUrl?: string }) | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState<"off" | "all" | "one">("all");
  const [crossfade, setCrossfade] = useState(() => {
    const saved = localStorage.getItem("ambian_crossfade");
    return saved === "true";
  });
  const [originalDbUrl, setOriginalDbUrl] = useState<string | null>(null);
  const [seekPosition, setSeekPosition] = useState<number | null>(null);
  const [pendingScheduledTransition, setPendingScheduledTransition] = useState<ScheduledTransition | null>(null);
  const playlistTracksRef = useRef<Track[]>([]);
  const urlCreatedAtRef = useRef<number>(Date.now());
  const refreshTimerRef = useRef<NodeJS.Timeout | null>(null);
  const hasRestoredRef = useRef(false);

  // Update audio URL (used for URL refresh)
  const updateAudioUrl = useCallback((newUrl: string) => {
    setCurrentTrack(prev => prev ? { ...prev, audioUrl: newUrl } : null);
    urlCreatedAtRef.current = Date.now();
  }, []);

  // Proactive URL refresh before expiry
  useEffect(() => {
    if (!currentTrack?.audioUrl || !originalDbUrl) return;

    // Clear existing timer
    if (refreshTimerRef.current) {
      clearTimeout(refreshTimerRef.current);
    }

    urlCreatedAtRef.current = Date.now();

    // Schedule refresh before expiry
    refreshTimerRef.current = setTimeout(async () => {
      console.log("Proactively refreshing signed URL...");
      const newUrl = await getSignedAudioUrl(originalDbUrl);
      if (newUrl) {
        updateAudioUrl(newUrl);
        console.log("URL refreshed successfully");
      }
    }, URL_REFRESH_INTERVAL);

    return () => {
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
      }
    };
  }, [currentTrack?.audioUrl, originalDbUrl, updateAudioUrl]);

  // Refresh URL when tab becomes visible if URL is old
  useEffect(() => {
    const handleVisibilityChange = async () => {
      if (document.visibilityState === "visible" && originalDbUrl && currentTrack?.audioUrl) {
        const urlAge = Date.now() - urlCreatedAtRef.current;
        if (urlAge > 3 * 60 * 60 * 1000) { // 3 hours
          console.log("Tab visible with old URL, refreshing...");
          const newUrl = await getSignedAudioUrl(originalDbUrl);
          if (newUrl) {
            updateAudioUrl(newUrl);
          }
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [originalDbUrl, currentTrack?.audioUrl, updateAudioUrl]);

  // Save playback state to localStorage
  const savePlaybackState = useCallback(() => {
    if (!currentTrack) return;
    
    const state: PlaybackState = {
      currentTrackId: currentTrack.id,
      playlistTrackIds: playlistTracksRef.current.map(t => t.id),
      position: 0, // Will be updated by PlayerBar
      wasPlaying: isPlaying,
      savedAt: Date.now(),
    };
    
    try {
      localStorage.setItem(PERSISTENCE_KEY, JSON.stringify(state));
    } catch (e) {
      console.error("Failed to save playback state:", e);
    }
  }, [currentTrack, isPlaying]);

  // Save state periodically and on changes
  useEffect(() => {
    if (!currentTrack) return;
    
    savePlaybackState();
    
    const interval = setInterval(savePlaybackState, 10000); // Every 10 seconds
    
    return () => clearInterval(interval);
  }, [currentTrack?.id, isPlaying, savePlaybackState]);

  // Save before page unload
  useEffect(() => {
    const handleBeforeUnload = () => savePlaybackState();
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [savePlaybackState]);

  // Restore playback state on mount
  useEffect(() => {
    if (hasRestoredRef.current) return;
    hasRestoredRef.current = true;

    const restorePlayback = async () => {
      try {
        const saved = localStorage.getItem(PERSISTENCE_KEY);
        if (!saved) return;

        const state: PlaybackState = JSON.parse(saved);
        
        // Only restore if saved within last 24 hours
        const hoursSinceSave = (Date.now() - state.savedAt) / (1000 * 60 * 60);
        if (hoursSinceSave > 24 || !state.currentTrackId || state.playlistTrackIds.length === 0) {
          localStorage.removeItem(PERSISTENCE_KEY);
          return;
        }

        console.log("Restoring playback state...");

        // Fetch playlist tracks from DB
        const { data: tracks } = await supabase
          .from("tracks")
          .select("*")
          .in("id", state.playlistTrackIds);

        if (!tracks || tracks.length === 0) return;

        // Convert to Track format and maintain order
        const orderedTracks: Track[] = state.playlistTrackIds
          .map(id => tracks.find(t => t.id === id))
          .filter(Boolean)
          .map(t => ({
            id: t!.id,
            title: t!.title,
            artist: t!.artist,
            album: t!.album || "",
            duration: t!.duration || "0:00",
            cover: t!.cover_url || "/placeholder.svg",
            genre: t!.genre || "",
          }));

        if (orderedTracks.length === 0) return;

        playlistTracksRef.current = orderedTracks;

        // Find the NEXT track to play (skip current, start fresh for reliable autoplay)
        const currentIndex = orderedTracks.findIndex(t => t.id === state.currentTrackId);
        const nextIndex = (currentIndex + 1) % orderedTracks.length;
        const nextTrack = orderedTracks[nextIndex];
        
        // Fetch audio URL for next track
        const nextTrackData = tracks.find(t => t.id === nextTrack.id);
        if (nextTrackData?.audio_url) {
          setOriginalDbUrl(nextTrackData.audio_url);
          const signedUrl = await getSignedAudioUrl(nextTrackData.audio_url);
          setCurrentTrack({ ...nextTrack, audioUrl: signedUrl });
          
          // Auto-play the next track (browser may block, that's ok - silent failure)
          if (state.wasPlaying) {
            setIsPlaying(true);
          }
          
          console.log("Restored playlist, starting next track");
        }
      } catch (e) {
        console.error("Failed to restore playback state:", e);
      }
    };

    // Small delay to ensure auth is ready
    setTimeout(restorePlayback, 500);
  }, []);

  const handleTrackSelect = useCallback(async (track: Track, playlistTracks?: Track[]) => {
    // Block playback if device limit reached - show dialog instead of toast
    if (!canPlayMusic) {
      openDeviceLimitDialog();
      return;
    }

    if (playlistTracks) {
      playlistTracksRef.current = playlistTracks;
    }
    setSeekPosition(null);
    
    // If track already has a valid signed URL (not a raw DB URL), use it
    if (track.audioUrl && track.audioUrl.includes('token=')) {
      setCurrentTrack(track);
      setIsPlaying(true);
      return;
    }
    
    // Fetch signed URL for the track
    const { data } = await supabase
      .from("tracks")
      .select("audio_url")
      .eq("id", track.id)
      .single();
    
    if (data?.audio_url) {
      setOriginalDbUrl(data.audio_url);
      const signedUrl = await getSignedAudioUrl(data.audio_url);
      setCurrentTrack({ ...track, audioUrl: signedUrl });
    } else {
      setCurrentTrack(track);
    }
    setIsPlaying(true);
  }, [canPlayMusic, openDeviceLimitDialog]);

  const handlePlayPause = useCallback(() => {
    setIsPlaying((prev) => !prev);
  }, []);

  const fetchAndPlayTrack = useCallback(async (track: Track) => {
    if (track.audioUrl) {
      setCurrentTrack(track);
      setIsPlaying(true);
      setSeekPosition(null);
      return;
    }
    
    const { data } = await supabase
      .from("tracks")
      .select("audio_url")
      .eq("id", track.id)
      .single();
    
    if (data?.audio_url) {
      setOriginalDbUrl(data.audio_url);
      const signedUrl = await getSignedAudioUrl(data.audio_url);
      setCurrentTrack({ ...track, audioUrl: signedUrl });
    } else {
      setCurrentTrack(track);
    }
    setIsPlaying(true);
    setSeekPosition(null);
  }, []);

  const handleNext = useCallback(async () => {
    if (!currentTrack) return;
    const tracks = playlistTracksRef.current;
    if (tracks.length === 0) return;
    
    const currentIndex = tracks.findIndex((t) => t.id === currentTrack.id);
    if (currentIndex === -1) return;
    
    let nextIndex: number;
    if (shuffle) {
      const availableIndices = tracks.map((_, i) => i).filter(i => i !== currentIndex);
      nextIndex = availableIndices.length > 0 
        ? availableIndices[Math.floor(Math.random() * availableIndices.length)]
        : currentIndex;
    } else {
      nextIndex = (currentIndex + 1) % tracks.length;
    }
    
    await fetchAndPlayTrack(tracks[nextIndex]);
  }, [currentTrack, shuffle, fetchAndPlayTrack]);

  const handlePrevious = useCallback(async () => {
    if (!currentTrack) return;
    const tracks = playlistTracksRef.current;
    if (tracks.length === 0) return;
    
    const currentIndex = tracks.findIndex((t) => t.id === currentTrack.id);
    if (currentIndex === -1) return;
    
    const prevIndex = (currentIndex - 1 + tracks.length) % tracks.length;
    await fetchAndPlayTrack(tracks[prevIndex]);
  }, [currentTrack, fetchAndPlayTrack]);

  const handleShuffleToggle = useCallback(() => {
    setShuffle((prev) => !prev);
  }, []);

  const handleRepeatToggle = useCallback(() => {
    setRepeat((prev) => {
      if (prev === "off") return "all";
      if (prev === "all") return "one";
      return "off";
    });
  }, []);

  const handleCrossfadeToggle = useCallback(() => {
    setCrossfade((prev) => {
      const newValue = !prev;
      localStorage.setItem("ambian_crossfade", String(newValue));
      return newValue;
    });
  }, []);

  // Get next track with audio URL for crossfade preloading
  const getNextTrack = useCallback(async (): Promise<(Track & { audioUrl?: string }) | null> => {
    if (!currentTrack) return null;
    const tracks = playlistTracksRef.current;
    if (tracks.length === 0) return null;
    
    const currentIndex = tracks.findIndex((t) => t.id === currentTrack.id);
    if (currentIndex === -1) return null;
    
    let nextIndex: number;
    if (shuffle) {
      const availableIndices = tracks.map((_, i) => i).filter(i => i !== currentIndex);
      nextIndex = availableIndices.length > 0 
        ? availableIndices[Math.floor(Math.random() * availableIndices.length)]
        : currentIndex;
    } else {
      nextIndex = (currentIndex + 1) % tracks.length;
    }
    
    const nextTrack = tracks[nextIndex];
    
    // Fetch audio URL
    const { data } = await supabase
      .from("tracks")
      .select("audio_url")
      .eq("id", nextTrack.id)
      .single();
    
    if (data?.audio_url) {
      const signedUrl = await getSignedAudioUrl(data.audio_url);
      return { ...nextTrack, audioUrl: signedUrl };
    }
    
    return nextTrack;
  }, [currentTrack, shuffle]);

  // Trigger a scheduled crossfade transition (for playlist scheduler)
  const triggerScheduledCrossfade = useCallback(async (track: Track, playlist: Track[]) => {
    // If nothing is playing, just start normally
    if (!currentTrack || !isPlaying) {
      playlistTracksRef.current = playlist;
      const { data } = await supabase
        .from("tracks")
        .select("audio_url")
        .eq("id", track.id)
        .single();
      
      if (data?.audio_url) {
        setOriginalDbUrl(data.audio_url);
        const signedUrl = await getSignedAudioUrl(data.audio_url);
        setCurrentTrack({ ...track, audioUrl: signedUrl });
      } else {
        setCurrentTrack(track);
      }
      setIsPlaying(true);
      return;
    }

    // Fetch signed URL for the new track
    const { data } = await supabase
      .from("tracks")
      .select("audio_url")
      .eq("id", track.id)
      .single();
    
    let trackWithUrl: Track & { audioUrl?: string } = track;
    if (data?.audio_url) {
      const signedUrl = await getSignedAudioUrl(data.audio_url);
      trackWithUrl = { ...track, audioUrl: signedUrl };
    }

    // Set the pending transition - PlayerBar will handle the crossfade
    setPendingScheduledTransition({
      track: trackWithUrl,
      playlist,
    });
  }, [currentTrack, isPlaying]);

  const clearScheduledTransition = useCallback(() => {
    setPendingScheduledTransition(null);
  }, []);

  // Direct setter for crossfade completion (avoids double-advancing)
  const setCurrentTrackDirect = useCallback((track: Track & { audioUrl?: string }) => {
    setCurrentTrack(track);
    setSeekPosition(null);
  }, []);

  return (
    <PlayerContext.Provider
      value={{
        currentTrack,
        isPlaying,
        shuffle,
        repeat,
        crossfade,
        playlistTracksRef,
        handleTrackSelect,
        handlePlayPause,
        handleNext,
        handlePrevious,
        handleShuffleToggle,
        handleRepeatToggle,
        handleCrossfadeToggle,
        updateAudioUrl,
        originalDbUrl,
        setSeekPosition,
        seekPosition,
        getNextTrack,
        pendingScheduledTransition,
        triggerScheduledCrossfade,
        clearScheduledTransition,
        setCurrentTrackDirect,
      }}
    >
      {children}
    </PlayerContext.Provider>
  );
};