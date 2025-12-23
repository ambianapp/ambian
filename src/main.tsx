import { createRoot } from "react-dom/client";
import { Buffer } from "buffer";
import App from "./App.tsx";
import "./index.css";
import { registerSW } from "virtual:pwa-register";

// music-metadata-browser expects Buffer to exist in the browser runtime
(globalThis as any).Buffer = Buffer;

// Register service worker and prompt when a new version is available (avoid auto-refresh that resets scroll/state).
let updateSW: ((reloadPage?: boolean) => Promise<void>) | undefined;
updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    // Don't auto-reload on tab focus; it feels like the app "refreshes".
    // Users can refresh manually when convenient.
    console.info("New version available. Refresh the page to update.");
  },
});

createRoot(document.getElementById("root")!).render(<App />);

