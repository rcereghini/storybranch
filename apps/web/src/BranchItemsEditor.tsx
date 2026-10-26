import { StoryItemPicker } from "./StoryItemPicker";
import { useEffect, useState } from "react";
import type { Choice, Story } from "../../../packages/contracts/index";
import { previewItemIds } from "../../../packages/domain/preview";
import { itemRoutes, validateBranchItems } from "./branch-items-model";

function ItemField({
  value,
  onChange,
  story,
  label,
}: {
  value: string;
  onChange: (id: string) => void;
  story: Story;
  label: string;
}) {
  return (
    <>
      <StoryItemPicker
        story={story}
        value={value}
        onChange={onChange}
        label={`${label} existing item`}
      />
      <label>
        Item ID
        <input
          aria-label={`${label} item ID`}
          value={value}
          maxLength={100}
          onChange={(e) => onChange(e.target.value)}
        />
      </label>
    </>
  );
}

export function BranchItemsEditor({
  story,
  choice,
  option,
  onApply,
}: {
  story: Story;
  choice: Choice;
  option: number;
  onApply: (choice: Choice) => void;
}) {
  const [draft, setDraft] = useState(() => structuredClone(choice));
  const [message, setMessage] = useState("");
  const authored = JSON.stringify(choice);
  useEffect(() => {
    setDraft(structuredClone(choice));
    setMessage("");
  }, [authored]);
  const ids = previewItemIds(story);
  const newItem = ids[0] ?? `${story.id}:item`;
  let error = "";
  try {
    validateBranchItems(draft, story.id);
  } catch (e) {
    error =
      e instanceof Error && e.name !== "ZodError"
        ? e.message
        : "Use valid item IDs, whole-number costs 0–999 and changes -99–99. Each list allows at most 20 entries.";
  }
  const edit = (change: (next: Choice) => void) => {
    const next = structuredClone(draft);
    change(next);
    setDraft(next);
    setMessage("");
  };
  return (
    <details className="branch-items-editor">
      <summary>Edit option {option} items</summary>
      <section aria-label={`Option ${option} items`}>
        <p>
          Costs are spent before the chosen route's rewards. Use IDs such as{" "}
          {story.id}:relic. Keep a cost-free, inventory-safe exit. Repeating a
          route can repeat its rewards.
        </p>
        <fieldset>
          <legend>Item costs</legend>
          {draft.costs.map((cost, i) => (
            <div key={i}>
              <ItemField
                value={cost.itemId}
                story={story}
                label={`Cost ${i + 1}`}
                onChange={(id) =>
                  edit((next) => {
                    next.costs[i].itemId = id;
                  })
                }
              />
              <label>
                Quantity
                <input
                  aria-label={`Cost ${i + 1} quantity`}
                  type="number"
                  min={0}
                  max={999}
                  step={1}
                  value={Number.isNaN(cost.quantity) ? "" : cost.quantity}
                  onChange={(e) =>
                    edit((next) => {
                      next.costs[i].quantity = e.target.valueAsNumber;
                    })
                  }
                />
              </label>
              <button
                className="btn btn-secondary"
                onClick={() =>
                  edit((next) => {
                    next.costs.splice(i, 1);
                  })
                }
              >
                Remove cost {i + 1}
              </button>
            </div>
          ))}
          <button
            className="btn btn-secondary"
            disabled={draft.costs.length >= 20}
            onClick={() =>
              edit((next) => {
                next.costs.push({ itemId: newItem, quantity: 1 });
              })
            }
          >
            Add item cost
          </button>
        </fieldset>
        {itemRoutes(draft).map(({ label, route }, r) => (
          <fieldset key={r}>
            <legend>{label} item changes</legend>
            {route.effects.map((effect, i) =>
              effect.kind !== "item" ? null : (
                <div key={effect.id}>
                  <ItemField
                    value={effect.itemId}
                    story={story}
                    label={`${label} effect ${i + 1}`}
                    onChange={(id) =>
                      edit((next) => {
                        const e = itemRoutes(next)[r].route.effects[i];
                        if (e.kind === "item") e.itemId = id;
                      })
                    }
                  />
                  <label>
                    Grant (+) or remove (-)
                    <input
                      aria-label={`${label} effect ${i + 1} change`}
                      type="number"
                      min={-99}
                      max={99}
                      step={1}
                      value={Number.isNaN(effect.delta) ? "" : effect.delta}
                      onChange={(event) =>
                        edit((next) => {
                          const e = itemRoutes(next)[r].route.effects[i];
                          if (e.kind === "item")
                            e.delta = event.target.valueAsNumber;
                        })
                      }
                    />
                  </label>
                  <button
                    className="btn btn-secondary"
                    onClick={() =>
                      edit((next) => {
                        itemRoutes(next)[r].route.effects.splice(i, 1);
                      })
                    }
                  >
                    Remove {label} effect {i + 1}
                  </button>
                </div>
              ),
            )}
            <p>
              {route.effects.filter((e) => e.kind !== "item").length} non-item
              effects preserved.
            </p>
            <button
              className="btn btn-secondary"
              disabled={route.effects.length >= 20}
              onClick={() =>
                edit((next) => {
                  itemRoutes(next)[r].route.effects.push({
                    id: crypto.randomUUID(),
                    kind: "item",
                    itemId: newItem,
                    delta: 1,
                  });
                })
              }
            >
              Add {label} reward
            </button>
          </fieldset>
        ))}
        <button
          className="btn btn-primary"
          disabled={!!error}
          onClick={() => {
            onApply(validateBranchItems(draft, story.id));
            setMessage("Item edits applied to the draft.");
          }}
        >
          Apply item edits
        </button>
        <button
          className="btn btn-secondary"
          onClick={() => {
            setDraft(structuredClone(choice));
            setMessage("Item edits reset.");
          }}
        >
          Reset item edits
        </button>
        <p role="status" className="key-history-status">
          {error || message}
        </p>
      </section>
    </details>
  );
}
