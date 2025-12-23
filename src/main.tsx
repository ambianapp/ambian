import { createRoot } from "react-dom/client";
import { Buffer } from "buffer";
import App from "./App.tsx";
import "./index.css";
import { registerSW } from "virtual:pwa-register";

// music-metadata-browser expects Buffer to exist in the browser runtime
(globalThis as any).Buffer = Buffer;

// Register service worker and auto-refresh when a new version is available.
let updateSW: ((reloadPage?: boolean) => Promise<void>) | undefined;
updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    // Activate the new service worker and reload so updated assets (like logos) are used.
    updateSW?.(true);
  },
});

createRoot(document.getElementById("root")!).render(<App />);

