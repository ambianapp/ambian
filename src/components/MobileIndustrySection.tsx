import { Building2, Sparkles, Scissors, Dumbbell, UtensilsCrossed, ShoppingBag } from "lucide-react";
import SignedImage from "./SignedImage";
import { Skeleton } from "./ui/skeleton";
import { useIndustryCollections } from "@/hooks/useHomeData";
import { useLanguage } from "@/contexts/LanguageContext";

export interface IndustryCollection {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
  cover_url: string | null;
}

interface MobileIndustrySectionProps {
  onCollectionSelect: (collection: IndustryCollection, translatedName: string) => void;
}

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  Sparkles,
  Scissors,
  Dumbbell,
  UtensilsCrossed,
  ShoppingBag,
  Building2,
};

const MobileIndustrySection = ({ onCollectionSelect }: MobileIndustrySectionProps) => {
  const { t } = useLanguage();
  
  // Use React Query for cached data fetching
  const { data: collections = [], isLoading } = useIndustryCollections();

  const collectionTranslationKeys: Record<string, { name: string; desc: string }> = {
    "Spa & Wellness": { name: "industry.spaWellness", desc: "industry.spaWellnessDesc" },
    "Beauty Salon": { name: "industry.beautySalon", desc: "industry.beautySalonDesc" },
    "Gym & Fitness": { name: "industry.gymFitness", desc: "industry.gymFitnessDesc" },
    "Restaurant & Café": { name: "industry.restaurantCafe", desc: "industry.restaurantCafeDesc" },
    "Retail & Shopping": { name: "industry.retailShopping", desc: "industry.retailShoppingDesc" },
    "Hotel & Lobby": { name: "industry.hotelLobby", desc: "industry.hotelLobbyDesc" },
  };

  const getTranslatedName = (name: string) => {
    const keys = collectionTranslationKeys[name];
    return keys ? t(keys.name) : name;
  };

  const getIcon = (iconName: string | null) => {
    if (!iconName || !iconMap[iconName]) return Sparkles;
    return iconMap[iconName];
  };

  const handleCollectionClick = (collection: IndustryCollection) => {
    const translatedName = getTranslatedName(collection.name);
    onCollectionSelect(collection, translatedName);
  };

  // Skeleton loading state
  if (isLoading) {
    return (
      <section className="animate-fade-in">
        <div className="flex items-center justify-between mb-3 px-4">
          <h2 className="text-base font-bold text-foreground">
            {t("home.industryTitle")}
          </h2>
        </div>
        <div className="flex gap-3 overflow-x-auto pb-2 pr-4 scrollbar-hide ml-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="flex-shrink-0 w-28">
              <Skeleton className="aspect-square rounded-lg mb-2" />
              <Skeleton className="h-3 w-20" />
            </div>
          ))}
        </div>
      </section>
    );
  }

  return (
    <section className="animate-fade-in">
      <div className="flex items-center justify-between mb-3 px-4">
        <h2 className="text-base font-bold text-foreground">
          {t("home.industryTitle")}
        </h2>
      </div>

      {/* Horizontally scrollable industry collections */}
      {collections.length > 0 ? (
        <div 
          className="flex gap-3 overflow-x-auto pb-2 pr-4 scrollbar-hide ml-4"
          style={{ scrollSnapType: 'x mandatory' }}
        >
          {collections.map((collection, index) => {
            const Icon = getIcon(collection.icon);
            return (
              <button
                key={collection.id}
                onClick={() => handleCollectionClick(collection)}
                className="flex-shrink-0 w-28 text-left transition-transform active:scale-95"
                style={{ scrollSnapAlign: 'start' }}
              >
                <div className="relative aspect-square rounded-lg overflow-hidden mb-2 shadow-md bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center">
                  {collection.cover_url ? (
                    <SignedImage
                      src={collection.cover_url}
                      alt={getTranslatedName(collection.name)}
                      className="w-full h-full object-cover"
                      loading={index < 4 ? "eager" : "lazy"}
                      fetchPriority={index < 4 ? "high" : undefined}
                    />
                  ) : (
                    <Icon className="w-10 h-10 text-primary" />
                  )}
                </div>
                <p className="text-xs font-medium text-foreground line-clamp-2 leading-tight">
                  {getTranslatedName(collection.name)}
                </p>
              </button>
            );
          })}
        </div>
      ) : (
        <p className="text-muted-foreground text-sm px-4">{t("home.noPlaylists")}</p>
      )}
    </section>
  );
};

export default MobileIndustrySection;
