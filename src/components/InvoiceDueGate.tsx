import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { Button } from "@/components/ui/button";
import { AlertCircle, FileText, User } from "lucide-react";
import ambianLogo from "@/assets/ambian-logo-new.png";

const InvoiceDueGate = () => {
  const { user, signOut } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
      <div className="max-w-md w-full text-center space-y-8 animate-fade-in">
        {/* Logo */}
        <div className="mb-6">
          <img src={ambianLogo} alt="Ambian" className="h-14 w-auto mx-auto" />
        </div>

        {/* Alert Banner */}
        <div className="bg-destructive/10 border border-destructive/30 rounded-xl p-6">
          <div className="flex items-center justify-center gap-2 text-destructive mb-3">
            <AlertCircle className="w-6 h-6" />
            <span className="font-bold text-lg">{t("invoiceDue.title")}</span>
          </div>
          <p className="text-muted-foreground">
            {t("invoiceDue.description")}
          </p>
        </div>

        {/* CTA Button */}
        <div className="space-y-4">
          <Button 
            size="lg" 
            className="w-full h-14 text-lg gap-2" 
            onClick={() => navigate("/profile", { state: { tab: "billing" } })}
          >
            <FileText className="w-5 h-5" />
            {t("invoiceDue.payNow")}
          </Button>
          
          <p className="text-sm text-muted-foreground">
            {t("invoiceDue.hint")}
          </p>
        </div>

        {/* User info */}
        <div className="pt-4 border-t border-border space-y-3">
          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <User className="w-4 h-4" />
            <span>{user?.email}</span>
          </div>
          
          <Button variant="ghost" size="sm" onClick={signOut}>
            {t("common.signOut")}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default InvoiceDueGate;
