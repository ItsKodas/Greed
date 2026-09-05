import { font } from "@greed/ui";

const specimens = [
  {
    family: font.display,
    size: "2.2rem",
    sample: "Hot dice",
    label: "Bevan — wordmark and screen titles",
  },
  {
    family: font.ui,
    size: "1.05rem",
    sample: "Bank 1,450 and pass the cup",
    label: "IBM Plex Sans — everything you read",
  },
  {
    family: font.data,
    size: "1.05rem",
    sample: "K7WQ3 · 2.31% · 10,000",
    label: "IBM Plex Mono — codes, scores, odds",
  },
];

export function TypeSpecimen() {
  return (
    <section className="section" aria-label="Type">
      <h2 className="section__title">Type</h2>
      {specimens.map((spec) => (
        <div className="specimen" key={spec.label}>
          <p
            className="specimen__sample"
            style={{ fontFamily: spec.family, fontSize: spec.size, lineHeight: 1.2 }}
          >
            {spec.sample}
          </p>
          <p className="specimen__label">{spec.label}</p>
        </div>
      ))}
    </section>
  );
}
