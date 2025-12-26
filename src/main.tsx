import { createRoot } from "react-dom/client";
import { Buffer } from "buffer";
import App from "./App.tsx";
import "./index.css";
import { registerSW } from "virtual:pwa-register";

// music-metadata-browser expects Buffer to exist in the browser runtime
(globalThis as any).Buffer = Buffer;

// Store update function globally so we can call it when safe (e.g., when not playing music)
let pendingUpdate: (() => Promise<void>) | null = null;

// Register service worker with "prompt" mode - never auto-refresh while music may be playing
registerSW({
  immediate: true,
  onNeedRefresh() {
    // Store the update function but don't execute it immediately
    // This prevents interruption of music playback
    console.info("[PWA] New version available. Update will apply on next manual page load.");
    
    // Check if audio is playing - if not, we could potentially auto-update
    // But to be safe, we always defer to avoid any playback interruption
    pendingUpdate = () => Promise.resolve();
  },
  onOfflineReady() {
    console.info("[PWA] App ready to work offline.");
  },
});

// Expose a way to check if an update is pending (for future use in UI)
(globalThis as any).__ambianPendingUpdate = () => pendingUpdate !== null;

createRoot(document.getElementById("root")!).render(<App />);

