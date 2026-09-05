// @vitest-environment jsdom
import { SURFACES, color } from "@greed/ui";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Gallery } from "./Gallery.js";

describe("Gallery", () => {
  it("names every palette entry", () => {
    render(<Gallery />);
    const palette = screen.getByRole("region", { name: /palette/i });
    for (const name of Object.keys(color)) {
      expect(within(palette).getByText(name)).toBeDefined();
    }
  });

  it("prints the hex value beside each swatch", () => {
    render(<Gallery />);
    const palette = screen.getByRole("region", { name: /palette/i });
    expect(within(palette).getByText(color.brass)).toBeDefined();
    expect(within(palette).getByText(color.oxblood)).toBeDefined();
  });

  it("shows a specimen for each of the three typefaces", () => {
    render(<Gallery />);
    const type = screen.getByRole("region", { name: /type/i });
    expect(within(type).getByText(/bevan/i)).toBeDefined();
    expect(within(type).getByText(/plex sans/i)).toBeDefined();
    expect(within(type).getByText(/plex mono/i)).toBeDefined();
  });

  it("renders a tile for every surface plus the vignette", () => {
    render(<Gallery />);
    const textures = screen.getByRole("region", { name: /texture/i });
    for (const name of [...SURFACES, "vignette"]) {
      // getAllByText, not getByText: wood appears twice, once per seed.
      expect(within(textures).getAllByText(name).length).toBeGreaterThan(0);
    }
  });

  it("gives each texture tile a real background-image", () => {
    render(<Gallery />);
    const tile = screen.getByTestId("texture-wood");
    expect(tile.style.backgroundImage).toContain("gradient(");
  });

  it("varies the seed across tiles of the same surface", () => {
    render(<Gallery />);
    const first = screen.getByTestId("texture-wood").style.backgroundImage;
    const second = screen.getByTestId("texture-wood-alt").style.backgroundImage;
    expect(first).not.toBe(second);
  });
});
