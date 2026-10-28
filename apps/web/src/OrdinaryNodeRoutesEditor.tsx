import type { Choice, StoryNode } from "../../../packages/contracts/index";
import type { StagedBattleStory } from "../../../packages/contracts/battle-graph";
import { itemRoutes } from "./branch-items-model";
import { BranchInputsEditor } from "./StoryInputsEditor";

export function OrdinaryNodeRoutesEditor({
  node,
  story,
  onChange,
}: {
  node: StoryNode;
  story: StagedBattleStory;
  onChange: (node: StoryNode) => void;
}) {
  const update = (index: number, choice: Choice) =>
    onChange({
      ...node,
      choices: node.choices.map((existing, i) =>
        i === index ? choice : existing,
      ),
    });
  return (
    <section aria-label="Ordinary StoryNode routes">
      {node.choices.map((choice, index) => {
        const option = index + 1;
        return (
          <fieldset key={choice.id}>
            <legend>
              Option {option} · {choice.outcome.kind}
            </legend>
            <label>
              Option {option} label
              <input
                aria-label={`Option ${option} label`}
                value={choice.label}
                onChange={(event) =>
                  update(index, { ...choice, label: event.target.value })
                }
              />
            </label>
            {choice.outcome.kind === "dice" &&
              (["sides", "target"] as const).map((field) => (
                <label key={field}>
                  {field === "sides" ? "Dice sides" : "Pass threshold"}
                  <input
                    aria-label={`Option ${option} Dice ${field}`}
                    type="number"
                min={field === "sides" ? 2 : 1}
                    max={100}
                    step={1}
                    value={
                      choice.outcome.kind === "dice" &&
                      !Number.isNaN(choice.outcome[field])
                        ? choice.outcome[field]
                        : ""
                    }
                    onChange={(event) => {
                      if (choice.outcome.kind === "dice")
                        update(index, {
                          ...choice,
                          outcome: {
                            ...choice.outcome,
                            [field]: event.target.valueAsNumber,
                          },
                        });
                    }}
                  />
                </label>
              ))}
            {itemRoutes(choice).map(({ label, route }, routeIndex) => (
              <label key={routeIndex}>
                {label} destination
                <select
                  aria-label={`Option ${option} ${label} destination`}
                  value={route.targetStoryNodeId}
                  onChange={(event) => {
                    const copy = structuredClone(choice);
                    itemRoutes(copy)[routeIndex].route.targetStoryNodeId =
                      event.target.value;
                    update(index, copy);
                  }}
                >
                  <option value="unfinished">Unfinished</option>
                  {route.targetStoryNodeId !== "unfinished" &&
                    !story.storyNodes[route.targetStoryNodeId] && (
                      <option value={route.targetStoryNodeId}>
                        Missing: {route.targetStoryNodeId}
                      </option>
                    )}
                  {Object.values(story.storyNodes).map((target) => (
                    <option key={target.id} value={target.id}>
                      {target.title}
                    </option>
                  ))}
                </select>
              </label>
            ))}
            <BranchInputsEditor
              story={story}
              choice={choice}
              option={option}
              onApply={(next) => update(index, next)}
              onEdit={(next) => update(index, next)}
            />
          </fieldset>
        );
      })}
      {!node.choices.length && <p>No outgoing options on this StoryNode.</p>}
    </section>
  );
}
