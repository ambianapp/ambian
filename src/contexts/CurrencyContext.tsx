import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { 
  Currency, 
  detectCurrency, 
  getPriceId, 
  getDisplayPrice, 
  getYearlySavings,
  getCurrencySymbol,
  getMonthlyEquivalent,
  formatPrice,
  PRICE_IDS,
  DISPLAY_PRICES,
} from "@/lib/pricing";

interface CurrencyContextType {
  currency: Currency;
  setCurrency: (currency: Currency) => void;
  symbol: string;
  // Price getters
  getPriceId: (type: "subscription" | "prepaid" | "deviceSlot", plan: "monthly" | "yearly") => string;
  getPrice: (type: "subscription" | "prepaid" | "deviceSlot", plan: "monthly" | "yearly") => { amount: number; formatted: string };
  getYearlySavings: () => { formatted: string; amount: number };
  getMonthlyEquivalent: () => string;
  formatPrice: (amount: number) => string;
}

const CurrencyContext = createContext<CurrencyContextType | undefined>(undefined);

export function CurrencyProvider({ children }: { children: ReactNode }) {
  const [currency, setCurrencyState] = useState<Currency>(() => detectCurrency());

  // Only persist currency when user explicitly chooses via UI selector
  // This prevents auto-detection from caching and overriding future browser settings
  const setCurrency = (newCurrency: Currency) => {
    setCurrencyState(newCurrency);
    localStorage.setItem("ambian_currency", newCurrency);
    localStorage.setItem("ambian_currency_explicit", "true"); // Mark as user choice
  };

  // Re-detect on mount - always use fresh browser settings unless user explicitly chose
  useEffect(() => {
    const isExplicitChoice = localStorage.getItem("ambian_currency_explicit") === "true";
    if (!isExplicitChoice) {
      const detected = detectCurrency();
      setCurrencyState(detected);
    } else {
      // User explicitly chose - use their saved preference
      const saved = localStorage.getItem("ambian_currency") as Currency;
      if (saved === "EUR" || saved === "USD") {
        setCurrencyState(saved);
      }
    }
  }, []);

  const value: CurrencyContextType = {
    currency,
    setCurrency,
    symbol: getCurrencySymbol(currency),
    getPriceId: (type, plan) => getPriceId(type, plan, currency),
    getPrice: (type, plan) => getDisplayPrice(type, plan, currency),
    getYearlySavings: () => getYearlySavings(currency),
    getMonthlyEquivalent: () => getMonthlyEquivalent(currency),
    formatPrice: (amount) => formatPrice(amount, currency),
  };

  return (
    <CurrencyContext.Provider value={value}>
      {children}
    </CurrencyContext.Provider>
  );
}

export function useCurrency() {
  const context = useContext(CurrencyContext);
  if (context === undefined) {
    throw new Error("useCurrency must be used within a CurrencyProvider");
  }
  return context;
}
