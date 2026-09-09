import type { Upgrade } from "@backroom/game-tips";
import { UPGRADES } from "@backroom/game-tips";
import { exact } from "../game/money.js";

export interface UpgradesProps {
  bought: readonly string[];
  favours: number;
  onBuy: (id: string) => void;
}

/**
 * The ladder, one favour at a time.
 *
 * Disabling what is bought or unaffordable is a courtesy only — the server
 * checks the same two things itself and refuses regardless, so a button that
 * somehow got out of step here costs nothing worse than a refusal the jar
 * already knows how to answer.
 */
export function Upgrades({ bought, favours, onBuy }: UpgradesProps) {
  return (
    <div className="upgrades">
      <p className="upgrades__label">Favours buy</p>
      {/*
        * Its own scrolling box rather than letting the page grow to fit it —
        * on a phone the jar is the screen, and a ladder four deep must not be
        * the thing that pushes it off the top.
        */}
      <ul className="upgrades__list">
        {UPGRADES.map((up) => {
          const owned = bought.includes(up.id);
          const afford = favours >= up.favours;
          return (
            <li key={up.id}>
              <button
                type="button"
                className={`upgrades__buy${owned ? " upgrades__buy--owned" : ""}`}
                disabled={owned || !afford}
                onClick={() => onBuy(up.id)}
              >
                <span className="upgrades__name">{up.name}</span>
                <span className="upgrades__effect">{effectText(up)}</span>
                <span className="upgrades__cost">
                  {owned ? "Bought" : `${exact(up.favours)} favours`}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** What an upgrade actually does, in the words the ladder is legible in. */
function effectText(up: Upgrade): string {
  const said: string[] = [];
  if (up.brim > 0) {
    said.push(`+${exact(up.brim)} brim`);
  }
  if (up.trickle > 0) {
    said.push(`+${exact(up.trickle)}/min`);
  }
  if (up.scoop > 0) {
    said.push(`+${exact(up.scoop)} a tap`);
  }
  return said.join(", ");
}
