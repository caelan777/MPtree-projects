import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
// The typefaces, bundled so they work without internet: Instrument Sans (with its
// narrow widths, for the big clocks), Instrument Serif and IBM Plex Mono.
import "@fontsource-variable/instrument-sans/standard.css";
import "@fontsource/instrument-serif/400.css";
import "@fontsource/instrument-serif/400-italic.css";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/600.css";
import "./index.css";
import "./home.css";
import App from "./App.tsx";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
