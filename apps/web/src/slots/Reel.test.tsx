// @vitest-environment jsdom
import type { Face } from "@backroom/game-slots";
import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { REEL_STAGGER_MS, Reel, SPIN_UP_MS } from "./Reel.js";

/**
 * A reel asked to spin, and the faces that come back.
 *
 * The same problem as a face-down card, and tested the same way. On a machine
 * talking to itself the reply lands inside a frame and none of this is
 * visible; over a real connection, getting it wrong shows the faces before the
 * server has said what they are, which reads as a machine that had decided
 * before you pulled. So it is tested on a clock rather than by eye.
 */
const column: Face[] = ["chip", "dice", "seven"];
const other: Face[] = ["bell", "bell", "spade"];

function faces(container: HTMLElement): number {
  return container.querySelectorAll("[data-face]").length;
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("a reel", () => {
  it("spins with no faces showing while it waits", () => {
    const { container } = render(<Reel column={undefined} spinning index={0} />);
    expect(container.querySelector(".reel--spinning")).not.toBeNull();
    expect(faces(container)).toBe(0);
  });

  it("shows what the server sent once it has stopped", () => {
    const { container, rerender } = render(<Reel column={undefined} spinning index={0} />);
    rerender(<Reel column={column} spinning={false} index={0} />);

    act(() => vi.advanceTimersByTime(SPIN_UP_MS + 500));

    expect(faces(container)).toBe(3);
    expect(container.querySelector(".reel--spinning")).toBeNull();
  });

  it("keeps spinning up even when the answer is instant", () => {
    /*
     * The bug this exists to stop. A reply that lands in the same frame as the
     * press must not stop a reel that has not visibly started — two motions
     * fighting over one reel, and a result that looks decided in advance.
     */
    const { container, rerender } = render(<Reel column={undefined} spinning index={0} />);
    rerender(<Reel column={column} spinning={false} index={0} />);

    act(() => vi.advanceTimersByTime(50));

    expect(container.querySelector(".reel--spinning")).not.toBeNull();
    expect(faces(container)).toBe(0);
  });

  it("stops later the further right it sits", () => {
    // Left to right, so the last reel is the one you hold your breath for.
    const first = render(<Reel column={undefined} spinning index={0} />);
    first.rerender(<Reel column={column} spinning={false} index={0} />);
    const last = render(<Reel column={undefined} spinning index={4} />);
    last.rerender(<Reel column={column} spinning={false} index={4} />);

    act(() => vi.advanceTimersByTime(SPIN_UP_MS + REEL_STAGGER_MS));

    expect(faces(first.container)).toBe(3);
    expect(faces(last.container)).toBe(0);

    act(() => vi.advanceTimersByTime(REEL_STAGGER_MS * 4));
    expect(faces(last.container)).toBe(3);
  });

  it("goes back to the faces it was showing when a spin is refused", () => {
    // The stake comes back, so the glass has to come back with it rather than
    // sitting on a spin that never happened.
    const { container, rerender } = render(<Reel column={column} spinning={false} index={0} />);
    expect(faces(container)).toBe(3);

    rerender(<Reel column={column} spinning index={0} />);
    expect(faces(container)).toBe(0);

    rerender(<Reel column={column} spinning={false} index={0} />);
    act(() => vi.advanceTimersByTime(SPIN_UP_MS + 500));

    expect(faces(container)).toBe(3);
  });

  it("replaces the old faces rather than keeping both", () => {
    const { container, rerender } = render(<Reel column={column} spinning={false} index={0} />);
    rerender(<Reel column={undefined} spinning index={0} />);
    rerender(<Reel column={other} spinning={false} index={0} />);

    act(() => vi.advanceTimersByTime(SPIN_UP_MS + 500));

    expect(faces(container)).toBe(3);
    expect(container.querySelectorAll('[data-face="bell"]')).toHaveLength(2);
  });

  it("does not leave a timer running when it is taken off the page", () => {
    // A spin that resolves after the cabinet has gone would set state on
    // nothing, which React complains about and which hides real bugs.
    const { rerender, unmount } = render(<Reel column={undefined} spinning index={0} />);
    rerender(<Reel column={column} spinning={false} index={0} />);
    unmount();
    expect(() => act(() => vi.advanceTimersByTime(SPIN_UP_MS + 500))).not.toThrow();
  });
});
