import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Music2, Check, User, Shield, Clock } from "lucide-react";

const features = [
  "3 days free trial",
  "Unlimited access to all music",
  "Create custom playlists",
  "No music license required",
  "100+ new songs every week",
  "Perfect for business premises",
];

const SubscriptionGate = () => {
  const { user, isAdmin, signOut, subscription } = useAuth();
  const navigate = useNavigate();

  // Show trial banner if user is in trial period
  const showTrialBanner = subscription.isTrial && subscription.trialDaysRemaining > 0;

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4 pb-32">
      <div className="max-w-md w-full text-center space-y-8 animate-fade-in">
        {/* Trial Banner */}
        {showTrialBanner && (
          <div className="bg-primary/10 border border-primary/30 rounded-xl p-4 mb-4">
            <div className="flex items-center justify-center gap-2 text-primary mb-1">
              <Clock className="w-5 h-5" />
              <span className="font-semibold">Free Trial Active</span>
            </div>
            <p className="text-sm text-muted-foreground">
              {subscription.trialDaysRemaining} day{subscription.trialDaysRemaining !== 1 ? 's' : ''} remaining
            </p>
          </div>
        )}

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
            {showTrialBanner ? "Continue with Full Access" : "Subscribe to Listen"}
          </h1>
          <p className="text-muted-foreground">
            {showTrialBanner 
              ? "Your free trial is active. Subscribe anytime to continue after your trial ends."
              : "Get unlimited access to our entire music library for your business."}
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
            <p className="text-xs text-muted-foreground/70 mt-1">
              Prices exclude VAT
            </p>
          </div>

          <Button size="lg" className="w-full h-14 text-lg" onClick={() => navigate("/pricing")}>
            {showTrialBanner ? "View Plans" : "Start Listening"}
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
