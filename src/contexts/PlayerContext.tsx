import { createContext, useContext, useState, useCallback, useRef, ReactNode } from "react";
import { Track } from "@/data/musicData";
import { getSignedAudioUrl } from "@/lib/storage";
import { supabase } from "@/integrations/supabase/client";

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
  const playlistTracksRef = useRef<Track[]>([]);

  const handleTrackSelect = useCallback((track: Track, playlistTracks?: Track[]) => {
    setCurrentTrack(track);
    setIsPlaying(true);
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
      return;
    }
    
    const { data } = await supabase
      .from("tracks")
      .select("audio_url")
      .eq("id", track.id)
      .single();
    
    if (data?.audio_url) {
      const signedUrl = await getSignedAudioUrl(data.audio_url);
      setCurrentTrack({ ...track, audioUrl: signedUrl });
    } else {
      setCurrentTrack(track);
    }
    setIsPlaying(true);
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
      }}
    >
      {children}
    </PlayerContext.Provider>
  );
};
