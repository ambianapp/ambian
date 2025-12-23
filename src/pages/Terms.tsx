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
          
          <p className="text-muted-foreground mb-6">{t("terms.lastUpdated")}: 23.12.2024</p>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-foreground mb-4">{t("terms.section1Title")}</h2>
            <p className="text-muted-foreground leading-relaxed">
              {t("terms.section1Content")}
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-foreground mb-4">{t("terms.section2Title")}</h2>
            <p className="text-muted-foreground leading-relaxed">
              {t("terms.section2Content")}
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-foreground mb-4">{t("terms.section3Title")}</h2>
            <p className="text-muted-foreground leading-relaxed">
              {t("terms.section3Content")}
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-foreground mb-4">{t("terms.section4Title")}</h2>
            <p className="text-muted-foreground leading-relaxed">
              {t("terms.section4Content")}
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-foreground mb-4">{t("terms.section5Title")}</h2>
            <p className="text-muted-foreground leading-relaxed">
              {t("terms.section5Content")}
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-foreground mb-4">{t("terms.section6Title")}</h2>
            <p className="text-muted-foreground leading-relaxed">
              {t("terms.section6Content")}
            </p>
          </section>

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