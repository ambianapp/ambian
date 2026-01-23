import { Music, Search, Library, Shield, User, Clock, HelpCircle, MoreHorizontal, LogOut } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface MobileNavProps {
  activeView?: string;
  onViewChange?: (view: string) => void;
}

const MobileNav = ({ activeView, onViewChange }: MobileNavProps) => {
  const { isAdmin, signOut } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();

  const isOnIndexPage = location.pathname === "/";
  const isOnProfilePage = location.pathname === "/profile";
  const isOnAdminPage = location.pathname === "/admin";
  const isOnHelpPage = location.pathname === "/help";

  // Main nav items (always visible)
  const mainNavItems = [
    { id: "home", label: t("nav.home"), icon: Music },
    { id: "search", label: t("nav.search"), icon: Search },
    { id: "library", label: t("nav.library"), icon: Library },
  ];

  const handleNavClick = (id: string) => {
    if (isOnIndexPage && onViewChange) {
      onViewChange(id);
    } else {
      navigate("/", { state: { view: id } });
    }
  };

  const handleProfileClick = () => {
    navigate("/profile");
  };

  const handleHelpClick = () => {
    navigate("/help");
  };

  const handleAdminClick = () => {
    navigate("/admin");
  };

  const handleScheduleClick = () => {
    if (isOnIndexPage && onViewChange) {
      onViewChange("schedule");
    } else {
      navigate("/", { state: { view: "schedule" } });
    }
  };

  const isMoreActive = isOnHelpPage || isOnAdminPage || (isOnIndexPage && activeView === "schedule");

  return (
    <nav className="fixed bottom-0 left-0 right-0 md:hidden glass border-t border-border z-50 pb-[var(--safe-bottom-tight)]">
      <div className="flex items-center justify-around h-14 px-2">
        {mainNavItems.map((item) => {
          const isActive = isOnIndexPage && activeView === item.id;
          return (
            <button
              key={item.id}
              className={cn(
                "flex flex-col items-center justify-center gap-1 flex-1 h-full transition-colors min-w-0",
                isActive ? "text-foreground" : "text-muted-foreground"
              )}
              onClick={() => handleNavClick(item.id)}
            >
              <item.icon className={cn("w-6 h-6", isActive && "text-primary")} />
              <span className="text-[10px] font-medium truncate">{item.label}</span>
            </button>
          );
        })}
        
        {/* Profile */}
        <button
          className={cn(
            "flex flex-col items-center justify-center gap-1 flex-1 h-full transition-colors min-w-0",
            isOnProfilePage ? "text-foreground" : "text-muted-foreground"
          )}
          onClick={handleProfileClick}
        >
          <User className={cn("w-6 h-6", isOnProfilePage && "text-primary")} />
          <span className="text-[10px] font-medium truncate">{t("nav.profile")}</span>
        </button>

        {/* More dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className={cn(
                "flex flex-col items-center justify-center gap-1 flex-1 h-full transition-colors min-w-0",
                isMoreActive ? "text-foreground" : "text-muted-foreground"
              )}
            >
              <MoreHorizontal className={cn("w-6 h-6", isMoreActive && "text-primary")} />
              <span className="text-[10px] font-medium truncate">{t("nav.more")}</span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent 
            align="end" 
            side="top" 
            sideOffset={8}
            className="w-48 bg-card border-border mb-2"
          >
            <DropdownMenuItem 
              onClick={handleScheduleClick}
              className={cn(
                "flex items-center gap-3 cursor-pointer",
                isOnIndexPage && activeView === "schedule" && "text-primary"
              )}
            >
              <Clock className="w-4 h-4" />
              <span>{t("nav.schedule")}</span>
            </DropdownMenuItem>
            <DropdownMenuItem 
              onClick={handleHelpClick}
              className={cn(
                "flex items-center gap-3 cursor-pointer",
                isOnHelpPage && "text-primary"
              )}
            >
              <HelpCircle className="w-4 h-4" />
              <span>{t("nav.help")}</span>
            </DropdownMenuItem>
            {isAdmin && (
              <DropdownMenuItem 
                onClick={handleAdminClick}
                className={cn(
                  "flex items-center gap-3 cursor-pointer",
                  isOnAdminPage && "text-primary"
                )}
              >
                <Shield className="w-4 h-4" />
                <span>{t("admin.title")}</span>
              </DropdownMenuItem>
            )}
            <DropdownMenuItem 
              onClick={signOut}
              className="flex items-center gap-3 cursor-pointer text-destructive"
            >
              <LogOut className="w-4 h-4" />
              <span>{t("common.signOut")}</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </nav>
  );
};

export default MobileNav;
