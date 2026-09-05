import { Navigate, Route, Routes } from "react-router-dom";
import { Gallery } from "./style/Gallery.js";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/style" replace />} />
      <Route path="/style" element={<Gallery />} />
      <Route path="*" element={<p style={{ padding: 32 }}>No such page.</p>} />
    </Routes>
  );
}
