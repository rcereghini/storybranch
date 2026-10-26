import { useEffect, useState } from "react";
import type { Condition, Story } from "../../../packages/contracts/index";
import {
  conditionKeys,
  isKeyCondition,
  validateKeyCondition,
  type ConditionKey,
} from "./key-condition-model";

function Clause({
  value,
  onChange,
  keys,
  path,
  depth,
}: {
  value: Condition;
  onChange: (c: Condition) => void;
  keys: ConditionKey[];
  path: string;
  depth: number;
}) {
  const newKey = (): Condition => ({
    kind: "key",
    keyId: keys[0]?.keyId ?? "",
    scope: keys[0]?.scope ?? "run",
    present: true,
  });
  const children =
    value.kind === "all" || value.kind === "any" ? value.conditions : [];
  return (
    <fieldset className="key-condition-clause">
      <legend>Condition {path}</legend>
      <label>
        Match
        <select
          aria-label={`Condition ${path} match`}
          value={value.kind}
          onChange={(e) => {
            const kind = e.target.value;
            if (kind === "key") onChange(newKey());
            else if (kind === "not") onChange({ kind, condition: newKey() });
            else if (kind === "all" || kind === "any")
              onChange({
                kind,
                conditions: children.length ? children : [newKey()],
              });
          }}
        >
          <option value="key">Key check</option>
          {depth < 5 && (
            <>
              <option value="all">All conditions</option>
              <option value="any">Any condition</option>
              <option value="not">Not</option>
            </>
          )}
        </select>
      </label>
      {value.kind === "key" && (
        <>
          <label>
            Key
            <select
              aria-label={`Condition ${path} key`}
              value={`${value.scope ?? "run"}|${value.keyId}`}
              onChange={(e) => {
                const key = keys.find((k) => k.value === e.target.value);
                if (key)
                  onChange({ ...value, keyId: key.keyId, scope: key.scope });
              }}
            >
              {!keys.some(
                (k) => k.value === `${value.scope ?? "run"}|${value.keyId}`,
              ) && (
                <option value={`${value.scope ?? "run"}|${value.keyId}`}>
                  {value.keyId || "Choose a key"}
                </option>
              )}
              {keys.map((k) => (
                <option key={k.value} value={k.value}>
                  {k.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Required state
            <select
              aria-label={`Condition ${path} state`}
              value={value.present ? "present" : "absent"}
              onChange={(e) =>
                onChange({ ...value, present: e.target.value === "present" })
              }
            >
              <option value="present">Present</option>
              <option value="absent">Absent</option>
            </select>
          </label>
        </>
      )}
      {value.kind === "not" && (
        <Clause
          value={value.condition}
          onChange={(condition) => onChange({ ...value, condition })}
          keys={keys}
          path={`${path}.1`}
          depth={depth + 1}
        />
      )}
      {(value.kind === "all" || value.kind === "any") && (
        <>
          {value.conditions.map((child, i) => (
            <div key={i}>
              <Clause
                value={child}
                onChange={(condition) =>
                  onChange({
                    ...value,
                    conditions: value.conditions.map((c, j) =>
                      i === j ? condition : c,
                    ),
                  })
                }
                keys={keys}
                path={`${path}.${i + 1}`}
                depth={depth + 1}
              />
              <button
                className="btn btn-secondary"
                disabled={value.conditions.length <= 1}
                onClick={() =>
                  onChange({
                    ...value,
                    conditions: value.conditions.filter((_, j) => i !== j),
                  })
                }
              >
                Remove condition {path}.{i + 1}
              </button>
            </div>
          ))}
          <button
            className="btn btn-secondary"
            disabled={value.conditions.length >= 10}
            onClick={() =>
              onChange({
                ...value,
                conditions: [...value.conditions, newKey()],
              })
            }
          >
            Add condition to {path}
          </button>
        </>
      )}
    </fieldset>
  );
}
export function KeyConditionEditor({
  story,
  value,
  onApply,
  option,
}: {
  story: Story;
  value?: Condition;
  onApply: (c: Condition | undefined) => void;
  option: number;
}) {
  const serialized = JSON.stringify(value);
  const [draft, setDraft] = useState(value);
  const [message, setMessage] = useState("");
  useEffect(() => {
    setDraft(value);
    setMessage("");
  }, [serialized]);
  const keys = conditionKeys(story);
  let error = "";
  try {
    validateKeyCondition(draft, story);
  } catch (e) {
    error =
      e instanceof Error && e.name !== "ZodError"
        ? e.message
        : "Choose valid keys within five nesting levels and ten conditions per group.";
  }
  return (
    <details className="key-condition-editor">
      <summary>Build option {option} key conditions</summary>
      <section aria-label={`Option ${option} key condition builder`}>
        {!isKeyCondition(value) ? (
          <p>
            This condition includes stat, item or roll checks. Edit its advanced
            JSON; the visual key editor preserves it unchanged.
          </p>
        ) : (
          <>
            <p>
              All requires every check; Any requires one; Not reverses its
              check. Apply saves these edits to the draft.
            </p>
            {draft ? (
              <Clause
                value={draft}
                onChange={setDraft}
                keys={keys}
                path="1"
                depth={0}
              />
            ) : (
              <p>No availability condition.</p>
            )}
            {!draft && (
              <button
                className="btn btn-secondary"
                disabled={!keys.length}
                onClick={() =>
                  setDraft({
                    kind: "key",
                    keyId: keys[0].keyId,
                    scope: keys[0].scope,
                    present: true,
                  })
                }
              >
                Add key condition
              </button>
            )}
            {!keys.length && (
              <p>
                Configure starting keys, local key rewards or declared
                Story/imported/account keys first.
              </p>
            )}
            {draft && (
              <button
                className="btn btn-secondary"
                onClick={() => setDraft(undefined)}
              >
                Clear condition
              </button>
            )}
            <button
              className="btn btn-secondary"
              onClick={() => {
                setDraft(value);
                setMessage("Edits reset.");
              }}
            >
              Reset condition edits
            </button>
            <button
              className="btn btn-primary"
              disabled={!!error}
              onClick={() => {
                onApply(validateKeyCondition(draft, story));
                setMessage("Condition applied to the draft.");
              }}
            >
              Apply key condition
            </button>
            <p role="status" className="key-history-status">
              {error || message}
            </p>
          </>
        )}
      </section>
    </details>
  );
}
