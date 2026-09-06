import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AccountBadge } from "../account/AccountBadge.js";
import { Sign } from "../game/Sign.js";
import { useAccount } from "../game/useAccount.js";

interface Code {
  code: string;
  chips: number;
  maxRedemptions: number | null;
  redemptions: number;
  expiresAt: number | null;
  note: string;
  createdAt: number;
  revoked: boolean;
}

const fmt = (n: number) => n.toLocaleString("en-US");

/**
 * The code desk.
 *
 * Reachable only by the Discord ids in the allowlist, and invisible to anyone
 * else — the server answers "not found" rather than "not allowed", so whether
 * this page exists is not something a visitor learns by asking.
 */
export function Admin() {
  const account = useAccount();
  const [codes, setCodes] = useState<Code[] | null>(null);
  const [allowed, setAllowed] = useState<boolean | null>(null);

  const load = useCallback(() => {
    void fetch("/api/admin/codes", { credentials: "include" })
      .then((response) => {
        setAllowed(response.ok);
        return response.ok ? response.json() : null;
      })
      .then((body: { codes: Code[] } | null) => {
        if (body !== null) {
          setCodes(body.codes);
        }
      })
      .catch(() => setAllowed(false));
  }, []);

  useEffect(load, [load]);

  return (
    <main className="room">
      <header className="room__head">
        <h1 className="room__mark">
          <Link to="/" aria-label="Back to The Back Room">
            <Sign />
          </Link>
        </h1>
        <span className="room__spacer" />
        <AccountBadge account={account} />
      </header>

      {allowed === null ? null : allowed ? (
        <div className="profile">
          <Mint onMinted={load} />
          <section className="panel">
            <p className="panel__label">Codes</p>
            {codes === null || codes.length === 0 ? (
              <p className="panel__note">None minted yet.</p>
            ) : (
              <div className="scroller">
                <table className="history">
                  <thead>
                    <tr>
                      <th>Code</th>
                      <th>For</th>
                      <th className="history__num">Chips</th>
                      <th className="history__num">Used</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {codes.map((entry) => (
                      <Row key={entry.code} entry={entry} onRevoked={load} />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      ) : (
        <p className="not-found">No such page.</p>
      )}
    </main>
  );
}

function Row({ entry, onRevoked }: { entry: Code; onRevoked: () => void }) {
  const used =
    entry.maxRedemptions === null
      ? fmt(entry.redemptions)
      : `${fmt(entry.redemptions)} of ${fmt(entry.maxRedemptions)}`;

  return (
    <tr className={entry.revoked ? "code--dead" : undefined}>
      <td className="history__code">{entry.code}</td>
      <td>{entry.revoked ? `${entry.note} — revoked` : entry.note}</td>
      <td className="history__num code__chips">{fmt(entry.chips)}</td>
      <td className="history__num">{used}</td>
      <td className="history__num">
        {entry.revoked ? null : (
          <button
            type="button"
            className="btn btn--ghost btn--small"
            onClick={() => {
              void fetch(`/api/admin/codes/${entry.code}/revoke`, {
                method: "POST",
                credentials: "include",
              }).then(onRevoked);
            }}
          >
            Revoke
          </button>
        )}
      </td>
    </tr>
  );
}

function Mint({ onMinted }: { onMinted: () => void }) {
  const [chips, setChips] = useState("5000");
  const [uses, setUses] = useState("");
  const [note, setNote] = useState("");
  const [said, setSaid] = useState<string | null>(null);

  const mint = () => {
    const amount = Number(chips);
    if (!Number.isFinite(amount) || amount < 1) {
      setSaid("Give it an amount worth redeeming.");
      return;
    }
    void fetch("/api/admin/codes", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chips: Math.floor(amount),
        // Blank means anyone, once each — the campaign case.
        maxRedemptions: uses.trim() === "" ? null : Math.floor(Number(uses)),
        note,
      }),
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((body: { code: Code } | null) => {
        setSaid(body === null ? "That was refused." : `Minted ${body.code.code}`);
        setNote("");
        onMinted();
      })
      .catch(() => setSaid("Could not reach the room."));
  };

  return (
    <section className="panel">
      <p className="panel__label">New code</p>
      <label className="field">
        <span className="field__label">Chips</span>
        <input
          className="field__input"
          value={chips}
          inputMode="numeric"
          onChange={(event) => setChips(event.target.value)}
        />
      </label>
      <label className="field">
        <span className="field__label">How many people (blank for anyone, once each)</span>
        <input
          className="field__input"
          value={uses}
          inputMode="numeric"
          placeholder="anyone"
          onChange={(event) => setUses(event.target.value)}
        />
      </label>
      <label className="field">
        <span className="field__label">What it is for</span>
        <input
          className="field__input"
          value={note}
          maxLength={120}
          placeholder="Launch weekend"
          onChange={(event) => setNote(event.target.value)}
        />
      </label>
      <button type="button" className="btn btn--wide" onClick={mint}>
        Mint code
      </button>
      {said === null ? null : <p className="panel__note">{said}</p>}
    </section>
  );
}
