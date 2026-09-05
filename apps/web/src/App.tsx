import { Route, Routes } from "react-router-dom";
import { Play } from "./game/Play.js";
import { Gallery } from "./style/Gallery.js";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Play />} />
      <Route path="/style" element={<Gallery />} />
      <Route path="*" element={<p className="not-found">No such page.</p>} />
    </Routes>
  );
}
