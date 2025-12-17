import { Home, Search, Library, Plus, Heart, Music2, User, Shield } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";

interface SidebarProps {
  activeView: string;
  onViewChange: (view: string) => void;
}

const Sidebar = ({ activeView, onViewChange }: SidebarProps) => {
  const { user, isAdmin } = useAuth();
  const navigate = useNavigate();

  const navItems = [
    { id: "home", label: "Home", icon: Home },
    { id: "search", label: "Search", icon: Search },
    { id: "library", label: "Your Library", icon: Library },
  ];

  return (
    <aside className="hidden md:flex flex-col w-64 bg-card/50 border-r border-border p-4 gap-6">
      {/* Logo */}
      <div className="flex items-center gap-3 px-2 py-4">
        <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center glow">
          <Music2 className="w-6 h-6 text-primary-foreground" />
        </div>
        <span className="text-xl font-bold text-gradient">ambian</span>
      </div>

      {/* Main Navigation */}
      <nav className="flex flex-col gap-1">
        {navItems.map((item) => (
          <Button
            key={item.id}
            variant="ghost"
            className={cn(
              "justify-start gap-4 h-12 text-base font-medium",
              activeView === item.id
                ? "bg-secondary text-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
            onClick={() => onViewChange(item.id)}
          >
            <item.icon className="w-5 h-5" />
            {item.label}
          </Button>
        ))}
      </nav>

      {/* Playlists Section */}
      <div className="flex-1 flex flex-col gap-4 mt-4">
        <div className="flex items-center justify-between px-2">
          <span className="text-sm font-semibold text-muted-foreground">Your Playlists</span>
          <Button variant="ghost" size="iconSm" className="text-muted-foreground hover:text-foreground">
            <Plus className="w-4 h-4" />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto space-y-1">
          <Button
            variant="ghost"
            className="w-full justify-start gap-3 h-10 text-sm text-muted-foreground hover:text-foreground"
          >
            <Heart className="w-4 h-4 text-primary" />
            Liked Songs
          </Button>
          <Button
            variant="ghost"
            className="w-full justify-start gap-3 h-10 text-sm text-muted-foreground hover:text-foreground"
          >
            <div className="w-4 h-4 rounded bg-gradient-to-br from-primary to-accent" />
            Café Vibes
          </Button>
          <Button
            variant="ghost"
            className="w-full justify-start gap-3 h-10 text-sm text-muted-foreground hover:text-foreground"
          >
            <div className="w-4 h-4 rounded bg-gradient-to-br from-blue-500 to-cyan-500" />
            Spa & Wellness
          </Button>
        </div>
      </div>

      {/* User Section */}
      <div className="border-t border-border pt-4 space-y-2">
        {isAdmin && (
          <Button
            variant="ghost"
            className="w-full justify-start gap-3 h-10 text-sm text-muted-foreground hover:text-foreground"
            onClick={() => navigate("/admin")}
          >
            <Shield className="w-4 h-4 text-primary" />
            Admin Panel
          </Button>
        )}
        <Button
          variant="ghost"
          className="w-full justify-start gap-3 h-10 text-sm text-muted-foreground hover:text-foreground"
          onClick={() => navigate("/profile")}
        >
          <User className="w-4 h-4" />
          <span className="truncate">{user?.email || "Profile"}</span>
        </Button>
      </div>
    </aside>
  );
};

export default Sidebar;
