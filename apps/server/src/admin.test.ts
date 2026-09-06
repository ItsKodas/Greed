import { describe, expect, it } from "vitest";
import { readAdmins } from "./admin.js";

describe("who is an admin", () => {
  it("is nobody when the list is unset, including whoever deployed it", () => {
    expect(readAdmins({} as NodeJS.ProcessEnv).size).toBe(0);
    expect(readAdmins({ ADMIN_DISCORD_IDS: "" } as NodeJS.ProcessEnv).size).toBe(0);
  });

  it("takes a comma-separated list and ignores the spaces around it", () => {
    const admins = readAdmins({ ADMIN_DISCORD_IDS: " 123 , 456,789 " } as NodeJS.ProcessEnv);
    expect([...admins].sort()).toEqual(["123", "456", "789"]);
  });

  it("does not admit an empty entry from a trailing comma", () => {
    const admins = readAdmins({ ADMIN_DISCORD_IDS: "123,," } as NodeJS.ProcessEnv);
    expect(admins.size).toBe(1);
    expect(admins.has("")).toBe(false);
  });
});
