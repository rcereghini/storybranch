import { describeCondition } from "../../../packages/domain/preview";
import { useEffect, useState } from "react";
import {
  statId,
  type Condition,
  type Story,
} from "../../../packages/contracts/index";
import {
  conditionKeys,
  isEditableCondition,
  validateCondition,
  type ConditionKey,
} from "./condition-model";

function Clause({
  value,
  onChange,
  keys,
  path,
  depth,
  storyId,
}: {
  value: Condition;
  onChange: (c: Condition) => void;
  keys: ConditionKey[];
  path: string;
  depth: number;
  storyId: string;
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
            else if (kind === "stat")
              onChange({ kind, stat: "agility", op: "gte", value: 5 });
            else if (kind === "item")
              onChange({
                kind,
                itemId: `${storyId}:item`,
                op: "gte",
                quantity: 1,
              });
            else if (kind === "not") onChange({ kind, condition: newKey() });
            else if (kind === "all" || kind === "any")
              onChange({
                kind,
                conditions: children.length ? children : [newKey()],
              });
          }}
        >
          <option value="key">Key check</option>
          <option value="stat">Stat check</option>
          <option value="item">Item quantity</option>
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
      {(value.kind === "stat" || value.kind === "item") && (
        <>
          {value.kind === "stat" ? (
            <label>
              Stat
              <select
                aria-label={`Condition ${path} stat`}
                value={value.stat}
                onChange={(e) =>
                  onChange({ ...value, stat: statId.parse(e.target.value) })
                }
              >
                {statId.options.map((stat) => (
                  <option key={stat} value={stat}>
                    {stat}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <label>
              Story item ID
              <input
                aria-label={`Condition ${path} item`}
                value={value.itemId}
                maxLength={100}
                onChange={(e) => onChange({ ...value, itemId: e.target.value })}
              />
              <small>
                Use this Story's namespace: {storyId}:item. Checks do not
                consume items.
              </small>
            </label>
          )}
          <label>
            Comparison
            <select
              aria-label={`Condition ${path} comparison`}
              value={value.op}
              onChange={(e) =>
                onChange({
                  ...value,
                  op: e.target.value as "gte" | "lte" | "eq",
                })
              }
            >
              <option value="gte">At least</option>
              <option value="lte">At most</option>
              <option value="eq">Exactly</option>
            </select>
          </label>
          <label>
            {value.kind === "stat" ? "Value" : "Quantity"}
            <input
              type="number"
              min={0}
              max={999}
              step={1}
              aria-label={`Condition ${path} threshold`}
              value={
                Number.isNaN(
                  value.kind === "stat" ? value.value : value.quantity,
                )
                  ? ""
                  : value.kind === "stat"
                    ? value.value
                    : value.quantity
              }
              onChange={(e) =>
                onChange(
                  value.kind === "stat"
                    ? { ...value, value: e.target.valueAsNumber }
                    : { ...value, quantity: e.target.valueAsNumber },
                )
              }
            />
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
          storyId={storyId}
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
                storyId={storyId}
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
export function ConditionEditor({
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
    validateCondition(draft, story);
  } catch (e) {
    error =
      e instanceof Error && e.name !== "ZodError"
        ? e.message
        : "Use valid Story IDs and whole numbers from 0 to 999, within five nesting levels and ten conditions per group.";
  }
  return (
    <details className="key-condition-editor">
      <summary>Build option {option} conditions</summary>
      <section aria-label={`Option ${option} condition builder`}>
        {!isEditableCondition(value) ? (
          <p>
            This condition includes roll checks. Edit its advanced JSON; the
            visual editor preserves it unchanged.
          </p>
        ) : (
          <>
            <p>
              All requires every check; Any requires one; Not reverses its
              check. Apply saves these edits to the draft.
            </p>
            <p aria-label="Condition summary">
              {draft
                ? describeCondition(draft)
                : "Always available (subject to item costs)."}
            </p>
            {draft ? (
              <Clause
                value={draft}
                onChange={setDraft}
                keys={keys}
                path="1"
                depth={0}
                storyId={story.id}
              />
            ) : (
              <p>No availability condition.</p>
            )}
            {!draft && (
              <button
                className="btn btn-secondary"
                onClick={() =>
                  setDraft({
                    kind: "stat",
                    stat: "agility",
                    op: "gte",
                    value: 5,
                  })
                }
              >
                Add condition
              </button>
            )}
            {!keys.length && (
              <p>
                For key checks, configure starting keys, local key rewards or
                declared Story/imported/account keys first.
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
                onApply(validateCondition(draft, story));
                setMessage("Condition applied to the draft.");
              }}
            >
              Apply condition
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
