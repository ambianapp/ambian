import { genres, playlists, tracks } from "@/data/musicData";
import GenreCard from "./GenreCard";
import PlaylistCard from "./PlaylistCard";
import TrackRow from "./TrackRow";
import { Track } from "@/data/musicData";

interface HomeViewProps {
  currentTrack: Track | null;
  isPlaying: boolean;
  onTrackSelect: (track: Track) => void;
}

const HomeView = ({ currentTrack, isPlaying, onTrackSelect }: HomeViewProps) => {
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 18) return "Good afternoon";
    return "Good evening";
  };

  return (
    <div className="flex-1 overflow-y-auto pb-32">
      <div className="p-6 md:p-8 space-y-8">
        {/* Header */}
        <div className="animate-fade-in">
          <h1 className="text-3xl md:text-4xl font-bold text-foreground">{getGreeting()}</h1>
          <p className="text-muted-foreground mt-2">Ready to set the perfect ambiance?</p>
        </div>

        {/* Quick Picks */}
        <section className="animate-fade-in" style={{ animationDelay: "0.1s" }}>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {playlists.slice(0, 6).map((playlist) => (
              <button
                key={playlist.id}
                className="flex items-center gap-4 bg-card/80 hover:bg-card rounded-lg overflow-hidden transition-colors group"
                onClick={() => onTrackSelect(playlist.tracks[0])}
              >
                <img
                  src={playlist.cover}
                  alt={playlist.name}
                  className="w-16 h-16 object-cover"
                />
                <span className="font-semibold text-sm text-foreground truncate pr-4">
                  {playlist.name}
                </span>
              </button>
            ))}
          </div>
        </section>

        {/* Browse by Genre */}
        <section className="animate-fade-in" style={{ animationDelay: "0.2s" }}>
          <h2 className="text-xl font-bold text-foreground mb-4">Browse by Genre</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {genres.map((genre) => (
              <GenreCard key={genre.id} genre={genre} onClick={() => {}} />
            ))}
          </div>
        </section>

        {/* Featured Playlists */}
        <section className="animate-fade-in" style={{ animationDelay: "0.3s" }}>
          <h2 className="text-xl font-bold text-foreground mb-4">Made for Business</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
            {playlists.map((playlist) => (
              <PlaylistCard
                key={playlist.id}
                playlist={playlist}
                onClick={() => onTrackSelect(playlist.tracks[0])}
              />
            ))}
          </div>
        </section>

        {/* Recently Played */}
        <section className="animate-fade-in" style={{ animationDelay: "0.4s" }}>
          <h2 className="text-xl font-bold text-foreground mb-4">Recently Played</h2>
          <div className="bg-card/30 rounded-xl overflow-hidden">
            {tracks.slice(0, 5).map((track, index) => (
              <TrackRow
                key={track.id}
                track={track}
                index={index + 1}
                isPlaying={isPlaying}
                isCurrentTrack={currentTrack?.id === track.id}
                onPlay={() => onTrackSelect(track)}
              />
            ))}
          </div>
        </section>
      </div>
    </div>
  );
};

export default HomeView;
