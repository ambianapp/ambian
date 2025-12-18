import { Home, Search, Library, Shield, User } from "lucide-react";
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
    <nav className="fixed bottom-0 left-0 right-0 md:hidden glass border-t border-border px-2 py-2 z-40 h-[60px]">
      <div className="flex items-center justify-around">
        {navItems.map((item) => (
          <button
            key={item.id}
            className={cn(
              "flex flex-col items-center gap-1 py-2 px-3 rounded-lg transition-colors",
              activeView === item.id
                ? "text-foreground"
                : "text-muted-foreground"
            )}
            onClick={() => onViewChange(item.id)}
          >
            <item.icon className={cn("w-5 h-5", activeView === item.id && "text-primary")} />
            <span className="text-[10px] font-medium">{item.label}</span>
          </button>
        ))}
        <button
          className="flex flex-col items-center gap-1 py-2 px-3 rounded-lg transition-colors text-muted-foreground"
          onClick={() => navigate("/profile")}
        >
          <User className="w-5 h-5" />
          <span className="text-[10px] font-medium">Profile</span>
        </button>
        {isAdmin && (
          <button
            className="flex flex-col items-center gap-1 py-2 px-3 rounded-lg transition-colors text-muted-foreground"
            onClick={() => navigate("/admin")}
          >
            <Shield className="w-5 h-5 text-primary" />
            <span className="text-[10px] font-medium">Admin</span>
          </button>
        )}
      </div>
    </nav>
  );
};

export default MobileNav;
