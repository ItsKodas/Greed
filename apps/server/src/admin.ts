/**
 * Who is allowed to make chips exist.
 *
 * An allowlist of Discord ids in the environment rather than a role on a
 * profile: there is no admin UI to grant it with, no way to escalate into it
 * from inside the product, and it fails closed when unset. If the list is
 * empty, nobody is an admin — including whoever deployed it.
 */
export function readAdmins(env: NodeJS.ProcessEnv): ReadonlySet<string> {
  const raw = env["ADMIN_DISCORD_IDS"] ?? "";
  return new Set(
    raw
      .split(",")
      .map((id) => id.trim())
      .filter((id) => id.length > 0),
  );
}
