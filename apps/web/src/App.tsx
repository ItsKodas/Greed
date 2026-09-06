import { Route, Routes } from "react-router-dom";
import { Play } from "./game/Play.js";
import { Profile } from "./profile/Profile.js";
import { Room } from "./room/Room.js";
import { TableLink } from "./room/TableLink.js";
import { Gallery } from "./style/Gallery.js";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Room />} />
      {/*
        * Static segments are declared before the dynamic one. React-router
        * ranks a literal above a parameter anyway, but the order says the
        * intent out loud: /style is a page, not a five-letter table code.
        */}
      <Route path="/me" element={<Profile />} />
      <Route path="/style" element={<Gallery />} />
      <Route path="/greed" element={<Play />} />
      <Route path="/greed/:code" element={<Play />} />
      {/*
        * A bare code at the root, so a link that was shared before there were
        * several games still works and no share link ever has to name one.
        */}
      <Route path="/:code" element={<TableLink />} />
      <Route path="*" element={<p className="not-found">No such page.</p>} />
    </Routes>
  );
}
