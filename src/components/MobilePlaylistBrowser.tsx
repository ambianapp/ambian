import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Heart, Music, Palette, ChevronDown, Building2, Sparkles, Scissors, Dumbbell, UtensilsCrossed, ShoppingBag, Play, Shuffle, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerTrigger } from "@/components/ui/drawer";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { getSignedAudioUrl } from "@/lib/storage";
import type { Track } from "@/data/musicData";

interface SelectedPlaylist {
  id: string;
  name: string;
  cover: string | null;
  description: string | null;
}

interface IndustryCollection {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
  cover_url: string | null;
}

interface DbPlaylist {
  id: string;
  name: string;
  description: string | null;
  cover_url: string | null;
}

interface MobilePlaylistBrowserProps {
  onPlaylistSelect: (playlist: SelectedPlaylist) => void;
  onTrackSelect: (track: Track, playlistTracks?: Track[]) => void;
  onViewChange: (view: "mood" | "genre") => void;
}

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  Sparkles,
  Scissors,
  Dumbbell,
  UtensilsCrossed,
  ShoppingBag,
  Building2,
};

const MobilePlaylistBrowser = ({ onPlaylistSelect, onTrackSelect, onViewChange }: MobilePlaylistBrowserProps) => {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const { user } = useAuth();
  const [industryOpen, setIndustryOpen] = useState(false);
  const [collections, setCollections] = useState<IndustryCollection[]>([]);
  const [selectedCollection, setSelectedCollection] = useState<IndustryCollection | null>(null);
  const [collectionPlaylists, setCollectionPlaylists] = useState<DbPlaylist[]>([]);
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
  };

  const handleMoodOpen = () => {
    onViewChange("mood");
  };

  const handleGenreOpen = () => {
    onViewChange("genre");
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

  const handleCollectionSelect = async (collection: IndustryCollection) => {
    setIndustryOpen(false);
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

    const { data: allTracksData } = await supabase
      .from("playlist_tracks")
      .select("tracks(*), playlist_id")
      .in("playlist_id", idsToPlay)
      .limit(10000);

    if (!allTracksData || allTracksData.length === 0) return;

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

    const uniqueTracks = allTracks.filter((track, index, self) => 
      index === self.findIndex(t => t.id === track.id)
    );

    if (uniqueTracks.length === 0) return;

    const shuffledTracks = [...uniqueTracks].sort(() => Math.random() - 0.5);

    const firstTrack = shuffledTracks[0];
    const { data: trackData } = await supabase
      .from("tracks")
      .select("audio_url")
      .eq("id", firstTrack.id)
      .single();

    const signedAudioUrl = trackData?.audio_url 
      ? await getSignedAudioUrl(trackData.audio_url)
      : undefined;

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

  const getIcon = (iconName: string | null) => {
    if (!iconName || !iconMap[iconName]) return Sparkles;
    return iconMap[iconName];
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return t("home.greeting.morning") + " ☀️";
    if (hour < 18) return t("home.greeting.afternoon") + " 🌤️";
    return t("home.greeting.evening") + " 🌙";
  };

  return (
    <div className="px-4 py-6 space-y-6 animate-fade-in">
      {/* Greeting */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">{getGreeting()}</h1>
        <p className="text-muted-foreground mt-1 text-sm">{t("home.subtitle")}</p>
      </div>

      {/* Header */}
      <h2 className="text-lg font-bold text-foreground text-center">
        {t("mobile.playlistsBy")}
      </h2>

      {/* Mood & Genre Row */}
      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={handleMoodOpen}
          className="relative group h-20 rounded-xl bg-gradient-to-br from-primary/20 via-primary/10 to-primary/30 border border-primary/30 hover:border-primary/60 transition-all duration-300 overflow-hidden"
        >
          <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent group-hover:from-primary/10 transition-colors" />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="flex flex-col items-center gap-0.5">
              <Heart className="w-5 h-5 text-primary" />
              <span className="text-sm font-semibold text-foreground">
                {t("mobile.mood")}
              </span>
              {t("mobile.moodSuffix") && (
                <span className="text-sm font-semibold text-foreground">
                  {t("mobile.moodSuffix")}
                </span>
              )}
            </div>
          </div>
          <div className="absolute inset-0 border border-primary/0 group-hover:border-primary/40 rounded-xl transition-colors" />
        </button>

        <button
          onClick={handleGenreOpen}
          className="relative group h-20 rounded-xl bg-gradient-to-br from-accent/20 via-muted/30 to-accent/30 border border-accent/30 hover:border-accent/60 transition-all duration-300 overflow-hidden"
        >
          <div className="absolute inset-0 bg-gradient-to-br from-accent/5 to-transparent group-hover:from-accent/10 transition-colors" />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="flex flex-col items-center gap-0.5">
              <Palette className="w-5 h-5 text-primary" />
              <span className="text-sm font-semibold text-foreground">
                {t("mobile.genre")}
              </span>
              {t("mobile.genreSuffix") && (
                <span className="text-sm font-semibold text-foreground">
                  {t("mobile.genreSuffix")}
                </span>
              )}
            </div>
          </div>
          <div className="absolute inset-0 border border-accent/0 group-hover:border-accent/40 rounded-xl transition-colors" />
        </button>
      </div>

      {/* All Playlists Button */}
      <button
        onClick={() => navigate("/playlists")}
        className="w-full h-16 rounded-xl bg-gradient-to-r from-primary/20 via-secondary to-primary/20 border border-border hover:border-primary/50 transition-all duration-300 group"
      >
        <div className="flex items-center justify-center gap-2">
          <Music className="w-5 h-5 text-primary" />
          <span className="text-sm font-semibold text-foreground">
            {t("home.allPlaylists")}
          </span>
        </div>
      </button>

      {/* Industry Dropdown */}
      <div className="space-y-3 pt-2">
        <p className="text-sm text-muted-foreground text-center">
          {t("mobile.orChooseIndustry")}
        </p>
        
        <Drawer open={industryOpen} onOpenChange={setIndustryOpen}>
          <DrawerTrigger asChild>
            <Button
              variant="outline"
              className="w-full justify-between h-12 border-border hover:border-primary/50"
            >
              <div className="flex items-center gap-2">
                <Building2 className="w-4 h-4 text-primary" />
                <span>{t("mobile.selectIndustry")}</span>
              </div>
              <ChevronDown className="w-4 h-4 text-muted-foreground" />
            </Button>
          </DrawerTrigger>
          <DrawerContent className="max-h-[85dvh]">
            <div className="p-4 pb-8">
              <h3 className="text-lg font-semibold text-foreground mb-4 text-center">
                {t("mobile.selectIndustry")}
              </h3>
              <div className="grid grid-cols-1 gap-1">
                {collections.map((collection) => {
                  const Icon = getIcon(collection.icon);
                  return (
                    <button
                      key={collection.id}
                      onClick={() => handleCollectionSelect(collection)}
                      className="flex items-center gap-3 p-3 rounded-lg hover:bg-secondary transition-colors text-left"
                    >
                      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                        <Icon className="w-5 h-5 text-primary" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-foreground truncate">
                          {getTranslatedName(collection.name)}
                        </p>
                        <p className="text-sm text-muted-foreground truncate">
                          {getTranslatedDescription(collection.name, collection.description)}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </DrawerContent>
        </Drawer>
      </div>

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

    </div>
  );
};

export default MobilePlaylistBrowser;
