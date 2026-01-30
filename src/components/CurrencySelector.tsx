import { useCurrency } from "@/contexts/CurrencyContext";
import { Currency } from "@/lib/pricing";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { ChevronDown } from "lucide-react";

const CURRENCY_OPTIONS: { value: Currency; label: string; flag: string }[] = [
  { value: "EUR", label: "EUR (€)", flag: "🇪🇺" },
  { value: "USD", label: "USD ($)", flag: "🇺🇸" },
  { value: "GBP", label: "GBP (£)", flag: "🇬🇧" },
  { value: "SEK", label: "SEK (kr)", flag: "🇸🇪" },
  { value: "NOK", label: "NOK (kr)", flag: "🇳🇴" },
];

const CurrencySelector = () => {
  const { currency, setCurrency } = useCurrency();

  const currentOption = CURRENCY_OPTIONS.find((opt) => opt.value === currency) || CURRENCY_OPTIONS[0];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5 text-muted-foreground hover:text-foreground"
        >
          <span className="text-base">{currentOption.flag}</span>
          <span className="text-sm">{currentOption.value}</span>
          <ChevronDown className="w-3.5 h-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent 
        align="end" 
        className="z-50 min-w-[140px] bg-popover border border-border shadow-lg"
      >
        {CURRENCY_OPTIONS.map((option) => (
          <DropdownMenuItem
            key={option.value}
            onClick={() => setCurrency(option.value)}
            className={`flex items-center gap-2 cursor-pointer ${
              currency === option.value ? "bg-accent" : ""
            }`}
          >
            <span className="text-base">{option.flag}</span>
            <span className="text-sm">{option.label}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default CurrencySelector;
