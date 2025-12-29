import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/contexts/LanguageContext";
import ambianLogo from "@/assets/ambian-logo-new.png";

const Landing = () => {
  const { t } = useLanguage();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="mx-auto w-full max-w-6xl px-4 sm:px-6 pt-10 sm:pt-14">
        <nav className="flex items-center justify-between gap-4">
          <Link to="/" className="flex items-center gap-3">
            <img
              src={ambianLogo}
              alt="Ambian Music logo"
              className="h-10 w-auto"
              loading="eager"
              decoding="async"
            />
            <span className="text-sm font-semibold tracking-wide text-foreground">
              Ambian Music
            </span>
          </Link>

          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => navigate("/auth")}>
              {t("auth.signIn")}
            </Button>
            <Button size="sm" onClick={() => navigate("/auth")}>
              {t("auth.signUp")}
            </Button>
          </div>
        </nav>
      </header>

      <main className="mx-auto w-full max-w-6xl px-4 sm:px-6 pb-10">
        <section className="pt-10 sm:pt-14">
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold leading-tight">
            Ambian Music
          </h1>
          <p className="mt-3 text-base sm:text-lg text-muted-foreground max-w-2xl">
            {t("home.subtitle")}
          </p>

          <div className="mt-8 flex flex-col sm:flex-row gap-3">
            <Button size="lg" onClick={() => navigate("/auth")}>
              {t("auth.startFreeTrial")}
            </Button>
            <Button variant="outline" size="lg" onClick={() => navigate("/auth")}>
              {t("auth.signIn")}
            </Button>
          </div>
        </section>

        <footer className="mt-16 border-t border-border/60 pt-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-xs text-muted-foreground">
            <div className="space-x-3">
              <Link to="/terms" className="hover:text-primary hover:underline">
                {t("footer.termsAndConditions")}
              </Link>
              <span aria-hidden="true">•</span>
              <Link to="/privacy" className="hover:text-primary hover:underline">
                {t("footer.privacyPolicy")}
              </Link>
            </div>
            <div>© {new Date().getFullYear()} Ambian Music</div>
          </div>
        </footer>
      </main>
    </div>
  );
};

export default Landing;
