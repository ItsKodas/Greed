import { card, felt, glass, plaster, vignette } from "@greed/ui";

interface Tile {
  id: string;
  name: string;
  note: string;
  background: string;
}

const tiles: Tile[] = [
  { id: "plaster", name: "plaster", note: "seed 1", background: plaster({ seed: 1 }) },
  { id: "plaster-alt", name: "plaster", note: "seed 2", background: plaster({ seed: 2 }) },
  { id: "felt", name: "felt", note: "seed 1", background: felt({ seed: 1 }) },
  { id: "glass", name: "glass", note: "lit", background: glass({ seed: 1 }) },
  { id: "card", name: "card", note: "seed 1", background: card({ seed: 1 }) },
  {
    id: "vignette",
    name: "vignette",
    note: "over plaster",
    background: `${vignette()}, ${plaster({ seed: 4 })}`,
  },
];

export function TextureTiles() {
  return (
    <section className="section" aria-label="Textures">
      <h2 className="section__title">Textures</h2>
      <div className="tiles">
        {tiles.map((tile) => (
          <div key={tile.id}>
            <div
              className="tile__surface"
              data-testid={`texture-${tile.id}`}
              style={{ backgroundImage: tile.background }}
            />
            <span className="tile__name">{tile.name}</span>
            <span className="tile__note">{tile.note}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
