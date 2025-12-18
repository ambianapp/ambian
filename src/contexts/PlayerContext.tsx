import { createContext, useContext, useState, useCallback, useRef, ReactNode, useEffect } from "react";
import { Track } from "@/data/musicData";
import { getSignedAudioUrl } from "@/lib/storage";
import { supabase } from "@/integrations/supabase/client";

// URL refresh interval - 3.5 hours (URLs last 4 hours)
const URL_REFRESH_INTERVAL = 3.5 * 60 * 60 * 1000;
const PERSISTENCE_KEY = "ambian_playback_state";

interface PlaybackState {
  currentTrackId: string | null;
  playlistTrackIds: string[];
  position: number;
  wasPlaying: boolean;
  savedAt: number;
}

interface PlayerContextType {
  currentTrack: (Track & { audioUrl?: string }) | null;
  isPlaying: boolean;
  shuffle: boolean;
  repeat: "off" | "all" | "one";
  playlistTracksRef: React.MutableRefObject<Track[]>;
  handleTrackSelect: (track: Track, playlistTracks?: Track[]) => void;
  handlePlayPause: () => void;
  handleNext: () => Promise<void>;
  handlePrevious: () => Promise<void>;
  handleShuffleToggle: () => void;
  handleRepeatToggle: () => void;
  updateAudioUrl: (newUrl: string) => void;
  originalDbUrl: string | null;
  setSeekPosition: (position: number) => void;
  seekPosition: number | null;
}

const PlayerContext = createContext<PlayerContextType | undefined>(undefined);

export const usePlayer = () => {
  const context = useContext(PlayerContext);
  if (!context) {
    throw new Error("usePlayer must be used within a PlayerProvider");
  }
  return context;
};

export const PlayerProvider = ({ children }: { children: ReactNode }) => {
  const [currentTrack, setCurrentTrack] = useState<(Track & { audioUrl?: string }) | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState<"off" | "all" | "one">("off");
  const [originalDbUrl, setOriginalDbUrl] = useState<string | null>(null);
  const [seekPosition, setSeekPosition] = useState<number | null>(null);
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

        // Find and play current track
        const trackToPlay = orderedTracks.find(t => t.id === state.currentTrackId);
        if (!trackToPlay) return;

        // Fetch audio URL
        const trackData = tracks.find(t => t.id === state.currentTrackId);
        if (trackData?.audio_url) {
          setOriginalDbUrl(trackData.audio_url);
          const signedUrl = await getSignedAudioUrl(trackData.audio_url);
          setCurrentTrack({ ...trackToPlay, audioUrl: signedUrl });
          
          // Set position for PlayerBar to seek to
          if (state.position > 0) {
            setSeekPosition(state.position);
          }
          
          // Auto-play if was playing
          if (state.wasPlaying) {
            setIsPlaying(true);
          }
          
          console.log("Playback state restored");
        }
      } catch (e) {
        console.error("Failed to restore playback state:", e);
      }
    };

    // Small delay to ensure auth is ready
    setTimeout(restorePlayback, 500);
  }, []);

  const handleTrackSelect = useCallback((track: Track, playlistTracks?: Track[]) => {
    setCurrentTrack(track);
    setIsPlaying(true);
    setSeekPosition(null);
    if (playlistTracks) {
      playlistTracksRef.current = playlistTracks;
    }
  }, []);

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

  return (
    <PlayerContext.Provider
      value={{
        currentTrack,
        isPlaying,
        shuffle,
        repeat,
        playlistTracksRef,
        handleTrackSelect,
        handlePlayPause,
        handleNext,
        handlePrevious,
        handleShuffleToggle,
        handleRepeatToggle,
        updateAudioUrl,
        originalDbUrl,
        setSeekPosition,
        seekPosition,
      }}
    >
      {children}
    </PlayerContext.Provider>
  );
};