import { useEffect, useState } from "react";
import { X, Gift, Music, Calendar, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useLanguage } from "@/contexts/LanguageContext";

const WELCOME_SHOWN_KEY = "ambian_welcome_shown";

interface WelcomeDialogProps {
  userId: string;
}

const WelcomeDialog = ({ userId }: WelcomeDialogProps) => {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    // Check if we've already shown the welcome dialog for this user
    const shownUsers = JSON.parse(localStorage.getItem(WELCOME_SHOWN_KEY) || "[]");
    if (!shownUsers.includes(userId)) {
      // Show the dialog after a short delay for better UX
      const timeout = setTimeout(() => {
        setOpen(true);
        // Mark as shown for this user
        localStorage.setItem(WELCOME_SHOWN_KEY, JSON.stringify([...shownUsers, userId]));
      }, 500);
      return () => clearTimeout(timeout);
    }
  }, [userId]);

  const handleClose = () => {
    setOpen(false);
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
