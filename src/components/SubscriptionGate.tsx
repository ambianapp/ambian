import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { Button } from "@/components/ui/button";
import { Check, User, Shield, Clock } from "lucide-react";
import ambianLogo from "@/assets/ambian-logo-new.png";

const SubscriptionGate = () => {
  const { user, isAdmin, signOut, subscription } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();

  // Show trial banner if user is in trial period
  const showTrialBanner = subscription.isTrial && subscription.trialDaysRemaining > 0;

  const features = [
    t("features.trialDays"),
    t("features.unlimited"),
    t("features.playlists"),
    t("features.noLicense"),
    t("features.newSongs"),
    t("features.business"),
  ];

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4 pb-[calc(200px+var(--safe-bottom-tight))]">
      <div className="max-w-md w-full text-center space-y-8 animate-fade-in">
        {/* Trial Banner */}
        {showTrialBanner && (
          <div className="bg-primary/10 border border-primary/30 rounded-xl p-4 mb-4">
            <div className="flex items-center justify-center gap-2 text-primary mb-1">
              <Clock className="w-5 h-5" />
              <span className="font-semibold">{t("gate.trialActive")}</span>
            </div>
            <p className="text-sm text-muted-foreground">
              {t("gate.daysRemaining").replace("{days}", String(subscription.trialDaysRemaining))}
            </p>
          </div>
        )}

        {/* Logo */}
        <div className="mb-6">
          <img src={ambianLogo} alt="Ambian" className="h-14 w-auto mx-auto" />
        </div>

        {/* Message */}
        <div>
          <h1 className="text-2xl font-bold text-foreground mb-2">
            {showTrialBanner ? t("gate.titleTrial") : t("gate.title")}
          </h1>
          <p className="text-muted-foreground">
            {showTrialBanner ? t("gate.subtitleTrial") : t("gate.subtitle")}
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
              {t("gate.priceMonthly")}<span className="text-lg font-normal text-muted-foreground">{t("gate.perMonth")}</span>
            </p>
            <p className="text-sm text-muted-foreground">{t("gate.billedYearly")}</p>
            <p className="text-xs text-muted-foreground/70 mt-1">
              {t("gate.pricesExclVat")}
            </p>
          </div>

          <Button size="lg" className="w-full h-14 text-lg" onClick={() => navigate("/pricing")}>
            {showTrialBanner ? t("gate.viewPlans") : t("gate.startListening")}
          </Button>

          <p className="text-xs text-muted-foreground">
            {t("gate.noLicense")}
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
              {t("nav.profile")}
            </Button>
            {isAdmin && (
              <Button variant="ghost" size="sm" onClick={() => navigate("/admin")}>
                <Shield className="w-4 h-4 mr-1" />
                Admin
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={signOut}>
              {t("common.signOut")}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SubscriptionGate;
