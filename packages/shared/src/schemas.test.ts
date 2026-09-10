import { describe, expect, it } from "vitest";
import { createSchema } from "./schemas.js";

describe("opening a table", () => {
  it("accepts an opening ceiling", () => {
    const parsed = createSchema.safeParse({ name: "Ada", game: "death-roll", ceiling: 1_000 });

    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.ceiling).toBe(1_000);
  });

  it("refuses a ceiling outside what any table offers", () => {
    // Bounded here and snapped by the game. This only stops a nonsense number
    // reaching that arithmetic at all.
    expect(createSchema.safeParse({ name: "Ada", ceiling: 0 }).success).toBe(false);
    expect(createSchema.safeParse({ name: "Ada", ceiling: 10_000_000 }).success).toBe(false);
    expect(createSchema.safeParse({ name: "Ada", ceiling: 1.5 }).success).toBe(false);
  });

  it("is happy without one, because most tables have no ceiling", () => {
    expect(createSchema.safeParse({ name: "Ada" }).success).toBe(true);
  });
});
