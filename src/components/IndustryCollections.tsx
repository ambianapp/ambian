import { useState, useEffect } from "react";
import { ChevronRight, Sparkles, Scissors, Dumbbell, UtensilsCrossed, ShoppingBag, Building2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import PlaylistCard from "./PlaylistCard";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { getSignedAudioUrl } from "@/lib/storage";
import type { Track } from "@/data/musicData";

interface IndustryCollection {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
  cover_url: string | null;
  display_order: number;
}

interface DbPlaylist {
  id: string;
  name: string;
  description: string | null;
  cover_url: string | null;
}

interface SelectedPlaylist {
  id: string;
  name: string;
  cover: string | null;
  description: string | null;
}

interface IndustryCollectionsProps {
  onPlaylistSelect: (playlist: SelectedPlaylist) => void;
  onTrackSelect: (track: Track, playlistTracks?: Track[]) => void;
}

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  Sparkles,
  Scissors,
  Dumbbell,
  UtensilsCrossed,
  ShoppingBag,
  Building2,
};

const IndustryCollections = ({ onPlaylistSelect, onTrackSelect }: IndustryCollectionsProps) => {
  const { t } = useLanguage();
  const { user } = useAuth();
  const [collections, setCollections] = useState<IndustryCollection[]>([]);
  const [selectedCollection, setSelectedCollection] = useState<IndustryCollection | null>(null);
  const [collectionPlaylists, setCollectionPlaylists] = useState<DbPlaylist[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadCollections();
  }, []);

  const loadCollections = async () => {
    const { data } = await supabase
      .from("industry_collections")
      .select("*")
      .eq("is_active", true)
      .order("display_order", { ascending: true });

    setCollections(data || []);
    setIsLoading(false);
  };

  const loadCollectionPlaylists = async (collectionId: string) => {
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

    const playlists = (data || [])
      .map((item: any) => item.playlists)
      .filter(Boolean);

    setCollectionPlaylists(playlists);
  };

  const handleCollectionClick = async (collection: IndustryCollection) => {
    setSelectedCollection(collection);
    await loadCollectionPlaylists(collection.id);
  };

  const handlePlaylistClick = async (playlist: DbPlaylist) => {
    if (user) {
      await supabase.from("play_history").insert({
        user_id: user.id,
        playlist_id: playlist.id,
      });
    }
    setSelectedCollection(null);
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

        setSelectedCollection(null);
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

  if (isLoading || collections.length === 0) {
    return null;
  }

  const getIcon = (iconName: string | null) => {
    if (!iconName || !iconMap[iconName]) return Sparkles;
    return iconMap[iconName];
  };

  return (
    <>
      <section className="animate-fade-in bg-gradient-to-br from-primary/10 via-secondary/30 to-accent/10 rounded-2xl p-5 border border-primary/20">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-bold text-foreground">Playlists by Industry</h2>
            <p className="text-sm text-muted-foreground">Curated music for your business</p>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
          {collections.map((collection) => {
            const Icon = getIcon(collection.icon);
            return (
              <button
                key={collection.id}
                onClick={() => handleCollectionClick(collection)}
                className="group flex flex-col items-center gap-3 p-4 rounded-xl bg-background/60 hover:bg-background border border-border/50 hover:border-primary/50 transition-all duration-200 hover:shadow-lg hover:shadow-primary/10"
              >
                <div className="w-12 h-12 rounded-full bg-primary/10 group-hover:bg-primary/20 flex items-center justify-center transition-colors">
                  <Icon className="w-6 h-6 text-primary" />
                </div>
                <span className="text-sm font-medium text-foreground text-center leading-tight">
                  {collection.name}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* Collection Playlists Dialog */}
      <Dialog open={!!selectedCollection} onOpenChange={() => setSelectedCollection(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              {selectedCollection && (
                <>
                  {(() => {
                    const Icon = getIcon(selectedCollection.icon);
                    return <Icon className="w-6 h-6 text-primary" />;
                  })()}
                  <div>
                    <span>{selectedCollection.name}</span>
                    {selectedCollection.description && (
                      <p className="text-sm font-normal text-muted-foreground mt-1">
                        {selectedCollection.description}
                      </p>
                    )}
                  </div>
                </>
              )}
            </DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mt-4">
            {collectionPlaylists.length > 0 ? (
              collectionPlaylists.map((playlist) => (
                <PlaylistCard
                  key={playlist.id}
                  playlist={{
                    id: playlist.id,
                    name: playlist.name,
                    description: playlist.description || "",
                    cover: playlist.cover_url || "/placeholder.svg",
                    trackCount: 0,
                    tracks: [],
                  }}
                  onClick={() => handlePlaylistClick(playlist)}
                  onPlay={() => handlePlayPlaylist(playlist.id)}
                  compact
                />
              ))
            ) : (
              <p className="col-span-full text-center text-muted-foreground py-8">
                No playlists in this collection yet.
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default IndustryCollections;
