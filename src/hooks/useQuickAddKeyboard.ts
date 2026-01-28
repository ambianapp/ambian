import { useEffect } from "react";
import { useQuickAdd } from "@/contexts/QuickAddContext";
import { usePlayer } from "@/contexts/PlayerContext";

export const useQuickAddKeyboard = () => {
  const { isQuickAddMode, quickAddTrack } = useQuickAdd();
  const { currentTrack, handleNext, handlePrevious } = usePlayer();

  useEffect(() => {
    if (!isQuickAddMode) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if user is typing in an input field
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      ) {
        return;
      }

      switch (e.key.toLowerCase()) {
        case "enter":
          // Add current track to playlist
          if (currentTrack) {
            e.preventDefault();
            quickAddTrack(currentTrack.id, currentTrack.title);
          }
          break;
        case "z":
          // Next song
          e.preventDefault();
          handleNext();
          break;
        case "a":
          // Previous song
          e.preventDefault();
          handlePrevious();
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isQuickAddMode, currentTrack, quickAddTrack, handleNext, handlePrevious]);
};
