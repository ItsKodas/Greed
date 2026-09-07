import { useEffect, useRef, useState } from "react";

/**
 * The table's code, which is also the way to invite somebody to it.
 *
 * A code is only useful once it is somewhere else — in a message, on a call —
 * so the thing you do with it is copy it, and the thing you should not have to
 * do is select five characters by hand. Pressing it takes it.
 *
 * A button rather than a span with a handler on it: it does something when
 * pressed, so it should be reachable by keyboard and announce itself as a
 * control without anybody having to add that back on afterwards.
 */
export function CopyCode({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (timer.current !== null) {
        window.clearTimeout(timer.current);
      }
    },
    [],
  );

  const take = () => {
    /*
     * The clipboard is refused often enough that this cannot assume it: an
     * insecure origin, a browser that has not been given permission, an older
     * one without the API at all. A refusal leaves the code exactly where it
     * was and says nothing, which is no worse than a code that was never
     * pressable — telling somebody their own clipboard failed helps nobody.
     */
    void navigator.clipboard
      ?.writeText(code)
      .then(() => {
        setCopied(true);
        if (timer.current !== null) {
          window.clearTimeout(timer.current);
        }
        timer.current = window.setTimeout(() => setCopied(false), 1400);
      })
      .catch(() => {
        // Nothing to say and nothing to undo.
      });
  };

  return (
    <button
      type="button"
      className={`nav__code${copied ? " nav__code--took" : ""}`}
      aria-label={`Copy this table's code, ${code}`}
      onClick={take}
    >
      {copied ? "Copied" : code}
    </button>
  );
}
