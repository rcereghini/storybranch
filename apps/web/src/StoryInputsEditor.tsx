import { useEffect, useState } from "react";
import {
  nodeInputsSchema,
  type NodeInputs,
  type InputValue,
} from "../../../packages/contracts/branch-data";
import {
  choiceSchema,
  type StoryNode,
  type Choice,
  type Save,
} from "../../../packages/contracts/index";
import {
  choiceInputIssue,
  currentInput,
  inputBindingIssue,
} from "../../../packages/domain/branch-data";
import { itemRoutes } from "./branch-items-model";

type ScalarType = NodeInputs["fields"][number]["type"];
export const emptyInputValue = (type: ScalarType): InputValue =>
  type === "integer" ? 0 : type === "boolean" ? false : "";
export function InputValueEditor({
  type,
  value,
  onChange,
  label,
}: {
  type: ScalarType;
  value: InputValue;
  onChange: (value: InputValue) => void;
  label: string;
}) {
  return (
    <label>
      {label}
      {type === "boolean" ? (
        <select
          aria-label={label}
          value={String(value)}
          onChange={(e) => onChange(e.target.value === "true")}
        >
          <option value="false">False</option>
          <option value="true">True</option>
        </select>
      ) : type === "integer" ? (
        <input
          aria-label={label}
          type="number"
          min={-999}
          max={999}
          step={1}
          value={typeof value === "number" && !Number.isNaN(value) ? value : ""}
          onChange={(e) => onChange(e.target.valueAsNumber)}
        />
      ) : (
        <input
          aria-label={label}
          value={String(value)}
          maxLength={200}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </label>
  );
}
const errorText = (error: unknown) =>
  error instanceof Error && error.name !== "ZodError"
    ? error.message
    : "Use unique valid names and matching values: integers -999–999, text up to 200 characters, or true/false.";

export function StoryInputsEditor({
  node,
  onApply,
}: {
  node: Pick<StoryNode, "id" | "inputs">;
  onApply: (inputs: NodeInputs | undefined) => void;
}) {
  const initial = () =>
    structuredClone(node.inputs ?? { version: 1 as const, fields: [] });
  const [draft, setDraft] = useState(initial);
  const [message, setMessage] = useState("");
  useEffect(() => {
    setDraft(initial());
    setMessage("");
  }, [node.id, JSON.stringify(node.inputs)]);
  let error = "";
  try {
    nodeInputsSchema.parse(draft);
  } catch (e) {
    error = errorText(e);
  }
  const edit = (i: number, field: NodeInputs["fields"][number]) =>
    setDraft({
      ...draft,
      fields: draft.fields.map((f, j) => (i === j ? field : f)),
    });
  return (
    <details className="key-condition-editor">
      <summary>StoryNode inputs</summary>
      <section aria-label="StoryNode input editor">
        <p>
          Declare values supplied by incoming connections. Renaming or removing
          an input leaves existing bindings and conditions for you to repair.
        </p>
        {draft.fields.map((f, i) => (
          <fieldset key={i} className="key-condition-clause">
            <legend>Input {i + 1}</legend>
            <label>
              Name
              <input
                aria-label={`Input ${i + 1} name`}
                maxLength={40}
                value={f.name}
                onChange={(e) => edit(i, { ...f, name: e.target.value })}
              />
            </label>
            <label>
              Type
              <select
                aria-label={`Input ${i + 1} type`}
                value={f.type}
                onChange={(e) => {
                  const type = e.target.value as ScalarType;
                  edit(i, {
                    ...f,
                    type,
                    ...(f.default !== undefined
                      ? { default: emptyInputValue(type) }
                      : {}),
                  });
                }}
              >
                <option value="integer">Integer</option>
                <option value="boolean">True / false</option>
                <option value="string">Text</option>
              </select>
            </label>
            <label>
              <input
                type="checkbox"
                checked={f.required}
                onChange={(e) => edit(i, { ...f, required: e.target.checked })}
              />
              Required input {i + 1}
            </label>
            <label>
              <input
                type="checkbox"
                checked={f.default !== undefined}
                onChange={(e) => {
                  const field = { ...f };
                  if (e.target.checked) field.default = emptyInputValue(f.type);
                  else delete field.default;
                  edit(i, field);
                }}
              />
              Default for input {i + 1}
            </label>
            {f.default !== undefined && (
              <InputValueEditor
                type={f.type}
                value={f.default}
                label={`Input ${i + 1} default value`}
                onChange={(value) => edit(i, { ...f, default: value })}
              />
            )}
            <button
              className="btn btn-secondary"
              onClick={() =>
                setDraft({
                  ...draft,
                  fields: draft.fields.filter((_, j) => i !== j),
                })
              }
            >
              Remove input {i + 1}
            </button>
          </fieldset>
        ))}
        <button
          className="btn btn-secondary"
          disabled={draft.fields.length >= 16}
          onClick={() => {
            let n = 1;
            while (draft.fields.some((f) => f.name === `input${n}`)) n++;
            setDraft({
              ...draft,
              fields: [
                ...draft.fields,
                { name: `input${n}`, type: "integer", required: false },
              ],
            });
          }}
        >
          Add input
        </button>
        <button
          className="btn btn-secondary"
          onClick={() => {
            setDraft(initial());
            setMessage("Input edits reset.");
          }}
        >
          Reset inputs
        </button>
        <button
          className="btn btn-primary"
          disabled={!!error}
          onClick={() => {
            const parsed = nodeInputsSchema.parse(draft);
            onApply(parsed.fields.length ? parsed : undefined);
            setMessage(
              "Inputs applied. Check incoming connections and conditions.",
            );
          }}
        >
          Apply inputs
        </button>
        <p className="key-history-status" role="status">
          {error || message}
        </p>
      </section>
    </details>
  );
}

export function BranchInputsEditor({
  story,
  choice,
  option,
  onApply,
  onEdit,
}: {
  story: {
    storyNodes: Record<string, Pick<StoryNode, "id" | "title" | "inputs">>;
  };
  choice: Choice;
  option: number;
  onApply: (choice: Choice) => void;
  // Controlled editing uses the enclosing node's Apply/Reset lifecycle.
  onEdit?: (choice: Choice) => void;
}) {
  const [localDraft, setDraft] = useState(() => structuredClone(choice));
  const draft = onEdit ? choice : localDraft;
  const [message, setMessage] = useState("");
  useEffect(() => {
    setDraft(structuredClone(choice));
    setMessage("");
  }, [JSON.stringify(choice)]);
  let error = "";
  try {
    error = choiceInputIssue(choiceSchema.parse(draft), story.storyNodes) ?? "";
  } catch (e) {
    error = errorText(e);
  }
  const edit = (change: (copy: Choice) => void) => {
    const copy = structuredClone(draft);
    change(copy);
    if (onEdit) onEdit(copy);
    else setDraft(copy);
  };
  return (
    <details className="key-condition-editor">
      <summary>Bind option {option} inputs</summary>
      <section aria-label={`Option ${option} input bindings`}>
        <p>
          Each route supplies its destination's inputs. Unmapped inputs use
          their default, or remain absent when optional.
        </p>
        {itemRoutes(draft).map(({ label, route }, routeIndex) => {
          const destination = story.storyNodes[route.targetStoryNodeId];
          const fields = destination?.inputs?.fields ?? [];
          const bindings = route.inputBindings?.bindings ?? [];
          const setBindings = (next: typeof bindings) =>
            edit((copy) => {
              const target = itemRoutes(copy)[routeIndex].route;
              if (next.length)
                target.inputBindings = { version: 1, bindings: next };
              else delete target.inputBindings;
            });
          const issue = destination
            ? inputBindingIssue(
                destination,
                route.inputBindings,
                draft.outcome.kind === "dice",
              )
            : "Connect a destination first.";
          const available = fields.filter(
            (f) => !bindings.some((b) => b.input === f.name),
          );
          return (
            <fieldset className="key-condition-clause" key={routeIndex}>
              <legend>
                {label} → {destination?.title ?? route.targetStoryNodeId}
              </legend>
              {fields.map((f) => (
                <p key={f.name}>
                  {f.name} · {f.type} · {f.required ? "required" : "optional"}
                  {f.default !== undefined
                    ? ` · default ${JSON.stringify(f.default)}`
                    : ""}
                </p>
              ))}
              {bindings.map((b, i) => {
                const field = fields.find((f) => f.name === b.input);
                const type =
                  field?.type ??
                  (b.source.kind === "constant"
                    ? typeof b.source.value === "number"
                      ? "integer"
                      : typeof b.source.value === "boolean"
                        ? "boolean"
                        : "string"
                    : b.source.field === "passed"
                      ? "boolean"
                      : "integer");
                const update = (next: typeof b) =>
                  setBindings(
                    bindings.map((value, j) => (i === j ? next : value)),
                  );
                const source =
                  b.source.kind === "constant" ? "constant" : b.source.field;
                const diceFields =
                  draft.outcome.kind === "dice"
                    ? type === "integer"
                      ? ["value", "sides", "target"]
                      : type === "boolean"
                        ? ["passed"]
                        : []
                    : [];
                return (
                  <div key={i}>
                    <label>
                      Destination input
                      <select
                        aria-label={`${label} binding ${i + 1} input`}
                        value={b.input}
                        onChange={(e) =>
                          update({ ...b, input: e.target.value })
                        }
                      >
                        {!field && (
                          <option value={b.input}>
                            {b.input} (unavailable)
                          </option>
                        )}
                        {fields.map((f) => (
                          <option key={f.name} value={f.name}>
                            {f.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Source
                      <select
                        aria-label={`${label} binding ${i + 1} source`}
                        value={source}
                        onChange={(e) =>
                          update({
                            ...b,
                            source:
                              e.target.value === "constant"
                                ? {
                                    kind: "constant",
                                    value: emptyInputValue(type),
                                  }
                                : {
                                    kind: "dice",
                                    field: e.target.value as
                                      | "value"
                                      | "sides"
                                      | "target"
                                      | "passed",
                                  },
                          })
                        }
                      >
                        <option value="constant">Constant</option>
                        {diceFields.map((name) => (
                          <option key={name} value={name}>
                            Dice {name}
                          </option>
                        ))}
                        {source !== "constant" &&
                          !diceFields.includes(source) && (
                            <option value={source}>
                              {source} (incompatible)
                            </option>
                          )}
                      </select>
                    </label>
                    {b.source.kind === "constant" && (
                      <InputValueEditor
                        type={type}
                        value={b.source.value}
                        label={`${label} binding ${i + 1} value`}
                        onChange={(value) =>
                          update({ ...b, source: { kind: "constant", value } })
                        }
                      />
                    )}
                    <button
                      className="btn btn-secondary"
                      onClick={() =>
                        setBindings(bindings.filter((_, j) => i !== j))
                      }
                    >
                      Remove {label} binding {i + 1}
                    </button>
                  </div>
                );
              })}
              <button
                className="btn btn-secondary"
                disabled={!available.length || bindings.length >= 16}
                onClick={() => {
                  const f = available[0];
                  setBindings([
                    ...bindings,
                    {
                      input: f.name,
                      source: {
                        kind: "constant",
                        value: emptyInputValue(f.type),
                      },
                    },
                  ]);
                }}
              >
                Add {label} binding
              </button>
              <p className="key-history-status" role="status">
                {issue ?? "Inputs compatible."}
              </p>
            </fieldset>
          );
        })}
        {!onEdit && (
          <>
            <button
              className="btn btn-secondary"
              onClick={() => {
                setDraft(structuredClone(choice));
                setMessage("Binding edits reset.");
              }}
            >
              Reset bindings
            </button>
            <button
              className="btn btn-primary"
              disabled={!!error}
              onClick={() => {
                onApply(choiceSchema.parse(draft));
                setMessage("Bindings applied.");
              }}
            >
              Apply bindings
            </button>
          </>
        )}
        <p className="key-history-status" role="status">
          {error || message}
        </p>
      </section>
    </details>
  );
}

export function PreviewInputs({
  story,
  save,
}: {
  story: { storyNodes: Record<string, Pick<StoryNode, "inputs">> };
  save: Save;
}) {
  const fields = story.storyNodes[save.storyNodeId]?.inputs?.fields ?? [];
  return (
    <details className="key-condition-editor">
      <summary>Resolved StoryNode inputs</summary>
      <section aria-label="Resolved input values">
        <p>
          Private simulation · entry revision{" "}
          {save.nodeInputs?.revision ?? "none"}
        </p>
        {fields.length ? (
          <ul>
            {fields.map((f) => (
              <li key={f.name}>
                {f.name}:{" "}
                {currentInput(save, f.name) === undefined
                  ? "absent"
                  : JSON.stringify(currentInput(save, f.name))}
              </li>
            ))}
          </ul>
        ) : (
          <p>No inputs declared for this StoryNode.</p>
        )}
      </section>
    </details>
  );
}
