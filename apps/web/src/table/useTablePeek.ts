import { useEffect, useState } from "react";

/**
 * What a table is, before you have sat down at it.
 *
 * Only what somebody following a link needs to decide what to do next: whether
 * the table exists, and whether it plays for chips. A table playing for chips
 * needs an account, and being told that up front is the difference between a
 * link that works and a link that dumps you on a form for opening a table of
 * your own.
 */

export interface Peek {
  code: string;
  game: string;
  forFun: boolean;
}

export interface Peeked {
  table: Peek | null;
  /** True until the first answer, so nothing flashes the wrong thing. */
  looking: boolean;
}

export function useTablePeek(code: string): Peeked {
  const [table, setTable] = useState<Peek | null>(null);
  const [looking, setLooking] = useState(code.length > 0);

  useEffect(() => {
    if (code.length === 0) {
      setTable(null);
      setLooking(false);
      return;
    }

    // Dropped if the code changes under us, so a slow answer for a code
    // somebody has already typed past cannot overwrite a newer one.
    let current = true;
    setLooking(true);
    void fetch(`/api/table/${encodeURIComponent(code)}`)
      .then((response) => (response.ok ? response.json() : null))
      .then((body) => {
        if (!current) {
          return;
        }
        setTable(body as Peek | null);
        setLooking(false);
      })
      .catch(() => {
        if (current) {
          // No answer is the same as no table as far as this screen goes: it
          // falls back to the ordinary join form, which refuses in words.
          setTable(null);
          setLooking(false);
        }
      });

    return () => {
      current = false;
    };
  }, [code]);

  return { table, looking };
}
