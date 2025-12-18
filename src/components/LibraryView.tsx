import { Plus, List, Grid3X3, Heart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Track } from "@/data/musicData";
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

interface SelectedPlaylist {
  id: string;
  name: string;
  cover: string | null;
  description: string | null;
}

interface LibraryViewProps {
  currentTrack: Track | null;
  isPlaying: boolean;
  onTrackSelect: (track: Track) => void;
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
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [ownPlaylists, setOwnPlaylists] = useState<Playlist[]>([]);
  const [likedPlaylists, setLikedPlaylists] = useState<Playlist[]>([]);
  const [likedSongs, setLikedSongs] = useState<Track[]>([]);
  const [likedCount, setLikedCount] = useState(0);
  const { user } = useAuth();

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
  }, [user]);

  const handleLikedSongsClick = () => {
    if (likedSongs.length > 0) {
      onTrackSelect(likedSongs[0]);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto pb-40 md:pb-32">
      <div className="p-6 md:p-8 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between animate-fade-in">
          <h1 className="text-2xl font-bold text-foreground">Your Library</h1>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground">
              <Plus className="w-5 h-5" />
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

        {/* Filters */}
        <div className="flex gap-2 animate-fade-in" style={{ animationDelay: "0.1s" }}>
          <Button variant="secondary" size="sm" className="rounded-full">
            Playlists
          </Button>
          <Button variant="ghost" size="sm" className="rounded-full text-muted-foreground">
            Artists
          </Button>
          <Button variant="ghost" size="sm" className="rounded-full text-muted-foreground">
            Albums
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
              <h3 className="font-semibold text-foreground truncate">Liked Songs</h3>
              <p className="text-sm text-muted-foreground">{likedCount} songs</p>
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
                <h3 className="font-semibold text-foreground truncate">Liked Songs</h3>
                <p className="text-sm text-muted-foreground">Playlist • {likedCount} songs</p>
              </div>
            </button>
          )}

          {/* User's Own Playlists */}
          {ownPlaylists.map((playlist) =>
            viewMode === "grid" ? (
              <button
                key={playlist.id}
                className="group p-4 rounded-xl bg-card/50 hover:bg-card transition-all duration-300 text-left"
                onClick={() => onPlaylistSelect({
                  id: playlist.id,
                  name: playlist.name,
                  cover: playlist.cover_url,
                  description: playlist.description,
                })}
              >
                <img
                  src={playlist.cover_url || "/placeholder.svg"}
                  alt={playlist.name}
                  className="w-full aspect-square object-cover rounded-lg shadow-lg mb-4"
                />
                <h3 className="font-semibold text-foreground truncate">{playlist.name}</h3>
                <p className="text-sm text-muted-foreground">Your playlist</p>
              </button>
            ) : (
              <button
                key={playlist.id}
                className="flex items-center gap-4 p-3 rounded-lg bg-card/30 hover:bg-card/50 transition-colors w-full text-left"
                onClick={() => onPlaylistSelect({
                  id: playlist.id,
                  name: playlist.name,
                  cover: playlist.cover_url,
                  description: playlist.description,
                })}
              >
                <img
                  src={playlist.cover_url || "/placeholder.svg"}
                  alt={playlist.name}
                  className="w-14 h-14 object-cover rounded-lg"
                />
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-foreground truncate">{playlist.name}</h3>
                  <p className="text-sm text-muted-foreground">Your playlist</p>
                </div>
              </button>
            )
          )}

          {/* Liked Playlists */}
          {likedPlaylists.map((playlist) =>
            viewMode === "grid" ? (
              <button
                key={`liked-${playlist.id}`}
                className="group p-4 rounded-xl bg-card/50 hover:bg-card transition-all duration-300 text-left"
                onClick={() => onPlaylistSelect({
                  id: playlist.id,
                  name: playlist.name,
                  cover: playlist.cover_url,
                  description: playlist.description,
                })}
              >
                <div className="relative">
                  <img
                    src={playlist.cover_url || "/placeholder.svg"}
                    alt={playlist.name}
                    className="w-full aspect-square object-cover rounded-lg shadow-lg mb-4"
                  />
                  <Heart className="absolute top-2 right-2 w-5 h-5 text-primary fill-current" />
                </div>
                <h3 className="font-semibold text-foreground truncate">{playlist.name}</h3>
                <p className="text-sm text-muted-foreground">Liked playlist</p>
              </button>
            ) : (
              <button
                key={`liked-${playlist.id}`}
                className="flex items-center gap-4 p-3 rounded-lg bg-card/30 hover:bg-card/50 transition-colors w-full text-left"
                onClick={() => onPlaylistSelect({
                  id: playlist.id,
                  name: playlist.name,
                  cover: playlist.cover_url,
                  description: playlist.description,
                })}
              >
                <div className="relative">
                  <img
                    src={playlist.cover_url || "/placeholder.svg"}
                    alt={playlist.name}
                    className="w-14 h-14 object-cover rounded-lg"
                  />
                  <Heart className="absolute -top-1 -right-1 w-4 h-4 text-primary fill-current" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-foreground truncate">{playlist.name}</h3>
                  <p className="text-sm text-muted-foreground">Liked playlist</p>
                </div>
              </button>
            )
          )}
        </div>
      </div>
    </div>
  );
};

export default LibraryView;
