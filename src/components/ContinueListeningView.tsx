import { useState, useEffect } from "react";
import { ArrowLeft, Play, History, Shuffle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { getSignedAudioUrl } from "@/lib/storage";
import type { Track } from "@/data/musicData";
import type { Tables } from "@/integrations/supabase/types";

type DbPlaylist = Tables<"playlists">;

interface SelectedPlaylist {
  id: string;
  name: string;
  cover: string | null;
  description: string | null;
}

interface QuickMixItem {
  id: string;
  name: string | null;
  playlist_ids: string[];
  played_at: string;
}

interface ContinueListeningViewProps {
  onBack: () => void;
  onPlaylistSelect: (playlist: SelectedPlaylist) => void;
  onTrackSelect: (track: Track, playlistTracks?: Track[], isQuickMix?: boolean) => void;
}

type ListItem = 
  | { type: "playlist"; data: DbPlaylist; playedAt: string }
  | { type: "quickmix"; data: QuickMixItem };

const ContinueListeningView = ({
  onBack,
  onPlaylistSelect,
  onTrackSelect,
}: ContinueListeningViewProps) => {
  const { t } = useLanguage();
  const { user } = useAuth();
  const [items, setItems] = useState<ListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [playingMixId, setPlayingMixId] = useState<string | null>(null);

  useEffect(() => {
    loadRecentlyPlayed();
  }, [user?.id]);

  const loadRecentlyPlayed = async () => {
    if (!user) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    
    // Fetch both play history and quick mix history in parallel
    const [historyResult, quickMixResult] = await Promise.all([
      supabase
        .from("play_history")
        .select("playlist_id, played_at")
        .eq("user_id", user.id)
        .order("played_at", { ascending: false })
        .limit(20),
      supabase
        .from("quick_mix_history")
        .select("id, name, playlist_ids, played_at")
        .eq("user_id", user.id)
        .order("played_at", { ascending: false })
        .limit(10),
    ]);

    const combinedItems: ListItem[] = [];

    // Process playlist history
    if (historyResult.data && historyResult.data.length > 0) {
      const uniquePlaylistIds = [...new Set(historyResult.data.map(h => h.playlist_id))];
      
      const { data: playlistData } = await supabase
        .from("playlists")
        .select("*")
        .in("id", uniquePlaylistIds);

      if (playlistData) {
        // Create a map for quick lookup
        const playlistMap = new Map(playlistData.map(p => [p.id, p]));
        const playedAtMap = new Map<string, string>();
        
        // Get the most recent played_at for each playlist
        historyResult.data.forEach(h => {
          if (!playedAtMap.has(h.playlist_id)) {
            playedAtMap.set(h.playlist_id, h.played_at);
          }
        });

        uniquePlaylistIds.forEach(id => {
          const playlist = playlistMap.get(id);
          const playedAt = playedAtMap.get(id);
          if (playlist && playedAt) {
            combinedItems.push({
              type: "playlist",
              data: playlist,
              playedAt,
            });
          }
        });
      }
    }

    // Process quick mix history
    if (quickMixResult.data) {
      quickMixResult.data.forEach(mix => {
        combinedItems.push({
          type: "quickmix",
          data: mix as QuickMixItem,
        });
      });
    }

    // Sort by played_at (most recent first)
    combinedItems.sort((a, b) => {
      const aTime = a.type === "playlist" ? a.playedAt : a.data.played_at;
      const bTime = b.type === "playlist" ? b.playedAt : b.data.played_at;
      return new Date(bTime).getTime() - new Date(aTime).getTime();
    });

    setItems(combinedItems);
    setIsLoading(false);
  };

  const handlePlaylistClick = async (playlist: DbPlaylist) => {
    if (user) {
      await supabase.from("play_history").insert({
        user_id: user.id,
        playlist_id: playlist.id,
      });
    }
    onPlaylistSelect({
      id: playlist.id,
      name: playlist.name,
      cover: playlist.cover_url,
      description: playlist.description,
    });
  };

  const handlePlayPlaylist = async (playlistId: string) => {
    const { data } = await supabase
      .from("playlist_tracks")
      .select("track_id, tracks(*)")
      .eq("playlist_id", playlistId)
      .order("position", { ascending: true })
      .limit(1);

    if (data && data.length > 0) {
      const track = (data[0] as any).tracks;
      if (track) {
        const signedAudioUrl = await getSignedAudioUrl(track.audio_url);

        const { data: allTracksData } = await supabase
          .from("playlist_tracks")
          .select("tracks(*)")
          .eq("playlist_id", playlistId)
          .order("position", { ascending: true });

        const playlistTracks: Track[] = (allTracksData || [])
          .map((item: any) => item.tracks)
          .filter(Boolean)
          .map((t: any) => ({
            id: t.id,
            title: t.title,
            artist: t.artist,
            album: t.album || "",
            duration: t.duration || "",
            cover: t.cover_url || "/placeholder.svg",
            genre: t.genre || "",
          }));

        if (user) {
          await supabase.from("play_history").insert({
            user_id: user.id,
            playlist_id: playlistId,
          });
        }

        onTrackSelect({
          id: track.id,
          title: track.title,
          artist: track.artist,
          album: track.album || "",
          duration: track.duration || "",
          cover: track.cover_url || "/placeholder.svg",
          genre: track.genre || "",
          audioUrl: signedAudioUrl,
        }, playlistTracks);
      }
    }
  };

  const handlePlayQuickMix = async (mix: QuickMixItem) => {
    if (mix.playlist_ids.length === 0) return;
    
    setPlayingMixId(mix.id);

    try {
      // Fetch all tracks from the playlists in this mix
      const { data: playlistTracksData } = await supabase
        .from("playlist_tracks")
        .select("tracks(*)")
        .in("playlist_id", mix.playlist_ids);

      if (!playlistTracksData || playlistTracksData.length === 0) {
        setPlayingMixId(null);
        return;
      }

      const allTracks: Track[] = playlistTracksData
        .map((item: any) => item.tracks)
        .filter(Boolean)
        .map((t: any) => ({
          id: t.id,
          title: t.title,
          artist: t.artist,
          album: t.album || "",
          duration: t.duration || "",
          cover: t.cover_url || "/placeholder.svg",
          genre: t.genre || "",
        }));

      // Remove duplicates
      const uniqueTracks = allTracks.filter((track, index, self) => 
        index === self.findIndex(t => t.id === track.id)
      );

      if (uniqueTracks.length === 0) {
        setPlayingMixId(null);
        return;
      }

      // Shuffle the tracks
      const shuffledTracks = [...uniqueTracks].sort(() => Math.random() - 0.5);

      // Get signed URL for the first track
      const firstTrack = shuffledTracks[0];
      const { data: trackData } = await supabase
        .from("tracks")
        .select("audio_url")
        .eq("id", firstTrack.id)
        .single();

      const signedAudioUrl = trackData?.audio_url 
        ? await getSignedAudioUrl(trackData.audio_url)
        : undefined;

      // Update quick mix history timestamp
      if (user) {
        await supabase.from("quick_mix_history").insert({
          user_id: user.id,
          playlist_ids: mix.playlist_ids,
          name: mix.name,
        });
      }

      onTrackSelect({
        ...firstTrack,
        audioUrl: signedAudioUrl,
      }, shuffledTracks, true);
    } finally {
      setPlayingMixId(null);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto pb-40 md:pb-32">
      <div className="p-4 sm:p-6 space-y-4">
        {/* Header with Back Button */}
        <div className="flex items-center gap-3 mr-12 md:mr-0">
          <Button
            variant="ghost"
            size="icon"
            onClick={onBack}
            className="shrink-0"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <History className="w-5 h-5 text-primary" />
          <h1 className="text-xl sm:text-2xl font-bold text-foreground">{t("home.continue")}</h1>
        </div>

        {/* Items List */}
        {isLoading ? (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 p-3 bg-secondary/50 rounded-lg animate-pulse">
                <div className="w-12 h-12 bg-secondary rounded-lg" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-secondary rounded w-1/3" />
                  <div className="h-3 bg-secondary rounded w-1/2" />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            {items.map((item) => {
              if (item.type === "playlist") {
                const playlist = item.data;
                return (
                  <div
                    key={`playlist-${playlist.id}`}
                    className="flex items-center gap-4 p-3 rounded-lg hover:bg-secondary/50 transition-colors cursor-pointer group"
                    onClick={() => handlePlaylistClick(playlist)}
                  >
                    <div className="relative w-12 h-12 rounded-lg overflow-hidden bg-secondary shrink-0">
                      <img
                        src={playlist.cover_url || "/placeholder.svg"}
                        alt={playlist.name}
                        className="w-full h-full object-cover"
                      />
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handlePlayPlaylist(playlist.id);
                        }}
                        className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <Play className="w-5 h-5 text-white fill-white" />
                      </button>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-foreground truncate">{playlist.name}</p>
                      {playlist.description && (
                        <p className="text-sm text-muted-foreground truncate">{playlist.description}</p>
                      )}
                    </div>
                  </div>
                );
              } else {
                const mix = item.data;
                return (
                  <div
                    key={`quickmix-${mix.id}`}
                    className="flex items-center gap-4 p-3 rounded-lg hover:bg-secondary/50 transition-colors cursor-pointer group"
                    onClick={() => handlePlayQuickMix(mix)}
                  >
                    <div className="relative w-12 h-12 rounded-lg overflow-hidden bg-gradient-to-br from-primary/60 to-primary shrink-0 flex items-center justify-center">
                      <Shuffle className="w-5 h-5 text-primary-foreground" />
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handlePlayQuickMix(mix);
                        }}
                        className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        {playingMixId === mix.id ? (
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <Play className="w-5 h-5 text-white fill-white" />
                        )}
                      </button>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-foreground truncate">
                          {mix.name || t("quickMix.title")}
                        </p>
                        <span className="text-xs bg-primary/20 text-primary px-1.5 py-0.5 rounded shrink-0">
                          {t("quickMix.badge")}
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {mix.playlist_ids.length} {t("quickMix.playlistCount")}
                      </p>
                    </div>
                  </div>
                );
              }
            })}
          </div>
        )}

        {!isLoading && items.length === 0 && (
          <div className="text-center py-12">
            <p className="text-muted-foreground">
              {t("home.noRecentPlaylists")}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default ContinueListeningView;
