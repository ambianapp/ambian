import { createRoot } from "react-dom/client";
import { Buffer } from "buffer";
import App from "./App.tsx";
import "./index.css";
import { registerSW } from "virtual:pwa-register";

// music-metadata-browser expects Buffer to exist in the browser runtime
(globalThis as any).Buffer = Buffer;

// Register service worker for PWA installability (required for install prompt)
registerSW({ immediate: true });

createRoot(document.getElementById("root")!).render(<App />);

