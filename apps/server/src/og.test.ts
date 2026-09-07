import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { CardSpec } from "./og.js";
import { Avatars, Cards, cardSvg, fit } from "./og.js";

const FONTS = join(dirname(fileURLToPath(import.meta.url)), "../assets/fonts");

const table: CardSpec = {
  game: {
    id: "blackjack",
    name: "Blackjack",
    theme: { wall: "#0b1712", felt: "#17402e", accent: "#2e7bff", accentHi: "#7ba9ff" },
  },
  host: "Ada",
  code: "6PMKG",
  players: [null, null, null],
  maxSeats: 6,
  note: "Open — pull up a chair",
};

describe("the card a link unfurls into", () => {
  it("does not let a name become markup", () => {
    /*
     * The same boundary the head has, in a second document. A name reaches
     * this one too, and an SVG that a player can close a tag in is an SVG they
     * can put anything into.
     */
    const svg = cardSvg({ ...table, host: '</text><script>alert(1)</script>' });

    expect(svg).not.toContain("<script>");
    expect(svg).toContain("&lt;script&gt;");
    expect(svg).not.toContain("</text><");
  });

  it("draws one chip per seat, and fills the ones taken", () => {
    const svg = cardSvg(table);
    // Gold is money and money is a seat sold; the empty ones are the dark ring.
    const gold = svg.match(/#e0b048/g) ?? [];
    const spare = svg.match(/#39414d/g) ?? [];

    // Two marks per chip: the rim arcs share one stroke, the inlay takes one.
    expect(spare).toHaveLength(6);
    expect(svg).toContain("3 of 6 seats");
    expect(gold.length).toBeGreaterThan(0);
  });

  it("says nothing about seats on a banner for a whole game", () => {
    // Six of six seats is a fact about a table. A game does not have any.
    const svg = cardSvg({ ...table, host: null, code: null });

    expect(svg).not.toContain("of 6 seats");
    expect(svg).not.toContain("6PMKG");
  });

  it("cuts a name that would run off the card", () => {
    const svg = cardSvg({ ...table, host: "Bartholomew".repeat(12) });

    expect(svg).toContain("…");
    // And what is left of it still ends inside its own element.
    expect(svg).toMatch(/…<\/text>/);
  });

  it("gives each game its own furniture", () => {
    // The picture should say which game before anybody reads a word of it.
    expect(cardSvg(table)).toContain("IBM Plex Sans");
    const greed = {
      id: "greed",
      name: "Greed",
      theme: { wall: "#241811", felt: "#16241c", accent: "#c08a2e", accentHi: "#e8c168" },
    };
    expect(cardSvg({ ...table, game: greed })).toContain('rx="20"');
    expect(cardSvg({ ...table, game: null, code: null })).not.toContain("rx=\"20\"");
  });
});

describe("fitting a line", () => {
  it("leaves a line that fits exactly as it was", () => {
    expect(fit("Ada", 38, 760)).toBe("Ada");
  });

  it("ends a cut line with one ellipsis and no trailing space", () => {
    const cut = fit("a ".repeat(200), 38, 200);

    expect(cut.endsWith("…")).toBe(true);
    expect(cut).not.toContain(" …");
  });
});

describe("drawing it for real", () => {
  it("renders a PNG with the fonts that ship beside it", () => {
    /*
     * The one test that goes all the way through the rasterizer. It is here
     * because the failure it catches is a missing font file, and that failure
     * is invisible in the SVG — the card renders, just in nothing anybody
     * chose, or not at all.
     */
    const png = new Cards(FONTS).png(table);

    expect(png.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    // A card with type on it is not a few hundred bytes of flat colour.
    expect(png.byteLength).toBeGreaterThan(10_000);
  });

  it("draws the same card once", () => {
    const cards = new Cards(FONTS);

    // The same buffer, not merely an equal one: a link in a busy channel is
    // fetched by every client that renders the embed.
    expect(cards.png(table)).toBe(cards.png(table));
    expect(cards.png({ ...table, players: [null, null, null, null] })).not.toBe(cards.png(table));
  });

  it("does not grow without limit", () => {
    const cards = new Cards(FONTS, 4);
    const first = cards.png(table);
    for (let seats = 0; seats <= 5; seats += 1) {
      cards.png({ ...table, players: Array.from({ length: seats }, () => null) });
    }

    // Pushed out by the ones after it, and drawn again rather than kept.
    expect(cards.png(table)).not.toBe(first);
  });
});

describe("the faces at a table", () => {
  it("draws a seat as somebody's picture when there is one", () => {
    const picture = "data:image/png;base64,iVBORw0KGgo=";
    const svg = cardSvg({ ...table, players: [picture, null] });

    expect(svg).toContain(`href="${picture}"`);
    // Cut to a circle rather than laid over one: a square face in a row of
    // round chips is the one thing that would look like a mistake.
    expect(svg).toContain("clip-path");
    // The seat that has nobody's picture is still a chip.
    expect(svg).toContain("#e0b048");
  });

  it("falls back to a chip for a seat with no picture", () => {
    const svg = cardSvg({ ...table, players: [null, null] });

    expect(svg).not.toContain("<image");
  });

  it("counts the seats that are taken, not the pictures that arrived", () => {
    const svg = cardSvg({ ...table, players: [null, null, null] });

    expect(svg).toContain("3 of 6 seats");
  });
});

describe("fetching a face", () => {
  it("will not fetch from anywhere but the picture host", async () => {
    /*
     * The address comes out of this server's own store, which is the shape of
     * every server-side request forgery there has been. Anything that is not
     * Discord's CDN is not cleaned up or followed — it is not fetched.
     */
    const avatars = new Avatars();
    let asked = 0;
    const real = globalThis.fetch;
    globalThis.fetch = (...args: Parameters<typeof fetch>) => {
      asked += 1;
      return real(...args);
    };
    try {
      for (const url of [
        "http://localhost:3001/api/room",
        "https://evil.example/x.png",
        "https://cdn.discordapp.com.evil.example/x.png",
        "file:///etc/passwd",
        null,
      ]) {
        expect(await avatars.data(url)).toBeNull();
      }
    } finally {
      globalThis.fetch = real;
    }
    expect(asked).toBe(0);
  });
});
