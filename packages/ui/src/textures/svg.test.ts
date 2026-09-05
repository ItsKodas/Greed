import { describe, expect, it } from "vitest";
import { encodeSvg, svgDataUri, turbulence } from "./svg.js";

describe("encodeSvg", () => {
  it("percent-encodes the characters that would break a CSS url()", () => {
    const encoded = encodeSvg("<svg id='a#b'></svg>");
    expect(encoded).not.toContain("<");
    expect(encoded).not.toContain(">");
    expect(encoded).not.toContain("#");
    expect(encoded).toContain("%3C");
    expect(encoded).toContain("%3E");
    expect(encoded).toContain("%23");
  });

  it("encodes a literal percent before introducing its own", () => {
    // If % were escaped after <, the %3C would itself become %253C.
    const encoded = encodeSvg("<a>100%</a>");
    expect(encoded).toContain("100%25");
    expect(encoded).toContain("%3Ca%3E");
    expect(encoded).not.toContain("%253C");
  });

  it("turns double quotes into single quotes so the value can sit in url(\"…\")", () => {
    expect(encodeSvg('<svg width="10"></svg>')).toContain("width='10'");
  });

  it("collapses whitespace and trims", () => {
    expect(encodeSvg("  <a>\n\n  <b/>\t</a>  ")).toBe("%3Ca%3E %3Cb/%3E %3C/a%3E");
  });

  it("encodes braces", () => {
    const encoded = encodeSvg("<style>a{b:c}</style>");
    expect(encoded).toContain("%7B");
    expect(encoded).toContain("%7D");
  });
});

describe("svgDataUri", () => {
  it("prefixes the encoded markup with the data URI scheme", () => {
    expect(svgDataUri("<svg/>")).toBe("data:image/svg+xml,%3Csvg/%3E");
  });
});

describe("turbulence", () => {
  it("returns a css url() value", () => {
    const value = turbulence();
    expect(value.startsWith('url("data:image/svg+xml,')).toBe(true);
    expect(value.endsWith('")')).toBe(true);
  });

  it("is deterministic for a given seed", () => {
    expect(turbulence({ seed: 7 })).toBe(turbulence({ seed: 7 }));
  });

  it("produces different output for different seeds", () => {
    expect(turbulence({ seed: 1 })).not.toBe(turbulence({ seed: 2 }));
  });

  it("carries every option into the markup", () => {
    const value = turbulence({
      seed: 9,
      baseFrequency: "0.05 0.6",
      octaves: 2,
      opacity: 0.42,
      size: 240,
      kind: "turbulence",
    });
    expect(value).toContain("seed='9'");
    expect(value).toContain("baseFrequency='0.05 0.6'");
    expect(value).toContain("numOctaves='2'");
    expect(value).toContain("opacity='0.42'");
    expect(value).toContain("width='240'");
    expect(value).toContain("type='turbulence'");
  });

  it("references its own filter with an encoded fragment", () => {
    // url(#n) inside the SVG must survive as url(%23n) or the filter silently
    // fails to apply and the tile renders as a flat black rectangle.
    expect(turbulence()).toContain("filter='url(%23");
  });

  it("tiles seamlessly", () => {
    expect(turbulence()).toContain("stitchTiles='stitch'");
  });
});
