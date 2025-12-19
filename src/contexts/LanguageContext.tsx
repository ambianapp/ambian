import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { Language, translations, languageNames } from "@/lib/translations";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => Promise<void>;
  t: (key: string, replacements?: Record<string, string | number>) => string;
  languageNames: Record<Language, string>;
  availableLanguages: Language[];
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

const STORAGE_KEY = "ambian_language";

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [language, setLanguageState] = useState<Language>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && ["en", "sv", "fi", "de", "fr"].includes(stored)) {
      return stored as Language;
    }
    // Try to detect browser language
    const browserLang = navigator.language.split("-")[0];
    if (["en", "sv", "fi", "de", "fr"].includes(browserLang)) {
      return browserLang as Language;
    }
    return "en";
  });

  // Load language preference from profile when user logs in
  useEffect(() => {
    const loadLanguageFromProfile = async () => {
      if (!user) return;
      
      try {
        const { data } = await supabase
          .from("profiles")
          .select("language")
          .eq("user_id", user.id)
          .maybeSingle();
        
        if (data?.language && ["en", "sv", "fi", "de", "fr"].includes(data.language)) {
          setLanguageState(data.language as Language);
          localStorage.setItem(STORAGE_KEY, data.language);
        }
      } catch (error) {
        console.error("Failed to load language preference:", error);
      }
    };

    loadLanguageFromProfile();
  }, [user]);

  const setLanguage = useCallback(async (lang: Language) => {
    setLanguageState(lang);
    localStorage.setItem(STORAGE_KEY, lang);
    
    // Save to profile if user is logged in
    if (user) {
      try {
        await supabase
          .from("profiles")
          .update({ language: lang })
          .eq("user_id", user.id);
      } catch (error) {
        console.error("Failed to save language preference:", error);
      }
    }
  }, [user]);

  const t = useCallback((key: string, replacements?: Record<string, string | number>): string => {
    let text = translations[language][key] || translations.en[key] || key;
    
    if (replacements) {
      Object.entries(replacements).forEach(([k, v]) => {
        text = text.replace(`{${k}}`, String(v));
      });
    }
    
    return text;
  }, [language]);

  const availableLanguages: Language[] = ["en", "sv", "fi", "de", "fr"];

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t, languageNames, availableLanguages }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error("useLanguage must be used within a LanguageProvider");
  }
  return context;
};
