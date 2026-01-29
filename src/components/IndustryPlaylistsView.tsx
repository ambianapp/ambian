import { useState, useEffect } from "react";
import { ArrowLeft, Play, Pause, Shuffle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { usePlayer } from "@/contexts/PlayerContext";
import { getSignedAudioUrl } from "@/lib/storage";
import SignedImage from "./SignedImage";
import QuickMixDialog from "./QuickMixDialog";
import type { Track } from "@/data/musicData";

interface SelectedPlaylist {
  id: string;
  name: string;
  cover: string | null;
  description: string | null;
}

interface DbPlaylist {
  id: string;
  name: string;
  description: string | null;
  cover_url: string | null;
}

interface IndustryPlaylistsViewProps {
  collectionId: string;
  collectionName: string;
  collectionIcon?: string;
  onBack: () => void;
  onPlaylistSelect: (playlist: SelectedPlaylist) => void;
  onTrackSelect: (track: Track, playlistTracks?: Track[]) => void;
}

const IndustryPlaylistsView = ({
  collectionId,
  collectionName,
  onBack,
  onPlaylistSelect,
  onTrackSelect,
}: IndustryPlaylistsViewProps) => {
  const { t } = useLanguage();
  const { user } = useAuth();
  const { isPlaying, currentPlaylistId } = usePlayer();
  const [playlists, setPlaylists] = useState<DbPlaylist[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadingPlaylistId, setLoadingPlaylistId] = useState<string | null>(null);

  useEffect(() => {
    loadPlaylists();
  }, [collectionId]);

  const loadPlaylists = async () => {
    setIsLoading(true);
    const { data } = await supabase
      .from("industry_collection_playlists")
      .select(`
        playlist_id,
        display_order,
        playlists (
          id,
          name,
          description,
          cover_url
        )
      `)
      .eq("collection_id", collectionId)
      .order("display_order", { ascending: true });

    const fetchedPlaylists = (data || [])
      .map((item: any) => item.playlists)
      .filter(Boolean);
    setPlaylists(fetchedPlaylists);
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
    setLoadingPlaylistId(playlistId);

    try {
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
    } finally {
      setLoadingPlaylistId(null);
    }
  };

  // Get playlist IDs for the QuickMixDialog
  const industryPlaylistIds = playlists.map(p => p.id);

  return (
    <div className="flex-1 overflow-y-auto pb-40 md:pb-32">
      <div className="p-4 sm:p-6 space-y-4">
        {/* Header with Back Button */}
        <div className="flex items-start gap-3 mr-12 md:mr-0">
          <Button
            variant="ghost"
            size="icon"
            onClick={onBack}
            className="shrink-0 mt-0.5"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className="text-xl sm:text-2xl font-bold text-foreground">{collectionName}</h1>
        </div>

        {/* Shuffle Playlists Button */}
        {playlists.length > 1 && !isLoading && (
          <QuickMixDialog
            onTrackSelect={onTrackSelect}
            preselectedPlaylistIds={industryPlaylistIds}
            trigger={
              <Button variant="outline" className="w-full gap-2">
                <Shuffle className="w-4 h-4" />
                {t("quickMix.button")}
              </Button>
            }
          />
        )}

        {/* Playlists List */}
        {isLoading ? (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 6 }).map((_, i) => (
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
            {playlists.map((playlist) => (
              <div
                key={playlist.id}
                className="flex items-center gap-4 p-3 rounded-lg hover:bg-secondary/50 transition-colors cursor-pointer group"
                onClick={() => handlePlaylistClick(playlist)}
              >
                <div className="relative w-12 h-12 rounded-lg overflow-hidden bg-secondary shrink-0">
                  <SignedImage
                    src={playlist.cover_url || "/placeholder.svg"}
                    alt={playlist.name}
                    className="w-full h-full object-cover"
                  />
                  {(() => {
                    const isThisPlaylistPlaying = (currentPlaylistId === playlist.id && isPlaying) || loadingPlaylistId === playlist.id;
                    return (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handlePlayPlaylist(playlist.id);
                        }}
                        className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        {isThisPlaylistPlaying ? (
                          <Pause className="w-5 h-5 text-white fill-white" />
                        ) : (
                          <Play className="w-5 h-5 text-white fill-white" />
                        )}
                      </button>
                    );
                  })()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-foreground truncate">{playlist.name}</p>
                  {playlist.description && (
                    <p className="text-sm text-muted-foreground truncate">{playlist.description}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {!isLoading && playlists.length === 0 && (
          <div className="text-center py-12">
            <p className="text-muted-foreground">
              {t("industry.noPlaylists")}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default IndustryPlaylistsView;
