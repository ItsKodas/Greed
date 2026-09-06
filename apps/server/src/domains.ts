/**
 * Friendly addresses.
 *
 * A game gets a subdomain of its own — `greed.horizons.gg` — because that is
 * what people actually paste to each other, and "go to casino.horizons.gg then
 * click Greed" is not something anybody says out loud. The subdomain is a door
 * rather than a place: it sends you straight to the same page on the one real
 * origin, so there is a single host holding the session cookie and a single
 * address people bookmark.
 */

/** Paths the browser asks for on its own behalf, which must never be moved. */
const SERVICE = ["/api", "/auth", "/socket.io", "/healthz"];

/**
 * Where a request on a game's subdomain should be sent, or null to leave it be.
 *
 * @param hostname The host asked for, without a port.
 * @param path The path asked for, without a query string.
 * @param games Every game id the room knows about.
 * @param canonical The one origin the site really lives at.
 */
export function friendlyRedirect(
  hostname: string,
  path: string,
  games: readonly string[],
  canonical: string,
): string | null {
  const label = hostname.split(".")[0]?.toLowerCase() ?? "";
  if (!games.includes(label)) {
    return null;
  }
  if (SERVICE.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))) {
    return null;
  }

  let origin: URL;
  try {
    origin = new URL(canonical);
  } catch {
    // No canonical origin to send anybody to, so nobody is sent anywhere.
    return null;
  }
  /*
   * The subdomain and the canonical host being the same is a configuration
   * anyone might arrive at — CLIENT_ORIGIN pointed at greed.horizons.gg, say —
   * and redirecting a host to itself is an infinite loop rather than a
   * mistake the browser can recover from.
   */
  if (origin.hostname.toLowerCase() === hostname.toLowerCase()) {
    return null;
  }

  // The bare subdomain is the only thing that needs a path inventing for it.
  // Everything else already knows where it is going and keeps its path — a
  // shared table code included.
  const wanted = path === "/" ? `/${label}` : path;
  return new URL(wanted, origin).toString();
}
