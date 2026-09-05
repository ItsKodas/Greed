import { Route, Routes } from "react-router-dom";
import { Play } from "./game/Play.js";
import { Gallery } from "./style/Gallery.js";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Play />} />
      {/* Declared before the code route; react-router ranks a static segment
          above a dynamic one, so /style can never be read as a table code. */}
      <Route path="/style" element={<Gallery />} />
      <Route path="/:code" element={<Play />} />
      <Route path="*" element={<p className="not-found">No such page.</p>} />
    </Routes>
  );
}
