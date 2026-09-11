// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Falling } from "./Falling.js";

describe("the number falling", () => {
  it("shows the number it settled on", () => {
    render(<Falling value={743} rolling={false} />);
    expect(screen.getByText("743")).toBeTruthy();
  });

  it("shows no number at all while it is still tumbling", () => {
    /*
     * The whole point. A tumbling number that showed a value would be the
     * client inventing a fact only the server knows — and worse, the player
     * would see it change, which reads as the table correcting itself.
     */
    const { container } = render(<Falling value={743} rolling={true} />);
    expect(container.textContent).not.toContain("743");
  });

  it("is one element across the change, not two", () => {
    // Two animations fighting over one element is the bug, not the effect. The
    // element that tumbles must be the element that settles, or the motion
    // does not continue across it.
    const { container, rerender } = render(<Falling value={1_000} rolling={true} />);
    const before = container.querySelector("[data-falling]");
    rerender(<Falling value={743} rolling={false} />);
    expect(container.querySelector("[data-falling]")).toBe(before);
  });

  it("says the number for anybody who cannot see it move", () => {
    // The page must say everything it needs to without the keyframes.
    render(<Falling value={743} rolling={false} />);
    expect(screen.getByText("743").getAttribute("aria-live")).toBeTruthy();
  });
});
