import { useRef } from "react";
import { ChevronLeft, ChevronRight, ChevronRight as ShowAllIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import PlaylistCard from "./PlaylistCard";
import { useLanguage } from "@/contexts/LanguageContext";
import type { Tables } from "@/integrations/supabase/types";

type DbPlaylist = Tables<"playlists">;

interface SelectedPlaylist {
  id: string;
  name: string;
  cover: string | null;
  description: string | null;
}

interface HorizontalPlaylistSectionProps {
  title: string;
  playlists: DbPlaylist[];
  onPlaylistClick: (playlist: SelectedPlaylist) => void;
  onPlayPlaylist: (playlistId: string) => void;
  onPlaylistUpdate: (id: string, data: { name: string; description: string; cover: string }) => void;
  onShowAll?: () => void;
}

const HorizontalPlaylistSection = ({
  title,
  playlists,
  onPlaylistClick,
  onPlayPlaylist,
  onPlaylistUpdate,
  onShowAll,
}: HorizontalPlaylistSectionProps) => {
  const { t } = useLanguage();
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const scrollLeft = () => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollBy({ left: -300, behavior: 'smooth' });
    }
  };

  const scrollRight = () => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollBy({ left: 300, behavior: 'smooth' });
    }
  };

  return (
    <section className="group/section animate-fade-in bg-secondary/30 rounded-2xl p-4 sm:p-5 border border-border/50 overflow-hidden">
      <div className="flex items-center justify-between gap-2 mb-4">
        <h2 className="text-lg sm:text-xl font-bold text-foreground truncate">{title}</h2>
        <div className="flex items-center gap-1">
          {onShowAll && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onShowAll}
              className="text-muted-foreground hover:text-foreground mr-1"
            >
              <span className="text-sm">{t("home.showAll")}</span>
            </Button>
          )}
          {playlists.length > 6 && (
            <>
              <Button
                variant="ghost"
                size="icon"
                onClick={scrollLeft}
                className="h-8 w-8 text-muted-foreground hover:text-foreground"
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={scrollRight}
                className="h-8 w-8 text-muted-foreground hover:text-foreground"
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </>
          )}
        </div>
      </div>
      {playlists.length > 0 ? (
        <div 
          ref={scrollContainerRef}
          className="flex gap-3 overflow-x-auto pb-2 scrollbar-on-section-hover"
        >
          {playlists.map((playlist) => (
            <div key={playlist.id} className="flex-shrink-0 w-32 sm:w-36 md:w-40">
              <PlaylistCard
                playlist={{
                  id: playlist.id,
                  name: playlist.name,
                  description: playlist.description || "",
                  cover: playlist.cover_url || "/placeholder.svg",
                  trackCount: 0,
                  tracks: [],
                }}
                onClick={() => onPlaylistClick({
                  id: playlist.id,
                  name: playlist.name,
                  cover: playlist.cover_url,
                  description: playlist.description,
                })}
                onPlay={() => onPlayPlaylist(playlist.id)}
                onUpdate={onPlaylistUpdate}
                compact
              />
            </div>
          ))}
        </div>
      ) : (
        <p className="text-muted-foreground">No playlists yet. Create one in the admin panel.</p>
      )}
    </section>
  );
};

export default HorizontalPlaylistSection;
