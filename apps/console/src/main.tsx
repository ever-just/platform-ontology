import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@blueprintjs/core/lib/css/blueprint.css";
import "./styles.css";
import { App } from "./App";
import { applyLook } from "./ui/look";

applyLook();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
