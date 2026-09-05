import { color } from "@greed/ui";

export function Swatches() {
  return (
    <section className="section" aria-label="Palette">
      <h2 className="section__title">Palette</h2>
      <div className="swatches">
        {Object.entries(color).map(([name, hex]) => (
          <div key={name}>
            <div className="swatch__chip" style={{ background: hex }} />
            <span className="swatch__name">{name}</span>
            <span className="swatch__hex">{hex}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
