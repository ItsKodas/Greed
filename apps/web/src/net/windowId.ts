/**
 * What this window calls itself when it connects.
 *
 * `sessionStorage` rather than `localStorage`, because the unit is the window
 * and not the browser: it survives a refresh in the same tab, is not shared
 * with a second tab, and is gone when the tab closes. That is exactly the line
 * the server needs, which is between a player coming back and a second window
 * of theirs arriving.
 *
 * Not an identity and never trusted as one — the server uses it only to tell a
 * refresh from a rival.
 */
export const WINDOW_KEY = "backroom.window";

/** Held here as well, so a store that will not answer still gets a stable id. */
let here: string | null = null;

function fresh(): string {
  return `w${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

export function windowId(): string {
  if (here !== null) {
    return here;
  }
  try {
    const stored = window.sessionStorage.getItem(WINDOW_KEY);
    if (stored !== null && stored.length > 0) {
      here = stored;
      return here;
    }
  } catch {
    // A browser that will not remember is not a reason to refuse to play.
  }
  here = fresh();
  try {
    window.sessionStorage.setItem(WINDOW_KEY, here);
  } catch {
    // Same again: the id above still stands for the life of this page.
  }
  return here;
}
