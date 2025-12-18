import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Clock, X } from "lucide-react";
import { useState } from "react";

const TrialBanner = () => {
  const { subscription } = useAuth();
  const navigate = useNavigate();
  const [dismissed, setDismissed] = useState(false);

  if (!subscription.isTrial || dismissed) return null;

  return (
    <div className="bg-primary/10 border-b border-primary/20 px-4 py-2 flex items-center justify-between gap-4">
      <div className="flex items-center gap-2 text-sm">
        <Clock className="w-4 h-4 text-primary flex-shrink-0" />
        <span className="text-foreground">
          <span className="font-medium">Free trial:</span>{" "}
          {subscription.trialDaysRemaining} day{subscription.trialDaysRemaining !== 1 ? 's' : ''} remaining
        </span>
      </div>
      <div className="flex items-center gap-2">
        <Button size="sm" variant="default" onClick={() => navigate("/pricing")} className="h-7 text-xs">
          Subscribe Now
        </Button>
        <button 
          onClick={() => setDismissed(true)} 
          className="text-muted-foreground hover:text-foreground transition-colors p-1"
          aria-label="Dismiss"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

export default TrialBanner;
