import { useEffect, useState, useRef } from "react";
import { X, Heart, Music, Headphones, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useLanguage } from "@/contexts/LanguageContext";

const THANKYOU_SHOWN_KEY = "ambian_thankyou_shown";
const THANKYOU_OPEN_KEY = "ambian_thankyou_open";

interface ThankYouDialogProps {
  userId: string;
  accessUntil?: string; // ISO date string for when access expires
  trigger?: boolean; // External trigger to show the dialog
  onClose?: () => void;
}

const ThankYouDialog = ({ userId, accessUntil, trigger, onClose }: ThankYouDialogProps) => {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const hasChecked = useRef(false);

  useEffect(() => {
    // Handle external trigger
    if (trigger) {
      setOpen(true);
      sessionStorage.setItem(THANKYOU_OPEN_KEY, userId);
      return;
    }

    // Only check once per mount
    if (hasChecked.current) return;
    hasChecked.current = true;
    
    // Check if dialog is currently supposed to be open
    const isCurrentlyOpen = sessionStorage.getItem(THANKYOU_OPEN_KEY) === userId;
    if (isCurrentlyOpen) {
      setOpen(true);
    }
  }, [userId, trigger]);

  const handleClose = () => {
    setOpen(false);
    sessionStorage.removeItem(THANKYOU_OPEN_KEY);
    onClose?.();
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return null;
    return new Date(dateStr).toLocaleDateString(undefined, {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => {
      if (!isOpen) handleClose();
      else setOpen(true);
    }}>
      <DialogContent className="max-w-md p-0 overflow-hidden border-primary/20">
        <DialogTitle className="sr-only">{t("thankyou.title")}</DialogTitle>
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
            <Heart className="w-8 h-8 text-primary" />
          </div>
          <h2 className="text-2xl font-bold text-foreground mb-2">
            {t("thankyou.title")}
          </h2>
          <p className="text-muted-foreground">
            {t("thankyou.subtitle")}
          </p>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {/* Access info */}
          {accessUntil && (
            <div className="bg-primary/10 rounded-xl p-4 text-center">
              <p className="text-sm text-muted-foreground mb-1">{t("thankyou.accessUntil")}</p>
              <p className="text-lg font-bold text-primary">{formatDate(accessUntil)}</p>
            </div>
          )}

          {/* Benefits list */}
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                <Music className="w-4 h-4 text-primary" />
              </div>
              <p className="text-sm text-foreground">{t("thankyou.benefit1")}</p>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                <Headphones className="w-4 h-4 text-primary" />
              </div>
              <p className="text-sm text-foreground">{t("thankyou.benefit2")}</p>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                <Check className="w-4 h-4 text-primary" />
              </div>
              <p className="text-sm text-foreground">{t("thankyou.benefit3")}</p>
            </div>
          </div>

          {/* CTA */}
          <Button onClick={handleClose} className="w-full" size="lg">
            {t("thankyou.startListening")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ThankYouDialog;
