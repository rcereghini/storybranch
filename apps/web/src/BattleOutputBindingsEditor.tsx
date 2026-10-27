import type { BattleOutputs } from "../../../packages/contracts/battle-routing";
import {
  inputType,
  type NodeInputs,
} from "../../../packages/contracts/branch-data";
import { InputValueEditor, emptyInputValue } from "./StoryInputsEditor";

type Bindings = NonNullable<BattleOutputs["win"]["inputBindings"]>;
type Source = Bindings["bindings"][number]["source"];
const resultFields = ["won", "turns", "playerHealth", "enemyHealth"] as const;
const sourceKey = (source: Source) =>
  source.kind === "battle"
    ? `battle:${source.field}`
    : `constant:${inputType(source.value)}`;

// Controlled by NodeEditor's Apply/Reset; never rewrites stale mappings on render.
export function BattleOutputBindingsEditor({
  outcome,
  inputs,
  value,
  onChange,
}: {
  outcome: keyof BattleOutputs;
  inputs: NodeInputs | undefined;
  value: Bindings | undefined;
  onChange: (value: Bindings | undefined) => void;
}) {
  const bindings = value?.bindings ?? [];
  const fields = inputs?.fields ?? [];
  const names = [
    ...fields.map((f) => f.name),
    ...bindings
      .filter((b) => !fields.some((f) => f.name === b.input))
      .map((b) => b.input),
  ];
  const update = (input: string, source?: Source) => {
    const next = bindings.filter((b) => b.input !== input);
    if (source) next.push({ input, source });
    onChange(next.length ? { version: 1, bindings: next } : undefined);
  };
  return (
    <fieldset className="battle-output-bindings">
      <legend>{outcome} input bindings</legend>
      {!names.length && <p>This destination declares no inputs.</p>}
      {names.map((name) => {
        const field = fields.find((f) => f.name === name);
        const binding = bindings.find((b) => b.input === name);
        const key = binding ? sourceKey(binding.source) : "";
        const options = field
          ? [
              {
                value: `constant:${field.type}`,
                label: `Constant ${field.type}`,
              },
              ...resultFields
                .filter(
                  (f) => (f === "won" ? "boolean" : "integer") === field.type,
                )
                .map((f) => ({ value: `battle:${f}`, label: `Battle ${f}` })),
            ]
          : [];
        return (
          <div key={name}>
            <p>
              {name}:{" "}
              {field
                ? `${field.type}${field.required ? " · required" : " · optional"}${field.default !== undefined ? ` · default ${JSON.stringify(field.default)}` : ""}`
                : "Unknown destination input — remove or reconnect to repair."}
            </p>
            <label>
              {outcome} {name} source
              <select
                aria-label={`${outcome} ${name} source`}
                value={key}
                disabled={!binding && bindings.length >= 16}
                onChange={(event) => {
                  const selected = event.target.value;
                  if (!selected) update(name);
                  else if (selected.startsWith("constant:") && field)
                    update(name, {
                      kind: "constant",
                      value: emptyInputValue(field.type),
                    });
                  else {
                    const result = resultFields.find(
                      (f) => selected === `battle:${f}`,
                    );
                    if (result) update(name, { kind: "battle", field: result });
                  }
                }}
              >
                <option value="">
                  {field?.default !== undefined
                    ? "Use default"
                    : field?.required
                      ? "Unmapped (required)"
                      : "No binding"}
                </option>
                {key && !options.some((o) => o.value === key) && (
                  <option value={key}>{key} (incompatible)</option>
                )}
                {options.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            {binding?.source.kind === "constant" && (
              <InputValueEditor
                label={`${outcome} ${name} value`}
                type={
                  inputType(binding.source.value) as
                    | "integer"
                    | "boolean"
                    | "string"
                }
                value={binding.source.value}
                onChange={(next) =>
                  update(name, { kind: "constant", value: next })
                }
              />
            )}
            {binding && (
              <button
                className="btn btn-secondary btn-small"
                onClick={() => update(name)}
              >
                Remove {outcome} {name} binding
              </button>
            )}
          </div>
        );
      })}
      {bindings.length >= 16 && (
        <p>Maximum 16 bindings. Remove a mapping before adding another.</p>
      )}
    </fieldset>
  );
}
