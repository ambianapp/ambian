import { Genre } from "@/data/musicData";

interface GenreCardProps {
  genre: Genre;
  onClick: () => void;
}

const GenreCard = ({ genre, onClick }: GenreCardProps) => {
  return (
    <button
      onClick={onClick}
      className={`relative overflow-hidden rounded-xl h-32 w-full bg-gradient-to-br ${genre.color} transition-all duration-300 hover:scale-[1.02] hover:shadow-xl group`}
    >
      <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
      <img
        src={genre.cover}
        alt={genre.name}
        className="absolute right-0 bottom-0 w-24 h-24 object-cover rounded-lg transform rotate-12 translate-x-4 translate-y-4 shadow-xl group-hover:rotate-6 transition-transform duration-300"
      />
      <div className="absolute bottom-4 left-4">
        <h3 className="text-lg font-bold text-white">{genre.name}</h3>
      </div>
    </button>
  );
};

export default GenreCard;
