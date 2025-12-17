import { useState, useCallback } from "react";
import Sidebar from "@/components/Sidebar";
import PlayerBar from "@/components/PlayerBar";
import HomeView from "@/components/HomeView";
import SearchView from "@/components/SearchView";
import LibraryView from "@/components/LibraryView";
import MobileNav from "@/components/MobileNav";
import { Track, tracks } from "@/data/musicData";

const Index = () => {
  const [activeView, setActiveView] = useState("home");
  const [currentTrack, setCurrentTrack] = useState<Track | null>(tracks[0]);
  const [isPlaying, setIsPlaying] = useState(false);

  const handleTrackSelect = useCallback((track: Track) => {
    setCurrentTrack(track);
    setIsPlaying(true);
  }, []);

  const handlePlayPause = useCallback(() => {
    setIsPlaying((prev) => !prev);
  }, []);

  const handleNext = useCallback(() => {
    if (!currentTrack) return;
    const currentIndex = tracks.findIndex((t) => t.id === currentTrack.id);
    const nextIndex = (currentIndex + 1) % tracks.length;
    setCurrentTrack(tracks[nextIndex]);
    setIsPlaying(true);
  }, [currentTrack]);

  const handlePrevious = useCallback(() => {
    if (!currentTrack) return;
    const currentIndex = tracks.findIndex((t) => t.id === currentTrack.id);
    const prevIndex = (currentIndex - 1 + tracks.length) % tracks.length;
    setCurrentTrack(tracks[prevIndex]);
    setIsPlaying(true);
  }, [currentTrack]);

  const renderView = () => {
    switch (activeView) {
      case "search":
        return (
          <SearchView
            currentTrack={currentTrack}
            isPlaying={isPlaying}
            onTrackSelect={handleTrackSelect}
          />
        );
      case "library":
        return (
          <LibraryView
            currentTrack={currentTrack}
            isPlaying={isPlaying}
            onTrackSelect={handleTrackSelect}
          />
        );
      default:
        return (
          <HomeView
            currentTrack={currentTrack}
            isPlaying={isPlaying}
            onTrackSelect={handleTrackSelect}
          />
        );
    }
  };

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <Sidebar activeView={activeView} onViewChange={setActiveView} />
      
      <main className="flex-1 flex flex-col overflow-hidden">
        {renderView()}
      </main>

      <MobileNav activeView={activeView} onViewChange={setActiveView} />
      
      <PlayerBar
        currentTrack={currentTrack}
        isPlaying={isPlaying}
        onPlayPause={handlePlayPause}
        onNext={handleNext}
        onPrevious={handlePrevious}
      />
    </div>
  );
};

export default Index;
