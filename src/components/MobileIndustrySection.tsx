import { useState, useEffect } from "react";
import { Building2, Sparkles, Scissors, Dumbbell, UtensilsCrossed, ShoppingBag, Play, Shuffle, Check, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerTrigger } from "@/components/ui/drawer";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import SignedImage from "./SignedImage";
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

interface MobileIndustrySectionProps {
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

const MobileIndustrySection = ({ onPlaylistSelect, onTrackSelect }: MobileIndustrySectionProps) => {
  const { t } = useLanguage();
  const { user } = useAuth();
  const [industryOpen, setIndustryOpen] = useState(false);
  const [collections, setCollections] = useState<IndustryCollection[]>([]);
  const [selectedCollection, setSelectedCollection] = useState<IndustryCollection | null>(null);
  const [collectionPlaylists, setCollectionPlaylists] = useState<DbPlaylist[]>([]);
  const [selectedPlaylistIds, setSelectedPlaylistIds] = useState<Set<string>>(new Set());
  const [isMultiSelectMode, setIsMultiSelectMode] = useState(false);

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

  return (
    <>
      <section className="animate-fade-in">
        <div className="flex items-center justify-between mb-3 px-4">
          <h2 className="text-base font-bold text-foreground">
            {t("home.industryTitle")}
          </h2>
        </div>

        <div className="px-4">
          <Drawer open={industryOpen} onOpenChange={setIndustryOpen}>
            <DrawerTrigger asChild>
              <button className="w-full flex items-center justify-between p-3 rounded-xl bg-secondary/50 border border-border/50 hover:bg-secondary transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                    <Building2 className="w-4 h-4 text-primary" />
                  </div>
                  <span className="font-medium text-sm">{t("mobile.selectIndustry")}</span>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              </button>
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
                  <Button onClick={handleSelectAll} size="sm" variant="outline">
                    {selectedPlaylistIds.size === collectionPlaylists.length ? t("industry.deselectAll") : t("industry.selectAll")}
                  </Button>
                  
                  {selectedPlaylistIds.size > 0 && (
                    <Button onClick={handlePlaySelected} size="sm" className="gap-2">
                      <Play className="w-4 h-4" />
                      {t("industry.playSelected", { count: selectedPlaylistIds.size })}
                    </Button>
                  )}
                </>
              )}
            </div>
          )}

          <div className="space-y-1 mt-2">
            {collectionPlaylists.map((playlist) => (
              <button
                key={playlist.id}
                onClick={() => handlePlaylistClick(playlist)}
                className={`flex items-center gap-3 p-2 rounded-lg hover:bg-secondary transition-colors text-left w-full ${
                  isMultiSelectMode && selectedPlaylistIds.has(playlist.id) ? 'bg-primary/10 ring-1 ring-primary' : ''
                }`}
              >
                <div className="w-12 h-12 rounded-md overflow-hidden shrink-0">
                  <SignedImage
                    src={playlist.cover_url || "/placeholder.svg"}
                    alt={playlist.name}
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-foreground truncate">{playlist.name}</p>
                  {playlist.description && (
                    <p className="text-sm text-muted-foreground truncate">{playlist.description}</p>
                  )}
                </div>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default MobileIndustrySection;
