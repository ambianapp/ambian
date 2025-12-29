import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { PlayerProvider } from "@/contexts/PlayerContext";
import { LanguageProvider } from "@/contexts/LanguageContext";
import PlayerBar from "@/components/PlayerBar";
import MobileSidebar from "@/components/MobileSidebar";
import AmbianLoadingScreen from "@/components/AmbianLoadingScreen";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Profile from "./pages/Profile";
import Pricing from "./pages/Pricing";
import Admin from "./pages/Admin";
import Install from "./pages/Install";
import Help from "./pages/Help";
import AllPlaylists from "./pages/AllPlaylists";
import ResetPassword from "./pages/ResetPassword";
import Terms from "./pages/Terms";
import Privacy from "./pages/Privacy";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return <AmbianLoadingScreen label="Loading your account…" />;
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  return <>{children}</>;
};

const AuthRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return <AmbianLoadingScreen label="Loading Ambian…" />;
  }

  if (user) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
};

const HomeRoute = () => {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return <AmbianLoadingScreen label="Loading Ambian…" />;
  }

  // Show Auth page at root URL for non-logged-in users (Google OAuth needs privacy link on homepage)
  return user ? <Index /> : <Auth />;
};

const AppRoutes = () => {
  return (
    <Routes>
      <Route path="/" element={<HomeRoute />} />
      <Route
        path="/auth"
        element={
          <AuthRoute>
            <Auth />
          </AuthRoute>
        }
      />
      <Route
        path="/profile"
        element={
          <ProtectedRoute>
            <Profile />
          </ProtectedRoute>
        }
      />
      <Route
        path="/pricing"
        element={
          <ProtectedRoute>
            <Pricing />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin"
        element={
          <ProtectedRoute>
            <Admin />
          </ProtectedRoute>
        }
      />
      <Route path="/install" element={<Install />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/terms" element={<Terms />} />
      <Route path="/privacy" element={<Privacy />} />
      <Route
        path="/help"
        element={
          <ProtectedRoute>
            <Help />
          </ProtectedRoute>
        }
      />
      <Route
        path="/playlists"
        element={
          <ProtectedRoute>
            <AllPlaylists />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
};

const AppContent = () => {
  const { user } = useAuth();
  const location = useLocation();
  
  // Show MobileSidebar on non-index protected pages (Index has its own)
  const showGlobalMobileSidebar = user && location.pathname !== "/" && location.pathname !== "/auth" && location.pathname !== "/install";
  
  return (
    <>
      <div className={user ? "pb-[calc(160px+var(--safe-bottom-tight))] md:pb-0" : undefined}>
        <AppRoutes />
      </div>
      {showGlobalMobileSidebar && <MobileSidebar activeView="" onViewChange={() => {}} />}
      {user && <PlayerBar />}
    </>
  );
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <LanguageProvider>
            <PlayerProvider>
              <AppContent />
            </PlayerProvider>
          </LanguageProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
