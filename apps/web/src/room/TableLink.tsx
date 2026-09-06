import { useEffect, useState } from "react";
import { Navigate, useParams } from "react-router-dom";
import { CODE_ALPHABET, CODE_LENGTH } from "@greed/shared";

/**
 * A table code on its own, with no game in front of it.
 *
 * Codes are unique across the whole room, so a link never has to say what is
 * being played at the table it points to — which matters both for the links
 * already sent out when there was only one game, and for the short
 * greed.horizons.gg/X7KQ3 form that people actually paste to each other.
 *
 * The server is asked which game the table belongs to and the address is
 * rewritten, so what ends up in the bar is the real one.
 */
export function TableLink() {
  const params = useParams();
  const raw = (params["code"] ?? "").toUpperCase();
  const looksLikeCode =
    raw.length === CODE_LENGTH && [...raw].every((letter) => CODE_ALPHABET.includes(letter));

  const [game, setGame] = useState<string | null | "missing">(null);

  useEffect(() => {
    if (!looksLikeCode) {
      return;
    }
    let live = true;
    void fetch(`/api/table/${raw}`)
      .then((response) => (response.ok ? response.json() : null))
      .then((body: { game: string } | null) => {
        if (live) {
          setGame(body?.game ?? "missing");
        }
      })
      .catch(() => {
        if (live) {
          setGame("missing");
        }
      });
    return () => {
      live = false;
    };
  }, [raw, looksLikeCode]);

  if (!looksLikeCode) {
    return <p className="not-found">No table with that code.</p>;
  }
  if (game === null) {
    return <p className="not-found">Finding that table…</p>;
  }
  if (game === "missing") {
    return <p className="not-found">No table with that code.</p>;
  }
  return <Navigate to={`/${game}/${raw}`} replace />;
}
