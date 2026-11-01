// Client-only entry for the static, single-bundle build (scripts/build-artifact.mjs).
import "@fontsource/lalezar/400.css";
import "@fontsource/ibm-plex-sans-arabic/400.css";
import "@fontsource/ibm-plex-sans-arabic/600.css";
import "../app/globals.css";
import { createRoot } from "react-dom/client";
import App from "../ui/App";

document.documentElement.lang = "ar";
document.documentElement.dir = "rtl";
createRoot(document.getElementById("cj-root")!).render(<App />);
