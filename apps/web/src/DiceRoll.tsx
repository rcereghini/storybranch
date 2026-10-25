import { useEffect, useRef, useState } from "react";
import type { createD20 } from "./d20-scene";

export function DiceRoll({
  sides,
  roll,
  attempting,
  busy,
}: {
  sides?: number;
  roll?: { value: number; passed: boolean; target: number };
  attempting: boolean;
  busy: boolean;
}) {
  const host = useRef<HTMLDivElement>(null);
  const scene = useRef<ReturnType<typeof createD20>>(undefined);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [reduced, setReduced] = useState(
    () => matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const rolling = attempting && busy && !roll;
  const presentation = {
    rolling,
    value: roll?.value,
    animate: attempting && !reduced,
  };
  const latest = useRef(presentation);
  latest.current = presentation;
  useEffect(() => {
    const query = matchMedia("(prefers-reduced-motion: reduce)");
    const changed = () => setReduced(query.matches);
    query.addEventListener("change", changed);
    return () => query.removeEventListener("change", changed);
  }, []);
  useEffect(() => {
    if (sides !== 20 || failed) return;
    let cancelled = false;
    import("./d20-scene")
      .then(({ createD20 }) => {
        if (cancelled || !host.current) return;
        scene.current = createD20(host.current, () => setFailed(true));
        scene.current.update(latest.current);
        setReady(true);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
      scene.current?.dispose();
      scene.current = undefined;
      setReady(false);
    };
  }, [sides, failed]);
  useEffect(() => {
    scene.current?.update(presentation);
  }, [rolling, roll?.value, attempting, reduced]);
  return (
    <div
      className="dice-face"
      role="status"
      aria-live="polite"
      aria-atomic="true"
      data-dice-state={roll ? "result" : rolling ? "rolling" : "ready"}
    >
      <span className="dice-result-label">
        {roll ? "You rolled" : rolling ? "Rolling…" : "Ready to roll"}
      </span>
      <div className="dice-stage">
        <div
          className="dice-model"
          ref={host}
          hidden={!ready || failed}
          aria-hidden="true"
        />
        <strong
          className={ready && !failed ? "dice-accessible-value" : undefined}
        >
          {roll ? roll.value : rolling ? "…" : `◇ d${sides ?? "?"}`}
        </strong>
      </div>
      <span className="dice-result-detail">
        {roll
          ? `${roll.value} · ${roll.passed ? "Pass" : "Fail"} · Target ${roll.target}`
          : rolling
            ? "Waiting for your result"
            : "Roll to reveal your result"}
      </span>
    </div>
  );
}
