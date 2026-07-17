import { createRoot } from "react-dom/client";
import "@fontsource-variable/jetbrains-mono/index.css";
import { App } from "./App";
import "./theme.css";

createRoot(document.getElementById("root")!).render(<App />);
