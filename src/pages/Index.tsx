import { useState, useCallback, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import Sidebar from "@/components/Sidebar";
import PlayerBar from "@/components/PlayerBar";
import HomeView from "@/components/HomeView";
import SearchView from "@/components/SearchView";
import LibraryView from "@/components/LibraryView";
import PlaylistDetailView from "@/components/PlaylistDetailView";
import LikedSongsView from "@/components/LikedSongsView";
import MobileNav from "@/components/MobileNav";
import SubscriptionGate from "@/components/SubscriptionGate";
import TrialBanner from "@/components/TrialBanner";
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
  const [currentTrack, setCurrentTrack] = useState<Track | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [selectedPlaylist, setSelectedPlaylist] = useState<SelectedPlaylist | null>(null);
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState<"off" | "all" | "one">("off");
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

  // Real-time trial expiry check - lock user out when trial ends
  useEffect(() => {
    if (!subscription.isTrial || !subscription.trialEnd || isAdmin) return;

    const checkTrialExpiry = () => {
      const now = new Date().getTime();
      const end = new Date(subscription.trialEnd!).getTime();
      if (now >= end) {
        // Trial expired - recheck subscription to update state and show gate
        checkSubscription();
      }
    };

    const interval = setInterval(checkTrialExpiry, 1000);
    return () => clearInterval(interval);
  }, [subscription.isTrial, subscription.trialEnd, isAdmin, checkSubscription]);

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
    if (currentIndex === -1) return;
    const nextIndex = (currentIndex + 1) % mockTracks.length;
    setCurrentTrack(mockTracks[nextIndex]);
    setIsPlaying(true);
  }, [currentTrack]);

  const handlePrevious = useCallback(() => {
    if (!currentTrack) return;
    const currentIndex = mockTracks.findIndex((t) => t.id === currentTrack.id);
    if (currentIndex === -1) return;
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

  const handleShuffleToggle = useCallback(() => {
    setShuffle((prev) => !prev);
  }, []);

  const handleRepeatToggle = useCallback(() => {
    setRepeat((prev) => {
      if (prev === "off") return "all";
      if (prev === "all") return "one";
      return "off";
    });
  }, []);
  if (!subscription.subscribed && !isAdmin) {
    return <SubscriptionGate />;
  }

  const renderView = () => {
    // Show liked songs view for special "liked-songs" playlist
    if (selectedPlaylist?.id === "liked-songs") {
      return (
        <LikedSongsView
          currentTrack={currentTrack}
          isPlaying={isPlaying}
          onTrackSelect={handleTrackSelect}
          onBack={handleBackFromPlaylist}
        />
      );
    }

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
    <div className="flex flex-col h-screen bg-background overflow-hidden">
      <TrialBanner />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar activeView={activeView} onViewChange={handleViewChange} onPlaylistSelect={handlePlaylistSelect} />
        
        <main className="flex-1 flex flex-col overflow-hidden">
          {renderView()}
        </main>
      </div>

      <MobileNav activeView={activeView} onViewChange={handleViewChange} />
      
      <PlayerBar
        currentTrack={currentTrack}
        isPlaying={isPlaying}
        onPlayPause={handlePlayPause}
        onNext={handleNext}
        onPrevious={handlePrevious}
        shuffle={shuffle}
        onShuffleToggle={handleShuffleToggle}
        repeat={repeat}
        onRepeatToggle={handleRepeatToggle}
      />
    </div>
  );
};

export default Index;
