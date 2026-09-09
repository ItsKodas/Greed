// @vitest-environment jsdom
import { POCKETS, WHEEL } from "@backroom/game-roulette";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Wheel, angleOf } from "./Wheel.js";

afterEach(cleanup);

const styleOf = (container: HTMLElement) =>
  (container.querySelector(".rl__wheel") as HTMLElement).style;

describe("where the ball ends up", () => {
  it("gives every pocket its own place on the rim", () => {
    /*
     * Two pockets sharing an angle would be a ball that lands visibly in the
     * wrong number while the table pays out on the right one — the worst kind
     * of wrong, because the felt and the money would disagree in front of
     * everybody.
     */
    const angles = WHEEL.map((n) => angleOf(n));
    expect(new Set(angles).size).toBe(POCKETS);
  });

  it("puts the zero at the top and spaces the rest evenly", () => {
    expect(angleOf(0)).toBe(0);
    expect(angleOf(WHEEL[1] as number)).toBeCloseTo(360 / POCKETS, 6);
    expect(angleOf(WHEEL.at(-1) as number)).toBeCloseTo((360 / POCKETS) * 36, 6);
  });

  it("sends the ball to the pocket's own angle", () => {
    // The landing angle is the pocket's angle and nothing else. Anything added
    // here is a second source of truth about where the ball goes.
    const { container } = render(<Wheel pocket={17} spinning />);
    expect(styleOf(container).getPropertyValue("--ball-to")).toBe(`${angleOf(17)}deg`);
  });

  it("turns the rim a whole number of times", () => {
    /*
     * What makes the line above true, and it is now load-bearing twice over.
     *
     * The rim carries the pockets, so it has to finish exactly where it started
     * or a pocket at rest is no longer where the geometry says it is — and the
     * ball would need the rim's final rotation added to its own, every spin.
     *
     * The rim also stops before the ball does, and its animation is dropped
     * when the wheel leaves the spinning state. A whole number of turns is why
     * that costs nothing: the held final frame and the untransformed rim are
     * the same picture, so the wheel does not jump at the moment it settles.
     */
    const { container } = render(<Wheel pocket={17} spinning />);
    const from = Number.parseFloat(styleOf(container).getPropertyValue("--rim-from"));
    expect(from % 360).toBe(0);
    expect(from).toBeGreaterThan(0);
  });

  it("sends the ball the opposite way to the rim", () => {
    // The whole illusion. A disc and a dot going the same way is a loading
    // spinner; going opposite ways it is unmistakably a roulette wheel.
    const { container } = render(<Wheel pocket={17} spinning />);
    const style = styleOf(container);
    const rimFrom = Number.parseFloat(style.getPropertyValue("--rim-from"));
    const ballFrom = Number.parseFloat(style.getPropertyValue("--ball-from"));
    const ballTo = Number.parseFloat(style.getPropertyValue("--ball-to"));
    // The rim winds down from positive to zero; the ball winds up to its pocket.
    expect(rimFrom).toBeGreaterThan(0);
    expect(ballTo - ballFrom).toBeGreaterThan(0);
  });

  it("takes its own time from the table rather than choosing one", () => {
    // The table waits exactly this long before settling the cloth. If the two
    // disagree the felt announces a number the ball has not reached.
    const { container } = render(<Wheel pocket={17} spinning spinMs={9_000} />);
    expect(styleOf(container).getPropertyValue("--spin-ms")).toBe("9000ms");
  });

  it("is not spinning when there is nothing to spin to", () => {
    // A wheel told to turn with no result would run its animation to a pocket
    // it does not have, and land at twelve o'clock.
    const { container } = render(<Wheel pocket={null} spinning />);
    expect(container.querySelector(".rl__wheel--spinning")).toBeNull();
  });

  it("says the number out loud once the ball is in, and not before", () => {
    const spinning = render(<Wheel pocket={6} spinning />);
    expect(spinning.container.querySelector(".rl__called")).toBeNull();
    expect(spinning.container.querySelector(".rl__wheel")?.getAttribute("aria-label")).toBe(
      "The wheel is turning.",
    );
    cleanup();

    const still = render(<Wheel pocket={6} />);
    expect(still.container.querySelector(".rl__called")?.textContent).toBe("6");
    expect(still.container.querySelector(".rl__wheel")?.getAttribute("aria-label")).toBe(
      "The ball is in 6.",
    );
  });

  it("keeps the winning pocket to itself until the ball is in it", () => {
    /*
     * The result exists from the moment betting closes — the server picks it
     * then, and the felt needs it to roll the ball to the right place. Which
     * means every drawing of it is a chance to give the game away, and a
     * pocket lit up while the ball is still four seconds from it spoils the
     * only part of roulette that is suspense.
     */
    const { container } = render(<Wheel pocket={17} spinning />);
    expect(container.querySelector(".rl__pocket--home")).toBeNull();
    expect(container.querySelector(".rl__called")).toBeNull();
  });

  it("does not name the number to a screen reader while the ball is in the air", () => {
    /*
     * The same leak, told rather than shown. A player who cannot see the wheel
     * should be kept in suspense by it, not read the answer early.
     *
     * What is checked is that nothing singles the number out, not that the
     * number is absent — the rim is labelled with all thirty-seven of them and
     * always has been.
     */
    const { container } = render(<Wheel pocket={17} spinning />);
    expect(container.querySelector("title")?.textContent).toBe("Roulette wheel");
    expect(container.querySelector(".rl__wheel")?.getAttribute("aria-label")).toBe(
      "The wheel is turning.",
    );
  });

  it("lights the pocket once the ball is in it", () => {
    const { container } = render(<Wheel pocket={17} />);
    expect(container.querySelector(".rl__pocket--home")).toBeTruthy();
    expect(container.querySelector("title")?.textContent).toBe("The ball is in 17");
  });

  it("still shows which pockets your own bets cover while it spins", () => {
    // Covered is not a leak: those are the player's own chips, and knowing what
    // you are on is half of what makes watching the ball worth anything.
    const { container } = render(<Wheel pocket={17} spinning covered={new Set([4, 21])} />);
    expect(container.querySelectorAll(".rl__pocket--covered")).toHaveLength(2);
  });

  it("calls the number in its own colour", () => {
    // Red or black is half of what most bets on this table were about, so the
    // answer says which without being read.
    const red = render(<Wheel pocket={32} />);
    expect(red.container.querySelector(".rl__called--red")).toBeTruthy();
    cleanup();

    const black = render(<Wheel pocket={6} />);
    expect(black.container.querySelector(".rl__called--black")).toBeTruthy();
    cleanup();

    const zero = render(<Wheel pocket={0} />);
    expect(zero.container.querySelector(".rl__called--zero")).toBeTruthy();
  });
});
