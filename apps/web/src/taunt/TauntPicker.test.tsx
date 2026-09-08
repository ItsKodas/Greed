// @vitest-environment jsdom
import type { EmoteView } from "@backroom/shared";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TauntPicker } from "./TauntPicker.js";
import type { Target } from "./TauntPicker.js";

/**
 * Who the picker offers, and what it lets them spend.
 *
 * None of this is the rule — the server refuses a taunt at a bot, at a guest
 * and at yourself, whatever this renders. What is tested here is the courtesy:
 * that a player is not offered something that is going to be refused, and that
 * the price is in front of them before they press anything.
 */

const EMOTES: EmoteView[] = [
  { id: "e1", name: "Smug", cost: 250, image: "/api/emotes/e1/image", sound: null },
  { id: "e2", name: "Costly", cost: 9000, image: "/api/emotes/e2/image", sound: null },
];

const seat = (over: Partial<Target> & { id: string }): Target => ({
  name: over.id,
  isBot: false,
  signedIn: true,
  ...over,
});

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, json: async () => ({ emotes: EMOTES }) })),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Renders and waits for the catalogue to have arrived. */
async function picker(props: Partial<Parameters<typeof TauntPicker>[0]> = {}) {
  const onThrow = vi.fn();
  const view = render(
    <TauntPicker
      seats={[seat({ id: "me" }), seat({ id: "them", name: "Bo" })]}
      seatId="me"
      chips={5000}
      stakes={[]}
      onThrow={onThrow}
      {...props}
    />,
  );
  await waitFor(() => expect(view.container.querySelector("button")).not.toBeNull());
  return { ...view, onThrow };
}

describe("the taunt picker", () => {
  it("offers nothing at all until the room has emotes", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => ({ emotes: [] }) })),
    );
    const { container } = render(
      <TauntPicker
        seats={[seat({ id: "me" }), seat({ id: "them" })]}
        seatId="me"
        chips={5000}
        stakes={[]}
        onThrow={vi.fn()}
      />,
    );
    // A room with no database has no emotes, which is no button rather than a
    // button that apologises.
    await waitFor(() => expect(container.querySelector(".taunt-picker__open")).toBeNull());
  });

  it("offers nothing to somebody who is only watching", async () => {
    const { container } = render(
      <TauntPicker
        seats={[seat({ id: "them" })]}
        seatId={null}
        chips={5000}
        stakes={[]}
        onThrow={vi.fn()}
      />,
    );
    expect(container.querySelector(".taunt-picker__open")).toBeNull();
  });

  it("shows what each one costs before anything is pressed", async () => {
    const { getByRole } = await picker();
    fireEvent.click(getByRole("button", { name: "Taunt" }));

    expect(screen.getByText("Smug")).toBeTruthy();
    expect(screen.getByText("250")).toBeTruthy();
    expect(screen.getByText("9,000")).toBeTruthy();
  });

  it("greys out what this player cannot afford", async () => {
    const { getByRole, container } = await picker({ chips: 1000 });
    fireEvent.click(getByRole("button", { name: "Taunt" }));

    const buttons = [...container.querySelectorAll(".taunt-picker__emote")];
    expect(buttons.map((one) => (one as HTMLButtonElement).disabled)).toEqual([false, true]);
  });

  it("tells a guest to sign in rather than offering a price they cannot pay", async () => {
    const { getByRole } = await picker({ chips: null });
    fireEvent.click(getByRole("button", { name: "Taunt" }));

    expect(screen.getByText(/sign in/i)).toBeTruthy();
  });

  it("does not offer you yourself", async () => {
    const { getByRole } = await picker();
    fireEvent.click(getByRole("button", { name: "Taunt" }));
    fireEvent.click(getByRole("button", { name: /Smug/ }));

    expect(screen.queryByRole("button", { name: /^me/ })).toBeNull();
    expect(screen.getByRole("button", { name: /Bo/ })).toBeTruthy();
  });

  /*
   * A bot is not a real person and a guest has no account, so neither can be
   * either end of a stake. The server says so too; this is what stops a player
   * being offered a throw that was always going to come back refused.
   */
  it("does not offer a bot or a guest", async () => {
    const { getByRole } = await picker({
      seats: [
        seat({ id: "me" }),
        seat({ id: "bot", name: "Pockets", isBot: true }),
        seat({ id: "guest", name: "Nobody", signedIn: false }),
        seat({ id: "them", name: "Bo" }),
      ],
    });
    fireEvent.click(getByRole("button", { name: "Taunt" }));
    fireEvent.click(getByRole("button", { name: /Smug/ }));

    expect(screen.queryByRole("button", { name: /Pockets/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Nobody/ })).toBeNull();
    expect(screen.getByRole("button", { name: /Bo/ })).toBeTruthy();
  });

  it("says so when there is nobody worth taunting", async () => {
    const { getByRole } = await picker({
      seats: [seat({ id: "me" }), seat({ id: "bot", isBot: true })],
    });
    fireEvent.click(getByRole("button", { name: "Taunt" }));

    expect(screen.getByText(/nobody here to taunt/i)).toBeTruthy();
  });

  it("shows what is already riding on somebody", async () => {
    const { getByRole } = await picker({ stakes: [{ seatId: "them", chips: 700 }] });
    fireEvent.click(getByRole("button", { name: "Taunt" }));
    fireEvent.click(getByRole("button", { name: /Smug/ }));

    expect(screen.getByText("700 riding")).toBeTruthy();
  });

  it("hands back the whole emote, so the cost can be shown leaving at once", async () => {
    const { getByRole, onThrow } = await picker();
    fireEvent.click(getByRole("button", { name: "Taunt" }));
    fireEvent.click(getByRole("button", { name: /Smug/ }));
    fireEvent.click(getByRole("button", { name: /Bo/ }));

    expect(onThrow).toHaveBeenCalledWith(
      expect.objectContaining({ id: "e1", cost: 250 }),
      "them",
    );
  });

  it("closes itself once something has been thrown", async () => {
    const { getByRole, container } = await picker();
    fireEvent.click(getByRole("button", { name: "Taunt" }));
    fireEvent.click(getByRole("button", { name: /Smug/ }));
    fireEvent.click(getByRole("button", { name: /Bo/ }));

    expect(container.querySelector(".taunt-picker__panel")).toBeNull();
  });
});
