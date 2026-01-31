import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useToast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";
interface LikedSongsContextType {
  likedSongIds: Set<string>;
  isLoading: boolean;
  isLiked: (trackId: string) => boolean;
  toggleLike: (trackId: string) => Promise<void>;
  likedCount: number;
  refreshLikedSongs: () => Promise<void>;
}

const LikedSongsContext = createContext<LikedSongsContextType | undefined>(undefined);

export const useLikedSongs = () => {
  const context = useContext(LikedSongsContext);
  if (!context) {
    throw new Error("useLikedSongs must be used within a LikedSongsProvider");
  }
  return context;
};

interface LikedSongsProviderProps {
  children: ReactNode;
}

export const LikedSongsProvider = ({ children }: LikedSongsProviderProps) => {
  const { user } = useAuth();
  const { t } = useLanguage();
  const { toast } = useToast();
  const [likedSongIds, setLikedSongIds] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);

  const isUuid = (value: string) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

  // Fetch all liked songs once on mount or when user changes
  const fetchLikedSongs = useCallback(async () => {
    if (!user) {
      setLikedSongIds(new Set());
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    
    const { data, error } = await supabase
      .from("liked_songs")
      .select("track_id")
      .eq("user_id", user.id);

    if (error) {
      console.error("Error fetching liked songs:", error);
    } else if (data) {
      const ids = new Set(data.map((item) => item.track_id));
      setLikedSongIds(ids);
    }

    setIsLoading(false);
  }, [user]);

  useEffect(() => {
    fetchLikedSongs();
  }, [fetchLikedSongs]);

  // Subscribe to realtime changes for this user's liked songs
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel(`liked_songs_${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "liked_songs",
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          if (payload.eventType === "INSERT") {
            const newTrackId = (payload.new as { track_id: string }).track_id;
            setLikedSongIds((prev) => new Set([...prev, newTrackId]));
          } else if (payload.eventType === "DELETE") {
            const deletedTrackId = (payload.old as { track_id: string }).track_id;
            setLikedSongIds((prev) => {
              const updated = new Set(prev);
              updated.delete(deletedTrackId);
              return updated;
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  const isLiked = useCallback(
    (trackId: string) => {
      return likedSongIds.has(trackId);
    },
    [likedSongIds]
  );

  const toggleLike = useCallback(
    async (trackId: string) => {
      if (!user) {
        toast({ title: t("toast.signInRequired"), variant: "destructive" });
        return;
      }

      if (!isUuid(trackId)) {
        toast({ title: t("toast.cannotLikeTrack"), variant: "destructive" });
        return;
      }

      const currentlyLiked = likedSongIds.has(trackId);

      // Optimistic update
      setLikedSongIds((prev) => {
        const updated = new Set(prev);
        if (currentlyLiked) {
          updated.delete(trackId);
        } else {
          updated.add(trackId);
        }
        return updated;
      });

      if (currentlyLiked) {
        const { error } = await supabase
          .from("liked_songs")
          .delete()
          .eq("user_id", user.id)
          .eq("track_id", trackId);

        if (error) {
          // Revert on error
          setLikedSongIds((prev) => new Set([...prev, trackId]));
          toast({ title: t("toast.errorRemovingLiked"), variant: "destructive" });
        } else {
          toast({ title: t("toast.removedFromLiked") });
        }
      } else {
        const { error } = await supabase
          .from("liked_songs")
          .insert({ user_id: user.id, track_id: trackId });

        if (error) {
          // Revert on error
          setLikedSongIds((prev) => {
            const updated = new Set(prev);
            updated.delete(trackId);
            return updated;
          });
          toast({ title: t("toast.errorAddingLiked"), variant: "destructive" });
        } else {
          toast({ 
            title: t("toast.addedToLiked"),
            action: (
              <ToastAction 
                altText="View Liked Songs"
                onClick={() => window.dispatchEvent(new CustomEvent('navigate-to-liked-songs'))}
              >
                View
              </ToastAction>
            ),
          });
        }
      }
    },
    [user, likedSongIds, toast, t]
  );

  const refreshLikedSongs = useCallback(async () => {
    await fetchLikedSongs();
  }, [fetchLikedSongs]);

  return (
    <LikedSongsContext.Provider
      value={{
        likedSongIds,
        isLoading,
        isLiked,
        toggleLike,
        likedCount: likedSongIds.size,
        refreshLikedSongs,
      }}
    >
      {children}
    </LikedSongsContext.Provider>
  );
};
