import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { AlertCircle, CreditCard, ExternalLink, Loader2, User } from "lucide-react";
import ambianLogo from "@/assets/ambian-logo-new.png";
import LanguageSelector from "@/components/LanguageSelector";

interface Invoice {
  id: string;
  number: string;
  amount: number;
  currency: string;
  date: number;
  status: string;
  dueDate: number | null;
  pdfUrl: string | null;
  hostedUrl: string | null;
  label?: string;
}

const InvoiceDueGate = () => {
  const { user, signOut } = useAuth();
  const { t } = useLanguage();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadInvoices = async () => {
      if (!user) return;
      
      try {
        const { data, error } = await supabase.functions.invoke("get-invoices");
        if (error) throw error;
        
        // Filter to only show open/unpaid invoices
        const unpaidInvoices = (data?.invoices || []).filter(
          (inv: Invoice) => inv.status === "open" || inv.status === "draft"
        );
        setInvoices(unpaidInvoices);
      } catch (error) {
        console.error("Failed to load invoices:", error);
      } finally {
        setIsLoading(false);
      }
    };

    loadInvoices();
  }, [user]);

  const formatCurrency = (amount: number, currency: string) => {
    return new Intl.NumberFormat("fi-FI", {
      style: "currency",
      currency: currency.toUpperCase(),
    }).format(amount / 100);
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp * 1000).toLocaleDateString("fi-FI");
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
      <div className="max-w-md w-full text-center space-y-6 animate-fade-in">
        {/* Logo */}
        <div className="mb-4">
          <img src={ambianLogo} alt="Ambian" className="h-14 w-auto mx-auto" />
        </div>

        {/* Alert Banner */}
        <div className="bg-destructive/10 border border-destructive/30 rounded-xl p-5">
          <div className="flex items-center justify-center gap-2 text-destructive mb-2">
            <AlertCircle className="w-6 h-6" />
            <span className="font-bold text-lg">{t("invoiceDue.title")}</span>
          </div>
          <p className="text-muted-foreground text-sm mb-3">
            {t("invoiceDue.description")}
          </p>
          <div className="bg-background/50 rounded-lg p-3 text-left space-y-1">
            <p className="text-sm font-medium text-foreground flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-primary" />
              {t("invoiceDue.tipTitle")}
            </p>
            <p className="text-xs text-muted-foreground pl-6">
              {t("invoiceDue.tipDescription")}
            </p>
          </div>
        </div>

        {/* Unpaid Invoices List */}
        <div className="space-y-3">
          {isLoading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : invoices.length > 0 ? (
            <>
              <h3 className="text-sm font-medium text-muted-foreground">
                {t("invoiceDue.unpaidInvoices")}
              </h3>
              {invoices.map((invoice) => (
                <div
                  key={invoice.id}
                  className="bg-card border border-border rounded-lg p-4 text-left"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium text-foreground">
                      {invoice.label || invoice.number || t("profile.invoice")}
                    </span>
                    <span className="text-lg font-bold text-foreground">
                      {formatCurrency(invoice.amount, invoice.currency)}
                    </span>
                  </div>
                  {invoice.dueDate && (
                    <p className="text-xs text-destructive mb-3">
                      {t("invoiceDue.dueOn")} {formatDate(invoice.dueDate)}
                    </p>
                  )}
                  {invoice.hostedUrl && (
                    <Button
                      size="sm"
                      className="w-full gap-2"
                      onClick={() => window.open(invoice.hostedUrl!, "_blank")}
                    >
                      <CreditCard className="w-4 h-4" />
                      {t("invoiceDue.payInvoice")}
                      <ExternalLink className="w-3 h-3" />
                    </Button>
                  )}
                </div>
              ))}
            </>
          ) : (
            <p className="text-sm text-muted-foreground py-4">
              {t("invoiceDue.noInvoicesFound")}
            </p>
          )}
        </div>


        {/* Hint */}
        <p className="text-xs text-muted-foreground">
          {t("invoiceDue.hint")}
        </p>

        {/* User info */}
        <div className="pt-4 border-t border-border space-y-3">
          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <User className="w-4 h-4" />
            <span>{user?.email}</span>
          </div>
          
          <div className="flex items-center justify-center gap-2">
            <LanguageSelector />
            <Button variant="ghost" size="sm" onClick={signOut}>
              {t("common.signOut")}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default InvoiceDueGate;
