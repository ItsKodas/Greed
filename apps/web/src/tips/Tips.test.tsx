// @vitest-environment jsdom
import type { JarView, TapResult } from "@backroom/shared";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Account } from "../game/useAccount.js";

/**
 * The optimism, and its rollback.
 *
 * A socket that answers in the same tick as it was asked proves nothing: the
 * bug this page exists to avoid only shows up when the table is slow to
 * speak. So the fake socket below lets a test hold one ack open — the same
 * gap a real connection leaves between a press and the round trip that
 * confirms it — and watch what the page says while that gap is still open.
 */

const account = vi.hoisted(() => ({ current: null as Account | null }));
vi.mock("../game/useAccount.js", () => ({ useAccount: () => account.current }));

/** What "tips:open" answers with, one test's worth at a time. */
let openJar: JarView = jarView();
/** The ack a held tap or buy is waiting to be given. */
let heldAck: ((result: TapResult) => void) | null = null;

vi.mock("socket.io-client", () => ({
  io: () => ({
    on(event: string, handler: (...args: unknown[]) => void) {
      // The page only ever asks whether it is connected; answering at once
      // is what a socket that connected instantly would do too.
      if (event === "connect") {
        handler();
      }
    },
    emit(event: string, _payload: unknown, ack?: (...args: unknown[]) => void) {
      if (event === "tips:open") {
        ack?.(openJar);
        return;
      }
      if (event === "tips:tap" || event === "tips:buy") {
        heldAck = ack as (result: TapResult) => void;
      }
    },
    close() {},
  }),
}));

import Tips from "./Tips.js";

function jarView(overrides: Partial<JarView> = {}): JarView {
  return {
    level: 1_000,
    at: Date.now(),
    brim: 1_500,
    trickle: 60,
    scoop: 25,
    favours: 0,
    bought: [],
    chipsTonight: 0,
    nightEndsAt: Date.now() + 20 * 60 * 60 * 1000,
    token: "token-1",
    ...overrides,
  };
}

function signedIn(): Account {
  return {
    profile: {
      id: "u1",
      name: "Koda",
      avatar: null,
      accentColor: null,
      chips: 5_000,
      stats: { games: 0, wins: 0, chipsWon: 0 },
      byGame: {},
    },
    available: true,
    loading: false,
    refresh: () => {},
    setChips: () => {},
    signOut: () => {},
    claimDaily: () => {},
    dailyMessage: null,
    dailyDue: false,
  };
}

/** Holds the next tap or buy open, so a test can inspect the optimistic frame. */
function holdTheAck() {
  return {
    resolve(result: TapResult) {
      const ack = heldAck;
      heldAck = null;
      ack?.(result);
    },
  };
}

async function tapTheJar() {
  const button = await screen.findByRole("button", { name: /tap the jar/i });
  fireEvent.click(button);
}

/** Rendered inside a router, the way every page in the building is — the
    navbar's own link to the front page needs one to mount at all. */
function show() {
  return render(
    <MemoryRouter>
      <Tips />
    </MemoryRouter>,
  );
}

afterEach(() => {
  account.current = null;
  openJar = jarView();
  heldAck = null;
});

describe("the jar you tap", () => {
  it("shows the scoop before the server answers", async () => {
    account.current = signedIn();
    const held = holdTheAck();

    show();
    await tapTheJar();

    // A stake is the player's own — the scoop is worked out from the same
    // numbers the ack will confirm, so it is on the page before the table
    // could possibly have replied.
    expect(screen.getByTestId("tonight").textContent).toBe("25");

    held.resolve({ ok: true, paid: 25, balance: 1_025, jar: jarView({ chipsTonight: 25 }) });
  });

  it("puts the level back when a tap is refused", async () => {
    account.current = signedIn();
    const held = holdTheAck();

    show();
    await tapTheJar();
    expect(screen.getByTestId("tonight").textContent).toBe("25");

    held.resolve({ ok: false, error: "The jar is dry — give it a moment.", jar: jarView() });

    expect(await screen.findByText(/the jar is dry/i)).toBeDefined();
    // The optimistic frame is gone: the refusal's own jar is what the page
    // shows now, not a number the press only guessed at.
    expect(screen.getByTestId("tonight").textContent).toBe("0");
  });

  /*
   * A jar with nothing dripped into it since the last tap must not let a
   * press vanish silently — that is indistinguishable from a broken button.
   * The client can already tell it is dry from the same numbers the server
   * would use, so nothing is even sent: the reason lands on the page at once.
   */
  it("says the jar is dry rather than showing nothing happening", async () => {
    account.current = signedIn();
    openJar = jarView({ level: 0, trickle: 0, scoop: 25 });

    show();
    await tapTheJar();

    expect(await screen.findByText(/the jar is dry/i)).toBeDefined();
    // Nothing to collect, so nothing moved — unlike a refused tap, this
    // never had a number to roll back from.
    expect(screen.getByTestId("tonight").textContent).toBe("0");
  });

  /*
   * The jar is the whole interface on a phone: it has to still be the thing
   * you are looking at, and looking at it must never take the document
   * sideways with it — the building's one hard rule at 375px.
   */
  it("does not scroll sideways at 375px", async () => {
    account.current = signedIn();
    const originalWidth = window.innerWidth;
    window.innerWidth = 375;

    const { container } = show();
    await tapTheJar();

    for (const el of container.querySelectorAll<HTMLElement>("*")) {
      const width = el.style.width;
      if (width.endsWith("px")) {
        expect(parseFloat(width)).toBeLessThanOrEqual(375);
      }
    }
    // The tap target and the ladder both rendered, so this checked a real
    // page rather than an empty one nothing could have overflowed.
    expect(container.querySelector(".jar")).not.toBeNull();
    expect(container.querySelector(".upgrades__list")).not.toBeNull();

    window.innerWidth = originalWidth;
  });
});
