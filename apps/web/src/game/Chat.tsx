import type { ChatMessage } from "@greed/shared";
import { useEffect, useRef, useState } from "react";

interface ChatProps {
  log: ChatMessage[];
  seatId: string | null;
  onSay: (text: string) => void;
}

export function Chat({ log, seatId, onSay }: ChatProps) {
  const [draft, setDraft] = useState("");
  const bottom = useRef<HTMLDivElement | null>(null);

  // Scrolling follows the arrival of a message, which the length captures.
  // The log itself is a new array on every render.
  // biome-ignore lint/correctness/useExhaustiveDependencies: length is the real trigger
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [log.length]);

  const send = () => {
    onSay(draft);
    setDraft("");
  };

  return (
    <section className="chat" aria-label="Table talk">
      <p className="panel__label">Table talk</p>
      <div className="chat__log">
        {log.length === 0 ? (
          <p className="chat__quiet">Nobody has said anything yet.</p>
        ) : (
          log.map((message) => (
            <p className="chat__line" key={`${message.at}-${message.seatId}-${message.text}`}>
              <span className={`chat__who${message.seatId === seatId ? " chat__who--you" : ""}`}>
                {message.name}
              </span>
              {/* Rendered as text, never as markup. */}
              <span className="chat__text">{message.text}</span>
            </p>
          ))
        )}
        <div ref={bottom} />
      </div>
      <div className="chat__entry">
        <input
          className="field__input"
          value={draft}
          maxLength={200}
          placeholder="Say something"
          aria-label="Message"
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              send();
            }
          }}
        />
        <button
          type="button"
          className="btn btn--ghost btn--small"
          disabled={draft.trim().length === 0}
          onClick={send}
        >
          Say
        </button>
      </div>
    </section>
  );
}
