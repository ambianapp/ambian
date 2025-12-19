import { Home, Search, Library, Shield, User, Clock, HelpCircle } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";

interface MobileNavProps {
  activeView?: string;
  onViewChange?: (view: string) => void;
}

const MobileNav = ({ activeView, onViewChange }: MobileNavProps) => {
  const { isAdmin } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();

  const isOnIndexPage = location.pathname === "/";
  const isOnProfilePage = location.pathname === "/profile";
  const isOnAdminPage = location.pathname === "/admin";
  const isOnHelpPage = location.pathname === "/help";

  const navItems = [
    { id: "home", label: t("nav.home"), icon: Home },
    { id: "search", label: t("nav.search"), icon: Search },
    { id: "library", label: t("nav.library"), icon: Library },
    { id: "schedule", label: t("nav.schedule"), icon: Clock },
  ];

  const handleNavClick = (id: string) => {
    if (isOnIndexPage && onViewChange) {
      // On Index page, use view switching
      onViewChange(id);
    } else {
      // On other pages, navigate to Index with the view
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

  return (
    <nav className="fixed bottom-0 left-0 right-0 md:hidden glass border-t border-border z-50 pb-[var(--safe-bottom-tight)]">
      <div className="flex items-center justify-around h-14 px-4">
        {navItems.map((item) => {
          const isActive = isOnIndexPage && activeView === item.id;
          return (
            <button
              key={item.id}
              className={cn(
                "flex flex-col items-center justify-center gap-1 flex-1 h-full transition-colors",
                isActive ? "text-foreground" : "text-muted-foreground"
              )}
              onClick={() => handleNavClick(item.id)}
            >
              <item.icon className={cn("w-6 h-6", isActive && "text-primary")} />
              <span className="text-xs font-medium">{item.label}</span>
            </button>
          );
        })}
        <button
          className={cn(
            "flex flex-col items-center justify-center gap-1 flex-1 h-full transition-colors",
            isOnProfilePage ? "text-foreground" : "text-muted-foreground"
          )}
          onClick={handleProfileClick}
        >
          <User className={cn("w-6 h-6", isOnProfilePage && "text-primary")} />
          <span className="text-xs font-medium">{t("nav.profile")}</span>
        </button>
        <button
          className={cn(
            "flex flex-col items-center justify-center gap-1 flex-1 h-full transition-colors",
            isOnHelpPage ? "text-foreground" : "text-muted-foreground"
          )}
          onClick={handleHelpClick}
        >
          <HelpCircle className={cn("w-6 h-6", isOnHelpPage && "text-primary")} />
          <span className="text-xs font-medium">{t("nav.help")}</span>
        </button>
        {isAdmin && (
          <button
            className={cn(
              "flex flex-col items-center justify-center gap-1 flex-1 h-full transition-colors",
              isOnAdminPage ? "text-foreground" : "text-muted-foreground"
            )}
            onClick={handleAdminClick}
          >
            <Shield className={cn("w-6 h-6", isOnAdminPage ? "text-primary" : "text-primary")} />
            <span className="text-xs font-medium">{t("admin.title")}</span>
          </button>
        )}
      </div>
    </nav>
  );
};

export default MobileNav;