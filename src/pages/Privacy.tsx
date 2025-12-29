import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import ambianLogo from "@/assets/ambian-logo-new.png";

const Privacy = () => {
  const navigate = useNavigate();
  const { t } = useLanguage();

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto p-6 pb-32 md:p-8 md:pb-40">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <img src={ambianLogo} alt="Ambian" className="h-8" />
        </div>

        <div className="prose prose-invert max-w-none">
          <h1 className="text-3xl font-bold text-foreground mb-6">{t("privacy.title")}</h1>
          
          <p className="text-muted-foreground mb-6">{t("privacy.lastUpdated")}: 29.12.2025</p>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-foreground mb-4">{t("privacy.introTitle")}</h2>
            <p className="text-muted-foreground leading-relaxed">
              {t("privacy.introContent")}
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-foreground mb-4">{t("privacy.dataCollectionTitle")}</h2>
            <p className="text-muted-foreground leading-relaxed mb-4">
              {t("privacy.dataCollectionIntro")}
            </p>
            <ul className="list-disc list-inside text-muted-foreground space-y-2">
              <li>{t("privacy.dataEmail")}</li>
              <li>{t("privacy.dataName")}</li>
              <li>{t("privacy.dataUsage")}</li>
              <li>{t("privacy.dataDevice")}</li>
              <li>{t("privacy.dataPayment")}</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-foreground mb-4">{t("privacy.dataUseTitle")}</h2>
            <p className="text-muted-foreground leading-relaxed mb-4">
              {t("privacy.dataUseIntro")}
            </p>
            <ul className="list-disc list-inside text-muted-foreground space-y-2">
              <li>{t("privacy.useProvide")}</li>
              <li>{t("privacy.usePayments")}</li>
              <li>{t("privacy.useImprove")}</li>
              <li>{t("privacy.useCommunicate")}</li>
              <li>{t("privacy.useLegal")}</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-foreground mb-4">{t("privacy.thirdPartyTitle")}</h2>
            <p className="text-muted-foreground leading-relaxed mb-4">
              {t("privacy.thirdPartyIntro")}
            </p>
            <ul className="list-disc list-inside text-muted-foreground space-y-2">
              <li><strong>Stripe</strong> – {t("privacy.thirdPartyStripe")}</li>
              <li><strong>Google</strong> – {t("privacy.thirdPartyGoogle")}</li>
              <li><strong>Supabase</strong> – {t("privacy.thirdPartySupabase")}</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-foreground mb-4">{t("privacy.gdprTitle")}</h2>
            <p className="text-muted-foreground leading-relaxed mb-4">
              {t("privacy.gdprIntro")}
            </p>
            <ul className="list-disc list-inside text-muted-foreground space-y-2">
              <li>{t("privacy.gdprAccess")}</li>
              <li>{t("privacy.gdprRectify")}</li>
              <li>{t("privacy.gdprErase")}</li>
              <li>{t("privacy.gdprRestrict")}</li>
              <li>{t("privacy.gdprPortability")}</li>
              <li>{t("privacy.gdprObject")}</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-foreground mb-4">{t("privacy.securityTitle")}</h2>
            <p className="text-muted-foreground leading-relaxed">
              {t("privacy.securityContent")}
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-foreground mb-4">{t("privacy.cookiesTitle")}</h2>
            <p className="text-muted-foreground leading-relaxed">
              {t("privacy.cookiesContent")}
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-foreground mb-4">{t("privacy.changesTitle")}</h2>
            <p className="text-muted-foreground leading-relaxed">
              {t("privacy.changesContent")}
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-foreground mb-4">{t("privacy.contactTitle")}</h2>
            <p className="text-muted-foreground leading-relaxed">
              {t("privacy.contactContent")}
            </p>
            <p className="text-muted-foreground mt-2">
              <a href="mailto:info@ambian.fi" className="text-primary hover:underline">
                info@ambian.fi
              </a>
            </p>
          </section>
        </div>
      </div>
    </div>
  );
};

export default Privacy;
