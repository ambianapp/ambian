import { useRef } from "react";
import { ChevronRight } from "lucide-react";
import PlaylistCard from "./PlaylistCard";
import SignedImage from "./SignedImage";
import { useLanguage } from "@/contexts/LanguageContext";
import type { Tables } from "@/integrations/supabase/types";

type DbPlaylist = Tables<"playlists">;

interface SelectedPlaylist {
  id: string;
  name: string;
  cover: string | null;
  description: string | null;
}

interface MobileHorizontalPlaylistSectionProps {
  title: string;
  playlists: DbPlaylist[];
  onPlaylistClick: (playlist: SelectedPlaylist) => void;
  onPlayPlaylist: (playlistId: string) => void;
  onShowAll?: () => void;
  accentColor?: string;
}

const MobileHorizontalPlaylistSection = ({
  title,
  playlists,
  onPlaylistClick,
  onPlayPlaylist,
  onShowAll,
  accentColor,
}: MobileHorizontalPlaylistSectionProps) => {
  const { t } = useLanguage();
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  return (
    <section className="animate-fade-in">
      {/* Section header */}
      <div className="flex items-center justify-between mb-3 px-4">
        <h2 
          className="text-base font-bold"
          style={accentColor ? { color: accentColor } : undefined}
        >
          {title}
        </h2>
        {onShowAll && (
          <button
            onClick={onShowAll}
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <span>{t("home.showAll")}</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Horizontally scrollable playlist row */}
      {playlists.length > 0 ? (
        <div 
          ref={scrollContainerRef}
          className="flex gap-3 overflow-x-auto pb-2 pl-6 pr-4 scrollbar-hide"
          style={{ scrollSnapType: 'x mandatory' }}
        >
          {playlists.map((playlist) => (
            <button
              key={playlist.id}
              onClick={() => onPlaylistClick({
                id: playlist.id,
                name: playlist.name,
                cover: playlist.cover_url,
                description: playlist.description,
              })}
              className="flex-shrink-0 w-28 text-left transition-transform active:scale-95"
              style={{ scrollSnapAlign: 'start' }}
            >
              <div className="relative aspect-square rounded-lg overflow-hidden mb-2 shadow-md">
                <SignedImage
                  src={playlist.cover_url || "/placeholder.svg"}
                  alt={playlist.name}
                  className="w-full h-full object-cover"
                />
              </div>
              <p className="text-xs font-medium text-foreground line-clamp-2 leading-tight">
                {playlist.name}
              </p>
            </button>
          ))}
        </div>
      ) : (
        <p className="text-muted-foreground text-sm px-4">{t("home.noPlaylists")}</p>
      )}
    </section>
  );
};

export default MobileHorizontalPlaylistSection;
