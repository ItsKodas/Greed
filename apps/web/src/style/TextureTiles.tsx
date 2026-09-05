import { brass, felt, leather, paper, vignette, wood } from "@greed/ui";

interface Tile {
  id: string;
  name: string;
  note: string;
  background: string;
}

const tiles: Tile[] = [
  { id: "wood", name: "wood", note: "seed 1", background: wood({ seed: 1 }) },
  { id: "wood-alt", name: "wood", note: "seed 2", background: wood({ seed: 2 }) },
  { id: "felt", name: "felt", note: "seed 1", background: felt({ seed: 1 }) },
  { id: "leather", name: "leather", note: "seed 1", background: leather({ seed: 1 }) },
  { id: "brass", name: "brass", note: "seed 1", background: brass({ seed: 1 }) },
  { id: "paper", name: "paper", note: "seed 1", background: paper({ seed: 1 }) },
  { id: "vignette", name: "vignette", note: "over wood", background: `${vignette()}, ${wood({ seed: 4 })}` },
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
