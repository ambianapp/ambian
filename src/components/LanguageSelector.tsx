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
      <SelectTrigger className="w-auto border-none bg-transparent hover:bg-secondary/50 h-9 px-2 gap-1 [&>svg]:opacity-70">
        <span className="text-lg">{languageFlags[language]}</span>
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
