import { useState, useEffect } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { genres } from "@/data/musicData";
import { supabase } from "@/integrations/supabase/client";
import { getSignedAudioUrl } from "@/lib/storage";
import GenreCard from "./GenreCard";
import TrackRow from "./TrackRow";
import PlaylistCard from "./PlaylistCard";
import { Track } from "@/data/musicData";

interface DbTrack {
  id: string;
  title: string;
  artist: string;
  album: string | null;
  duration: string | null;
  cover_url: string | null;
  audio_url: string | null;
  genre: string | null;
}

interface DbPlaylist {
  id: string;
  name: string;
  description: string | null;
  cover_url: string | null;
}

interface SearchViewProps {
  currentTrack: Track | null;
  isPlaying: boolean;
  onTrackSelect: (track: Track) => void;
  onPlaylistSelect?: (playlist: any) => void;
}

const SearchView = ({ currentTrack, isPlaying, onTrackSelect, onPlaylistSelect }: SearchViewProps) => {
  const [query, setQuery] = useState("");
  const [filteredTracks, setFilteredTracks] = useState<DbTrack[]>([]);
  const [filteredPlaylists, setFilteredPlaylists] = useState<DbPlaylist[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const searchData = async () => {
      if (!query.trim()) {
        setFilteredTracks([]);
        setFilteredPlaylists([]);
        return;
      }

      setIsLoading(true);
      const searchTerm = `%${query}%`;

      const [tracksResult, playlistsResult] = await Promise.all([
        supabase
          .from("tracks")
          .select("*")
          .or(`title.ilike.${searchTerm},artist.ilike.${searchTerm},genre.ilike.${searchTerm}`)
          .limit(20),
        supabase
          .from("playlists")
          .select("*")
          .or(`name.ilike.${searchTerm},description.ilike.${searchTerm}`)
          .limit(10),
      ]);

      setFilteredTracks(tracksResult.data || []);
      setFilteredPlaylists(playlistsResult.data || []);
      setIsLoading(false);
    };

    const debounce = setTimeout(searchData, 300);
    return () => clearTimeout(debounce);
  }, [query]);

  const handleTrackSelect = async (dbTrack: DbTrack) => {
    const signedAudioUrl = await getSignedAudioUrl(dbTrack.audio_url);
    onTrackSelect({
      id: dbTrack.id,
      title: dbTrack.title,
      artist: dbTrack.artist,
      album: dbTrack.album || "",
      duration: dbTrack.duration || "0:00",
      cover: dbTrack.cover_url || "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=400",
      genre: dbTrack.genre || "",
      audioUrl: signedAudioUrl,
    });
  };

  const hasResults = filteredTracks.length > 0 || filteredPlaylists.length > 0;

  return (
    <div className="flex-1 overflow-y-auto pb-40 md:pb-32">
      <div className="p-6 md:p-8 space-y-8">
        {/* Search Input */}
        <div className="animate-fade-in">
          <div className="relative max-w-lg">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search songs, playlists..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-12 h-12 bg-card border-border text-foreground placeholder:text-muted-foreground rounded-full text-base"
            />
          </div>
        </div>

        {/* Search Results or Browse */}
        {query ? (
          <div className="space-y-8 animate-fade-in">
            {isLoading ? (
              <p className="text-muted-foreground">Searching...</p>
            ) : !hasResults ? (
              <h2 className="text-xl font-bold text-foreground">No results found</h2>
            ) : (
              <>
                {filteredPlaylists.length > 0 && (
                  <section>
                    <h2 className="text-xl font-bold text-foreground mb-4">Playlists</h2>
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                      {filteredPlaylists.map((playlist) => (
                        <PlaylistCard
                          key={playlist.id}
                          playlist={{
                            id: playlist.id,
                            name: playlist.name,
                            description: playlist.description || "",
                            cover: playlist.cover_url || "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=400",
                            trackCount: 0,
                            tracks: [],
                          }}
                          onClick={() => onPlaylistSelect?.({
                            id: playlist.id,
                            name: playlist.name,
                            description: playlist.description,
                            cover: playlist.cover_url,
                          })}
                        />
                      ))}
                    </div>
                  </section>
                )}

                {filteredTracks.length > 0 && (
                  <section>
                    <h2 className="text-xl font-bold text-foreground mb-4">Songs</h2>
                    <div className="bg-card/30 rounded-xl overflow-hidden">
                      {filteredTracks.map((track, index) => (
                        <TrackRow
                          key={track.id}
                          track={{
                            id: track.id,
                            title: track.title,
                            artist: track.artist,
                            album: track.album || "",
                            duration: track.duration || "0:00",
                            cover: track.cover_url || "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=400",
                            genre: track.genre || "",
                          }}
                          index={index + 1}
                          isPlaying={isPlaying}
                          isCurrentTrack={currentTrack?.id === track.id}
                          onPlay={() => handleTrackSelect(track)}
                        />
                      ))}
                    </div>
                  </section>
                )}
              </>
            )}
          </div>
        ) : (
          <section className="animate-fade-in" style={{ animationDelay: "0.1s" }}>
            <h2 className="text-xl font-bold text-foreground mb-4">Browse All</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {genres.map((genre) => (
                <GenreCard key={genre.id} genre={genre} onClick={() => setQuery(genre.name)} />
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
};

export default SearchView;
