import { useState, useCallback, useEffect } from "react";
import { useSearchParams, useLocation } from "react-router-dom";
import Sidebar from "@/components/Sidebar";
import HomeView from "@/components/HomeView";
import SearchView from "@/components/SearchView";
import LibraryView from "@/components/LibraryView";
import PlaylistDetailView from "@/components/PlaylistDetailView";
import LikedSongsView from "@/components/LikedSongsView";
import ScheduleManager from "@/components/ScheduleManager";
import MobileNav from "@/components/MobileNav";
import SubscriptionGate from "@/components/SubscriptionGate";
import TrialBanner from "@/components/TrialBanner";
import AmbianLoadingScreen from "@/components/AmbianLoadingScreen";
import { DeviceLimitDialog } from "@/components/DeviceLimitDialog";
// import AIChatbot from "@/components/AIChatbot"; // Disabled for now
import { useAuth } from "@/contexts/AuthContext";
import { usePlayer } from "@/contexts/PlayerContext";
import { useToast } from "@/hooks/use-toast";
import { usePlaylistScheduler } from "@/hooks/usePlaylistScheduler";
import { useNavigate } from "react-router-dom";

interface SelectedPlaylist {
  id: string;
  name: string;
  cover: string | null;
  description: string | null;
}

const UI_STATE_KEY = "ambian_ui_state";

type UiState = {
  activeView: string;
  selectedPlaylist: SelectedPlaylist | null;
};

const Index = () => {
  const [activeView, setActiveView] = useState("home");
  const [selectedPlaylist, setSelectedPlaylist] = useState<SelectedPlaylist | null>(null);
  const { 
    subscription, 
    checkSubscription, 
    isAdmin, 
    isLoading, 
    isSubscriptionLoading,
    showDeviceLimitDialog,
    activeDevices,
    disconnectDevice,
    dismissDeviceLimitDialog,
    getDeviceId,
  } = useAuth();
  const { currentTrack, isPlaying, handleTrackSelect } = usePlayer();
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const { toast } = useToast();

  // Auto-play scheduled playlists
  const { isEnabled: schedulerEnabled, toggleScheduler } = usePlaylistScheduler();

  const navigate = useNavigate();
  const { syncDeviceSlots } = useAuth();

  // Restore last UI state on mount (helps when the preview/browser remounts the app)
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(UI_STATE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as UiState;
      if (saved?.activeView) setActiveView(saved.activeView);
      if (saved?.selectedPlaylist !== undefined) setSelectedPlaylist(saved.selectedPlaylist);
    } catch {
      // ignore
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist UI state when it changes
  useEffect(() => {
    try {
      const next: UiState = { activeView, selectedPlaylist };
      sessionStorage.setItem(UI_STATE_KEY, JSON.stringify(next));
    } catch {
      // ignore
    }
  }, [activeView, selectedPlaylist]);

  // Handle navigation state from other pages (e.g., Profile -> Search)
  useEffect(() => {
    const state = location.state as { view?: string } | null;
    if (state?.view) {
      setActiveView(state.view);
      // Clear the state to prevent re-triggering on refresh
      navigate("/", { replace: true, state: {} });
    }
  }, [location.state, navigate]);

  // Handle checkout callback and device added
  useEffect(() => {
    const checkoutStatus = searchParams.get("checkout");
    const deviceAdded = searchParams.get("device_added");
    
    if (deviceAdded === "true") {
      syncDeviceSlots();
      toast({
        title: "Device slot added!",
        description: "You can now use your account on an additional device.",
      });
      navigate("/", { replace: true });
    } else if (checkoutStatus === "success") {
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
  }, [searchParams, checkSubscription, syncDeviceSlots, toast, navigate]);

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

  // Show loading while checking auth (login / hard refresh)
  if (isLoading) {
    return <AmbianLoadingScreen label="Loading Ambian…" />;
  }

  // On first load (no cached subscription), wait for subscription to resolve.
  if (isSubscriptionLoading) {
    return <AmbianLoadingScreen />;
  }

  if (!subscription.subscribed && !subscription.isTrial && !isAdmin) {
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
      case "schedule":
        return (
          <ScheduleManager 
            onBack={() => handleViewChange("home")} 
            schedulerEnabled={schedulerEnabled}
            onToggleScheduler={toggleScheduler}
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
        <Sidebar activeView={activeView} onViewChange={handleViewChange} onPlaylistSelect={handlePlaylistSelect} schedulerEnabled={schedulerEnabled} onToggleScheduler={toggleScheduler} />
        
        <main className="flex-1 flex flex-col overflow-hidden">
          {renderView()}
        </main>
      </div>

      <MobileNav activeView={activeView} onViewChange={handleViewChange} />
      {/* <AIChatbot /> */}

      {/* Device limit dialog */}
      <DeviceLimitDialog
        open={showDeviceLimitDialog}
        activeDevices={activeDevices}
        deviceSlots={subscription.deviceSlots}
        currentSessionId={getDeviceId()}
        onDisconnect={disconnectDevice}
        onClose={dismissDeviceLimitDialog}
      />
    </div>
  );
};

export default Index;
