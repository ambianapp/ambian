import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronRight, History, Music, Shuffle } from "lucide-react";
import { Button } from "@/components/ui/button";
import PlaylistCard from "./PlaylistCard";
import IndustryCollections from "./IndustryCollections";
import QuickMixDialog from "./QuickMixDialog";
import MobilePlaylistBrowser from "./MobilePlaylistBrowser";
import CategoryPlaylistsView from "./CategoryPlaylistsView";
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
  const [showAllMoods, setShowAllMoods] = useState(false);
  const [showAllGenres, setShowAllGenres] = useState(false);
  const [mobileView, setMobileView] = useState<"browser" | "mood" | "genre">("browser");
  const { toast } = useToast();
  const { user } = useAuth();

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
        }
      }
    }

    // Load mood playlists (alphabetically)
    const { data: moodData } = await supabase
      .from("playlists")
      .select("*")
      .eq("is_system", true)
      .eq("category", "mood")
      .order("name", { ascending: true });

    setMoodPlaylists(moodData || []);

    // Load genre playlists (alphabetically)
    const { data: genreData } = await supabase
      .from("playlists")
      .select("*")
      .eq("is_system", true)
      .eq("category", "genre")
      .order("name", { ascending: true });

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

  const renderPlaylistSection = (
    title: string,
    playlists: DbPlaylist[],
    showAll: boolean,
    onToggle: () => void,
    compact: boolean = false,
    mobileDisplayCount?: number
  ) => {
    const defaultDisplayCount = compact ? 10 : 4;
    const displayCount = isMobile && mobileDisplayCount !== undefined ? mobileDisplayCount : defaultDisplayCount;
    const displayedPlaylists = showAll ? playlists : playlists.slice(0, displayCount);

    return (
      <section className="animate-fade-in bg-secondary/30 rounded-2xl p-4 sm:p-5 border border-border/50 overflow-hidden">
        <div className="flex items-center justify-between gap-2 mb-4">
          <h2 className="text-lg sm:text-xl font-bold text-foreground truncate">{title}</h2>
          {playlists.length > displayCount && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onToggle}
              className="text-primary hover:text-primary hover:bg-primary/10 shrink-0 text-xs sm:text-sm px-2 sm:px-3"
            >
              <span className="hidden sm:inline">{showAll ? t("home.showLess") : t("home.showMore")}</span>
              <span className="sm:hidden">{showAll ? "−" : "+"}</span>
              <ChevronRight className={`w-4 h-4 ml-1 transition-transform hidden sm:block ${showAll ? "rotate-90" : ""}`} />
            </Button>
          )}
        </div>
        {playlists.length > 0 ? (
          <>
            <div className={compact ? "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-5 gap-3" : "grid grid-cols-2 lg:grid-cols-4 gap-4"}>
              {displayedPlaylists.map((playlist) => (
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
                  onClick={() => handlePlaylistClick({
                    id: playlist.id,
                    name: playlist.name,
                    cover: playlist.cover_url,
                    description: playlist.description,
                  })}
                  onPlay={() => handlePlayPlaylist(playlist.id)}
                  onUpdate={handlePlaylistUpdate}
                  compact={compact}
                />
              ))}
            </div>
            {playlists.length > displayCount && !showAll && (
              <div className="mt-4 flex justify-center">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onToggle}
                  className="text-primary border-primary/50 hover:bg-primary/10 hover:text-primary"
                >
                  {t("home.showMore")}
                  <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              </div>
            )}
          </>
        ) : (
          <p className="text-muted-foreground">No playlists yet. Create one in the admin panel.</p>
        )}
      </section>
    );
  };

  // Mobile view - show category playlists view when mood/genre selected
  if (isMobile && mobileView === "mood") {
    return (
      <CategoryPlaylistsView
        category="mood"
        onBack={() => setMobileView("browser")}
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
        onBack={() => setMobileView("browser")}
        onPlaylistSelect={onPlaylistSelect}
        onTrackSelect={onTrackSelect}
        currentTrack={currentTrack}
        isPlaying={isPlaying}
      />
    );
  }

  // Mobile browser view
  if (isMobile) {
    return (
      <div ref={scrollRef} className="flex-1 overflow-y-auto overflow-x-hidden pb-40">
        <MobilePlaylistBrowser
          onViewChange={(view) => setMobileView(view)}
          onPlaylistSelect={onPlaylistSelect}
          onTrackSelect={onTrackSelect}
        />
        
        {/* Recently Played - below the browser on mobile */}
        {recentlyPlayed.length > 0 && (
          <section className="px-4 pb-6 animate-fade-in">
            <div className="flex items-center gap-2 mb-3">
              <History className="w-4 h-4 text-primary" />
              <h2 className="text-lg font-semibold text-foreground">{t("home.continue")}</h2>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {recentlyPlayed.map((playlist) => (
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
              ))}
            </div>
          </section>
        )}
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
                <span>{t("home.allPlaylists")}</span>
              </Button>
            </div>
          </div>
        </div>

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
            <div className="grid grid-cols-4 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2">
              {recentlyPlayed.map((playlist) => (
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
              ))}
            </div>
          </section>
        )}

        {/* Playlists by Genre */}
        {renderPlaylistSection(
          t("home.byGenre"),
          genrePlaylists,
          showAllGenres,
          () => setShowAllGenres(!showAllGenres),
          true
        )}

        {/* Playlists by Mood */}
        {renderPlaylistSection(
          t("home.byMood"),
          moodPlaylists,
          showAllMoods,
          () => setShowAllMoods(!showAllMoods),
          true
        )}

        {/* Recently Updated & New Playlists - Side by Side */}
        {(recentlyUpdated.length > 0 || newPlaylists.length > 0) && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 animate-fade-in">
            {/* Recently Updated Playlists */}
            {recentlyUpdated.length > 0 && (
              <section className="bg-secondary/30 rounded-2xl p-5 border border-border/50">
                <h2 className="text-xl font-bold text-foreground mb-4">{t("home.recentlyUpdated")}</h2>
                <div className="grid grid-cols-2 gap-4">
                  {recentlyUpdated.map((playlist) => (
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
                      onClick={() => handlePlaylistClick({
                        id: playlist.id,
                        name: playlist.name,
                        cover: playlist.cover_url,
                        description: playlist.description,
                      })}
                      onPlay={() => handlePlayPlaylist(playlist.id)}
                      onUpdate={handlePlaylistUpdate}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* New Playlists */}
            {newPlaylists.length > 0 && (
              <section className="bg-secondary/30 rounded-2xl p-5 border border-border/50">
                <h2 className="text-xl font-bold text-foreground mb-4">{t("home.newPlaylists")}</h2>
                <div className="grid grid-cols-2 gap-4">
                  {newPlaylists.map((playlist) => (
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
                      onClick={() => handlePlaylistClick({
                        id: playlist.id,
                        name: playlist.name,
                        cover: playlist.cover_url,
                        description: playlist.description,
                      })}
                      onPlay={() => handlePlayPlaylist(playlist.id)}
                      onUpdate={handlePlaylistUpdate}
                    />
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default HomeView;