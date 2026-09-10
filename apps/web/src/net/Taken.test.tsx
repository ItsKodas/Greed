// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Taken } from "./Taken.js";

describe("a window that has been turned away", () => {
  it("says which game and what to do about it", () => {
    render(
      <Taken message="You already have Slots open in another window." onRetry={() => {}} />,
    );
    expect(
      screen.getByText("You already have Slots open in another window."),
    ).toBeTruthy();
  });

  it("offers a way back in, so nobody has to guess", () => {
    const retry = vi.fn();
    render(<Taken message="You already have Slots open in another window." onRetry={retry} />);
    screen.getByRole("button", { name: /try again/i }).click();
    expect(retry).toHaveBeenCalledTimes(1);
  });
});
