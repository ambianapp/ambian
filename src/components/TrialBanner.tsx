import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Clock, X } from "lucide-react";
import { useState, useEffect } from "react";

interface TimeRemaining {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

const TrialBanner = () => {
  const { subscription, checkSubscription, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [dismissed, setDismissed] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState<TimeRemaining | null>(null);
  const [trialExpired, setTrialExpired] = useState(false);

  useEffect(() => {
    if (!subscription.trialEnd) return;

    const calculateTimeRemaining = () => {
      const now = new Date().getTime();
      const end = new Date(subscription.trialEnd!).getTime();
      const diff = end - now;

      if (diff <= 0) {
        setTimeRemaining(null);
        // Trial just expired - trigger recheck to lock the user out
        if (!trialExpired) {
          setTrialExpired(true);
          checkSubscription();
        }
        return;
      }

      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);

      setTimeRemaining({ days, hours, minutes, seconds });
    };

    calculateTimeRemaining();
    const interval = setInterval(calculateTimeRemaining, 1000);

    return () => clearInterval(interval);
  }, [subscription.trialEnd, trialExpired, checkSubscription]);

  // Don't show trial banner for admins - they have free access
  if (isAdmin || !subscription.isTrial || dismissed || !timeRemaining) return null;

  const formatNumber = (n: number) => n.toString().padStart(2, '0');

  return (
    <div className="bg-primary/10 border-b border-primary/20 px-4 py-2 flex items-center justify-between gap-4">
      <div className="flex items-center gap-2 text-sm">
        <Clock className="w-4 h-4 text-primary flex-shrink-0" />
        <span className="text-foreground">
          <span className="font-medium">Free trial:</span>{" "}
          <span className="font-mono">
            {timeRemaining.days > 0 && `${timeRemaining.days}d `}
            {formatNumber(timeRemaining.hours)}:{formatNumber(timeRemaining.minutes)}:{formatNumber(timeRemaining.seconds)}
          </span>
          {" "}remaining
        </span>
      </div>
      <div className="flex items-center gap-2 mr-12 md:mr-0">
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
