import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { initPreferences } from "./lib/preferences";

initPreferences();
createRoot(document.getElementById("root")!).render(<App />);
