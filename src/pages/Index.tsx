import { useState, useCallback, useEffect, useRef } from "react";
import { useSearchParams, useLocation } from "react-router-dom";
import Sidebar from "@/components/Sidebar";
import HomeView from "@/components/HomeView";
import SearchView from "@/components/SearchView";
import LibraryView from "@/components/LibraryView";
import PlaylistDetailView from "@/components/PlaylistDetailView";
import LikedSongsView from "@/components/LikedSongsView";
import ScheduleManager from "@/components/ScheduleManager";
import MobileSidebar from "@/components/MobileSidebar";
import SubscriptionGate from "@/components/SubscriptionGate";
import InvoiceDueGate from "@/components/InvoiceDueGate";
import TrialBanner from "@/components/TrialBanner";
import AmbianLoadingScreen from "@/components/AmbianLoadingScreen";
import { DeviceLimitDialog } from "@/components/DeviceLimitDialog";
import WelcomeDialog from "@/components/WelcomeDialog";

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
    user,
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

  // Track whether we're handling a popstate event to prevent pushing duplicate history
  const isPopstateRef = useRef(false);

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

  // Push history state when navigating to playlist or non-home views (for back button support)
  useEffect(() => {
    // Skip if this change came from a popstate event (back/forward button)
    if (isPopstateRef.current) {
      isPopstateRef.current = false;
      return;
    }

    // Push state when entering a playlist or non-home view
    if (selectedPlaylist) {
      window.history.pushState({ type: 'playlist', playlist: selectedPlaylist }, '');
    } else if (activeView !== 'home') {
      window.history.pushState({ type: 'view', view: activeView }, '');
    }
  }, [selectedPlaylist, activeView]);

  // Listen for browser back/forward navigation (popstate)
  useEffect(() => {
    const handlePopstate = (event: PopStateEvent) => {
      isPopstateRef.current = true;
      
      const state = event.state as { type?: string; playlist?: SelectedPlaylist; view?: string } | null;
      
      if (state?.type === 'playlist' && state.playlist) {
        // Navigated back to a playlist
        setSelectedPlaylist(state.playlist);
      } else if (state?.type === 'view' && state.view) {
        // Navigated back to a specific view
        setSelectedPlaylist(null);
        setActiveView(state.view);
      } else {
        // Navigated back to home (no state = initial state)
        setSelectedPlaylist(null);
        setActiveView('home');
      }
    };

    window.addEventListener('popstate', handlePopstate);
    return () => window.removeEventListener('popstate', handlePopstate);
  }, []);

  // Handle navigation state from other pages (e.g., Profile -> Search, Help -> Playlist)
  useEffect(() => {
    const state = location.state as { view?: string; selectedPlaylist?: SelectedPlaylist } | null;
    if (state?.view) {
      setActiveView(state.view);
    }
    if (state?.selectedPlaylist) {
      setSelectedPlaylist(state.selectedPlaylist);
      setActiveView("home"); // Ensure we're on home view when selecting a playlist
    }
    // Clear the state to prevent re-triggering on refresh
    if (state?.view || state?.selectedPlaylist) {
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
      // Use navigate to properly clear URL params (replaceState doesn't update React Router)
      navigate("/", { replace: true });
    } else if (checkoutStatus === "cancelled") {
      toast({
        title: "Checkout cancelled",
        description: "You can subscribe anytime from the pricing page.",
        variant: "destructive",
      });
      navigate("/", { replace: true });
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

  // Show Invoice Due Gate when user has unpaid invoice past due date
  if (subscription.hasUnpaidInvoice) {
    return <InvoiceDueGate />;
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
            onBack={() => handleViewChange("home")}
          />
        );
      case "library":
        return (
          <LibraryView
            currentTrack={currentTrack}
            isPlaying={isPlaying}
            onTrackSelect={handleTrackSelect}
            onPlaylistSelect={handlePlaylistSelect}
            onBack={() => handleViewChange("home")}
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
    <div className="flex flex-col h-[100dvh] bg-background overflow-hidden">
      <TrialBanner />
      <MobileSidebar 
        activeView={activeView} 
        onViewChange={handleViewChange} 
        onPlaylistSelect={handlePlaylistSelect}
        schedulerEnabled={schedulerEnabled}
        onToggleScheduler={toggleScheduler}
      />
      <div className="flex flex-1 overflow-hidden min-h-0">
        <Sidebar activeView={activeView} onViewChange={handleViewChange} onPlaylistSelect={handlePlaylistSelect} schedulerEnabled={schedulerEnabled} onToggleScheduler={toggleScheduler} />
        
        <main className="flex-1 flex flex-col overflow-hidden min-h-0">
          {renderView()}
        </main>
      </div>



      {/* Welcome dialog for new users - at root level to survive re-renders */}
      {user && <WelcomeDialog userId={user.id} userCreatedAt={user.created_at} />}

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
