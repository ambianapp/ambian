import { Home, Search, Library, Shield } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";

interface MobileNavProps {
  activeView: string;
  onViewChange: (view: string) => void;
}

const MobileNav = ({ activeView, onViewChange }: MobileNavProps) => {
  const { isAdmin } = useAuth();
  const navigate = useNavigate();

  const navItems = [
    { id: "home", label: "Home", icon: Home },
    { id: "search", label: "Search", icon: Search },
    { id: "library", label: "Library", icon: Library },
  ];

  return (
    <nav className="fixed bottom-24 left-0 right-0 md:hidden glass border-t border-border px-4 py-2 z-40">
      <div className="flex items-center justify-around">
        {navItems.map((item) => (
          <button
            key={item.id}
            className={cn(
              "flex flex-col items-center gap-1 py-2 px-4 rounded-lg transition-colors",
              activeView === item.id
                ? "text-foreground"
                : "text-muted-foreground"
            )}
            onClick={() => onViewChange(item.id)}
          >
            <item.icon className={cn("w-6 h-6", activeView === item.id && "text-primary")} />
            <span className="text-xs font-medium">{item.label}</span>
          </button>
        ))}
        {isAdmin && (
          <button
            className="flex flex-col items-center gap-1 py-2 px-4 rounded-lg transition-colors text-muted-foreground"
            onClick={() => navigate("/admin")}
          >
            <Shield className="w-6 h-6 text-primary" />
            <span className="text-xs font-medium">Admin</span>
          </button>
        )}
      </div>
    </nav>
  );
};

export default MobileNav;
