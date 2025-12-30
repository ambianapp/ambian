import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import ambianLogo from "@/assets/ambian-logo-new.png";

const Terms = () => {
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
          <h1 className="text-3xl font-bold text-foreground mb-6">{t("terms.title")}</h1>
          
          <p className="text-muted-foreground mb-6">{t("terms.lastUpdated")}: 30.12.2025</p>

          {/* 1. Parties and Scope */}
          <section className="mb-8">
            <h2 className="text-xl font-semibold text-foreground mb-4">{t("terms.partiesTitle")}</h2>
            <p className="text-muted-foreground leading-relaxed">
              {t("terms.partiesContent")}
            </p>
          </section>

          {/* 2. Service Description */}
          <section className="mb-8">
            <h2 className="text-xl font-semibold text-foreground mb-4">{t("terms.serviceTitle")}</h2>
            <p className="text-muted-foreground leading-relaxed">
              {t("terms.serviceContent")}
            </p>
          </section>

          {/* 3. Subscription and Termination */}
          <section className="mb-8">
            <h2 className="text-xl font-semibold text-foreground mb-4">{t("terms.subscriptionTitle")}</h2>
            <div className="text-muted-foreground leading-relaxed space-y-4">
              <p>{t("terms.subscriptionStart")}</p>
              <p>{t("terms.subscriptionCancel")}</p>
              <p>{t("terms.subscriptionSuspend")}</p>
              <p>{t("terms.subscriptionLicenseEnd")}</p>
            </div>
          </section>

          {/* 4. Payments and Invoicing */}
          <section className="mb-8">
            <h2 className="text-xl font-semibold text-foreground mb-4">{t("terms.paymentTitle")}</h2>
            <div className="text-muted-foreground leading-relaxed space-y-4">
              <p>{t("terms.paymentPrices")}</p>
              <p>{t("terms.paymentMethods")}</p>
              <p>{t("terms.paymentLate")}</p>
              <p>{t("terms.paymentRefunds")}</p>
            </div>
          </section>

          {/* 5. License and Permitted Use */}
          <section className="mb-8">
            <h2 className="text-xl font-semibold text-foreground mb-4">{t("terms.licenseTitle")}</h2>
            <div className="text-muted-foreground leading-relaxed space-y-4">
              <p>{t("terms.licenseGrant")}</p>
              <p>{t("terms.licenseRestrictions")}</p>
              <p>{t("terms.licenseMisuse")}</p>
            </div>
          </section>

          {/* 6. Intellectual Property */}
          <section className="mb-8">
            <h2 className="text-xl font-semibold text-foreground mb-4">{t("terms.ipTitle")}</h2>
            <div className="text-muted-foreground leading-relaxed space-y-4">
              <p>{t("terms.ipOwnership")}</p>
              <p>{t("terms.ipModification")}</p>
            </div>
          </section>

          {/* 7. Service Availability */}
          <section className="mb-8">
            <h2 className="text-xl font-semibold text-foreground mb-4">{t("terms.availabilityTitle")}</h2>
            <p className="text-muted-foreground leading-relaxed">
              {t("terms.availabilityContent")}
            </p>
          </section>

          {/* 8. Limitation of Liability */}
          <section className="mb-8">
            <h2 className="text-xl font-semibold text-foreground mb-4">{t("terms.liabilityTitle")}</h2>
            <div className="text-muted-foreground leading-relaxed space-y-4">
              <p>{t("terms.liabilityMax")}</p>
              <p>{t("terms.liabilityExclude")}</p>
              <p>{t("terms.liabilityPreserve")}</p>
            </div>
          </section>

          {/* 9. Governing Law and Disputes */}
          <section className="mb-8">
            <h2 className="text-xl font-semibold text-foreground mb-4">{t("terms.governingTitle")}</h2>
            <p className="text-muted-foreground leading-relaxed">
              {t("terms.governingContent")}
            </p>
          </section>

          {/* 10. Changes to Terms */}
          <section className="mb-8">
            <h2 className="text-xl font-semibold text-foreground mb-4">{t("terms.changesTitle")}</h2>
            <p className="text-muted-foreground leading-relaxed">
              {t("terms.changesContent")}
            </p>
          </section>

          {/* Contact */}
          <section className="mb-8">
            <h2 className="text-xl font-semibold text-foreground mb-4">{t("terms.contactTitle")}</h2>
            <p className="text-muted-foreground leading-relaxed">
              {t("terms.contactContent")}
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

export default Terms;