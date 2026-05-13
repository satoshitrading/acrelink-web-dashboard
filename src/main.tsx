import { createRoot } from "react-dom/client";
import { installTranslateSafeDom } from "./lib/translate-safe-dom";
import App from "./App.tsx";
import "./index.css";

installTranslateSafeDom();

createRoot(document.getElementById("root")!).render(<App />);
