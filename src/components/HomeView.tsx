import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { History, Music, Shuffle, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import PlaylistCard from "./PlaylistCard";
import IndustryCollections from "./IndustryCollections";
import QuickMixDialog from "./QuickMixDialog";
import CategoryPlaylistsView from "./CategoryPlaylistsView";
import ContinueListeningView from "./ContinueListeningView";
import HorizontalPlaylistSection from "./HorizontalPlaylistSection";
import MobileHorizontalPlaylistSection from "./MobileHorizontalPlaylistSection";
import MobileIndustrySection, { IndustryCollection } from "./MobileIndustrySection";
import IndustryPlaylistsView from "./IndustryPlaylistsView";
import { Track } from "@/data/musicData";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useIsMobile } from "@/hooks/use-mobile";
import { getSignedAudioUrl } from "@/lib/storage";
import type { Tables } from "@/integrations/supabase/types";
import { useScrollRestoration } from "@/hooks/useScrollRestoration";

type DbPlaylist = Tables<"playlists">;

interface SelectedPlaylist {
  id: string;
  name: string;
  cover: string | null;
  description: string | null;
}

interface HomeViewProps {
  currentTrack: Track | null;
  isPlaying: boolean;
  onTrackSelect: (track: Track, playlistTracks?: Track[]) => void;
  onPlaylistSelect: (playlist: SelectedPlaylist) => void;
}

const HomeView = ({ currentTrack, isPlaying, onTrackSelect, onPlaylistSelect }: HomeViewProps) => {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const scrollRef = useScrollRestoration("home");
  const [moodPlaylists, setMoodPlaylists] = useState<DbPlaylist[]>([]);
  const [genrePlaylists, setGenrePlaylists] = useState<DbPlaylist[]>([]);
  const [recentlyUpdated, setRecentlyUpdated] = useState<DbPlaylist[]>([]);
  const [newPlaylists, setNewPlaylists] = useState<DbPlaylist[]>([]);
  const [recentlyPlayed, setRecentlyPlayed] = useState<DbPlaylist[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [mobileView, setMobileView] = useState<"browser" | "mood" | "genre" | "continue" | "industry">("browser");
  const [selectedIndustry, setSelectedIndustry] = useState<{ id: string; name: string } | null>(null);
  const [hasRecentlyPlayed, setHasRecentlyPlayed] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();

  // Handle browser back/forward for mobile category views
  useEffect(() => {
    if (!isMobile) return;

    const handlePopstate = () => {
      // When back is pressed, reset to browser view
      if (mobileView !== "browser") {
        setMobileView("browser");
        setSelectedIndustry(null);
      }
    };

    window.addEventListener('popstate', handlePopstate);
    return () => window.removeEventListener('popstate', handlePopstate);
  }, [isMobile, mobileView]);

  // Push history when entering mood/genre/continue/industry view
  const handleMobileViewChange = (view: "mood" | "genre" | "continue" | "industry") => {
    window.history.pushState({ type: 'mobile-category', view }, '');
    setMobileView(view);
  };

  const handleIndustrySelect = (collection: IndustryCollection, translatedName: string) => {
    setSelectedIndustry({ id: collection.id, name: translatedName });
    handleMobileViewChange("industry");
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]); // Only reload when user ID changes, not on every user object update

  // Realtime subscription for playlists - updates appear live for all users
  useEffect(() => {
    const channel = supabase
      .channel('playlists-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'playlists',
        },
        (payload) => {
          console.log('Playlist change detected:', payload.eventType);
          // Reload data when playlists are created, updated, or deleted
          loadData();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    
    // Load recently played playlists for current user
    if (user) {
      const { data: historyData } = await supabase
        .from("play_history")
        .select("playlist_id, played_at")
        .eq("user_id", user.id)
        .order("played_at", { ascending: false })
        .limit(20);

      if (historyData && historyData.length > 0) {
        // Get unique playlist IDs (most recent first)
        const uniquePlaylistIds = [...new Set(historyData.map(h => h.playlist_id))].slice(0, 4);
        
        // Fetch playlist details
        const { data: playlistData } = await supabase
          .from("playlists")
          .select("*")
          .in("id", uniquePlaylistIds);

        if (playlistData) {
          // Sort by original order
          const sortedPlaylists = uniquePlaylistIds
            .map(id => playlistData.find(p => p.id === id))
            .filter((p): p is DbPlaylist => p !== undefined);
          setRecentlyPlayed(sortedPlaylists);
          setHasRecentlyPlayed(sortedPlaylists.length > 0);
        }
      } else {
        setHasRecentlyPlayed(false);
      }
    } else {
      setHasRecentlyPlayed(false);
    }

    // Load mood playlists (by display order)
    const { data: moodData } = await supabase
      .from("playlists")
      .select("*")
      .eq("is_system", true)
      .eq("category", "mood")
      .order("display_order", { ascending: true });

    setMoodPlaylists(moodData || []);

    // Load genre playlists (by display order)
    const { data: genreData } = await supabase
      .from("playlists")
      .select("*")
      .eq("is_system", true)
      .eq("category", "genre")
      .order("display_order", { ascending: true });

    setGenrePlaylists(genreData || []);

    // Load recently updated playlists
    const { data: updatedData } = await supabase
      .from("playlists")
      .select("*")
      .eq("is_system", true)
      .order("updated_at", { ascending: false })
      .limit(4);

    setRecentlyUpdated(updatedData || []);

    // Load newest playlists
    const { data: newData } = await supabase
      .from("playlists")
      .select("*")
      .eq("is_system", true)
      .order("created_at", { ascending: false })
      .limit(4);

    setNewPlaylists(newData || []);
    setIsLoading(false);
  };

  const handlePlaylistClick = async (playlist: SelectedPlaylist) => {
    // Record play history
    if (user) {
      await supabase.from("play_history").insert({
        user_id: user.id,
        playlist_id: playlist.id,
      });
    }
    onPlaylistSelect(playlist);
  };

  const handlePlaylistUpdate = async (id: string, data: { name: string; description: string; cover: string }) => {
    const { error } = await supabase
      .from("playlists")
      .update({ name: data.name, description: data.description, cover_url: data.cover })
      .eq("id", id);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Success", description: "Playlist updated" });
      loadData();
    }
  };

  const handlePlayPlaylist = async (playlistId: string) => {
    // Fetch first track of playlist
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
        
        // Fetch all tracks for playlist context
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

        // Record play history
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

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return t("home.greeting.morning") + " ☀️";
    if (hour < 18) return t("home.greeting.afternoon") + " 🌤️";
    return t("home.greeting.evening") + " 🌙";
  };


  // Mobile view - show continue listening view
  if (isMobile && mobileView === "continue") {
    return (
      <ContinueListeningView
        onBack={() => {
          window.history.back();
        }}
        onPlaylistSelect={onPlaylistSelect}
        onTrackSelect={onTrackSelect}
      />
    );
  }

  // Mobile view - show category playlists view when mood/genre selected
  if (isMobile && mobileView === "mood") {
    return (
      <CategoryPlaylistsView
        category="mood"
        onBack={() => {
          window.history.back();
        }}
        onPlaylistSelect={onPlaylistSelect}
        onTrackSelect={onTrackSelect}
        currentTrack={currentTrack}
        isPlaying={isPlaying}
      />
    );
  }

  if (isMobile && mobileView === "genre") {
    return (
      <CategoryPlaylistsView
        category="genre"
        onBack={() => {
          window.history.back();
        }}
        onPlaylistSelect={onPlaylistSelect}
        onTrackSelect={onTrackSelect}
        currentTrack={currentTrack}
        isPlaying={isPlaying}
      />
    );
  }

  // Mobile view - show industry playlists view
  if (isMobile && mobileView === "industry" && selectedIndustry) {
    return (
      <IndustryPlaylistsView
        collectionId={selectedIndustry.id}
        collectionName={selectedIndustry.name}
        onBack={() => {
          window.history.back();
        }}
        onPlaylistSelect={onPlaylistSelect}
        onTrackSelect={onTrackSelect}
      />
    );
  }

  // Mobile view - horizontal scrolling sections like desktop
  if (isMobile) {
    return (
      <div ref={scrollRef} className="flex-1 overflow-y-auto overflow-x-hidden pb-40">
        <div className="py-6 space-y-6">
          {/* Greeting */}
          <div className="px-4 mb-2">
            <h1 className="text-xl font-bold text-foreground">{getGreeting()}</h1>
            <p className="text-muted-foreground mt-1 text-sm">{t("home.subtitle")}</p>
          </div>

          {/* Quick action */}
          <div className="px-4">
            <Button
              variant="default"
              size="sm"
              onClick={() => navigate("/playlists")}
              className="gap-2 w-full"
            >
              <Music className="w-4 h-4" />
              <span>{t("home.showAllPlaylists")}</span>
            </Button>
          </div>

          {/* Mood Playlists - horizontal scroll */}
          <MobileHorizontalPlaylistSection
            title={t("home.byMood")}
            playlists={moodPlaylists}
            onPlaylistClick={handlePlaylistClick}
            onPlayPlaylist={handlePlayPlaylist}
            onShowAll={() => handleMobileViewChange("mood")}
            accentColor="#f725bd"
            hideNames
          />

          {/* Genre Playlists - horizontal scroll */}
          <MobileHorizontalPlaylistSection
            title={t("home.byGenre")}
            playlists={genrePlaylists}
            onPlaylistClick={handlePlaylistClick}
            onPlayPlaylist={handlePlayPlaylist}
            onShowAll={() => handleMobileViewChange("genre")}
            accentColor="#1e90ff"
            hideNames
          />

          {/* Industry Collections */}
          <MobileIndustrySection
            onCollectionSelect={handleIndustrySelect}
          />

          {/* Continue Listening - horizontal scroll */}
          {recentlyPlayed.length > 0 && (
            <section className="animate-fade-in">
              <div className="flex items-center justify-between mb-3 px-4">
                <h2 className="text-base font-bold text-foreground">{t("home.continue")}</h2>
                <button
                  onClick={() => handleMobileViewChange("continue")}
                  className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  <span>{t("home.showAll")}</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
              <div className="flex gap-3 overflow-x-auto pb-2 pr-4 scrollbar-hide ml-4">
                {recentlyPlayed.map((playlist) => (
                  <button
                    key={playlist.id}
                    onClick={() => handlePlaylistClick({
                      id: playlist.id,
                      name: playlist.name,
                      cover: playlist.cover_url,
                      description: playlist.description,
                    })}
                    className="flex-shrink-0 w-24 text-left transition-transform active:scale-95"
                  >
                    <div className="relative aspect-square rounded-lg overflow-hidden mb-2 shadow-md">
                      <img
                        src={playlist.cover_url || "/placeholder.svg"}
                        alt={playlist.name}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  </button>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
    );
  }

  // Desktop view - keep existing layout
  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto overflow-x-hidden pb-40 md:pb-32">
        <div className="p-4 sm:p-6 md:p-8 space-y-6 sm:space-y-8 pt-2 md:pt-4">
        {/* Header */}
        <div className="animate-fade-in space-y-3">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
            <div>
              <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-foreground whitespace-nowrap">{getGreeting()}</h1>
              <p className="text-muted-foreground mt-1 text-sm sm:text-base">{t("home.subtitle")}</p>
            </div>
            {/* Desktop: buttons on the right */}
            <div className="flex items-center gap-2">
              <QuickMixDialog
                onTrackSelect={onTrackSelect}
                trigger={
                  <Button variant="default" size="sm" className="gap-2">
                    <Shuffle className="w-4 h-4" />
                    <span>{t("quickMix.button")}</span>
                  </Button>
                }
              />
              <Button
                variant="default"
                size="sm"
                onClick={() => navigate("/playlists")}
                className="shrink-0 gap-2"
              >
                <Music className="w-4 h-4" />
                <span>{t("home.showAllPlaylists")}</span>
              </Button>
            </div>
          </div>
        </div>

        {/* Playlists by Mood - Horizontal scroll */}
        <HorizontalPlaylistSection
          title={t("home.byMood")}
          playlists={moodPlaylists}
          onPlaylistClick={handlePlaylistClick}
          onPlayPlaylist={handlePlayPlaylist}
          onPlaylistUpdate={handlePlaylistUpdate}
          onShowAll={() => navigate("/playlists?category=mood")}
        />

        {/* Playlists by Genre - Horizontal scroll */}
        <HorizontalPlaylistSection
          title={t("home.byGenre")}
          playlists={genrePlaylists}
          onPlaylistClick={handlePlaylistClick}
          onPlayPlaylist={handlePlayPlaylist}
          onPlaylistUpdate={handlePlaylistUpdate}
          onShowAll={() => navigate("/playlists?category=genre")}
        />

        {/* Industry Collections */}
        <IndustryCollections
          onPlaylistSelect={onPlaylistSelect}
          onTrackSelect={onTrackSelect}
        />

        {/* Recently Played - Compact horizontal row */}
        {recentlyPlayed.length > 0 && (
          <section className="animate-fade-in">
            <div className="flex items-center gap-2 mb-3">
              <History className="w-4 h-4 text-primary" />
              <h2 className="text-lg font-semibold text-foreground">{t("home.continue")}</h2>
            </div>
            <div className="flex gap-2 overflow-x-auto pb-2" style={{ scrollbarWidth: 'thin' }}>
              {recentlyPlayed.map((playlist) => (
                <div key={playlist.id} className="flex-shrink-0 w-24 sm:w-28">
                  <PlaylistCard
                    playlist={{
                      id: playlist.id,
                      name: playlist.name,
                      description: playlist.description || "",
                      cover: playlist.cover_url || "/placeholder.svg",
                      trackCount: 0,
                      tracks: [],
                    }}
                    onClick={() => handlePlaylistClick({
                      id: playlist.id,
                      name: playlist.name,
                      cover: playlist.cover_url,
                      description: playlist.description,
                    })}
                    onPlay={() => handlePlayPlaylist(playlist.id)}
                    onUpdate={handlePlaylistUpdate}
                    compact
                  />
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
};

export default HomeView;