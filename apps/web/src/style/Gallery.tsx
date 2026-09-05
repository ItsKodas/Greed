import { Swatches } from "./Swatches.js";
import { TextureTiles } from "./TextureTiles.js";
import { TypeSpecimen } from "./TypeSpecimen.js";
import "./gallery.css";

export function Gallery() {
  return (
    <main className="gallery">
      <h1 className="gallery__title">
        GRE<em>E</em>D
      </h1>
      <p className="gallery__deck">
        The design system, as running code. Every colour, typeface and surface below is what the
        game is built from — change a token and this page changes with it.
      </p>
      <Swatches />
      <TypeSpecimen />
      <TextureTiles />
    </main>
  );
}
