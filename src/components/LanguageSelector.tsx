import { useLanguage } from "@/contexts/LanguageContext";
import { Language } from "@/lib/translations";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const languageFlags: Record<Language, string> = {
  en: "🇬🇧",
  sv: "🇸🇪",
  fi: "🇫🇮",
  de: "🇩🇪",
  fr: "🇫🇷",
};

const LanguageSelector = () => {
  const { language, setLanguage, languageNames, availableLanguages } = useLanguage();

  return (
    <Select value={language} onValueChange={(value) => setLanguage(value as Language)}>
      <SelectTrigger className="w-auto gap-2 bg-secondary/50 border-border/50 hover:bg-secondary/80 h-9 px-3">
        <span className="text-lg">{languageFlags[language]}</span>
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="bg-popover border-border z-50">
        {availableLanguages.map((lang) => (
          <SelectItem key={lang} value={lang} className="cursor-pointer">
            <div className="flex items-center gap-2">
              <span className="text-lg">{languageFlags[lang]}</span>
              <span>{languageNames[lang]}</span>
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};

export default LanguageSelector;
