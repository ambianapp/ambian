import { useState, useEffect } from "react";
import { ChevronRight, Sparkles, Scissors, Dumbbell, UtensilsCrossed, ShoppingBag, Building2, Play, Shuffle, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
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
  const [selectedPlaylistIds, setSelectedPlaylistIds] = useState<Set<string>>(new Set());
  const [isMultiSelectMode, setIsMultiSelectMode] = useState(false);

  // Translation key mapping for collection names
  const collectionTranslationKeys: Record<string, { name: string; desc: string }> = {
    "Spa & Wellness": { name: "industry.spaWellness", desc: "industry.spaWellnessDesc" },
    "Beauty Salon": { name: "industry.beautySalon", desc: "industry.beautySalonDesc" },
    "Gym & Fitness": { name: "industry.gymFitness", desc: "industry.gymFitnessDesc" },
    "Restaurant & Café": { name: "industry.restaurantCafe", desc: "industry.restaurantCafeDesc" },
    "Retail & Shopping": { name: "industry.retailShopping", desc: "industry.retailShoppingDesc" },
    "Hotel & Lobby": { name: "industry.hotelLobby", desc: "industry.hotelLobbyDesc" },
  };

  const getTranslatedName = (name: string) => {
    const keys = collectionTranslationKeys[name];
    return keys ? t(keys.name) : name;
  };

  const getTranslatedDescription = (name: string, fallback: string | null) => {
    const keys = collectionTranslationKeys[name];
    return keys ? t(keys.desc) : (fallback || "");
  };

  useEffect(() => {
    loadCollections();
  }, []);

  // Reset selection when dialog closes
  useEffect(() => {
    if (!selectedCollection) {
      setSelectedPlaylistIds(new Set());
      setIsMultiSelectMode(false);
    }
  }, [selectedCollection]);

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
    if (isMultiSelectMode) {
      togglePlaylistSelection(playlist.id);
      return;
    }

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

  const togglePlaylistSelection = (playlistId: string) => {
    setSelectedPlaylistIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(playlistId)) {
        newSet.delete(playlistId);
      } else {
        newSet.add(playlistId);
      }
      return newSet;
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

  // Play all playlists in collection with shuffle
  const handlePlayAllShuffled = async (playlistIds?: string[]) => {
    const idsToPlay = playlistIds || collectionPlaylists.map(p => p.id);
    if (idsToPlay.length === 0) return;

    // Fetch all tracks from selected playlists - use explicit high limit to avoid default 1000 row limit
    const { data: allTracksData } = await supabase
      .from("playlist_tracks")
      .select("tracks(*), playlist_id")
      .in("playlist_id", idsToPlay)
      .limit(10000);

    if (!allTracksData || allTracksData.length === 0) return;

    // Convert to Track format
    const allTracks: Track[] = allTracksData
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

    // Remove duplicates (same track might be in multiple playlists)
    const uniqueTracks = allTracks.filter((track, index, self) => 
      index === self.findIndex(t => t.id === track.id)
    );

    if (uniqueTracks.length === 0) return;

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

    // Log play history for each playlist
    if (user) {
      for (const playlistId of idsToPlay) {
        await supabase.from("play_history").insert({
          user_id: user.id,
          playlist_id: playlistId,
        });
      }
    }

    setSelectedCollection(null);
    onTrackSelect({
      ...firstTrack,
      audioUrl: signedAudioUrl,
    }, shuffledTracks);
  };

  const handlePlaySelected = () => {
    if (selectedPlaylistIds.size === 0) return;
    handlePlayAllShuffled(Array.from(selectedPlaylistIds));
  };

  const handleSelectAll = () => {
    if (selectedPlaylistIds.size === collectionPlaylists.length) {
      setSelectedPlaylistIds(new Set());
    } else {
      setSelectedPlaylistIds(new Set(collectionPlaylists.map(p => p.id)));
    }
  };

  // Skeleton loading state
  if (isLoading) {
    return (
      <section className="animate-fade-in bg-gradient-to-br from-primary/10 via-secondary/30 to-accent/10 rounded-2xl p-5 border border-primary/20">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-bold text-foreground">{t("home.industryTitle")}</h2>
            <p className="text-sm text-muted-foreground">{t("home.industrySubtitle")}</p>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="flex flex-col items-center gap-2 p-3 sm:p-4 rounded-xl bg-background/60 border border-border/50">
              <Skeleton className="w-10 h-10 sm:w-12 sm:h-12 rounded-full" />
              <Skeleton className="h-4 w-16" />
            </div>
          ))}
        </div>
      </section>
    );
  }

  if (collections.length === 0) {
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
            <h2 className="text-xl font-bold text-foreground">{t("home.industryTitle")}</h2>
            <p className="text-sm text-muted-foreground">{t("home.industrySubtitle")}</p>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {collections.map((collection) => {
            const Icon = getIcon(collection.icon);
            return (
              <button
                key={collection.id}
                onClick={() => handleCollectionClick(collection)}
                className="group flex flex-col items-center gap-2 p-3 sm:p-4 rounded-xl bg-background/60 hover:bg-background border border-border/50 hover:border-primary/50 transition-all duration-200 hover:shadow-lg hover:shadow-primary/10"
              >
                <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-primary/10 group-hover:bg-primary/20 flex items-center justify-center transition-colors">
                  <Icon className="w-5 h-5 sm:w-6 sm:h-6 text-primary" />
                </div>
                <span className="text-xs sm:text-sm font-medium text-foreground text-center leading-tight line-clamp-2">
                  {getTranslatedName(collection.name)}
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
                  <div className="flex-1">
                    <span>{getTranslatedName(selectedCollection.name)}</span>
                    <p className="text-sm font-normal text-muted-foreground mt-1">
                      {getTranslatedDescription(selectedCollection.name, selectedCollection.description)}
                    </p>
                  </div>
                </>
              )}
            </DialogTitle>
          </DialogHeader>
          
          {/* Action buttons */}
          {collectionPlaylists.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 mt-2 pb-2 border-b border-border">
              <Button 
                onClick={() => handlePlayAllShuffled()} 
                size="sm"
                className="gap-2"
              >
                <Shuffle className="w-4 h-4" />
                {t("industry.playAllShuffled")}
              </Button>
              
              <Button
                onClick={() => setIsMultiSelectMode(!isMultiSelectMode)}
                size="sm"
                variant={isMultiSelectMode ? "secondary" : "outline"}
                className="gap-2"
              >
                <Check className="w-4 h-4" />
                {isMultiSelectMode ? t("industry.cancelSelection") : t("industry.selectPlaylists")}
              </Button>

              {isMultiSelectMode && (
                <>
                  <Button
                    onClick={handleSelectAll}
                    size="sm"
                    variant="outline"
                  >
                    {selectedPlaylistIds.size === collectionPlaylists.length ? t("industry.deselectAll") : t("industry.selectAll")}
                  </Button>
                  
                  {selectedPlaylistIds.size > 0 && (
                    <Button
                      onClick={handlePlaySelected}
                      size="sm"
                      className="gap-2"
                    >
                      <Play className="w-4 h-4" />
                      {t("industry.playSelected", { count: selectedPlaylistIds.size })}
                    </Button>
                  )}
                </>
              )}
            </div>
          )}

          <div className="flex flex-col gap-1 mt-4">
            {collectionPlaylists.length > 0 ? (
              collectionPlaylists.map((playlist) => (
                <div 
                  key={playlist.id} 
                  className={`flex items-center gap-4 p-3 rounded-lg hover:bg-secondary/50 transition-colors cursor-pointer group ${
                    isMultiSelectMode && selectedPlaylistIds.has(playlist.id) ? "bg-primary/10 ring-1 ring-primary/30" : ""
                  }`}
                  onClick={() => handlePlaylistClick(playlist)}
                >
                  {isMultiSelectMode && (
                    <div 
                      onClick={(e) => {
                        e.stopPropagation();
                        togglePlaylistSelection(playlist.id);
                      }}
                    >
                      <Checkbox 
                        checked={selectedPlaylistIds.has(playlist.id)}
                        className="h-5 w-5"
                      />
                    </div>
                  )}
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
              ))
            ) : (
              <p className="text-center text-muted-foreground py-8">
                {t("industry.noPlaylists")}
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default IndustryCollections;
