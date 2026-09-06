import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.js";
import "@greed/ui/tokens.css";
import "./global.css";
/*
 * Site-wide, not per page. It used to be imported by the game, which meant the
 * room and the profile rendered with no styles at all — the markup was there
 * and nothing could be seen.
 */
import "./game/game.css";

const container = document.getElementById("root");
if (container === null) {
  throw new Error("index.html is missing #root");
}

createRoot(container).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
