import { createContext, useContext, useState, useCallback, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

interface TargetPlaylist {
  id: string;
  name: string;
}

interface QuickAddContextType {
  targetPlaylist: TargetPlaylist | null;
  setTargetPlaylist: (playlist: TargetPlaylist | null) => void;
  isQuickAddMode: boolean;
  quickAddTrack: (trackId: string, trackTitle: string) => Promise<boolean>;
  recentlyAdded: Set<string>;
}

const QuickAddContext = createContext<QuickAddContextType | undefined>(undefined);

export const useQuickAdd = () => {
  const context = useContext(QuickAddContext);
  if (!context) {
    throw new Error("useQuickAdd must be used within a QuickAddProvider");
  }
  return context;
};

export const QuickAddProvider = ({ children }: { children: ReactNode }) => {
  const [targetPlaylist, setTargetPlaylist] = useState<TargetPlaylist | null>(null);
  const [recentlyAdded, setRecentlyAdded] = useState<Set<string>>(new Set());
  const { user, isAdmin } = useAuth();
  const { toast } = useToast();

  const isQuickAddMode = isAdmin && targetPlaylist !== null;

  const quickAddTrack = useCallback(async (trackId: string, trackTitle: string): Promise<boolean> => {
    if (!targetPlaylist || !user) return false;

    // Check if already added in this session
    if (recentlyAdded.has(trackId)) {
      toast({ title: "Already added to " + targetPlaylist.name });
      return false;
    }

    // Check if track already in playlist
    const { data: existing } = await supabase
      .from("playlist_tracks")
      .select("id")
      .eq("playlist_id", targetPlaylist.id)
      .eq("track_id", trackId)
      .maybeSingle();

    if (existing) {
      toast({ title: "Track already in " + targetPlaylist.name });
      // Mark as added to prevent repeated attempts
      setRecentlyAdded(prev => new Set(prev).add(trackId));
      return false;
    }

    // Get max position
    const { data: maxPos } = await supabase
      .from("playlist_tracks")
      .select("position")
      .eq("playlist_id", targetPlaylist.id)
      .order("position", { ascending: false })
      .limit(1)
      .maybeSingle();

    const newPosition = (maxPos?.position ?? -1) + 1;

    const { error } = await supabase
      .from("playlist_tracks")
      .insert({
        playlist_id: targetPlaylist.id,
        track_id: trackId,
        position: newPosition,
      });

    if (error) {
      toast({ title: "Error adding track", variant: "destructive" });
      return false;
    }

    // Track as recently added
    setRecentlyAdded(prev => new Set(prev).add(trackId));
    toast({ title: `Added "${trackTitle}" to ${targetPlaylist.name}` });
    return true;
  }, [targetPlaylist, user, recentlyAdded, toast]);

  // Clear recently added when target playlist changes
  const handleSetTargetPlaylist = useCallback((playlist: TargetPlaylist | null) => {
    setTargetPlaylist(playlist);
    setRecentlyAdded(new Set());
  }, []);

  return (
    <QuickAddContext.Provider value={{
      targetPlaylist,
      setTargetPlaylist: handleSetTargetPlaylist,
      isQuickAddMode,
      quickAddTrack,
      recentlyAdded,
    }}>
      {children}
    </QuickAddContext.Provider>
  );
};
