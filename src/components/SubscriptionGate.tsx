import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Music2, Check, Loader2, User, Shield } from "lucide-react";

const features = [
  "Unlimited access to all music",
  "Create custom playlists",
  "No music license required",
  "100+ new songs every week",
  "Perfect for business premises",
];

const SubscriptionGate = () => {
  const { user, isAdmin, signOut } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
      <div className="max-w-md w-full text-center space-y-8 animate-fade-in">
        {/* Logo */}
        <div className="inline-flex items-center gap-3 mb-6">
          <div className="w-14 h-14 rounded-xl bg-primary flex items-center justify-center glow">
            <Music2 className="w-8 h-8 text-primary-foreground" />
          </div>
          <span className="text-3xl font-bold text-gradient">ambian</span>
        </div>

        {/* Message */}
        <div>
          <h1 className="text-2xl font-bold text-foreground mb-2">
            Subscribe to Listen
          </h1>
          <p className="text-muted-foreground">
            Get unlimited access to our entire music library for your business.
          </p>
        </div>

        {/* Features */}
        <div className="bg-card/50 rounded-xl p-6 text-left space-y-3">
          {features.map((feature, index) => (
            <div key={index} className="flex items-center gap-3">
              <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
                <Check className="w-3 h-3 text-primary" />
              </div>
              <span className="text-foreground">{feature}</span>
            </div>
          ))}
        </div>

        {/* Pricing CTA */}
        <div className="space-y-4">
          <div className="text-center">
            <p className="text-3xl font-bold text-foreground">
              €7.40<span className="text-lg font-normal text-muted-foreground">/month</span>
            </p>
            <p className="text-sm text-muted-foreground">when billed yearly (€89/year)</p>
          </div>

          <Button size="lg" className="w-full h-14 text-lg" onClick={() => navigate("/pricing")}>
            Start Listening
          </Button>

          <p className="text-xs text-muted-foreground">
            No music license required. Cancel anytime.
          </p>
        </div>

        {/* User info and admin access */}
        <div className="pt-4 border-t border-border space-y-3">
          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <User className="w-4 h-4" />
            <span>{user?.email}</span>
          </div>
          
          <div className="flex items-center justify-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => navigate("/profile")}>
              Profile
            </Button>
            {isAdmin && (
              <Button variant="ghost" size="sm" onClick={() => navigate("/admin")}>
                <Shield className="w-4 h-4 mr-1" />
                Admin
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={signOut}>
              Sign Out
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SubscriptionGate;
