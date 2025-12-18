import { useEffect, useCallback, useRef } from "react";
import { Track } from "@/data/musicData";

const STORAGE_KEY = "ambian_playback_state";
const SAVE_INTERVAL = 5000; // Save every 5 seconds

interface PlaybackState {
  currentTrackId: string | null;
  playlistTrackIds: string[];
  playlistId: string | null;
  position: number;
  wasPlaying: boolean;
  savedAt: number;
}

export const usePlaybackPersistence = (
  currentTrack: (Track & { audioUrl?: string }) | null,
  playlistTracks: Track[],
  isPlaying: boolean,
  getCurrentPosition: () => number
) => {
  const lastSaveRef = useRef(0);
  const playlistIdRef = useRef<string | null>(null);

  // Save state to localStorage
  const saveState = useCallback(() => {
    if (!currentTrack) return;
    
    const state: PlaybackState = {
      currentTrackId: currentTrack.id,
      playlistTrackIds: playlistTracks.map(t => t.id),
      playlistId: playlistIdRef.current,
      position: getCurrentPosition(),
      wasPlaying: isPlaying,
      savedAt: Date.now(),
    };
    
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      lastSaveRef.current = Date.now();
    } catch (e) {
      console.error("Failed to save playback state:", e);
    }
  }, [currentTrack, playlistTracks, isPlaying, getCurrentPosition]);

  // Auto-save periodically while playing
  useEffect(() => {
    if (!isPlaying || !currentTrack) return;

    const interval = setInterval(() => {
      saveState();
    }, SAVE_INTERVAL);

    return () => clearInterval(interval);
  }, [isPlaying, currentTrack, saveState]);

  // Save on track change
  useEffect(() => {
    if (currentTrack) {
      saveState();
    }
  }, [currentTrack?.id, saveState]);

  // Save before page unload
  useEffect(() => {
    const handleBeforeUnload = () => {
      saveState();
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [saveState]);

  // Set playlist ID for persistence
  const setPlaylistId = useCallback((id: string | null) => {
    playlistIdRef.current = id;
  }, []);

  // Load saved state
  const loadState = useCallback((): PlaybackState | null => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (!saved) return null;
      
      const state: PlaybackState = JSON.parse(saved);
      
      // Only restore if saved within last 24 hours
      const hoursSinceSave = (Date.now() - state.savedAt) / (1000 * 60 * 60);
      if (hoursSinceSave > 24) {
        localStorage.removeItem(STORAGE_KEY);
        return null;
      }
      
      return state;
    } catch (e) {
      console.error("Failed to load playback state:", e);
      return null;
    }
  }, []);

  // Clear saved state
  const clearState = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  return {
    saveState,
    loadState,
    clearState,
    setPlaylistId,
  };
};
