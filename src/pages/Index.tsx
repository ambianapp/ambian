import { useState, useCallback, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import Sidebar from "@/components/Sidebar";
import PlayerBar from "@/components/PlayerBar";
import HomeView from "@/components/HomeView";
import SearchView from "@/components/SearchView";
import LibraryView from "@/components/LibraryView";
import PlaylistDetailView from "@/components/PlaylistDetailView";
import MobileNav from "@/components/MobileNav";
import SubscriptionGate from "@/components/SubscriptionGate";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Track, tracks as mockTracks } from "@/data/musicData";

interface SelectedPlaylist {
  id: string;
  name: string;
  cover: string | null;
  description: string | null;
}

const Index = () => {
  const [activeView, setActiveView] = useState("home");
  const [currentTrack, setCurrentTrack] = useState<Track | null>(mockTracks[0]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [selectedPlaylist, setSelectedPlaylist] = useState<SelectedPlaylist | null>(null);
  const { subscription, checkSubscription, isAdmin } = useAuth();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();

  // Handle checkout callback
  useEffect(() => {
    const checkoutStatus = searchParams.get("checkout");
    if (checkoutStatus === "success") {
      toast({
        title: "Welcome to Ambian!",
        description: "Your subscription is now active. Enjoy the music!",
      });
      checkSubscription();
      window.history.replaceState({}, "", window.location.pathname);
    } else if (checkoutStatus === "cancelled") {
      toast({
        title: "Checkout cancelled",
        description: "You can subscribe anytime from the pricing page.",
        variant: "destructive",
      });
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [searchParams, checkSubscription, toast]);

  const handleTrackSelect = useCallback((track: Track) => {
    setCurrentTrack(track);
    setIsPlaying(true);
  }, []);

  const handlePlayPause = useCallback(() => {
    setIsPlaying((prev) => !prev);
  }, []);

  const handleNext = useCallback(() => {
    if (!currentTrack) return;
    const currentIndex = mockTracks.findIndex((t) => t.id === currentTrack.id);
    const nextIndex = (currentIndex + 1) % mockTracks.length;
    setCurrentTrack(mockTracks[nextIndex]);
    setIsPlaying(true);
  }, [currentTrack]);

  const handlePrevious = useCallback(() => {
    if (!currentTrack) return;
    const currentIndex = mockTracks.findIndex((t) => t.id === currentTrack.id);
    const prevIndex = (currentIndex - 1 + mockTracks.length) % mockTracks.length;
    setCurrentTrack(mockTracks[prevIndex]);
    setIsPlaying(true);
  }, [currentTrack]);

  const handlePlaylistSelect = useCallback((playlist: SelectedPlaylist) => {
    setSelectedPlaylist(playlist);
  }, []);

  const handleBackFromPlaylist = useCallback(() => {
    setSelectedPlaylist(null);
  }, []);

  const handleViewChange = useCallback((view: string) => {
    setActiveView(view);
    setSelectedPlaylist(null); // Clear playlist when changing views
  }, []);

  // Show subscription gate if not subscribed (admins bypass)
  if (!subscription.subscribed && !isAdmin) {
    return <SubscriptionGate />;
  }

  const renderView = () => {
    // Show playlist detail if a playlist is selected
    if (selectedPlaylist) {
      return (
        <PlaylistDetailView
          playlistId={selectedPlaylist.id}
          playlistName={selectedPlaylist.name}
          playlistCover={selectedPlaylist.cover}
          playlistDescription={selectedPlaylist.description}
          currentTrack={currentTrack}
          isPlaying={isPlaying}
          onTrackSelect={handleTrackSelect}
          onBack={handleBackFromPlaylist}
          onPlayAll={() => {}}
        />
      );
    }

    switch (activeView) {
      case "search":
        return (
          <SearchView
            currentTrack={currentTrack}
            isPlaying={isPlaying}
            onTrackSelect={handleTrackSelect}
            onPlaylistSelect={handlePlaylistSelect}
          />
        );
      case "library":
        return (
          <LibraryView
            currentTrack={currentTrack}
            isPlaying={isPlaying}
            onTrackSelect={handleTrackSelect}
            onPlaylistSelect={handlePlaylistSelect}
          />
        );
      default:
        return (
          <HomeView
            currentTrack={currentTrack}
            isPlaying={isPlaying}
            onTrackSelect={handleTrackSelect}
            onPlaylistSelect={handlePlaylistSelect}
          />
        );
    }
  };

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <Sidebar activeView={activeView} onViewChange={handleViewChange} />
      
      <main className="flex-1 flex flex-col overflow-hidden">
        {renderView()}
      </main>

      <MobileNav activeView={activeView} onViewChange={handleViewChange} />
      
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
