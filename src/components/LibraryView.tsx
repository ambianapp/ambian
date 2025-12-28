import { List, Grid3X3, Heart, Shuffle, Check, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Track } from "@/data/musicData";
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { getSignedAudioUrl } from "@/lib/storage";
import { useLanguage } from "@/contexts/LanguageContext";
import { toast } from "sonner";
import QuickMixDialog from "./QuickMixDialog";

interface SelectedPlaylist {
  id: string;
  name: string;
  cover: string | null;
  description: string | null;
}

interface LibraryViewProps {
  currentTrack: Track | null;
  isPlaying: boolean;
  onTrackSelect: (track: Track, playlistTracks?: Track[]) => void;
  onPlaylistSelect: (playlist: SelectedPlaylist) => void;
}

interface Playlist {
  id: string;
  name: string;
  cover_url: string | null;
  description: string | null;
  is_system: boolean;
  user_id: string | null;
  trackCount?: number;
}

const LibraryView = ({ currentTrack, isPlaying, onTrackSelect, onPlaylistSelect }: LibraryViewProps) => {
  const { t } = useLanguage();
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [ownPlaylists, setOwnPlaylists] = useState<Playlist[]>([]);
  const [likedPlaylists, setLikedPlaylists] = useState<Playlist[]>([]);
  const [likedSongs, setLikedSongs] = useState<Track[]>([]);
  const [likedCount, setLikedCount] = useState(0);
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isPlayingMix, setIsPlayingMix] = useState(false);
  const { user } = useAuth();

  // All playlists combined for selection
  const allPlaylists = [...ownPlaylists, ...likedPlaylists];

  useEffect(() => {
    const fetchLibrary = async () => {
      if (!user) return;

      // Fetch user's own playlists (not system playlists)
      const { data: userPlaylists } = await supabase
        .from("playlists")
        .select("*")
        .eq("user_id", user.id)
        .eq("is_system", false)
        .order("created_at", { ascending: false });

      if (userPlaylists) {
        setOwnPlaylists(userPlaylists);
      }

      // Fetch liked playlists
      const { data: likedPlaylistData } = await supabase
        .from("liked_playlists")
        .select("playlist_id, playlists(*)")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (likedPlaylistData) {
        const playlists = likedPlaylistData
          .map((item: any) => item.playlists)
          .filter(Boolean);
        setLikedPlaylists(playlists);
      }

      // Fetch liked songs count
      const { count } = await supabase
        .from("liked_songs")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id);

      setLikedCount(count || 0);

      // Fetch first liked song for playing
      const { data: likedData } = await supabase
        .from("liked_songs")
        .select("track_id, tracks(*)")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(10);

      if (likedData) {
        const tracks = likedData
          .map((item: any) => item.tracks)
          .filter(Boolean)
          .map((t: any) => ({
            id: t.id,
            title: t.title,
            artist: t.artist,
            album: t.album || "",
            duration: t.duration || "0:00",
            cover: t.cover_url || "/placeholder.svg",
            genre: t.genre || "",
            audioUrl: t.audio_url,
          }));
        setLikedSongs(tracks);
      }
    };

    fetchLibrary();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]); // Only reload when user ID changes, not on every user object update

  const handleLikedSongsClick = () => {
    if (isSelectMode) return;
    onPlaylistSelect({
      id: "liked-songs",
      name: t("library.likedSongs"),
      cover: null,
      description: t("library.likedSongsDesc"),
    });
  };

  const toggleSelection = (id: string) => {
    setSelectedIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  const handlePlaylistClick = (playlist: Playlist) => {
    if (isSelectMode) {
      toggleSelection(playlist.id);
    } else {
      onPlaylistSelect({
        id: playlist.id,
        name: playlist.name,
        cover: playlist.cover_url,
        description: playlist.description,
      });
    }
  };

  const handleSelectAll = () => {
    if (selectedIds.size === allPlaylists.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(allPlaylists.map(p => p.id)));
    }
  };

  const handlePlaySelected = async () => {
    if (selectedIds.size === 0) return;
    setIsPlayingMix(true);

    try {
      const { data: allTracksData } = await supabase
        .from("playlist_tracks")
        .select("tracks(*), playlist_id")
        .in("playlist_id", Array.from(selectedIds));

      if (!allTracksData || allTracksData.length === 0) {
        setIsPlayingMix(false);
        return;
      }

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

      if (uniqueTracks.length === 0) {
        setIsPlayingMix(false);
        return;
      }

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
        for (const playlistId of Array.from(selectedIds)) {
          await supabase.from("play_history").insert({
            user_id: user.id,
            playlist_id: playlistId,
          });
        }
      }

      setIsSelectMode(false);
      setSelectedIds(new Set());
      
      onTrackSelect({
        ...firstTrack,
        audioUrl: signedAudioUrl,
      }, shuffledTracks);
    } finally {
      setIsPlayingMix(false);
    }
  };

  const cancelSelectMode = () => {
    setIsSelectMode(false);
    setSelectedIds(new Set());
  };

  return (
    <div className="flex-1 overflow-y-auto pb-40 md:pb-32">
      <div className="p-6 md:p-8 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between animate-fade-in">
          <h1 className="text-2xl font-bold text-foreground">{t("library.title")}</h1>
          <div className="flex items-center gap-2">
            {/* Quick Mix Dialog - opens playlist selection like on home page */}
            <QuickMixDialog
              onTrackSelect={onTrackSelect}
              trigger={
                <Button variant="outline" size="sm" className="gap-2">
                  <Shuffle className="w-4 h-4" />
                  <span className="hidden sm:inline">{t("library.quickMix")}</span>
                </Button>
              }
            />
            <Button 
              variant={isSelectMode ? "secondary" : "ghost"} 
              size="icon" 
              className="text-muted-foreground hover:text-foreground"
              onClick={() => isSelectMode ? cancelSelectMode() : setIsSelectMode(true)}
            >
              <Check className="w-5 h-5" />
            </Button>
            <div className="flex items-center gap-1 bg-secondary rounded-lg p-1">
              <Button
                variant="ghost"
                size="iconSm"
                className={cn(viewMode === "list" && "bg-muted")}
                onClick={() => setViewMode("list")}
              >
                <List className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="iconSm"
                className={cn(viewMode === "grid" && "bg-muted")}
                onClick={() => setViewMode("grid")}
              >
                <Grid3X3 className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* Selection Mode Actions */}
        {isSelectMode && (
          <div className="flex items-center gap-2 p-3 bg-primary/10 rounded-lg border border-primary/20 animate-fade-in">
            <Button variant="ghost" size="sm" onClick={handleSelectAll}>
              {selectedIds.size === allPlaylists.length && allPlaylists.length > 0 ? "Deselect All" : "Select All"}
            </Button>
            <span className="text-sm text-muted-foreground flex-1">
              {selectedIds.size} selected
            </span>
            {selectedIds.size > 0 && (
              <Button size="sm" onClick={handlePlaySelected} disabled={isPlayingMix} className="gap-2">
                <Play className="w-4 h-4" />
                {isPlayingMix ? "Loading..." : "Play Mix"}
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={cancelSelectMode}>
              Cancel
            </Button>
          </div>
        )}

        {/* Filters */}
        <div className="flex gap-2 animate-fade-in" style={{ animationDelay: "0.1s" }}>
          <Button variant="secondary" size="sm" className="rounded-full">
            {t("library.playlists")}
          </Button>
        </div>

        {/* Content */}
        <div
          className={cn(
            "animate-fade-in",
            viewMode === "grid"
              ? "grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4"
              : "space-y-2"
          )}
          style={{ animationDelay: "0.2s" }}
        >
          {/* Liked Songs - Always first */}
          {viewMode === "grid" ? (
            <button
              className="group p-4 rounded-xl bg-gradient-to-br from-primary/30 to-primary/10 hover:from-primary/40 hover:to-primary/20 transition-all duration-300 text-left"
              onClick={handleLikedSongsClick}
            >
              <div className="w-full aspect-square rounded-lg shadow-lg mb-4 bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center">
                <Heart className="w-16 h-16 text-primary-foreground fill-current" />
              </div>
              <h3 className="font-semibold text-foreground truncate">{t("library.likedSongs")}</h3>
              <p className="text-sm text-muted-foreground">{likedCount} {t("library.songs")}</p>
            </button>
          ) : (
            <button
              className="flex items-center gap-4 p-3 rounded-lg bg-gradient-to-r from-primary/20 to-transparent hover:from-primary/30 transition-colors w-full text-left"
              onClick={handleLikedSongsClick}
            >
              <div className="w-14 h-14 rounded-lg bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center">
                <Heart className="w-6 h-6 text-primary-foreground fill-current" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-foreground truncate">{t("library.likedSongs")}</h3>
                <p className="text-sm text-muted-foreground">{t("library.playlists")} • {likedCount} {t("library.songs")}</p>
              </div>
            </button>
          )}

          {/* User's Own Playlists */}
          {ownPlaylists.map((playlist) =>
            viewMode === "grid" ? (
              <div key={playlist.id} className="relative">
                {isSelectMode && (
                  <div className="absolute top-2 left-2 z-10">
                    <Checkbox 
                      checked={selectedIds.has(playlist.id)}
                      className="h-5 w-5 bg-background/80 border-2"
                    />
                  </div>
                )}
                <button
                  className={cn(
                    "group p-4 rounded-xl bg-card/50 hover:bg-card transition-all duration-300 text-left w-full",
                    isSelectMode && selectedIds.has(playlist.id) && "ring-2 ring-primary"
                  )}
                  onClick={() => handlePlaylistClick(playlist)}
                >
                  <img
                    src={playlist.cover_url || "/placeholder.svg"}
                    alt={playlist.name}
                    className="w-full aspect-square object-cover rounded-lg shadow-lg mb-4"
                  />
                  <h3 className="font-semibold text-foreground truncate">{playlist.name}</h3>
                  <p className="text-sm text-muted-foreground">{t("library.yourPlaylist")}</p>
                </button>
              </div>
            ) : (
              <div key={playlist.id} className="relative">
                <button
                  className={cn(
                    "flex items-center gap-4 p-3 rounded-lg bg-card/30 hover:bg-card/50 transition-colors w-full text-left",
                    isSelectMode && selectedIds.has(playlist.id) && "ring-2 ring-primary"
                  )}
                  onClick={() => handlePlaylistClick(playlist)}
                >
                  {isSelectMode && (
                    <Checkbox 
                      checked={selectedIds.has(playlist.id)}
                      className="h-5 w-5"
                    />
                  )}
                  <img
                    src={playlist.cover_url || "/placeholder.svg"}
                    alt={playlist.name}
                    className="w-14 h-14 object-cover rounded-lg"
                  />
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-foreground truncate">{playlist.name}</h3>
                    <p className="text-sm text-muted-foreground">{t("library.yourPlaylist")}</p>
                  </div>
                </button>
              </div>
            )
          )}

          {/* Liked Playlists */}
          {likedPlaylists.map((playlist) =>
            viewMode === "grid" ? (
              <div key={`liked-${playlist.id}`} className="relative">
                {isSelectMode && (
                  <div className="absolute top-2 left-2 z-10">
                    <Checkbox 
                      checked={selectedIds.has(playlist.id)}
                      className="h-5 w-5 bg-background/80 border-2"
                    />
                  </div>
                )}
                <button
                  className={cn(
                    "group p-4 rounded-xl bg-card/50 hover:bg-card transition-all duration-300 text-left w-full",
                    isSelectMode && selectedIds.has(playlist.id) && "ring-2 ring-primary"
                  )}
                  onClick={() => handlePlaylistClick(playlist)}
                >
                  <div className="relative">
                    <img
                      src={playlist.cover_url || "/placeholder.svg"}
                      alt={playlist.name}
                      className="w-full aspect-square object-cover rounded-lg shadow-lg mb-4"
                    />
                    {!isSelectMode && <Heart className="absolute top-2 right-2 w-5 h-5 text-primary fill-current" />}
                  </div>
                  <h3 className="font-semibold text-foreground truncate">{playlist.name}</h3>
                  <p className="text-sm text-muted-foreground">{t("library.likedPlaylist")}</p>
                </button>
              </div>
            ) : (
              <div key={`liked-${playlist.id}`} className="relative">
                <button
                  className={cn(
                    "flex items-center gap-4 p-3 rounded-lg bg-card/30 hover:bg-card/50 transition-colors w-full text-left",
                    isSelectMode && selectedIds.has(playlist.id) && "ring-2 ring-primary"
                  )}
                  onClick={() => handlePlaylistClick(playlist)}
                >
                  {isSelectMode && (
                    <Checkbox 
                      checked={selectedIds.has(playlist.id)}
                      className="h-5 w-5"
                    />
                  )}
                  <div className="relative">
                    <img
                      src={playlist.cover_url || "/placeholder.svg"}
                      alt={playlist.name}
                      className="w-14 h-14 object-cover rounded-lg"
                    />
                    {!isSelectMode && <Heart className="absolute -top-1 -right-1 w-4 h-4 text-primary fill-current" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-foreground truncate">{playlist.name}</h3>
                    <p className="text-sm text-muted-foreground">{t("library.likedPlaylist")}</p>
                  </div>
                </button>
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
};

export default LibraryView;
