import { Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Playlist } from "@/data/musicData";

interface PlaylistCardProps {
  playlist: Playlist;
  onClick: () => void;
}

const PlaylistCard = ({ playlist, onClick }: PlaylistCardProps) => {
  return (
    <button
      onClick={onClick}
      className="group p-4 rounded-xl bg-card/50 hover:bg-card transition-all duration-300 text-left"
    >
      <div className="relative mb-4">
        <img
          src={playlist.cover}
          alt={playlist.name}
          className="w-full aspect-square object-cover rounded-lg shadow-lg group-hover:shadow-xl transition-shadow"
        />
        <Button
          variant="player"
          size="iconLg"
          className="absolute bottom-2 right-2 opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-300 shadow-2xl"
          onClick={(e) => {
            e.stopPropagation();
            onClick();
          }}
        >
          <Play className="w-6 h-6 ml-0.5" />
        </Button>
      </div>
      <h3 className="font-semibold text-foreground truncate">{playlist.name}</h3>
      <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{playlist.description}</p>
    </button>
  );
};

export default PlaylistCard;
