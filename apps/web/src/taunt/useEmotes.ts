import type { EmoteView } from "@backroom/shared";
import { useEffect, useState } from "react";

/**
 * What may be thrown, fetched once.
 *
 * The catalogue changes only when an admin uploads something, so this is
 * fetched on mount and not watched: a player who sits down before a new emote
 * exists sees it on their next visit, which is soon enough for a picture.
 *
 * An empty list is the ordinary answer for a room with no database — emotes
 * live in the store, and a store that keeps nothing has none. Every caller
 * treats that as "no picker", not as an error, because it is not one.
 */
export function useEmotes(): EmoteView[] {
  const [emotes, setEmotes] = useState<EmoteView[]>([]);

  useEffect(() => {
    let alive = true;
    void fetch("/api/emotes")
      .then((response) => (response.ok ? response.json() : { emotes: [] }))
      .then((body: { emotes?: EmoteView[] }) => {
        if (alive) {
          setEmotes(body.emotes ?? []);
        }
      })
      .catch(() => {
        // A room that cannot list its emotes simply offers none.
      });
    return () => {
      alive = false;
    };
  }, []);

  return emotes;
}
