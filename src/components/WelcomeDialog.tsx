import { useEffect, useState, useRef } from "react";
import { X, Gift, Music, Calendar, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useLanguage } from "@/contexts/LanguageContext";

const WELCOME_SHOWN_KEY = "ambian_welcome_shown";
const WELCOME_OPEN_KEY = "ambian_welcome_open"; // Track if dialog should be open

interface WelcomeDialogProps {
  userId: string;
  userCreatedAt?: string; // ISO date string from auth.users.created_at
}

const WelcomeDialog = ({ userId, userCreatedAt }: WelcomeDialogProps) => {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const hasChecked = useRef(false);

  useEffect(() => {
    // Only check once per mount to prevent re-running on every render
    if (hasChecked.current) return;
    hasChecked.current = true;
    
    // Check if dialog is currently supposed to be open (survives re-renders)
    const isCurrentlyOpen = sessionStorage.getItem(WELCOME_OPEN_KEY) === userId;
    if (isCurrentlyOpen) {
      setOpen(true);
      return;
    }
    
    // Check if we've already shown the welcome dialog for this user
    const shownUsers = JSON.parse(localStorage.getItem(WELCOME_SHOWN_KEY) || "[]");
    
    // Don't show for users who have already seen it
    if (shownUsers.includes(userId)) {
      return;
    }

    // Only show for truly new users (created within the last 5 minutes)
    // This prevents showing the dialog for old accounts on new devices/browsers
    if (userCreatedAt) {
      const createdAt = new Date(userCreatedAt);
      const now = new Date();
      const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);
      
      if (createdAt < fiveMinutesAgo) {
        // User account is older than 5 minutes, mark as shown and don't display
        localStorage.setItem(WELCOME_SHOWN_KEY, JSON.stringify([...shownUsers, userId]));
        return;
      }
    }

    // Show the dialog after a short delay for better UX
    const timeout = setTimeout(() => {
      setOpen(true);
      // Mark as open in sessionStorage so it survives re-renders
      sessionStorage.setItem(WELCOME_OPEN_KEY, userId);
      // Mark as shown for this user (permanently)
      localStorage.setItem(WELCOME_SHOWN_KEY, JSON.stringify([...shownUsers, userId]));
    }, 500);
    return () => clearTimeout(timeout);
  }, [userId, userCreatedAt]);

  const handleClose = () => {
    setOpen(false);
    // Clear the open flag so it doesn't reopen on next mount
    sessionStorage.removeItem(WELCOME_OPEN_KEY);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-md p-0 overflow-hidden border-primary/20">
        <DialogTitle className="sr-only">{t("welcome.title")}</DialogTitle>
        {/* Close button */}
        <button
          onClick={handleClose}
          className="absolute right-4 top-4 z-10 rounded-full p-1 bg-background/80 hover:bg-background transition-colors"
        >
          <X className="w-5 h-5 text-muted-foreground" />
        </button>

        {/* Header with gradient */}
        <div className="bg-gradient-to-br from-primary/20 via-primary/10 to-background p-6 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/20 mb-4">
            <Gift className="w-8 h-8 text-primary" />
          </div>
          <h2 className="text-2xl font-bold text-foreground mb-2">
            {t("welcome.title")}
          </h2>
          <p className="text-muted-foreground">
            {t("welcome.subtitle")}
          </p>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {/* Trial info */}
          <div className="bg-primary/10 rounded-xl p-4 text-center">
            <p className="text-3xl font-bold text-primary mb-1">3</p>
            <p className="text-sm font-medium text-foreground">{t("welcome.daysFreeTrial")}</p>
            <p className="text-xs text-muted-foreground mt-1">{t("welcome.noCardRequired")}</p>
          </div>

          {/* Features list */}
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                <Music className="w-4 h-4 text-primary" />
              </div>
              <p className="text-sm text-foreground">{t("welcome.feature1")}</p>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                <Calendar className="w-4 h-4 text-primary" />
              </div>
              <p className="text-sm text-foreground">{t("welcome.feature2")}</p>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                <Check className="w-4 h-4 text-primary" />
              </div>
              <p className="text-sm text-foreground">{t("welcome.feature3")}</p>
            </div>
          </div>

          {/* CTA */}
          <Button onClick={handleClose} className="w-full" size="lg">
            {t("welcome.getStarted")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default WelcomeDialog;
