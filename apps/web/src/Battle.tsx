import type { RenderBattle } from "../../../packages/contracts/player";
import "./battle.css";

export function Battle({ battle: b }: { battle: RenderBattle }) {
  const summary = b.result
    ? b.result.outcome === "win"
      ? "Victory. Your result is saved."
      : b.result.outcome === "escape"
        ? "You escaped. Your result is saved."
        : b.result.reason === "turn-limit"
          ? "Time ran out. Your result is saved."
          : "Defeated. Your result is saved."
    : b.turns
      ? `Round ${b.turns} complete. Choose your next action.`
      : "Choose your first action.";
  return (
    <section className="battle-display" aria-label="Battle status">
      <div className="battle-health">
        <div>
          <strong>You</strong>
          <label>
            Health {b.playerHealth} / {b.playerMaxHealth}
            <meter
              min={0}
              max={b.playerMaxHealth}
              value={b.playerHealth}
              aria-label="Your health"
            />
          </label>
        </div>
        <div>
          <strong>{b.enemy.name}</strong>
          <label>
            Health {b.enemy.health} / {b.enemy.maxHealth}
            <meter
              min={0}
              max={b.enemy.maxHealth}
              value={b.enemy.health}
              aria-label={`${b.enemy.name} health`}
            />
          </label>
        </div>
      </div>
      <p className="battle-turn">
        Turn {b.turns} / {b.maxTurns} ·{" "}
        {b.initiative === "player" ? "You act first" : "Enemy acts first"}
      </p>
      <div
        className="battle-summary"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        <p>{summary}</p>
        <p>
          {b.result
            ? "Continue when you are ready."
            : "Attack deals damage. Guard reduces damage. Escape ends the encounter."}
        </p>
      </div>
    </section>
  );
}
