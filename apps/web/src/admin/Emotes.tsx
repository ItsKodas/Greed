import { useCallback, useEffect, useRef, useState } from "react";

/**
 * The emote desk.
 *
 * Behind the same allowlist as minting a code, and for a reason that is not
 * about chips: this is the one place in the building where a file one person
 * chooses is handed to every other person's browser. Everything below is a
 * convenience — the server sniffs the bytes and refuses on its own, and it is
 * the server's refusal that is the rule.
 */

/** Kept in step with `packages/economy/src/emotes.ts`, which enforces them. */
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const MAX_SOUND_BYTES = 1024 * 1024;
const MAX_NAME = 24;

/** What the file pickers offer. SVG is deliberately not among them. */
const IMAGE_TYPES = "image/gif,image/png,image/jpeg,image/webp";
const SOUND_TYPES = "audio/mpeg,audio/ogg,audio/wav";

interface Emote {
  id: string;
  name: string;
  cost: number;
  imageMime: string;
  soundMime: string | null;
  imageBytes: number;
  soundBytes: number | null;
  createdAt: number;
  retired: boolean;
}

const fmt = (n: number) => n.toLocaleString("en-US");

/** Kilobytes, which is the unit these files are actually in. */
const size = (bytes: number) => `${Math.max(1, Math.round(bytes / 1024))}KB`;

/**
 * A file as base64, without the data-URL preamble.
 *
 * FileReader rather than a hand-rolled loop over the bytes: btoa on a large
 * array has to be chunked to avoid blowing the argument limit, and this is the
 * browser doing the same job correctly.
 */
function base64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("could not read that file"));
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      const comma = result.indexOf(",");
      resolve(comma === -1 ? "" : result.slice(comma + 1));
    };
    reader.readAsDataURL(file);
  });
}

export function Emotes() {
  const [emotes, setEmotes] = useState<Emote[] | null>(null);
  const [name, setName] = useState("");
  const [cost, setCost] = useState("250");
  const [image, setImage] = useState<File | null>(null);
  const [sound, setSound] = useState<File | null>(null);
  const [said, setSaid] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const imageInput = useRef<HTMLInputElement | null>(null);
  const soundInput = useRef<HTMLInputElement | null>(null);

  const load = useCallback(() => {
    void fetch("/api/admin/emotes", { credentials: "include" })
      .then((response) => (response.ok ? response.json() : null))
      .then((body: { emotes: Emote[] } | null) => setEmotes(body?.emotes ?? []))
      .catch(() => setEmotes([]));
  }, []);

  useEffect(load, [load]);

  const clear = () => {
    setName("");
    setImage(null);
    setSound(null);
    // The inputs are uncontrolled, so the files they are showing have to be
    // cleared by hand or the form still names a file it is no longer sending.
    if (imageInput.current !== null) {
      imageInput.current.value = "";
    }
    if (soundInput.current !== null) {
      soundInput.current.value = "";
    }
  };

  const add = () => {
    const chips = Number(cost);
    if (image === null) {
      setSaid("Pick a picture.");
      return;
    }
    if (name.trim().length === 0) {
      setSaid("Give it a name.");
      return;
    }
    if (!Number.isFinite(chips) || chips < 0) {
      setSaid("A cost is a whole number of chips.");
      return;
    }
    /*
     * Checked here as well so somebody does not sit through the upload of a
     * file that was always going to be refused. The server checks it too, and
     * that is the check that counts.
     */
    if (image.size > MAX_IMAGE_BYTES) {
      setSaid("That picture is over 2MB.");
      return;
    }
    if (sound !== null && sound.size > MAX_SOUND_BYTES) {
      setSaid("That sound is over 1MB.");
      return;
    }

    setBusy(true);
    setSaid(null);
    void (async () => {
      try {
        const body = {
          name: name.trim(),
          cost: Math.floor(chips),
          image: await base64(image),
          // A sound is optional, and absent is how that is said.
          ...(sound === null ? {} : { sound: await base64(sound) }),
        };
        const response = await fetch("/api/admin/emotes", {
          method: "POST",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });
        const answer = (await response.json()) as { error?: string; emote?: Emote };
        if (!response.ok) {
          setSaid(answer.error ?? "That was refused.");
          return;
        }
        setSaid(`Added ${answer.emote?.name ?? "it"}.`);
        clear();
        load();
      } catch {
        setSaid("Could not reach the room.");
      } finally {
        setBusy(false);
      }
    })();
  };

  return (
    <>
      <section className="panel">
        <p className="panel__label">New emote</p>
        <label className="field">
          <span className="field__label">Name</span>
          <input
            className="field__input"
            value={name}
            maxLength={MAX_NAME}
            placeholder="Smug"
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <label className="field">
          <span className="field__label">What a throw costs</span>
          <input
            className="field__input"
            value={cost}
            inputMode="numeric"
            onChange={(event) => setCost(event.target.value)}
          />
        </label>
        <label className="field">
          <span className="field__label">Picture — GIF, PNG, JPEG or WebP, up to 2MB</span>
          <input
            className="field__input"
            type="file"
            ref={imageInput}
            accept={IMAGE_TYPES}
            onChange={(event) => setImage(event.target.files?.[0] ?? null)}
          />
        </label>
        <label className="field">
          <span className="field__label">Sound — optional, MP3, OGG or WAV, up to 1MB</span>
          <input
            className="field__input"
            type="file"
            ref={soundInput}
            accept={SOUND_TYPES}
            onChange={(event) => setSound(event.target.files?.[0] ?? null)}
          />
        </label>
        <button type="button" className="btn btn--wide" disabled={busy} onClick={add}>
          {busy ? "Uploading…" : "Add emote"}
        </button>
        <p className="panel__note">
          Players pay to throw these at each other. The chips are staked on whoever it lands
          on: if they win the hand they take the lot and it comes back at whoever threw it,
          and if they lose it is gone. A sound is optional — plenty of them are funnier
          without one.
        </p>
        {said === null ? null : <p className="panel__note">{said}</p>}
      </section>

      <section className="panel">
        <p className="panel__label">Emotes</p>
        {emotes === null || emotes.length === 0 ? (
          <p className="panel__note">None yet.</p>
        ) : (
          <div className="scroller">
            <table className="history">
              <thead>
                <tr>
                  <th />
                  <th>Name</th>
                  <th className="history__num">Cost</th>
                  <th>Sound</th>
                  <th className="history__num">Size</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {emotes.map((emote) => (
                  <tr key={emote.id} className={emote.retired ? "code--dead" : undefined}>
                    <td>
                      <img
                        className="taunt-picker__art"
                        src={`/api/emotes/${emote.id}/image`}
                        alt=""
                      />
                    </td>
                    <td>{emote.retired ? `${emote.name} — retired` : emote.name}</td>
                    <td className="history__num code__chips">{fmt(emote.cost)}</td>
                    <td>{emote.soundMime === null ? "—" : "yes"}</td>
                    <td className="history__num">
                      {size(emote.imageBytes + (emote.soundBytes ?? 0))}
                    </td>
                    <td className="history__num">
                      {emote.retired ? null : (
                        <button
                          type="button"
                          className="btn btn--ghost btn--small"
                          onClick={() => {
                            void fetch(`/api/admin/emotes/${emote.id}/retire`, {
                              method: "POST",
                              credentials: "include",
                            }).then(load);
                          }}
                        >
                          Retire
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="panel__note">
          Retiring one stops it being offered. It keeps its picture, because it may still be
          sitting in somebody's pool waiting to be thrown back at them.
        </p>
      </section>
    </>
  );
}
