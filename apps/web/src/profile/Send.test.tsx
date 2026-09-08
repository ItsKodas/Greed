// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Send } from "./Send.js";

/**
 * Paying somebody, from the sender's side.
 *
 * None of this is the rule — the server decides what an account holds, what it
 * has sent today, and whether a transfer may happen at all. What is tested
 * here is the part that only exists in the browser: that you pay a person you
 * picked rather than a name you typed, because two players can share a name
 * and chips do not come back.
 */

const PEOPLE = [
  { id: "u2", name: "Ada", avatar: null, accentColor: null },
  { id: "u3", name: "Adam", avatar: null, accentColor: null },
];

let sent: Array<Record<string, unknown>> = [];

function stubFetch(sendAnswer: { ok: boolean; body: Record<string, unknown> }) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: { method?: string; body?: string }) => {
      if (url.startsWith("/api/players")) {
        return { ok: true, json: async () => ({ players: PEOPLE }) };
      }
      if (url === "/api/transfers") {
        return {
          ok: true,
          json: async () => ({ transfers: [], leftToday: 25_000, cap: 25_000 }),
        };
      }
      if (url === "/api/send" && init?.method === "POST") {
        sent.push(JSON.parse(init.body ?? "{}") as Record<string, unknown>);
        return { ok: sendAnswer.ok, json: async () => sendAnswer.body };
      }
      return { ok: false, json: async () => ({}) };
    }),
  );
}

beforeEach(() => {
  sent = [];
  vi.useFakeTimers({ shouldAdvanceTime: true });
  stubFetch({
    ok: true,
    body: { ok: true, amount: 500, balance: 9500, leftToday: 24_500, to: { id: "u2" } },
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function panel(over: Partial<Parameters<typeof Send>[0]> = {}) {
  const onSent = vi.fn();
  const view = render(<Send meId="u1" chips={10_000} onSent={onSent} {...over} />);
  return { ...view, onSent };
}

/** Types a name and waits out the debounce, as a person would. */
async function search(text: string) {
  fireEvent.change(screen.getByPlaceholderText("Their name"), { target: { value: text } });
  await vi.advanceTimersByTimeAsync(300);
  await waitFor(() => expect(screen.queryByRole("button", { name: /Ada$/ })).not.toBeNull());
}

describe("finding somebody", () => {
  it("asks for nobody until enough has been typed", async () => {
    panel();
    fireEvent.change(screen.getByPlaceholderText("Their name"), { target: { value: "a" } });
    await vi.advanceTimersByTimeAsync(300);

    const calls = (globalThis.fetch as unknown as { mock: { calls: string[][] } }).mock.calls;
    expect(calls.some((call) => String(call[0]).startsWith("/api/players"))).toBe(false);
  });

  it("offers the people it found", async () => {
    panel();
    await search("ad");

    expect(screen.getByRole("button", { name: /Ada$/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Adam/ })).toBeTruthy();
  });

  /*
   * The whole reason picking is a separate step. Two players can be called
   * Ada, so what gets paid is the id behind the face somebody chose.
   */
  it("pays the person picked, not the name typed", async () => {
    panel();
    await search("ad");
    fireEvent.click(screen.getByRole("button", { name: /Adam/ }));
    fireEvent.change(screen.getByPlaceholderText("500"), { target: { value: "500" } });
    fireEvent.click(screen.getByRole("button", { name: /Send to Adam/ }));

    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]).toEqual({ toId: "u3", amount: 500 });
  });

  it("lets somebody change their mind about who", async () => {
    panel();
    await search("ad");
    fireEvent.click(screen.getByRole("button", { name: /Adam/ }));
    fireEvent.click(screen.getByRole("button", { name: "Change" }));

    expect(screen.getByPlaceholderText("Their name")).toBeTruthy();
  });
});

describe("sending", () => {
  async function pick() {
    const view = panel();
    await search("ad");
    fireEvent.click(screen.getByRole("button", { name: /Adam/ }));
    return view;
  }

  it("hands the new balance back so the purse follows", async () => {
    const { onSent } = await pick();
    fireEvent.change(screen.getByPlaceholderText("500"), { target: { value: "500" } });
    fireEvent.click(screen.getByRole("button", { name: /Send to Adam/ }));

    await waitFor(() => expect(onSent).toHaveBeenCalledWith(9500));
  });

  it("refuses an amount that is not a whole number of chips, without asking", async () => {
    await pick();

    for (const amount of ["0", "-5", "2.5", "lots", ""]) {
      fireEvent.change(screen.getByPlaceholderText("500"), { target: { value: amount } });
      fireEvent.click(screen.getByRole("button", { name: /Send to Adam/ }));
    }

    expect(sent).toEqual([]);
  });

  it("refuses more than the sender holds, without asking", async () => {
    const view = panel();
    view.unmount();
    const fresh = render(<Send meId="u1" chips={100} onSent={vi.fn()} />);
    fireEvent.change(fresh.getByPlaceholderText("Their name"), { target: { value: "ad" } });
    await vi.advanceTimersByTimeAsync(300);
    await waitFor(() => expect(fresh.queryAllByRole("button", { name: /Adam/ })).not.toHaveLength(0));
    fireEvent.click(fresh.getAllByRole("button", { name: /Adam/ })[0] as HTMLElement);
    fireEvent.change(fresh.getByPlaceholderText("500"), { target: { value: "500" } });
    fireEvent.click(fresh.getByRole("button", { name: /Send to Adam/ }));

    expect(sent).toEqual([]);
    expect(fresh.getByText(/do not have that many/i)).toBeTruthy();
  });

  it("says what the room said when it is refused", async () => {
    stubFetch({
      ok: false,
      body: { ok: false, error: "That is more than you can send today.", leftToday: 0 },
    });
    await pick();
    fireEvent.change(screen.getByPlaceholderText("500"), { target: { value: "500" } });
    fireEvent.click(screen.getByRole("button", { name: /Send to Adam/ }));

    await waitFor(() =>
      expect(screen.getByText(/more than you can send today/i)).toBeTruthy(),
    );
  });

  it("shows what is left of the day", async () => {
    panel();
    await waitFor(() => expect(screen.getByText(/25,000 left to send today/i)).toBeTruthy());
  });
});
